/**
 * Authors:
 *   Nathan Tsoi (c) 2016
 *
 * License: GPLv3
 */
const gulp = require('gulp');
const pump = require('pump');
const babel = require('gulp-babel');
const bower = require('gulp-bower');
const debug = require('gulp-debug');
const cleanCSS = require('gulp-clean-css');
const concat = require('gulp-concat');
const sourcemaps = require('gulp-sourcemaps');
const uglify = require('gulp-uglify');
const gutil = require('gulp-util');
const spawn = require('child_process').spawn;

var isProduction = (gutil.env.production === true ? true : false);

var buildfiles = {
  js: [
    (isProduction ? './bower_components/raven-js/dist/raven.js' : null),
    (isProduction ? null : './js/nwjs_reload.js'),
    './bower_components/cryptojslib/rollups/md5.js',
    './js/analytics.js',
    './js/libraries/q.js',
    './bower_components/jquery/dist/jquery.js',
    './bower_components/jquery-ui/jquery-ui.js',
    './bower_components/jquery-flight-indicators/js/jquery.flightindicators.js',
    './bower_components/d3/d3.js',
    './bower_components/nouislider/distribute/nouislider.js',
    './bower_components/nouislider/documentation/assets/wNumb.js',
    './js/libraries/three/three.min.js',
    './js/libraries/three/Projector.js',
    './js/libraries/three/CanvasRenderer.js',
    './js/libraries/semver.js',
    './bower_components/jbox/Source/jBox.js',
    './bower_components/switchery/dist/switchery.js',
    './bower_components/bluebird/js/browser/bluebird.js',
    './bower_components/jquery-debounce/jquery.debounce.js',
    './bower_components/inflection/lib/inflection.js',
  ].filter((x) => x != null),
  css: [
    './bower_components/jbox/Source/jBox.css',
    './bower_components/nouislider/distribute/nouislider.css',
    './bower_components/jquery-flight-indicators/js/jquery.flightindicators.css',
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

gulp.task('rebuild', ['bower', 'js', 'css']);
gulp.task('default', ['rebuild', 'watch']);

