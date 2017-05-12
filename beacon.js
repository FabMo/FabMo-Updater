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
	this.consent_for_beacon = "false";
	this.localAddresses = []
}

function setURL(url) { this.set('url', url); }
function setInterval(interval) { this.set('interval', interval); }

// Changing any of the options provokes a new beacon report
Beacon.prototype.set = function(key, value) {
	this[key] = value;
	var wasRunning = this.running;
	this.stop();
	if(wasRunning) { this.run('config'); }	
}

// Start reporting with the beacon
Beacon.prototype.start = function(reason) {
	this.running = true;
	this.run(reason);
}

// Function called at intervals to report to the beacon
Beacon.prototype.run = function(reason) {
	if (this.consent_for_beacon === "true"){
		this.report(reason)
			.catch(function(err) {
				log.warn('Could not send a beacon message: ' + err);
			})
			.finally(function() {
				this._timer = setTimeout(this.run.bind(this), this.interval);
			}.bind(this));
	} else {
		log.warn('Beacon is not enabled');
	}
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
		local_ips : []
	}

	this.localAddresses.forEach(function(addr, idx) {
		msg.local_ips.push({'address':addr});
	});

	var deferred = Q.defer()
	try {
		engine.getVersion(function(err, version) {
			if(err) {
				msg.engine_version = {};
				log.warn("Engine version could not be determined");
				log.warn(err);
			} else {
				msg.engine_version = version;		
			}
			require('./updater').getVersion(function(err, version) {
				if(err) {
					msg.updater_version = {};
					log.warn("Updater version could not be determined");
					log.warn(err);
				} else {
					msg.updater_version = version					
				}
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
		log.info('Sending beacon report (' + (reason || 'interval') + ') to ' + this.url);
		return this.createMessage(reason)
		.then(function(message) {
			//console.log(message)
			request({uri : this.url, json : true,body : message, method : 'POST'}, function(err, response, body) {
				if(err) {
					log.warn('Could not send message to beacon server: ' + err);
					deferred.reject(err);
				} else if(response.statusCode != 200) {
					if(response.statusCode === 301) {
						if(response.headers.location) {
							log.warn('Beacon URL has changed.  Updating configuration to new URL: ' + response.headers.location)
							config.updater.set('beacon_url', response.headers.location);
							deferred.resolve();
							return;
						}
					}
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

Beacon.prototype.setLocalAddresses = function(localAddresses) {
	this.localAddresses = localAddresses;
}

module.exports = Beacon
