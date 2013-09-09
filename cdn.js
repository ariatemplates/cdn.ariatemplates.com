var SERVER_PORT = 5001;
var PATH_TO_MIN_FWK = __dirname + '/aria/';
var CDN_URL = 'http://cdn.ariatemplates.com';

var express = require('express');
var fs = require('fs');

var app = express();

var fwkcache = {};

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
    app.use(express.static(__dirname + '/public'));
});

// TODO: handle min|dev - dev files cannot obviously reside in the same folder

// URL pattern matches /at<version>.js[?<params>]
// with params: 1a (Amadeus package, default to OS one), dev (dev build, default to minified), skin (serve skin, default does not)

app.get(/^\/at(\d)[\-\.]?(\d)[\-\.]?(\d{1,2})([a-zA-Z]?).js/, function (req, res) {
	var amadeus = req.query['1a'] != undefined;
	var skin = req.query.skin != undefined;

	var version = req.params[0] + '.' + req.params[1];
	version += amadeus ? '-' : '.';
	version += req.params[2] + req.params[3]; // shouldn't be no patched OS version though

	var filename = (amadeus ? 'aria-templates-' : 'ariatemplates-')	+ version + '.js';

	var result = '';
	if (fwkcache[filename]) {
		console.log('using cache for ' + filename);
		sendFwk(res, fwkcache[filename], version, skin)
	} else {
		console.log('looking for ' + filename);
		fs.exists(PATH_TO_MIN_FWK + filename, function (exists) {
			if (exists) {
				fs.readFile(PATH_TO_MIN_FWK + filename, function (err, data) {
					if (err) {
						console.log('an error occured trying to read ' + filename);
						throw err;
					}
					else {
						fwkcache[filename] = data;
						sendFwk(res, data, version, skin);
					}
				});
			}
			else {
				console.log('file ' + PATH_TO_MIN_FWK + filename + ' not found');
				res.send(404);
			}
		});		
	}
});

var sendFwk = function (res, content, version, skin) {
	var l = content.length;
	if (skin) {
		console.log('using skin')
		var bufSkin = new Buffer('document.write(\'<script src="'+ CDN_URL + '/aria/css/atskin-' + version + '.js"><\/script>\');', 'utf-8');
		l += bufSkin.length;
	}
	var bufFix = new Buffer('document.write("<script>aria.core.IO.updateTransports({\'crossDomain\' : \'aria.core.transport.XHR\'});aria.core.DownloadMgr.updateRootMap({\'aria\' : \'' + CDN_URL + '/\',	\'*\' : \'\'});</script>");', 'utf-8');
	l += bufFix.length;
	var r = new Buffer(l);
	
	content.copy(r);
	if (skin) {
		bufSkin.copy(r, content.length);
		bufFix.copy(r, content.length + bufSkin.length);
	} else {
		bufFix.copy(r, content.length);
	}

	res.send(r);
}

app.listen(SERVER_PORT);
console.log('CDN started on port ' + SERVER_PORT);