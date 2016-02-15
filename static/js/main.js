var updater = new UpdaterAPI();

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

function updateNetworks(callback) {
	updater.getWifiNetworks(function(err, networks) {
		if(err) {
			return callback(err);
		}
	
		var table = document.getElementById('network-table');

		var rows = table.rows.length;
		for(var i=1; i<rows; i++) {
			table.deleteRow(1);
		}
		networks.forEach(function(network) {
		var row = table.insertRow(table.rows.length);
		var ssid = row.insertCell(0);
		var security = row.insertCell(1);
		var strength = row.insertCell(2);

		ssid.innerHTML = network.ssid;
		security.innerHTML = network.security.join('/');
		});
		callback();

	});
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

  function updateService() {
	updateNetworks(function(err) {
		setTimeout(updateService,5000);
	});
  }

  updateService();
  // Buttons for engine management
  $("#btn-start-engine").click(function() {updater.startEngine()});
  $("#btn-stop-engine").click(function() {updater.stopEngine()});
});
