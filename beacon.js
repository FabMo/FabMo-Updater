var config = require('./config')
var updater = require('./updater')
var engine = require('./engine')
var hooks = require('./hooks')
var log = require('./log').logger('beacon')

var request = require('request')
var Q = require('q');

// Return a promise that fulfills with the beacon message
function createMessage() {
	var msg = {
		id : config.updater.get('id'),
		name : config.updater.get('name'),
		os : config.platform,
		platform : config.updater.get('platform'),
		os_version : config.updater.get('os_version')
	}

	deferred = Q.defer()
	try {
		engine.getVersion(function(err, version) {
			msg.engine_version = version
			updater.getVersion(function(err, version) {
				msg.updater_version = version
				deferred.resolve(msg);
			})
		})		
	} catch(e) {
		deferred.reject(e)
	}
	return deferred.promise
}

function report() {
	var url = config.updater.get('beacon_url');
	deferred = Q.defer()
	if(url) {
		return createMessage()
		.then(function(message) {
			request({url : url, json : true,body : message}, function(err, body) {
				if(err) {
					log.warn('Could not send message to beacon server: ' + err);
				} else {
					log.info('Post to beacon server successful.')
				}
				deferred.resolve();
			});
		})		
	} else {
		deferred.resolve();
	}

	return deferred.promise()
}

exports.createMessage = createMessage;
exports.report = report;