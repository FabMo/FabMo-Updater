fmp = require('./fmp');

fmp.loadManifest('./example/manifest.json')
	.then(function(manifest) {
		console.log(manifest);
		return fmp.executeUpdate(manifest)
	}).catch(function(e) {
		console.error(e);
	});

