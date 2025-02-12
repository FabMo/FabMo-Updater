/*
 * main.js
 * 
 * This is the main module that defines the behavior of the updater front-end.
 *
 */

// Create API instance for communicating with the update service
var updater = new UpdaterAPI();

// True when there's a modal on screen
var modalShown = false;
// True when the updater is awaiting a returned 'idle' from rebooted FabMo; wait til we know it's back up
var awaitingReboot = false; 

// Left side menu.  Mostly changes the content pane, but
// jumps out of the updater altogether for a few items (dashboard, simple updater, logout)
$('.menu-item').click(function() {
    if(!this.dataset.id) {return;}
    switch(this.dataset.id) {
      case undefined:
      return;

      case 'simple-updater':
        launchSimpleUpdater();
        break;

      case 'goto-dashboard':
        var reload = false;
        launchDashboard(reload);
        break;
      
      case 'log-out':
        $.ajax({ url : '/authentication/logout', success: function(result){
          window.location.href = "/login";
        }})

      default:
        $('.content-pane').removeClass('active');
        $('#' + this.dataset.id).addClass('active');
        $('.menu-item').removeClass('active');
        $(this).addClass('active');
        break;
    }
});

// Set the OS icon to the provided value (this indicates the OS of the instance)
//   os - The OS which must be one of linux,darwin,win32,win64
function setOS(os) {
  var icons = {
    linux : 'fa fa-linux',
    darwin : 'fa fa-apple',
    win32 : 'fa fa-windows',
    win64 : 'fa fa-windows'
  }
  try {
    var iconClass = icons[os] || 'fa fa-question';
  } catch(e) {
    iconClass = 'fa fa-question';
  }
  $("#system-icon").attr('class', iconClass)
}

// Set whether or not this host is online
// TODO - I think this is old and should be removed
function setOnline(online) {
  if(online) {
    $('#update-controls').show();
    $('#message-noupdate-ap').hide();
  } else {
    $('#update-controls').hide();
    $('#message-noupdate-ap').show();
  }
}

// Flatten an object:
// Example: flattenObject({a : { b : {c : { d: 2}}}}) -> {a-b-c-d : 2}
var flattenObject = function(ob) {
  var toReturn = {};
  for (var i in ob) {
    if (!ob.hasOwnProperty(i)) continue;

    if ((typeof ob[i]) == 'object') {
      var flatObject = flattenObject(ob[i]);
      for (var x in flatObject) {
        if (!flatObject.hasOwnProperty(x)) continue;

        toReturn[i + '-' + x] = flatObject[x];
      }
    } else {
      toReturn[i] = ob[i];
    }
  }
  return toReturn;
};

// Set the provided updater configuration entry to the value specified
//      id - The key to update
//   value - The new value
function setConfig(id, value) {
  var parts = id.split("-");
  var o = {};
  var co = o;
  var i=1;

  do {
    co[parts[i]] = {};
    if(i < parts.length-1) {
      co = co[parts[i]];
    }
  } while(i++ < parts.length-1 );
  co[parts[parts.length-1]] = value;
  console.log("Setconfig: ", co)
  updater.setConfig(co, function(err, data) {
////## next previously comment out? why??
    update();
  });
}

var lastLevel = ''
// Prettify a line for "console" output
// Returns HTML that colorizes the log level
//   line - The line to format
var logLevelColors = {
  "info": "loglevel-info",
  "debug": "loglevel-debug",
  "warn": "loglevel-warn",
  "error": "loglevel-error",
  "g2": "loglevel-g2",
  "shell": "loglevel-shell"
};

function prettify(line) {
  var line_re = /^(\w*)\:(.*)/i;
  var match = line_re.exec(line);
  
  if (match) {
      var level = match[1] + ':'; // Ensure it matches the checkbox values
      if (!activeFilters.has(level)) {
          return ''; // Skip lines that don't match active filters
      }
      
      var msg = match[2];
      lastLevel = level;
      return `<span class="loglevel-${level} ">${level}</span> ${msg}\n`;
  } else {
      return line + '\n';
  }
}

function updateConsoleDisplay() {
  var log = $('#console .content');
  var allLines = log.text().split('\n');
  log.html(''); // Clear console
  allLines.forEach(function(line) {
      if (prettify(line).trim() !== '') {
          log.append(prettify(line));
      }
  });
}

function shouldDisplay(line) {
  var match = line.match(/^(\w+):/);
  if (!match) return false;

  var level = match[0]; // Log level including ":"
  return activeFilters.has(level);
}


function updateConsoleDisplay() {
  var log = $('#console .content');
  var allLines = log.text().split('\n'); // Get current logs
  log.html(''); // Clear the console
  
  allLines.forEach(function(line) {
      if (shouldDisplay(line)) {
          log.append(prettify(line));
      }
  });
}

// Print a line to the "console"
//   s - The line to print (No \n necessary)
function printf(s) {
  var log = $('#console .content');
  var lines = s.split('\n');

  lines.forEach(function(line) {
      if (shouldDisplay(line)) {  // Only add if it matches active filters
          log.append(prettify(line));
      }
  });

  var scrollpane = $('#console');
  scrollpane[0].scrollTop = scrollpane[0].scrollHeight;
}


// Store active filters
// Store active filters as a Set
var activeFilters = new Set();

// Initialize active filters based on checked checkboxes
$('.log-filter:checked').each(function() {
    activeFilters.add($(this).val());
});

// Event listener for checkbox changes
$('.log-filter').on('change', function() {
  if (this.checked) {
      activeFilters.add(this.value);
  } else {
      activeFilters.delete(this.value);
  }
  
  // Save current filter states to localStorage
  localStorage.setItem('logFilters', JSON.stringify([...activeFilters]));

  updateConsoleDisplay(); // Refresh console
});

$(document).ready(function() {
  var savedFilters = JSON.parse(localStorage.getItem('logFilters'));

  if (savedFilters) {
      activeFilters = new Set(savedFilters);

      // Apply stored filter settings to checkboxes
      $('.log-filter').each(function() {
          this.checked = activeFilters.has(this.value);
      });
  }

  updateConsoleDisplay(); // Apply filtering on load
});


// Clear the contents of the updater console
function clearConsole() {
    var log = $('#console .content');
    log.text('');
}

// Launch the "simple updater" which just applies any prepared updates with a full page spinner
// Confirm with a modal before launching
function launchSimpleUpdater() {
  showModal({
    title : 'Launch Simple Updater',
    message : 'This will launch the simple update service and <em>update your engine to the latest stable release... Are you sure you wish to do this?</em>',
    icon : 'fa-question-circle',
    okText : 'Yes',
    cancelText : 'No',
    ok : function() {
      window.open('/do_update');
    },
    cancel : function() {
      dismissModal();
    }
  })
}

// Exit the updater to the FabMo dashboard
// Confirm with a modal before exiting
function launchDashboard(hardReload) {
  showModal({
    title : 'Return to FabMo?',
    message : 'Do you want to leave the updater and return to the FabMo interface?',
    okText : 'Yes',
    cancelText : 'No',
    ok : function() {
      if (hardReload) {
          // Clear local and session storage
          localStorage.clear();
          sessionStorage.clear();
          // Reload with cache-busting parameter
          const timestamp = new Date().getTime();
          window.location.href = window.location.href.split('?')[0] + '?reload=' + timestamp;
      }
      window.open(updater.getEngineURL(), "_self");
    },
    cancel : function() {
      dismissModal();
    }
  })
}

// Update the UI to reflect the provided updater state
//   state - One of 'idle' 'disconnected' or 'updating'
function setState(state) {
    //var stateText = state.charAt(0).toUpperCase() + state.slice(1);
    var stateText = state.charAt(0) + state.slice(1);
    $('#updater-status-text').text(' ' + stateText);
    $('.label-updater-status').removeClass('info-down').addClass('info-up').text(' ' + stateText);
    $('#updater-status').removeClass('status-idle status-updating status-disconnected').addClass('status-' + state);
    var icon = $('#updater-status-icon');
    var classes = 'fa-circle-o fa-spin fa-spinner fa-chain-broken'
    var update_button = $('#btn-update-apply');
    switch(state) {
        case 'idle':
            update_button.removeClass('disabled');
            icon.removeClass(classes).addClass('fa-circle-o');
            break;

        case 'disconnected':
            update_button.addClass('disabled');
            icon.removeClass(classes).addClass('fa-chain-broken');
            break;

        case 'updating':
            update_button.addClass('disabled');
            icon.removeClass(classes).addClass('fa-spin fa-spinner');
            break;
    }
    $('#check-button-text').text(' Check for updates');
    $('#btn-check-for-updates').removeClass('disabled');
    $('#check-button-icon').removeClass('fa-spin fa-gear').addClass('fa-cloud-download');
}

// Show the modal dialog with the provided options
//   options:
//       title - The title of the dialog
//     message - The text message
//          ok - A handler to be called when the 'ok' button is clicked.  If unspecified, no ok button will be shown.
//      cancel - A handler to be called when the 'cancel' button is clicked.  If unspecified, no cancel button will be shown.
//        icon - Font-awesome icon class for an icon to be shown with the modal
// 
function showModal(options) {
  var options = options || {};

  if(modalShown) {
    return;
  }

  // Title
  if(options.title) {
    $('#modal-title').html(' ' + options.title).show();
  } else {
    $('#modal-title').hide();
  }

  // Message
  if(options.message) {
    $('#modal-text').html(options.message).show();
  } else {
    $('#modal-text').hide();
  }

  // Buttons
  if(options.ok || options.cancel) {
    $('#modal-buttons').show();
  } else {
    $('#modal-buttons').hide();
  }

  if(options.ok) {
    $('#btn-modal-ok').html(options.okText || 'Ok').show();
    $('#btn-modal-ok').click(function(evt) {
      options.ok()
    });
  } else {
    $('#btn-modal-ok').hide();
  }
  if(options.cancel) {
    $('#btn-modal-cancel').html(options.cancelText || 'Cancel').show();
    $('#btn-modal-cancel').click(function(evt) {
      options.cancel()
    });

  } else {
    $('#btn-modal-cancel').hide();
  }

  if(options.icon) {
    $('#modal-icon').removeClass().addClass('fa fa-lg ' + options.icon).show();
  } else {
    $('#modal-icon').hide();
  }
  modalShown = true;
  $('#modal').show();
}

// Close the modal without calling either the ok or cancel functions
function dismissModal() {
  if(!modalShown) { return; }
  $('#btn-modal-ok').off('click');
  $('#btn-modal-cancel').off('click');
  modalShown = false;
  $('#modal').hide();
  console.log("reloading view");   
  window.location.reload();
   
}

$(document).ready(function() {

  // Elements with the .config-input class tie directly to entries in the
  // updater config.  When they are changed, update the config.
  $('.config-input').change(function() {
    setConfig(this.id, this.value);
  });

  // Clear the console at startup
  clearConsole();
  awaitingReboot = false;

  // Updater log event - append new log messages to console and update PROGRESS report display depending on content
  updater.on('log', function(msg) {

    // Check on progress and provide global report message
    if (msg.indexOf("Received file ") > -1) {
        $('#report-progress').css("display", "block");
        log.clear();
    }   
    if (msg.indexOf("Deleting /fabmo") > -1) {
        $('#report-message').text(" UPDATE PROGRESS: Deleting old version ...");
    }   
    if (msg.indexOf("Expanding") > -1) {
        $('#report-message').text(" UPDATE PROGRESS: Expanding archive and installing new version ...");
    }   
    if (msg.indexOf("Installing firmware") > -1) {
        $('#report-message').text(" UPDATE PROGRESS: Updating real-time motion firmware ...");
    }   
    if (msg.indexOf("Starting services") > -1) {
        $('#report-message').text(" UPDATE PROGRESS: Re-starting Fabmo ...");
        awaitingReboot = true;
    }   
    // If message contains items that start with "pages)" then this is a firmware update progress report;
    // Do not display the message (it is designed for a terminal and very messy without some special handling) 
    if (($('#report-progress').css("display") == "block") && (msg.indexOf("pages)")) > -1) {
        msg =  "[====================>] 100%  FIRMWARE UPDATED";
    }

    printf(msg);

  });

  // Updater status event - update the UI to reflect the current updater status
  updater.on('status', function(status) {

    // Basic state stuff
    setState(status.state);
    setOnline(status.online);

    // Show updates if there are any to apply
    if(status.updates && status.updates.length > 0) {
      var update = status.updates[0];
      $('#message-changelog').text(update.changelog);
      $('#update-button-text').text('Update ' + update.product + ' to ' + update.version);
      $('#message-updates').removeClass('hide');
      $('#message-noupdates').addClass('hide');
      $('.update-indicator').addClass('updates-available')
      $('#check-for-updates-controls').addClass('hide');
    } else {
      $('#check-for-updates-controls').removeClass('hide');
      $('#message-updates').addClass('hide');
      $('#message-noupdates').removeClass('hide');
      $('.update-indicator').removeClass('updates-available')

    }

    // TODO - why do we dismiss the modal here?
    dismissModal();
  });

  // Show the disconnected dialog when we lose the websocket connection to the updater
  updater.on('disconnect', function(state) {
    setState('disconnected');
    showModal({
      title : 'Updater Disconnected',
      message : 'This session is no longer connected to the updater.  This message will dismiss if connection is re-established. The network connection may have changed. You may need to refresh the page and it may be necessary to log in again.',
      icon : 'fa-chain-broken'
    });
    console.log("dismissing model on disconnect");
    dismissModal();
  });

  // Additional button to return to the FabMo dashboard after uploading an update from progress report
  $('#report-progress').click(function() {
    if (updater.status.state === 'idle') {
        console.log("launching dashboard-2");
        var hardReload = true;
        launchDashboard(hardReload);
    }
  });


  // Apply prepared updates
  $("#btn-update-apply").click(function(evt) {
    evt.preventDefault();
    $('.progressbar').removeClass('hide');

    updater.applyPreparedUpdates(function(err, data) {
        awaitingReboot = false;
        setTimeout(function() {
            $('.progressbar').addClass('hide');
            // just to prevent display of leftover progress bar; reset
            $('#report-title').removeClass('fa-check').addClass('fa-spinner').addClass('fa-spin');
            $('#report-message').html("UPDATE PROGRESS: Applying prepared updates...");
            // now display it again
            $('#report-progress').css("display", "block");
            $('.progressbar .fill').width(0);
        }, 750);
    }, function(progress) {
        var pg = (progress * 100).toFixed(0) + '%';
        $('.progressbar .fill').width(pg);
    });
  });

  // Hijacking what was "Factory Reset" for FabMo Restart on Raspberry Pi ....
  // Perform the factory reset
  // This function confirms with a modal before actually doing the reset
  $("#btn-factory-reset").click( function(evt) {
      evt.preventDefault();
          clearConsole();
          updater.factoryReset();
          // delay 10 sec and then do a reload/refresh
          setTimeout(function() {
            window.location.reload();
          }, 10000);
          clearConsole();
    });


  //
  // System Functions
  //

  // Console clear button
// Get server IP dynamically from current window location
var serverIP = window.location.hostname;

var lastProcessedIndex = 0; // Track the last processed line index

async function fetchExternalLogs() {
    try {
        let response = await fetch(`http://${serverIP}/log`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        let data = await response.text();
        processExternalLogData(data);
    } catch (error) {
        console.error("Failed to fetch external logs:", error);
    }
}

// Fetch logs every 500ms
setInterval(fetchExternalLogs, 500);

function processExternalLogData(logData) {
    var logContainer = document.getElementById('external-log');

    if (!logContainer) {
        console.error("Error: Log container not found!");
        return;
    }

    // Ensure proper splitting of lines and remove empty lines
    var lines = logData.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);

    // Extract only the new lines
    let newLines = lines.slice(lastProcessedIndex);
    lastProcessedIndex = lines.length; // Update the tracker

    newLines.forEach(function(line) {
        // **Only process lines that match our log filters**
        if (/^(debug|info|g2|shell|warn|error)/i.test(line)) {
            let logEntry = document.createElement('div');
            logEntry.style.whiteSpace = "pre-wrap"; // Ensure proper word wrapping
            logEntry.style.margin = "2px 0"; // Adds spacing for readability
            logEntry.innerHTML = prettify(line); // Use innerHTML to retain styling

            logContainer.prepend(logEntry); // Prepend to show the latest logs first
        }
    });

    logContainer.scrollTop = logContainer.scrollHeight; // Auto-scroll to bottom
}



  $('#btn-console-clear').click(function() {clearConsole()});

  // Button to browse for a manual update
  $('#btn-update-manual').click(function() {
    jQuery('#file').trigger('click');
    clearConsole();
  });

  // Upload a package file manually
  $('#file').change(function(evt) {
    $('.progressbar').removeClass('hide');
    var files = [];
    for(var i=0; i<evt.target.files.length; i++) {
      files.push({file:evt.target.files[i]});
    }
    updater.submitManualUpdate(files, {}, function(err, data) {
      awaitingReboot = false;
      setTimeout(function() {
        $('.progressbar').addClass('hide');
        // just to prevent display of leftover progress bar; reset
        $('#report-title').removeClass('fa-check').addClass('fa-spinner').addClass('fa-spin');
        $('#report-message').html(" UPDATE PROGRESS: Loaded File! Beginning install ...");
        // now display it again
        $('#report-progress').css("display", "block");
        $('#file').val(null);
        $('.progressbar .fill').width(0);
      }, 750);
    }, function(progress) {
      var pg = (progress*100).toFixed(0) + '%';
      $('.progressbar .fill').width(pg);
    });
  });

  // Retrieve the updater config and populate the fields used for editing it
  updater.getConfig(function(err, config) {

    // Populate the updater version number if available
    var updater_version_number = 'unavailable';
    try{
      updater_version_number = config.version.number || config.version.hash.substring(0,8) + '-' + config.version.type
    } catch(e) {}

    // Populate various other config fields
    // TODO at least some of these are obsolete take them out
    $('.label-updater-version').text(updater_version_number);
    $('.label-wifi-network-mode').text(config.network.wifi.mode);
    $('.label-engine-git').text(config.engine_git_repos);
    $('.label-updater-git').text(config.updater_git_repos);
    $('.label-platform').text(config.os + '/' + config.platform);
    $('.label-os-version').text(config.os_version);
    $('.label-machine-id').text(config.id);

    // Set the OS from the updater config
    setOS(config.os);

    // If there are fields for other configuration entries - fill those in
    config = flattenObject(config);
    for(key in config) {
      v = config[key];
      input = $('#config-' + key);
      if(input.length) {
        input.val(String(v));
      }
    }

  });

  // Check Engine Info and Status routinely since a change can happen behind the scenes
  function engineUpdateService() {
    setTimeout(engineUpdateService,5000);

      // Populate the table of engine information
      updater.getEngineInfo(function(err, info) {
        if(err) {
          $('.label-engine-version').text('unavailable');
          $('.label-fw-build').text('unavailable');
          $('.label-fw-config').text('unavailable');
          $('.label-fw-version').text('unavailable');

        } else {
          var engine_version_number = info.version.number || info.version.hash.substring(0,8) + '-' + info.version.type
          $('.label-fw-build').text(info.firmware.build || 'unavailable');
          $('.label-fw-config').text(info.firmware.config || 'unavailable');
          $('.label-fw-version').text((info.firmware.version).replace('-dirty','') || 'unavailable');
          $('.label-engine-version').text(engine_version_number || 'unavailable');
        }
      });
      // Populate the current status of the engine and update last step in the update progress report
      updater.getEngineStatus(function(err, status) {
        if(err) {
          $('.label-engine-status').removeClass('info-up').addClass('info-down').text("down");
        } else {
            $('.label-engine-status').removeClass('info-down').addClass('info-up').text(status.state);
            if (awaitingReboot) {  
                $('#report-title').removeClass('fa-spinner').removeClass('fa-spin').addClass('fa-check');
                $('#report-message').html("COMPLETE: FabMo Restarted! (click <span> <button id='goto-dash' class='btn-black'><i class='fa fa-tachometer'></i> Return to FabMo</button></span> to continue)");
                awaitingReboot = false;
            }
        }
      });
    }

  engineUpdateService();

});
