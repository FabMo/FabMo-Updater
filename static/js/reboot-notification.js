/*
 * reboot-notification.js
 * 
 * Functions for displaying and managing the system reboot notification banner
 */

// Check the updater status for reboot requirements and show/hide banner accordingly
function checkForRebootNotification(status) {
  if (status && status.rebootRequired) {
    var message = status.rebootMessage || 'System restart recommended';
    var timestamp = status.rebootTimestamp;
    showRebootBanner(message, timestamp);
  } else {
    hideRebootBanner();
  }
}

// Display the reboot notification banner with the given message
function showRebootBanner(message, timestamp) {
  var banner = $('#reboot-notification');
  if (banner.is(':visible')) {
    // Already shown, just update the message
    $('#reboot-notification-message').text(message);
    if (timestamp) {
      var date = new Date(timestamp);
      var timeStr = date.toLocaleString();
      $('#reboot-notification-details').text('Patches were applied on ' + timeStr + ' that require a reboot to take full effect.');
    }
    return;
  }

  // Update content
  $('#reboot-notification-message').text(message);
  if (timestamp) {
    var date = new Date(timestamp);
    var timeStr = date.toLocaleString();
    $('#reboot-notification-details').text('Patches were applied on ' + timeStr + ' that require a reboot to take full effect.');
  } else {
    $('#reboot-notification-details').text('Patches were applied that require a reboot to take full effect.');
  }

  // Show banner
  banner.show();
  $('body').addClass('reboot-banner-shown');

  // Setup button handlers (remove old handlers first to prevent duplicates)
  $('#btn-reboot-now').off('click').on('click', function() {
    rebootNow();
  });

  $('#btn-reboot-dismiss').off('click').on('click', function() {
    dismissRebootNotification();
  });
}

// Hide the reboot notification banner
function hideRebootBanner() {
  $('#reboot-notification').hide();
  $('body').removeClass('reboot-banner-shown');
}

// Dismiss the reboot notification (calls API to clear the flag)
function dismissRebootNotification() {
  fetch('/system/patches/dismiss-reboot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  .then(function(response) {
    if (response.ok) {
      hideRebootBanner();
    } else {
      console.error('Failed to dismiss reboot notification');
    }
  })
  .catch(function(err) {
    console.error('Error dismissing reboot notification:', err);
  });
}

// Trigger a system reboot with confirmation modal
function rebootNow() {
  showModal({
    title: 'Reboot System',
    message: 'Are you sure you want to reboot the system now? This will interrupt any running operations.',
    icon: 'fa-exclamation-triangle',
    okText: 'Reboot Now',
    cancelText: 'Cancel',
    ok: function() {
      fetch('/system/reboot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      .then(function() {
        showModal({
          title: 'System Rebooting',
          message: 'The system is rebooting. This page will need to be refreshed when the system comes back online.',
          icon: 'fa-refresh fa-spin'
        });
      })
      .catch(function(err) {
        console.error('Error rebooting system:', err);
        dismissModal();
      });
    },
    cancel: function() {
      dismissModal();
    }
  });
}
