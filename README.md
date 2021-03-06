# FabMo-Updater
Update agent for the Fabmo Engine

## Overview
The FabMo Updater is companion software to the FabMo Engine.  It provides online update and repair capabilities, as well as network management.  A more appropriate name for it might be the _FabMo Agent_ for this reason. 

## Design Philosophy
In systems where the network is the only means of accessing the FabMo software (Such as on the Intel Edison) it is critical that the network management be done by a small, simple, robust software agent.  The updater aims to be this, above all else, and for this reason, network management is a function of the updater, not the engine.  The updater, then, provides the following functions at a high level:

  1. Network management
  2. Online Updates
  3. System identity and security management
  4. Failsafe and factory reset operations
  5. Engine service management
  6. System management (reboot, shutdown, etc.)

## Installation
The standard install location for the updater is `/fabmo/updater` - To install:

 1. Clone the source
 2. `npm install` in the source directory to install dependencies
 3. (optional) copy the systemd service file `files/fabmo-updater.service` to `/etc/systemd/system` and enable the service with `systemctl enable fabmo-updater`

## Configuration
The default location for the updater configuration file is `/opt/fabmo/config/updater.json` - if this file or the parent directory does not exist, they will be created.  The configuration file can be edited manually, but should not be modified while the updater is running.  The updater uses and relies on a number of other files in the `/opt/fabmo` directory.  Code that manages configuration can be found in the `/config` directory.

## First Launch
On first launch, the updater will attempt to detect the system on which it is running.  The _os_ is detected reliably using functions internal to node.js, but the _platform,_ which corresponds to the specific hardware system on which the software is run, is determined by inference from features available at the time of launch.  (The code to do this is found in `updater.js`)  Examples of platforms might be `edison` for the Intel Edison, or `beaglboneblack` for the TI BeagleBone Black.  At the time of this writing, these are the only non-generic platforms available, but more will be added as time progresses.  If the platform is not correctly detected, it can be changed by editing the `updater.json` file specified above.

## Design Specifics

### Web Interface
A web interface is provided, which is by convention hosted on a port that is one higher than the port of the engine.  (So if the engine is hosted on port 9876, the updater should be hosted on port 9877) The default port for the FabMo engine is 80, so the default port for the updater is 81, unless changed.  The web interface of the updater is meant to be informative and simple to use, but ideally, update functionality is initiated and monitored through the engine.  (fabmo.js provides functions to this effect)

A "simple" update interface is provided that simply applies the latest update version and exits, providing a full-screen spinner and message.  This interface can be accessed simply by redirecting to the appropriate url, `/do_update`

### Platform Independence with "Hooks"
In order to perform system functions using node.js without having to have special purpose cross-platform libraries for everything, a system of "hooks" is implemented, which allows for instances of the updater running on different platforms to run different code to perform specific system functions.  A hook is simply a script, run external to the updater, which provides a named function.  Generically, the updater provides a number of named functions for updating, system management, and networking, which are implemented specifically by hooks for each specific platform.  Take as an example the hook to start and stop the engine service.  On most linux systems, this is simply achieved by the commands `systemctl start fabmo` and `systemctl stop fabmo` respectively.  On OSX however, launchd is used, and on ubuntu linux, upstart is used, instead of systemd.  For all systems, these functions are simply provided by hook scripts, which can be customized for individual platforms.

### Network Management
The network manager is written in a fashion similar to the platform independent hooks.  It provides different versions of network management code for each os/platform that is available.  As an example here, the OS X network manager performs its wireless survey operations using the `airport` command line tool, whereas the Intel Edison network manager uses a variant of `configure_edison` which is the configuration script that comes with that platform.

### Update (FMP) Packages
One core function of the updater is to fetch and apply updates, both to itself and other products. This importantly includes FabMo engine. In order to do this, it fetches a manifest describing packages that are available to download, and rifles through these to find the most appropriate updates to apply.  It does this by comparing versions in the manifest with the versions of installed products on disk, and chooses the most recent version of each product (if it is newer than the current version) to download.  Releases are applied in priority order, based on the products being installed.  Self-updates (updates to the updater itself) are downloaded and applied first, to make sure that other product packages that might need a newer updater have one available for installation.  The code that manages the download, prioritization, and application of new packages is located in the `/fmp` package

### Self Updates
The updater can also update *itself* but this should always be done with caution.  The updater must shut itself down and hand the update off to an external process in order to update, so progress monitoring can't be done.  The update is managed on the edison by a systemd service, but could be executed externally on different systems in different ways.  The command that initiates the self update is a hook for this reason.

## Getting Started with Development
The following sections aim to provide a quick start guide for development.

### Application Entry Point
The application entry point is `server.js`, which instantiates the application object, called `Updater`, and calls its `start()` method.  The `Updater` application object and its `start` method are defined in `updater.js` - The `start` function defines the main flow of application startup.  It is responsible for doing all initialization and starting all processes that are important to application function, including starting the network manager and webserver.

### Code Organization and Packages
Major packages and their function are listed below.  More detailed documentation for these components can be found at the top of their relevant files, or in README files located in the package directory.  High level documentation for packages can typically be found in the `index.js` file in that packages root.

 * `/config` - Configuration module.  Defines how the updater and user configurations are defined and behave.
 * `/files` - Supplemental files for installation.  No code here.
 * `/fmp` - Updater packaging module.  Defines how the updater downloads, prioritizes and installs update packages.
 * `/hooks` - Hooks module.  Hooks are functions that call external, platform-specific scripts.  See `hooks/index.js` for a detailed description of how hooks work.
 * `/network` - Network management module.  Defines how wifi and ethernet connections are managed.
 * `/routes` - HTTP Routes.  Defines the endpoints for the web interface and the websocket.
 * `/scripts` - Build and deployment scripts for the engine and updater.  See `/scripts/README.md` for information.  There is no code for the updater itself in this directory.
 * `/static` - Static files for the web frontend.
