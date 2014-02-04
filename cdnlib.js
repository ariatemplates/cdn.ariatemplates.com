var fs = require('fs');
var glob = require('glob');

var fwkdevcache = {}, fwkcache = {}, config = {};

/*
 * Retrieve the content of the bootstrap file from disk or cache
 */
var getFwk = function (req, res, prefix, version, expire) {
	var dev = typeof req.query.dev != 'undefined';

	var cache = dev ? fwkdevcache : fwkcache;
	var filename = prefix + version + '.js';

	if (cache[filename]) {
		// console.log('using cache for ' + filename);
		sendFwk(req, res, cache[filename], version, dev, expire)
	} else {
		var fwkfile = (dev ? config.file.path.DEV_FWK + version + '/aria/' : config.file.path.MIN_FWK) + filename;
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
						sendFwk(req, res, data, version, dev, expire);
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
var sendFwk = function (req, res, content, version, dev, expire) {
	var skin = null;
	if (typeof req.query.skin != 'undefined') skin = 'atskin';
	if (typeof req.query.flatskin != 'undefined') {
		var v = version.split(/[\.\-]/).map(Number);
		if (v[1] < 4 || v[1] == 4 && v[2] < 12)
			skin = 'atskin'
		else
			skin = 'atflatskin';
	}

	var root = '/';
	if (req.query.root) {
		root = encodeURI(req.query.root);
		if (root[root.length-1] != '/') root += '/';
	}

	var l = content.length;
	var url = config.file.path.CDN_URL;
	var nocors = /MSIE [89]\./.test(req.headers['user-agent']) || (typeof req.query.nocors != 'undefined');

	// prepare buffers
	if (nocors) {
		var bufNocors = new Buffer('document.write(\'<script src="http://jpillora.com/xdomain/dist/0.5/xdomain.min.js" slave="' + url + 'proxy.html"></script>\');\n');
		l += bufNocors.length;
	}
	if (dev) {
		// 1A build uses rootFolderPath to fetch its primary dependencies so we temporarily set it to the CDN's address
		// OS build only checks that rootFolderPath is set (otherwise it creates it)
		url += 'dev/' + version + '/';
		var bufDev = new Buffer('if (typeof Aria=="undefined") Aria={};\nAria.rootFolderPath="' + url + '";\n', 'utf-8');
		l += bufDev.length;
	}
	if (skin) {
		// var skinpath = (skin.length > 0 ? 'css/' + skin : 'aria/css/atskin') + '-'; // old code to load old skins - doesn't work because of imgs - TBC
		var bufSkin = new Buffer('document.write(\'<script src="'+ url + 'aria/css/' + skin + '-' + version + '.js"><\/script>\');', 'utf-8');
		l += bufSkin.length;
	}
	// updateRootMap redirects aria.* packages to the CDN and rootFolderPath is set to whatever was provided or / by default
	var bufFix = new Buffer('document.write("<script>aria.core.IO.useXHRHeader=false;aria.core.IO.updateTransports({\'crossDomain\':\'aria.core.transport.XHR\'});aria.core.DownloadMgr.updateRootMap({\'aria\':\'' + url + '\'});Aria.rootFolderPath=\'' + root + '\';</script>");', 'utf-8');
	l += bufFix.length;

	// fill response
	var r = new Buffer(l), offset = 0;

	if (nocors) {
		bufNocors.copy(r, offset);
		offset += bufNocors.length;
	}
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
	res.header('Cache-Control', 'public, max-age=' + expire);

	res.send(r);
}

/*
 * Reloads a configuration file into the configuration object, sets timestamp and determine OLDEST/LATEST versions
 */
var loadConfig = function(file, reload, cb) {
	var timestamp;
	if (reload) {
		delete require.cache[require.resolve(file)];
		timestamp = (new Date()).toUTCString();
	}
	else {
		timestamp = fs.statSync(file).mtime.toUTCString();
	}
	config.file = require(file);
	// make sure each path in the array has a trailing /
	var paths = config.file.path;
	for (var p in paths) {
		if (paths[p].substr(-1) != '/') paths[p] += '/';
	}
	config.LATEST_TS = timestamp;
	// listing files from the OS version to avoid patches
	glob(__dirname + '/aria/ariatemplates\-*.js', null, function (er, files) {
		var versions = files.map(function(filename) {
			var v = /\/ariatemplates-(\d)\.(\d)\.(\d{1,2})\.js$/.exec(filename);
			return v[1] + v[2] + (0 + v[3]).slice(-2); // ariatemplates-a.b.c.js > ab[0]c
		});
		var sortedVersions = versions.sort(); // alphabetical sort will do fine
		config.OLDEST = sortedVersions[0].replace(/0(\d)$/, '$1');
		config.LATEST = sortedVersions[sortedVersions.length - 1];
		cb.call(this);
	})
};

module.exports.config = config;
module.exports.getFwk = getFwk;
module.exports.loadConfig = loadConfig;
