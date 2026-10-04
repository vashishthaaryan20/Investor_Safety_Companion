const { AndroidConfig, withAndroidManifest } = require("expo/config-plugins");

/**
 * Lets MainActivity handle system text-size changes itself instead of being recreated.
 * Recreation leaves expo-image-picker's activity-result launchers unregistered, so the
 * gallery and camera stop opening until the app is restarted. React Native still picks
 * up the new font scale through its dimension-change events.
 */
module.exports = function withFontScaleConfig(config) {
  return withAndroidManifest(config, (mod) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(mod.modResults);
    const current = activity.$["android:configChanges"] ?? "";
    const values = new Set(current.split("|").filter(Boolean));
    values.add("fontScale");
    activity.$["android:configChanges"] = [...values].join("|");
    return mod;
  });
};
