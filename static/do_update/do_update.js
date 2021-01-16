/*
 * do_update.js
 *
 * This module is the main module for the "simple updater"
 */

var updater = new UpdaterAPI();
var updateTask = null;
var seenStatus = false;

// Set the UI spinner based on the state of the updater
// This is the big full-screen display that shows the spinnder and text message
//     state - One of busy,success,failed,idle
//   options - Options for state:
//             title - The page title
//           message - Text message to display
//          message2 - Secondary message 
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

	if(options.message2) {
		$('#message2').html(options.message2);
	}

}

// Set the state of the UI to "failed"
//   err - Error message to display
function fail(err) {
	return setState('failed', {
		title : 'Update Failed.',
		message : 'System update could not complete' + (err ? (': ' + err) : '.') + '<br/><br/>' + '<a href="' + document.referrer + '">Click here to exit the updater.</a>',
		message2 :  '<a href="/log" class="logdl"><i class="fa fa-file"></i> Error Log</a>'
	});
}

// Set the state of the UI to "success"
function succeed() {
	return setState('success', {
		title : 'Update was Successful!',
		message : '<a href="' + document.referrer + '">Click here to exit the updater.</a>'
	});	
}

$(document).ready(function() {
	// Set the initial state
	setState('idle');

	// When a status report comes in:
	updater.on('status', function(status) {
		if(!updateTask) {
			// First status report, no update task has been started
			if(status.state === 'idle') {
				if(status.updates.length == 0) {
					return setState('success', {
						title : 'Your system is up to date!',
						message : 'No new updates are available.<br /><a href="' + document.referrer + '">Click here to exit the updater.</a>'
					})
				}
				// Kick off the update process
				updater.applyPreparedUpdates(function(err, data) {
					if(err) {
						return fail(err);
					}
					// Remember the ID of the task we started, so we can watch for it to finish
					updateTask = (data || {}).task;

					// Set the busy spinner while we're updating
					setState('busy', {
						title : 'System is Updating',
						message : 'Please wait while your system is updated.'
					});
				});			
			}

		} else {
			// Update task has been started
			if(status.state === 'idle') {
				// And possibly completed, if we're idle again.  Get the task list and check
				updater.getTasks(function(err, data) {
					if(err) {
						return fail(err);
					}
					// Check the state of the one and only one task that we run per page-load.
					// (the one we recorded above)
					if(updateTask in data) {
						if(data[updateTask] === 'success') {
							return succeed();
						}
						fail();
					}
				});
			}
		}
	});
});
