var restify = require('restify');
var async = require('async');
var process = require('process');
var PLATFORM = process.platform;
var log = require('./log').logger('updater');
//var argv = require('minimist')(process.argv);

var Updater = function() {
    this.version = null;
};

Updater.prototype.stop = function(callback) {
    callback(null);
};

Updater.prototype.start = function(callback) {

    async.series([

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
            //log.info("Cofiguring upload directory...");
            //server.use(restify.bodyParser({'uploadDir':config.engine.get('upload_dir') || '/tmp'}));
            //server.pre(restify.pre.sanitizePath());

            log.info("Enabling gzip for transport...");
            server.use(restify.gzipResponse());
            
            // Import the routes module and apply the routes to the server
            log.info("Loading routes...");
            var routes = require('./routes')(server);

            // Kick off the server listening for connections
            server.listen(9877, function() {
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
