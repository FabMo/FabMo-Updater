/*
 * fetch.js
 *
 * This module fetches the latest engine/updater packages specifed in the package manifest
 * so that the consolidated build Makefile can turn them into a consolidated .fmp
 */

var request = require('request')
var fs = require('fs')

var engineURL = null;
var updaterURL = null;

request(process.argv[2], { json: true }, function(err, res, body) {
	packages = body['packages']
	for(var i=0; i<packages.length; i++) {
		if(packages[i]['product'] === 'FabMo-Updater') {
			updaterURL = packages[i]['url']
			updaterVersion = packages[i]['version']
		}
		if(packages[i]['product'] === 'FabMo-Engine') {
			engineURL = packages[i]['url']
			engineVersion = packages[i]['version']
		}
	}

	// Write to dl/version which is a file that contains the filename for 
	// the consolidated fmp (The makefile will use this to name the build product)
	fs.writeFileSync('dl/version', 'fabmo-consolidated-engine-' + engineVersion + '-updater-' + updaterVersion + '.fmp')
	console.log("Downloading updater fmp from " + updaterURL)

	request(updaterURL)
		.pipe(fs.createWriteStream('dl/updater.fmp'))
		.on('finish', function() {
			console.log("Finished downloading updater.")
		});

	console.log("Downloading engine fmp from " + engineURL)
	request(engineURL)
		.pipe(fs.createWriteStream('dl/engine.fmp'))
		.on('finish', function() {
			console.log("Finished downloading engine.")
		});


});

