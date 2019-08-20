# Betaflight Configurator

![Betaflight](http://static.rcgroups.net/forums/attachments/6/1/0/3/7/6/a9088900-228-bf_logo.jpg)

[![Crowdin](https://d322cqt584bo4o.cloudfront.net/betaflight-configurator/localized.svg)](https://crowdin.com/project/betaflight-configurator)

Betaflight Configurator is a crossplatform configuration tool for the Betaflight flight control system.

It runs as an app within Google Chrome and allows you to configure the Betaflight software running on any [supported Betaflight target](https://github.com/betaflight/betaflight/tree/master/src/main/target).

There is also now a standalone version available, since Google Chrome Apps are getting deprecated on platforms that aren't Chrome OS. [Downloads are available in Releases.](https://github.com/betaflight/betaflight-configurator/releases)

Various types of aircraft are supported by the tool and by Betaflight, e.g. quadcopters, hexacopters, octocopters and fixed-wing aircraft.

## Authors

Betaflight Configurator is a [fork](#credits) of the Cleanflight Configurator with support for Betaflight instead of Cleanflight.

This configurator is the only configurator with support for Betaflight specific features. It will likely require that you run the latest firmware on the flight controller.
If you are experiencing any problems please make sure you are running the [latest firmware version](https://github.com/betaflight/betaflight/releases/).

## Installation

### Standalone

**This is the default installation method, and at some point in the future this will become the only way available for most platforms. Please use this method whenever possible.**

Download the installer from [Releases.](https://github.com/betaflight/betaflight-configurator/releases)

### Via Chrome Web Store (for ChromeOS)

[![available in the Chrome web store for Chromeos](https://developer.chrome.com/webstore/images/ChromeWebStore_Badge_v2_206x58.png)](https://chrome.google.com/webstore/detail/dlgclabibdhkfnbkajgkplmkpndajfom)

1. Visit the [Betaflight Configurator product page in the Chrome web store](https://chrome.google.com/webstore/detail/dlgclabibdhkfnbkajgkplmkpndajfom)
2. Click **+ Add to Chrome**

Please note - the application will automatically update itself when new versions are released.  Please ensure you maintain configuration backups as described in the Betaflight documentation.

(A deprecated legacy version for all platforms is also available [here](https://chrome.google.com/webstore/detail/betaflight-configurator/kdaghagfopacdngbohiknlhcocjccjao).)

### Unstable Testing Versions

Unstable testing versions of the lates builds of the configurator for most platforms can be downloaded from [here](https://ci.betaflight.tech/job/BetaFlight_Configurator/).

**Be aware that these versions are intended for testing / feedback only, and may be buggy or broken, and can cause flight controller settings to be corrupted. Caution is advised when using these versions.**

## Native app build via NW.js

### Development

1. Install node.js (version 10 required)
2. Install yarn: `npm install yarn -g`
3. Change to project folder and run `yarn install`.
4. Run `yarn start`.

### Running tests

`yarn test`

### App build and release

The tasks are defined in `gulpfile.js` and can be run with through yarn:
```
yarn gulp <taskname> [[platform] [platform] ...]
```

List of possible values of `<task-name>`:
* **dist** copies all the JS and CSS files in the `./dist` folder.
* **apps** builds the apps in the `./apps` folder [1].
* **debug** builds debug version of the apps in the `./debug` folder [1].
* **release** zips up the apps into individual archives in the `./release` folder [1]. 

[1] Running this task on macOS or Linux requires Wine, since it's needed to set the icon for the Windows app (build for specific platform to avoid errors).

#### Build or release app for one specific platform
To build or release only for one specific platform you can append the plaform after the `task-name`.
If no platform is provided, all the platforms will be done in sequence.

* **MacOS** use `yarn gulp <task-name> --osx64`
* **Linux** use `yarn gulp <task-name> --linux64`
* **Windows** use `yarn gulp <task-name> --win32`
* **ChromeOS** use `yarn gulp <task-name> --chromeos`

You can also use multiple platforms e.g. `yarn gulp <taskname> --osx64 --linux64`.

## Languages

Betaflight Configurator has been translated into several languages. The application will try to detect and use your system language if a translation into this language is available. You can help [translating the application into your language](https://crowdin.com/project/betaflight-configurator).

If you prefer to have the application in English or any other language, you can select your desired language in the options menu of the application.

## Notes

### WebGL

Make sure Settings -> System -> "User hardware acceleration when available" is checked to achieve the best performance

### Linux users

Dont forget to add your user into dialout group "sudo usermod -aG dialout YOUR_USERNAME" for serial access

### Linux / MacOSX users

If you have 3D model animation problems, enable "Override software rendering list" in Chrome flags chrome://flags/#ignore-gpu-blacklist

## Support

If you need help please reach out on the [betaflightgroup](https://betaflightgroup.slack.com) slack channel before raising issues on github. Register and [request slack access here](https://slack.betaflight.com).

### Issue trackers

For Betaflight configurator issues raise them here

https://github.com/betaflight/betaflight-configurator/issues

For Betaflight firmware issues raise them here

https://github.com/betaflight/betaflight/issues

## Technical details

The configurator is based on chrome.serial API running on Google Chrome/Chromium core.

## Developers

We accept clean and reasonable patches, submit them!

## Credits

ctn - primary author and maintainer of Baseflight Configurator from which Cleanflight Configurator project was forked.

Hydra -  author and maintainer of Cleanflight Configurator from which this project was forked.

