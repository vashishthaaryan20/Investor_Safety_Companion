# Privacy and security

What SANGYAN Shield sends, stores and deletes, and how to check it.

## What leaves the phone

Nothing is sent until the user reviews the content and taps the send button (“Check for scam signs”, “Analyze now” or “Send for checking”). Every one of those screens shows a preview and says what will be sent.

A check sends exactly one of:

- the chosen screenshot (JPEG/PNG/WebP, at most 10 MB), or
- the typed or shared message (at most 20,000 characters),

plus the question the user picked and where the content came from (`scan`, `tile`, `share`, ...). No account, device ID, contacts or location are sent. The app contains no API keys or secrets; the only configuration is the server address in `mobile/src/constants/api-config.json`.

“Report a scam” and “Wrong result” send the text read from the screenshot, and only when the user taps them (the result screen says so).

## What the server keeps

Nothing from a check. Images are decoded in memory, analysed and discarded; `/api/v1/save-image-json` no longer writes uploads to disk. Logs contain only metadata (source, question, image format and size, risk level, number of signals), never message text, OCR text, filenames or header values. Errors are logged as exception type and line only.

Reports sent with “Report a scam” / “Wrong result” are stored in `phishing_detector/.cache/feedback.sqlite3` for review.

## What the phone keeps

| Data | Where | When it is deleted |
| --- | --- | --- |
| Tile capture or shared image | `cache/screen-context/` | After the check, on Cancel/Back, when replaced, or 30 minutes after being abandoned |
| Shared text | `cache/screen-context/` | Read into memory and deleted immediately |
| Gallery pick / camera photo copy | `cache/ImagePicker/` | Same as tile captures. The original in the gallery is never touched |
| Check result | History (AsyncStorage) | When the user deletes it or clears history; never saved if “Save new checks” is off |

Screenshots are never stored in History. Before a result is saved, phone numbers, card, Aadhaar and account numbers, UPI IDs, emails, PAN, OTPs and codes, and URL query strings are masked (`mobile/src/services/redact.ts`). Older history entries are masked when they are loaded. Stale temporary files are cleaned up on launch and every time the app returns to the foreground; “Clear all history” also removes every temporary copy.

Android backup is disabled (`allowBackup: false`), so history is not copied to cloud backups.

## Network

- Android blocks plain HTTP everywhere except the development server address from `api-config.json` (plus localhost and the emulator host), using a generated `network_security_config.xml` (`mobile/plugins/with-network-security.js`). Only system certificate authorities are trusted in release builds.
- With an `https://` address, no plain-HTTP host is allowed at all. The build fails if a non-local `http://` address is configured.
- The app refuses to send anything to a non-local `http://` address even without the Android rule (`connectionSecurity` in `mobile/src/services/api.ts`).
- Requests time out (90 s for checks, 20 s for feedback). Failures show plain-language messages; server internals are never shown.
- In production, run the API behind an HTTPS proxy with `SANGYAN_ENV=production`: plain-HTTP requests are rejected, HSTS is sent and the API docs are disabled.

Changing the server address means editing `api-config.json` and running `npx expo prebuild --platform android` again.

## Server-side validation

`mobile server/security.py`:

- Images: 10 MB, 25 million pixels and at least 16×16 px; real JPEG/PNG/WebP content (the file is inspected, the name and declared type are not trusted); decompression bombs, truncated and corrupted files are rejected.
- Requests: bodies over 15 MB rejected from `Content-Length` before reading; text 1 to 20,000 characters; feedback IDs must be UUIDs; missing fields and malformed JSON return a generic 422 that names the field but does not echo the input.
- 30 POST requests per minute per IP (`SANGYAN_RATE_LIMIT`), then 429 with `Retry-After`.
- Every response has `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`.
- Unexpected errors return “Something went wrong while checking” with status 500 or 503.

## Android permissions

The app requests: `INTERNET`, `ACCESS_NETWORK_STATE`, `CAMERA` (only when the user taps “Take a photo”), `FOREGROUND_SERVICE`/`FOREGROUND_SERVICE_MEDIA_PROJECTION` (for the one-shot screen capture) and `VIBRATE`. Overlay, storage, media-library and microphone permissions are blocked in `app.json`; the photo picker needs none.

Screen capture:

- Starts only from the Quick Settings tile, after Android's own consent dialog. Declining or dismissing the dialog shows a “not captured” screen; nothing is sent.
- Takes a single frame, then stops the projection, virtual display and foreground service. A 2.5 s timeout stops it if no frame arrives, and the projection is also released if Android destroys the service early. The service is not sticky, so it never restarts by itself after the app is killed or the phone restarts.
- Every capture opens a review screen; leaving it with Back or Cancel deletes the capture.
- Deep links cannot pass file paths into the app; content must come from the tile, the share sheet or the in-app picker.

## Checking it

Start a test server in one terminal (use another port if 8000 is in use):

```powershell
cd "mobile server"
python -m uvicorn server:app --host 127.0.0.1 --port 8001 *> security-test.log
```

Then in a second terminal:

```powershell
cd "mobile server"
python security_check.py http://127.0.0.1:8001 --log security-test.log
```

`security_check.py` sends corrupted, truncated, disguised, oversized and pixel-bomb images, wrong content types, malformed JSON and hostile headers carrying a marker string, and checks that each gets the right status and a generic message, that nothing is written to `uploads/`, that the marker and tracebacks never reach the log, that an unreachable server fails cleanly and that rate limiting kicks in. Run it on a fresh server because the rate-limit check runs last.
