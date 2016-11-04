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
					if(err) {
						return deferred.reject(err);
					}
					if(resp.statusCode != 201) {
						deferred.reject(new Error(resp.statusMessage));
					}
					try {
						deferred.resolve(JSON.parse(body));
					} catch(e) {
						deferred.reject(e);
					}
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
	return retval;
}

function addReleaseAsset(release, filename, options) {
	var deferred = Q.defer();
	try {
		var name = path.basename(filename);
		var uploadURL = URITemplateSubst(release.upload_url, {'name' : name});
		var auth = {};

	    if(options.username || options.password) {
	    	auth.user = options.username
	    	auth.pass = options.password
	    }

		var size = fs.stat(filename, function(err, stat) {
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
								return deferred.reject(err);
							}
							if(resp.statusCode != 201) {
								deferred.reject(new Error(body))
							}
							body = JSON.parse(body);
							deferred.resolve(body.browser_download_url);
						}
					
					)
				);
		})
	} catch(e) {
		deferred.reject(e);
	}

	return deferred.promise
}
function getCredentials() {
	var deferred = Q.defer();
	var schema = {
		properties: {
		  username: {
		    required: true,
		    message: 'Github Username:'
		  },
		  password: {
		  	required: true,
		    hidden: true,
		    message: 'Github Password:'
		  }
		}
	};
	prompt.start();
	prompt.message = '';
	prompt.delimiter = '';
	prompt.get(schema, function(err, result) {
		if(err) {
			return deferred.reject(err);
		}
		return deferred.resolve(result);
	});
	return deferred.promise;
}

exports.createRelease = createRelease;
exports.addReleaseAsset = addReleaseAsset;
exports.getCredentials = getCredentials;
