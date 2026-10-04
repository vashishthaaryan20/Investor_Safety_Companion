# Milestone 9: end-to-end test log

Process for every case: test, record the result, log a defect if it fails, fix, retest.

## Setup

| Item | Value |
|---|---|
| Phone | Moto G86 Power 5G, Android 16 (SDK 36), 1220x2712, gesture navigation |
| App | Release APK (`com.ashhhh69.mobile`) built from this branch, API set to `http://127.0.0.1:8001` |
| Link | adb over Wi-Fi; `adb reverse tcp:8001 tcp:8001` so the phone reaches the laptop |
| Backend | The real API and engine, started with `python validation/fault_server.py --port 8001` |
| Faults | `python validation/fault_server.py --set ocr\|engine\|invalid\|timeout\|model\|none` switches one simulated failure without a restart |
| Test images | Rendered PNGs in `/sdcard/Pictures/SangyanTest/`, opened in Google Photos and captured with the "Analyze screen" tile |

Removing the adb reverse simulates "backend unreachable". The fault server is test-only and is never used for real users.

## 9A / 9B: full workflow and functional cases

| ID | Case | Expected | Actual | Result |
|---|---|---|---|---|
| F1 | Paste a normal SIP reminder | Low risk, no signals, "not proof it is safe" | Low 0/100, About card names engine `rules-v1-uncalibrated` and the unavailable checks | PASS (D1) |
| F2 | Paste "guaranteed monthly returns" | At least Risky with the guaranteed-returns signal | Risky 40, 1 signal | PASS (D5) |
| F3 | Paste a lookalike bank URL | Link signal, score above Low | 54, lookalike-link signal with the URL as evidence | PASS |
| F4 | Paste a mixed insider-tip/withdrawal-fee scam | High risk, several signals | High 100 | PASS |
| F5 | Paste "ok thanks!" | Result unclear, never shown as safe | "Result unclear", "This is not a safe result" | PASS (D2) |
| L1 | Tile capture of a guaranteed-returns image, select the message | Consent, selection, confirm, result, history entry | Risky 40, reading confidence 82%, saved to history; server log has metadata only | PASS (D3, D4) |
| L2 | Tile capture of a legitimate SIP image | Low risk | Low 0 | PASS |
| L3 | Tile capture of a lookalike-URL image | Link signal | 20; OCR read `https:II`, see limitations | PASS (limited) |
| L4 | Tile capture, whole screen, mixed scam | High risk | High 100, 6 signals | PASS |
| L5 | Tile capture of an OTP request | Sensitive-data signal | 60 | PASS |
| L6-L8 | Blank, blurred and noise images | Result unclear, not Low | All INCONCLUSIVE | PASS |
| S1 | Score matches signals | Level follows the score bands; every level above Low lists a signal | Consistent in every run; headline wording did not match a single signal | PASS (D5) |
| H1 | History after force-stop | Entries still listed | 22 entries kept | PASS |
| H2 | Open a result saved before contract 1.0 | Opens on its old 10-point scale | Opens, 10/10 scale | PASS |
| H4 | Delete one history entry | Confirm dialog, entry removed | 22 to 21 | PASS |

"Clear all" was not run to keep the tester's own history.

## 9C: failure and recovery

| ID | Case | Expected | Actual | Result |
|---|---|---|---|---|
| C1 | Backend unreachable (reverse removed) | Clear "can't connect", nothing claimed about the content | "Can't connect right now... Your content was not checked"; Try again succeeded after restoring the link | PASS (D9) |
| C3 | Capture permission denied (Cancel at the consent dialog) | Nothing captured or sent | "Screen check cancelled – nothing was captured or sent" | PASS |
| C4 | Cancel at the selection screen | Capture deleted, back to the previous app | Returned to the launcher, no leftover activities | PASS |
| C5 | OCR raises | Safe error, no fake result | "Something went wrong on our side"; details show only the error type | PASS |
| C6 | Engine raises | Same | Same safe error screen | PASS |
| C6b | Engine returns malformed output | Rejected, error screen | Error screen; server log lists field names only | PASS |
| C6c | Image model required but missing | Error, not a silent downgrade | Error screen | PASS |
| C7 | Engine hangs past the timeout | "Taking too long" | "This is taking too long" | PASS |
| C9 | Retry after a failure | The same image is resent and checked | Risky 40 for the original image | PASS |
| C10 | Share an image the app may not read | Graceful failure | `SecurityException` from the shell test harness handled: "capture failed", nothing sent | PASS |
| C8 | 36 MP (35 MB) image through Share | Downsampled and checked, or a clear "too large" | Checked; cold OCR on the noise image took 23 s, inside the 75 s production limit | PASS |
| C8b | 10 px image | Clear "too small" message | First run showed a generic "image problem"; after the fix: "This image is too small to read" with tips | PASS (D12) |
| C2 | Network lost on the phone | Clear failure, no result claimed | Airplane mode drops the adb link, so the app's network was blocked with `cmd connectivity set-package-networking-enabled false`. Packets are dropped silently; after 84 s the app was still showing "Taking longer than usual" with "Cancel check" and had claimed no result. The switch to the timeout screen at the 90 s request limit was not observed (testing stopped). After the network was restored, the check returned its normal result. A refused connection (C1) fails at once | PASS (limited) |
| R1 | Release APK against the LAN backend (`http://10.202.254.3:8000`) | Same results as the test build | Scam text High 100, legitimate SIP Low 0 | PASS |
| R2 | Regression on the build with the merged engine | Same ratings as before the merge | Tile capture of the guaranteed-returns image Risky 40 (same as L1); pasted scam High 100; legitimate SIP Low; blank/blurred/noise stay INCONCLUSIVE | PASS |

## 9D: physical device

| ID | Case | Result |
|---|---|---|
| D-live | Live tile capture on the phone | PASS (L1-L8) |
| D-back | Back button through each screen | PASS: every screen goes back to the expected place; Back on the confirm screen goes Home; on the selection screen Back needs a second press within 2.5 s (D6) |
| D-size | Small and large display sizes (`wm size` / `wm density`) | PASS: 720x1280 at 320 dpi and 1600x2560 at 320 dpi, both with the phone's 1.3 font scale; Home and result wrap and scroll with nothing clipped |
| D-mem | Memory after repeated checks (`dumpsys meminfo`) | PASS: native heap levels off around 118 MB over repeated checks. Screens opened by deep links stay stacked until Home (low severity) |
| D-temp | Capture files deleted after use | PASS: `cache/screen-context` and `cache/ImagePicker` are empty after both send and discard (checked with `run-as` on a debuggable test build) |
| D-crash | No FATAL entries in `logcat -b crash` | PASS: none from SANGYAN. The only entry is the Motorola launcher crashing when `wm size reset` ran |

## Defects

| ID | Severity | Defect | Fix | Retest |
|---|---|---|---|---|
| D1 | Minor | Low result says "not proof it is safe" in both the advice box and the paragraph under it | Low-risk recommendation is now only the action ("Verify the sender and the offer independently..."); the caveat stays in the explanation | API verified; device pending |
| D2 | Minor | Result unclear for pasted text tells the user to try a clearer screenshot | Backend gives text-specific explanation and advice for typed input; the screen offers "Paste the full message" and text tips | API verified; device pending |
| D3 | Cosmetic | Selection Cancel button shorter than the other two | Buttons fill the bar height, so a wrapped label no longer changes their size | Device pending |
| D4 | Minor | Confirm screen says the picture shows everything on the screen even after cropping | Selection passes `area=selected`; the note reads "Only the area you selected will be sent" (shared images get their own wording) | Device pending |
| D5 | Moderate | "Several warning signs found" shown with one signal; Low with a minor signal said "No common scam signs found" | Headline and backend explanation follow the signal count | Device pending |
| D6 | Moderate | A drag starting at the screen edge triggers system Back and discards the capture | Image inset 32 dp from both edges, the edges opt out of the Back gesture where Android allows, and Back now needs a second press within 2.5 s ("Press Back again to discard this capture") | Device verified: an edge drag keeps the capture and shows the toast; two quick Backs discard it and delete the file |
| D8 | Low | Model-unavailable reason still said it needs boto3 after boto3 was installed | Reason names only what is actually missing | API verified |
| D9 | Low | Can't-connect advice told users to make sure "the SANGYAN server is running" | User-facing tips; the server address stays under "technical details" | Device pending |
| D10 | Low | Timeout copy blamed only the user's signal although the server can be the slow part | Message mentions a slow connection or a busy service; first tip is to wait and retry | Device pending |
| D11 | Low | After the dependency update, ESLint's stricter React-hooks rules flagged `analyzing.tsx` and `screen-context.tsx` | Animated value held in state; per-capture reset done during render instead of in the effect | `tsc` and ESLint clean |
| D12 | Minor | A 10 px image showed a generic image error | The API returns an error code with every image rejection (`image_too_small`, `image_empty`, ...) and the app shows matching copy | Device verified |
| D13 | Moderate | After merging the `codeblooded_sangayan` engine, blurred and noise images were rated MODERATE from a weak visual match alone | A weak visual match no longer makes an unreadable image conclusive; it stays INCONCLUSIVE | Laptop and device verified |

D1-D5, D9 and D10 were also verified on the phone.

Automated checks after the fixes and the merge: `pytest` 58 passed, `tsc --noEmit` clean, ESLint clean, validation set 29/29 (median 2.6 s), security checks 29/29 (rate limit returns 429 at request 31).

## Known limitations

- OCR misreads `https://` as `https:II` in some screenshots, so a link in an image can score lower than the same link pasted as text (L3).
- The image classifier (`.cache/models/model.pth`, not in git) now loads, but it was trained on website screenshots and labels message screenshots "legitimate". It cannot lower a score, so ratings come from OCR, the engine's text checks and the investor-safety rules. The text classifier, URL model and reputation lists are not trained or configured here; the result screen lists them as unavailable.
- `training.json` points at `code/data`; in this repo layout the prepared data is elsewhere, so `train_all --check` needs a config with the correct path.
- If the network silently drops packets, a check keeps waiting (the app's request limit is 90 s); "Cancel check" is available throughout.
- The bottom tab bar writes its three icons as small PNGs (about 4 KB per launch) to the app cache. They hold no user content; Android clears the cache when space runs low.
- Release builds read the API address at `expo prebuild` time; `EXPO_PUBLIC_API_BASE_URL` overrides `api-config.json`, so it must not be left set from a test build.
- Live URL reputation lookups (Safe Browsing, PhishTank/OpenPhish) are not configured.
- Scores are uncalibrated (`rules-v1-uncalibrated`); the validation set was written by the team, not collected independently.
- On Android, a Back-gesture exclusion only applies to part of each screen edge, so the inset is the main protection for D6.
