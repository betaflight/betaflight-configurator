const commonjs = require("@rollup/plugin-commonjs");
const resolve = require("@rollup/plugin-node-resolve").default;
const rollupReplace = require("@rollup/plugin-replace");

const NODE_ENV = process.env.NODE_ENV || 'test';

module.exports = function(config) {
    config.set({
        reporters: ['tfs', 'spec'],
        basePath: '../',
        frameworks: ['mocha', 'chai', 'sinon-chai'],
        files: [
            './node_modules/jquery/dist/jquery.min.js',
            './node_modules/jquery-textcomplete/dist/jquery.textcomplete.min.js',
            './node_modules/bluebird/js/browser/bluebird.min.js',
            './node_modules/jbox/dist/jBox.min.js',
            './src/js/serial.js',
            './src/js/data_storage.js',
            { pattern: './src/js/localization.js', type: 'module', watched: false },
            './src/js/gui.js',
            './src/js/CliAutoComplete.js',
            './src/js/tabs/cli.js',
            './src/js/phones_ui.js',
            './test/**/*.js',
        ],
        browsers: ['ChromeHeadlessNoSandbox'],
        customLaunchers: {
            ChromeHeadlessNoSandbox: {
                base: 'ChromeHeadless',
                flags: ['--no-sandbox'],
            },
        },
        tfsReporter: {
            outputDir: 'testresults',
            outputFile: 'test_results.xml',
        },
        singleRun: true,
        preprocessors: {
             './src/js/localization.js': ['rollup'],
        },
        rollupPreprocessor: {
            plugins: [
                rollupReplace({
                    'process.env.NODE_ENV': JSON.stringify(NODE_ENV),
                }),
                resolve(),
                commonjs(),
            ],
            output: {
                format: 'esm',
            },
        },
    });
};
