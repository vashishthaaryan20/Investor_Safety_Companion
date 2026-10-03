/**
 * Android network security config. Cleartext (plain HTTP) traffic is blocked everywhere
 * except the laptop API on the local network, and only system certificate authorities are
 * trusted (no user-installed CAs, which are a common way to intercept app traffic).
 * With an https:// API address, no cleartext host is allowed at all.
 *
 * The API address comes from EXPO_PUBLIC_API_BASE_URL or src/constants/api-config.json,
 * the same values the app uses, so re-run `expo prebuild` after changing it.
 */
const path = require("path");
const fs = require("fs");
const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

const CONFIG_NAME = "network_security_config";
const LOCAL_HOST =
  /^(localhost|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/;

function apiBaseUrl(projectRoot) {
  if (process.env.EXPO_PUBLIC_API_BASE_URL) return process.env.EXPO_PUBLIC_API_BASE_URL;
  const file = path.join(projectRoot, "src", "constants", "api-config.json");
  return JSON.parse(fs.readFileSync(file, "utf8")).apiBaseUrl;
}

function cleartextHosts(url) {
  const match = /^(https?):\/\/([^/:?#]+)/i.exec(url || "");
  if (!match) {
    throw new Error(`with-network-security: invalid API address "${url}"`);
  }
  const [, scheme, host] = match;
  if (scheme.toLowerCase() === "https") return [];
  if (!LOCAL_HOST.test(host.toLowerCase())) {
    throw new Error(
      `with-network-security: ${url} uses plain HTTP over the internet. Use https:// for non-local servers.`
    );
  }
  // The emulator reaches the laptop through 10.0.2.2.
  return [...new Set([host.toLowerCase(), "localhost", "127.0.0.1", "10.0.2.2"])];
}

function releaseConfig(hosts) {
  const domains = hosts.map((host) => `    <domain includeSubdomains="false">${host}</domain>`).join("\n");
  const localBlock = hosts.length
    ? `
  <!-- Development API on the local network only. -->
  <domain-config cleartextTrafficPermitted="true">
${domains}
  </domain-config>`
    : "";
  return `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>${localBlock}
</network-security-config>
`;
}

// Debug builds load JavaScript from Metro over plain HTTP on whatever address the laptop has.
const DEBUG_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true">
    <trust-anchors>
      <certificates src="system" />
      <certificates src="user" />
    </trust-anchors>
  </base-config>
</network-security-config>
`;

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

const withNetworkSecurityFiles = (config) =>
  withDangerousMod(config, [
    "android",
    (cfg) => {
      const hosts = cleartextHosts(apiBaseUrl(cfg.modRequest.projectRoot));
      const srcDir = path.join(cfg.modRequest.platformProjectRoot, "app", "src");
      writeFile(path.join(srcDir, "main", "res", "xml", `${CONFIG_NAME}.xml`), releaseConfig(hosts));
      writeFile(path.join(srcDir, "debug", "res", "xml", `${CONFIG_NAME}.xml`), DEBUG_CONFIG);
      return cfg;
    },
  ]);

const withNetworkSecurityManifest = (config) =>
  withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application[0];
    app.$["android:networkSecurityConfig"] = `@xml/${CONFIG_NAME}`;
    app.$["android:usesCleartextTraffic"] = "false";
    return cfg;
  });

module.exports = function withNetworkSecurity(config) {
  config = withNetworkSecurityFiles(config);
  config = withNetworkSecurityManifest(config);
  return config;
};
