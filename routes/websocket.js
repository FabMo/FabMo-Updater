/*
 * routes/websocket.js
 *
 * This module provides functions for managing the websocket.
 *
 * Like the other modules in the /routes subtree, this module exports itself as a 
 * function that takes a single argument (the restify server) but it configures handlers for the websocket
 * instead of adding routes to the server.
 */
var util = require('../util');
var log = require('../log');
var logger = log.logger('websocket');
var clients_limit = 5;
var nb_clients=0;
var updater = require('../updater');

// When a client connects, bind any broadcast events to that client
//   clients_sockets - The collection of client sockets from the server 
function setupBroadcasts(clients_sockets){
  log.on('any',function(msg){
    clients_sockets.emit('log',msg);
  });

  updater.on('status', function(status) {
    clients_sockets.emit('status', status);
  });
}

// Handler to be called whenever a client connects.
//   socket - The client socket
var onConnect = function(socket) {

  var client = util.getClientAddress(socket.client.request)
  logger.info("Client " + client + " connected.");

  socket.on('disconnect', function() {
    logger.debug("Client disconnected");
  });

  // Bind status reports
  socket.on('status', function(data) {
    socket.emit('status', machine.status);
  });

  // Setup ping-pong behavior
  socket.on('ping', function(data) {
    socket.emit('pong');
  });

  // Emit status and send the log buffer to the client on connect
  socket.emit('status', updater.status);
  socket.emit('log', log.getLogBuffer())
};

module.exports = function(server) {
////##  server.io.on('connection', onConnect);
////## quick test
  server.io.of('/').on('connection', onPublicConnect);
  server.io.of('/private').on('connection', onPrivateConnect);

  setupBroadcasts(server.io.sockets);
};


