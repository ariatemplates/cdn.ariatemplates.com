var SERVER_PORT = 5001;

var config = require('./cdn.conf');
var express = require('express');
var fs = require('fs');

var app = express();

var fwkdevcache = {}, fwkcache = {};

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
 * Makes sur each path in the array has a trailing /
 */
var normalizePaths = function(paths) {
	for (var p in paths) {
		if (paths[p][paths[p].length-1] != '/') paths[p] += '/';
	}
}

/*
 * App environments configuration
 */
app.configure(function() {
	app.use(allowCrossDomain);
	app.use(lowerCaseQuery);
	app.use('/aria', express.static(__dirname + '/aria'));
	app.use('/dev', express.static(__dirname + '/dev'));
	app.use(express.static(__dirname + '/static'));
	normalizePaths(config.path);
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
	getFwk(req, res, 'ariatemplates-', req.params[0]);
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
	getFwk(req, res, 'aria-templates-', req.params[0]);
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
	var amadeus = req.query['1a'] != undefined;
	getFwk(
		req,
		res,
		amadeus ? 'aria-templates-' : 'ariatemplates-', // prefix
		req.params[0] + '.' + req.params[1] + (amadeus ? '-' : '.') + req.params[2] + req.params[3] // version
	);
});

/*
 * Shortcut to the generic getter for the latest version (same params)
 */
app.get('/atlatest.js', function (req, res) {
	var amadeus = req.query['1a'] != undefined;
	getFwk(
		req,
		res,
		amadeus ? 'aria-templates-' : 'ariatemplates-', // prefix
		config.LATEST.substr(0,1) + '.' + config.LATEST.substr(1,1) + (amadeus ? '-' : '.') + config.LATEST.substr(2) // version
	);
})

/*
 * Retrieve the content of the bootstrap file from disk or cache
 */
var getFwk = function (req, res, prefix, version) {
	var dev = req.query.dev != undefined;
	var skin = req.query.skin != undefined;
	var root = '/';

	if (req.query.root) {
		root = escape(req.query.root);
		if (root[root.length-1] != '/') root += '/';
	}

	var cache = dev ? fwkdevcache : fwkcache;
	var filename = prefix + version + '.js';

	if (cache[filename]) {
		// console.log('using cache for ' + filename);
		sendFwk(res, cache[filename], version, dev, skin, root)
	} else {
		var fwkfile = (dev ? config.path.DEV_FWK + version + '/aria/' : config.path.MIN_FWK) + filename;
		// console.log('looking for ' + fwkfile);
		fs.exists(fwkfile, function (exists) {
			if (exists) {
				fs.readFile(fwkfile, function (err, data) {
					if (err) {
						console.log('an error occured trying to read ' + fwkfile);
						throw err;
					}
					else {
						cache[filename] = data;
						sendFwk(res, data, version, dev, skin, root);
					}
				});
			}
			else {
				console.log('file ' + fwkfile + ' not found');
				res.status(404).sendfile(__dirname + '/static/404.html');
			}
		});		
	}
};

/*
 * Send the content of the bootstrap along with the necessary JS lines to add skin, change dev url, update transport, update the root map.
 */
var sendFwk = function (res, content, version, dev, skin, root) {
	var l = content.length;
	var url = config.path.CDN_URL;

	// prepare buffers
	if (dev) {
		// 1A build uses rootFolderPath to fetch its primary dependencies so we temporarily set it to the CDN's address
		// OS build only checks that rootFolderPath is set (otherwise it creates it)
		url = config.path.CDN_URL + 'dev/' + version + '/';
		var bufDev = new Buffer('if (typeof Aria=="undefined") Aria={};\nAria.rootFolderPath="' + url + '";\n', 'utf-8');
		l += bufDev.length;
	}
	if (skin) {
		var bufSkin = new Buffer('document.write(\'<script src="'+ url + 'aria/css/atskin-' + version + '.js"><\/script>\');', 'utf-8');
		l += bufSkin.length;
	}
	// updateRootMap redirects aria.* packages to the CDN and rootFolderPath is set to whatever was provided or / by default
	var bufFix = new Buffer('document.write("<script>aria.core.IO.updateTransports({\'crossDomain\':\'aria.core.transport.XHR\'});aria.core.DownloadMgr.updateRootMap({\'aria\':\'' + url + '\'});Aria.rootFolderPath=\'' + root + '\';</script>");', 'utf-8');
	l += bufFix.length;

	var r = new Buffer(l), offset = 0;

	// fill response
	if (dev) {
		bufDev.copy(r, offset);
		offset += bufDev.length;
	}
	content.copy(r, offset);
	offset += content.length;
	if (skin) {
		bufSkin.copy(r, offset);
		offset += bufSkin.length;
	}
	bufFix.copy(r, offset);

	res.header('Content-Type', 'application/javascript');
	res.send(r);
}

/*
 * URL to use to reload the config without restarting the server
 */
app.get('/updateconfig', function (req, res) {
	if (req.ip == '127.0.0.1') {
		delete require.cache[require.resolve('./cdn.conf')];
		config = require('./cdn.conf');
		normalizePaths(config.path);
		console.log('Configuration reloaded');
		res.send(200);
	} else {
		console.log('Remote attempt at updating the configuration from ' + req.ip);
		res.send(404);
	}
});

/*
 * Anything that hasn't been routed at this point is a 404
 */
app.get('*', function(req, res) {
	res.status(404).sendfile(__dirname + '/static/404.html');
});


app.listen(SERVER_PORT);
console.log('CDN started on port ' + SERVER_PORT);