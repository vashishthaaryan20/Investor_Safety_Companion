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
| C8 | 36 MP (35 MB) image through Share | Downsampled and checked, or a clear "too large" | Phone dropped off Wi-Fi during the test; rerun pending | PENDING |
| C8b | 10 px image | Clear "too small" message | Not run yet | PENDING |
| C2 | Network turned off on the phone | Clear "can't connect" | Not run yet | PENDING |

## 9D: physical device

| ID | Case | Result |
|---|---|---|
| D-live | Live tile capture on the phone | PASS (L1-L8) |
| D-back | Back button through each screen | PENDING |
| D-size | Small and large display sizes (`wm size` / `wm density`) | PENDING |
| D-mem | Memory after repeated checks (`dumpsys meminfo`) | PENDING |
| D-temp | Capture files deleted after use | PENDING |
| D-crash | No FATAL entries in `logcat -b crash` | PENDING |

## Defects

| ID | Severity | Defect | Fix | Retest |
|---|---|---|---|---|
| D1 | Minor | Low result says "not proof it is safe" in both the advice box and the paragraph under it | Low-risk recommendation is now only the action ("Verify the sender and the offer independently..."); the caveat stays in the explanation | API verified; device pending |
| D2 | Minor | Result unclear for pasted text tells the user to try a clearer screenshot | Backend gives text-specific explanation and advice for typed input; the screen offers "Paste the full message" and text tips | API verified; device pending |
| D3 | Cosmetic | Selection Cancel button shorter than the other two | Buttons fill the bar height, so a wrapped label no longer changes their size | Device pending |
| D4 | Minor | Confirm screen says the picture shows everything on the screen even after cropping | Selection passes `area=selected`; the note reads "Only the area you selected will be sent" (shared images get their own wording) | Device pending |
| D5 | Moderate | "Several warning signs found" shown with one signal; Low with a minor signal said "No common scam signs found" | Headline and backend explanation follow the signal count | Device pending |
| D6 | Moderate | A drag starting at the screen edge triggers system Back and discards the capture | Image inset 32 dp from both edges, and the edges opt out of the Back gesture where Android allows | Device pending |
| D8 | Low | Model-unavailable reason still said it needs boto3 after boto3 was installed | Reason names only what is actually missing | API verified |
| D9 | Low | Can't-connect advice told users to make sure "the SANGYAN server is running" | User-facing tips; the server address stays under "technical details" | Device pending |
| D10 | Low | Timeout copy blamed only the user's signal although the server can be the slow part | Message mentions a slow connection or a busy service; first tip is to wait and retry | Device pending |
| D11 | Low | After the dependency update, ESLint's stricter React-hooks rules flagged `analyzing.tsx` and `screen-context.tsx` | Animated value held in state; per-capture reset done during render instead of in the effect | `tsc` and ESLint clean |

Automated checks after the fixes: `pytest` 40 passed (3 new regression tests), `tsc --noEmit` clean, ESLint clean.

## Known limitations

- OCR misreads `https://` as `https:II` in some screenshots, so a link in an image can score lower than the same link pasted as text (L3).
- The image classifier has no weights on this laptop, so screenshots are checked by OCR, the detection engine's text checks and the investor-safety rules. The result screen lists the unavailable checks.
- Live URL reputation lookups (Safe Browsing, PhishTank/OpenPhish) are not configured.
- Scores are uncalibrated (`rules-v1-uncalibrated`); the validation set was written by the team, not collected independently.
- On Android, a Back-gesture exclusion only applies to part of each screen edge, so the inset is the main protection for D6.
