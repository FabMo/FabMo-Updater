var updater = new UpdaterAPI();
var updateTask = null;

function setState(state, options) {
	options = options || {};
	var icon = $('#icon');
	var body = $('body');
	switch(state) {
		case 'busy':
			icon.removeClass().addClass('fa fa-10x fa-cog fa-spin-5x');
			body.removeClass().addClass('status-busy');						
			break;
		case 'success':
			icon.removeClass().addClass('fa fa-10x fa-check-circle')
			body.removeClass().addClass('status-success');			
			break;
		case 'failed':
			icon.removeClass().addClass('fa fa-10x fa-exclamation-circle')
			body.removeClass().addClass('status-failed');			
			break;
		case 'idle':
		default:
			icon.removeClass().addClass('fa fa-10x fa-circle-o')
			body.removeClass().addClass('status-idle');			
			break;
	}
	if(options.title) {
		$('#title').html(options.title);
	}

	if(options.message) {
		$('#message').html(options.message);
	}

}

function fail(err) {
	return setState('failed', {
		title : 'Update Failed.',
		message : 'System update could not complete' + (err ? (': ' + err) : '.')
	});
}

function succeed() {
	return setState('success', {
		title : 'Update was Successful!',
		message : 'You may return to the dashboard.'
	});	
}

$(document).ready(function() {
	setState('idle')
	updater.on('status', function(status) {
		if(!updateTask) {
			// First status report, no update task has been started
			if(status.state === 'idle') {
			// Updater is not otherwise busy
				updater.updateEngine('master', function(err, data) {
					if(err) {
						return fail(err);
					}
					updateTask = (data || {}).task;
					setState('busy', {
						title : 'System is Updating',
						message : 'Please wait while your system is updated.'
					});
				});			
			}

		} else {
			// Update task has been started
			if(status.state === 'idle') {
				// And possibly completed, if we're idle again.
				updater.getTasks(function(err, data) {
					if(err) {
						return fail(err);
					}
					// Check the state of the one and only one task that we run per page-load.
					if(updateTask in data) {
						if(data[updateTask] === 'success') {
							return success();
						}
						fail();
					}
				});
			}
		}
	});
});