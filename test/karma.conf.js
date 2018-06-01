module.exports = function(config) {
    config.set({
        basePath: '../',
        frameworks: ['mocha', 'chai', 'sinon-chai'],
        files: [
            './libraries/jquery-2.1.4.min.js',
            './libraries/bluebird.min.js',
            './src/js/serial.js',
            './src/js/data_storage.js',
            './src/js/localization.js',
            './src/js/gui.js',
            './src/js/tabs/cli.js',
            './test/**/*.js'
        ],
        browsers: ['ChromeHeadlessNoSandbox'],
        customLaunchers: {
            ChromeHeadlessNoSandbox: {
                base: 'ChromeHeadless',
                flags: ['--no-sandbox']
            }
        },
        singleRun: true
    });
};
