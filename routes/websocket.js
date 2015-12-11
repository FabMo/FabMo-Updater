var util = require('../util');
var log = require('../log');
var logger = log.logger('websocket');
var clients_limit = 5;
var nb_clients=0;

function setupBroadcasts(clients_sockets){
  log.on('any',function(msg){
    clients_sockets.emit('log',msg);
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

};

module.exports = function(server) {
  server.io.on('connection', onConnect);
  setupBroadcasts(server.io.sockets);
};


