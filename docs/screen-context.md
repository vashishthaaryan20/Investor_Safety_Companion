# Screen context: checking content from other apps

SANGYAN Shield lets a user check an investment message they are looking at in another
Android app (WhatsApp, Telegram, a browser) without saving a screenshot and browsing the
gallery.

Android does not let an ordinary app look at another app's screen. Every path below is
started by the user, and screen capture always goes through Android's own consent dialog.

## Entry points

| Path | How the user starts it | Android mechanism |
| --- | --- | --- |
| Analyze screen tile | Taps "Analyze screen" in Quick Settings | `TileService` → `MediaProjection` (system consent every time) |
| Share target | Share → "Check with SANGYAN Shield" on an image or text | `ACTION_SEND` for `image/*` and `text/plain` |

Both paths end on the same React Native screen (`/screen-context`), and from there in the
existing check pipeline (`/analyzing` → `/api/v1/analyze` or `/api/v1/analyze-text` →
`/result`, saved to history).

## Flow: Analyze screen tile

1. `ScreenContextTileService.onClick` starts `ScreenCaptureActivity` and collapses the
   panel (it asks to unlock first if the phone is locked). Repeat taps within 1.5 s are ignored.
2. `ScreenCaptureActivity` is transparent and runs in its own task (`taskAffinity=""`,
   `excludeFromRecents`), so the app the user was viewing stays visible behind it. It shows
   Android's screen-capture consent (`createScreenCaptureIntent`; on Android 14+ limited
   to the full display).
3. If the user declines, the app opens with `error=denied`. Nothing is captured.
4. If the user agrees, the activity starts `ScreenCaptureService`, a foreground service of type
   `mediaProjection` with a visible notification. Android requires this while capturing. The service:
   - gets the `MediaProjection` and registers a stop callback (`error=stopped`);
   - waits 700 ms for the consent dialog to disappear;
   - mirrors the display into an `ImageReader` through a `VirtualDisplay` and takes **one** frame;
   - rejects mostly-black frames (apps marked `FLAG_SECURE`, such as banking apps) and reports
     `error=blank` after 2.5 s, or `error=timeout` if no frame arrives;
   - scales the frame to at most 2560 px, saves it as JPEG in
     `cacheDir/screen-context/<random id>.jpg`, and releases the projection, virtual display,
     reader and thread straight away.
5. The service passes the outcome back to the activity, which is still in the foreground. The
   activity opens `sangyanshield://screen-context?source=tile&kind=image&capture=<id>` and
   finishes. Opening the app from the activity avoids Android's limits on starting activities
   from the background.

## Flow: share target

`ShareReceiverActivity` (transparent, its own task) handles `ACTION_SEND`:

- **Images:** only `content://` URIs are accepted, and never from this app's own providers.
  `file://` and our own authority are rejected because they could expose private files. The
  image is decoded with downsampling and re-encoded as JPEG, which also removes EXIF data
  such as location.
- **Text:** `EXTRA_TEXT` (and the subject, if different) is capped at 8,000 characters.
- The work runs off the main thread. The app then opens with `source=share`, or with
  `error=unsupported|unreadable|empty|failed`.

## Handoff to React Native

- The deep link only ever contains a random 32-hex id, never the content or a file path.
  `services/screen-context.ts` checks the id format and reads the file from the cache folder.
- Text is loaded into memory and its file is deleted straight away.
- Images stay in the cache until the check succeeds, the user cancels, or the next capture
  replaces them. A failed check keeps the image so "Try again" works.
- Every new capture deletes older files, and captures older than 30 minutes are purged when
  the app starts. Android may also clear the cache when storage is low.

## The screen-context screen

`src/app/screen-context.tsx`:

- **Preview:** the captured screen or the shared text, with a badge showing its source
  (captured from your screen, or shared from another app).
- **Four questions** (radio group, sent to the backend as context):
  - Analyze this investment message (`investment`, the default)
  - Check whether this URL looks suspicious (`links`)
  - Explain the risk signals (`explain`)
  - What should I verify before investing? (`verify`)
- **Explicit confirmation:** nothing is uploaded until the user taps "Send for checking".
  Cancel, the close button and hardware Back delete the capture.
- **Capture again** (tile only): closes the app so the user can return to the screen and tap
  the tile again. **Choose from gallery** goes to Quick Capture.
- **Errors:** one full-screen state per failure: denied, protected screen, timeout, sharing
  stopped, unsupported, unreadable, empty, expired. Each says nothing was sent and offers a
  way forward. A protected screen suggests copy-paste or sharing as text instead.

## Backend

- `X-Analysis-Focus` header (images) or a `focus` body field (text). Unknown values fall back to
  `investment`.
- `focus.py` adds `focus_report` to the existing result: `question`, `answer`, `detected[]`
  (what was actually found), `uncertain[]` (what can't be confirmed) and `next_steps[]`.
  Link checks are rule-based: shorteners, chat-group links, raw IP addresses, cheap
  top-level domains, regulator or exchange names on unofficial domains, and non-https links.
- The Result screen shows a "You asked" card for every focus except `investment`. For
  `investment` the normal result layout already is the answer.
- The usual risk check runs for every focus, so a scam is never missed because a different
  question was picked. No buy, sell or hold advice is given for any focus.

## Privacy and logging

- Consent is asked every time. There is no continuous capture or background monitoring.
  One frame is taken per tap.
- The capture notification is shown for the brief moment the projection is active.
- Native code logs only exception class names.
- The backend logs source, focus, content type and risk level. OCR text is printed only when
  `SANGYAN_OCR_DEBUG=1` is set.
- Screenshots are never stored in history; only the analysis result and extracted text are,
  and only when history is enabled.

## Compatibility

- `minSdk` follows Expo SDK 57 (Android 7+). On Android 13+ the Home screen can show the
  system "Add tile?" prompt (`StatusBarManager.requestAddTileService` via `AddTileActivity`).
  Older versions show manual steps.
- Android 14+ requires `FOREGROUND_SERVICE_MEDIA_PROJECTION` and starting the foreground service
  only after consent, both of which are handled. Tile launches use a `PendingIntent` on 14+.
- The capture activities handle configuration changes themselves, and the activity restores
  its handoff state if Android recreates it.
- None of this works in Expo Go. It needs the installed build, because the native code is added
  at `expo prebuild` by `plugins/with-screen-context.js`.

## Files

| Area | Files |
| --- | --- |
| Native (Kotlin templates) | `mobile/plugins/screen-context/*.kt` |
| Config plugin | `mobile/plugins/with-screen-context.js` (registered in `app.json`) |
| React Native | `src/app/screen-context.tsx`, `src/services/screen-context.ts`, `src/constants/analysis-focus.ts` |
| Pipeline changes | `src/state/scan-store.tsx`, `src/app/analyzing.tsx`, `src/services/api.ts`, `src/app/result.tsx`, `src/components/sangyan/result-parts.tsx`, `src/app/(tabs)/index.tsx` |
| Backend | `anweshabackend/focus.py`, `anweshabackend/server.py`, `phishing_detector/ocr.py` (log gating) |
