/* DISCLAIMER
 *
 * Parts of the code in this file dealing with version numbers
 * take the assumption that they're formatted as d.d.[d]d and
 * will NOT work if the major/medium has more than one digit.
 * 
 * There are no tests for this code, just comments, deal with it.
 *
 */

var express = require('express');
var compression = require('compression');
var serveStatic = require('serve-static');
var serveIndex = require('serve-index');
var utils = require('./cdnlib.js');

var CONF_FILE = __dirname + '/cdn.conf';

var ONE_YEAR = 31536000; // one year in s
var ONE_YEAR_MS = ONE_YEAR * 1000; // one year in ms

var app = express();

/*
 * Middleware to allow cross-domain requests
 */
var allowCrossDomain = function (req, res, next) {
	res.header('Access-Control-Allow-Origin', "*");
	res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
	res.header('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
	if (req.method == 'OPTIONS') {
		res.sendStatus(200);
	}
	else {
		next();
	}
}

/*
 * Middleware to lowercase the querystring
 */
var lowerCaseQuery = function (req, res, next) {
	var newq = {};
	for (var key in req.query) newq[key.toLowerCase()] = req.query[key];
	req.query = newq;
	next();
}

/*
 * App environments configuration
 */
app.use(compression()); // gzip
app.use(allowCrossDomain);
app.use(lowerCaseQuery);
app.use('/aria', serveStatic(__dirname + '/aria', {maxAge: ONE_YEAR_MS}));
app.use('/dev', serveStatic(__dirname + '/dev', {maxAge: ONE_YEAR_MS}));
app.use('/css', serveStatic(__dirname + '/css', {maxAge: ONE_YEAR_MS}));
app.use(serveStatic(__dirname + '/static', {maxAge: ONE_YEAR_MS}));
app.use('/aria', serveIndex(__dirname + '/aria', {icons:true}));
app.use('/dev', serveIndex(__dirname + '/dev', {icons:true}));
app.use('/css', serveIndex(__dirname + '/css', {icons:true}));

/*
 * Open-source build getter
 *
 * /ariatemplates-<x.y.z[-beta.b]>.js[?<params>]
 *
 * params:
 * - dev  (dev build, default to minified)
 * - skin (serve skin, default does not)
 */
app.get(/^\/ariatemplates-(\d\.\d\.\d{1,2}(?:-beta\.\d)?)\.js/i, function (req, res) {
	utils.getFwk(req, res, 'ariatemplates-', req.params[0], ONE_YEAR);
});

/*
 * Amadeus build getter
 *
 * /aria-tamplates-<x.y[beta-ptr]-z[p]>.js[?<params>]
 *
 * params:
 * - dev  (dev build, default to minified)
 * - skin (serve skin, default does not)
 */
app.get(/^\/aria-templates-(\d\.\d(?:beta-\d{7,8})?[\-\.]\d{1,2}[a-zA-Z]?)\.js/i, function (req, res) {
	utils.getFwk(req, res, 'aria-templates-', req.params[0], ONE_YEAR);
});

/*
 * Generic getter
 *
 * /at<version>.js[?<params>]
 *
 * params:
 * - 1a   (Amadeus package, default to OS one)
 * - dev  (dev build, default to minified)
 * - skin (serve skin, default does not)
 */
app.get(/^\/at(\d)[\-\.]?(\d)(?:beta-?(\d{7,8}))?[\-\.]?(\d{1,2})(?:([a-zA-Z])|-?beta\.?(\d))?\.js/i, function (req, res) {
	var amadeus = typeof req.query['1a'] != 'undefined';
	// version
	var v = req.params[0] + '.' + req.params[1];
	if (req.params[2]) v += 'BETA-' + req.params[2];
	v += (amadeus && req.params[0] == 1 && req.params[1] < 7) ? '-' : '.';
	v += req.params[3];
	if (req.params[4]) v += req.params[4];
	if (req.params[5]) v += '-beta.' + req.params[5];
	utils.getFwk(
		req,
		res,
		amadeus ? 'aria-templates-' : 'ariatemplates-', // prefix
		v,
		ONE_YEAR
	);
});

/*
 * Shortcut to the generic getter for the latest version (same params)
 */
app.get('/atlatest.js', function (req, res) {
	var amadeus = typeof req.query['1a'] != 'undefined';
	res.setHeader('Last-Modified', utils.config.LATEST_TS);
	utils.getFwk(
		req,
		res,
		amadeus ? 'aria-templates-' : 'ariatemplates-', // prefix
		utils.config.LATEST[0] + '.' + utils.config.LATEST[1] + '.' + utils.config.LATEST.substr(2), // version
		ONE_YEAR
	);
})

/*
 * URL to use to reload the config without restarting the server
 */
app.get('/updateconfig', function (req, res) {
	if (req.ip == '127.0.0.1') {
		utils.loadConfig(CONF_FILE, function() {
			console.log('Configuration reloaded');
			res.sendStatus(200);
		});
	} else {
		console.log('Remote attempt at updating the configuration from ' + req.ip);
		res.sendStatus(404);
	}
});

/*
 * Returns the oldest/latest fwk versions as JSON
 */
app.get('/versions', function (req, res) {
	var versions = {
		'min' : utils.config.OLDEST,
		'max' : utils.config.LATEST,
		'list' : utils.config.VERSIONS
	};
	res.type('application/json');
	res.header('Cache-Control', 'public, max-age=' + ONE_YEAR);
	res.setHeader('Last-Modified', utils.config.LATEST_TS);
	res.jsonp(versions);
});

app.get('/', function (req, res) {
	res.header('Cache-Control', 'public, max-age=' + ONE_YEAR);
	res.setHeader('Last-Modified', utils.config.LATEST_TS);
	res.sendFile(__dirname + '/index.html');
});

/*
 * Anything that hasn't been routed at this point is a 404
 */
app.get('*', function(req, res) {
	res.status(404).sendFile(__dirname + '/static/404.html');
});

utils.loadConfig(CONF_FILE, function() {
	app.listen(utils.config.file.SERVER_PORT);
	console.log('CDN started on port ' + utils.config.file.SERVER_PORT);
});
