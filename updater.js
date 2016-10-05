var restify = require('restify');
var async = require('async');
var process = require('process');
var path = require('path');
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
var moment = require('moment');
var argv = require('minimist')(process.argv);
var Q = require('q');
var fmp = require('./fmp');

var TASK_TIMEOUT = 10800000;    // 3 hours (in milliseconds)
var PACKAGE_CHECK_DELAY = 30;   // Seconds

var Updater = function() 
{   this.version = null;
    this.status = {
        'state' : 'idle',
        'online' : false,
        'task' : null,
        'updates' : []
    }
    this.packageDownloadInProgress = false;
    this.packageCheckHasRun = false;
    this.hasAccurateTime = false;
    this.tasks = {};
    this.networkManager = network.Generic;
    events.EventEmitter.call(this);
};
util.inherits(Updater, events.EventEmitter);

Updater.prototype.getVersion = function(callback) {
    require('./util').doshell('git rev-parse --verify HEAD', function(data) {
        this.version = {};
        this.version.hash = (data || '').trim();
        this.version.number = '';
        this.version.debug = ('debug' in argv);
        fs.readFile('version.json', 'utf8', function(err, data) {
            if(err) {
                this.version.type = 'dev';
                return callback(null, this.version);
            }
            try {
                data = JSON.parse(data);
                if(data.number) {
                    this.version.number = data.number;
                    this.version.type = 'release';
                }
            } catch(e) {
                this.version.type = 'dev';
                this.version.number
            } finally {
                callback(null, this.version);
            }
        }.bind(this))
    });
}

Updater.prototype.startTask = function() {
    var id = uuid.v1();
    this.tasks[id] = 'pending';
    log.info('Starting task: ' + id);
    this.status.task = id;
    return id;
}

Updater.prototype.finishTask = function(key, state) {
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
    this.status.state = state || this.status.state;
    this.status.online = this.networkManager.isOnline(function(online) {
        this.status.online = online;
        this.emit('status',this.status);
    }.bind(this));
}

Updater.prototype.setOnline = function(online) {
    this.status.online = online;
    this.emit('status', this.status);
}

Updater.prototype.addAvailablePackage = function(package) {
    this.status.updates.forEach(function(update) {
        try {
            if(update.local_filename === package.local_filename) {
                return;
            }
        } catch(e) {}

    });

    this.status.updates.push(package);
    this.emit('status',this.status);
}

Updater.prototype.stop = function(callback) {
    callback(null);
};

Updater.prototype.updateEngine = function(version, callback) {
    if(this.status.state != 'idle') {
        callback(new Error('Cannot update the engine when in the ' + updater.status.state + ' state.'));
    } else {
        hooks.updateEngine(version, callback);
    }
}

Updater.prototype.installEngine = function(version, callback) {
    if(this.status.state != 'idle') {
        callback(new Error('Cannot install the engine when in the ' + updater.status.state + ' state.'));
    } else {
        hooks.installEngine(version, callback);
    }
}

Updater.prototype.factoryReset = function(callback) {
    if(this.status.state != 'idle') {
        callback(new Error('Cannot factory reset when in the ' + updater.status.state + ' state.'));
    } else {
        callback(); // Go ahead and callback because the factory reset is going to cause the process to bail.
        hooks.factoryReset();
    }
}


Updater.prototype.updateUpdater = function(version, callback) {
    if(this.status.state != 'idle') {
        callback(new Error('Cannot update the updater when in the ' + updater.status.state + ' state.'));
    } else {
        callback(); // Go ahead and callback because the updater update is going to cause the process to bail.
        hooks.updateUpdater();
    }
}

Updater.prototype.getVersions = function(callback) {
    hooks.getVersions(callback);
}

Updater.prototype.updateFirmware = function(callback) {
    if(this.status.state != 'idle') {
        callback(new Error('Cannot update the firmware when in the ' + updater.status.state + ' state.'));
    } else {
        hooks.updateFirmware(config.updater.get('firmware_file'), callback);
    }
}

Updater.prototype.doFMU = function(filename, callback) {
    if(this.status.state != 'idle') {
        callback(new Error('Cannot apply FMU update when in the ' + updater.status.state + ' state.'));
    } else {
        hooks.doFMU(filename, callback);
    }
}

Updater.prototype.doFMP = function(filename, callback) {
    if(this.status.state != 'idle') {
        callback(new Error('Cannot apply FMP update when in the ' + updater.status.state + ' state.'));
    } else {
        var key = this.startTask();
        this.setState('updating');
        fmp.installUpdate(filename)
            .then(function() {
                this.passTask(key);
                this.setState('idle');
            }.bind(this))
            .catch(function(err) {
                this.failTask(key);
            });
    }
}

Updater.prototype.runPackageCheck = function() {
    this.packageCheckHasRun = true;
    if(this.packageDownloadInProgress) {
        log.warn('Not checking for package updates because this is already in progress')
        return Q();
    }

    var OS = config.platform;
    var PLATFORM = config.updater.get('platform');

    this.packageDownloadInProgress = true;
    return fmp.checkForAvailablePackage({product : 'FabMo-Engine', platform : PLATFORM, os : OS})
            .catch(function(err) {
                log.warn('There was a problem retrieving the list of packages: ' + err)
            })
            .then(fmp.downloadPackage)
            .catch(function(err) {
                log.warn('There was a problem downloading a package: ' + err)
            })
            .then(function(package) {
                if(package) {
                    log.info('Adding package to the list of available updates.')
                    return this.addAvailablePackage(package);
                }
                log.info('No new packages are available for ' + OS + '/' + PLATFORM + '.');
            }.bind(this))
            .catch(function(err) {
                log.error(err);
            })
        .finally(function() {
        this.packageDownloadInProgress = false;
        }.bind(this));
}

Updater.prototype.applyPreparedUpdates = function(callback) {
    if(this.status.state != 'idle') {
        return callback(new Error('Cannot apply updates when in the ' + this.status.state + ' state.'));
    }

    if( this.status.updates.length === 0) {
        return callback(new Error('No updates to apply.'));
    }
    var key = this.startTask();
    this.setState('updating');
    try {
        fmp.installPackage(this.status.updates[0])
            .then(function() {
                this.status.updates = [];
                this.passTask(key);
                this.setState('idle');
            }.bind(this))
            .catch(function(err) {
                log.error(err);
                this.status.updates = [];
                this.failTask(key);
                this.setState('idle');
        }.bind(this)).done();
    } catch(err) {
        callback(err);
    }
    return callback();
}

Updater.prototype.setTime = function(time, callback) {
    if(this.status.state != 'idle') {
        callback(new Error('Cannot set the system time while in the ' + updater.status.state + ' state.'));
    } else {
        if(this.hasAccurateTime) {
            log.warn('Not accepting an externally provided time.  Local time is trusted.');
            return;
        }
        var m = moment.unix(time/1000.0);
        time_string = m.utc().format('YYYY-MM-DD HH:mm:ss');
        hooks.setTime('"' + time_string + '"', function() {
            this.hasAccurateTime = true;
        }.bind(this));
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
                    log.info('Intel Edison Platform Detected');
                    config.updater.set('platform', 'edison');
                    hooks.getUniqueID(function(err, id) {
                        if(err) {
                            var id = '';
                            log.error('There was a problem generating the factory ID:');
                            log.error(err);
                            for(var i=0; i<8; i++) {
                                id += (Math.floor(Math.random()*15)).toString(16);
                            }
                        }
                        var hostname = 'FabMo-' + id;
                        config.updater.set('name', hostname);
                        callback();
                    })
                }
            } catch(e) {
            log.error(e);
        }
        break;

        case 'darwin':
            log.info('OSX Detected.');
            config.updater.set('server_port',9877);
            config.updater.set('engine_server_port',9876);
            config.updater.update({network : {mode : 'station', networks : []}});
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
            log.info('Loading configuration...');
            config.configureUpdater(callback);
        },
        function first_time_configure(callback) {
            if(!config.updater.userConfigLoaded) {
                UpdaterConfigFirstTime(callback);
            } else {
                callback();
            }
        },
        function get_unique_id(callback) {
            hooks.getUniqueID(function(err, id) {
                if(err) {
                    log.error('Could not read the unique machine ID!');
                    config.updater.set('id', config.updater.get('hostname'));
                } else {
                    config.updater.set('id', id);
                }
                callback();
            });
        }.bind(this),
        function get_version(callback) {
            this.getVersion(function(err, version) {
                if(!err) {
                    config.updater.set('version', version);                    
                } else {
                    config.updater.set('version', {});
                }
                callback();
            });
        }.bind(this),

        function get_os_version(callback) {
          hooks.getOSVersion(function(err, version) {
            if(err) {
              config.updater.set('os_version','unknown');
              return callback();
            }
            config.updater.set('os_version', version);
            callback();
          });
        }.bind(this),

        function setup_network(callback) {
            try {
                this.networkManager = network.createNetworkManager();
            } catch(e) {
                log.warn(e);
                var OS = config.platform;
                var PLATFORM = config.updater.get('platform');
                this.networkManager = new GenericNetworkManager(OS, PLATFORM);
            }

            // Do a package check every time we join a wireless network
            this.networkManager.on('network', function(evt) {
                    if(evt.mode === 'station') {
                    // 30 Second delay is used here to make sure timesyncd has enough time to update network time
                    // before trying to pull an update (https requests will fail with an inaccurate system time)
                    log.info('Network is possibly available:  Going to check for packages in ' + PACKAGE_CHECK_DELAY + ' seconds.')        
                    setTimeout(function() {
                        log.info('Running package check due to network change');
                    this.runPackageCheck();
                    }.bind(this), PACKAGE_CHECK_DELAY*1000);
                }
            }.bind(this));

            log.info('Setting up the network...');
            try {
                this.networkManager.init();
                log.info('Network manager started.')
            } catch(e) {
                log.error(e);
                log.error('Problem starting network manager:' + e);
            }


            var onlineCheck = function() {
                this.networkManager.isOnline(function(err, online) {
                    if(online != this.status.online) {
                        this.setOnline(online);
                    }
                }.bind(this));
            }.bind(this);
            onlineCheck();
            setInterval(onlineCheck,3000);
            return callback(null);
        }.bind(this),

        function run_startup_fmus(callback) {
            log.info('Checking for startup FMUs...')
            fs.readdir(path.join(config.getDataDir(), 'fmus'), function(err, files) {
                files = files.map(function(filename) { 
                    return path.join(config.getDataDir(),'fmus', filename);
                });
                fmu_files = files.filter(function(filename) { return filename.match(/.*\.fmu$/);})
                if(fmu_files.length == 0) {
                    log.info('No startup FMUs.');
                    return callback();
                } else {
                    log.info(fmu_files.length + ' startup FMU' + (fmu_files.length > 1 ? 's' : '') + ' to run...');
                }
                result = fmu_files.reduce(function (prev, filename) {
                    return prev.then(function() {
                        return hooks.doFMU(filename);
                    }).then(function() {
                        fs.unlink(filename);
                    });
                }, Q());

                result.then(function() {
                    callback();
                }).fail(function(err) {
                    log.error(err);
                    callback();
                });
            });
        }.bind(this),

        function start_server(callback) {
            log.info('Setting up the webserver...');
            var server = restify.createServer({name:'FabMo Updater'});
            this.server = server;

            // Allow JSON over Cross-origin resource sharing
            log.info('Configuring cross-origin requests...');
            server.use(
                function crossOrigin(req,res,next){
                    res.header('Access-Control-Allow-Origin', '*');
                    res.header('Access-Control-Allow-Headers', 'X-Requested-With');
                    return next();
                }
            );

            server.on('uncaughtException', function(req, res, route, err) {
                log.uncaught(err);
                answer = {
                    status:'error',
                    message:err
                };
                res.json(answer)
            });

            // Configure local directory for uploading files
            log.info('Cofiguring upload directory...');
            server.use(restify.bodyParser({'uploadDir':config.updater.get('upload_dir') || '/tmp'}));
            server.pre(restify.pre.sanitizePath());

            log.info('Enabling gzip for transport...');
            server.use(restify.gzipResponse());

            // Import the routes module and apply the routes to the server
            log.info('Loading routes...');
            server.io = socketio.listen(server.server);
            var routes = require('./routes')(server);

            // Kick off the server listening for connections
            server.listen(config.updater.get('server_port'), '0.0.0.0', function() {
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
