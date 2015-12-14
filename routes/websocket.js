var util = require('../util');
var log = require('../log');
var logger = log.logger('websocket');
var clients_limit = 5;
var nb_clients=0;
var updater = require('../updater');

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

};

module.exports = function(server) {
  server.io.on('connection', onConnect);
  setupBroadcasts(server.io.sockets);
};


