# Native Betaflight Configurator

![Betaflight](http://static.rcgroups.net/forums/attachments/6/1/0/3/7/6/a9088900-228-bf_logo.jpg)

The Native Betaflight Configurator is a crossplatform configuration tool for the Betaflight flight control system that does not require Chrome to run.


## Installation

Download the latest version of the app from the releases page.

### Developers

1. Clone the repo and `cd` into the new directory
2. Install [node.js](https://nodejs.org/en/download/) then `npm install && npm start`

The default bower task, started by running `npm start`, will watch the source directories and rebuild on changes.

#### Building For Release

Run `npm run release` and the `build` folder will be populated with the supported platforms' binaries.

#### npm tasks

`npm run [script name]` reads `package.json`'s `scripts` key and the following tasks perform these functions:

 - `start`: runs the `build` and `app` tasks at the same time
 - `build`: executes the default `gulp.js` task, as specified in the `gulpfile.js`, to build any compiled and minified assets in the app
 - `app`: runs the [nw.js](https://github.com/nwjs/nw.js) app in development mode
 - `release`: compiles the binary versions of the app as specified in the `release` gulp task
 - `clean`: cleans all binary versions of the app

## Linux users

Dont forget to add your user into dialout group "sudo usermod -aG dialout YOUR_USERNAME" for serial access (TODO: confirm, is this still necessary?)

### Issue trackers

For Betaflight configurator issues raise them here

https://github.com/betaflight/betaflight-configurator/issues

For Betaflight firmware issues raise them here

https://github.com/betaflight/betaflight/issues

## Credits

Native Betaflight Configurator is a fork of the BetaFlight configurator with native support without requiring chrome.

Upstream changes will continue to be merged into this project.

Many thanks to developers of the BetaFlight, CleanFlight and the BaseFlight configurators.
