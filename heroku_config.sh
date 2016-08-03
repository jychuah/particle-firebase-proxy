#!/bin/bash
while IFS='' read -r line || [[ -n "$line" ]]; do
    echo "$line"
    heroku config:set $line
done < ".env"
