if (typeof Raven !== 'undefined') {
  Raven.config('https://65c765cf0c7543d5b3f262503ec5fd5a@sentry.io/106023', {
    release: chrome.runtime.getManifest().version,
    environment: (('update_url' in chrome.runtime.getManifest()) ? 'production' : 'development')
  }).install();

  // handle bluebird promise rejection
  window.onunhandledrejection = function(evt) {
    Raven.captureException(evt.reason);
  };
}
else {
  // mock used Raven methods here
  Raven = {
    captureException: function(e) {
      console.error(e);
    },
    setExtraContext: function() {
    }
  }
  console.warn("Sentry's raven.js has not been compiled in, exceptions will not be reported");
}

