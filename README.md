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
The default location for the updater configuration file is `/opt/fabmo/config/updater.json` - if this file or the parent directory does not exist, they will be created.  The configuration file can be edited manually, but should not be modified while the updater is running.

## First Launch
On first launch, the updater will attempt to detect the system on which it is running.  The _os_ is detected reliably using functions internal to node.js, but the _platform,_ which corresponds to the specific hardware system on which the software is run, is determined by inference from features available at the time of launch.  Examples of platforms might be `edison` for the Intel Edison, or `beaglboneblack` for the TI BeagleBone Black.  At the time of this writing, these are the only non-generic platforms available, but more will be added as time progresses.  If the platform is not correctly detected, it can be changed by editing the `updater.json` file specified above.

## Design Specifics

### Web Interface
A web interface is provided, which is by convention hosted on a port that is one higher than the port of the engine.  (So if the engine is hosted on port 9876, the updater should be hosted on port 9877) The default port for the FabMo engine is 80, so the default port for the updater is 81, unless changed.  The web interface of the updater is meant to be informative and simple to use, but ideally, update functionality is initiated and monitored through the engine.  (fabmo.js provides functions to this effect)

A "simple" update interface is provided that simply updates the engine to the latest version and exits, providing a full-screen spinner and message.  This interface can be accessed simply by redirecting to the appropriate url, `/do_update`

### Platform Independence with "Hooks"
In order to perform system functions using node.js without having to have special purpose cross-platform libraries for everything, a system of "hooks" is implemented, which allows for instances of the updater running on different platforms to run different code to perform specific system functions.  A hook is simply a script, run external to the updater, which provides a named function.  Generically, the updater provides a number of named functions for updating, system management, and networking, which are implemented specifically by hooks for each specific platform.  Take as an example the hook to start and stop the engine service.  On most linux systems, this is simply achieved by the commands `systemctl start fabmo` and `systemctl stop fabmo` respectively.  On OSX however, launchd is used, and on ubuntu linux, upstart is used, instead of systemd.  For all systems, these functions are simply provided by hook scripts, which can be customized for individual platforms.

### Network Management
The network manager is written in a fashion similar to the platform independent hooks.  It provides different versions of network management code for each os/platform that is available.  As an example here, the OS X network manager performs its wireless survey operations using the `airport` command line tool, whereas the Intel Edison network manager uses a variant of `configure_edison` which is the configuration script that comes with that platform.

### Update Functionality Using git
Updates are done using hooks, and the default hook uses `git` to perform the update operation. The git URL is provided in the `updater.json` configuration file.  Updates can be peformed to any name that is recognized in a git checkout, which includes individual hashes, branch names, and tag names.

### .fmu Updates
In the absence of a network connection, or in the instance that a `git` based network update fails for some reason, an alternative update vector is provided with .fmu files.  An .fmu file is simply a bzipped tar archive that contains installation data, including a manifest, an install script, and the files to be installed.  An .fmu file can be delivered to the updater and is executed on reciept, performing its prescribed actions and taking whatever action is necessary to put the system back in a workable state.  An .fmu file needn't even be a software update, and can be used to perform system maintenance in a way that is not supported natively by the updater.

### Self Updates
The updater can also update *itself* but this should always be done with caution.  The updater must shut itself down and hand the update off to an external process in order to update, so progress monitoring can't be done.  The update is managed on the edison by a systemd service.
