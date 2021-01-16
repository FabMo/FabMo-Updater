/*
 * detection_daemon.js
 * 
 * This module provides the service that listens for UDP broadcast discovery packets and responds appropriately
 * so that this host can be discovered by the FabMo minder.
 */
var os=require('os');
var util=require('util');
var EventEmitter = require('events').EventEmitter;
var dgram = require('dgram');
var log = require('./log').logger('detection');
var config = require('./config');

// TODO why is this commented out?
//var bonjour = require('bonjour')();

// Direct socket messages
var OK = "YES I M !\0";
var ERR = "I DNT UNDRSTND !\0";
var HOSTNAME = "U NAME ?\0";
var REQ = "R U A SBT ?\0";
var default_port = 24862; 

// Kick off the "detection daemon" which is the process that listens for incoming scans by the FabMo Minder
// The detection daemon is what we as a FabMo device run so that we can be discovered by the FabMo Minder
var start = function(port) {
	// TODO - why are these (and the bonjour require() above) commented out?
	// bonjour.unpublishAll();
	// bonjour.publish({ name: os.hostname()+" - FabMo Tool Minder daemon", host:os.hostname()+'.local', type: 'fabmo',protocol:'tcp', port: config.updater.get('engine_server_port'),txt : {fabmo:JSON.stringify(getMachineInfo())}});
	
	// udp4 API changed after v0.10.x but older machines still use it, so shim the functionality
	var socketOpts = {'type':'udp4','reuseAddr':true};
	if (process.version.match(/v0\.10\.\d*/i)) {
		socketOpts = 'udp4';
	}
	var socket = dgram.createSocket(socketOpts);
	// TODO do away with that=this pattern - yuck.
	var that = this;
	port = port || default_port;

	// Listen on the specified port
	socket.bind(port);

	// This is the handler for when a broadcast message is received. 
	// When the braodcast message is received, we reply with the OK message, indicating that we are a FabMo device
	// The dialog continues (see below) with the minder eventually receiving a JSON information packet that describes this machine
	socket.on("message", function ( data, rinfo ) {
		if(data.toString() == REQ) // Respond properly to queries asking if we are a FabMo device
		{
			//log.debug('scan in progress by '+ rinfo.address);

			// Respond indicating that we are a FabMo system
			socket.send(new Buffer(OK), 0, OK.length, rinfo.port, rinfo.address, function (err) {
				if (err) {
					log.error(err);
				}
			});
		}
		else if(data.toString() == HOSTNAME) // Respond properly to continued dialog in the autodetect process
		{
			// Send machine info
			result = getMachineInfo();
			socket.send(new Buffer(JSON.stringify(result)), 0, JSON.stringify(result).length, rinfo.port, rinfo.address, function (err) {
				if (err) {
 					log.error(err);
				}
			});
		}
		else
		{
			log.error("received from "+rinfo.address+" : unknown message : '"+ data.toString() +"'");
		}
	});
};

// Return information about this machine.  Eg:
// {    hostname : 'myhost', 
//      networks : [{interface : 'eth0', ip_address : '192.168.10.119'}, {interface : 'wlan0', ip_address : '192.168.10.128'}],
//   server_port : 80 }
function getMachineInfo(){
	var result = {};
	result.hostname= os.hostname();
	result.networks=[];
	result.server_port = config.updater.get('engine_server_port');
	Object.keys(os.networkInterfaces()).forEach(function(key,index,arr){ //val = ip adresses , key = name of interface
		var networks_list = this;
		networks_list[key].forEach(function(val2,key2,arr2){
			if (val2.internal === false && val2.family === 'IPv4')
			{
				result.networks.push({'interface' : key , 'ip_address' : val2.address});
			}
		});
	},os.networkInterfaces());
	return result;
}

// detection_daemon.start kicks off the listening process
module.exports = start;
