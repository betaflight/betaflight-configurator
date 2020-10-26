'use strict';

const pkg = require('./package.json');
// remove gulp-appdmg from the package.json we're going to write
delete pkg.optionalDependencies['gulp-appdmg'];

const child_process = require('child_process');
const fs = require('fs');
const fse = require('fs-extra');
const https = require('follow-redirects').https;
const path = require('path');

const zip = require('gulp-zip');
const del = require('del');
const NwBuilder = require('nw-builder');
const innoSetup = require('@quanle94/innosetup');
const deb = require('gulp-debian');
const buildRpm = require('rpm-builder');
const commandExistsSync = require('command-exists').sync;
const targz = require('targz');

const gulp = require('gulp');
const rollup = require('rollup');
const concat = require('gulp-concat');
const yarn = require("gulp-yarn");
const rename = require('gulp-rename');
const replace = require('gulp-replace');
const jeditor = require("gulp-json-editor");
const xmlTransformer = require("gulp-xml-transformer");
const os = require('os');
const git = require('gulp-git');
const source = require('vinyl-source-stream');
const stream = require('stream');

const cordova = require("cordova-lib").cordova;
const browserify = require('browserify');
const glob = require('glob');

const DIST_DIR = './dist/';
const APPS_DIR = './apps/';
const DEBUG_DIR = './debug/';
const RELEASE_DIR = './release/';
const CORDOVA_DIR = './cordova/';
const CORDOVA_DIST_DIR = './dist_cordova/';

const LINUX_INSTALL_DIR = '/opt/betaflight';

const NODE_ENV = process.env.NODE_ENV || 'production';

// Global variable to hold the change hash from when we get it, to when we use it.
let gitChangeSetId;

const nwBuilderOptions = {
    version: '0.47.0',
    files: './dist/**/*',
    macIcns: './src/images/bf_icon.icns',
    macPlist: { 'CFBundleDisplayName': 'Betaflight Configurator'},
    winIco: './src/images/bf_icon.ico',
    zip: false,
};

const nwArmVersion = '0.27.6';

let cordovaDependencies = true;

//-----------------
//Pre tasks operations
//-----------------
const SELECTED_PLATFORMS = getInputPlatforms();

//-----------------
//Tasks
//-----------------

gulp.task('clean', gulp.parallel(clean_dist, clean_apps, clean_debug, clean_release, clean_cordova));

gulp.task('clean-dist', clean_dist);

gulp.task('clean-apps', clean_apps);

gulp.task('clean-debug', clean_debug);

gulp.task('clean-release', clean_release);

gulp.task('clean-cache', clean_cache);

gulp.task('clean-cordova', clean_cordova);

// Function definitions are processed before function calls.
const getChangesetId = gulp.series(getHash, writeChangesetId);
gulp.task('get-changeset-id', getChangesetId);

// dist_yarn MUST be done after dist_src
const distBuild = gulp.series(dist_src, dist_changelog, dist_yarn, dist_locale, dist_libraries, dist_resources, dist_rollup, getChangesetId, gulp.series(cordova_dist()));
const distRebuild = gulp.series(clean_dist, distBuild);
gulp.task('dist', distRebuild);

const appsBuild = gulp.series(gulp.parallel(clean_apps, distRebuild), apps, gulp.series(cordova_apps()), gulp.parallel(listPostBuildTasks(APPS_DIR)));
gulp.task('apps', appsBuild);

const debugAppsBuild = gulp.series(gulp.parallel(clean_debug, distRebuild), debug, gulp.parallel(listPostBuildTasks(DEBUG_DIR)));

const debugBuild = gulp.series(distBuild, debug, gulp.parallel(listPostBuildTasks(DEBUG_DIR)), start_debug);
gulp.task('debug', debugBuild);

const releaseBuild = gulp.series(gulp.parallel(clean_release, appsBuild), gulp.parallel(listReleaseTasks(APPS_DIR)));
gulp.task('release', releaseBuild);

const debugReleaseBuild = gulp.series(gulp.parallel(clean_release, debugAppsBuild), gulp.parallel(listReleaseTasks(DEBUG_DIR)));
gulp.task('debug-release', debugReleaseBuild);

gulp.task('default', debugBuild);

// -----------------
// Helper functions
// -----------------

// Get platform from commandline args
// #
// # gulp <task> [<platform>]+        Run only for platform(s) (with <platform> one of --linux64, --linux32, --armv7, --osx64, --win32, --win64, or --android)
// #
function getInputPlatforms() {
    const supportedPlatforms = ['linux64', 'linux32', 'armv7', 'osx64', 'win32', 'win64', 'android'];
    const platforms = [];
    const regEx = /--(\w+)/;
    console.log(process.argv);
    for (let i = 3; i < process.argv.length; i++) {
        const arg = process.argv[i].match(regEx)[1];
        if (supportedPlatforms.indexOf(arg) > -1) {
            platforms.push(arg);
        } else if (arg === 'nowinicon') {
            console.log('ignoring winIco');
            delete nwBuilderOptions['winIco'];
        } else if (arg === 'skipdep') {
            console.log('ignoring cordova dependencies');
            cordovaDependencies = false;
        } else {
            console.log(`Unknown platform: ${arg}`);
            process.exit();
        }
    }

    if (platforms.length === 0) {
        const defaultPlatform = getDefaultPlatform();
        if (supportedPlatforms.indexOf(defaultPlatform) > -1) {
            platforms.push(defaultPlatform);
        } else {
            console.error(`Your current platform (${os.platform()}) is not a supported build platform. Please specify platform to build for on the command line.`);
            process.exit();
        }
    }

    if (platforms.length > 0) {
        console.log(`Building for platform(s): ${platforms}.`);
    } else {
        console.error('No suitables platforms found.');
        process.exit();
    }

    return platforms;
}

// Gets the default platform to be used
function getDefaultPlatform() {
    let defaultPlatform;
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


function getPlatforms() {
    return SELECTED_PLATFORMS.slice();
}

function removeItem(platforms, item) {
    const index = platforms.indexOf(item);
    if (index >= 0) {
        platforms.splice(index, 1);
    }
}

function getRunDebugAppCommand(arch) {

    let command;

    switch (arch) {
    case 'osx64':
        const pkgName = `${pkg.name}.app`;
        command = `open ${path.join(DEBUG_DIR, pkg.name, arch, pkgName)}`;

        break;

    case 'linux64':
    case 'linux32':
    case 'armv7':
        command = path.join(DEBUG_DIR, pkg.name, arch, pkg.name);

        break;

    case 'win32':
    case 'win64':
        command = path.join(DEBUG_DIR, pkg.name, arch, `${pkg.name}.exe`);

        break;

    default:
        command =  '';

        break;
    }

    return command;
}

function getReleaseFilename(platform, ext) {
    return `${pkg.name}_${pkg.version}_${platform}.${ext}`;
}

function clean_dist() {
    return del([`${DIST_DIR}**`], { force: true });
}

function clean_apps() {
    return del([`${APPS_DIR}**`], { force: true });
}

function clean_debug() {
    return del([`${DEBUG_DIR}**`], { force: true });
}

function clean_release() {
    return del([`${RELEASE_DIR}**`], { force: true });
}

function clean_cache() {
    return del(['./cache/**'], { force: true });
}

// Real work for dist task. Done in another task to call it via
// run-sequence.
function dist_src() {
    const distSources = [
        './src/**/*',
        '!./src/css/dropdown-lists/LICENSE',
        '!./src/support/**',
    ];
    const packageJson = new stream.Readable;
    packageJson.push(JSON.stringify(pkg,undefined,2));
    packageJson.push(null);

    return packageJson
        .pipe(source('package.json'))
        .pipe(gulp.src(distSources, { base: 'src' }))
        .pipe(gulp.src('yarn.lock', { passthrougth: true }))
        .pipe(gulp.dest(DIST_DIR));
}

function dist_changelog() {
    return gulp.src('changelog.html')
        .pipe(gulp.dest(`${DIST_DIR}tabs/`));
}

// This function relies on files from the dist_src function
function dist_yarn() {
    return gulp.src(['./dist/package.json', './dist/yarn.lock'])
        .pipe(gulp.dest('./dist'))
        .pipe(yarn({
            production: true,
        }));
}

function dist_locale() {
    return gulp.src('./locales/**/*', { base: 'locales'})
        .pipe(gulp.dest(`${DIST_DIR}locales`));
}

function dist_libraries() {
    return gulp.src('./libraries/**/*', { base: '.'})
        .pipe(gulp.dest(`${DIST_DIR}js`));
}

function dist_resources() {
    return gulp.src(['./resources/**/*', '!./resources/osd/**/*.png'], { base: '.'})
        .pipe(gulp.dest(DIST_DIR));
}

function dist_rollup() {
    const commonjs = require('@rollup/plugin-commonjs');
    const resolve = require('@rollup/plugin-node-resolve').default;
    const alias = require('@rollup/plugin-alias');
    const vue = require('rollup-plugin-vue');
    const rollupReplace = require('@rollup/plugin-replace');

    return rollup
        .rollup({
            input: 'src/components/init.js',
            plugins: [
                alias({
                    entries: {
                        vue: require.resolve('vue/dist/vue.esm.js'),
                    },
                }),
                rollupReplace({
                    'process.env.NODE_ENV': JSON.stringify(NODE_ENV),
                }),
                resolve(),
                commonjs(),
                vue(),
            ],
        })
        .then(bundle =>
            bundle.write({
                format: 'esm',
                file: 'dist/components/init.js',
            }),
        );
}

// Create runable app directories in ./apps
function apps(done) {
    const platforms = getPlatforms();
    removeItem(platforms, 'android');

    buildNWAppsWrapper(platforms, 'normal', APPS_DIR, done);
}

function listPostBuildTasks(folder) {

    const platforms = getPlatforms();

    const postBuildTasks = [];

    if (platforms.indexOf('linux32') !== -1) {
        postBuildTasks.push(function post_build_linux32(done) {
            return post_build('linux32', folder, done);
        });
    }

    if (platforms.indexOf('linux64') !== -1) {
        postBuildTasks.push(function post_build_linux64(done) {
            return post_build('linux64', folder, done);
        });
    }

    if (platforms.indexOf('armv7') !== -1) {
        postBuildTasks.push(function post_build_armv7(done) {
            return post_build('armv7', folder, done);
        });
    }

    // We need to return at least one task, if not gulp will throw an error
    if (postBuildTasks.length === 0) {
        postBuildTasks.push(function post_build_none(done) {
            done();
        });
    }
    return postBuildTasks;
}

function post_build(arch, folder, done) {

    if ((arch === 'linux32') || (arch === 'linux64')) {
        // Copy Ubuntu launcher scripts to destination dir
        const launcherDir = path.join(folder, pkg.name, arch);
        console.log(`Copy Ubuntu launcher scripts to ${launcherDir}`);
        return gulp.src('assets/linux/**')
                   .pipe(gulp.dest(launcherDir));
    }

    if (arch === 'armv7') {
        console.log('Moving ARMv7 build from "linux32" to "armv7" directory...');
        fse.moveSync(path.join(folder, pkg.name, 'linux32'), path.join(folder, pkg.name, 'armv7'));
    }

    return done();
}

// Create debug app directories in ./debug
function debug(done) {
    const platforms = getPlatforms();
    removeItem(platforms, 'android');

    buildNWAppsWrapper(platforms, 'sdk', DEBUG_DIR, done);
}

function injectARMCache(flavor, callback) {
    const flavorPostfix = `-${flavor}`;
    const flavorDownloadPostfix = flavor !== 'normal' ? `-${flavor}` : '';
    clean_cache().then(function() {
        if (!fs.existsSync('./cache')) {
            fs.mkdirSync('./cache');
        }
        fs.closeSync(fs.openSync('./cache/_ARMv7_IS_CACHED', 'w'));
        const versionFolder = `./cache/${nwBuilderOptions.version}${flavorPostfix}`;
        if (!fs.existsSync(versionFolder)) {
            fs.mkdirSync(versionFolder);
        }
        const linux32Folder = `${versionFolder}/linux32`;
        if (!fs.existsSync(linux32Folder)) {
            fs.mkdirSync(linux32Folder);
        }
        const downloadedArchivePath = `${versionFolder}/nwjs${flavorPostfix}-v${nwArmVersion}-linux-arm.tar.gz`;
        const downloadUrl = `https://github.com/LeonardLaszlo/nw.js-armv7-binaries/releases/download/v${nwArmVersion}/nwjs${flavorDownloadPostfix}-v${nwArmVersion}-linux-arm.tar.gz`;
        if (fs.existsSync(downloadedArchivePath)) {
            console.log('Prebuilt ARMv7 binaries found in /tmp');
            downloadDone(flavorDownloadPostfix, downloadedArchivePath, versionFolder);
        } else {
            console.log(`Downloading prebuilt ARMv7 binaries from "${downloadUrl}"...`);
            process.stdout.write('> Starting download...\r');
            const armBuildBinary = fs.createWriteStream(downloadedArchivePath);
            https.get(downloadUrl, function(res) {
                const totalBytes = res.headers['content-length'];
                let downloadedBytes = 0;
                res.pipe(armBuildBinary);
                res.on('data', function (chunk) {
                    downloadedBytes += chunk.length;
                    process.stdout.write(`> ${parseInt((downloadedBytes * 100) / totalBytes)}% done             \r`);
                });
                armBuildBinary.on('finish', function() {
                    process.stdout.write('> 100% done             \n');
                    armBuildBinary.close(function() {
                        downloadDone(flavorDownloadPostfix, downloadedArchivePath, versionFolder);
                    });
                });
            });
        }
    });

    function downloadDone(flavorDownload, downloadedArchivePath, versionFolder) {
        console.log('Injecting prebuilt ARMv7 binaries into Linux32 cache...');
        targz.decompress({
            src: downloadedArchivePath,
            dest: versionFolder,
        }, function(err) {
            if (err) {
                console.log(err);
                clean_debug();
                process.exit(1);
            } else {
                fs.rename(
                    `${versionFolder}/nwjs${flavorDownload}-v${nwArmVersion}-linux-arm`,
                    `${versionFolder}/linux32`,
                    (renameErr) => {
                        if (renameErr) {
                            console.log(renameErr);
                            clean_debug();
                            process.exit(1);
                        }
                        callback();
                    }
                );
            }
        });
    }
}

function buildNWAppsWrapper(platforms, flavor, dir, done) {
    function buildNWAppsCallback() {
        buildNWApps(platforms, flavor, dir, done);
    }

    if (platforms.indexOf('armv7') !== -1) {
        if (platforms.indexOf('linux32') !== -1) {
            console.log('Cannot build ARMv7 and Linux32 versions at the same time!');
            clean_debug();
            process.exit(1);
        }
        removeItem(platforms, 'armv7');
        platforms.push('linux32');

        if (!fs.existsSync('./cache/_ARMv7_IS_CACHED', 'w')) {
            console.log('Purging cache because it needs to be overwritten...');
            clean_cache().then(() => {
                injectARMCache(flavor, buildNWAppsCallback);
            });
        } else {
            buildNWAppsCallback();
        }
    } else {
        if (platforms.indexOf('linux32') !== -1 && fs.existsSync('./cache/_ARMv7_IS_CACHED')) {
            console.log('Purging cache because it was previously overwritten...');
            clean_cache().then(buildNWAppsCallback);
        } else {
            buildNWAppsCallback();
        }
    }
}

function buildNWApps(platforms, flavor, dir, done) {
    if (platforms.length > 0) {
        const builder = new NwBuilder(Object.assign({
            buildDir: dir,
            platforms,
            flavor,
        }, nwBuilderOptions));
        builder.on('log', console.log);
        builder.build(function (err) {
            if (err) {
                console.log(`Error building NW apps: ${err}`);
                clean_debug();
                process.exit(1);
            }
            done();
        });
    } else {
        console.log('No platform suitable for NW Build');
        done();
    }
}

function getHash(cb) {
    git.revParse({args: '--short HEAD'}, function (err, hash) {
        if (err) {
            gitChangeSetId = 'unsupported';
        } else {
            gitChangeSetId = hash;
        }
        cb();
    });
}

function writeChangesetId() {
    const versionJson = new stream.Readable;
    versionJson.push(JSON.stringify({
        gitChangesetId: gitChangeSetId,
        version: pkg.version,
        }, undefined, 2));
    versionJson.push(null);
    return versionJson
        .pipe(source('version.json'))
        .pipe(gulp.dest(DIST_DIR));
}

function start_debug(done) {

    const platforms = getPlatforms();

    const exec = require('child_process').exec;
    if (platforms.length === 1) {
        if (platforms[0] === 'android') {
            cordova_debug();
        } else {
            const run = getRunDebugAppCommand(platforms[0]);
            console.log(`Starting debug app (${run})...`);
            exec(run);
        }
    } else {
        console.log('More than one platform specified, not starting debug app');
    }
    done();
}

// Create installer package for windows platforms
function release_win(arch, appDirectory, done) {

    // Parameters passed to the installer script
    const parameters = [];

    // Extra parameters to replace inside the iss file
    parameters.push(`/Dversion=${pkg.version}`);
    parameters.push(`/DarchName=${arch}`);
    parameters.push(`/DarchAllowed=${(arch === 'win32') ? 'x86 x64' : 'x64'}`);
    parameters.push(`/DarchInstallIn64bit=${(arch === 'win32') ? '' : 'x64'}`);
    parameters.push(`/DsourceFolder=${appDirectory}`);
    parameters.push(`/DtargetFolder=${RELEASE_DIR}`);

    // Show only errors in console
    parameters.push(`/Q`);

    // Script file to execute
    parameters.push("assets/windows/installer.iss");

    innoSetup(parameters, {},
    function(error) {
        if (error != null) {
            console.error(`Installer for platform ${arch} finished with error ${error}`);
        } else {
            console.log(`Installer for platform ${arch} finished`);
        }
        done();
    });
}

// Create distribution package (zip) for windows and linux platforms
function release_zip(arch, appDirectory) {
    const src = path.join(appDirectory, pkg.name, arch, '**');
    const output = getReleaseFilename(arch, 'zip');
    const base = path.join(appDirectory, pkg.name, arch);

    return compressFiles(src, base, output, 'Betaflight Configurator');
}

// Compress files from srcPath, using basePath, to outputFile in the RELEASE_DIR
function compressFiles(srcPath, basePath, outputFile, zipFolder) {
    return gulp.src(srcPath, { base: basePath })
               .pipe(rename(function(actualPath) {
                   actualPath.dirname = path.join(zipFolder, actualPath.dirname);
               }))
               .pipe(zip(outputFile))
               .pipe(gulp.dest(RELEASE_DIR));
}

function release_deb(arch, appDirectory, done) {

    // Check if dpkg-deb exists
    if (!commandExistsSync('dpkg-deb')) {
        console.warn(`dpkg-deb command not found, not generating deb package for ${arch}`);
        done();
    }

    return gulp.src([path.join(appDirectory, pkg.name, arch, '*')])
        .pipe(deb({
            package: pkg.name,
            version: pkg.version,
            section: 'base',
            priority: 'optional',
            architecture: getLinuxPackageArch('deb', arch),
            maintainer: pkg.author,
            description: pkg.description,
            preinst: [`rm -rf ${LINUX_INSTALL_DIR}/${pkg.name}`],
            postinst: [
                `chown root:root ${LINUX_INSTALL_DIR}`,
                `chown -R root:root ${LINUX_INSTALL_DIR}/${pkg.name}`,
                `xdg-desktop-menu install ${LINUX_INSTALL_DIR}/${pkg.name}/${pkg.name}.desktop`,
            ],
            prerm: [`xdg-desktop-menu uninstall ${pkg.name}.desktop`],
            depends: 'libgconf-2-4',
            changelog: [],
            _target: `${LINUX_INSTALL_DIR}/${pkg.name}`,
            _out: RELEASE_DIR,
            _copyright: 'assets/linux/copyright',
            _clean: true,
    }));
}

function release_rpm(arch, appDirectory, done) {

    // Check if dpkg-deb exists
    if (!commandExistsSync('rpmbuild')) {
        console.warn(`rpmbuild command not found, not generating rpm package for ${arch}`);
        done();
    }

    // The buildRpm does not generate the folder correctly, manually
    createDirIfNotExists(RELEASE_DIR);

    const regex = /-/g;

    const options = {
            name: pkg.name,
            version: pkg.version.replace(regex, '_'), // RPM does not like release candidate versions
            buildArch: getLinuxPackageArch('rpm', arch),
            vendor: pkg.author,
            summary: pkg.description,
            license: 'GNU General Public License v3.0',
            requires: 'libgconf-2-4',
            prefix: '/opt',
            files: [{
                cwd: path.join(appDirectory, pkg.name, arch),
                src: '*',
                dest: `${LINUX_INSTALL_DIR}/${pkg.name}`,
            }],
            postInstallScript: [`xdg-desktop-menu install ${LINUX_INSTALL_DIR}/${pkg.name}/${pkg.name}.desktop`],
            preUninstallScript: [`xdg-desktop-menu uninstall ${pkg.name}.desktop`],
            tempDir: path.join(RELEASE_DIR, `tmp-rpm-build-${arch}`),
            keepTemp: false,
            verbose: false,
            rpmDest: RELEASE_DIR,
            execOpts: { maxBuffer: 1024 * 1024 * 16 },
    };

    buildRpm(options, function(err) {
        if (err) {
          console.error(`Error generating rpm package: ${err}`);
        }
        done();
    });
}

function getLinuxPackageArch(type, arch) {
    let packArch;

    switch (arch) {
    case 'linux32':
        packArch = 'i386';
        break;
    case 'linux64':
        if (type === 'rpm') {
            packArch = 'x86_64';
        } else {
            packArch = 'amd64';
        }
        break;
    default:
        console.error(`Package error, arch: ${arch}`);
        process.exit(1);
        break;
    }

    return packArch;
}
// Create distribution package for macOS platform
function release_osx64(appDirectory) {
    const appdmg = require('gulp-appdmg');

    // The appdmg does not generate the folder correctly, manually
    createDirIfNotExists(RELEASE_DIR);

    // The src pipe is not used
    return gulp.src(['.'])
        .pipe(appdmg({
            target: path.join(RELEASE_DIR, getReleaseFilename('macOS', 'dmg')),
            basepath: path.join(appDirectory, pkg.name, 'osx64'),
            specification: {
                title: 'Betaflight Configurator',
                contents: [
                    { 'x': 448, 'y': 342, 'type': 'link', 'path': '/Applications' },
                    { 'x': 192, 'y': 344, 'type': 'file', 'path': `${pkg.name}.app`, 'name': 'Betaflight Configurator.app' },
                ],
                background: path.join(__dirname, 'assets/osx/dmg-background.png'),
                format: 'UDZO',
                window: {
                    size: {
                        width: 638,
                        height: 479,
                    },
                },
            },
        })
    );
}

// Create the dir directory, with write permissions
function createDirIfNotExists(dir) {
    fs.mkdir(dir, '0775', function(err) {
        if (err && err.code !== 'EEXIST') {
            throw err;
        }
    });
}

// Create a list of the gulp tasks to execute for release
function listReleaseTasks(appDirectory) {

    const platforms = getPlatforms();

    const releaseTasks = [];

    if (platforms.indexOf('linux64') !== -1) {
        releaseTasks.push(function release_linux64_zip() {
            return release_zip('linux64', appDirectory);
        });
        releaseTasks.push(function release_linux64_deb(done) {
            return release_deb('linux64', appDirectory, done);
        });
        releaseTasks.push(function release_linux64_rpm(done) {
            return release_rpm('linux64', appDirectory, done);
        });
    }

    if (platforms.indexOf('linux32') !== -1) {
        releaseTasks.push(function release_linux32_zip() {
            return release_zip('linux32', appDirectory);
        });
        releaseTasks.push(function release_linux32_deb(done) {
            return release_deb('linux32', appDirectory, done);
        });
        releaseTasks.push(function release_linux32_rpm(done) {
            return release_rpm('linux32', appDirectory, done);
        });
    }

    if (platforms.indexOf('armv7') !== -1) {
        releaseTasks.push(function release_armv7_zip() {
            return release_zip('armv7', appDirectory);
        });
    }

    if (platforms.indexOf('osx64') !== -1) {
        releaseTasks.push(function () {
            return release_osx64(appDirectory);
        });
    }

    if (platforms.indexOf('win32') !== -1) {
        releaseTasks.push(function release_win32(done) {
            return release_win('win32', appDirectory, done);
        });
    }

    if (platforms.indexOf('win64') !== -1) {
        releaseTasks.push(function release_win64(done) {
            return release_win('win64', appDirectory, done);
        });
    }

    if (platforms.indexOf('android') !== -1) {
        releaseTasks.push(function release_android() {
            return cordova_release();
        });
    }

    return releaseTasks;
}

// Cordova
function cordova_dist() {
    const distTasks = [];
    const platforms = getPlatforms();
    if (platforms.indexOf('android') !== -1) {
        distTasks.push(clean_cordova);
        distTasks.push(cordova_copy_www);
        distTasks.push(cordova_resources);
        distTasks.push(cordova_include_www);
        distTasks.push(cordova_copy_src);
        distTasks.push(cordova_rename_src_config);
        distTasks.push(cordova_rename_src_package);
        distTasks.push(cordova_packagejson);
        distTasks.push(cordova_configxml);
        distTasks.push(cordova_browserify);
        distTasks.push(cordova_depedencies);
        if (cordovaDependencies) {
            distTasks.push(cordova_platforms);
        }
    } else {
        distTasks.push(function cordova_dist_none(done) {
            done();
        });
    }
    return distTasks;
}
function cordova_apps() {
    const appsTasks = [];
    const platforms = getPlatforms();
    if (platforms.indexOf('android') !== -1) {
        appsTasks.push(cordova_build);
    } else {
        appsTasks.push(function cordova_dist_none(done) {
            done();
        });
    }
    return appsTasks;
}


function clean_cordova() {
    const patterns = [];
    if (cordovaDependencies) {
        patterns.push(`${CORDOVA_DIST_DIR}**`);
    } else {
        patterns.push(`${CORDOVA_DIST_DIR}www/**`);
        patterns.push(`${CORDOVA_DIST_DIR}resources/**`);
    }
    return del(patterns, { force: true });
}
function cordova_copy_www() {
    return gulp.src(`${DIST_DIR}**`, { base: DIST_DIR })
        .pipe(gulp.dest(`${CORDOVA_DIST_DIR}www/`));
}
function cordova_resources() {
    return gulp.src('assets/android/**')
        .pipe(gulp.dest(`${CORDOVA_DIST_DIR}resources/android/`));
}
function cordova_include_www() {
    return gulp.src(`${CORDOVA_DIST_DIR}www/main.html`)
        .pipe(replace('<!-- CORDOVA_INCLUDE js/cordova_chromeapi.js -->', '<script type="text/javascript" src="./js/cordova_chromeapi.js"></script>'))
        .pipe(replace('<!-- CORDOVA_INCLUDE js/cordova_startup.js -->', '<script type="text/javascript" src="./js/cordova_startup.js"></script>'))
        .pipe(replace('<!-- CORDOVA_INCLUDE cordova.js -->', '<script type="text/javascript" src="cordova.js"></script>'))
        .pipe(gulp.dest(`${CORDOVA_DIST_DIR}www`));
}
function cordova_copy_src() {
    return gulp.src([`${CORDOVA_DIR}**`, `!${CORDOVA_DIR}config_template.xml`, `!${CORDOVA_DIR}package_template.json`])
        .pipe(gulp.dest(`${CORDOVA_DIST_DIR}`));
}
function cordova_rename_src_config() {
    return gulp.src(`${CORDOVA_DIR}config_template.xml`)
        .pipe(rename('config.xml'))
        .pipe(gulp.dest(`${CORDOVA_DIST_DIR}`));
}
function cordova_rename_src_package() {
    return gulp.src(`${CORDOVA_DIR}package_template.json`)
        .pipe(rename('package.json'))
        .pipe(gulp.dest(`${CORDOVA_DIST_DIR}`));
}
function cordova_packagejson() {
    return gulp.src(`${CORDOVA_DIST_DIR}package.json`)
        .pipe(jeditor({
            'name': pkg.name,
            'description': pkg.description,
            'version': pkg.version,
            'author': pkg.author,
            'license': pkg.license,
        }))
        .pipe(gulp.dest(CORDOVA_DIST_DIR));
}
function cordova_configxml() {
    return gulp.src([`${CORDOVA_DIST_DIR}config.xml`])
        .pipe(xmlTransformer([
            { path: '//xmlns:name', text: pkg.productName },
            { path: '//xmlns:description', text: pkg.description },
            { path: '//xmlns:author', text: pkg.author },
        ], 'http://www.w3.org/ns/widgets'))
        .pipe(xmlTransformer([
            { path: '.', attr: { 'version': pkg.version } },
        ]))
        .pipe(gulp.dest(CORDOVA_DIST_DIR));
}
function cordova_browserify(callback) {
    const readFile = function(file) {
        return new Promise(function(resolve) {
            if (!file.includes("node_modules")) {
                fs.readFile(file, 'utf8', async function (err,data) {
                    if (data.match('require\\(.*\\)')) {
                        const execbrowserify = await cordova_execbrowserify(file);
                    }
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
    glob(`${CORDOVA_DIST_DIR}www/**/*.js`, {}, function (err, files) {
        const readLoop = function(files) {
            if (files.length === 0) {
                callback();
            } else {
                const file = files.pop();
                readFile(file).then(function() {
                    readLoop(files);
                });
            }
        };
        readLoop(files);
    });
}
function cordova_execbrowserify(file) {
    const filename = file.split('/').pop();
    const destpath = file.replace(filename, '');
    console.log(`Include required modules in ${file}`);
    return browserify(file, { ignoreMissing: true })
        .bundle()
        .pipe(source(filename))
        .pipe(gulp.dest(destpath));
}
gulp.task('test', cordova_browserify);
function cordova_depedencies() {
    process.chdir('dist_cordova');
    return gulp.src(['./package.json', './yarn.lock'])
        .pipe(gulp.dest('./'))
        .pipe(yarn({
            production: true,
        }));
}
function cordova_platforms() {
    return cordova.platform('add', ['android']);
}
function cordova_debug() {
    cordova.run();
}
function cordova_build(cb) {
    cordova.build({
        'platforms': ['android'],
        'options': {
            release: true,
            buildConfig: 'build.json',
        },
    }).then(function() {
        process.chdir('../');
        cb();
    });
    console.log('APK will be generated at dist_cordova/platforms/android/app/build/outputs/apk/release/app-release.apk');
}
async function cordova_release() {
    const filename = await getReleaseFilename('android', 'apk');
    console.log(`Release APK : release/${filename}`);
    return gulp.src(`${CORDOVA_DIST_DIR}platforms/android/app/build/outputs/apk/release/app-release.apk`)
        .pipe(rename(filename))
        .pipe(gulp.dest(RELEASE_DIR));
}
