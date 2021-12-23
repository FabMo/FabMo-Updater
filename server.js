/*
 * server.js
 * 
 * Application entry point.
 */

var log = require('./log').logger('server');
var updater = require('./updater');

updater.start(function(err, data) {
	if(err) {
		log.error(err);
	} else {
		log.info("FabMo-Updater started.")
	}
});

exports.updater = updater;
