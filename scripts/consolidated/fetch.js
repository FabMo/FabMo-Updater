var request = require('request')
var fs = require('fs')

var MANIFEST_URL = 'http://fabmo.github.io/manifest/packages-rc.json'
var engineURL = null;
var updaterURL = null;
//var filesDownloaded = 0;

request(MANIFEST_URL, { json: true }, function(err, res, body) {
	packages = body['packages']
	for(var i=0; i<packages.length; i++) {
		if(packages[i]['product'] === 'FabMo-Updater') {
			updaterURL = packages[i]['url']
		}
		if(packages[i]['product'] === 'FabMo-Engine') {
			engineURL = packages[i]['url']
		}
	}

	console.log("Downloading engine fmp")
	request(updaterURL)
		.pipe(fs.createWriteStream('dl/updater.fmp'))
		.on('finish', function() {
//			filesDownloaded += 1;
			console.log("Finished downloading updater.")
//			if(filesDownloaded === 2) {
//				buildPackage()
//			}

		});

	console.log("Downloading updater fmp")
	request(engineURL)
		.pipe(fs.createWriteStream('dl/engine.fmp'))
		.on('finish', function() {
//			filesDownloaded += 1;
			console.log("Finished downloading engine.")
//			if(filesDownloaded === 2) {
//				buildPackage();
//			}
		});


});

