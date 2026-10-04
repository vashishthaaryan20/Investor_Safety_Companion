/**
 * Logging for development builds only. Release builds write console output to the
 * Android system log, which other tools on the device can read, so nothing is logged there.
 * Never pass message text, OCR text, or file contents to these.
 */
export function devWarn(...args: unknown[]) {
  if (__DEV__) console.warn(...args);
}

export function devError(...args: unknown[]) {
  if (__DEV__) console.error(...args);
}
