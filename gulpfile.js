'use strict';

var pkg = require('./package.json');

var child_process = require('child_process');
var fs = require('fs');
var path = require('path');

var zip = require('gulp-zip');
var del = require('del');
var NwBuilder = require('nw-builder');
var makensis = require('makensis');
var deb = require('gulp-debian');

var gulp = require('gulp');
var concat = require('gulp-concat');
var install = require("gulp-install");
var rename = require('gulp-rename');
var runSequence = require('run-sequence');
var mergeStream = require('merge-stream');
var os = require('os');

var distDir = './dist/';
var appsDir = './apps/';
var debugDir = './debug/';
var releaseDir = './release/';

var nwBuilderOptions = {
    version: '0.27.4',
    files: './dist/**/*',
    macIcns: './images/bf_icon.icns',
    macPlist: { 'CFBundleDisplayName': 'Betaflight Configurator'},
    winIco: './images/bf_icon.ico'
};


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
    removeItem(platforms, 'chromeos');
    console.log('Apps build.');

    if (platforms.length > 0) {
        var builder = new NwBuilder(Object.assign({
            buildDir: appsDir,
            platforms: platforms,
            flavor: 'normal'
        }, nwBuilderOptions));
        builder.on('log', console.log);
        builder.build(function (err) {
            if (err) {
                console.log('Error building NW apps: ' + err);
                runSequence('clean-apps', function() {
                    process.exit(1);
                });
            }
	        runSequence('post-build', function() {
    	        done();
        	});
        });
    } else {
        console.log('No platform suitable for the apps task')
        done();
    }
});

gulp.task('post-build', function (done) {

    var platforms = getPlatforms();

    var merged = mergeStream();

    if (platforms.indexOf('linux32') != -1) {
        // Copy Ubuntu launcher scripts to destination dir
        var launcherDir = path.join(appsDir, pkg.name, 'linux32');
        console.log('Copy Ubuntu launcher scripts to ' + launcherDir);
        merged.add(gulp.src('assets/linux/**')
            .pipe(gulp.dest(launcherDir)));
    }

    if (platforms.indexOf('linux64') != -1) {
        // Copy Ubuntu launcher scripts to destination dir
        var launcherDir = path.join(appsDir, pkg.name, 'linux64');        
        console.log('Copy Ubuntu launcher scripts to ' + launcherDir);        
        merged.add(gulp.src('assets/linux/**')
            .pipe(gulp.dest(launcherDir)));
    }

    return merged.isEmpty() ? done() : merged;
});
// Create debug app directories in ./debug
gulp.task('debug', ['dist', 'clean-debug'], function (done) {
    var platforms = getPlatforms();
    removeItem(platforms, 'chromeos');
    console.log('Debug build.');

    if (platforms.length > 0) {
        var builder = new NwBuilder(Object.assign({
            buildDir: debugDir,
            platforms: platforms,
            flavor: 'sdk'
        }, nwBuilderOptions));
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

    console.log('zip package started: ' + arch);
    return gulp.src(src, {base: path.join(appsDir, pkg.name, arch) })
               .pipe(rename(function(actualPath){ actualPath.dirname = path.join('Betaflight Configurator', actualPath.dirname) }))    
               .pipe(zip(output))
               .pipe(gulp.dest(releaseDir));
}

function release_deb(arch) {

    var debArch;
    
    switch (arch) {
    case 'linux32':
        debArch = 'i386';
        break;
    case 'linux64':
        debArch = 'amd64';
        break;
    default:
        console.error("Deb package error, arch: " + arch);
        process.exit(1);
        break;
    }

    console.log("Debian package started arch: " + arch);

    return gulp.src([path.join(appsDir, pkg.name, arch, '*')])
        .pipe(deb({
             package: pkg.name,
             version: pkg.version,
             section: 'base',
             priority: 'optional',
             architecture: debArch,
             maintainer: pkg.author,
             description: pkg.description,
             postinst: ['xdg-desktop-menu install /opt/betaflight/betaflight-configurator/betaflight-configurator.desktop /opt/betaflight/betaflight-configurator/betaflight-configurator-english.desktop'],
             prerm: ['xdg-desktop-menu uninstall betaflight-configurator.desktop betaflight-configurator-english.desktop'],
             depends: 'libgconf-2-4',
             changelog: [],
             _target: 'opt/betaflight/betaflight-configurator',
             _out: releaseDir,
             _clean: true
    }));
}

// Create distribution package for chromeos platform
function release_chromeos() {
    var src = distDir + '/**';
    var output = get_release_filename('chromeos', 'zip');

    console.log('chromeos package started');
    return gulp.src(src)
               .pipe(zip(output))
               .pipe(gulp.dest(releaseDir));
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
        merged.add(release_deb('linux64'));
    }

    if (platforms.indexOf('linux32') !== -1) {
        merged.add(release('linux32'));
        merged.add(release_deb('linux32'));
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
