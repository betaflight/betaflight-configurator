const commonjs = require("@rollup/plugin-commonjs");
const resolve = require("@rollup/plugin-node-resolve").default;
const rollupReplace = require("@rollup/plugin-replace");

const NODE_ENV = process.env.NODE_ENV || 'test';

module.exports = function(config) {
    config.set({
        reporters: ['tfs', 'spec','junit'],
        basePath: '../',
        frameworks: ['mocha', 'chai', 'sinon-chai'],
        files: [
            './node_modules/jquery/dist/jquery.min.js',
            './node_modules/jquery-textcomplete/dist/jquery.textcomplete.min.js',
            './node_modules/bluebird/js/browser/bluebird.min.js',
            './node_modules/jbox/dist/jBox.min.js',
            { pattern: './src/js/msp.js',  type: 'module' },
            { pattern: './src/js/serial.js', type: 'module' },
            { pattern: './src/js/data_storage.js', type: 'module' },
            { pattern: './src/js/localization.js', type: 'module', watched: false },
            { pattern: './src/js/gui.js', type: 'module', watched: false },
            { pattern: './src/js/CliAutoComplete.js', type: 'module' },
            { pattern: './src/js/tabs/cli.js', type: 'module', watched: false },
            { pattern: './src/js/phones_ui.js', type: 'module' },
            { pattern: './test/**/*.js', type: 'module' },
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
        junitReporter: {
            outputDir: 'test-results-junit',
        },
        singleRun: true,
        preprocessors: {
             './src/js/**/*.js': ['rollup'],
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
