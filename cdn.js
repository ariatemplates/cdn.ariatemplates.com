/* DISCLAIMER
 * 
 * Parts of the code in this file dealing with version numbers
 * take the assumption that they're formatted as d.d.[d]d and
 * will NOT work if the major/medium has more than one digit.
 *
 */

var express = require('express');
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
		res.send(200);
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
app.configure(function() {
	app.use(express.compress()); // gzip
	app.use(allowCrossDomain);
	app.use(lowerCaseQuery);
	app.use('/aria', express.static(__dirname + '/aria', {maxAge: ONE_YEAR_MS}));
	app.use('/dev', express.static(__dirname + '/dev', {maxAge: ONE_YEAR_MS}));
	app.use('/css', express.static(__dirname + '/css', {maxAge: ONE_YEAR_MS}));
	app.use(express.static(__dirname + '/static', {maxAge: ONE_YEAR_MS}));
	app.use('/aria', express.directory(__dirname + '/aria', {icons:true}));
	app.use('/dev', express.directory(__dirname + '/dev', {icons:true}));
	app.use('/css', express.directory(__dirname + '/css', {icons:true}));
});

/*
 * Open-source build getter
 *
 * /ariatemplates-<x.y.z>.js[?<params>]
 *
 * params:
 * - dev  (dev build, default to minified)
 * - skin (serve skin, default does not)
 */
app.get(/^\/ariatemplates-(\d\.\d\.\d{1,2})\.js/, function (req, res) {
	utils.getFwk(req, res, 'ariatemplates-', req.params[0], ONE_YEAR);
});

/*
 * Amadeus build getter
 *
 * /aria-tamplates-<x.y-z[p]>.js[?<params>]
 *
 * params:
 * - dev  (dev build, default to minified)
 * - skin (serve skin, default does not)
 */
app.get(/^\/aria-templates-(\d\.\d\-\d{1,2}[a-zA-Z]?)\.js/, function (req, res) {
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
app.get(/^\/at(\d)[\-\.]?(\d)[\-\.]?(\d{1,2})([a-zA-Z]?)\.js/, function (req, res) {
	var amadeus = typeof req.query['1a'] != 'undefined';
	utils.getFwk(
		req,
		res,
		amadeus ? 'aria-templates-' : 'ariatemplates-', // prefix
		req.params[0] + '.' + req.params[1] + (amadeus ? '-' : '.') + req.params[2] + req.params[3], // version
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
		utils.config.LATEST[0] + '.' + utils.config.LATEST[1] + (amadeus ? '-' : '.') + utils.config.LATEST.substr(2), // version
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
			res.send(200);
		});
	} else {
		console.log('Remote attempt at updating the configuration from ' + req.ip);
		res.send(404);
	}
});

/*
 * Returns the oldest/latest fwk versions as JSON
 */
app.get('/versions', function (req, res) {
	var versions = {
		'min' : utils.config.OLDEST,
		'max' : utils.config.LATEST
	};
	res.type('application/json');
	res.header('Cache-Control', 'public, max-age=' + ONE_YEAR);
	res.setHeader('Last-Modified', utils.config.LATEST_TS);
	res.jsonp(versions);
});

app.get('/', function (req, res) {
	res.header('Cache-Control', 'public, max-age=' + ONE_YEAR);
	res.setHeader('Last-Modified', utils.config.LATEST_TS);
	res.sendfile(__dirname + '/index.html');
});

/*
 * Anything that hasn't been routed at this point is a 404
 */
app.get('*', function(req, res) {
	res.status(404).sendfile(__dirname + '/static/404.html');
});

utils.loadConfig(CONF_FILE, function() {
	app.listen(utils.config.file.SERVER_PORT);
	console.log('CDN started on port ' + utils.config.file.SERVER_PORT);
});
