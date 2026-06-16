const fs = require("fs/promises");
const path = require("path");
const plist = require("plist");

const APP_NAME = "NearDrop";
const LOCAL_NETWORK_USAGE =
  "NearDrop uses your local network to discover nearby devices and transfer files directly.";
const BONJOUR_SERVICES = ["_orbitalshare._tcp"];

async function readPlist(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return plist.parse(raw);
}

async function writePlist(filePath, value) {
  await fs.writeFile(filePath, plist.build(value), "utf8");
}

async function updateInfoPlist(filePath, updater) {
  const info = await readPlist(filePath);
  updater(info);
  await writePlist(filePath, info);
}

function localNetworkKeys(info) {
  info.NSLocalNetworkUsageDescription = LOCAL_NETWORK_USAGE;
  info.NSBonjourServices = BONJOUR_SERVICES;
}

exports.default = async function normalizeMacIdentity(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appPath = path.join(context.appOutDir, `${APP_NAME}.app`);
  const contentsPath = path.join(appPath, "Contents");
  const frameworksPath = path.join(contentsPath, "Frameworks");

  await updateInfoPlist(path.join(contentsPath, "Info.plist"), (info) => {
    info.CFBundleName = APP_NAME;
    info.CFBundleDisplayName = APP_NAME;
    localNetworkKeys(info);
  });

  const helperEntries = await fs.readdir(frameworksPath, { withFileTypes: true });
  await Promise.all(
    helperEntries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${APP_NAME} Helper`))
      .map(async (entry) => {
        const helperInfoPath = path.join(
          frameworksPath,
          entry.name,
          "Contents",
          "Info.plist"
        );

        await updateInfoPlist(helperInfoPath, (info) => {
          const displayName =
            typeof info.CFBundleDisplayName === "string" && info.CFBundleDisplayName
              ? info.CFBundleDisplayName
              : entry.name.replace(/\.app$/, "");
          info.CFBundleName = displayName;
          info.CFBundleDisplayName = displayName;
          localNetworkKeys(info);
        });
      })
  );
};
