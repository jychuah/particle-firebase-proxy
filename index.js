var throng = require('throng');
var express = require('express');
var bodyParser = require('body-parser');
var firebase = require('firebase');
var Particle = require('particle-api-js');
var fs = require('fs');

if (!process.env.DATABASE) {
  console.log("No DATABASE environment variable specified!");
  process.exit();
}

if (!process.env.SERVICEACCOUNTFILE) {
  console.log("No SERVICEACCOUNTFILE environment variable specified!");
}

try {
  stats = fs.lstatSync(process.env.SERVICEACCOUNTFILE);
} catch(error) {
  console.log("Couldn't open " + process.env.SERVICEACCOUNTFILE);
  process.exit();
}

var WORKERS = process.env.WEB_CONCURRENCY || 1;

function start() {
  var app = express();
  var router = express.Router();

  app.use(bodyParser.json());

  var particle = new Particle();

  var firebaseApps = { };
  var particleStreams = { };

  console.log("Environment: ", process.env);


  // Verify that request has device_id and particle_token query fields
  function verifyRequest(req, res, next) {
    var properties = ['device_id', 'particle_token']; 
    for (var index in properties) {
      if (!req.query.hasOwnProperty(properties[index])) {
        res.status(400).send("Missing property: " + properties[index]);
        res.end();
        return;
      }
    }
    next();
  }

  function stripDotJson(path) {
    if (path.indexOf(".json") == path.length - 5) {
      return path.substring(0, path.length - 5);
    }
    return path;
  }

  // Verify that device_id and particle_token are valid by trying
  // to grab an event stream from the Particle.io cloud
  // Also, if the device ever goes offline, dispose of the event stream
  function verifyParticle(req, res, next) {
    var device_id = req.query.device_id;
    var devicesPr = particle.getEventStream({ deviceId : device_id, auth: req.query.particle_token });
    devicesPr.then(
      function(stream) {
       if (particleStreams[device_id]) {
            particleStreams[device_id].end();
        }
        particleStreams[device_id] = stream;
        stream.on('event', function(data) {
            // if device went offline, end streams, delete firebase app, delete references
            if (data.data === 'offline') {
              try {
                particleStreams[device_id].end();
                delete particleStreams[device_id];
                firebaseApps[device_id].delete().then(function() {
                  delete firebaseApps[device_id];
                  console.log("Released resources for device: ", device_id);
                });
              } catch (error) {
                console.error(error);
              }
            }
        });
        console.log("Established event stream for: ", device_id);
        next();
      },
      function (error) {
        if (particleStreams[device_id]) {
            particleStreams[device_id].end();
        }
        delete particleStreams[device_id];
        res.status(error.statusCode);
        res.send(error.body.error);
        res.end();
      }
    );
    return;
  }


  function cleanFirebaseApp(req, res, next) {
    var device_id = req.query.device_id;
    if (firebaseApps[device_id]) {
      firebaseApps[device_id].delete().then(function() {
        delete firebaseApps[device_id];
        next();
      });
    } else {
      next();
    }
  }

  function initFirebaseApp(req, res, next) { 
    var device_id = req.query.device_id;
    if (!firebaseApps.hasOwnProperty(device_id)) {
      firebaseApps[device_id] = firebase.initializeApp({
        databaseURL: process.env.DATABASE,
        serviceAccount: process.env.SERVICEACCOUNTFILE,
        databaseAuthVariableOverride: {
          uid : device_id
        }
      }, device_id);
    }
    next();
  }

  function checkFirebaseAccess(req, res, next) {
    var device_id = req.query.device_id;
    var fb = firebaseApps[device_id];
    var path = stripDotJson(req.path);
    var ref = fb.database().ref(path);
    var promise = ref.once('value', 
      function(snapshot) {
        res.snapshot = snapshot;
        next();
      },
      function(error) {
        res.status(403).send("Firebase permission denied: " + error.message);
        res.end();
      }
    );
  }

  function dispatchEvent(req, snapshot) {
    var payload = { };
    payload[snapshot.key] = snapshot.val();
    console.log("Publishing " + req.query.event_type + " for " + req.query.device_id);
    particle.publishEvent({ name : req.query.event_type, data : JSON.stringify(payload), auth : req.query.particle_token, isPrivate : true });
  }

  function registerFirebaseEvent(req, res, next) {
    var device_id = req.query.device_id;
    var fb = firebaseApps[device_id];
    var ref = fb.database().ref(stripDotJson(req.path));

    console.log("Registering " + req.query.event_type + " for " + req.query.device_id);
    console.log("query", req.query);

    ref.on(req.query.event_type, function(snapshot) {
      dispatchEvent(req, snapshot);
    }, function(error) {
      console.log(req.query.event_type + " event canceled for " + req.query.device_id, error);
      particle.publishEvent({ name : "cancel", data : error, auth : req.query.particle_token, isPrivate : true });
    });
    res.status(200).send("OK");
  }

  function checkEventType(req, res, next) {
    var types = ['value', 'child_added', 'child_changed', 'child_removed'];
    if (types.indexOf(req.query.event_type) > -1) {
      console.log('Event stream request for ' + req.query.device_id);
      next();
    } else {
        console.log('REST request for ' + req.query.device_id);
        next('route');
        
    }
  }

  function put(req, res, next) {
    res.ref.set(req.body, function(error) {
      if (error) {
        res.status(403).send("PUT Permission denied");
      } else {
        res.status(200).send("OK");
      }
    });
  }

  function patch(req, res, next) {
    res.ref.update(req.body, function(error) {
      if (error) {
        res.status(403).send("PATCH Permission denied");
      } else {
        res.ref.once('value', 
          function(snapshot) {
            res.status(200).send(snapshot.val());
          },
          function(error) {
            res.status(204).send("PATCH successful, but could not retrieve values.");
          }
        );
      }
    });
  }

  function del(req, res, next) {
    res.ref.remove().then(
      function() {
        res.status(200).send("OK");
      }
    ).catch(
      function(error) {
        console.log(error);
        res.status(403).send("DELETE Permission denied");
      }
    )
  }

  function post(req, res, next) {
    try {
      var newRef = res.ref.push(req.body);
      newRef.then(
        function() {
          res.status(200).send(newRef.key);
        }
      ).catch(
        function(error) {
          res.status(403).send("POST Permission denied");
        }
      )
    } catch(error) {
      res.status(400).send("POST data contains invalid key or value");
      res.end();
    }
  }

  function unsupported(req, res, next) {
    res.status(405).send("Method not allowed");
  }

  function startQuery(req, res, next) {
    res.ref = firebaseApps[req.query.device_id].database().ref(stripDotJson(req.path));
    next();
  }

  function stripQuotes(word) {
    if (word.charAt(0) == '"' && word.charAt(word.length - 1) == '"') {
      return word.substring(1, word.length - 1);
    } else {
      return word;
    }
  }

  function orderBy(req, res, next) {
    if (req.query.orderBy) {
      var order = stripQuotes(req.query.orderBy);
      try {
        switch (order) {
          case "$key" : res.ref = res.ref.orderByKey(); break;
          case "$value" : res.ref = res.ref.orderByValue(); break;
          case "$priority" : res.ref = res.ref.orderByPriority(); break;
          default : res.ref = res.ref.orderByChild(order); break;
        }
      } catch (error) {
        res.status(400).send("Invalid orderBy value");
      }
    }
    next();
  }

  function doGet(req, res, next) {
    if (!res.ref) {
      res.status(500).send("Something went really wrong.");
      res.end();
    } else {
      res.ref.once('value', 
        function(snapshot) {
          res.key = snapshot.key;
          res.val = snapshot.val();
          next();
        }, 
        function(error) {
          res.status(403).send("GET Permission denied");
          res.end();
        }
      );
    }
  }

  function shallow(req, res, next) {
    if (req.query.shallow == true || req.query.shallow == "true") {
      for (var key in res.val) {
        if (res.val[key] instanceof Object) {
          res.val[key] = true;
        }
      }
    }
    next();
  }

  function returnGet(req, res, next) {
    res.setHeader('Content-Type', 'application/json');
    res.status(200);
    res.send(res.val);
    res.end();
  }

  function otherQueries(req, res, next) {
    for (var key in req.query) {
      var param = req.query[key];
      if (!isNaN(parseFloat(param))) {
        param = parseFloat(param);
      } else {
        param = stripQuotes(param);
      }
      try {
        switch(key) {
          case "startAt" : res.ref = res.ref.startAt(param); break;
          case "endAt" : res.ref = res.ref.endAt(param); break;
          case "equalTo" : res.ref = res.ref.equalTo(param); break;
          case "limitToFirst" : res.ref = res.ref.limitToFirst(param); break;
          case "limitToLast" : res.ref = res.ref.limitToLast(param); break;
        }
      } catch (error) {
        console.log("otherQueries error", error);
        res.status(400).send("Invalid parameter for query " + key);
        res.end();
      }
    }
    next();
  }

  app.use(verifyRequest);
  app.use(verifyParticle);

  // Trap for event stream requests and handle those first. If it's not an event stream request, then
  // checkEventType will call a next('route') to bypass the rest of the middleware in this route
  app.get('*', checkEventType, cleanFirebaseApp, initFirebaseApp, checkFirebaseAccess, registerFirebaseEvent);
  
  app.get('*', initFirebaseApp, startQuery, orderBy, otherQueries, doGet, shallow, returnGet);
  app.put('*', initFirebaseApp, startQuery, put);
  app.patch('*', initFirebaseApp, startQuery, patch);
  app.delete('*',  initFirebaseApp, startQuery,del);
  app.post('*',  initFirebaseApp, startQuery, post);
  
  var server = app.listen(process.env.PORT || 9000, function() {
    console.log('Listening on port %d', server.address().port);
  });
}

throng({
  workers: WORKERS,
  grace: 4000,
  lifetime: Infinity,
  start: start
});
