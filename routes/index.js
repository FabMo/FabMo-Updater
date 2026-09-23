/*
 * routes/index.js
 *
 * This is the loader for all the routes in the system.
 * The route loader iterates over files in the routes directory, imports them,
 * and calls them as functions with the restify server as an argument.
 * The route modules, in turn, take that opportunity to register individual routes on the server.
 * 
 * This module exports itself a a single function which should be called once
 * at startup with the restify server
 */
var fs = require('fs');
var path = require('path');
var log = require('../log').logger('routes');
var restify = require('restify');
var authentication = require('../authentication');

// Load all the files in the 'routes' directory and process them as route-producing modules
// TODO - Make this a not-anonymous function.
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

	// Setup redirect for non-authenticated clients.
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
////##	server.get(/.*/, restify.serveStatic({
////##		directory: './static',
////##		default: 'index.html'

//    server.get('*/', restify.plugins.serveStatic({
    server.get("/*", restify.plugins.serveStatic({
        directory: './static',
	 	default: 'index.html'
//	 	appendRequestPath: false
	}));

	// While the updater replaces its own files during a self-update, static
	// pages (typically /login, where the browser lands once the session
	// resets) briefly 404 and the user sees a raw JSON error. For browser
	// navigations, serve a friendly page that polls until the updater is
	// back and then returns to "/". The HTML is inline on purpose: a file
	// under static/ could itself be missing mid-update. API clients
	// (JSON Accept headers) still get the normal error response.
	var RESTARTING_PAGE = [
		'<!doctype html>',
		'<html><head><meta charset="utf-8">',
		'<meta name="viewport" content="width=device-width, initial-scale=1.0">',
		'<title>FabMo Updater</title>',
		'<style>',
		'body{font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;background:#313366;color:#fff;',
		'display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}',
		'.box{max-width:26rem;padding:2rem}',
		'h1{font-size:1.4rem;margin:0 0 .5rem}',
		'p{color:#cfcfcf;line-height:1.4}',
		'a{color:#ffda29}',
		'</style></head><body><div class="box">',
		'<h1>FabMo Updater is restarting&hellip;</h1>',
		'<p>This page is not available right now. If an update is in progress,',
		' the updater will be back in a moment &mdash; this page retries automatically.</p>',
		'<p><a href="/">Return to the updater now</a></p>',
		'</div>',
		'<script>',
		'(function poll(){',
		'fetch("/",{cache:"no-store"}).then(function(r){',
		'if(r.ok){window.location.replace("/");}else{setTimeout(poll,2000);}',
		'}).catch(function(){setTimeout(poll,2000);});',
		'})();',
		'</script></body></html>'
	].join('\n');

	server.on('NotFound', function (req, res, err, callback) {
		var wantsHtml = ((req.headers && req.headers.accept) || '').indexOf('text/html') !== -1;
		if (wantsHtml && !res.headersSent) {
			res.writeHead(404, { 'Content-Type': 'text/html' });
			res.end(RESTARTING_PAGE);
			return;
		}
		return callback();
	});

};
