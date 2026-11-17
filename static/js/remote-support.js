/*
 * remote-support.js
 *
 * The remote-support controls at the top of the Software Updates view: get
 * a code to read to a ShopBot technician, grant full access once they are
 * connected, end the session. The same controls are in the dashboard
 * (Settings > General > Software); they are here too so that support can be
 * reached when the engine is not running. See support/README.md.
 *
 * Checks the state on load, then follows it only while a code is waiting or
 * a session is open.
 */
(function () {
  var MINUTES = 120;
  var session = null;
  var watching = null;

  function api(method, path, body) {
    return $.ajax({
      url: path,
      type: method,
      dataType: 'json',
      contentType: body ? 'application/json' : undefined,
      data: body ? JSON.stringify(body) : undefined
    }).then(function (j) {
      if (!j || j.status !== 'success') {
        return $.Deferred().reject(new Error((j && j.message) || 'The machine did not answer as expected.'));
      }
      return j.data;
    }, function () {
      return $.Deferred().reject(new Error('Could not reach the machine.'));
    });
  }

  function clock(seconds) {
    return new Date(seconds * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function say(text) {
    text = String(text || '');
    $('#support-msg').text(text.charAt(0).toUpperCase() + text.slice(1));
  }

  function show(id) {
    ['btn-support-request', 'support-waiting', 'support-open'].forEach(function (k) {
      $('#' + k).toggleClass('hide', k !== id);
    });
  }

  function render() {
    var p = session.pending;
    if (session.active) {
      $('#support-open-text').text(
        (session.viaTunnel ? 'You are connected' : 'Remote support is open') + ' · closes ' + clock(session.expires)
      );
      // granting is the customer's to do; the technician never sees the button
      $('#btn-support-elevate').toggleClass('hide', session.level === 'system' || !!session.viaTunnel);
      $('#support-elevated').toggleClass('hide', session.level !== 'system');
      show('support-open');
    } else if (p && p.state !== 'failed' && !session.viaTunnel) {
      $('#support-code').text(String(p.code || '').replace(/^(.{3})(.+)$/, '$1 $2')).toggleClass('hide', p.state !== 'waiting');
      $('#btn-support-cancel').toggleClass('hide', p.state !== 'waiting');
      $('#support-wait-text').text(p.state === 'waiting'
        ? 'Read this code to your technician'
        : (p.tech || 'Your technician') + ' is connecting…');
      show('support-waiting');
    } else {
      if (p && p.state === 'failed') { say(p.error); }
      // a session can only be opened by someone at the machine
      $('#btn-support-request').prop('disabled', !!session.viaTunnel);
      show('btn-support-request');
    }
    var busy = session.active || (p && p.state !== 'failed');
    if (busy && !watching) { watching = setInterval(refresh, 3000); }
    if (!busy && watching) { clearInterval(watching); watching = null; }
  }

  function refresh() {
    return api('GET', '/support/status').then(function (s) {
      session = s;
      render();
    }, function () {
      $('#support-block').hide();
    });
  }

  function act($button, call) {
    say('');
    $button.prop('disabled', true);
    call().then(refresh, function (err) { say(err.message); })
      .always(function () { $button.prop('disabled', false); });
  }

  $(function () {
    $('#btn-support-request').click(function () {
      act($(this), function () {
        // clear a failed attempt first; harmless when there is none
        return api('POST', '/support/cancel').then(null, function () { return $.Deferred().resolve(); })
          .then(function () { return api('POST', '/support/request', { level: 'dashboard', minutes: MINUTES }); });
      });
    });
    $('#btn-support-cancel').click(function () { act($(this), function () { return api('POST', '/support/cancel'); }); });
    $('#btn-support-elevate').click(function () { act($(this), function () { return api('POST', '/support/elevate'); }); });
    $('#btn-support-stop').click(function () {
      var viaTunnel = session && session.viaTunnel;
      act($(this), function () {
        return api('POST', '/support/stop').then(null, function (err) {
          // ended from the technician's side: the connection the answer
          // would have come back on is what just closed
          return viaTunnel ? $.Deferred().resolve() : $.Deferred().reject(err);
        });
      });
    });
    refresh();
  });
})();
