# FabMo Build Scripts
This directory contains the scripts that define the FabMo build/release process.

## Building and Releasing
The engine and updater are built and released separately, using `build.js.` The build system assumes that the source for the engine and updater are checked out in `/fabmo` and `/fabmo-updater` respectively. The arguments for build.js are as follows:

`--product=engine|updater` The product must be specified on the command line.  It determines which product will be built (valid options are `engine` or `updater`)

`--dev` If specified, the product will be built from the latest master.  This option is mutually exclusive with `--rc` and `--release`

`--rc=version` If specified, the product will be built from the tip of the `rc` branch. Version is the version of release candidate.  So if your latest version is 2.5.1 and your release candidate is for 2.6.0 you would specify `--rc=v2.6.0`  This option is mutually exclusive with `--release` and `--dev`

`--release` If specified, the product will be built from the latest tagged release.  Release tags are annotated tags named in the form `vx.y.z` where x,y,z are the major, minor and patch versions (http://semver.org/)  The convention for these repositories is to merge the `rc` into the `release` branch at the time of release, and create an annotated tag `git tag -a v1.2.3 -m 'v1.2.3 release'` for that commit.

`--publish` If specified, the package that is built will be published via github.  Packages will be made immediately available in the package manifest from which FabMo systems out in the world are updating, so be careful!

## Consolidated Builds
The consolidated fmp is a package that includes both an engine and updater build all in the same package.  It is used in situations when a tool does not have internet access, and a single update package is preferrable to two applied in sequence.

Unlike `build.js` above, the consildated build process does not build from source - it downloads the latest prebuilt packages from github, and bundles them up.  You can specify a `dev` `rc` or `release` target for the build at the `make` command line.

To build a consolidated fmp for the latest release, just run `make` in the consolidated build folder.

To build a consolidated fmp for the latest dev or rc builds, just run `make dev` or `make rc` respectively.
 