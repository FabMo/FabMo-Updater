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

//var argv = require('minimist')(process.argv);

var Updater = function() {
    this.version = null;
    this.status = {
        'state' : 'idle'
    }
    this.networkManager = network.Generic;
    // Handle Inheritance
    events.EventEmitter.call(this);
};
util.inherits(Updater, events.EventEmitter);

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


function UpdaterConfigFirstTime(callback) {
    log.info('Configuring for the first time...');
    switch(config.platform) {
        case 'linux':
            fs.stat('/usr/bin/configure_edison', function(err, stat) {
                if(!err) {
                    log.info('Intel Edison platform detected.');
                    config.updater.set('platform', 'edison');
                }
		doshell('cat /sys/class/net/wlan0/address', function(address) {
			var hostname = 'FabMo-' + address.trim().replace(/:/g,"");
			log.info("Setting factory hostname: " + hostname);
			config.updater.set('name', hostname);
			callback();
		});
            });
        break;

        case 'darwin':
            log.info('OSX Detected.');
            config.updater.set('server_port',9877);
            config.updater.set('engine_server_port' : 9876);
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
