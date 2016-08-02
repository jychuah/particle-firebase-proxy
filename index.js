
var express = require('express');
var bodyParser = require('body-parser');
var firebase = require("firebase");
var Particle = require('particle-api-js');

var app = express();

app.use(bodyParser.json());

var particle = new Particle();

var firebaseApps = { };
var particleStreams = { };

app.post('/', function(req, res, next) {
  try {
    var body = req.body;
    // Verify request has all fields
    var properties = ['device_id', 'access_token', 'event_type', 'firebase_path'];
    for (var index in properties) {
      if (!body.hasOwnProperty(properties[index])) {
        console.log("Malformed request", body);
        res.status(400).send("Missing property: " + properties[index]);
        return false;
      }
    }

    // Very event types
    var types = ['value', 'child_added', 'child_changed', 'child_removed', 'child_moved'];
    if (!(types.indexOf(body.event_type) > -1)) {
      res.status(400).send("Invalid Firebase event_type: " + body.event_type);
    }

    // check access token
    var devicesPr = particle.getEventStream({ deviceId : body.device_id, auth: body.access_token });
    devicesPr.then(
      function(stream) {
        particleStreams[body.device_id] = stream;
        stream.on('event', function(data) {
          // if device went offline, end streams, delete firebase app, delete references
          if (data.data === 'offline') {
            try {
              particleStreams[body.device_id].end();
              delete particleStreams[body.device_id];
              firebaseApps[body.device_id].delete().then(function() {
                delete firebaseApps[body.device_id];
                console.log("Released resources for device: ", body.device_id);
              });
            } catch (error) {
              console.error(error);
            }
          }
        });

        // successfully got device, attach Firebase listener
        if (!firebaseApps.hasOwnProperty(body.device_id)) {
          firebaseApps[body.device_id] = firebase.initializeApp({
            databaseURL: process.env.DATABASE,
            serviceAccount: process.env.SERVICEACCOUNTFILE,
            databaseAuthVariableOverride: {
              device_id : body.device_id
            }
          }, body.device_id);
        }
        var fb = firebaseApps[body.device_id];

        // The app only has access as defined in the Security Rules
        var db = fb.database();

        var ref = db.ref(body.firebase_path);

        var promise = ref.once('value',
          function(snapshot) {
            // console.log("Successfully retrieved value at path: ", snapshot.val());
            // no errors in retrieving value -- kludge in absence of ref.on success feedback
            // go ahead and attach event listener
            ref.on(body.event_type,
              function(snapshot) {
                // firebase event fired -- publish an event to the device with the data, could be null if bad path
                var payload = { };
                payload.key = snapshot.key;
                payload.firebase_path = body.firebase_path;
                payload.val = snapshot.val();
                payload.event_type = body.event_type;
                var privacy = body.isPrivate || false;
                var publishEventPr = particle.publishEvent({ name: "firebase", data: payload, auth: body.access_token, isPrivate : privacy });
              },
              function(error) {
                // cancel event -- publish something to the device
                var privacy = body.isPrivate || false;
                var publishEventPr = particle.publishEvent({ name: "firebase", data: error, auth: body.access_token, isPrivate : privacy });                
              }
            );

            // made it this far without exceptions, go ahead and send status 200
            res.status(200).send("OK");
          },
          function(error) {
            if (error.message.indexOf("permission_denied") > -1) {
              // give a 403
              // console.log("Permission Denied: ", error.message);
              res.status(403).send("Firebase permission denied: " + error.message);
              return;
            }
            res.status(503).send("Firebase error: " + error.message);
            // unhandled error?
          }
        );

      },
      function(error) {
        // Couldn't validate device_id and access_token
        // console.log(error);
        delete particleStreams[body.device_id];

        res.status(error.statusCode);
        res.send(error.body.error);
      }
    );
  } catch(error) {
    res.status(500).send("Oops! An unhandled particle-firebase-proxy exception occurred: " + error);
  }
});


var server = app.listen(process.env.PORT || 9000, function() {
  console.log('Listening on port %d', server.address().port);
});
