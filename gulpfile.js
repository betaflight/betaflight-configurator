/**
 * Authors:
 *   Nathan Tsoi (c) 2016
 *
 * License: GPLv3
 */

const babel = require('gulp-babel');
const bower = require('gulp-bower');
const debug = require('gulp-debug');
const cleanCSS = require('gulp-clean-css');
const concat = require('gulp-concat');
const gulp = require('gulp');
const gutil = require('gulp-util');
const path = require('path');
const pump = require('pump');
const sourcemaps = require('gulp-sourcemaps');
const spawn = require('child_process').spawn;
const uglify = require('gulp-uglify');

var NwBuilder = require('nw-builder');
var nw = new NwBuilder({
    files: [
      './package.json',
      './manifest.json',
      './_locales/**',
      './css/**',
      './dist/**',
      './gui/**',
      './images/**',
      './js/**',
      './resources/**',
      './support/**',
      './tabs/**',
      './main.*',
      ],
    platforms: ['osx64', 'win32', 'win64', 'linux32', 'linux64'],
    version: 'latest',
    flavor: 'normal',
    appName: 'Betaflight-Configurator',
    // winIco: '', TODO: windows icons
    // TODO: linux icons
    macIcns: './nwjs/icons/bf.icns'
});

var isProduction = (gutil.env.production === true ? true : false);

var buildfiles = {
  js: [
    (isProduction ? './bower_components/raven-js/dist/raven.js' : null),
    './bower_components/cryptojslib/rollups/md5.js',
    './js/analytics.js',
    './js/libraries/q.js',
    './bower_components/jquery/dist/jquery.js',
    './bower_components/jquery-ui/jquery-ui.js',
    './js/libraries/jquery.flightindicators.js',
    './bower_components/d3/d3.js',
    './js/libraries/jquery.nouislider.all.min.js',
    './js/libraries/three/three.min.js',
    './js/libraries/three/Projector.js',
    './js/libraries/three/CanvasRenderer.js',
    './js/libraries/semver.js',
    './bower_components/jbox/Source/jBox.js',
    './bower_components/switchery/dist/switchery.js',
    './bower_components/bluebird/js/browser/bluebird.js',
    './bower_components/jquery-debounce/jquery.debounce.js',
    './bower_components/inflection/lib/inflection.js',
    './js/injected_methods.js',
    './js/port_handler.js',
    './js/port_usage.js',
    './js/serial.js',
    './js/gui.js',
    './js/model.js',
    './js/serial_backend.js',
    './js/data_storage.js',
    './js/fc.js',
    './js/msp/MSPCodes.js',
    './js/msp.js',
    './js/msp/MSPHelper.js',
    './js/backup_restore.js',
    './js/protocols/stm32.js',
    './js/protocols/stm32usbdfu.js',
    './js/localization.js',
    './js/boards.js',
    './js/RateCurve.js',
    './js/Features.js',
    './main.js',
    './tabs/landing.js',
    './tabs/setup.js',
    './tabs/help.js',
    './tabs/ports.js',
    './tabs/configuration.js',
    './tabs/pid_tuning.js',
    './tabs/receiver.js',
    './tabs/auxiliary.js',
    './tabs/adjustments.js',
    './tabs/servos.js',
    './tabs/gps.js',
    './tabs/motors.js',
    './tabs/led_strip.js',
    './tabs/sensors.js',
    './tabs/cli.js',
    './tabs/logging.js',
    './tabs/onboard_logging.js',
    './tabs/firmware_flasher.js',
    './tabs/failsafe.js',
    './tabs/osd.js',
    './tabs/transponder.js'
  ].filter((x) => x != null),
  css: [
    './bower_components/jbox/Source/jBox.css',
    './js/libraries/jquery.nouislider.min.css',
    './js/libraries/jquery.nouislider.pips.min.css',
    './js/libraries/flightindicators.css',
    './js/libraries/switchery/switchery.css',
  ]
}

gulp.task('watch', function() {
  gulp.watch('gulpfile.js', ['gulp-autoreload']);
  gulp.watch(buildfiles.css, ['css']); 
  gulp.watch(buildfiles.js, ['js']); 
});

gulp.task('bower', function() {
  return bower();
});

gulp.task('js', function(cb) {
  pump([
    gulp.src(buildfiles.js),
    debug({title: 'building js: '}),
    sourcemaps.init(),
    //babel({ presets: ['es2015'] }),
    isProduction ? uglify() : gutil.noop(),
    concat('all.js'),
    sourcemaps.write('./dist/js/'),
    gulp.dest('./dist/js/')
  ], cb)
});

gulp.task('css', function() {
  return gulp.src(buildfiles.css)
    .pipe(debug({title: 'building stylesheet: '}))
    .pipe(cleanCSS({compatibility: 'ie8'}))
    .pipe(concat('all.css'))
    .pipe(gulp.dest('./dist/css/'));
});

gulp.task('gulp-autoreload', function() {
  var p;
  gulp.watch('gulpfile.js', spawnChildren);
  spawnChildren();
  function spawnChildren(e) {
    if(p) { p.kill(); }
    p = spawn('gulp', ['default'], {stdio: 'inherit'});
  }
});

gulp.task('nwb-release', ['rebuild'], function() {
  // Build returns a promise
  nw.build().then(function () {
     console.log('Build Complete');
  }).catch(function (error) {
     console.error(error);
  });
});

gulp.task('rebuild', ['bower', 'js', 'css']);
gulp.task('release', ['nwb-release'])
gulp.task('default', ['rebuild', 'watch']);

