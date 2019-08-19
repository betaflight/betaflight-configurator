var appdmg = require('appdmg');
var through = require('through2');
var log = require('fancy-log');

var PluginError = require('plugin-error');
var PLUGIN_NAME = 'gulp-appdmg';

module.exports = function(options) {
  var stream = through.obj(function(file, encoding, next) {
    next();
  }, function(callback) {
    var self = this;
    var ee = appdmg(options);

    ee.on('progress', function(info) {
      log(info.current + '/' + info.total + ' ' + info.type + ' ' + (info.title || info.status));
    });

    ee.on('error', function(err) {
      self.emit('error', new PluginError(PLUGIN_NAME, err));
      callback();
    });

    ee.on('finish', callback);
  });

  // returning the file stream
  stream.resume();
  return stream;
};
