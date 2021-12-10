/*
 * routes/upload.js
 *
 * Provides a route handler for uploading.
 * The route handling for uploads is special because it provides a mechanism
 * for multi-file uploads with rich file and overall-upload metadata.
 */

var log = require('../log').logger('routes');
var fs = require('fs');
var uuid = require('uuid');

UPLOAD_INDEX = {};
UPLOAD_TIMEOUT = 3600000;

/*
 * Incoming metadata looks like this:
 * {
    meta : {metadata}
    files : [
        {metadata for file 1},
        {metadata for file 2},
        {etc...}
    ]
 * }
 */

// Create an upload based on the provided upload metadata
// upload metadata comes with the first POST request in the upload sequence.
// Returns a key that will be used to identify this upload in future calls
//   metadata - The upload metadata
//       TODO - We don't actually do anything with `callback` should eliminate it.
function createUpload(metadata, callback) {
    var key = uuid.v1();
    log.info('Creating upload ' + key);
    UPLOAD_INDEX[key] = {
        file_count : metadata.files.length,
        meta : metadata.meta || {},
        files : metadata.files,
        callback : callback
    }
    setUploadTimeout(key, UPLOAD_TIMEOUT);
    return key;
}

// Set a timeout for the specified upload
//       key - The upload to set a timeout for
//   timeout - The upload timeout in milliseconds
function setUploadTimeout(key, timeout) {
    if(UPLOAD_INDEX[key].timeout) {
        clearTimeout(UPLOAD_INDEX[key].timeout);
    }
    UPLOAD_INDEX[key].timeout = setTimeout(function() { 
        log.warn('Deleting expired upload: ' + key); 
        expireUpload(key);
    }, timeout);
}

// Expire this upload
// This is done when it is assumed that the client has abandoned the upload
function expireUpload(key) {
    var upload = UPLOAD_INDEX[key];
    if(upload && upload.timeout) {
        clearTimeout(upload.timeout);
        delete UPLOAD_INDEX[key];
        return upload;    
    } else {
        log.warn("Tried to expire upload " + key + " that doesn't exist.");
    }
}

// Update the specified upload with the provided file
//     key - The upload to update
//   index - The index of the file (what order in the sequence of uploaded files is this)
//    file - Path to the uploaded file
function updateUpload(key, index, file) {
    if(key in UPLOAD_INDEX) {
        setUploadTimeout(key, UPLOAD_TIMEOUT);
        var upload = UPLOAD_INDEX[key];
        var meta = upload.files[index];
        if(!meta) { throw new Error('No upload metadata for file ' + index + ' of ' + key); }
        meta.file = file;
        if(!file) { throw new Error('No file supplied in request.')}

        upload.file_count--;
        log.info('Recieved file #' + index + ' (' + file.name + ') for upload ' + key);
        if(upload.file_count === 0) {
            log.info('Upload of ' + key + ' complete.')
            return expireUpload(key);
        }
        return undefined;
    }
    
    throw new Error('Invalid upload key: ' + key);
}

// Route handler for complex uploads
// If the request has a `files` attribute, it is assumed to be delivering a file as a part of an upload
// If not, it is assumed to be a file metadata POST.
// In the case of the latter, a new upload is created, and the upload key is sent in the response
// In the case of the former, the file is absorbed (if a valid upload key has been provided) and a success response is sent 
function upload(req, res, next, callback) {
    if(req.files) { // File upload type post
        var file = req.files.file;
        var index = req.body.index;
        var key = req.body.key;
        var upload_data = null;

        try {
            upload_data = updateUpload(key, index, file);
        } catch(e) {
            log.error(e);
            return res.json({
                'status' : 'error',
                'message' : e.message
            });
        }

        if(upload_data) {
            if(callback) {
                //var cb = upload_data.callback;
                delete upload_data.callback;
                delete upload_data.file_count;
                delete upload_data.timeout;
                callback(null, upload_data);
            }
        } else {
            return res.json({
                'status' : 'success',
                'data' : {
                    'status' : 'pending'
                }
            });            
        }

    } else { /* Metadata type POST */

        try {
            var key = createUpload(req.body, callback);
        } catch(e) {
            log.error(e);
            return res.json( {
                'status' : 'error', 
                'message' : e.message
            });
        }

        // Respond with the key
        return res.json({
            'status' : 'success',
            'data' : {
                'status' : 'pending',
                'key' : key
            }
        });

    };
}

module.exports.upload = upload;
