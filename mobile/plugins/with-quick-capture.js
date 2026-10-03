/**
 * Android Quick Capture: a Quick Settings tile and launcher shortcuts that deep-link
 * into the app's /quick-capture screen. Applied during `expo prebuild`, so it only
 * takes effect in a development or release build (not Expo Go).
 */
const fs = require("fs");
const path = require("path");
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withStringsXml,
} = require("expo/config-plugins");

const TILE_CLASS = "QuickCaptureTileService";
const SHORTCUTS_XML = "sangyan_shortcuts";

const STRINGS = {
  qc_tile_label: "Scan for scam",
  qc_tile_subtitle: "SANGYAN Shield",
  qc_shortcut_gallery_short: "Scan screenshot",
  qc_shortcut_gallery_long: "Scan a screenshot for scams",
  qc_shortcut_camera_short: "Scan with camera",
  qc_shortcut_camera_long: "Take a photo and check for scams",
  qc_shortcut_disabled: "Quick Capture is unavailable",
};

const SHIELD_PATH =
  "M12,1L3,5v6c0,5.55 3.84,10.74 9,12 5.16,-1.26 9,-6.45 9,-12L21,5l-9,-4zM12,11.99h7c-0.53,4.12 -3.28,7.79 -7,8.94L12,12L5,12L5,6.3l7,-3.11v8.8z";
const IMAGE_PATH =
  "M21,19V5c0,-1.1 -0.9,-2 -2,-2H5c-1.1,0 -2,0.9 -2,2v14c0,1.1 0.9,2 2,2h14c1.1,0 2,-0.9 2,-2zM8.5,13.5l2.5,3.01L14.5,12l4.5,6H5l3.5,-4.5z";
const CAMERA_PATH =
  "M12,12m-3.2,0a3.2,3.2 0,1 1,6.4 0a3.2,3.2 0,1 1,-6.4 0M9,2L7.17,4H4c-1.1,0 -2,0.9 -2,2v12c0,1.1 0.9,2 2,2h16c1.1,0 2,-0.9 2,-2V6c0,-1.1 -0.9,-2 -2,-2h-3.17L15,2H9zM12,17c-2.76,0 -5,-2.24 -5,-5s2.24,-5 5,-5 5,2.24 5,5 -2.24,5 -5,5z";

function getScheme(config) {
  const scheme = Array.isArray(config.scheme) ? config.scheme[0] : config.scheme;
  if (!scheme) {
    throw new Error("with-quick-capture: app.json must define a `scheme` for deep links.");
  }
  return scheme;
}

function getPackage(config) {
  const pkg = config.android && config.android.package;
  if (!pkg) {
    throw new Error("with-quick-capture: app.json must define `android.package`.");
  }
  return pkg;
}

function tileServiceSource(pkg, scheme) {
  return `package ${pkg}.quickcapture

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import ${pkg}.R

/** Quick Settings tile that opens SANGYAN Shield's Quick Capture screen. */
class ${TILE_CLASS} : TileService() {

  override fun onStartListening() {
    super.onStartListening()
    val tile = qsTile ?: return
    tile.state = Tile.STATE_INACTIVE
    tile.label = getString(R.string.qc_tile_label)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      tile.subtitle = getString(R.string.qc_tile_subtitle)
    }
    tile.updateTile()
  }

  override fun onClick() {
    super.onClick()
    // SystemUI can replay a click that arrived while the panel was closed; ignore the duplicate.
    val now = SystemClock.elapsedRealtime()
    if (now - lastClickAt < CLICK_DEBOUNCE_MS) return
    lastClickAt = now

    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(DEEP_LINK)).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    if (isLocked) {
      unlockAndRun { launch(intent) }
    } else {
      launch(intent)
    }
  }

  private fun launch(intent: Intent) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      val pending = PendingIntent.getActivity(
        this,
        0,
        intent,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      )
      startActivityAndCollapse(pending)
    } else {
      @Suppress("DEPRECATION")
      startActivityAndCollapse(intent)
    }
  }

  companion object {
    private const val CLICK_DEBOUNCE_MS = 1500L
    private var lastClickAt = 0L
    private const val DEEP_LINK = "${scheme}://quick-capture?source=tile&action=gallery"
  }
}
`;
}

function tileIconXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
  <path android:fillColor="#FFFFFFFF" android:pathData="${SHIELD_PATH}" />
</vector>
`;
}

function shortcutIconXml(glyphPath, background) {
  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="48dp"
    android:height="48dp"
    android:viewportWidth="48"
    android:viewportHeight="48">
  <path
      android:fillColor="${background}"
      android:pathData="M24,0A24,24 0,1 1,23.99 0Z" />
  <group android:translateX="12" android:translateY="12">
    <path android:fillColor="#FFFFFFFF" android:pathData="${glyphPath}" />
  </group>
</vector>
`;
}

function shortcutsXml(pkg, scheme) {
  const shortcut = (id, icon, shortLabel, longLabel, action) => `  <shortcut
      android:shortcutId="${id}"
      android:enabled="true"
      android:icon="@drawable/${icon}"
      android:shortcutShortLabel="@string/${shortLabel}"
      android:shortcutLongLabel="@string/${longLabel}"
      android:shortcutDisabledMessage="@string/qc_shortcut_disabled">
    <intent
        android:action="android.intent.action.VIEW"
        android:targetPackage="${pkg}"
        android:targetClass="${pkg}.MainActivity"
        android:data="${scheme}://quick-capture?source=shortcut&amp;action=${action}" />
  </shortcut>`;

  return `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
${shortcut(
  "quick_capture_gallery",
  "ic_qc_shortcut_gallery",
  "qc_shortcut_gallery_short",
  "qc_shortcut_gallery_long",
  "gallery"
)}
${shortcut(
  "quick_capture_camera",
  "ic_qc_shortcut_camera",
  "qc_shortcut_camera_short",
  "qc_shortcut_camera_long",
  "camera"
)}
</shortcuts>
`;
}

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

const withQuickCaptureFiles = (config) =>
  withDangerousMod(config, [
    "android",
    (cfg) => {
      const pkg = getPackage(cfg);
      const scheme = getScheme(cfg);
      const mainDir = path.join(cfg.modRequest.platformProjectRoot, "app", "src", "main");
      const javaDir = path.join(mainDir, "java", ...pkg.split("."), "quickcapture");

      writeFile(path.join(javaDir, `${TILE_CLASS}.kt`), tileServiceSource(pkg, scheme));
      writeFile(path.join(mainDir, "res", "drawable", "ic_qc_tile.xml"), tileIconXml());
      writeFile(
        path.join(mainDir, "res", "drawable", "ic_qc_shortcut_gallery.xml"),
        shortcutIconXml(IMAGE_PATH, "#FF2563EB")
      );
      writeFile(
        path.join(mainDir, "res", "drawable", "ic_qc_shortcut_camera.xml"),
        shortcutIconXml(CAMERA_PATH, "#FF0F172A")
      );
      writeFile(path.join(mainDir, "res", "xml", `${SHORTCUTS_XML}.xml`), shortcutsXml(pkg, scheme));
      return cfg;
    },
  ]);

const withQuickCaptureStrings = (config) =>
  withStringsXml(config, (cfg) => {
    for (const [name, value] of Object.entries(STRINGS)) {
      cfg.modResults = AndroidConfig.Strings.setStringItem(
        [{ $: { name, translatable: "false" }, _: value }],
        cfg.modResults
      );
    }
    return cfg;
  });

const withQuickCaptureManifest = (config) =>
  withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);

    // Cleartext traffic to the local API is configured by with-network-security.
    app.service = (app.service || []).filter(
      (service) => !service.$["android:name"].endsWith(TILE_CLASS)
    );
    app.service.push({
      $: {
        "android:name": `.quickcapture.${TILE_CLASS}`,
        "android:exported": "true",
        "android:label": "@string/qc_tile_label",
        "android:icon": "@drawable/ic_qc_tile",
        "android:permission": "android.permission.BIND_QUICK_SETTINGS_TILE",
      },
      "intent-filter": [
        { action: [{ $: { "android:name": "android.service.quicksettings.action.QS_TILE" } }] },
      ],
    });

    mainActivity["meta-data"] = (mainActivity["meta-data"] || []).filter(
      (item) => item.$["android:name"] !== "android.app.shortcuts"
    );
    mainActivity["meta-data"].push({
      $: { "android:name": "android.app.shortcuts", "android:resource": `@xml/${SHORTCUTS_XML}` },
    });
    return cfg;
  });

module.exports = function withQuickCapture(config) {
  config = withQuickCaptureFiles(config);
  config = withQuickCaptureStrings(config);
  config = withQuickCaptureManifest(config);
  return config;
};
