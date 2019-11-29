// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';
 
const axios = require('axios');
const functions = require('firebase-functions');
const {WebhookClient} = require('dialogflow-fulfillment');
const {Card, Suggestion} = require('dialogflow-fulfillment');

// initialise DB connection
const admin = require('firebase-admin');
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: 'ws://musliminder-luntvq.firebaseio.com/',
});

// var admin = require("firebase-admin");

// var serviceAccount = require("path/to/serviceAccountKey.json");

// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
//   databaseURL: "ws://musliminder-luntvq.firebaseio.com"
// });
 
process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements
 
exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
	const agent = new WebhookClient({ request, response });
	console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
	console.log('Dialogflow Request body: ' + JSON.stringify(request.body));
 
	function fallback(agent) {
		agent.add(`I didn't understand`);
		agent.add(`I'm sorry, can you try again?`);
	}

	function prayerTime1DayCity(agent) {
		// get city and country from user
		const lowerCity = agent.parameters.city; // make first letter uppercase for aesthetics
		const city = lowerCity.charAt(0).toUpperCase() + lowerCity.substring(1);
		const country = agent.parameters.country; // dialogflow automatically uppercases this
		
    // facebook user data
    var psid = null;
    var firstName = null;
    var lastName = null;
      
    if (agent.originalRequest.payload.data != null) {
      psid = agent.originalRequest.payload.data.sender.id;
      console.log(psid);
      // https://graph.facebook.com/2868766739800309?fields=first_name,last_name,profile_pic&access_token=EAAK6RBQZCcEsBAIBZCmbwVJfO6ncteYLPi9dV5dk8Tts3MvwtN4ll5GhiAXPndh4ZBq6ZBWjviw0zEqLWqjzE1PhMTwOeATCDx46ZAKEjytEHINn7lw0sHLZA06eBCstJzcHzCasaUoPcGX0fiPDXrj7xYOkx5j6jQKTsHVd7ZBvMdsmLKZC5aSHVcxdn03TDvoZD	
      axios.get(`https://graph.facebook.com/${psid}?fields=first_name,last_name&access_token=EAAK6RBQZCcEsBAIBZCmbwVJfO6ncteYLPi9dV5dk8Tts3MvwtN4ll5GhiAXPndh4ZBq6ZBWjviw0zEqLWqjzE1PhMTwOeATCDx46ZAKEjytEHINn7lw0sHLZA06eBCstJzcHzCasaUoPcGX0fiPDXrj7xYOkx5j6jQKTsHVd7ZBvMdsmLKZC5aSHVcxdn03TDvoZD	`)
				.then((result) => {
					firstName = result.data.first_name;
          lastName = result.data.last_name;
			});
    }
      
		agent.add(`Today's prayer times for ` + city + `, ` + country);
		//use axios to send api get request for todays prayer times
	return axios.get(`http://api.aladhan.com/v1/timingsByCity?city=${city}&country=${country}&method=8`)
		.then((result) => {
			const timings = result.data.data.timings;
			agent.add(`Fajr: ` + timings.Fajr);
			agent.add(`Sunrise: ` + timings.Sunrise);
			agent.add(`Dhuhr: ` + timings.Dhuhr);
			agent.add(`Asr: ` + timings.Asr);
			//agent.add(`Sunset: ` + timings.Sunset);
			agent.add(`Maghrib: ` + timings.Maghrib);
			agent.add(`Isha: ` + timings.Isha);
			agent.add(`Imsak: ` + timings.Imsak);
			agent.add(`Midnight: ` + timings.Midnight);
		})
		.catch((error) => {
			if (error.response) {
				// The request was made and the server responded with a status code
				// that falls out of the range of 2xx
				console.log(city + `, ` + country);
				console.log(error.response.data);
				agent.add(`Sorry, I couldn't find times for this city. Please check spelling or try another city.`);
			} else if (error.request) {
				// The request was made but no response was received
				console.log(error.request);
				agent.add(`Sorry, the service is temporarily down. Please try again later.`);
			} else {
				// Something happened in setting up the request that triggered an Error
				console.log('Error', error.message);
				agent.add(`Sorry, the service is temporarily down. Please try again later.`);
			}
			console.log(error.config);
		});
	}

	// // Uncomment and edit to make your own intent handler
	// // uncomment `intentMap.set('your intent name here', yourFunctionHandler);`
	// // below to get this function to be run when a Dialogflow intent is matched
	// function yourFunctionHandler(agent) {
	//   agent.add(`This message is from Dialogflow's Cloud Functions for Firebase editor!`);
	//   agent.add(new Card({
	//       title: `Title: this is a card title`,
	//       imageUrl: 'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png',
	//       text: `This is the body text of a card.  You can even use line\n  breaks and emoji! 💁`,
	//       buttonText: 'This is a button',
	//       buttonUrl: 'https://assistant.google.com/'
	//     })
	//   );
	//   agent.add(new Suggestion(`Quick Reply`));
	//   agent.add(new Suggestion(`Suggestion`));
	//   agent.setContext({ name: 'weather', lifespan: 2, parameters: { city: 'Rome' }});
	// }

	// // Uncomment and edit to make your own Google Assistant intent handler
	// // uncomment `intentMap.set('your intent name here', googleAssistantHandler);`
	// // below to get this function to be run when a Dialogflow intent is matched
	// function googleAssistantHandler(agent) {
	//   let conv = agent.conv(); // Get Actions on Google library conv instance
	//   conv.ask('Hello from the Actions on Google client library!') // Use Actions on Google library
	//   agent.add(conv); // Add Actions on Google library responses to your agent's response
	// }
	// // See https://github.com/dialogflow/fulfillment-actions-library-nodejs
	// // for a complete Dialogflow fulfillment library Actions on Google client library v2 integration sample

	// Run the proper function handler based on the matched Dialogflow intent name
	let intentMap = new Map();
	intentMap.set('Default Fallback Intent', fallback);
	intentMap.set('PrayerTime1DayCity', prayerTime1DayCity);
	// intentMap.set('your intent name here', yourFunctionHandler);
	// intentMap.set('your intent name here', googleAssistantHandler);
	agent.handleRequest(intentMap);
});