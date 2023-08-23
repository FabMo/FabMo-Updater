/*
 * log.js 
 *
 * A "Poor man's" logging module.  It provides basic colorized logging using named
 * loggers with selectable log levels.  It provides log events so the log can be streamed
 * to updater client instances via a websocket.  (It drives the updater console in the updater UI)
 */
var process = require('process');
try { var colors = require('colors'); } catch(e) {var colors = false;}

// Internal variable that can be set to suppress logging
var _suppress = false;

// Internal buffer for log lines (each entry in the array is a line)
var log_buffer = [];

// Listeners for log events
var listeners = {'any':[]};

// Index of all the Logger objects that have been created.
var logs = {};

// Number of lines to keep in the log buffer
var LOG_BUFFER_SIZE = 5000;

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

// Sets the global logging level to the provided numeric or named value
//   lvl - A numeric log level.  See LEVELS above for levels and names. 
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


// Output the provided message with colorized output (if available) and the logger name
//   level - The log level (name)
//     msg - The actual string to log.
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

				case 'clear':  // hack to clear the console
					console.log(('   ' + msg).bold);
					clearLogBuffer();
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
Logger.prototype.clear = function(msg) { this.write('clear', msg)}
Logger.prototype.command = function(msg) { this.write('command', msg)}
Logger.prototype.stdout = function(msg) { this.write('stdout', msg)}
Logger.prototype.stderr = function(msg) { this.write('stderr', msg)}
Logger.prototype.shell = function(msg) { this.write('shell', msg);};
Logger.prototype.debug = function(msg) { this.write('debug', msg);};
Logger.prototype.info = function(msg) { this.write('info', msg);};
Logger.prototype.warn = function(msg) { this.write('warn', msg);};

// When used to log an `Error` object, this function logs a stack trace too, to make debugging easier
Logger.prototype.error = function(msg) {
	if(msg && msg.stack) {
		this.write('error', msg.stack);
	} else {
		this.write('error', msg);
	}
};

// This logs a stack trace, for debugging
Logger.prototype.stack = function(msg) {
	var stackTrace = new Error().stack;
	stackTrace = stackTrace.split('\n');
	stackTrace = stackTrace.slice(2).join('\n');
	this.write('debug', 'Stack Trace:\n' + stackTrace);
}

// Handle uncaught exceptions (print information to the shell before failing completely)
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

// TODO - re-evaluate this.  catching uncaughtException without exiting the process is a dangerous game
process.on('uncaughtException', function(err) { Logger.prototype.uncaught(err); });

// Functions to turn on/off logging
var suppress = function(v) {_suppress = true;};
var unsuppress = function(v) {_suppress = false;};

// Return the contents of the log buffer as one big string
var getLogBuffer = function() {
	return log_buffer.join('\n');
};

var clearLogBuffer = function() {
	log_buffer = [];
}

// Bind to the provided event.
//       evt - Named event.  The only supported event is `any` which fires when anything is logged
//   handler - Called with the event target (log message) whenever an event fires
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
