/*
 * updater.js
 * 
 * This is the main application module for the updater.
 * 
 * The FabMo updater might be more accurately named the 'FabMo Agent' because its sole function is not updating.
 * It is also responsible for managing networks, reporting its presence to the cloud and to the local network, reporting versions, etc.
 *
 * The updater periodically consults an online package manifest to see if there's new software available to install by comparing the versions
 * in the manifest with local versions on 
 */
var log = require('./log').logger('updater');
//var detection_service = require('./detection_daemon');
//var Beacon = require('./beacon');
var authentication = require('./authentication');

var fmp = require('./fmp');
var config = require('./config');
var util = require('./util');
var hooks = require('./hooks');
////## var network = require('./network');
////## var GenericNetworkManager = require('./network/manager').NetworkManager;
var doshell = require('./util').doshell;

var crypto = require('crypto');
var sessions = require("client-sessions");
var restify = require('restify');
var async = require('async');
var process = require('process');
var path = require('path');
////##var socketio = require('socket.io')
var events = require('events');
var util = require('util');
var fs = require('fs-extra');
var uuid = require('uuid');
var moment = require('moment');
var Q = require('q');

var argv = require('minimist')(process.argv);

var PLATFORM = process.platform;
var TASK_TIMEOUT = 10800000;    // 3 hours (in milliseconds)
var PACKAGE_CHECK_DELAY = 30;   // Seconds
var UPDATE_PRODUCTS = 'FabMo-Engine|FabMo-Updater'
//var BEACON_INTERVAL = 1*60*60*1000 // 1 Hour (in milliseconds)

// The `Updater` is the application singleton.  It provides functions and data for 
// top-level application functions, and is the custodian of the application's state.
var Updater = function()
{
    // This is a task ID.  In the case of an updater that was started to perform a 
    // specific task, it is passed in on the command line, but normally task IDs are 
    // auto-generated internally by the updater when it is provoked to perform a specific task
    var task = (argv.task || '').trim();
    this.version = {};

    // The status is what represents what the updater is currently doing
    // it is available to the client via HTTP endpoint and websocket
    this.status = {
        'state' : ('task' in argv) ? 'updating' : 'idle',
        'online' : false,
        'task' : task || null,
        'updates' : []
    }

    // Flags indicating the state of some typical activities
    this.packageDownloadInProgress = false;
    this.packageCheckHasRun = false;
    this.hasAccurateTime = false;

    // The updater maintains a collection of tasks that indicate what it is doing, and what it has done
    // recently.  Tasks hang around after they are completed for a few hours so that clients that are displaying 
    // task status know what their status is.
    this.tasks = {};

////##    // The default network manager is the generic one (until the network module has been asked to load one specific to this platform)
////##    this.networkManager = network.Generic;
    
    // If a task was passed in on the command line, we add it to the collection of tasks as one that is pending
    if(task) {
        this.tasks[task] = 'pending';
    }

    // Inheritance for EventEmitter
    events.EventEmitter.call(this);
};
util.inherits(Updater, events.EventEmitter);

// Get the version of this updater.
// It works the same way as the function in `engine.js` that does the same thing for the engine
// TODO - We can probably consolidate these
//   callback - Called with the version info object
Updater.prototype.getVersion = function(callback) {
    this.version = {number : 'v0.0.0', type : 'unknown'};
    require('./util').doshell_promise("git describe --dirty=! --match='v*.*.*'", {cwd : __dirname, silent: true})
        .then(function(data) {
    parts = data.split('-');
        if(parts.length === 1) {
          var versionString = parts[0].trim();
        } else {
            var versionString = parts[0].trim() + '-' + parts[2].trim();
        }
           this.version = require('./fmp').parseVersion(versionString);
           callback(null, this.version);
        }.bind(this))
        .catch(function(e) {
            log.debug('Updater is not a source installation.');
        fs.readFile('version.json', 'utf8', function(err, data) {
            if(err) {
            log.error(err)
                    return callback(null, this.version);
                }
                try {
                    data = JSON.parse(data);
                    if(data.number) {
            this.version.number = data.number;
            this.version.type = data['type'] ? data['type'] : 'release';
                        this.version.date = data.date;
            }
                } catch(e) {
                    log.warn("Could not read updater version.json: " + (e.message || e))
                    log.warn(e);
                } finally {
                    callback(null, this.version);
                }
            }.bind(this))
        }.bind(this));
}

// Add a task to the task collection that is marked as 'pending'
// Tasks can only be started when the updater is in the 'idle' state
//   return the id of the task that was just created
Updater.prototype.startTask = function() {
    if(this.status.state != 'idle') {
        throw new Error('Cannot start a task from the ' + idle + ' state');
    }
    var id = uuid.v1();
    this.tasks[id] = 'pending';
    log.info('Starting task: ' + id);
    this.status.task = id;
    return id;
}

// Mark the specified task as completed with the specific state
// Finishing a task marks it for expiration after TASK_TIMEOUT has elapsed.
//   key - The task ID to update TODO - this should be id to be consistent with above
// state - Either 'success' or 'failed' TODO - should be 'succeeded' or 'failed' (consistency in part of speech)
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

// Convenience functons for completing tasks
Updater.prototype.passTask = function(key) { this.finishTask(key, 'success'); }
Updater.prototype.failTask = function(key) { this.finishTask(key, 'failed'); }

// Set the updater state to the provided value
// this will update the `online` member of the status object as well, and if online, will emit a status event
//   state - The new state
Updater.prototype.setState = function(state) {
    this.status.state = state || this.status.state;
    // // TODO - do we really need to check for online here?
    // this.status.online = this.networkManager.isOnline(function(online) {
    //     // TODO call setOnline here?
    //     this.status.online = online;
    //     this.emit('status',this.status);
    // }.bind(this));
}

// Set the online flag (indicates whether the updater is online) to the provided value
//   online - true to indicate that the updater can see the network.  False otherwise.
Updater.prototype.setOnline = function(online) {
    this.status.online = online;
    this.emit('status', this.status);
}

Updater.prototype.addAvailablePackage = function(package) {
    for(var i=0; i<this.status.updates.length; i++) {
    try {
        if(package.local_filename === this.status.updates[i].local_filename) {
            this.status.updates[i] = package;
                this.emit('status',this.status);
            return package;
        }
    } catch(e) {}
    }
    this.status.updates.push(package);
    this.emit('status',this.status);
    return package;
}

// TODO - ???
Updater.prototype.stop = function(callback) {
    callback(null);
};

////##
// // Update the engine
// // TODO - I think this is a legacy function that does the GIT update - should be removed - everything is done with .fmp files now
// Updater.prototype.updateEngine = function(version, callback) {
//     if(this.status.state != 'idle') {
//         callback(new Error('Cannot update the engine when in the ' + updater.status.state + ' state.'));
//     } else {
//         hooks.updateEngine(version, callback);
//     }
// }

////##
// // Install a specific version of the engine
// // TODO - This is legacy code that should no longer be used.  The update process is done with .fmp files now.
// Updater.prototype.installEngine = function(version, callback) {
//     if(this.status.state != 'idle') {
//         callback(new Error('Cannot install the engine when in the ' + updater.status.state + ' state.'));
//     } else {
//         hooks.installEngine(version, callback);
//     }
// }

// Initiate a factory reset
// Since this program will be shut down when the reset is initiated, the callback is called before doing the actual reset.
Updater.prototype.factoryReset = function(callback) {
    if(this.status.state != 'idle') {
        callback(new Error('Cannot factory reset when in the ' + updater.status.state + ' state.'));
    } else {
        callback(); // Go ahead and callback because the factory reset is going to cause the process to bail.
        hooks.factoryReset();
    }
}


// Update the updater
// TODO - This is legacy code that should no longer be used.  The update process is done with .fmp files now.
Updater.prototype.updateUpdater = function(version, callback) {
    if(this.status.state != 'idle') {
        callback(new Error('Cannot update the updater when in the ' + updater.status.state + ' state.'));
    } else {
        callback(); // Go ahead and callback because the updater update is going to cause the process to bail.
        hooks.updateUpdater();
    }
}

// Get the list of versions available to install
// TODO - This is legacy code that should no longer be used.  The update process is done with .fmp files now.
Updater.prototype.getVersions = function(callback) {
    hooks.getVersions(callback);
}

// Initiate a firmware update
// TODO - This is legacy code that should no longer be used.  The update process is done with .fmp files now.
Updater.prototype.updateFirmware = function(callback) {
    if(this.status.state != 'idle') {
        callback(new Error('Cannot update the firmware when in the ' + updater.status.state + ' state.'));
    } else {
        hooks.updateFirmware(config.updater.get('firmware_file'), callback);
    }
}

////## ?? FMU vs FMP
// Execute the FMU package specified
//   filename - The full path of the FMU file to run
// TODO - This is legacy code that should no longer be used.  The update process is done with .fmp files now.
Updater.prototype.doFMU = function(filename, callback) {
    if(this.status.state != 'idle') {
        callback(new Error('Cannot apply FMU update when in the ' + updater.status.state + ' state.'));
    } else {
        hooks.doFMU(filename, callback);
    }
}

// Execute the FMP (FabMo Package) specified by the provided filename
// This function starts a task, and returns a promise that resolves when the task is complete (or rejects if it fails)
//   filename - Full path to the .fmp file to execute
Updater.prototype.doFMP = function(filename) {
        var key;
        return Q.fcall(function() {
                key = this.startTask();
                this.setState('updating');
            }.bind(this))
            .then(function() {
                return fmp.installPackageFromFile(filename)
            })
            .then(function() {
                this.passTask(key);
                this.setState('idle');
            }.bind(this))
            .catch(function(err) {
                log.error(err);
                this.failTask(key)
                this.setState('idle');
            }.bind(this));
}

// Run the package check on the specified product
// This function fetches the package manifest file specified in the updater configuration, extracts the 
// latest package for the specified product, and compares the version of the package to the version of the
// product that is currently installed.  If the package is a candidate for installation based on its 
// version, it is added to the list of packages available to install.
//
// This function will not check for packages if a package check or download is already in progress.
// This function returns a promise that resolves when the package check is complete (or rejects if it fails)
//   product - The name of the product to check.  Current acceptable values are 'FabMo-Engine' and 'FabMo-Updater'
Updater.prototype.runPackageCheck = function(product) {
    this.packageCheckHasRun = true;

    if(this.packageDownloadInProgress) {
        log.warn('Not checking for package updates because this is already in progress')
        return Q();
    }

    log.info('Checking for updates for ' + product);
    var OS = config.platform;
    var PLATFORM = config.updater.get('platform');

    this.packageDownloadInProgress = true;
    return fmp.checkForAvailablePackage(product)
            .catch(function(err) {
                log.warn('There was a problem retrieving the list of packages: ' + JSON.stringify(err))
            })
            .then(fmp.downloadPackage)
            .catch(function(err) {
                log.warn('There was a problem downloading a package: ' + err)
            })
            .then(function(package) {
                if(package) {
                    log.info('Adding package to the list of available updates.')
                    log.info('  Product: ' + package.product);
                    log.info('  Version: ' + package.version);
                    log.info('      URL: ' + package.url);
                    log.info('     File: ' + package.local_filename);
                    return this.addAvailablePackage(package);
                }
                log.info('No new packages are available for ' + OS + '/' + PLATFORM + '.');
            }.bind(this))
            .catch(function(err) {
                log.error(err);
            })
        .finally(function() {
          log.info('Package check complete.');
          this.packageDownloadInProgress = false;
        }.bind(this));
}

// Run a package check for all products.  This is done serially, starting with the updater, then the engine.
// Returns a promise that resolves when all checks are complete (or rejects if any of them failed)
Updater.prototype.runAllPackageChecks = function() {
    return this.runPackageCheck('FabMo-Updater')
        .then(function(updaterPackage) {
            if(!updaterPackage) {
                this.runPackageCheck('FabMo-Engine')
            }
        }.bind(this))
        .then(function() {
            this.emit('status',this.status);
        }.bind(this));
}

// Install the next package that is in the list of available packages to install.
// Starts a task that completes once the new package is installed
//   callback - Called with nothing when the update is started or with an error if it fails.
Updater.prototype.applyPreparedUpdates = function(callback) {

    // Bomb out if we're busy doing something else
    if(this.status.state != 'idle') {
        return callback(new Error('Cannot apply updates when in the ' + this.status.state + ' state.'));
    }
    // ...or don't have any packages to install
    if( this.status.updates.length === 0) {
        return callback(new Error('No updates to apply.'));
    }
    // Start the task and indicate that we're busy
    var key = this.startTask();
    this.setState('updating');
    var package = this.status.updates[0];

    switch(package.product) {
        case 'FabMo-Updater':
            // Updating the 'FabMo-Updater' means that we're updating this software (which is currently running)
            // so we treat that sort of update a little differently than anything else.  We do the following:
            // 1) Make note of the package filename that we are attempting to install
            // 2) Make a copy of this software (__dirname is the directory from which THIS code is running) in a temporary directory
            // 3) Launch the copy, indicating to it on the command line that it is to perform a self update using the file noted in 1)
            try {
                log.info('Preparing for a self update')
                log.info('Making shadow copy of updater')
                fs.removeSync('/tmp/temp-updater')
                fs.copy(__dirname, '/tmp/temp-updater', function(err) {
                    if(err) {
                        log.error(err);
                        return
                    }
                    log.info('Updater cloned, handing update off to clone');
                    log.info('The updater is going away for awhile.  Do not despair.');
                    log.info('See you, space cowboy.'); // You're gonna carry that weight.

                    // Give a second for those log messages to head out the door before falling on our sword
                    setTimeout(function() {
                        // BANG.
                        require('./util').eject(
                            process.argv[0], 
                            ['/tmp/temp-updater/server.js', '--selfupdate', package.local_filename, '--task', key]);
                    },1000);
                });
            } catch(err) {
                return callback(err);
            }

            break;

        default:
            // Any other package can be updated without having to do any tablecloth magic
            // Just unpack the .fmp and do what it says in the manifest.
            try {
                fmp.installPackage(package)
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
                return callback(err);
            }
            break;
    }
    callback();
}

// Set the system time.  This function will NOT set the time if it has been set already (It implicitly trusts the first time it recieves)
// 
// The philosophy behind this function is thus:
// The updater is the custodian of the system time. In systems that have no battery/RTC AND no internet access, they are pretty much
// guaranteed not to know what time it is when they power up.  To help with this, the updater provides this function for clients that connect
// to provide a system time.  This sounds insane, but it covers a very common case that follows:
//
// 1. This host powers up.  It has no battery/rtc and it has no idea what time it is.
// 2. This host is not connected to the internet. Perhaps it is in wifi AP only, or is on a local network, but not one that has internet access.
// 3. Because of 2. above, this host can't reach out for a timesync. 
// 3. A client connects to this host - frequently a phone or laptop that *can* see the internet, or has seen the internet recently, and thus has
//    an accurate time.
// 4. Upon connection to the dashboard, the time is reported to the updater, which evetually calls this function
// 5. This function, knowing that it does not have an authoritative time, accepts the time as the "correct" time.
//
//   time - microseconds since unix epoch
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

// This function creates the updater configuration file, based on information about the system that it sniffs
// from the local environment.  The updater configuration file initially contains the host ports, platform, etc
// which can all be determined from system information, files on disk, etc.
//   callback - Called with error if the file couldn't be created
//// TODO Should not be getting anything from here ...
function UpdaterConfigFirstTime(callback) {
    log.info('Configuring the updater for the first time...');
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
                } else {
////##
                // require('./util').getCpuInfo(function(err,cpus){
                // if(err) return log.warn(err);
                // for( c in cpus ){
                // if (cpus[c].Hardware === "BCM2708" || cpus[c].Hardware === "BCM2709"){
                //     log.info("Raspberry Pi platform detected");
                // config.updater.set('platform', 'raspberry-pi');
                //     hooks.getUniqueID(function(err, id) {
                //         if(err) {
                //             var id = '';
                //             log.error('There was a problem generating the factory ID:');
                //             log.error(err);
                //             for(var i=0; i<6; i++) {
                //                 id += (Math.floor(Math.random()*15)).toString(16);
                //             }
                //         }
                //         var hostname = 'FabMo-' + id;
                //         config.updater.set('name', hostname.substring(0,30));
                //         callback();
                //     })

                //             }
                //         }                  
                // });
            }
            } catch(e) {
            log.error(e);
        }
        break;

        case 'darwin':
            // Like in the engine, we host on 9876/9877 by default since 80/81 are typically blocked
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

// This is the function that starts the application
// It should be called only once after the `Updater` object is instantiated.
// It executes all the functions that initialize the updater and starts the webserver
// listening on the appropriate port.
Updater.prototype.start = function(callback) {

    // selfUpdateFile is set if the --selfupdate flag is passed on the command line
    // This flag affects the startup sequence (changes how network management is done, and causes
    // an update task to be created at startup)
    var selfUpdateFile = argv.selfupdate || null;

    // Do all these startup steps in sequence
    // TODO - could probably parallelize some of these
    async.series([
        // Create data directories (if they don't already exist) so there are places to store config, etc.
        function setup_application(callback) {
            log.info('Checking updater data directory tree...');
            config.createDataDirectories(callback);
        },
        // Older versions of the updater had a different configuration file format, and encountering that format
        // can trip up the current version of the code, so we migrate that config file if we detect that
        function apply_config_shim(callback) {
            var updaterPath = config.getDataDir('config') + '/updater.json';

log.debug("path- " + updaterPath);

            try {
                fs.readFile(updaterPath, function(err, data) {
log.debug("data- " + data);

                    try {
                        d = JSON.parse(data)
                        if(d['network']) {
                            if(!d['network']['ethernet']) {
                                delete d['network']
                                log.info('Applying network configuration shim.');
                                fs.writeFile(updaterPath, JSON.stringify(d, null, 2), function(err, data) {
                                    if(err) {
                                        log.error(err);
                                    }
                                    callback();
                                });
                            } else {
                                callback();
                            }
                        } else {
                            callback();
                        }
                    } catch(e) {
                        log.error(e);
                        callback();
                    }
                });
            } catch(e) {
                log.error(e);
            }
        },
        // Load and apply the updater configuration
        function configure(callback) {
            log.info('Loading configuration...');
            config.configureUpdater(callback);
        },

        // Load and apply the user configuration
        // This config is shared with the engine so that logins work in both places
        function load_users(callback) {
            log.info('Loading users....')
            config.configureUser(function(){
                callback();
            });
        },

////##
        // function launchDetectionService(callback) {
        //     log.info("Launching Detection Service...");
        //     detection_service();
        //     callback();
        // },

        // Populate the updater config with some calculated values if this is the first time we've ever run
        function first_time_configure(callback) {
            if(!config.updater.userConfigLoaded) {
                UpdaterConfigFirstTime(callback);
            } else {
                callback();
            }
        },
        // Get the unique machine ID for this machine and write it to the config file
        // (We write it to the config file because this is accessible to the client and other modules)
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

        // Get the updater version
        // If the updater version has changed, we clear beacon consent 
        // (Give the user another chance to opt-out of beacon)
        function get_version(callback) {
            this.getVersion(function(err, version) {
                if(!err) {
                    if(version) {
                        try {
                            if(config.updater.get('version')['number'] != version['number']) {
                                log.info('New updater version.')
    //                            config.updater.set('consent_for_beacon', 'none')
                            }
                        } catch(e) {
                            log.warn("Could not read updater version.json: " + (e.message || e))
                            log.warn(e);
    //                        config.updater.set('consent_for_beacon', 'none')

                        } finally {
                            config.updater.set('version', version);
                        }
                    }
                } else {
                    config.updater.set('version', {});
                }
                callback();
            });
        }.bind(this),

        // Generate the secret key used for authentication if it doesn't exist
        // The engine does this too
        function generate_auth_key(callback) {
            log.info("Configuring secret key...")
            var secret_file = config.getDataDir() + '/config/auth_secret'
            fs.readFile(secret_file, 'utf8', function(err, data) {
        
              // If there's already a secret key from disk, use it
              if(!err && data && (data.length == 512)) {
                log.info("Secret key already exists, using that.")
                this.auth_secret = data;
                return callback();
              }
        
              // If not, generate, save and use a new one
              log.info("Generating a new secret key.")
              this.auth_secret = crypto.randomBytes(256).toString('hex');
              fs.writeFile(secret_file, this.auth_secret, function(err, data) {
                callback();
              }.bind(this));
        
            }.bind(this))
          }.bind(this),

        // Get the version of the operating system (informational)
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

////##
//         // // Initialize the network module
//         function setup_network(callback) {

//             var OS = config.platform;
//             var PLATFORM = config.updater.get('platform');
//             try {
//                 if(selfUpdateFile) {
//                     // If we were called with a self-update task - don't initialie a "real" network manager.  Network management
//                     // isn't needed during a self update because it's not a good idea to change networks during an update.  
//                     // Just use the `GenericNetworkManager` in that case - it will result in errors - but these are ignorable.
//                     this.networkManager = new GenericNetworkManager(OS, PLATFORM);
//                     return callback();
//                 } else {
// log.debug("... normal network startup from updater ###")
//                     this.networkManager = network.createNetworkManager();
//                 }
//             } catch(e) {
//                 log.warn(e);
//                 this.networkManager = new GenericNetworkManager(OS, PLATFORM);
//             }

//             // Listen to the network manager's "network" event (which is emitted each time a new network is joined)
//             // and when the event is encountered, initiate beacon reporting and update package checks
//             this.networkManager.on('network', function(evt) {
//                 if(evt.mode === 'station' || evt.mode === 'ethernet') {
//                     // 30 Second delay is used here to make sure timesyncd has enough time to update network time
//                     // before trying to pull an update (https requests will fail with an inaccurate system time)
//                     log.info('Network is possibly available:  Going to check for packages in ' + PACKAGE_CHECK_DELAY + ' seconds.')
//                     setTimeout(function() {
//                     log.info('Doing beacon report due to network change');
//                     this.beacon.setLocalAddresses(this.networkManager.getLocalAddresses());
//                     this.beacon.once('network');
//                         log.info('Running package check due to network change');
//                         this.runAllPackageChecks();
//                     }.bind(this), PACKAGE_CHECK_DELAY*1000);
//                 }
//             }.bind(this));

//             // Call the network manager init function, which actually starts looking for networks, etc.
//             log.info('Looking for and setting up the network...');
//             try {
//                 this.networkManager.init();
//                 log.info('Network manager started.')
//             } catch(e) {
//                 log.error(e);
//                 log.error('Problem starting network manager:' + e);
//             }

//             // Setup a recurring function that checks to see that the updater is online
// ////##
//             // var onlineCheck = function() {
//             //     this.networkManager.isOnline(function(err, online) {
//             //         if(online != this.status.online) {
//             //             this.setOnline(online);
//             //         }
//             //     }.bind(this));
//             // }.bind(this);
//             // onlineCheck();
//             // setInterval(onlineCheck,3000); // TODO - magic number, should factor out
//             return callback(null);
//         }.bind(this),

        // Run any FMUS that are in the configuration fmus directory, in alphabetical order.
        // The FMU used to be the way that packages were updated, but because they weren't very
        // flexible, and allowed for arbitrary code execution, we started to phase them out.
        // It's still useful, though, to be able to drop one in a special location and have it run
        // when the updater boots.  We need to phase it out, but replace it with something more secure.
        // In the mean time, this function runs them on startup, and if they run successfully, deletes them.
        // This allows (for instance) the initial install of the updater to provoke a firmware load on startup,
        // or for factory apps to be installed.
        function run_startup_fmus(callback) {
            if(selfUpdateFile) { return callback(); }
            log.info('Checking for startup FMUs...')
            
            // The configuration FMUs directory is (usually) /opt/fabmo/fmus
            fs.readdir(path.join(config.getDataDir(), 'fmus'), function(err, files) {
                // List the files
                files = files.map(function(filename) {
                    return path.join(config.getDataDir(),'fmus', filename);
                });
                // Only process FMUs
                fmu_files = files.filter(function(filename) { return filename.match(/.*\.fmu$/);})
                // Bail if there aren't any
                if(fmu_files.length == 0) {
                    log.info('No startup FMUs.');
                    return callback();
                } else {
                    log.info(fmu_files.length + ' startup FMU' + (fmu_files.length > 1 ? 's' : '') + ' to run...');
                }

                // doFMU returns a promise - so create a chain that executes and deletes them in sequence
                result = fmu_files.reduce(function (prev, filename) {
                    return prev.then(function() {
                        return hooks.doFMU(filename);
                    }).then(function() {
                        fs.unlink(filename);
                    });
                }, Q());

                // Callback when all done (no errback so as not to interrupt the startup sequence - just log it)
                result.then(function() {
                    callback();
                }).fail(function(err) {
                    log.error(err);
                    callback();
                });
            });
        }.bind(this),

        // This is the main event - now that everything is initialized, start the server so clients
        // can connect and update, etc.
        //
        // It used to be that this was the very last step of the startup sequence, but with an increasing
        // number of processes that happen on timers, the server is actually started before some background
        // tasks are kicked off (see below)
        function start_server(callback) {

            log.info('Setting up the webserver...');
            var server = restify.createServer({name:'FabMo Updater'});
            this.server = server;
////##
            // Handle options request in firefox
            function unknownMethodHandler(req, res) {
            if (req.method.toLowerCase() === 'options') {
                var allowHeaders = ['Accept', 'Accept-Version', 'Content-Type', 'Api-Version', 'Origin', 'X-Requested-With']; // added Origin & X-Requested-With

                if (res.methods.indexOf('OPTIONS') === -1) res.methods.push('OPTIONS');

                res.header('Access-Control-Allow-Credentials', true);
                res.header('Access-Control-Allow-Headers', allowHeaders.join(', '));
                res.header('Access-Control-Allow-Methods', res.methods.join(', '));
                res.header('Access-Control-Allow-Origin', req.headers.origin);

                return res.send(204);
            }
            else
                return res.send(new restify.MethodNotAllowedError());
            }
            server.on('MethodNotAllowed', unknownMethodHandler);
           
            // Allow JSON over Cross-origin resource sharing
            log.info('Configuring cross-origin requests...');
            server.use(
                function crossOrigin(req,res,next){
                    res.header('Access-Control-Allow-Origin', '*');
                    res.header('Access-Control-Allow-Headers', 'X-Requested-With');
                    return next();
                }
            );

            // Register a generic, well-formed response in the case of any uncaught exception
            // TODO - is this really a good idea?
            server.on('uncaughtException', function(req, res, route, err) {
                log.uncaught(err);
                answer = {
                    status:'error',
                    message:err
                };
                res.json(answer)
            });

            // Configure local directory for uploading files
            log.info("Configuring upload directory...");

            // #### fixed name of bodyParser during updating of NPM
            server.use(restify.plugins.bodyParser({'uploadDir':config.updater.get('upload_dir') || '/tmp'}));
            server.pre(restify.pre.sanitizePath());

            // Configure authentication via passport
            log.info("Cofiguring authentication...");
            log.info("Secret Key: " + this.auth_secret.slice(0,5) + '...' + this.auth_secret.slice(-5));
            server.cookieSecret = this.auth_secret;
            server.use(sessions({
                // cookie name dictates the key name added to the request object
                cookieName: 'session',
                // should be a large unguessable string
                secret: server.cookieSecret, // REQUIRE HTTPS SUPPORT !!!
                // how long the session will stay valid in ms
                duration: 30 * 24 * 60 * 60 * 1000, // 30 days
                cookie: {
                  //: '/api', // cookie will only be sent to requests under '/api'
                  //maxAge: 60000, // duration of the cookie in milliseconds, defaults to duration above
                  ephemeral: false, // when true, cookie expires when the browser closes
                  httpOnly: false, // when true, cookie is not accessible from javascript
                  secure: false // when true, cookie will only be sent over SSL. use key 'secureProxy' instead if you handle SSL not in your node process
                }
            }));

            server.use(authentication.passport.initialize());
            server.use(authentication.passport.session());

            log.info('Enabling gzip for transport...');
            //// ## another fix below
            server.use(restify.plugins.gzipResponse());

            log.info('Configuring websocket...');
            
            ////## server.io = socketio.listen(server.server);
            ////## changes below per RMackie engine.js
            log.info('Loading routes...');
            
            server.io = require('socket.io')(server.server);
            var routes = require('./routes')(server);

            // Kick off the server listening for connections
            server.listen(config.updater.get('server_port'), '0.0.0.0', function() {
                log.info(server.name+ ' listening at '+ server.url);
                callback(null, server);
            });
log.debug("got to authentication");
            // TODO - why is this down here?
            authentication.configure();

        }.bind(this),

    // The updater configuration emits an event when one of its settings changes
    // For a few settings, that provokes action by the updater.  These actions are defined below:
    function setup_config_events(callback) {
        config.updater.on('change', function(evt) {

            // If any of the URLs for cloud services change, re-engage with 
            // those services at the new URL
            if(evt.packages_url) {
                this.runAllPackageChecks();
            }
////##
            // if(evt.beacon_url) {
            //     this.beacon.set('url', config.updater.get('beacon_url'));
            // }

            // // If the tool name changes, report the change to beacon
            // if(evt.name) {
            //     this.beacon.once('config');
            // }

            // // If beacon consent changes, let the beacon daemon know (possibly do a report)
            // if (evt.consent_for_beacon) {
            //     this.beacon.set("consent_for_beacon", evt.consent_for_beacon);
            //     log.info("Consent for beacon is " + evt.consent_for_beacon);
            // }
        }.bind(this));
        callback();
    }.bind(this),

    // This is the stage where, if we were passed a self update task on the command line,
    // we actually create and execute the task.  Once the self update is complete, we exit.
    function self_update(callback) {
        if(selfUpdateFile) {
            log.info('Servicing a self update request!');
            log.info('Self update file: ' + selfUpdateFile);
            fmp.installPackageFromFile(selfUpdateFile)
                .then(function() {
                    this.passTask(argv.task);
                    this.setState('idle');
                }.bind(this))
                .catch(function(err) {
                    log.error(err);
            this.failTask(argv.task);
                    this.setState('idle');
                }.bind(this))
        .finally(function() {
            try {
                require('./hooks').startService('fabmo-updater');
            } finally {
                process.exit();
            }
        });
        } else {
            callback();
        }
    }.bind(this),

////##
    // Start the beacon service
    // function start_beacon(callback) {
    //     var url = config.updater.get('beacon_url');
    //     var consent = config.updater.get('consent_for_beacon');

    //     log.info("Starting beacon service");
    //     this.beacon = new Beacon({
    //         url : url,
    //         interval : BEACON_INTERVAL
    //     });
    //     switch(consent) {
    //         case "true":
    //         case true:
    //                     log.info("Beacon is enabled");
    //                     this.beacon.set("consent_for_beacon", "true");
    //             break;

    //         case "false":
    //         case false:
    //             log.info("Beacon is disabled");
    //                     this.beacon.set("consent_for_beacon", "false");
    //             break;
    //         default:
    //             log.info("Beacon consent is unspecified");
    //                     this.beacon.set("consent_for_beacon", "true");
    //             break;
    //     }

    //     this.beacon.start();

    // }.bind(this)
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
