var updater = require('../updater');

var setTime = function(req, res, next) {
	if(req.params.ms) {
		updater.setTime(req.params.ms)		
	}
};

module.exports = function(server) {
   server.post('/time', setTime); 
};
