exports.get_versions = function(err, stdout, stderr, callback) {
	if(err) {
		return callback(err, new Error(stderr));
	} 
	var tag_re = /^([0-9a-f]+)\s+refs\/tags\/(v\d\.\d\.\d)$/i
	var lines = stdout.split('\n');
	var retval = [];
	lines.forEach(function(line) {
		var match = tag_re.exec(line);
		if(match) {
			retval.push({'version' : match[2], 'hash' : match[1]})
		}
	});
	callback(null, retval);
}

exports.reboot = function(err, stdout, stderr, callback) {
	callback(err, stderr);
}

exports.get_engine_state = function(err, stdout, stderr, callback) {
	if(err) {
		return callback(err, new Error(stderr));
	}
	var state_re = /^\s*Active:\s+(\w+)\s+\((\w+)\)/im
	var match = state_re.exec(stdout);
	if(match) {
		callback(null, match[0]);
	} else {
		callback(new Error('Cannot determine engine state'));
	}
}