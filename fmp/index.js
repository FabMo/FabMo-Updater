/*
 * fmp/index.js
 *
 * Package-level functions exposed for the FMP package manager.
 * See fmp.js for how this package works
 */
var fmp = require('./fmp');

exports.installPackage = fmp.installPackage;
exports.checkForAvailablePackage = fmp.checkForAvailablePackage;
exports.downloadPackage = fmp.downloadPackage;
exports.installUnpackedPackage = fmp.installUnpackedPackage;
exports.installPackageFromFile = fmp.installPackageFromFile;
exports.parseVersion = fmp.parseVersion;