var fs = require("fs-extra")
var cp = require('child_process')

function exec(command, callback) {
    console.log('Executing: ' + command)
    cp.exec(command, {shell:true}, function(err, stderr, stdout) {
        if (err) {
            console.log('Error: ',err)
	    return callback()
	}
        console.log('stdout, stderr: ', stdout, stderr)
    	callback()
    });

}

exec('systemctl daemon-reload', function() {
    exec('systemctl stop fabmo-updater', function() {
        fs.removeSync('/tmp/temp-updater')
        fs.copy('/fabmo/updater', '/tmp/temp-updater', function(err) {
            if(err) {
                console.error(err);
                return
            }
            console.info('Updater cloned, handing update off to clone');
            console.info('See you, space cowboy.');
            
            exec('systemctl start fabmo-temp-updater',function() {})
        });
    })
})

process.stdin.resume();
