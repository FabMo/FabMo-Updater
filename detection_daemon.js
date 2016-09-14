var os=require('os');
var util=require('util');
var EventEmitter = require('events').EventEmitter;
var dgram = require('dgram');
var log = require('./log').logger('detection');
var config = require('./config');
//var bonjour = require('bonjour')();


// Direct socket messages
var OK = "YES I M !\0";
var ERR = "I DNT UNDRSTND !\0";
var HOSTNAME = "U NAME ?\0";
var REQ = "R U A SBT ?\0";
var default_port = 24862; // = 7777 without conversion

// Kick off the "detection daemon" which is the process that listens for incoming scans by the FabMo linker
// The detection daemon is what we as a FabMo device run so that we can be discovered by the FabMo linker/dashboard
var start = function(port) {
//	bonjour.unpublishAll();
//	bonjour.publish({ name: os.hostname()+" - FabMo Tool Minder daemon", host:os.hostname()+'.local', type: 'fabmo',protocol:'tcp', port: config.updater.get('engine_server_port'),txt : {fabmo:JSON.stringify(getMachineInfo())}});

	var socket = dgram.createSocket({type:'udp4',reuseAddr:true});
	var that = this;
	port = port || default_port;

	// Listen on the specified port
	socket.bind(port);

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

			//log.debug(JSON.stringify(result));
			result = getMachineInfo();
			// advertise an HTTP server on port 80
			socket.send(new Buffer(JSON.stringify(result)), 0, JSON.stringify(result).length, rinfo.port, rinfo.address, function (err) {
				if (err) log.error(err);
						//console.log("ask info");
				});
			//that.emit('client_scan',rinfo.address);
		}
		else
		{
			log.error("received from "+rinfo.address+" : unknown message : '"+ data.toString() +"'");
		}
	});

	//this.on('newListener', function(listener) {});
};

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


//util.inherits(start , EventEmitter);

// detection_daemon.start kicks off the listening process
module.exports = start;
