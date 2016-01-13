var config = require('./config');

exports.createNetworkManager = function() {
	var OS = config.platform;

	var PLATFORM = config.updater.get('platform');
	var NetworkManager = null;

	try {
		NetworkManager = require('./network/' + OS + '/' + PLATFORM).NetworkManager;
		return new NetworkManager();
	} catch(e) {
		throw new Error("Cannot load network manager for " + OS + "/" + PLATFORM + ": " + e.message);
	}
}
