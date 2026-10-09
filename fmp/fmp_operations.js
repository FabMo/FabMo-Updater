const Q = require('q');
const fs = require('fs-extra');
const async = require('async');
const glob = require('glob');
const child_process = require('child_process');
const path = require('path');
const { type } = require('os');
const log = require('../log').logger('fmp');

// Denodeified functions
const ensureDir = Q.nfbind(fs.ensureDir);

// Return the expand command that is appropriate for the provided file, based on its file extension
// The -m (--touch) flag prevents tar from setting file timestamps from the archive.
// This is critical on systems without a battery-backed RTC (like Raspberry Pi) where the
// system clock may be behind — without -m, tar emits a warning per file with a "future"
// timestamp, which can overflow child_process.exec's maxBuffer and kill the extraction
// mid-way, leaving a half-installed update.
//   path - Full path to the file to check
const getExpandCommand = function(path) {
    if (path.match(/.tar$/i)) {
        return 'tar -xmf ';
    }
    if (path.match(/.tar.gz$/i) || path.match(/.tgz$/i)) {
        return 'tar -xzmf ';
    }
    if (path.match(/.tar.bz2?$/i)) {
        return 'tar -xjmf ';
    }
    throw new Error(path + ' is an unknown archive type.');
};

// If the path is an absolute path, return it.
// If it is a relative path, assume it is relative to `cwd`, resolve it to an absolute path and return it.
//   cwd - Working directory (Assumed root path if `pth` is a relative path)
//   pth - Absolute path, or one that is relative to `cwd`
const resolveCwdPath = function(cwd, pth) {
    pth = path.normalize(pth);
    if (path.resolve(pth) === path.normalize(pth)) {
        // Path is absolute (firmware on disk somewhere)
    } else {
        // Path is relative (firmware included in package)
        pth = path.resolve(cwd, pth);
    }
    return pth;
};

// User-data paths that must survive an update even when a broader parent
// directory (e.g. /opt/fabmo) is the delete target. Cut files are never
// shipped in snapshots, so wiping them while the job/history DB is restored
// from a snapshot orphans every job record and crashes the tool on any
// preview/edit/run. There is no reason an update needs to destroy them.
var PRESERVE_PATHS = ['/opt/fabmo/files'];

// Is `candidate` a strict (proper) descendant of `dir`?
function isStrictDescendant(candidate, dir) {
    var rel = path.relative(dir, candidate);
    return rel !== '' && rel.slice(0, 2) !== '..' && !path.isAbsolute(rel);
}

// fs.remove(target), but never destroy any PRESERVE_PATHS that live inside it.
// If a preserved path is strictly inside target, delete the target's contents
// selectively (recursing) instead of removing it wholesale. An explicit delete
// of a preserved path itself (target === the path) is still honored.
function removePreserving(target, callback, preserveList) {
    preserveList = preserveList || PRESERVE_PATHS;
    var resolved = path.resolve(target);
    var preservedInside = preserveList
        .map(function(p) { return path.resolve(p); })
        .filter(function(p) { return isStrictDescendant(p, resolved); });

    if (preservedInside.length === 0) {
        return fs.remove(resolved, callback);
    }

    log.info(`Preserving user data under ${resolved}: ${preservedInside.join(', ')}`);
    fs.readdir(resolved, function(err, entries) {
        if (err) {
            // Nothing to delete (missing/unreadable) — not fatal.
            if (err.code === 'ENOENT') { return callback(); }
            return callback(err);
        }
        async.each(entries, function(entry, cb) {
            var child = path.join(resolved, entry);
            // A preserved path itself — keep it untouched.
            if (preservedInside.indexOf(child) !== -1) {
                return cb();
            }
            // An ancestor of a preserved path — recurse to delete selectively.
            if (preservedInside.some(function(p) { return isStrictDescendant(p, child); })) {
                return removePreserving(child, cb, preserveList);
            }
            // Safe to remove wholesale.
            fs.remove(child, cb);
        }, callback);
    });
}

// Delete the files provided by the `paths` attribute
//   operation - Operation object
//   paths - List of files to delete.  glob-style wildcards are acceptable.
function deleteFiles(operation) {
    const deferred = Q.defer();
    try {
        if (!operation.paths) {
            throw new Error('No paths to delete.');
        }
        // Iterate over all paths
        async.each(
            operation.paths,
            function(path, callback) {
                log.info(`Deleting path: ${path}`);
                // Remove the directory or file, but preserve protected user
                // data (cut files) that may live inside the delete target.
                removePreserving(path, function(err) {
                    if (err) {
                        log.warn(`Error deleting path: ${err.message}`);
                        return callback(err);
                    }
                    log.info(`Successfully deleted: ${path}`);
                    callback();
                });
            },
            // If any path processing operation fails
            function(err) {
                if (err) {
                    return deferred.reject(err);
                }
                deferred.resolve();
            }
        );
    } catch (e) {
        deferred.reject(e);
    }
    return deferred.promise;
}


// Expand the archive specified by `src` into the directory specified by `dest`
// tar, gzipped tar, and bzipped tar archives are all supported.
//   operation - Operation object
//      src - Path to the source archive. This is usually a path relative to the package dir, but can be absolute.
//     dest - Path to the destination directory.  This must be an absolute path
async function expandArchive(operation) {
    if (!operation.src) {
        throw new Error('No source archive specified for expandArchive');
    }
    if (!operation.dest) {
        throw new Error('No destination specified for expandArchive');
    }

    await ensureDir(operation.dest);

    const expandCommand = getExpandCommand(operation.src);
    const sourceFile = resolveCwdPath(operation.cwd, operation.src);

    log.info('Expanding archive ' + sourceFile + ' to ' + operation.dest);
    await Q.nfcall(child_process.exec, expandCommand + sourceFile, { cwd: operation.dest, maxBuffer: 10 * 1024 * 1024 });
}

// Install the firmware specified by `src`
//   operation - Operation object
//      src - Path to the firmware. This can be an absolute or package-relative path
async function installFirmware(operation) {
    const srcPath = resolveCwdPath(operation.cwd, operation.src);
    log.info('Installing firmware from ' + srcPath);
    return require('../hooks').installFirmware(srcPath);
}

// Create all of the directories specified by `path` or `paths` attributes.
// This will recursively create parents, as in `mkdir -p`
//   operation - Operation object
//      path(s) - Path or list of (absolute) paths to create
async function createDirectories(operation) {
    const paths = operation.paths || [];
    if (operation.path) {
        paths.push(operation.path);
    }

    for (const pth of paths) {
        log.info('Creating directory ' + pth);
        await fs.ensureDir(pth);
    }
}

// Do nothing for `seconds` 
//   operation - Operation object
//      seconds - The number of seconds to sleep
function sleep(operation) {
    if (!operation.seconds) {
        throw new Error('No time (seconds) specified for sleep operation');
    }

    return Q.delay(operation.seconds * 1000);
}

// Update the JSON file at `path` with the keys/values contained in `data`
// This will only update top-level keys/values, but this makes it suitable for updating most FabMo settings
// TODO - This function could be expanded to allow you to delete keys, or to use the `extend()` function to
//        do more complex file modifications.
//   operation - Operation object
//      path - Path to the JSON file to modify.  This operation will fail if the file does not already exist.
//      data - Object mapping keys to their new values.  See above.
async function updateJSONFile(operation) {
    if (!operation.path) {
        throw new Error('No path specified.');
    }
    if (!operation.data) {
        throw new Error('No update data specified.');
    }

    log.info("Reading " + operation.path + '...');
    const json = await fs.readJSON(operation.path);

    // Perform updates
    for (const key in operation.data) {
        log.info('Updating key ' + key + ' -> ' + operation.data[key]);
        json[key] = operation.data[key];
    }

    log.info('Writing ' + operation.path + '...');
    await fs.writeJSON(operation.path, json);
    log.info('Done.');
}

// Helper functions are not exposed, only operations
// DON'T put helpers in the exports, because the exports list is used for operation lookup
exports.deleteFiles = deleteFiles;
exports.removePreserving = removePreserving;
exports.PRESERVE_PATHS = PRESERVE_PATHS;
exports.expandArchive = expandArchive;
exports.installFirmware = installFirmware;
exports.createDirectories = createDirectories;
exports.createDirectory = createDirectories;
exports.sleep = sleep;
exports.updateJSONFile = updateJSONFile;
