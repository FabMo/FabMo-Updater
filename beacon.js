var config = require('./config')
var updater = require('./updater')
var engine = require('./engine')

var request = require('request')
var Q = require('q');

// Return a promise that fulfills with the beacon message
function createMessage() {
	var msg = {
		id : config.updater.get('id'),
		name : config.updater.get('name'),
		os : config.platform,
		platform : config.updater.get('platform'),
	}

	deferred = Q.defer()
	try {
		engine.getVersion(function(err, version) {
			msg.engine_version = version
			updater.getVersion(function(err, version) {
				msg.updater_version = version
				deferred.resolve(msg)
			})
		})		
	} catch(e) {
		deferred.reject(e)
	}

	return deferred.promise
}

exports.createMessage = createMessage;