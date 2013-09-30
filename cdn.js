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

app.configure(function() {
	app.use(allowCrossDomain);
	app.use(lowerCaseQuery);
	app.use('/aria', express.static(__dirname + '/aria'));
	app.use('/dev', express.static(__dirname + '/dev'));
	app.use(express.static(__dirname + '/static'));
});

/*
 * Default landing page
 */
app.get('/', function (req, res) {
	res.sendfile('index.html');
})

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
	getFwk(res, 'ariatemplates-', req.params[0], req.query.dev != undefined, req.query.skin != undefined);
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
	getFwk(res, 'aria-templates-', req.params[0], req.query.dev != undefined, req.query.skin != undefined);
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
		res, // res
		amadeus ? 'aria-templates-' : 'ariatemplates-', // suffix
		req.params[0] + '.' + req.params[1] + (amadeus ? '-' : '.') + req.params[2] + req.params[3], // version
		req.query.dev != undefined, // dev?
		req.query.skin != undefined // skin?
	);
});

/*
 * Shortcut to the generic getter for the latest version (same params)
 */
app.get('/atlatest.js', function (req, res) {
	var amadeus = req.query['1a'] != undefined;
	getFwk(
		res, // res
		amadeus ? 'aria-templates-' : 'ariatemplates-', // suffix
		config.LATEST.substr(0,1) + '.' + config.LATEST.substr(1,1) + (amadeus ? '-' : '.') + config.LATEST.substr(2), // version
		req.query.dev != undefined, // dev?
		req.query.skin != undefined // skin?
	);
})

/*
 * Retrieve the content of the bootstrap file from disk or cache
 */
var getFwk = function (res, suffix, version, dev, skin) {
	var cache = dev ? fwkdevcache : fwkcache;
	var filename = suffix + version + '.js';

	if (cache[filename]) {
		debugger
		console.log('using cache for ' + filename);
		sendFwk(res, cache[filename], version, dev, skin)
	} else {
		var fwkfile = (dev ? config.PATH_TO_DEV_FWK + version + '/aria/' : config.PATH_TO_MIN_FWK) + filename;
		console.log('looking for ' + fwkfile);
		fs.exists(fwkfile, function (exists) {
			if (exists) {
				fs.readFile(fwkfile, function (err, data) {
					if (err) {
						console.log('an error occured trying to read ' + fwkfile);
						throw err;
					}
					else {
						cache[filename] = data;
						sendFwk(res, data, version, dev, skin);
					}
				});
			}
			else {
				console.log('file ' + fwkfile + ' not found');
				res.send(404);
			}
		});		
	}
};

/*
 * Send the content of the bootstrap along with the necessary JS lines to add skin, change dev url, update transport, update the root map.
 */
var sendFwk = function (res, content, version, dev, skin) {
	var l = content.length;
	var url = config.CDN_URL + (dev ? '/dev/' + version : '');

	// prepare buffers
	if (dev) {
		console.log('using dev')
		var bufDev = new Buffer('document.write("<script>___baseURL___=\'' + url + '/\'</script>");', 'utf-8');
		l += bufDev.length;
	}
	if (skin) {
		console.log('using skin')
		var bufSkin = new Buffer('document.write(\'<script src="'+ url + '/aria/css/atskin-' + version + '.js"><\/script>\');', 'utf-8');
		l += bufSkin.length;
	}
	var bufFix = new Buffer('document.write("<script>aria.core.IO.updateTransports({\'crossDomain\' : \'aria.core.transport.XHR\'});aria.core.DownloadMgr.updateRootMap({\'aria\' : \'' + url + '/\',	\'*\' : \'\'});</script>");', 'utf-8');
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
		console.log('Configuration reloaded');
		res.send(200);
	} else {
		console.log('Remote attempt at updating the configuration from ' + req.ip);
		res.send(404);
	}
});


app.listen(SERVER_PORT);
console.log('CDN started on port ' + SERVER_PORT);