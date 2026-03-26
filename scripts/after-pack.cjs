// electron-builder afterPack hook
// Ad-hoc signs the macOS .app bundle so that Gatekeeper no longer reports
// the app as "damaged".  A proper Apple Developer certificate is still
// required for full notarisation, but ad-hoc signing upgrades the UX from
// "damaged and can't be opened" (unusable) to "unidentified developer"
// (bypassable via System Settings > Privacy & Security > Open Anyway).

const { execSync } = require("child_process");
const path = require("path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  console.log(`  \u2022 ad-hoc signing  app=${appPath}`);
  execSync(`codesign --force --deep --sign - "${appPath}"`, {
    stdio: "inherit",
  });
};
