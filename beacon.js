var config = require('./config')
var engine = require('./engine')
var hooks = require('./hooks')
var log = require('./log').logger('beacon')

var request = require('request')
var Q = require('q');

var Beacon = function(options) {
	var options = options || {}
	this.url = options.url 
	if(!this.url) { throw new Error('Beacon needs a URL.'); }
	this.interval = options.interval || 1*60*60*1000;
	this._timer = null;
	this.running = false;
}

function setURL(url) { this.set('url', url); }
function setInterval(interval) { this.set('interval', interval); }

// Changing any of the options provokes a new beacon report
Beacon.prototype.set = function(key, value) {
	var wasRunning = this.running;
	this.stop();
	this[key] = value;
	if(wasRunning) { this.run(); }	
}

// Start reporting with the beacon
Beacon.prototype.start = function(reason) {
	this.running = true;
	this.run(reason);
}

// Function called at intervals to report to the beacon
Beacon.prototype.run = function(reason) {
	this.report(reason)
		.catch(function(err) {
			log.warn('Could not send a beacon message: ' + err);
		})
		.finally(function() {
			this._timer = setTimeout(this.run.bind(this), this.interval);
		}.bind(this));
}

// Stops further beacon reports. Reports can be restarted with start()
Beacon.prototype.stop = function() {
	this.running = false;
	if(this._timer) {
		clearTimeout(this._timer);
	}
}

Beacon.prototype.once = function(reason) {
	var wasRunning = this.running;
	this.stop();
	this.start(reason);
}

// Return a promise that fulfills with the beacon message to be sent
Beacon.prototype.createMessage = function(reason) {
	var msg = {
		id : config.updater.get('id'),
		name : config.updater.get('name'),
		os : config.platform,
		platform : config.updater.get('platform'),
		os_version : config.updater.get('os_version'),
		reason : reason || 'interval',
	}

	deferred = Q.defer()
	try {
		engine.getVersion(function(err, version) {
			msg.engine_version = version
			require('./updater').getVersion(function(err, version) {
				msg.updater_version = version
				deferred.resolve(msg);
			})
		})		
	} catch(e) {
		deferred.reject(e)
	}
	return deferred.promise
}

// Return a promise that resolves when the beacon server has been contacted
Beacon.prototype.report = function(reason) {
	deferred = Q.defer()
	if(this.url) {
		log.info('Sending beacon report (' + (reason || 'interval') + ')');
		return this.createMessage(reason)
		.then(function(message) {
			//log.debug(JSON.stringify(message))
			request({uri : this.url, json : true,body : message, method : 'POST'}, function(err, response, body) {
				if(err) {
					log.warn('Could not send message to beacon server: ' + err);
					deferred.reject(err);
				} else if(response.statusCode != 200) {
					var err = new Error("Beacon server responded with status code " + response.statusCode);
					log.warn(err);
					deferred.reject(err);
				} else {
					//log.debug('Beacon response code: ' + response.statusCode)
					//log.debug('Beacon response body: ' + body);
					log.info('Post to beacon server successful.');
					deferred.resolve();
				}
			});
		}.bind(this)).catch(function(err){
			log.error(err)
			deferred.reject(err);
		}.bind(this))
	} else {
		deferred.resolve();
	}

	return deferred.promise()
}

module.exports = Beacon