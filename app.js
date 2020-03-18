/* eslint-disable no-console */

/**
 * This server fetches, transforms, and caches the bikeshare stations.
 * Stations will be re-fetched if the stationlist either doens't exist or is too old.
 */

const http = require('http');
const https = require('https');

const { now } = Date; // destructuring version of: now = Date.now()

// config
const stationsFeedUrl = 'https://feeds.bayareabikeshare.com/stations/stations.json';
const port = process.env.PORT || 8080; // `process.env.PORT` lets Heroku set port
const millis = 1000;
const refetchDelaySeconds = 30; /* Set to something like 30 seconds in production */
let lastFetchTimeMS = 0;
let cachedStations = null;

/**
 * Respond with the json data and close the connection.
 * @param {IncomingMessage} request
 * @param {ServerResponse} response
 * @param {JSON object} json
 */
function sendJsonResponse(request, response, json) {
  response.statusCode = 200;
  response.setHeader('Content-Type', 'application/json');
  // res.setHeader('Access-Control-Allow-Headers', req.headers.origin);
  response.setHeader('Access-Control-Allow-Origin', request.headers.origin || '*');
  response.end(JSON.stringify(json, null, 3)); // Send prettified JSON response
  // res.end(JSON.stringify(json)); // non pretty
}

/**
 * Transform a station into a GeoJSON Feature
 * @param {*} station - a station from the original feed
 */
function transformStation(station) {
  const geoJsonPoint = {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [station.longitude, station.latitude],
    },
    properties: station, // TODO we could strip properties not needed for
    // app, so we aren't clogging the wires with useless noise.
  };
  return geoJsonPoint;
}

/**
 * Transform multiple stations into GeoJSON FeatureCollection
 * @param {Object} stationFeedData
 */
function transformFeed(stationFeedData) {
  const stationsGeoJSON = {
    type: 'FeatureCollection',
    // Who knows what a 'bean list' is but that's where feed stores stations:
    features: stationFeedData.stationBeanList.map(transformStation),
  };
  return stationsGeoJSON;
}

/**
 * Fetch stations, and pass them to callback on success.
 * @param {(json => any)} callback
 */
function fetchStations(callback) {
  https.get(stationsFeedUrl, (response) => {
    response.setEncoding('utf8');
    let body = '';
    response.on('data', (data) => {
      body += data;
    });
    response.on('end', () => {
      callback(transformFeed(JSON.parse(body)));
    });
  });
}

const server = http.createServer((request, response) => {
  if (request.url !== '/') {
    // Barf on anything other than the root url
    response.statusCode = 404;
    response.end('NOT FOUND');
    return;
  }

  const nowMS = now();
  if (nowMS > lastFetchTimeMS + (refetchDelaySeconds * millis)) {
    console.log('Time for a refetch');
    fetchStations((stations) => {
      cachedStations = stations;
      sendJsonResponse(request, response, cachedStations);
    });
    // Update timestamp
    lastFetchTimeMS = now();
  } else {
    console.log(`No need to refetch; last was less than ${refetchDelaySeconds} seconds ago.`);
    sendJsonResponse(request, response, cachedStations);
  }
});

server.listen(port, () => {
  console.log(`Server running on port ${port}/`);
});
