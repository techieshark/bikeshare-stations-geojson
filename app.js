/**
 * This server fetches, transforms, and caches the bikeshare stations.
 * Stations will be re-fetched if the stationlist either doens't exist or is too old.
 */

const http = require('http');
const https = require('https');

const { now } = Date; // destructuring version of: now = Date.now()

// config
const stationsFeedUrl = 'https://feeds.bayareabikeshare.com/stations/stations.json';
const hostname = '127.0.0.1';
const port = 3001;
const millis = 1000;
const refetchDelaySeconds = 30; /* Set to something like 30 seconds in production */
let lastFetchTimeMS = 0;
let cachedStations = null;


/**
 * Respond with the json data and close the connection.
 * @param {IncomingMessage} req
 * @param {ServerResponse} res
 * @param {JSON object} json
 */
function sendJsonResponse(req, res, json) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  // res.setHeader('Access-Control-Allow-Headers', req.headers.origin);
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.end(JSON.stringify(json, null, 3)); // send prettified JSON response
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
    // who knows what a 'bean list' is but that's where feed stores stations:
    features: stationFeedData.stationBeanList.map(transformStation),
  };
  return stationsGeoJSON;
}


/**
 * Fetch stations, and pass them to callback on success.
 * @param {(json => any)} callback
 */
function fetchStations(callback) {
  https.get(stationsFeedUrl, (res) => {
    res.setEncoding('utf8');
    let body = '';
    res.on('data', (data) => {
      body += data;
    });
    res.on('end', () => {
      callback(transformFeed(JSON.parse(body)));
    });
  });
}


const server = http.createServer((req, res) => {
  if (req.url !== '/') {
    // barf on anything other than the root url
    res.statusCode = 404;
    res.end('NOT FOUND');
    return;
  }
  const nowMS = now();
  if (nowMS > lastFetchTimeMS + (refetchDelaySeconds * millis)) {
    console.log('Time for a refetch');
    fetchStations((stations) => {
      cachedStations = stations;
      sendJsonResponse(req, res, cachedStations);
    });
    // update timestamp
    lastFetchTimeMS = now();
  } else {
    console.log(`No need to refetch; last was less than ${refetchDelaySeconds} seconds ago.`);
    sendJsonResponse(req, res, cachedStations);
  }
});


server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
