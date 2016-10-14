/**
 * log.js is a "Poor man's" logging module.  It provides basic colorized logging using named
 * loggers with selectable log levels.
 */
var process = require('process');
try { var colors = require('colors'); } catch(e) {var colors = false;}
var _suppress = false;
var log_buffer = [];
var LOG_BUFFER_SIZE = 5000;
var listeners = {'any':[]};

// String versions of the allowable log levels
LEVELS = {
	'shell' : 0,
	'debug' : 1,
	'info' : 2,
	'warn' : 3,
	'error' : 4,
};

// Default log levels for loggers with specific names.
LOG_LEVELS = {
};

function setGlobalLevel(lvl){
	if (lvl)
	{
		if (lvl >= 0 && lvl <= 4)
		{
			// assign the log level to the string equivalent of the integer
			Object.keys(LOG_LEVELS).forEach(function(key) {
	  			LOG_LEVELS[key] = Object.keys(LEVELS).filter(function(key) {return (LEVELS[key] === lvl);})[0];
	  		});
		}
		else if (Object.keys(LEVELS).indexOf(lvl) >= 0) // if a string
		{
			//  assign the log level to the string that is given
			Object.keys(LOG_LEVELS).forEach(function(key) {
	  			LOG_LEVELS[key] = lvl;
	  		});
		}
		else if (lvl === "none")
		{
			return;
		}
		else
		{
			logger('log').warn('Invalid log level: ' + lvl);
		}
	}
}

// The Logger object is what is created and used by modules to log to the console.
var Logger = function(name) {
	this.name = name;
};

// Index of all the Logger objects that have been created.
var logs = {};

// Output the provided message with colorized output (if available) and the logger name
Logger.prototype.write = function(level, msg) {
	if(_suppress) {
		return;
	}

	my_level = LOG_LEVELS[this.name];
	if(my_level == undefined) {
		my_level = LOG_LEVELS['info'];
	}
	if((LEVELS[level] || 0) >= (LEVELS[my_level] || 0)) {
		buffer_msg = level + ': ' + msg + ' ['+this.name+']';
		if(colors) {
			switch(level) {

				case 'stderr':
				case 'stdout':
					var prefix = level === 'stdout' ? ' - '.blue : ' - '.red
					msg.split('\n').forEach(function(line) {
						if(line.trim()) {
							console.log(prefix + line);													
						} else {
							//console.log(prefix)
						}
					});
					break;

				case 'command':
					console.log(('   ' + msg).bold);
					break;

				case 'shell':
					console.log((level + ': ').magenta + msg+' ['+this.name+']');
					break;

				case 'debug':
					console.log((level + ': ').blue + msg+' ['+this.name+']');
					break;
				case 'info':
					console.log((level + ': ').green + msg+' ['+this.name+']');
					break;
				case 'warn':
					console.log((level + ': ').yellow + msg+' ['+this.name+']');
					break;
				case 'error':
					console.log((level + ': ').red + msg+' ['+this.name+']');
					break;
			}
		} else {
			console.log(level + ': ' + msg+' ['+this.name+']');
		}
		log_buffer.push(buffer_msg);
		for(var i=0; i<listeners['any'].length; i++) {
			listeners['any'][i](buffer_msg)
		}
		while(log_buffer.length > LOG_BUFFER_SIZE) {
			log_buffer.shift();
		}
	}
};

// These functions provide a shorthand alternative to specifying the log level every time
Logger.prototype.command = function(msg) { this.write('command', msg)}
Logger.prototype.stdout = function(msg) { this.write('stdout', msg)}
Logger.prototype.stderr = function(msg) { this.write('stderr', msg)}
Logger.prototype.shell = function(msg) { this.write('shell', msg);};
Logger.prototype.debug = function(msg) { this.write('debug', msg);};
Logger.prototype.info = function(msg) { this.write('info', msg);};
Logger.prototype.warn = function(msg) { this.write('warn', msg);};

Logger.prototype.error = function(msg) {
	if(msg && msg.stack) {
		this.write('error', msg.stack);
	} else {
		this.write('error', msg);
	}
};

Logger.prototype.stack = function(msg) {
	var stackTrace = new Error().stack;
	stackTrace = stackTrace.split('\n');
	stackTrace = stackTrace.slice(2).join('\n');
	this.write('debug', 'Stack Trace:\n' + stackTrace);
}

Logger.prototype.uncaught = function(err) {
	if(colors) {
		console.log("UNCAUGHT EXCEPTION".red.underline);
		console.log(('' + err.stack).red)
	} else {
		console.log("UNCAUGHT EXCEPTION");
		console.log(err.stack);
	}
}

// Factory function for producing a new, named logger object
var logger = function(name) {
	if(name in logs) {
		return logs[name];
	} else {
		l = new Logger(name);
		logs[name] = l;
		return l;
	}
};

process.on('uncaughtException', function(err) { Logger.prototype.uncaught(err); });

var suppress = function(v) {_suppress = true;};
var unsuppress = function(v) {_suppress = false;};

var getLogBuffer = function() {
	return log_buffer.join('\n');
};

var clearLogBuffer = function() {
	log_buffer = [];
}

var on = function(evt, handler) {
	if(evt in listeners) {
		listeners[evt].push(handler);
	}
}

exports.suppress = suppress;
exports.unsuppress = unsuppress;
exports.logger = logger;
exports.setGlobalLevel = setGlobalLevel;
exports.getLogBuffer = getLogBuffer;
exports.clearLogBuffer = clearLogBuffer;
exports.on = on;
