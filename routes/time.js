
var setTime = function(req, res, next) {
	if(req.params.ms) {
		var updater = require('../updater');
		updater.setTime(req.params.ms)		
	}
};

module.exports = function(server) {
   server.post('/time', setTime); 
};
