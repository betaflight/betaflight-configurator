
const appdmg = require('appdmg');
const through = require('through2');
const gutil = require('gulp-util');

const PluginError = gutil.PluginError;
const PLUGIN_NAME = 'gulp-appdmg';

module.exports = function(options) {
  const stream = through.obj(function(file, encoding, next) {
    next();
  }, function(callback) {
    const self = this;
    const ee = appdmg(options);

    ee.on('progress', function(info) {
      gutil.log(info.current + '/' + info.total + ' ' + info.type + ' ' + (info.title || info.status));
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
