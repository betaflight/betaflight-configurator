Raven.config('https://405b7f80a3c94e1ba0d6723f65795757@sentry.io/106024', {
    release: chrome.runtime.getManifest().version
}).install()

// handle bluebird promise rejection
window.onunhandledrejection = function(evt) {
  Raven.captureException(evt.reason);
};

