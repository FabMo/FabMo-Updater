fmp = require('./fmp');

fmp.loadManifest('./example/manifest.json')
	.then(function(manifest) {
		return fmp.executeUpdate(manifest)
			.catch(function(e) {
				console.error(e);
			});
	}).catch(function(e) {
		console.error(e);
	});

