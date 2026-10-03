/**
 * Screen capture + area selection used by the Quick Capture tile.
 * The tile itself comes from with-quick-capture.js; its tap launches CaptureActivity.
 * Kotlin sources live in ./screen-select and are copied in during `expo prebuild`.
 */
const fs = require("fs");
const path = require("path");
const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

const NOTIFICATION_TITLE = "Scan for scam";
const SRC_DIR = path.join(__dirname, "screen-select");
const KOTLIN_FILES = ["CaptureActivity.kt", "CaptureService.kt", "SelectionActivity.kt"];
const PERMISSIONS = [
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION",
  "android.permission.POST_NOTIFICATIONS",
];

function getPackage(config) {
  const pkg = config.android && config.android.package;
  if (!pkg) throw new Error("with-screen-select: app.json must define `android.package`.");
  return pkg;
}

function getScheme(config) {
  const scheme = Array.isArray(config.scheme) ? config.scheme[0] : config.scheme;
  if (!scheme) throw new Error("with-screen-select: app.json must define a `scheme`.");
  return scheme;
}

function addUnique(list, name, entry) {
  if (!list.some((item) => item.$ && item.$["android:name"] === name)) list.push(entry);
}

const withFiles = (config) =>
  withDangerousMod(config, [
    "android",
    (cfg) => {
      const pkg = getPackage(cfg);
      const scheme = getScheme(cfg);
      const mainDir = path.join(cfg.modRequest.platformProjectRoot, "app", "src", "main");
      const javaDir = path.join(mainDir, "java", ...pkg.split("."));
      fs.mkdirSync(javaDir, { recursive: true });

      for (const file of KOTLIN_FILES) {
        let src = fs.readFileSync(path.join(SRC_DIR, file), "utf8");
        src = src.replace(/^package .*$/m, `package ${pkg}`);
        src = src.replace(
          /private const val APP_SCHEME = ".*"/,
          `private const val APP_SCHEME = "${scheme}"`
        );
        src = src.split('"Scam Check"').join(`"${NOTIFICATION_TITLE}"`);
        fs.writeFileSync(path.join(javaDir, file), src);
      }

      const drawableDir = path.join(mainDir, "res", "drawable");
      fs.mkdirSync(drawableDir, { recursive: true });
      fs.copyFileSync(path.join(SRC_DIR, "ic_tile.xml"), path.join(drawableDir, "ic_tile.xml"));
      return cfg;
    },
  ]);

const withManifest = (config) =>
  withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    manifest["uses-permission"] = manifest["uses-permission"] || [];
    for (const name of PERMISSIONS) {
      addUnique(manifest["uses-permission"], name, { $: { "android:name": name } });
    }

    const app = manifest.application[0];
    app.service = app.service || [];
    app.activity = app.activity || [];

    addUnique(app.service, ".CaptureService", {
      $: {
        "android:name": ".CaptureService",
        "android:exported": "false",
        "android:foregroundServiceType": "mediaProjection",
      },
    });

    addUnique(app.activity, ".CaptureActivity", {
      $: {
        "android:name": ".CaptureActivity",
        "android:exported": "false",
        "android:excludeFromRecents": "true",
        "android:taskAffinity": "",
        "android:theme": "@android:style/Theme.Translucent.NoTitleBar",
      },
    });

    addUnique(app.activity, ".SelectionActivity", {
      $: {
        "android:name": ".SelectionActivity",
        "android:exported": "false",
        "android:excludeFromRecents": "true",
        "android:taskAffinity": "",
        "android:theme": "@android:style/Theme.Black.NoTitleBar.Fullscreen",
      },
    });

    return cfg;
  });

module.exports = (config) => withManifest(withFiles(config));