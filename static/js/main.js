var updater = new UpdaterAPI();

var url = window.location.origin;
var base_url = url.replace(/\/$/,'');
var versions = [];

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
    var log = $('#log-content');
    log.append(prettify(s));
    log[0].scrollTop = log[0].scrollHeight;
}

$(document).ready(function() {
  
  // Direct updater log messages to the console
  updater.on('log', function(msg) {
    printf(msg);
  });

  updater.on('status', function(status) {
    $('#updater-status').text(status.state);
    $('#updater-status').removeClass('status-idle status-updating status-disconnected').addClass('status-' + status.state);
    $('button').removeClass('pure-button-disabled');
    $('select').show();
  });

  updater.on('disconnect', function(status) {
    $('#updater-status').text('disconnected');
    $('#updater-status').removeClass('status-idle status-updating').addClass('status-disconnected');
    $('button').addClass('pure-button-disabled');
    $('select').hide();
  });

  // Buttons for engine management
  $("#system-reboot").click(function() {updater.reboot()});
  $("#system-shutdown").click(function() {updater.shutdown()});
  $("#engine-start").click(function() {updater.startEngine()});
  $("#engine-stop").click(function() {updater.startEngine()});
  $("#engine-restart").click(function() {updater.startEngine()});

  // Button to clear the log
  $("#log-clear").click( function() { 
    $('#log-content').text('');
  });

  // The update button
  $("#update-go").click( function(evt) { 
    evt.preventDefault();
    updater.updateEngine($("#update-version").val());
  });

  $("#update-to-latest").click( function(evt) { 
    evt.preventDefault();
    updater.updateEngine('master');
  });

  // The update version menu
  updater.getVersions(function(err, versions) {
    menu = $("#update-version");
    versions.forEach(function(entry) {
      menu.append('<option value="' + entry.version + '">' + entry.version + '</option>');
    });
    /*menu.append('<option value="master">master</option>');*/

  });
});

$(window).resize(function() {
  var c = $('#log-console');
  var vph = $(window).height();
  var r = c.position();
  var margin = parseInt($(document.body).css('margin'), 10)
  var new_height = vph-r.top-margin;
  c.height(new_height);
  $('#log-content').height(new_height-20);
}).resize();