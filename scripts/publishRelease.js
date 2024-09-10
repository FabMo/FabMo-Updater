// test routine just to test the current release creation and asset upload
// see example message for details of the release message
// github api and functions have been evolving over years ...

const { createRelease, addReleaseAsset } = require('./github'); // Adjust the path as needed

const owner = 'FabMo';
const repos = 'FabMo-Engine';
const tagName = 'v4.0.17';
const targetCommitish = 'master';
const options = {
    token: '',
    message: 'Test Release message\n\nThis is a multi-line message.\nIt includes several lines of text.\n\n* Item 1\n* Item 2\n* Item 3'
};

async function publishRelease() {
    try {
        const release = await createRelease(owner, repos, tagName, targetCommitish, options);
        console.log('Release created:', release);

        const assetPath = '/root/build/dist/fabmo-engine_linux_raspberry-pi_v4.0.17.fmp';
        const assetUrl = await addReleaseAsset(release, assetPath, options);
        console.log('Asset uploaded:', assetUrl);
    } catch (error) {
        console.error('Error:', error);
    }
}

publishRelease();
