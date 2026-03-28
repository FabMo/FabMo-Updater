## Introduction

I am beginning a general rework and upgrade of FabMo-Updater. The "Updater" is a stand-alone maintainer and utility for the FabMo CNC Platform. The Updater is intended to manage installs and update to FabMo and to provide access to and monitoring of FabMo processing. It's general functionality is described in /fabmo-updater/.github/README-for-FabMo-Updater.md (in this folder). The broader FabMo platform is described in /fabmo-updater/.github/copilot-instructions-FabMo.md (a copy in this folder). The Updater also houses scripts for packaging releases of the software. Details can be found in /fabmo-updater/scripts/README.md.

## Coding Style

Fabmo and the FabMo-Updater are both node.js applications. They originated over 10 years ago and are architected in the style and syntax of the time. They are organized around "prototypes", are heavily callback dependent, and generally conform to the notation of that era. For consistency, we want to maintain the style where possible and convenient. There will be times, of course, where more modern syntax and other features will make better sense and are permissible.

Avoid the tendancy of indiscriminant conversion of existing code or code interactions to "async" style functions. Over recent years we have found that this can create more problems than it solves. Be very careful where timing, flow, and synchronicity are involved.

## Goals for the Reworking

I would generally like to make the Updater a more robust an useful helper for FabMo. We will do this through cleaning up the code and updating dependencies as well as adding some new features. Several developers have worked on portions of new features that look promising, but have not been well integrated. We will be attempting to pull some of this work in.