# particle-firebase-proxy

_A reverse proxy for Firebase Realtime Database events -> Particle.io cloud events_

### Introduction

_TL;DR - Now you can use Firebase Realtime Database events with Particle.io devices._

Particle.io Webhooks can retrieve static pages, but can't subscribe to Server Sent Event streams, such as event streams (that used to be) provided by [Firebase database events](https://firebase.google.com/docs/database/web/retrieve-data#listen_for_events). This reverse proxy can be configured to work with a Firebase app via a Service Account. Particle.io devices can then subscribe to the proxy via a REST WebHook, and database events are published to the subscribing event stream.

### How To Use It

Once you've set up the reverse proxy somewhere, you can register Firebase database events to be sent as publisehd Particle.io events by sending a POST to the proxy with the following .json POST data:

```
{
	"device_id" : "YOUR_PARTICLE_DEVICE_ID",
	"access_token" : "PARTICLE_ACCESS_TOKEN",
	"event_type" : "FIREBASE_EVENT_TYPE",
	"firebase_path" : "FIREBASE_DATABASE_PATH"
}
```

The proxy will respond with a `(200) OK` if it was successful, or an error message. After that, you should see events being published with the name `firebase`. The data payload will be:

```
{
	"key" : "DATABASE_KEY",
	"firebase_path" : "ORIGINAL_FIREBASE_PATH",
	"val" : "DATABASE_SNAPSHOT",
	"event_type" : "DATABASE_EVENT_TYPE"
}
```

If an error is ever generated by the event subscription (for exmaple, if permissions changed and your subscription was cancelled) a `firebase` event will be generated with error data in the payload.


### Setup

- Installed [NodeJS](http://nodejs.org) and a `git` client.
- Clone this repo with

	```
	git clone https://github.com/jychuah/particle-firebase-proxy
	```

- Install the required modules with

	```
	npm install
	```
	
- Setup a Firebase App and some database access rules!
- Setup a Google Service Account and download the credentials .json. Instructions for creating a service account for your Firebase App can be found [here](https://firebase.google.com/docs/server/setup), under the _Add Firebase to your app_ heading. Save this file in the root of your clone of this repo.
- Configure `DATABASE` and `SERVICEACCOUNTFILE` environment variables.
	- `DATABASE` should be set to your Firebase database's URL. For example, `http://myfirebase.firebaseio.com`
	- `SERVICEACCOUNTFILE` should be set to your service account.json file. For example, `serviceAccount.json`
	- If you are using [Node Foreman](https://github.com/strongloop/node-foreman), you may simply edit the [`.env`](./env) file.
- If you are testing the reverse proxy locally, you can launch it with `npm start`. If you have Node Forman installed, you can run `nf start` and it will grab all the environment variables automatically.
- Deploy it somewhere.

### Testing

The [`./test.sh`](./test.sh) script can be used to try out your reverse proxy. Just fill in the variables and run the script. The script will print out the REST response. (If it says `OK` that's good.) Any events that happen on Firebase should now appear as published events and data on your Particle.io event stream, which you can view with the [Particle.io Console](http://console.particle.io).


### Deploying to Heroku

I tested this reverse proxy on [Heroku](http://heroku.com). To setup Heroku, make sure you have command line `git`, the [Heroku Toolbelt](https://toolbelt.heroku.com/), and a verified account. To deploy this reverse proxy, do the following:

- Clone this repo

	```
	git clone https://github.com/jychuah/particle-firebase-proxy
	```

- Save your `serviceAccount.json` file in the root of your clone. Add it to your repo with:

	```
	git add serviceAccount.json
	git commit -m "Added serviceAccount"
	```

- Edit the [`.env`](./env) file to point to your `serviceAccount.json` file and your Firebase database
- Create a Heroku dyno and make a note of the endpoint. (Heroku services always run on port 80, so your `PORT` variable will be ignored.)

	```
	heroku login
	heroku create
	```
	
- Send your environment variables to your Heroku dyno. You can use the included script.

	```
	./heroku_config.sh
	```

- Push it to Heroku

	```
	git push heroku master
	```
	
- Check to see if it's running with

	```
	heroku logs --tail
	```

### HTTP Error Messages

Error message responses could be:

- `(400) Missing property` in the request
- `(400) Invalid Firebase event_type` if it wasn't one of the [Firebase database events](https://firebase.google.com/docs/database/web/retrieve-data#listen_for_events)
- `(401) Unauthorized` if it couldn't validate the `device_id` and `access_token` pair 
- `(403) Firebase permission denied` if the `firebase_path` was inaccessible
- `(503) Firebase error` for other types of Firebase errors.
- `(500) Oops!` for... well, submit a bug report.
