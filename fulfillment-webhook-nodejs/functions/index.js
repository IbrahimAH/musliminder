// https://github.com/dialogflow/dialogflow-fulfillment-nodejs

const axios = require('axios'); // for get requests
const latinize = require('latinize'); // to remove special characters from text
const JSSoup = require('jssoup').default; // web scraping
const rp = require('request-promise'); // simpler promises for web scraper

const functions = require('firebase-functions');
const { WebhookClient } = require('dialogflow-fulfillment');

const admin = require('firebase-admin');
const settingsJson = require('./settings.json'); // different calculation method settings
const keys = require('./keys.json');

// initialise DB connection
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://musliminder-luntvq.firebaseio.com',
});

process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const agent = new WebhookClient({ request, response });
  // console.log(`Dialogflow Request headers: ${JSON.stringify(request.headers)}`);
  // console.log(`Dialogflow Request body: ${JSON.stringify(request.body)}`);

  // get details if person messaging through facebook
  let psid = null;
  let firstName = null;
  let lastName = null;
  if (agent.originalRequest.payload.data != null) {
    psid = agent.originalRequest.payload.data.sender.id;
    console.log(`facebook user detected with psid: ${psid}`);
  }

  // say hi to users, returning users info is retrieved through db, new users are added to db
  function welcome(agent) {
    // if the person is messaging through facebook
    if (psid != null) {
      // get details from db
      return admin.database().ref(`users/${psid}`).once('value', (snapshot) => {
        // if the users details are already in the db
        if (snapshot.exists()) {
          firstName = snapshot.child('firstName').val();
          lastName = snapshot.child('lastName').val();
          const favouriteCity = snapshot.child('favouriteCity').val();
          agent.add(`Assalamualaikum Warahmatullahi Wabarakatuh ${firstName} ${lastName}. Your saved settings can be viewed & changed by typing "Settings"`);
          agent.add('I can provide prayer times for any location. Simply reply with a city and country to get started. E.g. "Prayer times for Sydney, Australia"');
          if (favouriteCity !== 'none') { agent.add(`You can instantly get times for ${favouriteCity} with "Favourite Times"`); } else { agent.add('You can also set a favourite city with "Favourite Location"'); }
        }
        // details not in db, get from fb and add them in
        else {
          agent.add('Assalamualaikum Warahmatullahi Wabarakatuh');
          agent.add('I can provide prayer times for any location. Simply reply with a city and country to get started. E.g. "Prayer times for Sydney, Australia"');
          agent.add('Or type "Settings" to change calculation settings and set your favourite location');
          axios.get(`https://graph.facebook.com/${psid}?fields=first_name,last_name&access_token=${keys.facebookapi}`)
            .then((result) => {
              firstName = result.data.first_name;
              lastName = result.data.last_name;
              // add details to firebase
              admin.database().ref(`users/${psid}`).set({
                firstName,
                lastName,
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
                favouriteCity: 'none',
                favouriteCountry: 'none',
              }); // end db add details
            }); // end axios get
        }
      }); // end of database check
    } // if messaging through any other platform, we can't get an ID

    agent.add('Assalamualaikum Warahmatullahi Wabarakatuh');
    return agent.add('I can provide prayer times for your location. Simply reply with a city and country to get started. E.g. "Prayer times for Sydney, Australia"');
  }

  // give user custom prayer times if theyre returning, otherwise generic using apialadhan.
  // also add them to the db if theyre not there
  async function prayerTime1DayCity(agent) {
    // get city and country from user
    let lowerCity = agent.parameters.city;
    lowerCity = `${lowerCity['street-address']}${lowerCity.city} ${lowerCity.island}${lowerCity['subadmin-area']}${lowerCity['admin-area']}`;
    let city = lowerCity.charAt(0).toUpperCase() + lowerCity.substring(1); // make first letter uppercase for aesthetics
    city = latinize(lowerCity);
    if (lowerCity === ' ') { return agent.add('Sorry, I couldn\'t find times for this location. Please check spelling or try another location'); }
    const { country } = agent.parameters; // dialogflow automatically uppercases this

    let urlTimes = `http://api.aladhan.com/v1/timingsByCity?city=${city}&country=${country}`;
    // &method=8&tune=1,2,3,4,5,6,7,8,9&midnightMode=1&school=1&latitudeAdjustmentMethod=1
    if (psid != null) {
      const snapshot = await admin.database().ref(`users/${psid}`).once('value');
      // if the users details are already in the db
      if (snapshot.exists()) {
        urlTimes += `&method=${snapshot.child('method').val()}`;
        urlTimes += `&tune=${snapshot.child('tuneImsak').val()},${
          snapshot.child('tuneFajr').val()},${
          snapshot.child('tuneSunrise').val()},${
          snapshot.child('tuneDhuhr').val()},${
          snapshot.child('tuneAsr').val()},${
          snapshot.child('tuneMaghrib').val()},0,${ // for sunset
          snapshot.child('tuneIsha').val()},${
          snapshot.child('tuneMidnight').val()}`;
        urlTimes += `&midnightMode=${snapshot.child('midnightMode').val()}`;
        urlTimes += `&school=${snapshot.child('school').val()}`;
        const latMethod = snapshot.child('latitude').val();
        if (latMethod != 0) urlTimes += `&latitideAdjustmentMethod=${snapshot.child('latitude').val()}`;
        agent.add(`Today's prayer times based on your settings`);
      } else {
        agent.add(`Today's prayer times using default settings`);
        axios.get(`https://graph.facebook.com/${psid}?fields=first_name,last_name&access_token=${keys.facebookapi}`)
          .then((result) => {
            firstName = result.data.first_name;
            lastName = result.data.last_name;
            // add details to firebase
            admin.database().ref(`users/${psid}`).set({
              firstName,
              lastName,
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
              favouriteCity: 'none',
              favouriteCountry: 'none',
            }); // end db add details
          }); // end axios get
        urlTimes += '&method=3';
      }
    } else {
      agent.add(`Today's prayer times using default settings:`);
      urlTimes += '&method=3';
    }
    console.log(urlTimes);
    // agent.add(`*This bot is currently undergoing testing. Check back soon for its release*`);
    // return; // comment out return axios below to stop api calls to prayer api during testing
    // use axios to send api get request for todays prayer times
    try {
      let result = await axios.get(urlTimes);
      const { timings } = result.data.data;
      let { meta } = await result.data.data;
      const prayertimes = `Imsak: ${timings.Imsak}\nFajr: ${timings.Fajr}\nSunrise: ${timings.Sunrise
      }\nDhuhr: ${timings.Dhuhr}\nAsr: ${timings.Asr}\nMaghrib: ${timings.Maghrib
      }\nIsha: ${timings.Isha}\nMidnight: ${timings.Midnight}`;
      
      var locString = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${meta.latitude},${meta.longitude}&key=${keys.mapsapi}`;
      let result1 = await axios.get(locString);
      var address = result1.data.results[0]["address_components"];
      // For SUBURB STATE POSTCODE, COUNTRYCODE
      agent.add(`For ${address[2].short_name} ${address[4].short_name} ${address[6].short_name}, ${address[5].long_name}`);
      agent.add(prayertimes);
    }
    catch(error) {
      if (error.response) {
        // The request was made and the server responded with a status code that falls out of the range of 2xx
          console.log(`${city}, ${country}`);
          console.error(error.response.data);
          agent.add('Sorry, I couldn\'t find times for this location. Please check spelling or try another location.');
        } else if (error.request) {
        // The request was made but no response was received
          console.error(error.request);
          agent.add('Sorry, the service is temporarily down. Please try again later.');
        } else {
        // Something happened in setting up the request that triggered an Error
          console.error('Error', error.message);
          agent.add('Sorry, the service is temporarily down. Please try again later.');
        }
        console.log(error.config);
    }
    return;
  }

  // print out users preferences
  function settings(agent) {
    if (psid != null) {
      return admin.database().ref(`users/${psid}`).once('value', (snapshot) => {
        // if the users details are already in the db
        if (snapshot.exists()) {
          agent.add('Here are your existing settings');
          // get values from db
          const favourite = `${snapshot.child('favouriteCity').val()}, ${snapshot.child('favouriteCountry').val()}`;
          const latitude = snapshot.child('latitude').val();
          const method = snapshot.child('method').val();
          const midnightMode = snapshot.child('midnightMode').val();
          const school = snapshot.child('school').val();
          // imsak, fajr, sunrise, dhuhr, asr, maghrib, sunset, isha, midnight
          const offsets = `Imsak: ${snapshot.child('tuneImsak').val()
          }, Fajr: ${snapshot.child('tuneFajr').val()
          }, Sunrise: ${snapshot.child('tuneSunrise').val()
          }, Dhuhr: ${snapshot.child('tuneDhuhr').val()
          }, Asr: ${snapshot.child('tuneAsr').val()
          }, Maghrib: ${snapshot.child('tuneMaghrib').val()
          }, Isha: ${snapshot.child('tuneIsha').val()
          }, Midnight: ${snapshot.child('tuneMidnight').val()}`;

          let settingsString = '';
          if (favourite === 'none, none') settingsString += 'No favourite location\n\n';
          else settingsString += `Favourite location: ${favourite}\n\n`;
          settingsString += `Latitude Adjustment: ${settingsJson.latitude[latitude]}\n\n`;
          settingsString += `Midnight Mode: ${settingsJson.midnightMode[midnightMode]}\n\n`;
          settingsString += `Juristic School (Asr Calc.): ${settingsJson.school[school]}\n\n`;
          settingsString += `Calculation Method: ${settingsJson.method[method]}\n\n`;
          settingsString += `Timing offsets: ${offsets}`;

          agent.add(settingsString);
          agent.add('Would you like to change these settings?');
        } else agent.add('Sorry, settings cannot be changed for your account');
      });
    }
    return agent.add('Sorry, settings cannot be changed for your account');
  }

  async function calcMethod(agent) {
    if (psid != null) {
      const snapshot = await admin.database().ref(`users/${psid}/method`).once('value');
      // if the users details are already in the db
      if (snapshot.exists()) {
        admin.database().ref(`users/${psid}`).update({
          method: settingsJson.methodInv[agent.parameters.CalcMethod],
        });
      }
    } else agent.add('Sorry, settings cannot be changed for your account');
  }

  async function changeSchool(agent) {
    if (psid != null) {
      let school = 0;
      const snapshot = await admin.database().ref(`users/${psid}/school`).once('value');
      // if the users details are already in the db
      if (snapshot.exists()) {
        if (agent.parameters.JuristicMethod == 'Hanafi') school = 1;
        admin.database().ref(`users/${psid}`).update({
          school,
        });
      }
    } else agent.add('Sorry, settings cannot be changed for your account');
  }

  async function changeMidnight(agent) {
    if (psid != null) {
      let midnightMode = 0;
      const snapshot = await admin.database().ref(`users/${psid}/midnightMode`).once('value');
      // if the users details are already in the db
      if (snapshot.exists()) {
        if (agent.parameters.MidnightMode == 'Mid Sunset to Fajr') midnightMode = 1;
        admin.database().ref(`users/${psid}`).update({
          midnightMode,
        });
      }
    } else agent.add('Sorry, settings cannot be changed for your account');
  }

  async function changeLatitude(agent) {
    if (psid != null) {
      const snapshot = await admin.database().ref(`users/${psid}/latitude`).once('value');
      // if the users details are already in the db
      if (snapshot.exists()) {
        admin.database().ref(`users/${psid}`).update({
          latitude: settingsJson.latitudeInv[agent.parameters.LatitudeMethod],
        });
      }
    } else agent.add('Sorry, settings cannot be changed for your account');
  }

  async function changeOffsets(agent) {
    if (psid != null) {
      const snapshot = await admin.database().ref(`users/${psid}/tuneImsak`).once('value');
      // if the users details are already in the db
      if (snapshot.exists()) {
        admin.database().ref(`users/${psid}`).update({
          tuneImsak: agent.parameters.ImsakOffset,
          tuneFajr: agent.parameters.FajrOffset,
          tuneSunrise: agent.parameters.SunriseOffset,
          tuneDhuhr: agent.parameters.DhuhrOffset,
          tuneAsr: agent.parameters.AsrOffset,
          tuneMaghrib: agent.parameters.MaghribOffset,
          tuneIsha: agent.parameters.IshaOffset,
          tuneMidnight: agent.parameters.MidnightOffset,
        });
      }
    } else agent.add('Sorry, settings cannot be changed for your account');
  }

  // user says favourite, let them pick between changing fave location or getting times for it
  async function favouriteWithoutLocation(agent) {
    if (psid != null) {
      const snapshot = await admin.database().ref(`users/${psid}`).once('value');
      // if the users details are already in the db
      if (snapshot.exists()) {
        // get values from db
        const favourite = `${snapshot.child('favouriteCity').val()}, ${snapshot.child('favouriteCountry').val()}`;
        if (favourite === 'none, none') { agent.add('No favourite location set. Set it now?'); } else { agent.add(`Change your location from ${favourite} or get prayer times?`); }
      } else agent.add('Sorry, settings cannot be changed for your account');
    } else agent.add('Sorry, settings cannot be changed for your account');
  }

  // set favourite location using users' provided city and country
  async function favouriteWithLocation(agent) {
    if (psid != null) {
      const snapshot = await admin.database().ref(`users/${psid}`).once('value');
      // if the users details are already in the db
      if (snapshot.exists()) {
        // get values from db
        let lowerCity = agent.parameters.city; // make first letter uppercase for aesthetics
        lowerCity = `${lowerCity['street-address']}${lowerCity.city} ${lowerCity.island}${lowerCity['subadmin-area']}${lowerCity['admin-area']}`;
        const favouriteCity = lowerCity.charAt(0).toUpperCase() + lowerCity.substring(1);
        if (lowerCity === ' ') { return agent.add('Sorry, I couldn\'t find this location. Please check spelling or try another location'); }
        const favouriteCountry = agent.parameters.country;
        admin.database().ref(`users/${psid}`).update({
          favouriteCity,
          favouriteCountry,
        });
        agent.add(`Okay! Your favourite location is now ${favouriteCity}, ${favouriteCountry}. Type "Favourite Times" to get times!`);
      } else agent.add('Sorry, settings cannot be changed for your account');
    } else agent.add('Sorry, settings cannot be changed for your account');
  }

  // get prayer times for already saved favourite city
  async function favouriteGetTimes(agent) {
    if (psid != null) {
      const snapshot = await admin.database().ref(`users/${psid}`).once('value');
      // if the users details are already in the db
      if (snapshot.exists()) {
        // get values from db
        const favouriteCity = snapshot.child('favouriteCity').val();
        const favouriteCountry = snapshot.child('favouriteCountry').val();
        if (favouriteCity === 'none') { agent.add('No favourite location set. Type "Favourite" to view and change favourite location'); } else {
          agent.parameters.city = {
            'business-name': '', shortcut: '', 'admin-area': '', island: '', city: favouriteCity, 'subadmin-area': '', 'zip-code': '', country: '', 'street-address': '',
          };
          agent.parameters.country = favouriteCountry;
          return prayerTime1DayCity(agent);
        }
      } else agent.add('Sorry, settings cannot be changed for your account');
    } else agent.add('Sorry, settings cannot be changed for your account');
  }

  var agentResponses = [];
  async function mosques(agent) {
    try {
      const location = agent.getContext('facebook_location').parameters; // get lat and long from fb location card
      const latString = location.lat.toString();
      const longString = location.long.toString();
      var url = `https://gopray.com.au/?gmw_post=place&gmw_address%5B%5D=Locations&gmw_distance=50&gmw_units=metric&gmw_form=1&paged=1&gmw_per_page=2&gmw_lat=${latString}&gmw_lng=${longString}&gmw_px=pt&action=gmw_post`;
      agentResponses.push(`Looking for prayer locations near you: \n${url}`); // make gopray url out of info
    } catch (err) {
      agent.add("Something went wrong. If you'd like to report it, take a screenshot of the conversation and send it to ibrahapps@gmail.com");
      console.error(err);
    }
    // get iqamah times at nearby mosques
    await rp(url)
      .then(scrapeMosques) // scrape for mosques in the gopray url
      .catch((err) => {
        console.error(`error whilst scraping mosques: ${err}`);
        agent.add('No prayer locations could be found near you :( This feature is currently only available for Australia');
      })
      .finally(() => {
        console.log('scraping complete!');
      });

    for (const messages of agentResponses) 
      agent.add(messages);
    
    return;
  }

  // scrape the list of mosques nearby from gopray url
  function scrapeMosques(html) {
    const soup = new JSSoup(html);
    if (soup.find('ul', 'posts-list-wrapper')) { // if theres a list of mosques on gopray
      const wrapper = soup.find('ul', 'posts-list-wrapper');
      const mosques = wrapper.findAll('a'); // get the mosques element
      const mosqueurls = mosques.map((mosque) => mosque.attrs.href); // get the urls of the mosque pages
      if (mosqueurls.length == 2)
        agent.setContext({
          "name": 'urls', "lifespan": 3,
          "parameters":{"intro" : agentResponses[0], "m1": mosqueurls[0], "m2": mosqueurls[1]}
        });
      else if (mosqueurls.length == 1)
        agent.setContext({
          "name": 'urls', "lifespan": 3,
          "parameters":{"intro" : agentResponses[0], "m1": mosqueurls[0]}
        });
      agent.setFollowupEvent('get-times'); // each intent has 5 second timeout, so call another intent to extend timeout
    } else agentResponses.push('No prayer locations could be found near you :( This feature is currently only available in Australia');
    return;
  }

  // get times of first mosque
  async function mosques2(agent) {
    var context = agent.getContext('urls').parameters;
    var mosques = Object.keys(context).length;
    
    await rp(context.m1)
      .then(scrapeMosqueTimes) // scrape the iqamah times of each mosque
      .catch((err) => {
        console.error(`error whilst scraping mosque times: ${err}`);
      });

    if (mosques > 2) {
      agent.setContext({
        "name": 'urls', "lifespan": 2,
        "parameters":{"intro" : context.intro, "m2": context.m2, "m1name": agentResponses[0], "m1address": agentResponses[1], "m1times": agentResponses[2]}
      });
      agent.setFollowupEvent('get-times2'); // each intent has 5 second timeout, so call another intent to extend timeout
    }
    else {
      agent.add(context.intro);
      for (const messages of agentResponses) 
        agent.add(messages);
    }
    
    return;
  }

  // get times of second mosque
  async function mosques3(agent) {

    var context = agent.getContext('urls').parameters;
    agent.add(context.intro);
    
    //check second closest mosque
    await rp(context.m2)
      .then(scrapeMosqueTimes) // scrape the iqamah times of each mosque
      .catch((err) => {
        console.error(`error whilst scraping mosque times: ${err}`);
      });

    //add times of the first mosque checked
    agent.add(context.m1name);
    agent.add(context.m1address);
    agent.add(context.m1times);

    for (const messages of agentResponses) 
      agent.add(messages);
    
    return;
  }

  // scrape times from a mosques page
  function scrapeMosqueTimes(html) {
    var times = "";
    const soup = new JSSoup(html);
    if (soup.find('div', 'place-prayer-times')) {
      let name = soup.find('title').text; // name of mosque
      name = name.slice(0, -11);
      agentResponses.push(name + `\n`);
      const address = soup.find('div', 'place-location').find('a').attrs.href; // address of mosque on google maps
      agentResponses.push(address + `\n`);
      const wrapper = soup.find('div', 'place-prayer-times');
      const table = wrapper.find('table');
      let rows = table.findAll('tr');
      rows = rows.map((row) => {
        if (row.find('th')) 
          times += row.find('th').text + `: `;
        if (row.find('td')) 
          times += row.find('td').text + `\n`;
      });
    agentResponses.push(times + `\n`);
    } else console.error('Failed soup, no place prayer times');
    return;
  }

  // Run the proper function handler based on the matched Dialogflow intent name
  const intentMap = new Map();
  intentMap.set('Default Welcome Intent', welcome);
  intentMap.set('Settings', settings);
  intentMap.set('PrayerTime1DayCity', prayerTime1DayCity);
  intentMap.set('Change CalcMethod', calcMethod);
  intentMap.set('Change Latitude', changeLatitude);
  intentMap.set('Change School', changeSchool);
  intentMap.set('Change Midnight', changeMidnight);
  intentMap.set('Change Offsets', changeOffsets);
  intentMap.set('Favourite Without Location', favouriteWithoutLocation);
  intentMap.set('Favourite Without Location - Get', favouriteGetTimes);
  intentMap.set('Favourite Without Location - Set - Location', favouriteWithLocation);
  intentMap.set('Favourite With Location', favouriteWithLocation);
  intentMap.set('Favourite Get Times', favouriteGetTimes);
  intentMap.set('Location Sent', mosques);
  intentMap.set('Get Mosque Times', mosques2);  
  intentMap.set('Get Mosque Times2', mosques3);  
  agent.handleRequest(intentMap);
});
