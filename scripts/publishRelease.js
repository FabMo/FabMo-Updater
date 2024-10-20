// test routine just to test the current release creation and asset upload
// see example message for details of the release message
// github api and functions have been evolving over years ...

const { createRelease, addReleaseAsset } = require('./github'); // Adjust the path as needed

const owner = 'FabMo';
const repos = 'FabMo-Engine';
const tagName = 'v4.0.21';
const targetCommitish = 'master';
const options = {
    token: '',
    message: 'Test Release OpenSBP updates (arrays, PAUSE/DIALOG) ... '
};

async function publishRelease() {
    try {
        const release = await createRelease(owner, repos, tagName, targetCommitish, options);
        console.log('Release created:', release);

        const assetPath = '/root/build/dist/fabmo-engine_linux_raspberry-pi_v4.0.21.fmp';
        const assetUrl = await addReleaseAsset(release, assetPath, options);
        console.log('Asset uploaded:', assetUrl);
    } catch (error) {
        console.error('Error:', error);
    }
}

publishRelease();
