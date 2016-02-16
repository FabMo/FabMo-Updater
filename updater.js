var restify = require('restify');
var async = require('async');
var process = require('process');
var PLATFORM = process.platform;
var log = require('./log').logger('updater');
var config = require('./config');
var util = require('./util');
var socketio = require('socket.io')
var events = require('events');
var util = require('util');
var hooks = require('./hooks');
var network = require('./network');
var fs = require('fs');
var GenericNetworkManager = require('./network/manager').NetworkManager;
var doshell = require('./util').doshell;
var uuid = require('node-uuid');

// Maps unique identifiers to states which correspond to whether or not operations are complete, and whether they passed or failed.
var TASK_TIMEOUT = 360000;

var Updater = function() {
    this.version = null;
    this.status = {
        'state' : 'idle',
        'online' : false,
        'task' : null
    }
    this.tasks = {};
    this.networkManager = network.Generic;
    events.EventEmitter.call(this);
};
util.inherits(Updater, events.EventEmitter);

Updater.prototype.startTask = function() {
    var id = uuid.v1();
    this.tasks[id] = 'pending';
    log.info('Starting task: ' + id);
    this.status.task = id;
    return id;
}

Updater.prototype.finishTask = function(key, state) {
    console.log(this.tasks);
    if(key in this.tasks) {
        this.tasks[key] = state;
        log.info('Finishing task ' + key + ' with a state of ' + state);
        return setTimeout(function() {
            log.info('Expiring task ' + key);
            delete this.tasks[key];
        }.bind(this), TASK_TIMEOUT);
    }
    log.warn('Cannot finish task ' + key + ': No such task.');
}

Updater.prototype.passTask = function(key) { this.finishTask(key, 'success'); }
Updater.prototype.failTask = function(key) { this.finishTask(key, 'failed'); }

Updater.prototype.setState = function(state) {
    this.status.state = state;
    this.emit('status',this.status);
}

Updater.prototype.stop = function(callback) {
    callback(null);
};

Updater.prototype.updateEngine = function(version, callback) {
    if(this.status.state != 'idle') {
        callback(new Error("Cannot update the engine when in the " + updater.status.state + " state."));
    } else {
        hooks.updateEngine(version, callback);
    }
}

Updater.prototype.installEngine = function(version, callback) {
    if(this.status.state != 'idle') {
        callback(new Error("Cannot install the engine when in the " + updater.status.state + " state."));
    } else {
        hooks.installEngine(version, callback);
    }
}

Updater.prototype.getVersions = function(callback) {
    hooks.getVersions(callback);
}

Updater.prototype.updateFirmware = function(callback) {
    if(this.status.state != 'idle') {
        callback(new Error("Cannot update the firmware when in the " + updater.status.state + " state."));
    } else {
    	hooks.updateFirmware(config.updater.get('firmware_file'), callback);
    }
}

function UpdaterConfigFirstTime(callback) {
    log.info('Configuring for the first time...');
    switch(config.platform) {
        case 'linux':
		var confFile = '/etc/wpa_supplicant/wpa_supplicant.conf';
		try {
			var text = fs.readFileSync(confFile, 'utf8');
			if(text.match(/device_name=Edison/)) {
				log.info("Intel Edison Platform Detected");
				var id = '';
				for(var i=0; i<8; i++) {
					id += (Math.floor(Math.random()*15)).toString(16);
				}
				log.info("Random ID Generated: " + id);
				var hostname = 'FabMo-' + id;
				config.updater.set('platform', 'edison');
				config.updater.set('name', hostname);
				callback();
			}
		} catch(e) {}
        break;

        case 'darwin':
            log.info('OSX Detected.');
            config.updater.set('server_port',9877);
            config.updater.set('engine_server_port',9876);
            callback();
        break;
        default:
            config.updater.set('server_port',9877);
            config.updater.set('engine_server_port',9876);
            callback();
        break;
    }
};
Updater.prototype.start = function(callback) {

    async.series([
       function setup_application(callback) {
            log.info('Checking updater data directory tree...');
            config.createDataDirectories(callback);
        },
        function configure(callback) {
            log.info("Loading configuration...");
            config.configureUpdater(callback);
        },

        function first_time_configure(callback) {
            if(!config.updater.userConfigLoaded) {
                UpdaterConfigFirstTime(callback);
            } else {
                callback();
            }
        },

        function setup_network(callback) {
            try {
                this.networkManager = network.createNetworkManager();
            } catch(e) {
                log.warn(e);
                this.networkManager = new GenericNetworkManager();
                return callback(null);
            }
            log.info("Setting up the network...");
            try {
                this.networkManager.init();
                log.info("Network manager started.")
            } catch(e) {
                log.error(e);
                log.error('Problem starting network manager:' + e);
            }
            callback(null);
        }.bind(this),

        function start_server(callback) {
            log.info("Setting up the webserver...");
            var server = restify.createServer({name:"FabMo Updater"});
            this.server = server;

            // Allow JSON over Cross-origin resource sharing 
            log.info("Configuring cross-origin requests...");
            server.use(
                function crossOrigin(req,res,next){
                    res.header("Access-Control-Allow-Origin", "*");
                    res.header("Access-Control-Allow-Headers", "X-Requested-With");
                    return next();
                }
            );

            server.on('uncaughtException', function(req, res, route, err) {
                log.uncaught(err);
                answer = {
                    status:"error",
                    message:err
                };
                res.json(answer)
            });

            // Configure local directory for uploading files
            log.info("Cofiguring upload directory...");
            server.use(restify.bodyParser({'uploadDir':config.updater.get('upload_dir') || '/tmp'}));
            server.pre(restify.pre.sanitizePath());

            log.info("Enabling gzip for transport...");
            server.use(restify.gzipResponse());
            
            // Import the routes module and apply the routes to the server
            log.info("Loading routes...");
            server.io = socketio.listen(server.server);
            var routes = require('./routes')(server);

            // Kick off the server listening for connections
            server.listen(config.updater.get('server_port'), "0.0.0.0", function() {
                log.info(server.name+ ' listening at '+ server.url);
                callback(null, server);
            });

        }.bind(this),
        
	function test(callback) {
		callback();
	}.bind(this)	
	],

        function(err, results) {
            if(err) {
                log.error(err);
                typeof callback === 'function' && callback(err);
            } else {
                typeof callback === 'function' && callback(null, this);
            }
        }.bind(this)
    );
};



module.exports = new Updater();
