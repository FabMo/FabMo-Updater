var request = require('request');
var prompt = require('prompt');
var Q = require('q');
var path = require('path');
var fs = require('fs');
var log = require('../log').logger('github');

var USER_AGENT = 'DangerBuns';
var HEADERS = { 'User-Agent' : USER_AGENT };

function getFileContents(owner, repos, file, options) {
	var deferred = Q.defer();

    var auth = {}
    if(options.username || options.password) {
    	auth.user = options.username
    	auth.pass = options.password
    }
    request.get(
    	{
    	url : 'https://api.github.com/repos/' + owner + '/' + repos + '/contents/' + file,
    	auth : auth,
    	headers : HEADERS
    	},
    	function(err, resp, body) {
    		try {
    			var file = JSON.parse(body);  
    			file.content = new Buffer(file.content, 'base64')
    			deferred.resolve(file);
    		} catch(e) {
    			deferred.reject(e);
    		}

    	}
    );
    return deferred.promise;
}

function updateFileContents(file, newContents, commitMessage, options) {
	var deferred = Q.defer();

    var auth = {}
    if(options.username || options.password) {
    	auth.user = options.username
    	auth.pass = options.password
    }

    request.put(
    	{
    	url : file.url,
    	auth : auth,
    	headers : HEADERS,
    	json : {
    		path : file.path,
    		message : commitMessage,
    		sha : file.sha,
    		content : new Buffer(newContents).toString('base64')
    	}
    	},
    	function(err, resp, body) {
    		try {
    			deferred.resolve(body);
    		} catch(e) {
    			deferred.reject(e);
    		}

    	}
    );
    return deferred.promise;
}


function getReleaseAssets(release, options) {
    var deferred = Q.defer();

    var auth = {}
    if(options.username || options.password) {
    	auth.user = options.username
    	auth.pass = options.password
    }

    request.get(
    	{
    	url : release.assets_url,
    	auth : auth,
    	headers : HEADERS
    	},
    	function(err, resp, body) {
    		try {
    			var assets = JSON.parse(body);    			
    			deferred.resolve(assets);
    		} catch(e) {
    			deferred.reject(e);
    		}

    	}
    );
    return deferred.promise;
}

function deleteReleaseAssets(release, regex, options) {
	return getReleaseAssets(release, options)
		.then(function(assets) {
			return assets.reduce(function (previous, asset) {
    			return previous.then(function () {
    				if(asset.name.match(regex)) {
    					log.info("Deleting release asset: " + asset.name)
       	 				return deleteReleaseAsset(asset, options)
    				} else {
       	 				return Q();    					
    				}
    			});
			}, Q());
		});
}


function deleteReleaseAsset(asset, options) {
    var deferred = Q.defer();

    var auth = {}
    if(options.username || options.password) {
    	auth.user = options.username
    	auth.pass = options.password
    }

	request.delete(
		{
	    	url : asset.url,
	    	auth : auth,
	    	headers : HEADERS
		},
		function(err, resp, body) {
			if(err) {
				return deferred.reject(err);
			}
			if(resp.statusCode != 204) {
				deferred.reject(new Error(resp.statusMessage));
			}
			deferred.resolve(null);
		}
	);	
	return deferred.promise;
}

function deleteRelease(release, options) {
    var deferred = Q.defer();

    var auth = {}
    if(options.username || options.password) {
    	auth.user = options.username
    	auth.pass = options.password
    }
    log.info("Deleting release: " + release.tag_name);
	request.delete(
		{
	    	url : release.url,
	    	auth : auth,
	    	headers : HEADERS
		},
		function(err, resp, body) {
			if(err) {
				return deferred.reject(err);
			}
			if(resp.statusCode != 204) {
				deferred.reject(new Error(resp.statusMessage));
			}
			deferred.resolve(null);
		}
	);	
	return deferred.promise;
}

function getReleaseByTag(owner, repos, tagName, options) {
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
    	headers : HEADERS
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
    		return deferred.resolve(null);
    	}
    );
    return deferred.promise;
}

function updateRelease(release, object, options) {
	var deferred = Q.defer();
	var auth = {}
    if(options.username || options.password) {
    	auth.user = options.username
    	auth.pass = options.password
    }

	// Release doesn't already exist
	request.patch(
		{
	    	url : release.url,
	    	auth : auth,
	    	headers : HEADERS,
	    	json : object
		},
		function(err, resp, body) {
			if(err) {
				return deferred.reject(err);
			}
			if(resp.statusCode != 200) {
				deferred.reject(new Error(resp.statusMessage));
			}
			try {
				deferred.resolve(JSON.parse(body));
			} catch(e) {
				deferred.resolve(body);
			}
		}
	);
	return deferred.promise;
}

function createRelease(owner, repos, tagName, targetCommitish, options) {
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
    				log.info('Release for ' + tagName + ' already exists');
	    			return deferred.resolve(release);
	    		}
    		}
    		log.info('Release for ' + tagName + ' does not already exist');
    		// Release doesn't already exist
			console.log(tagName);
			console.log(targetCommitish);
			request.post(
				{
			    	url : 'https://api.github.com/repos/' + owner + '/' + repos + '/releases',
			    	auth : auth,
			    	headers : HEADERS,
		
				json : {
			    		tag_name : tagName,
			    		target_commitish : tagName === targetCommitish ? undefined : targetCommitish,
				}
				},
				function(err, resp, body) {
					if(err) {
						return deferred.reject(err);
					}
					if(resp.statusCode != 201) {
						deferred.reject(new Error(resp.statusCode + ": " + resp.statusMessage));
					}
					try {
						deferred.resolve(JSON.parse(body));
					} catch(e) {
						deferred.resolve(body);
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
exports.deleteRelease = deleteRelease;
exports.getCredentials = getCredentials;
exports.getReleaseByTag = getReleaseByTag;
exports.updateRelease = updateRelease;
exports.deleteReleaseAssets = deleteReleaseAssets;
exports.getFileContents = getFileContents;
exports.updateFileContents = updateFileContents;

