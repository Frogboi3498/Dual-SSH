// Ad-hoc code-sign the macOS app so it launches on Apple Silicon.
// (No Apple Developer ID is used, so macOS will still ask you to approve it once.)
const { execFileSync } = require('child_process');
const path = require('path');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin' || process.platform !== 'darwin') return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  try {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  } catch (e) {
    console.warn('ad-hoc codesign skipped:', e.message);
  }
};
