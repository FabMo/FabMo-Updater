var io = require('socket.io-client');
socket = io.connect('localhost', {
    port: 80
});
console.log("led controller ready !");
socket.on('connect', function () { console.log("socket connected"); });
socket.on('error', function (err) { console.log(err); });
socket.on('status', function(status){console.log(status);});
