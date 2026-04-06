/*
 * main.js
 * 
 * This is the main module that defines the behavior of the updater front-end.
 *
 */

// Polling interval for FabMo engine console log and status (ms)
var FABMO_POLL_INTERVAL_MS = 2000;

// Create API instance for communicating with the update service
var updater = new UpdaterAPI();

// True when there's a modal on screen
var modalShown = false;
// True when the updater is awaiting a returned 'idle' from rebooted FabMo; wait til we know it's back up
var awaitingReboot = false;
// True while an update check is in progress
var checkInProgress = false;

// On page load, check if a specific pane was requested via URL hash
if (window.location.hash) {
    var targetPane = window.location.hash.substring(1);
    if ($('#' + targetPane).length) {
        $('.content-pane').removeClass('active');
        $('#' + targetPane).addClass('active');
        $('.menu-item').removeClass('active');
        $('.menu-item[data-id="' + targetPane + '"]').addClass('active');
    }
    // Clear the hash so a normal refresh goes back to default
    history.replaceState(null, null, window.location.pathname);
}

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

// Populate the version selector dropdown from the server's list of available git tags
function populateVersionDropdown() {
  fetch('/update/versions')
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.status !== 'success') {
        throw new Error('Failed to get version list');
      }

      var select = document.getElementById('version-select');
      select.innerHTML = '';

      var versions = data.data.versions;

      // Sort descending by version number
      versions.sort(function(a, b) {
        return b.version.localeCompare(a.version, undefined, { numeric: true, sensitivity: 'base' });
      });

      versions.forEach(function(ver) {
        var option = document.createElement('option');
        option.value = ver.version;
        option.textContent = ver.version;
        select.appendChild(option);
      });
    })
    .catch(function(err) {
      console.error('Failed to load versions:', err);
      var select = document.getElementById('version-select');
      select.innerHTML = '<option value="">Error loading versions</option>';
    });
}

// Run on page load
document.addEventListener('DOMContentLoaded', populateVersionDropdown);

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
// Returns HTML that colorizes the log level and wraps the line in a
// filterable block element.
//   line - The line to format
function prettify(line) {
  var line_re = /^(\w*)\:(.*)/i;
  var match = line_re.exec(line);
  if(match) {
    var level = match[1].toLowerCase();
    var msg = match[2];
    // Detect [g2] logger-name suffix and override the level so the G2 filter works
    if (/\[g2\]/i.test(msg)) {
      level = 'g2';
    }
    lastLevel = level;
    return '<div class="log-line level-' + level + '"><span class="loglevel-' + level + '">' + level + ':</span>' + msg + '</div>'
  } else {
    return '<div class="log-line level-' + lastLevel + '">' + line + '</div>'
  }
}

// Print a line to the "console"
//   s - The line to print (No \n necessary)
function printf(s) {
    var log = $('#console .content');
    lines = s.split('\n');
    lines.forEach(function(line) {
        log.append(prettify(line));
    });
    var scrollpane = $('#console');
    scrollpane[0].scrollTop = scrollpane[0].scrollHeight;
}

// Clear the contents of the active console panel
function clearConsole() {
    var activePanel = localStorage.getItem('active-console-panel') || 'updater-wrapper';
    if (activePanel === 'updater-wrapper') {
        $('#console .content').text('');
    } else if (activePanel === 'fabmo-wrapper') {
        $('#external-log').text('');
    } else if (activePanel === 'terminal-wrapper') {
        if (typeof xterm !== 'undefined' && xterm) { xterm.clear(); }
    }
}

// ---------------------------------------------------------------------------
// Log-level filter (CSS-based)
// ---------------------------------------------------------------------------
// Checkbox values match CSS class suffixes: info, debug, warn, error, g2, shell
// Unchecking a level adds 'filter-hide-{level}' to #console; matching
// .log-line elements are hidden via CSS without re-rendering the log.

function applyStoredFilters() {
  $('.log-filter').each(function() {
    var level = this.value;
    var hidden = localStorage.getItem('filter-hide-' + level) === '1';
    if (hidden) {
      $('#console').addClass('filter-hide-' + level);
      $('#fabmo-console').addClass('filter-hide-' + level);
      $(this).prop('checked', false);
    } else {
      $('#console').removeClass('filter-hide-' + level);
      $('#fabmo-console').removeClass('filter-hide-' + level);
      $(this).prop('checked', true);
    }
  });
}

$(document).on('change', '.log-filter', function() {
  var level = this.value;
  if (this.checked) {
    $('#console').removeClass('filter-hide-' + level);
    $('#fabmo-console').removeClass('filter-hide-' + level);
    localStorage.removeItem('filter-hide-' + level);
  } else {
    $('#console').addClass('filter-hide-' + level);
    $('#fabmo-console').addClass('filter-hide-' + level);
    localStorage.setItem('filter-hide-' + level, '1');
  }
});

// ---------------------------------------------------------------------------
// Panel tabs (Updater / FabMo / Status / Terminal) – single selection
// ---------------------------------------------------------------------------
function initPanelTabs() {
  var panels = ['updater-wrapper', 'fabmo-wrapper', 'status-wrapper', 'terminal-wrapper'];
  var stored = localStorage.getItem('active-console-panel');
  if (!stored || panels.indexOf(stored) === -1) { stored = 'updater-wrapper'; }

  // Activate the stored (or default) panel
  panels.forEach(function(p) { $('#' + p).removeClass('panel-active'); });
  $('#' + stored).addClass('panel-active');
  $('.console-tab').removeClass('active');
  $('.console-tab[data-panel="' + stored + '"]').addClass('active');

  // Show/hide log filter controls based on which panel is active
  if (stored === 'terminal-wrapper' || stored === 'status-wrapper') {
    $('.console-filter-group').hide();
  }

  // If restored panel is Terminal, initialize it
  if (stored === 'terminal-wrapper') { initTerminal(); }

  // Tab click handler
  $(document).on('click', '.console-tab', function() {
    var target = $(this).data('panel');
    panels.forEach(function(p) { $('#' + p).removeClass('panel-active'); });
    $('#' + target).addClass('panel-active');
    $('.console-tab').removeClass('active');
    $(this).addClass('active');
    localStorage.setItem('active-console-panel', target);

    // Hide log filters for panels that don't use them
    if (target === 'terminal-wrapper' || target === 'status-wrapper') {
      $('.console-filter-group').hide();
    } else {
      $('.console-filter-group').show();
    }

    // Lazy-init the terminal on first switch; re-fit on every switch
    if (target === 'terminal-wrapper') {
      initTerminal();
      if (termFitAddon) {
        setTimeout(function() { termFitAddon.fit(); }, 50);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Interactive Terminal – xterm.js + Socket.IO PTY
// ---------------------------------------------------------------------------
var terminalInitialized = false;
var terminalSocket = null;
var xterm = null;
var termFitAddon = null;
var terminalSessionDead = false;

function initTerminal() {
  if (terminalInitialized) { return; }
  if (typeof Terminal === 'undefined') {
    $('#terminal-container').html(
      '<p style="color:#e85169; padding:10px; font-family:monospace;">' +
      'xterm.js not loaded — terminal is unavailable.</p>'
    );
    return;
  }
  terminalInitialized = true;

  // Check if the server-side PTY backend is available before proceeding
  var container = document.getElementById('terminal-container');
  fetch('/terminal/status')
    .then(function(r) { return r.json(); })
    .then(function(info) {
      if (!info.available) {
        container.innerHTML =
          '<p style="color:#e6d369; padding:10px; font-family:monospace;">' +
          'Interactive terminal is not available on this system.<br>' +
          '<span style="color:#888; font-size:11px;">The <code>node-pty</code> native module is not installed. ' +
          'See the updater log for details.</span></p>';
        return;
      }
      startTerminalSession(container);
    })
    .catch(function() {
      container.innerHTML =
        '<p style="color:#e85169; padding:10px; font-family:monospace;">' +
        'Could not reach terminal backend.</p>';
    });
}

function startTerminalSession(container) {
  xterm = new Terminal({
    cursorBlink: true,
    fontSize: 12,
    fontFamily: '"Lucida Console", Monaco, monospace',
    theme: {
      background: '#222222',
      foreground: '#ebebeb'
    }
  });

  if (typeof FitAddon !== 'undefined') {
    termFitAddon = new FitAddon.FitAddon();
    xterm.loadAddon(termFitAddon);
  }

  xterm.open(container);
  if (termFitAddon) { termFitAddon.fit(); }

  // Connect to the /terminal Socket.IO namespace
  var url = window.location.origin;
  terminalSocket = io(url + '/terminal');

  terminalSocket.on('connect', function() {
    var dims = termFitAddon
      ? { cols: xterm.cols, rows: xterm.rows }
      : { cols: 80, rows: 24 };
    terminalSocket.emit('terminal:start', dims);
  });

  terminalSocket.on('terminal:output', function(data) {
    xterm.write(data);
  });

  terminalSocket.on('terminal:exit', function() {
    xterm.write('\r\n\x1b[33m[Session ended — press any key to reconnect]\x1b[0m\r\n');
    terminalSessionDead = true;
  });

  terminalSocket.on('terminal:error', function(msg) {
    xterm.write('\r\n\x1b[31m[Error: ' + msg + ']\x1b[0m\r\n');
  });

  // User keystrokes → server PTY
  xterm.onData(function(data) {
    if (!terminalSocket || !terminalSocket.connected) { return; }
    if (terminalSessionDead) {
      terminalSessionDead = false;
      xterm.clear();
      var dims = termFitAddon
        ? { cols: xterm.cols, rows: xterm.rows }
        : { cols: 80, rows: 24 };
      terminalSocket.emit('terminal:start', dims);
      return;
    }
    terminalSocket.emit('terminal:input', data);
  });

  // Re-fit and notify server when the browser window resizes
  var resizeTimeout;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(function() {
      if (termFitAddon && document.getElementById('terminal-wrapper').classList.contains('panel-active')) {
        termFitAddon.fit();
        if (terminalSocket && terminalSocket.connected) {
          terminalSocket.emit('terminal:resize', { cols: xterm.cols, rows: xterm.rows });
        }
      }
    }, 150);
  });
}

// ---------------------------------------------------------------------------
// FabMo Console – poll the engine's /log endpoint
// ---------------------------------------------------------------------------
// Track the last line we displayed so we can find new content in the
// engine's circular buffer.  Index-based tracking breaks when the buffer
// is full (always 5000 lines) because the count never increases.
var fabmoLastLine = '';
var fabmoFirstLoad = true;

function fetchExternalLogs() {
  fetch(updater.engine_url + '/log')
    .then(function(response) {
      if (!response.ok) { return; }
      return response.text();
    })
    .then(function(data) {
      if (data) { processExternalLogData(data); }
    })
    .catch(function() {
      // Silently ignore – engine may not be running
    });
}

function processExternalLogData(logData) {
  var logContainer = document.getElementById('external-log');
  if (!logContainer) { return; }

  var lines = logData.split(/\r?\n/).filter(function(l) { return l.trim().length > 0; });

  if (lines.length === 0) { return; }

  var newLines;

  if (fabmoFirstLoad || !fabmoLastLine) {
    // First load — render the entire buffer
    newLines = lines;
    fabmoFirstLoad = false;
  } else {
    // Find the last line we displayed in the new buffer
    var matchIdx = -1;
    // Search from the end since our last line should be near the tail
    for (var i = lines.length - 1; i >= 0; i--) {
      if (lines[i] === fabmoLastLine) {
        matchIdx = i;
        break;
      }
    }
    if (matchIdx === -1) {
      // Last line is gone (buffer has fully cycled) — show everything
      newLines = lines;
    } else {
      newLines = lines.slice(matchIdx + 1);
    }
  }

  if (newLines.length === 0) { return; }

  // Remember the last line for next comparison
  fabmoLastLine = lines[lines.length - 1];

  // Only auto-scroll if the user is already near the bottom
  var scrollPane = logContainer.parentElement;
  var atBottom = (scrollPane.scrollHeight - scrollPane.scrollTop - scrollPane.clientHeight) < 40;

  newLines.forEach(function(line) {
    logContainer.insertAdjacentHTML('beforeend', prettify(line));
  });

  // Cap displayed lines so the DOM doesn't grow unbounded
  var maxDisplayed = 8000;
  while (logContainer.children.length > maxDisplayed) {
    logContainer.removeChild(logContainer.firstChild);
  }

  if (atBottom) {
    scrollPane.scrollTop = scrollPane.scrollHeight;
  }
}

// ---------------------------------------------------------------------------
// Status panel – poll the engine's /status endpoint
// ---------------------------------------------------------------------------
function fetchStatusData() {
  fetch(updater.engine_url + '/status')
    .then(function(response) {
      if (!response.ok) { return; }
      return response.json();
    })
    .then(function(data) {
      if (data) { updateStatusConsole(data); }
    })
    .catch(function() {
      // Silently ignore – engine may not be running
    });
}

function updateStatusConsole(statusData) {
  var container = document.getElementById('status-content');
  if (!container) { return; }

  // Extract the relevant data object (the engine wraps data in { status:'success', data:{...} })
  var payload = (statusData && statusData.data) ? statusData.data : statusData;

  // Render as prettified, syntax-highlighted JSON
  container.innerHTML = '<pre class="json-pretty">' + syntaxHighlightJSON(payload) + '</pre>';
}

// Syntax-highlight a JSON object for display in the status panel
function syntaxHighlightJSON(obj) {
  var json = JSON.stringify(obj, null, 2);
  // Escape HTML entities
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Wrap tokens in spans for colouring
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    function(match) {
      var cls = 'json-number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key';
        } else {
          cls = 'json-string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return '<span class="' + cls + '">' + match + '</span>';
    }
  );
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
    $('#check-button-text').text(' Check again for new Updates');
    if(!checkInProgress) {
      $('#btn-check-for-updates').removeClass('disabled');
      $('#check-button-icon').removeClass('fa-spin fa-gear fa-cog').addClass('fa-cloud-download');
    }
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

  // Restore saved log-filter and panel-tab states
  applyStoredFilters();
  initPanelTabs();

  // Start polling the FabMo engine for its console log and status
  setInterval(fetchExternalLogs, FABMO_POLL_INTERVAL_MS);
  setInterval(fetchStatusData,   FABMO_POLL_INTERVAL_MS);

  // Auto-check for updates on startup
  checkInProgress = true;
  $('#btn-check-for-updates').addClass('disabled');
  $('#check-button-icon').removeClass('fa-cloud-download').addClass('fa-cog fa-spin');
  $('#check-button-text').text('Checking...');
  updater.checkForUpdates(function() {
    // If checkInProgress is still true, the status event didn't find updates
    if (checkInProgress) {
      checkInProgress = false;
      $('#message-noupdates').html('There are no new software updates available for automatic download.').removeClass('hide');
      $('#btn-check-for-updates').removeClass('disabled');
      $('#check-button-icon').removeClass('fa-spin fa-gear fa-cog').addClass('fa-cloud-download');
      $('#check-button-text').text(' Check again for new Updates');
    }
  });

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
        $('#report-message').text(" UPDATE PROGRESS: Re-starting and Configuring FabMo ...");
        awaitingReboot = true;
    }
    // Firmware flash progress messages from update_firmware.sh
    if (msg.indexOf("Stopping the engine") > -1) {
        $('#report-message').text(" FIRMWARE UPDATE: Stopping the engine ...");
    }
    if (msg.indexOf("triggering bootloader") > -1 || msg.indexOf("Triggering bootloader") > -1) {
        $('#report-message').text(" FIRMWARE UPDATE: Triggering bootloader mode ...");
    }
    if (msg.indexOf("Waiting for bootloader") > -1) {
        $('#report-message').text(" FIRMWARE UPDATE: Waiting for bootloader mode ...");
    }
    if (msg.indexOf("Trying") > -1 && msg.indexOf("/dev/") > -1) {
        $('#report-message').text(" FIRMWARE UPDATE: " + msg.trim() + " ...");
    }
    if (msg.indexOf("Success on") > -1) {
        $('#report-message').text(" FIRMWARE UPDATE: Flash succeeded! Setting boot flag ...");
    }
    if (msg.indexOf("Firmware loaded") > -1) {
        $('#report-message').text(" FIRMWARE UPDATE: Firmware loaded. Restarting FabMo ...");
        awaitingReboot = true;
    }
    if (msg.indexOf("Updated firmware successfully") > -1) {
        awaitingReboot = true;
    }
    if (msg.indexOf("Did not update firmware") > -1 || msg.indexOf("ERROR: bossac") > -1) {
        $('#report-title').removeClass('fa-spinner').removeClass('fa-spin').addClass('fa-exclamation-triangle');
        $('#report-message').html(" FIRMWARE UPDATE FAILED: " + msg.trim());
        awaitingReboot = false;
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
      if (update.product === 'FabMo-Engine') {
        var tempName = 'FabMo';
      } else {
        var tempName = update.product;
      }
      $('#update-button-text').text('Click to Update ' + tempName + ' to ' + update.version);
      $('#message-updates').removeClass('hide');
      $('#message-noupdates').addClass('hide');
      $('.update-indicator').addClass('updates-available')
      $('#check-for-updates-controls').addClass('hide');
      checkInProgress = false;
    } else if (!checkInProgress) {
      $('#check-for-updates-controls').removeClass('hide');
      $('#message-updates').addClass('hide');
      $('#message-noupdates').html('There are no new software updates available for automatic download.').removeClass('hide');
      $('.update-indicator').removeClass('updates-available');
      $('#btn-check-for-updates').removeClass('disabled');
      $('#check-button-icon').removeClass('fa-spin fa-gear fa-cog').addClass('fa-cloud-download');
      $('#check-button-text').text(' Check again for new Updates');
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
        $('#report-progress').css('display', 'none');
        console.log("launching dashboard-2");
        var hardReload = true;
        launchDashboard(hardReload);
    }
  });

// TODO Obsolete?
  $("#btn-update-latest").click( function(evt) {
    evt.preventDefault();
    updater.updateEngine('master');
  });

  // TODO Obsolete?
  $("#btn-update-updater-latest").click( function(evt) {
    evt.preventDefault();
    updater.updateUpdater('master');
  });

  // TODO Obsolete?
  $("#form-update-stable").submit(function(evt) {
    evt.preventDefault();
    updater.updateEngine($("#update-version").val());
  });

  // TODO Obsolete?
  $("#btn-update-firmware").click( function(evt) {
    evt.preventDefault();
    updater.updateFirmware();
  });

  // TODO Obsolete?
  $("#btn-reinstall").click( function(evt) {
      evt.preventDefault();
      showModal({
        title : 'Reinstall Engine?',
        message : 'This will reinstall the FabMo engine <em>from scratch</em> - You will lose all your settings and apps, and will take several minutes.  This is only to be done in circumstances in which <em>the engine is corrupted and unrecoverable by any other means</em> - Are you sure you wish to do this?  Are you absolutely sure?',
        icon : 'fa-exclamation-circle',
        okText : 'Yes!  I understand the risk!',
        cancelText : 'No!  Get me out of here!',
        ok : function() {
          updater.installEngine()
        },
        cancel : function() {
          dismissModal();
        }
      });
  });

  // Apply prepared updates
  $("#btn-update-apply").click(function(evt) {
    evt.preventDefault();
    $('#message-noupdates').addClass('hide');
    $('#btn-update-apply').addClass('disabled');

    // Show progress bar immediately
    $('#report-title').removeClass('fa-check fa-exclamation-triangle').addClass('fa-spinner fa-spin');
    $('#report-message').html(" UPDATE PROGRESS: Applying prepared updates...");
    $('#report-progress').css("display", "block");

    updater.applyPreparedUpdates(function(err, data) {
        // Upload complete - server is now processing
    }, function(progress) {
        var pg = (progress * 100).toFixed(0) + '%';
        $('#report-message').html(" UPDATE PROGRESS: Uploading ... " + pg);
    });
  });

  // Hijacking what was "Factory Reset" for FabMo Restart on Raspberry Pi ....
  // Perform the factory reset
  // This function confirms with a modal before actually doing the reset
  $("#btn-factory-reset").click( function(evt) {
      evt.preventDefault();
          clearConsole();
          updater.factoryReset();
          // delay 10 sec and then reload, landing on System Info pane
          setTimeout(function() {
            window.location.hash = 'view-info';
            window.location.reload();
          }, 10000);
          clearConsole();
    });


  //
  // System Functions
  //

  // TODO - Obsolete?
  $("#btn-start-engine").click(function() {updater.startEngine()});
  $("#btn-stop-engine").click(function() {updater.stopEngine()});

  $("#btn-check-for-updates").click(function() {
    checkInProgress = true;
    $("#btn-check-for-updates").addClass('disabled');
    $('#check-button-icon').removeClass('fa-cloud-download').addClass('fa-cog fa-spin');
    $("#check-button-text").text('Checking...');
    $('#message-noupdates').html('<i class="fa fa-cog fa-spin"></i> Checking for updates ...');
    clearConsole();
    updater.checkForUpdates(function() {
      if (checkInProgress) {
        checkInProgress = false;
        $('#message-noupdates').html('There are no new software updates available for automatic download.').removeClass('hide');
        $('#btn-check-for-updates').removeClass('disabled');
        $('#check-button-icon').removeClass('fa-spin fa-gear fa-cog').addClass('fa-cloud-download');
        $('#check-button-text').text(' Check again for new Updates');
      }
    });
  });

  // Download and apply a specific version from the version selector dropdown
  $("#btn-download-version").click(function() {
    var select = document.getElementById('version-select');
    var version = select.value;

    if (!version) {
      return alert('Please select a version to download.');
    }

    // UI: show downloading state
    $("#btn-download-version").addClass('disabled');
    $("#btn-check-for-updates").addClass('disabled');
    $('#version-button-icon').removeClass('fa-cloud-download').addClass('fa-cog fa-spin');
    $("#version-button-text").text('Downloading ' + version + ' ...');

    updater.downloadEngineVersion({ version: version },
      function(err) {
        console.error('Download failed:', err);
        alert('Download failed: ' + (err.message || err));
        // Reset UI
        $("#btn-download-version").removeClass('disabled');
        $("#btn-check-for-updates").removeClass('disabled');
        $('#version-button-icon').removeClass('fa-cog fa-spin').addClass('fa-cloud-download');
        $("#version-button-text").text(' Download Selected Version: ');
      },
      function(err, result) {
        console.log('Download complete:', result);

        // Show progress and auto-apply the downloaded update
        $('#version-button-icon').removeClass('fa-cog fa-spin').addClass('fa-spinner fa-spin');
        $("#version-button-text").text(' Applying Update ' + version + ' ...');
        $('#report-title').removeClass('fa-check fa-exclamation-triangle').addClass('fa-spinner fa-spin');
        $('#report-message').html(' UPDATE PROGRESS: Applying downloaded update...');
        $('#report-progress').css('display', 'block');

        updater.applyPreparedUpdates(function(err, data) {
          // Apply started - server is now processing
        }, function(progress) {
          var pg = (progress * 100).toFixed(0) + '%';
          $('#report-message').html(' UPDATE PROGRESS: Installing ... ' + pg);
        });
      }
    );
  });

  // Console clear button
  $('#btn-console-clear').click(function() {clearConsole()});

  // Button to browse for a manual update
  $('#btn-update-manual').click(function() {
    $('#message-noupdates').addClass('hide');
    jQuery('#file').trigger('click');
    clearConsole();
  });

  // Button to browse for a firmware .bin file
  $('#btn-firmware-upload').click(function() {
    jQuery('#firmware-file').trigger('click');
    clearConsole();
  });

  // Upload a firmware .bin file
  $('#firmware-file').change(function(evt) {
    var files = [];
    for(var i=0; i<evt.target.files.length; i++) {
      files.push({file:evt.target.files[i]});
    }
    clearConsole();
    $('#report-progress').css('display', 'block');
    $('#report-title').removeClass('fa-check fa-exclamation-triangle').addClass('fa-spinner fa-spin');
    $('#report-message').html(' FIRMWARE UPDATE: Uploading firmware file ...');
    updater.submitFirmwareUpdate(files, {}, function(err, data) {
      $('#report-message').html(' FIRMWARE UPDATE: Firmware file uploaded! Flashing ...');
      awaitingReboot = true;
      $('#firmware-file').val(null);
    }, function(progress) {
      var pg = (progress*100).toFixed(0) + '%';
      $('#report-message').html(' FIRMWARE UPDATE: Uploading firmware file ... ' + pg);
    });
  });

  // Button to reload current firmware from disk
  $('#btn-firmware-reload').click(function(evt) {
    evt.preventDefault();
    showModal({
      title : 'Reload Firmware?',
      message : 'This will re-flash the G2 motion controller with the current firmware file on disk (/fabmo/firmware/g2.bin). The engine will be stopped during flashing. Continue?',
      icon : 'fa-microchip',
      okText : 'Yes, Reload',
      cancelText : 'Cancel',
      ok : function() {
        // Close the modal without a full page reload
        $('#btn-modal-ok').off('click');
        $('#btn-modal-cancel').off('click');
        modalShown = false;
        $('#modal').hide();

        clearConsole();
        $('#report-progress').css('display', 'block');
        $('#report-title').removeClass('fa-check').addClass('fa-spinner').addClass('fa-spin');
        $('#report-message').html(' UPDATE PROGRESS: Reloading firmware from disk ...');
        awaitingReboot = true;
        updater.reloadFirmware(function(err, data) {
          if(err) {
            awaitingReboot = false;
            $('#report-title').removeClass('fa-spinner').removeClass('fa-spin').addClass('fa-exclamation-triangle');
            $('#report-message').html(' Firmware reload failed: ' + (err.message || err));
          }
        });
      },
      cancel : function() {
        dismissModal();
      }
    });
  });

  // Upload a package file manually
  $('#file').change(function(evt) {
    $('.progressbar').removeClass('hide');
    $('#btn-update-manual').addClass('disabled');
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
          $('.label-fw-build').text('unavailable)');
          $('.label-fw-config').text('unavailable');
          $('.label-fw-version').text('unavailable');

        } else {
          var engine_version_number = info.version.number || info.version.hash.substring(0,8) + '-' + info.version.type
          $('.label-fw-build').text(info.firmware.build + ')' || 'unavailable)');
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
