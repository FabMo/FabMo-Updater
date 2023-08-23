# FabMo-Updater
Update agent for the Fabmo Engine

## Overview
The FabMo Updater is companion software to the FabMo Engine.  It provides online update and repair capabilities. 

## Design Philosophy
In systems where the network may be the only means of accessing the FabMo software (e.g. headless operation of Raspberry Pi) it is helpful to have a simple, robust, independent agent to handle management. The updater aims to be this. It provides the following functions at a high level:

  1. Online Updates
  2. System identity and security management
  3. Restart operations
  4. Engine service management
  
## Installation
The standard install location for the updater is `/fabmo-updater` - To install (on the first occasion):

 1. Clone the source
 2. `npm install` in the source directory to install dependencies
 3. (optional) copy the systemd service file `files/fabmo-updater.service` to `/etc/systemd/system` and enable the service with `systemctl enable fabmo-updater`

## Configuration
The default location for the updater configuration file is `/opt/fabmo/config/updater.json` - if this file or the parent directory does not exist, they will be created the first time the updater is started -- it will then need to be started again.  The configuration file can be edited manually, but should not be modified while the updater is running.  The updater uses and relies on a number of other files in the `/opt/fabmo` directory.  Code that manages configuration can be found in the `/fabmo-updater/config` directory.

## First Launch
The updater has been designed in anticipation of running on additional _os_'s and _platform_'s. On first launch, the updater will attempt to detect the system on which it is running.  The _os_ is detected reliably using functions internal to node.js, but the _platform,_ which corresponds to the specific hardware system on which the software is run, is determined by inference from features available at the time of launch.

## Design Specifics

### Web Interface
A web interface is provided, which is by convention hosted on a port that is one higher than the port of the engine.  The default port for the FabMo engine is 80, so the default port for the updater is 81, unless changed.  The web interface of the updater is meant to be informative and simple to use, but ideally, update functionality for normal users can be simply initiated and monitored through the engine.  

Here, a "simple" update interface is provided that just applies the latest update version and exits, providing a full-screen spinner and message.  This interface also can be accessed by redirecting to the appropriate url, `/do_update`

### Platform Independence with "Hooks"
In order to perform system functions using node.js without having to have special purpose cross-platform libraries for everything, a system of "hooks" is implemented, which allows for instances of the updater running on different platforms to run different code to perform specific system functions.  A hook is simply a script, run external to the updater, which provides a named function.  Generically, the updater provides a number of named functions for updating, system management, and networking, which are implemented specifically by hooks for each specific platform.  Take as an example the hook to start and stop the engine service.  On most linux systems, this is simply achieved by the commands `systemctl start fabmo` and `systemctl stop fabmo` respectively.  On OSX however, launchd is used, and on ubuntu linux, upstart is used, instead of systemd.  For all systems, these functions are simply provided by hook scripts, which can be customized for individual platforms. Only the hook scripts for the Raspberry-pi are currently supported. Others have been stubbed in but not tested.

### Update (FMP) Packages
The core function of the updater is to fetch and apply updates, both to itself and other products. This importantly includes the FabMo Engine. In order to do this, it fetches a manifest describing packages that are available to download, and rifles through these to find the most appropriate updates to apply.  It does this by comparing versions in the manifest with the versions of installed products on disk, and chooses the most recent version of each product (if it is newer than the current version) to download.  Releases are applied in priority order, based on the products being installed.  Self-updates (updates to the updater itself) are downloaded and applied first to make sure that other product packages that might need a newer updater have one available for installation.  The code that manages the download, prioritization, and application of new packages is located in the `/fmp` package

## Getting Started with Development
The following sections aim to provide a quick start guide for development.

### Application Entry Point
The application entry point is `server.js`, which instantiates the application object, called `Updater`, and calls its `start()` method.  The `Updater` application object and its `start` method are defined in `updater.js` - The `start` function defines the main flow of application startup.  It is responsible for doing all initialization and starting all processes that are important to application function, including starting the webserver.

### Code Organization and Packages
Major packages and their function are listed below.  More detailed documentation for these components can be found at the top of their relevant files, or in README files located in the package directory.  High level documentation for packages can typically be found in the `index.js` file in that packages root.

 * `/config` - Configuration module.  Defines how the updater and user configurations are defined and behave.
 * `/files` - Supplemental files for installation.  No code here.
 * `/fmp` - Updater packaging module.  Defines how the updater downloads, prioritizes and installs update packages.
 * `/hooks` - Hooks module.  Hooks are functions that call external, platform-specific scripts.  See `hooks/index.js` for a detailed description of how hooks work.
 * `/routes` - HTTP Routes.  Defines the endpoints for the web interface and the websocket.
 * `/scripts` - Build and deployment scripts for the engine and updater.  See `/scripts/README.md` for information.  There is no code for the updater itself in this directory.
 * `/static` - Static files for the web frontend.
