#!/bin/bash

# A test script for trying out your firebase proxy

# Your reverse proxy host URL. If you launch it locally, it will be http://localhost:9000
HOST='http://localhost:9000'
# The Particle.io device ID that will receive events
DEVICE_ID='YOUR_PARTICLE_DEVICE_ID'
# The Particle.io access token for this device
PARTICLE_TOKEN='YOUR_PARTICLE_ACCESS_TOKEN'
# A REST method: 'GET', 'PUT', 'PATCH', 'DELETE', 'POST'
METHOD='PATCH'
# Your Firebase data path. For example, '/test/value' 
FIREBASE_PATH='/my/data'
# Your data
DATA='{ "key" : "value" }'

curl "$HOST$FIREBASE_PATH?device_id=$DEVICE_ID&particle_token=$PARTICLE_TOKEN" --header "Content-Type: application/json" -v -X $METHOD -d @- <<EOF
$DATA
EOF
