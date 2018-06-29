var fs = require('fs');
var path = require('path');
var log = require('../log').logger('routes');
var restify = require('restify');
var authentication = require('../authentication');

// Load all the files in the 'routes' directory and process them as route-producing modules
module.exports = function(server) {
	var routeDir = __dirname;
	var files = fs.readdirSync(routeDir);
	files.forEach(function (file) {
		filePath = path.resolve('./', routeDir, file);
		if((path.extname(filePath) == '.js') && (path.basename(filePath) != 'index.js')) {
		try{
			routes = require(filePath);
			if(typeof(routes) == 'function') {
				routes(server);
				log.debug('  Loaded routes from "' + filePath + '"');				
			} else {
				log.debug('  (Skipping route load for ' + filePath + ')');
			}
		} catch(e) {
			log.warn('Could not load routes from "' + filePath + '": ' + e);
		}
	}
	});


	server.use(function(req, res, next){
		var currentUser = authentication.getCurrentUser();
		if(currentUser) {
			next();
		} else {
			if(req.url === '/login' ) {
				next();
			} else if (req.url === "/") {
				res.redirect('/login', next);
			} else {
				next();
			}
		}
	})



	// Define a route for serving static files
	// This has to be defined after all the other routes, or it plays havoc with things
	server.get(/.*/, restify.serveStatic({
		//directory: './static'
		directory: './static',
		default: 'index.html'
	}));

};
