Raven.config('https://65c765cf0c7543d5b3f262503ec5fd5a@sentry.io/106023', {
    release: chrome.runtime.getManifest().version
}).install()

// handle bluebird promise rejection
window.onunhandledrejection = function(evt) {
  Raven.captureException(evt.reason);
};

