var config = require('./config');

exports.createNetworkManager = function() {
	var OS = config.platform;

	var PLATFORM = config.updater.get('platform');
	var NetworkManager = null;

	try {
		NetworkManager = require('./network/' + OS + '/' + PLATFORM).NetworkManager;
		var nm = new NetworkManager();
		nm.os = OS;
		nm.platform = PLATFORM;
		return nm;
	} catch(e) {
		throw new Error("Cannot load network manager for " + OS + "/" + PLATFORM + ": " + e.message);
	}
}