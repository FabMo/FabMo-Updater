/*
 * fmp/test.js
 *
 * This is a test script demonstrating how to use the packages provided in the /example directory
 */
require('../config').configureUpdater();

fmp = require('./fmp');

fmp.installUpdate('./example/example.fmp')