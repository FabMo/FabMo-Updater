// Create instance for communicating with the update service
var updater = new UpdaterAPI();
var modalShown = false;

// Deal with switching tasks using the left menu
$('.menu-item').click(function() {
    if(!this.dataset.id) {return;}
    switch(this.dataset.id) {
      case undefined:
      return;

      case 'simple-updater':
        launchSimpleUpdater();
        break;

      case 'goto-dashboard':
        window.open(updater.getEngineURL());
        break;

      default:
        $('.content-pane').removeClass('active');
        $('#' + this.dataset.id).addClass('active');
        $('.menu-item').removeClass('active');
        $(this).addClass('active');
        break;      
    } 
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
            $('#network-table').hide();
            $('#no-networks-message').show();
            return callback(err);
        }
    
        // Clear the existing networks
        var table = document.getElementById('network-table');
        var rows = table.rows.length;
        for(var i=1; i<rows; i++) {
            table.deleteRow(1);
        }

        if(!networks || networks.length === 0) {
            $('#network-table').hide();
            $('#no-networks-message').show();
        } else {
            $('#network-table').show();
            $('#no-networks-message').hide();
        }
        // Add the newly defined ones
        networks.forEach(function(network) {
            var row = table.insertRow(table.rows.length);
	    row.onclick = function(evt) {
		$('#network-ssid').val(network.ssid);
		$('#network-key').focus();
	    }
	    var ssid = row.insertCell(0);
            var security = row.insertCell(1);
            var strength = row.insertCell(2);
            ssid.innerHTML = network.ssid || '<No SSID>';
            security.innerHTML = (network.security || []).join('/');
        });
        callback();
    });
}

function updateVersions() {

  // The update version menu
  updater.getVersions(function(err, versions) {
    menu1 = $("#update-version");
    //menu2 = $("#install-version");

    versions.forEach(function(entry) {
      menu1.append('<option value="' + entry.version + '">' + entry.version + '</option>');
      //menu2.append('<option value="' + entry.version + '">' + entry.version + '</option>');    
    });

  });

}

function launchSimpleUpdater() {
  showModal({
    title : 'Launch Simple Updater',
    message : 'This will launch the simple update service and <span class="emphasis">update your engine to the latest stable release...</span> Are you sure you wish to do this?',
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

function setState(state) {
    var stateText = state.charAt(0).toUpperCase() + state.slice(1);
    $('#updater-status-text').text(' ' + stateText);
    $('#updater-status').removeClass('status-idle status-updating status-disconnected').addClass('status-' + state);
    var icon = $('#updater-status-icon');
    var classes = 'fa-circle-o fa-spin fa-spinner fa-chain-broken'
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

function dismissModal() {
  if(!modalShown) { return; }
  $('#btn-modal-ok').off('click');
  $('#btn-modal-cancel').off('click');
  modalShown = false;
  $('#modal').hide();  
}

$(document).ready(function() {

  // Updater Events
  updater.on('log', function(msg) {
    printf(msg);
  });

  updater.on('status', function(status) {
    setState(status.state);
    dismissModal();
  });

  updater.on('disconnect', function(state) {
    setState('disconnected');
    showModal({
      title : 'Updater Disconnected',
      message : 'This session is no longer connected to the updater.  This may be because the updater has changed networks.  This message will dismiss if connection is reestablished.',
      icon : 'fa-chain-broken'
    });
  });


  //
  // Updates
  //
  $("#btn-update-latest").click( function(evt) { 
    evt.preventDefault();
    updater.updateEngine('master');
  });

  $("#form-update-stable").submit(function(evt) {
    evt.preventDefault();
    updater.updateEngine($("#update-version").val());
  });

  $("#btn-update-firmware").click( function(evt) { 
    evt.preventDefault();
    updater.updateFirmware();
  });


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

  // 
  // Network Management
  //
  $("#btn-network-ap-mode").click(function() {updater.enableHotspot()});

  $("#form-network-id").submit(function(evt) {
    evt.preventDefault();
    var name = $('#network-name').val();
    var password = $('#network-password').val();
    var options = {};
    if(name) {
        options['name'] = name;
    }
    if(password) {
        options['password'] = password;
    }

    updater.setNetworkIdentity(options, function(err, data) {
        if(err) {
          console.error(err);
        } else {
          updater.getNetworkIdentity(function(err, id) {
            $(".label-network-id").text(id.name);
          });
        }
      });
  });

  $("#form-join-network").submit(function(evt) {
    evt.preventDefault();
    var ssid = $('#network-ssid').val();
    var key = $('#network-key').val();
    updater.connectToWifi(ssid, key);
  });

  //
  // System Functions
  //
  $("#btn-start-engine").click(function() {updater.startEngine()});
  $("#btn-stop-engine").click(function() {updater.stopEngine()});

  // Pull available update versions
  updateVersions();
  // Start a polling loop for networks...
  function updateService() {
    updateNetworks(function(err) {
        setTimeout(updateService,5000);
    });
  }
  updateService();

  updater.getNetworkIdentity(function(err, id) {
    $(".label-network-id").text(id.name);
  });

  updater.getConfig(function(err, config) {
    $('.label-network-mode').text(config.network.mode)
    $('.label-engine-git').text(config.engine_git_repos)
    $('.label-updater-git').text(config.updater_git_repos)
  });


});
