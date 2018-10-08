var util = require('../util');
var log = require('../log');
var logger = log.logger('websocket');
var clients_limit = 5;
var nb_clients=0;
var updater = require('../updater');
var authentication = require('../authentication');
var passport = authentication.passport;
var sessions = require("client-sessions");
var parseCookie = require('./util').parseCookie;

function setupAuthentication(server){
	server.io.of('/private').use(function (socket, next) {
		var handshakeData = socket.request;
    // Check that the cookie header is present
    if (!handshakeData.headers.cookie) {
    	return next(new Error('No cookie transmitted.'));
    }
    // Get all the cookie objects
    var cookie = parseCookie(handshakeData.headers.cookie);
		if(!cookie['session']){
			var err = new Error('No session provided.');
			log.error(err);
			console.dir(cookie);
			return next(err);
		}
    // Pull out the user from the cookie by using the decode function
	handshakeData.sessionID = sessions.util.decode({cookieName: 'session', secret:server.cookieSecret}, cookie['session']);
	//console.log(handshakeData);
		var user = handshakeData.sessionID.content.passport.user;

		authentication.getUserById(user, function (err, data){
			if (err){
				log.error(err);
			} else {
				authentication.setCurrentUser(data);
			}
		});
		// authentication.configure();
		if(!handshakeData.sessionID){
			var err = new Error('Wrong session.');
			log.error(err);
			console.dir(handshakeData)
			console.dir(cookie)
			return next(err);
		}
    next();
	});
}


function setupBroadcasts(clients_sockets){
  log.on('any',function(msg){
    clients_sockets.emit('log',msg);
  });

  updater.on('status', function(status) {
    clients_sockets.emit('status', status);
  });
}

var onConnect = function(socket) {

  var client = util.getClientAddress(socket.client.request)
  logger.info("Client " + client + " connected.");

  socket.on('disconnect', function() {
    logger.debug("Client disconnected");
  });

  socket.on('status', function(data) {
    socket.emit('status', machine.status);
  });

  socket.on('ping', function(data) {
    socket.emit('pong');
  });

  socket.emit('status', updater.status);
  socket.emit('log', log.getLogBuffer())
};

module.exports = function(server) {
  setupAuthentication(server);
  server.io.on('connection', onConnect);
  setupBroadcasts(server.io.sockets);
};


