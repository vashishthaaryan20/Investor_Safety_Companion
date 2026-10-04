/**
 * The default Expo Gradle heap runs out of Metaspace while compiling the New Architecture
 * native code on Windows. Raise the Gradle and Kotlin daemon limits for local builds.
 */
const { withGradleProperties } = require("expo/config-plugins");

const PROPERTIES = {
  "org.gradle.jvmargs": "-Xmx4096m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8",
  "kotlin.daemon.jvmargs": "-Xmx2048m -XX:MaxMetaspaceSize=1024m",
};

module.exports = function withAndroidBuildMemory(config) {
  return withGradleProperties(config, (cfg) => {
    for (const [key, value] of Object.entries(PROPERTIES)) {
      const existing = cfg.modResults.find((item) => item.type === "property" && item.key === key);
      if (existing) {
        existing.value = value;
      } else {
        cfg.modResults.push({ type: "property", key, value });
      }
    }
    return cfg;
  });
};
