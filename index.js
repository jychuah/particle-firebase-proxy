
var express = require('express');
var bodyParser = require('body-parser');
var firebase = require("firebase");
var Particle = require('particle-api-js');

var app = express();

app.use(bodyParser.json());

var particle = new Particle();

var firebaseApps = { };

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

    if (!firebaseApps.hasOwnProperty(body.device_id)) {
      firebaseApps[body.device_id] = firebase.initializeApp({
        databaseURL: process.env.DATABASE,
        serviceAccount: process.env.SERVICEACCOUNTFILE,
        databaseAuthVariableOverride: {
          device_id : body.device_id,
          access_token : body.access_token
        }
      }, body.device_id);
    }
    var fb = firebaseApps[body.device_id];

    // The app only has access as defined in the Security Rules
    var db = fb.database();

    var ref = db.ref(body.firebase_path);
    //var ref = db.ref(body.firebase_path);

    ref.on(body.event_type,
      function(snapshot) {
        // firebase event fired -- publish an event to the device with the data, could be null if bad path
        console.log("snapshot", snapshot.val());
      },
      function(error) {
        // cancel event -- publish something to the device
        if (error.message.indexOf("permission_denied")) {
          // permission error
          return;
        }
        console.log(error.message);
        // unhandled error at this point
      }
    );

    res.status(200).send("OK");
  } catch(error) {
    res.status(500);
    res.send("Oops! An unhandled exception occurred: " + error);
  }
});


var server = app.listen(process.env.PORT || 9000, function() {
  console.log('Listening on port %d', server.address().port);
});
