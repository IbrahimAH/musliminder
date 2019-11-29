// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';
 
const axios = require('axios');
const functions = require('firebase-functions');
const {WebhookClient} = require('dialogflow-fulfillment');
const {Card, Suggestion} = require('dialogflow-fulfillment');

// initialise DB connection
const admin = require('firebase-admin');
var serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://musliminder-luntvq.firebaseio.com"
});
 
process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements
 
exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
	const agent = new WebhookClient({ request, response });
	console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
  console.log('Dialogflow Request body: ' + JSON.stringify(request.body));
  
  // get details if person messaging through facebook
  var psid = null;
  var firstName = null;
  var lastName = null;
  if (agent.originalRequest.payload.data != null) {
    psid = agent.originalRequest.payload.data.sender.id;
    console.log("facebook user detected with psid: " + psid);
  }
  
  function welcome(agent) {
    agent.add(`~~~This bot is currently undergoing testing. Check back soon for its release~~~`);

    // if the person is messaging through facebook
    if (psid != null) {
      // get details from db
      return admin.database().ref(`users/${psid}`).once("value", snapshot => {
        // if the users details are already in the db
        if (snapshot.exists()) {
          firstName = snapshot.child("firstName").val();
          lastName = snapshot.child("lastName").val();
          // console.log("database contains info: " + firstName + " " + lastName);
          agent.add(`Assalamualaikum Warahmatullahi Wabarakatuh. Welcome back ${firstName} ${lastName}. Your saved preferences will be used`);
          agent.add(`I can provide prayer times for your city. Simply reply with a city and country to get started. E.g. "Prayer times for Sydney, Australia"`);
        }
        // details not in db, get from fb and add them in
        else { 
          // console.log('user doesnt exist in db');
          agent.add(`Assalamualaikum Warahmatullahi Wabarakatuh`);
          agent.add(`I can provide prayer times for your city. Simply reply with a city and country to get started. E.g. "Prayer times for Sydney, Australia"`);
          axios.get(`https://graph.facebook.com/${psid}?fields=first_name,last_name&access_token=EAAK6RBQZCcEsBAIBZCmbwVJfO6ncteYLPi9dV5dk8Tts3MvwtN4ll5GhiAXPndh4ZBq6ZBWjviw0zEqLWqjzE1PhMTwOeATCDx46ZAKEjytEHINn7lw0sHLZA06eBCstJzcHzCasaUoPcGX0fiPDXrj7xYOkx5j6jQKTsHVd7ZBvMdsmLKZC5aSHVcxdn03TDvoZD	`)
          .then((result) => {
            firstName = result.data.first_name;
            lastName = result.data.last_name;
            // add details to firebase
            admin.database().ref('users/' + psid).set({
              firstName: firstName,
              lastName: lastName,
              tuneImsak: 0,
              tuneFajr: 0,
              tuneSunrise: 0,
              tuneDhuhr: 0,
              tuneAsr: 0,
              tuneMaghrib: 0,
              tuneIsha: 0,
              tuneMidnight: 0,
              method: 3,
              school: 0,
              midnightMode: 0,
              latitude: 0,
              favouriteCity: "none",
              favouriteCountry: "none"
            }); // end db add details
          }); // end axios get
        }
      }); // end of database check

    } // if messaging through any other platform, we can't get an ID
    else {
      agent.add(`Assalamualaikum Warahmatullahi Wabarakatuh`);
      return agent.add(`I can provide prayer times for your city. Simply reply with a city and country to get started. E.g. "Prayer times for Sydney, Australia"`);
    }
	}

	function prayerTime1DayCity(agent) {
		// get city and country from user
		const lowerCity = agent.parameters.city; // make first letter uppercase for aesthetics
		const city = lowerCity.charAt(0).toUpperCase() + lowerCity.substring(1);
		const country = agent.parameters.country; // dialogflow automatically uppercases this
      
    // if (agent.originalRequest.payload.data != null && psid == null) {
    //   psid = agent.originalRequest.payload.data.sender.id;
    //   console.log(psid);
    //   axios.get(`https://graph.facebook.com/${psid}?fields=first_name,last_name&access_token=EAAK6RBQZCcEsBAIBZCmbwVJfO6ncteYLPi9dV5dk8Tts3MvwtN4ll5GhiAXPndh4ZBq6ZBWjviw0zEqLWqjzE1PhMTwOeATCDx46ZAKEjytEHINn7lw0sHLZA06eBCstJzcHzCasaUoPcGX0fiPDXrj7xYOkx5j6jQKTsHVd7ZBvMdsmLKZC5aSHVcxdn03TDvoZD	`)
		// 		.then((result) => {
		// 			firstName = result.data.first_name;
    //       lastName = result.data.last_name;
		// 	});
    // }
      
		agent.add(`Today's prayer times for ` + city + `, ` + country);
		//use axios to send api get request for todays prayer times
	  return axios.get(`http://api.aladhan.com/v1/timingsByCity?city=${city}&country=${country}&method=8`)
		.then((result) => {
			const timings = result.data.data.timings;
      agent.add(`Imsak: ` + timings.Imsak + `\nFajr: ` + timings.Fajr + `\nSunrise: ` + timings.Sunrise + 
      `\nDhuhr: ` + timings.Dhuhr + `\nAsr: ` + timings.Asr + `\nMaghrib: ` + timings.Maghrib +
      `\nIsha: ` + timings.Isha + `\nMidnight: ` + timings.Midnight);
		})
		.catch((error) => {
			if (error.response) {
				// The request was made and the server responded with a status code that falls out of the range of 2xx
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

  function settings(agent) {
    
    if (psid != null) {
      return admin.database().ref(`users/${psid}`).once("value", snapshot => {
        // if the users details are already in the db
        if (snapshot.exists()) {
          agent.add(`Here are your existing settings`);
          //get values from db
          var favourite = snapshot.child("favouriteCity").val() + ", " + snapshot.child("favouriteCountry").val();
          var latitude = snapshot.child("latitude").val();
          var method = snapshot.child("method").val();
          var midnightMode = snapshot.child("midnightMode").val();
          var school = snapshot.child("school").val();
          // imsak, fajr, sunrise, dhuhr, asr, maghrib, sunset, isha, midnight
          var offsets = "Imsak: " + snapshot.child("tuneImsak").val() + 
          ", Fajr: " + snapshot.child("tuneFajr").val() + 
          ", Sunrise: " + snapshot.child("tuneSunrise").val() + 
          ", Dhuhr: " + snapshot.child("tuneDhuhr").val() +
          ", Asr: " + snapshot.child("tuneAsr").val() +
          ", Maghrib: " + snapshot.child("tuneMaghrib").val() +
          ", Isha: " + snapshot.child("tuneIsha").val() +
          ", Midnight: " + snapshot.child("tuneMidnight").val();

          var settingsString = "";

          if (favourite === "none, none") settingsString += "No favourite location\n\n";
          else settingsString += "Favourite location: " + favourite + "\n\n";
          
          settingsString += "Latitude Adjustment: ";
          if (latitude === 1) settingsString += "Middle of the Night\n\n";
          else if (latitude === 2) settingsString += "One Seventh\n\n";
          else if (latitude === 3) settingsString += "Angle Based\n\n";
          else settingsString += "Default\n\n";

          settingsString += "Midnight Mode: ";
          if (midnightMode === 1) settingsString += "Jafari (Mid Sunset to Fajr)\n\n";
          else settingsString += "Default (Mid Sunset to Sunrise)\n\n";
          
          settingsString += "Juristic School: ";
          if (school === 1) settingsString += "Hanafi\n\n";
          else settingsString += "Default (Hanbali, Maliki, Shafi)\n\n";

          settingsString += "Calculation Method: ";
          if (method === 0) settingsString += "Shia Ithna-Ansari\n\n";
          else if (method === 1) settingsString += "University of Islamic Sciences, Karachi\n\n";
          else if (method === 2) settingsString += "Islamic Society of North America\n\n";
          else if (method === 4) settingsString += "Umm Al-Qura University, Makkah\n\n";
          else if (method === 5) settingsString += "Egyptian General Authority of Survey\n\n";
          else if (method === 7) settingsString += "Institute of Geophysics, University of Tehran\n\n";
          else if (method === 8) settingsString += "Gulf Region\n\n";
          else if (method === 9) settingsString += "Kuwait\n\n";
          else if (method === 10) settingsString += "Qatar\n\n";
          else if (method === 11) settingsString += "Majlis Ugama Islam Singapura, Singapore\n\n";
          else if (method === 12) settingsString += "Union Organization islamic de France\n\n";
          else if (method === 13) settingsString += "Diyanet İşleri Başkanlığı, Turkey\n\n";
          else if (method === 14) settingsString += "Spiritual Administration of Muslims of Russia\n\n";
          else settingsString += "Default (Muslim World League)\n\n";

          settingsString += "Timing offsets: " + offsets;

          agent.add(settingsString);
          agent.add(`Would you like to change these settings?`);
        }
        else agent.add(`Sorry, settings cannot be changed for your account`);
      });
    }
    else agent.add(`Sorry, settings cannot be changed for your account`);
  }
  
  function fallback(agent) {
		agent.add(`I didn't understand`);
		agent.add(`I'm sorry, can you try again?`);
  }

	// Run the proper function handler based on the matched Dialogflow intent name
	let intentMap = new Map();
  intentMap.set('Default Fallback Intent', fallback);
  intentMap.set('Settings', settings);
  intentMap.set('PrayerTime1DayCity', prayerTime1DayCity);
  intentMap.set('Default Welcome Intent', welcome);
	agent.handleRequest(intentMap);
});