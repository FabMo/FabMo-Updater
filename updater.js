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
var hooks = require('./hooks')
var network = require('./network')
//var argv = require('minimist')(process.argv);

var Updater = function() {
    this.version = null;
    this.status = {
        'state' : 'idle'
    }
    this.networkManager = 'butts';
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

Updater.prototype.start = function(callback) {

    async.series([
        function configure(callback) {
            log.info("Loading configuration...");
            config.configureUpdater(callback);
        },

        function setup_network(callback) {
            try {
                this.networkManager = network.createNetworkManager();
            } catch(e) {
                this.networkManager = null;
                log.warn(e);
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
            server.listen(9877, "0.0.0.0", function() {
                log.info(server.name+ ' listening at '+ server.url);
                callback(null, server);
            });

        }.bind(this),
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
