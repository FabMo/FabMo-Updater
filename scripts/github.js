var request = require('request');
var prompt = require('prompt');
var Q = require('q');
var path = require('path');
var fs = require('fs');
var USER_AGENT = 'DangerBuns';

function createRelease(owner, repos, tagName, options) {
    var deferred = Q.defer();

    var auth = {}
    if(options.username || options.password) {
    	auth.user = options.username
    	auth.pass = options.password
    }

    request.get(
    	{
    	url : 'https://api.github.com/repos/' + owner + '/' + repos + '/releases',
    	auth : auth,
    	headers : {
    		'User-Agent' : USER_AGENT
    	},
    	},
    	function(err, resp, body) {
    		var releases = JSON.parse(body);
    		var releaseExists = false;

    		for(var i=0; i<releases.length; i++) {
    			var release = releases[i];
    			if(release.tag_name === tagName) {
	    			return deferred.resolve(release);
	    		}
    		}
    		// Release doesn't already exist
			request.post(
				{
			    	url : 'https://api.github.com/repos/' + owner + '/' + repos + '/releases',
			    	auth : auth,
			    	headers : {
			    		'User-Agent' : USER_AGENT
			    	},
			    	json : {
			    		tag_name : tagName
			    	}
				},
				function(err, resp, body) {
					deferred.resolve(JSON.parse(body));
				}
			);
    	}
    );
    return deferred.promise;
}

function URITemplateSubst(template, obj) {
	var urlRegex = /([^{]+)(?:{\?([\w,]+)})?/g
	var match = urlRegex.exec(template)
	var base = match[1]
	var args = (match[2] || '').split(',')
	var parts = [base, '?'];
	args.forEach(function(arg) {
		if(arg in obj) {
			parts.push(arg + '=' + obj[arg])
			parts.push('&')
		}
	});
	var retval = parts.join('').replace(/[\?\&]$/g,'');
	console.log(retval);
	return retval;
}

function addReleaseAsset(release, filename, options) {
	var deferred = Q.defer();
	var name = path.basename(filename);
	var uploadURL = URITemplateSubst(release.upload_url, {'name' : name});
	var auth = {};
    if(options.username || options.password) {
    	auth.user = options.username
    	auth.pass = options.password
    }

	var size = fs.statSync(filename, function(err, stat) {
		fs.createReadStream(filename)
			.pipe(request.post(
					{
						url : uploadURL,
						auth : auth,
			    		headers : {
			    			'User-Agent' : USER_AGENT,
			    			'Content-Length' : stat.size
			    		}
					},
					function(err, resp, body) {
						if(err) {
							deferred.reject(err);
						}
						body = JSON.parse(body);
						deferred.resolve(body.browser_download_url);
					}
				
				)
			);
	})

	return deferred.promise
}

function getCredentials() {
	var deferred = Q.defer();
	var schema = {
		properties: {
		  username: {
		    required: true
		  },
		  password: {
		  	required: true,
		    hidden: true
		  }
		}
	};
	prompt.start();
	prompt.get(schema, function(err, result) {
		if(err) {
			return deferred.reject(err);
		}
		return deferred.resolve(result);
	});
	return deferred.promise();
}

exports.createRelease = createRelease;
exports.addReleaseAsset = addReleaseAsset;
exports.getCredentials = getCredentials;
