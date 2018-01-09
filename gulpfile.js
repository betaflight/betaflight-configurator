'use strict';

var pkg = require('./package.json');

var child_process = require('child_process');
var fs = require('fs');
var path = require('path');

var archiver = require('gulp-archiver');
var del = require('del');
var NwBuilder = require('nw-builder');
var makensis = require('makensis');

var gulp = require('gulp');
var addsrc = require('gulp-add-src');
var install = require("gulp-install");
var runSequence = require('run-sequence');
var os = require('os');
var mergeStream = require('merge-stream');

var distDir = './dist/';
var appsDir = './apps/';
var debugDir = './debug/';
var releaseDir = './release/';
var destDir;

var platforms = [];

// -----------------
// Helper functions
// -----------------

// Get platform from commandline args
// #
// # gulp <task> [<platform>]+        Run only for platform(s) (with <platform> one of --linux64, --linux32, --osx64, --win32, --win64, or --chromeos)
// # 
function getPlatforms() {
    var supportedPlatforms = ['linux64', 'linux32', 'osx64', 'win32','win64', 'chromeos'];
    var platforms = [];
    var regEx = /--(\w+)/;
    for (var i = 3; i < process.argv.length; i++) {
        var arg = process.argv[i].match(regEx)[1];
        if (supportedPlatforms.indexOf(arg) > -1) {
             platforms.push(arg);
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
            console.error(`Your current platform (${os.platform()}) is not a supported build platform. Please specify platform to build for on the command line.`);
            process.exit();
        }
    }

    if (platforms.length > 0) {
        console.log('Building for platform(s): ' + platforms + '.');
    } else {
        console.error('No suitables platforms found.');
        process.exit();
    }

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

function removeItem(platforms, item) {
    var index = platforms.indexOf(item);
    if (index >= 0) {
        platforms.splice(index, 1);
    }
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
        'src/main.css',
        'src/tabs/power.css',
        'src/tabs/firmware_flasher.css',
        'src/tabs/onboard_logging.css',
        'src/tabs/receiver.css',
        'src/tabs/cli.css',
        'src/tabs/servos.css',
        'src/tabs/adjustments.css',
        'src/tabs/configuration.css',
        'src/tabs/auxiliary.css',
        'src/tabs/pid_tuning.css',
        'src/tabs/transponder.css',
        'src/tabs/gps.css',
        'src/tabs/led_strip.css',
        'src/tabs/sensors.css',
        'src/tabs/osd.css',
        'src/tabs/motors.css',
        'src/tabs/receiver_msp.css',
        'src/tabs/logging.css',
        'src/tabs/landing.css',
        'src/tabs/setup_osd.css',
        'src/tabs/help.css',
        'src/tabs/failsafe.css',
        'src/tabs/ports.css',
        'src/tabs/setup.css',
        'src/css/opensans_webfontkit/fonts.css',
        'src/css/dropdown-lists/css/style_lists.css',
        'src/css/font-awesome/css/font-awesome.min.css',
        'src/js/libraries/flightindicators.css',
        'src/js/libraries/jbox/jBox.css',
        'src/js/libraries/jbox/themes/NoticeBorder.css',
        'src/js/libraries/jbox/themes/ModalBorder.css',
        'src/js/libraries/jbox/themes/TooltipDark.css',
        'src/js/libraries/jbox/themes/TooltipBorder.css',
        'src/js/libraries/jquery.nouislider.pips.min.css',
        'src/js/libraries/switchery/switchery.css',
        'src/js/libraries/jquery.nouislider.min.css',

        // JavaScript
        'src/js/libraries/q.js',
        'src/js/libraries/jquery-2.1.4.min.js',
        'src/js/libraries/jquery-ui-1.11.4.min.js',
        'src/js/libraries/d3.min.js',
        'src/js/libraries/jquery.nouislider.all.min.js',
        'src/js/libraries/three/three.min.js',
        'src/js/libraries/three/Projector.js',
        'src/js/libraries/three/CanvasRenderer.js',
        'src/js/libraries/jquery.flightindicators.js',
        'src/js/libraries/semver.js',
        'src/js/libraries/jbox/jBox.min.js',
        'src/js/libraries/switchery/switchery.js',
        'src/js/libraries/bluebird.min.js',
        'src/js/libraries/jquery.ba-throttle-debounce.min.js',
        'src/js/libraries/inflection.min.js',
        'src/js/injected_methods.js',
        'src/js/data_storage.js',
        'src/js/workers/hex_parser.js',
        'src/js/fc.js',
        'src/js/port_handler.js',
        'src/js/port_usage.js',
        'src/js/serial.js',
        'src/js/gui.js',
        'src/js/huffman.js',
        'src/js/default_huffman_tree.js',
        'src/js/model.js',
        'src/js/serial_backend.js',
        'src/js/msp/MSPCodes.js',
        'src/js/msp.js',
        'src/js/msp/MSPHelper.js',
        'src/js/backup_restore.js',
        'src/js/peripherals.js',
        'src/js/protocols/stm32.js',
        'src/js/protocols/stm32usbdfu.js',
        'src/js/localization.js',
        'src/js/boards.js',
        'src/js/RateCurve.js',
        'src/js/Features.js',
        'src/js/Beepers.js',
        'src/js/release_checker.js',
        'src/tabs/adjustments.js',
        'src/tabs/auxiliary.js',
        'src/tabs/cli.js',
        'src/tabs/configuration.js',
        'src/tabs/failsafe.js',
        'src/tabs/firmware_flasher.js',
        'src/tabs/gps.js',
        'src/tabs/help.js',
        'src/tabs/landing.js',
        'src/tabs/led_strip.js',
        'src/tabs/logging.js',
        'src/tabs/map.js',
        'src/tabs/motors.js',
        'src/tabs/onboard_logging.js',
        'src/tabs/osd.js',
        'src/tabs/pid_tuning.js',
        'src/tabs/ports.js',
        'src/tabs/power.js',
        'src/tabs/receiver.js',
        'src/tabs/receiver_msp.js',
        'src/tabs/sensors.js',
        'src/tabs/servos.js',
        'src/tabs/setup.js',
        'src/tabs/setup_osd.js',
        'src/tabs/transponder.js',
        'src/main.js',

        // everything else
        'src/eventPage.js',
        'src/*.html',
        'src/tabs/*.html',
        'src/images/**/*',
        'src/_locales/**/*',
        'src/css/font-awesome/fonts/*',
        'src/css/opensans_webfontkit/*.{eot,svg,ttf,woff,woff2}',
        'src/resources/*.json',
        'src/resources/models/*',
        'src/resources/osd/*.mcm',
        'src/resources/motor_order/*.svg',
    ];
    return gulp.src(distSources, { base: 'src' })
        .pipe(addsrc('manifest.json'))
        .pipe(addsrc('package.json'))
        .pipe(gulp.dest(distDir));
});

// Create runable app directories in ./apps
gulp.task('apps', ['dist', 'clean-apps'], function (done) {
    var platforms = getPlatforms();
    removeItem(platforms, 'chromeos');
    console.log('Apps build.');

    if (platforms.length > 0) {
        var builder = new NwBuilder({
            files: './dist/**/*',
            buildDir: appsDir,
            platforms: platforms,
            flavor: 'normal',
            macIcns: './src/images/bf_icon.icns',
            macPlist: { 'CFBundleDisplayName': 'Betaflight Configurator'},
            winIco: './src/images/bf_icon.ico',
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
    } else {
        console.log('No platform suitable for the apps task')
        done();
    }
});

// Create debug app directories in ./debug
gulp.task('debug', ['dist', 'clean-debug'], function (done) {
    var platforms = getPlatforms();
    removeItem(platforms, 'chromeos');
    console.log('Debug build.');

    if (platforms.length > 0) {
        var builder = new NwBuilder({
            files: './dist/**/*',
            buildDir: debugDir,
            platforms: platforms,
            flavor: 'sdk',
            macIcns: './src/images/bf_icon.icns',
            macPlist: { 'CFBundleDisplayName': 'Betaflight Configurator'},
            winIco: './src/images/bf_icon.ico',
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
    } else {
        console.error('No platform suitable for the debug task')
        done();
    }
});

gulp.task("post-build", function(done) {
    var merged = mergeStream();

    if (platforms.indexOf('linux64') != -1) {
        // Copy Ubuntu launcher scripts to destination dir
        var launcherDir = path.join(destDir, pkg.name, 'linux64');
        console.log('Copy Ubuntu launcher scripts to ' + launcherDir);
        merged.add(gulp.src('assets/linux/**')
            .pipe(gulp.dest(launcherDir)));
    }
    if (platforms.indexOf('linux32') != -1) {
        // Copy Ubuntu launcher scripts to destination dir
        var launcherDir = path.join(destDir, pkg.name, 'linux32');
        console.log('Copy Ubuntu launcher scripts to ' + launcherDir);
        merged.add(gulp.src('assets/linux/**')
            .pipe(gulp.dest(launcherDir)));
    }

    return merged.isEmpty() ? done() : merged;
});

// Create installer package for windows platforms
function release_win(arch) {

    // Create the output directory, with write permissions
    fs.mkdir(releaseDir, '0775', function(err) {
        if (err) {
            if (err.code !== 'EEXIST') {
                throw err;
            }
        }
    });
    
    // Parameters passed to the installer script
    const options = {
            verbose: 2,
            define: {
                'VERSION': pkg.version,
                'PLATFORM': arch,
                'DEST_FOLDER': releaseDir
            }
        }
    var output = makensis.compileSync('./assets/windows/installer.nsi', options);
    
    if (output.status === 0) {
        console.log('Installer finished for platform: ' + arch);
    } else {
        console.error('Installer for platform ' + arch + ' finished with error ' + output.status + ': ' + output.stderr);
    }
}

// Create distribution package (zip) for windows and linux platforms
function release(arch) {
    var src = path.join(appsDir, pkg.name, arch, '**');
    var output = get_release_filename(arch, 'zip');

    return gulp.src(src)
        .pipe(archiver(output, { zlib: { level: 9 } }))
        .pipe(gulp.dest(releaseDir))
}

// Create distribution package for chromeos platform
function release_chromeos() {
    var src = path.join(distDir, '**');
    var output = get_release_filename('chromeos', 'zip');

    return gulp.src(src)
        .pipe(archiver(output, { zlib: { level: 9 } }))
        .pipe(gulp.dest(releaseDir))
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
                background: path.join(__dirname, 'assets/osx/dmg-background.png'),
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
gulp.task('release', ['apps', 'clean-release'], function (done) {
    fs.mkdir(releaseDir, '0775', function(err) {
        if (err) {
            if (err.code !== 'EEXIST') {
                throw err;
            }
        }
    });

    var platforms = getPlatforms();
    console.log('Packing release.');

    var merged = mergeStream();

    if (platforms.indexOf('chromeos') !== -1) {
        merged.add(release_chromeos());
    }

    if (platforms.indexOf('linux64') !== -1) {
        merged.add(release('linux64'));
    }

    if (platforms.indexOf('linux32') !== -1) {
        merged.add(release('linux32'));
    }
        
    if (platforms.indexOf('osx64') !== -1) {
        merged.add(release_osx64());
    }

    if (platforms.indexOf('win32') !== -1) {
        release_win('win32');
    }
    
    if (platforms.indexOf('win64') !== -1) {
        release_win('win64');
    }

    return merged.isEmpty() ? done() : merged;
});

gulp.task('default', ['debug']);
