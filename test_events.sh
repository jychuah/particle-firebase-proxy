#!/bin/bash

# A test script for trying out your firebase proxy

# Your reverse proxy host URL. If you launch it locally, it will be http://localhost:9000
HOST='YOUR_PROXY_HOST'
# The Particle.io device ID that will receive events
DEVICE_ID='YOUR_DEVICE_ID'
# The Particle.io access token for this device
PARTICLE_TOKEN='YOUR_PARTICLE_ACCESS_TOKEN'
# Your Firebase data path. For example, '/test/value' 
FIREBASE_PATH='YOUR_FIREBASE_DATABASE_PATH'

curl "$HOST$FIREBASE_PATH?device_id=$DEVICE_ID&particle_token=$PARTICLE_TOKEN" -H "Content-Type: application/json" -H "Accept: text/event-stream"