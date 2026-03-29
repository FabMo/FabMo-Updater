// Minimum version to offer in the version selector dropdown
var MIN_VERSION = [4, 0, 50];

exports.get_versions = function(err, stdout, stderr, callback) {
	if(err) {
		return callback(err, new Error(stderr));
	} 
	var tag_re = /^([0-9a-f]+)\s+refs\/tags\/(v\d\.\d\.\d+)$/i
	var lines = stdout.split('\n');
	var retval = [];
	lines.forEach(function(line) {
		var match = tag_re.exec(line);
		if(match) {
			var version = match[2];
			var parts = version.replace(/^v/i, '').split('.').map(Number);
			if (parts.length === 3 &&
				(parts[0] > MIN_VERSION[0] ||
				(parts[0] === MIN_VERSION[0] && parts[1] > MIN_VERSION[1]) ||
				(parts[0] === MIN_VERSION[0] && parts[1] === MIN_VERSION[1] && parts[2] >= MIN_VERSION[2]))) {
				retval.push({'version' : version, 'hash' : match[1]})
			}
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
		callback(null, match[1]);
	} else {
		callback(new Error('Cannot determine engine state'));
	}
}
