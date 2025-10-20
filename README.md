![Betaflight](https://raw.githubusercontent.com/betaflight/.github/main/profile/images/bf_logo.svg#gh-light-mode-only)
![Betaflight](https://raw.githubusercontent.com/betaflight/.github/main/profile/images/bf_logo_dark.svg#gh-dark-mode-only)

# Betaflight App

[![Latest version](https://img.shields.io/github/v/release/betaflight/betaflight-configurator)](https://github.com/betaflight/betaflight-configurator/releases)
[![Build](https://img.shields.io/github/actions/workflow/status/betaflight/betaflight-configurator/deploy.yml?branch=master)](https://github.com/betaflight/betaflight-configurator/actions/workflows/deploy.yml)
[![Crowdin](https://d322cqt584bo4o.cloudfront.net/betaflight-configurator/localized.svg)](https://crowdin.com/project/betaflight-configurator)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=betaflight_betaflight-configurator&metric=alert_status)](https://sonarcloud.io/dashboard?id=betaflight_betaflight-configurator)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Join us on Discord!](https://img.shields.io/discord/868013470023548938)](https://discord.gg/n4E6ak4u3c)


Betaflight App is a crossplatform configuration tool for the Betaflight flight control system.

The Betaflight App is a Progressive Web Application (PWA). The most recent release of the Betaflight App is available at [app.betaflight.com](https://app.betaflight.com)

NOTE: If you are considering testing the latest unstable release then it is at [master.app.betaflight.com](https://master.app.betaflight.com)

Various types of aircraft are supported by the tool and by Betaflight, e.g. quadcopters, hexacopters, octocopters and fixed-wing aircraft.

## Historical Releases

These are still available under different operating systems and allows you to configure the Betaflight software running on any supported Betaflight target. [Downloads are available in Releases.](https://github.com/betaflight/betaflight-configurator/releases)

## Installation

### Standalone

We provide a standalone program for Windows, Linux, Mac and Android.

Download the installer from [Releases.](https://github.com/betaflight/betaflight-configurator/releases)

### Notes

#### Windows users

The minimum required version of windows is Windows 8.

#### MacOS X users

Changes to the security model used in the latest versions of MacOS X 10.14 (Mojave) and 10.15 (Catalina) mean that the operating system will show an error message ('"Betaflight Configurator.app" is damaged and can’t be opened. You should move it to the Trash.') when trying to install the application. To work around this, run the following command in a terminal after installing: `sudo xattr -rd com.apple.quarantine /Applications/Betaflight\ Configurator.app`.

#### Linux users

First step is to download the installer and keep it in your working directory, which can be done with the following command:
```
wget https://github.com/betaflight/betaflight-configurator/releases/download/10.10.0/betaflight-configurator_10.10.0_amd64.deb
```

In most Linux distributions your user won't have access to serial interfaces by default. To add this access right type the following command in a terminal, log out your user and log in again:

```
sudo usermod -aG dialout ${USER}
```

Post-installation errors can be prevented by making sure the directory `/usr/share/desktop-directories` exists. To make sure it exists, run the following command before installing the package:

```
sudo mkdir /usr/share/desktop-directories/
```

The `libatomic` library must also be installed before installing Betaflight App. (If the library is missing, the installation will succeed but Betaflight App will not start.) Some Linux distributions (e.g. Fedora) will install it automatically. On Debian or Ubuntu you can install it as follows:

```
sudo apt install libatomic1
```

On Ubuntu 23.10 please follow these alternative steps for installation:

```
sudo echo "deb http://archive.ubuntu.com/ubuntu/ lunar universe" > /etc/apt/sources.list.d/lunar-repos-old.list
sudo apt update
sudo dpkg -i betaflight-configurator_10.10.0_amd64.deb
sudo apt-get -f install
```

On Ubuntu 24.10 and above, please follow these steps, as some deprecated modules are no longer available through apt on this distro:
```
sudo apt update
wget http://archive.ubuntu.com/ubuntu/pool/universe/g/gconf/libgconf-2-4_3.2.6-4ubuntu1_amd64.deb
wget http://archive.ubuntu.com/ubuntu/pool/universe/g/gconf/gconf2-common_3.2.6-4ubuntu1_all.deb
sudo dpkg -i gconf2-common_3.2.6-4ubuntu1_all.deb
sudo dpkg -i libgconf-2-4_3.2.6-4ubuntu1_amd64.deb
sudo dpkg -i betaflight-configurator_10.10.0_amd64.deb
sudo apt-get -f install
```

#### Graphics Issues

If you experience graphics display problems or smudged/dithered fonts display issues in Betaflight App, try invoking the `betaflight-configurator` executable file with the `--disable-gpu` command line switch. This will switch off hardware graphics acceleration. Likewise, setting your graphics card antialiasing option to OFF (e.g. FXAA parameter on NVidia graphics cards) might be a remedy as well.

### Unstable Testing Versions

The future of the Betaflight App is moving to a PWA (Progressive Web Application). In this way it will be easier to maintain specially to support different devices like phones, tablets. etc. Is a work in progress but you can have access to the latest snapshot in PWA way without installing anything (take into account that some things don't work and are in development).

- Latest PWA master snapshot of the App: [https://master.app.betaflight.com/](https://master.app.betaflight.com/)

**Be aware that this version is intended for testing / feedback only, and may be buggy or broken, and can cause flight controller settings to be corrupted. Caution is advised when using this version.**

## Languages

**Please do not submit pull requests for translation changes, but read and follow the instructions below!**

Betaflight App has been translated into several languages. The application will try to detect and use your system language if a translation into this language is available. You can help [translating the application into your language](https://github.com/betaflight/betaflight/tree/master/README.md#translators);

If you prefer to have the application in English or any other language, you can select your desired language in the first screen of the application.

## Build and Development

### Technical details

The next versions of the App will be a modern tool that based on PWA (Progressive Web Application) and uses principally Node, Yarn, Vite and Vue for development and building. For Android we use Capacitor as wrapper over the PWA. To build and develop over it, follow the instructions below.

### Prepare your environment

1. Install [node.js](https://nodejs.org/) (refer to [.nvmrc](./.nvmrc) for minimum required version)
2. Install yarn: `npm install yarn -g`

### PWA version

#### Run development version

1. Change to project folder and run `yarn install`.
2. Run `yarn dev`.

The web app will be available at http://localhost:8000 with full HMR.

#### Run production version

1. Change to project folder and run `yarn install`.
2. Run `yarn build`.
3. Run `yarn preview` after build has finished.

Alternatively you can run `yarn review` to build and preview in one step.

The web app should behave directly as in production, available at http://localhost:8080.

### Android version

NOTE: The Android version is not fully functional yet. It is in development.

#### Prerequisites

You need to install [Android Studio](https://developer.android.com/studio) as Capacitor apps are configured and managed through it.

#### Run development version

1. Change to project folder and run `yarn install`.
2. Run `yarn android:run`.

The command will ask for the device to run the app. You need to have some Android virtual machine created or some Android phone [connected using ADB](https://developer.android.com/tools/adb).

As alternative to the step 2, you can execute a `yarn android:open` to open de project into Android Studio and run or debug the app from there.

#### Run development version with live reload

1. Change to project folder and run `yarn install`.
2. Run `yarn dev --host`. It will start the vite server and will show you the IP address where the server is listening.
3. Run `yarn android:dev` 

This will ask for the IP where the server is running (if there are more than one network interfaces). You need to have some Android virtual machine created or some Android phone [connected using ADB](https://developer.android.com/tools/adb).
Any change make in the code will reload the app in the Android device.

### Running tests

`yarn test`

## Support and Developers Channel

There's a dedicated Discord server here:

https://discord.gg/n4E6ak4u3c

We also have a Facebook Group. Join us to get a place to talk about Betaflight, ask configuration questions, or just hang out with fellow pilots.

https://www.facebook.com/groups/betaflightgroup/

Etiquette: Don't ask to ask and please wait around long enough for a reply - sometimes people are out flying, asleep or at work and can't answer immediately.

### Issue trackers

For Betaflight App issues raise them here

https://github.com/betaflight/betaflight-configurator/issues

For Betaflight Firmware issues raise them here

https://github.com/betaflight/betaflight/issues

## Developers

We accept clean and reasonable patches, submit them!

## Credits

For the full details of the contributions made to the Betaflight App (and its predecessors) please check out the [Github contributors page](https://github.com/betaflight/betaflight-configurator/graphs/contributors).
