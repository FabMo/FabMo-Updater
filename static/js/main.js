$('.menu-item').click(function() {
	$('.content-pane').removeClass('active');
	$('#' + this.dataset.id).addClass('active');
	$('.menu-item').removeClass('active');
	$(this).addClass('active');
	flowConsole();
});

// Prettify lines for "console" output
function prettify(line) {
  var line_re = /^(\w*)\:(.*)/i;
  var match = line_re.exec(line);
  if(match) {
    var level = match[1];
    var msg = match[2];
    return '<span class="loglevel-' + level + '">' + level + ':</span>' + msg + '\n'
  } else {
    return line;
  }
}

// Print a line to the "console"
function printf(s) {
    var log = $('#console .content');
    log.append(prettify(s));
    log[0].scrollTop = log[0].scrollHeight;
}

function updateNetworks() {
	var table = document.getElementById('network-table');
/*	jobs.forEach(function(job) {
		var row = table.insertRow(table.rows.length);
		var menu = row.insertCell(0);
		menu.className += ' actions-control';
		var name = row.insertCell(1);
		var done = row.insertCell(2);
		var time = row.insertCell(3);

		menu.innerHTML = createHistoryMenu(job._id);
		name.innerHTML = '<div class="job-' + job.state + '">' + job.name + '</div>';
		done.innerHTML = moment(job.finished_at).fromNow();
		time.innerHTML = moment.utc(job.finished_at - job.started_at).format('HH:mm:ss');
	});
*/
}
function flowConsole() {
  var c = $('#console');
  var vph = $(window).height();
  var r = c.position();
  var margin = parseInt($(document.body).css('margin'), 10)
  var new_height = vph-r.top-margin;
  c.height(new_height);
  $('#console .content').height(new_height-20);
}

$(window).resize(function() {
	flowConsole();
}).resize();


$(document).ready(function() {
  var updater = new UpdaterAPI();

  // Direct updater log messages to the console
  updater.on('log', function(msg) {
    printf(msg);
  });

  // The update version menu
  updater.getVersions(function(err, versions) {
    menu1 = $("#update-version");
    menu2 = $("#install-version");

    versions.forEach(function(entry) {
      menu1.append('<option value="' + entry.version + '">' + entry.version + '</option>');
      menu2.append('<option value="' + entry.version + '">' + entry.version + '</option>');    
    });

  });

	function setState(state) {
		console.log(state)
	  	var stateText = state.charAt(0).toUpperCase() + state.slice(1);
	    $('#updater-status-text').text(' ' + stateText);
	    $('#updater-status').removeClass('status-idle status-updating status-disconnected').addClass('status-' + state);
	    var icon = $('#updater-status-icon');
	    var classes = 'fa-circle-o fa-spin fa-spinner chain-broken'
	    switch(state) {
	    	case 'idle':
	    		icon.removeClass(classes).addClass('fa-circle-o');
	    		break;

	    	case 'disconnected':
	    		icon.removeClass(classes).addClass('fa-chain-broken');
	    		break;

	    	case 'updating':
	    		icon.removeClass(classes).addClass('fa-spin fa-spinner');
	    		break;
	    }
	}

  updater.on('status', function(status) {
  	setState(status.state);
  });

 updater.on('disconnect', function(state) {
    setState('disconnected');
 });

  $("#btn-update-firmware").click( function(evt) { 
    evt.preventDefault();
    updater.updateFirmware();
  });

  updater.getWifiNetworks(function(err, networks) {
  	console.log(networks);
  })

  // Buttons for engine management
  $("#btn-start-engine").click(function() {updater.startEngine()});
  $("#btn-stop-engine").click(function() {updater.stopEngine()});
});