#!/bin/bash

# A test script for trying out your firebase proxy

# Your reverse proxy host URL. If you launch it locally, it will be http://localhost:9000
HOST='YOUR_PROXY_HOST'
# The Particle.io device ID that will receive events
DEVICE_ID='YOUR_DEVICE_ID'
# The Particle.io access token for this device
ACCESS_TOKEN='YOUR_PARTICLE_ACCESS_TOKEN'
# The Firebase event type. 'value', 'child_added', 'child_changed' or 'child_removed'
EVENT_TYPE='value'
# Your Firebase data path. For example, '/test/value' 
FIREBASE_PATH='YOUR_FIREBASE_DATABASE_PATH'

curl $HOST -H "Content-Type: application/json" -X POST -d @- <<EOF
{ "device_id" : "$DEVICE_ID", "access_token" : "$ACCESS_TOKEN", "event_type" : "$EVENT_TYPE", "firebase_path" : "$FIREBASE_PATH" }
EOF
