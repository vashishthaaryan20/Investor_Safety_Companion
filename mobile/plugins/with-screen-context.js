/**
 * Screen context: check content from other apps without browsing the gallery.
 *  - "Analyze screen" Quick Settings tile -> user-consented one-frame MediaProjection capture.
 *  - Share target ("Check with SANGYAN Shield") for images and text.
 * Both hand off to the app's /screen-context screen. Native sources live in
 * ./screen-context and are copied in during `expo prebuild` (not available in Expo Go).
 */
const fs = require("fs");
const path = require("path");
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withStringsXml,
} = require("expo/config-plugins");

const SOURCE_DIR = path.join(__dirname, "screen-context");
const SOURCES = [
  "ScreenContextStore.kt",
  "ScreenCaptureActivity.kt",
  "ScreenCaptureService.kt",
  "ShareReceiverActivity.kt",
  "ScreenContextTileService.kt",
  "AddTileActivity.kt",
];

const STRINGS = {
  sc_tile_label: "Analyze screen",
  sc_tile_subtitle: "SANGYAN Shield",
  sc_share_label: "Check with SANGYAN Shield",
  sc_channel_name: "Screen check",
  sc_notification_title: "Checking this screen",
  sc_notification_text: "SANGYAN Shield is taking one picture of your screen.",
};

const PERMISSIONS = [
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION",
];

// The capture activities must survive these without being recreated mid-capture.
const CONFIG_CHANGES =
  "keyboard|keyboardHidden|orientation|screenSize|screenLayout|smallestScreenSize|uiMode|fontScale|density";

const TRANSLUCENT = "@android:style/Theme.Translucent.NoTitleBar";

// Corner brackets around a dot: "look at this screen".
const TILE_ICON_PATH =
  "M3,5v4h2V5h4V3H5C3.9,3 3,3.9 3,5zM5,15H3v4c0,1.1 0.9,2 2,2h4v-2H5V15zM19,19h-4v2h4c1.1,0 2,-0.9 2,-2v-4h-2V19zM19,3h-4v2h4v4h2V5C21,3.9 20.1,3 19,3zM12,9a3,3 0,1 0,0.01 0z";

function getScheme(config) {
  const scheme = Array.isArray(config.scheme) ? config.scheme[0] : config.scheme;
  if (!scheme) {
    throw new Error("with-screen-context: app.json must define a `scheme` for deep links.");
  }
  return scheme;
}

function getPackage(config) {
  const pkg = config.android && config.android.package;
  if (!pkg) {
    throw new Error("with-screen-context: app.json must define `android.package`.");
  }
  return pkg;
}

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function tileIconXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
  <path android:fillColor="#FFFFFFFF" android:pathData="${TILE_ICON_PATH}" />
</vector>
`;
}

const withScreenContextFiles = (config) =>
  withDangerousMod(config, [
    "android",
    (cfg) => {
      const pkg = getPackage(cfg);
      const scheme = getScheme(cfg);
      const mainDir = path.join(cfg.modRequest.platformProjectRoot, "app", "src", "main");
      const javaDir = path.join(mainDir, "java", ...pkg.split("."), "screencontext");

      for (const name of SOURCES) {
        const source = fs
          .readFileSync(path.join(SOURCE_DIR, name), "utf8")
          .replaceAll("__PACKAGE__", pkg)
          .replaceAll("__SCHEME__", scheme);
        writeFile(path.join(javaDir, name), source);
      }
      writeFile(path.join(mainDir, "res", "drawable", "ic_sc_tile.xml"), tileIconXml());
      return cfg;
    },
  ]);

const withScreenContextStrings = (config) =>
  withStringsXml(config, (cfg) => {
    for (const [name, value] of Object.entries(STRINGS)) {
      cfg.modResults = AndroidConfig.Strings.setStringItem(
        [{ $: { name, translatable: "false" }, _: value }],
        cfg.modResults
      );
    }
    return cfg;
  });

function replaceByName(list, entry) {
  const name = entry.$["android:name"];
  return [...(list || []).filter((item) => item.$["android:name"] !== name), entry];
}

const withScreenContextManifest = (config) =>
  withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const pkg = getPackage(cfg);
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    AndroidConfig.Permissions.ensurePermissions(manifest, PERMISSIONS);

    const hiddenActivity = {
      "android:exported": "false",
      "android:theme": TRANSLUCENT,
      "android:taskAffinity": "",
      "android:excludeFromRecents": "true",
      "android:configChanges": CONFIG_CHANGES,
    };

    app.activity = replaceByName(app.activity, {
      $: { "android:name": ".screencontext.ScreenCaptureActivity", ...hiddenActivity },
    });
    app.activity = replaceByName(app.activity, {
      $: {
        "android:name": ".screencontext.ShareReceiverActivity",
        ...hiddenActivity,
        "android:exported": "true",
        "android:label": "@string/sc_share_label",
      },
      "intent-filter": [
        {
          action: [{ $: { "android:name": "android.intent.action.SEND" } }],
          category: [{ $: { "android:name": "android.intent.category.DEFAULT" } }],
          data: [{ $: { "android:mimeType": "image/*" } }, { $: { "android:mimeType": "text/plain" } }],
        },
      ],
    });
    app.activity = replaceByName(app.activity, {
      $: {
        "android:name": ".screencontext.AddTileActivity",
        ...hiddenActivity,
        "android:exported": "true",
      },
      "intent-filter": [
        {
          action: [{ $: { "android:name": `${pkg}.action.ADD_SCREEN_TILE` } }],
          category: [{ $: { "android:name": "android.intent.category.DEFAULT" } }],
        },
      ],
    });

    app.service = replaceByName(app.service, {
      $: {
        "android:name": ".screencontext.ScreenCaptureService",
        "android:exported": "false",
        "android:foregroundServiceType": "mediaProjection",
      },
    });
    app.service = replaceByName(app.service, {
      $: {
        "android:name": ".screencontext.ScreenContextTileService",
        "android:exported": "true",
        "android:label": "@string/sc_tile_label",
        "android:icon": "@drawable/ic_sc_tile",
        "android:permission": "android.permission.BIND_QUICK_SETTINGS_TILE",
      },
      "intent-filter": [
        { action: [{ $: { "android:name": "android.service.quicksettings.action.QS_TILE" } }] },
      ],
    });
    return cfg;
  });

module.exports = function withScreenContext(config) {
  config = withScreenContextFiles(config);
  config = withScreenContextStrings(config);
  config = withScreenContextManifest(config);
  return config;
};
