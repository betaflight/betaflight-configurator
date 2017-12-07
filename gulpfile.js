'use strict';

var pkg = require('./package.json');

var child_process = require('child_process');
var fs = require('fs');
var path = require('path');

var archiver = require('archiver');
var del = require('del');
var NwBuilder = require('nw-builder');

var gulp = require('gulp');
var concat = require('gulp-concat');
var install = require("gulp-install");
var runSequence = require('run-sequence');
var os = require('os');

var distDir = './dist/';
var appsDir = './apps/';
var debugDir = './debug/';
var releaseDir = './release/';

// -----------------
// Helper functions
// -----------------

// Get platform from commandline args
// #
// # gulp <task> [<platform>]+        Run only for platform(s) (with <platform> one of --linux64, --linux32, --osx64, or --win32 --chromeos)
// # 
function getPlatforms(includeChromeOs) {
    var supportedPlatforms = ['linux64', 'linux32', 'osx64', 'win32','win64'];
    var platforms = [];
    var regEx = /--(\w+)/;
    for (var i = 3; i < process.argv.length; i++) {
        var arg = process.argv[i].match(regEx)[1];
        if (supportedPlatforms.indexOf(arg) > -1) {
             platforms.push(arg);
        } else if (arg === 'chromeos') {
            if (includeChromeOs) {
                platforms.push(arg);
            }
        } else {
             console.log('Unknown platform: ' + arg);
             process.exit();
        }
    }  

    if (platforms.length === 0) {
        var defaultPlatform = getDefaultPlatform();
        if (supportedPlatforms.indexOf(defaultPlatform) > -1) {
            platforms.push(defaultPlatform);
        } else {
            console.log('Compatible platform not detected, you must specify one as parameter');
            process.exit();
        }
    }

    console.log('Building for platform(s): ' + platforms + '.');

    return platforms;
}

// Gets the default platform to be used
function getDefaultPlatform() {
    var defaultPlatform;
    switch (os.platform()) {
    case 'darwin':
        defaultPlatform = 'osx64';

        break;
    case 'linux':
        defaultPlatform = 'linux64';

        break;
    case 'win32':
        defaultPlatform = 'win32';

        break;
        
    default:
        defaultPlatform = '';
    
        break;
    }
    return defaultPlatform;
}

function getRunDebugAppCommand(arch) {
    switch (arch) {
    case 'osx64':
        return 'open ' + path.join(debugDir, pkg.name, arch, pkg.name + '.app');

        break;

    case 'linux64':
    case 'linux32':
        return path.join(debugDir, pkg.name, arch, pkg.name);

        break;

    case 'win32':
    case 'win64':
        return path.join(debugDir, pkg.name, arch, pkg.name + '.exe');

        break;

    default:
        return '';

        break;
    }
}

function get_release_filename(platform, ext) {
    return 'Betaflight-Configurator_' + platform + '_' + pkg.version + '.' + ext;
}

// -----------------
// Tasks
// -----------------

gulp.task('clean', function () { 
    return runSequence('clean-dist', 'clean-apps', 'clean-debug', 'clean-release');
});

gulp.task('clean-dist', function () { 
    return del([distDir + '**'], { force: true }); 
});

gulp.task('clean-apps', function () { 
    return del([appsDir + '**'], { force: true }); 
});

gulp.task('clean-debug', function () { 
    return del([debugDir + '**'], { force: true }); 
});

gulp.task('clean-release', function () { 
    return del([releaseDir + '**'], { force: true }); 
});

gulp.task('clean-cache', function () { 
    return del(['./cache/**'], { force: true }); 
});

// Real work for dist task. Done in another task to call it via
// run-sequence.
gulp.task('dist', ['clean-dist'], function () {
    var distSources = [
        // CSS files
        './main.css',
        './tabs/power.css',
        './tabs/firmware_flasher.css',
        './tabs/onboard_logging.css',
        './tabs/receiver.css',
        './tabs/cli.css',
        './tabs/servos.css',
        './tabs/adjustments.css',
        './tabs/configuration.css',
        './tabs/auxiliary.css',
        './tabs/pid_tuning.css',
        './tabs/transponder.css',
        './tabs/gps.css',
        './tabs/led_strip.css',
        './tabs/sensors.css',
        './tabs/osd.css',
        './tabs/motors.css',
        './tabs/receiver_msp.css',
        './tabs/logging.css',
        './tabs/landing.css',
        './tabs/setup_osd.css',
        './tabs/help.css',
        './tabs/failsafe.css',
        './tabs/ports.css',
        './tabs/setup.css',
        './css/opensans_webfontkit/fonts.css',
        './css/dropdown-lists/css/style_lists.css',
        './css/font-awesome/css/font-awesome.min.css',
        './js/libraries/flightindicators.css',
        './js/libraries/jbox/jBox.css',
        './js/libraries/jbox/themes/NoticeBorder.css',
        './js/libraries/jbox/themes/ModalBorder.css',
        './js/libraries/jbox/themes/TooltipDark.css',
        './js/libraries/jbox/themes/TooltipBorder.css',
        './js/libraries/jquery.nouislider.pips.min.css',
        './js/libraries/switchery/switchery.css',
        './js/libraries/jquery.nouislider.min.css',

        // JavaScript
        './js/libraries/q.js',
        './js/libraries/jquery-2.1.4.min.js',
        './js/libraries/jquery-ui-1.11.4.min.js',
        './js/libraries/d3.min.js',
        './js/libraries/jquery.nouislider.all.min.js',
        './js/libraries/three/three.min.js',
        './js/libraries/three/Projector.js',
        './js/libraries/three/CanvasRenderer.js',
        './js/libraries/jquery.flightindicators.js',
        './js/libraries/semver.js',
        './js/libraries/jbox/jBox.min.js',
        './js/libraries/switchery/switchery.js',
        './js/libraries/bluebird.min.js',
        './js/libraries/jquery.ba-throttle-debounce.min.js',
        './js/libraries/inflection.min.js',
        './js/injected_methods.js',
        './js/data_storage.js',
        './js/workers/hex_parser.js',
        './js/fc.js',
        './js/port_handler.js',
        './js/port_usage.js',
        './js/serial.js',
        './js/gui.js',
        './js/huffman.js',
        './js/default_huffman_tree.js',
        './js/model.js',
        './js/serial_backend.js',
        './js/msp/MSPCodes.js',
        './js/msp.js',
        './js/msp/MSPHelper.js',
        './js/backup_restore.js',
        './js/peripherals.js',
        './js/protocols/stm32.js',
        './js/protocols/stm32usbdfu.js',
        './js/localization.js',
        './js/boards.js',
        './js/RateCurve.js',
        './js/Features.js',
        './js/Beepers.js',
        './js/release_checker.js',
        './tabs/adjustments.js',
        './tabs/auxiliary.js',
        './tabs/cli.js',
        './tabs/configuration.js',
        './tabs/failsafe.js',
        './tabs/firmware_flasher.js',
        './tabs/gps.js',
        './tabs/help.js',
        './tabs/landing.js',
        './tabs/led_strip.js',
        './tabs/logging.js',
        './tabs/map.js',
        './tabs/motors.js',
        './tabs/onboard_logging.js',
        './tabs/osd.js',
        './tabs/pid_tuning.js',
        './tabs/ports.js',
        './tabs/power.js',
        './tabs/receiver.js',
        './tabs/receiver_msp.js',
        './tabs/sensors.js',
        './tabs/servos.js',
        './tabs/setup.js',
        './tabs/setup_osd.js',
        './tabs/transponder.js',
        './main.js',

        // everything else
        './package.json', // For NW.js
        './manifest.json', // For Chrome app
        './eventPage.js',
        './*.html',
        './tabs/*.html',
        './images/**/*',
        './_locales/**/*',
        './css/font-awesome/fonts/*',
        './css/opensans_webfontkit/*.{eot,svg,ttf,woff,woff2}',
        './resources/*.json',
        './resources/models/*',
        './resources/osd/*.mcm',
        './resources/motor_order/*.svg',
    ];
    return gulp.src(distSources, { base: '.' })
        .pipe(gulp.dest(distDir))
        .pipe(install({
            npm: '--production --ignore-scripts'
        }));;
});

// Create runable app directories in ./apps
gulp.task('apps', ['dist', 'clean-apps'], function (done) {
    var platforms = getPlatforms();
    console.log('Release build.');

    var builder = new NwBuilder({
        files: './dist/**/*',
        buildDir: appsDir,
        platforms: platforms,
        flavor: 'normal',
        macIcns: './images/bf_icon.icns',
        macPlist: { 'CFBundleDisplayName': 'Betaflight Configurator'},
        winIco: './images/bf_icon.ico',
    });
    builder.on('log', console.log);
    builder.build(function (err) {
        if (err) {
            console.log('Error building NW apps: ' + err);
            runSequence('clean-apps', function() {
                process.exit(1);
            });
        }
        done();
    });
});

// Create debug app directories in ./debug
gulp.task('debug', ['dist', 'clean-debug'], function (done) {
    var platforms = getPlatforms();
    console.log('Debug build.');

    var builder = new NwBuilder({
        files: './dist/**/*',
        buildDir: debugDir,
        platforms: platforms,
        flavor: 'sdk',
        macIcns: './images/bf_icon.icns',
        macPlist: { 'CFBundleDisplayName': 'Betaflight Configurator'},
        winIco: './images/bf_icon.ico',
    });
    builder.on('log', console.log);
    builder.build(function (err) {
        if (err) {
            console.log('Error building NW apps: ' + err);
            runSequence('clean-debug', function() {
                process.exit(1);
            });
        }
        var exec = require('child_process').exec;    
        if (platforms.length === 1) {
            var run = getRunDebugAppCommand(platforms[0]);
            console.log('Starting debug app (' + run + ')...');
            exec(run);
        } else {
            console.log('More than one platform specified, not starting debug app');
        }        
        done();
    });
});

// Create distribution package for windows and linux platforms
function release(arch) {
    var src = path.join(appsDir, pkg.name, arch);
    var output = fs.createWriteStream(path.join(releaseDir, get_release_filename(arch, 'zip')));
    var archive = archiver('zip', {
        zlib: { level: 9 }
    });
    archive.on('warning', function (err) { throw err; });
    archive.on('error', function (err) { throw err; });
    archive.pipe(output);
    archive.directory(src, 'Betaflight Configurator');
    return archive.finalize();
}

// Create distribution package for chromeos platform
function release_chromeos() {
    var src = distDir;
    var output = fs.createWriteStream(path.join(releaseDir, get_release_filename('chromeos', 'zip')));
    var archive = archiver('zip', {
        zlib: { level: 9 }
    });
    archive.on('warning', function (err) { throw err; });
    archive.on('error', function (err) { throw err; });
    archive.pipe(output);
    archive.directory(src, false);
    return archive.finalize();
}

// Create distribution package for macOS platform
function release_osx64() {
    var appdmg = require('gulp-appdmg');

    return gulp.src([])
        .pipe(appdmg({
            target: path.join(releaseDir, get_release_filename('macOS', 'dmg')),
            basepath: path.join(appsDir, pkg.name, 'osx64'),
            specification: {
                title: 'Betaflight Configurator',
                contents: [
                    { 'x': 448, 'y': 342, 'type': 'link', 'path': '/Applications' },
                    { 'x': 192, 'y': 344, 'type': 'file', 'path': pkg.name + '.app', 'name': 'Betaflight Configurator.app' }
                ],
                background: path.join(__dirname, 'images/dmg-background.png'),
                format: 'UDZO',
                window: {
                    size: {
                        width: 638,
                        height: 479
                    }
                }
            },
        })
    );
}

// Create distributable .zip files in ./release
gulp.task('release', ['apps', 'clean-release'], function () {
    fs.mkdir(releaseDir, '0775', function(err) {
        if (err) {
            if (err.code !== 'EEXIST') {
                throw err;
            }
        }
    });

    var platforms = getPlatforms(true);
    console.log('Packing release.');

    if (platforms.indexOf('chromeos') !== -1) {
        release_chromeos();
    }

    if (platforms.indexOf('linux64') !== -1) {
        release('linux64');
    }

    if (platforms.indexOf('linux32') !== -1) {
        release('linux32');
    }
        
    if (platforms.indexOf('osx64') !== -1) {
        release_osx64();
    }

    if (platforms.indexOf('win32') !== -1) {
        release('win32');
    }
    
    if (platforms.indexOf('win64') !== -1) {
        release('win64');
    }
});

gulp.task('default', ['debug']);
