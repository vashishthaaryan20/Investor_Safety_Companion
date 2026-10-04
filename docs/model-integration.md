# Trained model integration

How the three trained models in `models/training-v1` are used by the backend, how their thresholds were chosen, what they score on held-out data, how failures are reported, and what was measured. Contract 1.1, `score_version` `rules-v1+models-training-v1`.

## 1. Model specification

Audited with `mobile server/validation/model_check.py` (report: `model_check.json`). Python 3.13, scikit-learn 1.9.1, torch 2.14 (CPU).

| Model | File | Format | Input preprocessing | Output |
| --- | --- | --- | --- | --- |
| Message text | `text.joblib` (2.4 MB) | scikit-learn Pipeline: word TF-IDF (1-2 grams, lowercase, 50k vocab) + LogisticRegression | Raw message text | `predict_proba` over `[legitimate, phishing]` |
| Link | `url.joblib` (2.1 MB) | Pipeline: char TF-IDF (3-5 grams, **case-sensitive**, 50k vocab) + LogisticRegression | Full `http(s)://` URL; trained on lowercase hosts | same |
| Screenshot image | `image.pth` (94 MB) | ResNet50 state_dict, fc -> 2 classes | RGB, 224x224, ImageNet mean/std | softmax over `[legitimate, phishing]` |

Outputs are uncalibrated scores, not probabilities. The image model was trained on website screenshots, not chat screenshots.

Loading (`phishing_detector/artifacts.py`): `<KIND>_MODEL_PATH`, else `SANGYAN_MODELS_DIR`, else `../models/training-v1` beside `src/`. Each model is loaded once (cached) and preloaded at server start-up (text 1.5-1.9 s, URL 0.3 s, image 0.5 s, then OCR about 3 s).

## 2. Independent model tests

Real outputs from `model_check.json` (phishing score):

| Model | Case | Score | Note |
| --- | --- | --- | --- |
| Text | Known SBI KYC phishing | 0.987 | correct |
| Text | Legitimate SIP confirmation | 0.906 | **false positive** (domain shift, see limitations) |
| Text | Empty / whitespace | 0.178 | engine skips empty text instead of scoring it |
| Text | `None`, integer | AttributeError | engine returns "No text to classify" |
| URL | `hdfc-netbanking-secure.verify-login.top/...` | 0.997 | correct |
| URL | `http://185.243.115.84/login/sbi/...` | 0.960 | correct |
| URL | `https://www.hdfcbank.com/...` | 0.752 | **false positive** -> official-domain allowlist |
| URL | Upper-case `HTTPS://WWW.PAYTM.COM.SECURE-REWARD.XYZ` | 0.0006 | case-sensitive miss -> host is lowercased before scoring |
| Image | Phishing *message* screenshot | 0.003 | image model does not transfer to chat screenshots |
| Image | Blank / tiny image | 0.571 | below the validated medium tier, so no finding |
| Image | Invalid bytes | UnidentifiedImageError | rejected earlier by upload validation (400) |

Each finding fed back into integration: empty/non-text guards, URL normalisation (`url_ml.as_url`), the official-domain allowlist (`detection.local.json`), and image findings only at a validated tier.

## 3. Thresholds (validation split, not arbitrary cut-offs)

`python -m phishing_detector.thresholds choose` picks per model, on the **validation** split only:

- **medium**: the threshold with the best F1;
- **high**: the lowest threshold with validation precision >= 0.98.

They are stored in `phishing_detector/model_thresholds.json` with the model file's SHA-256. A model whose hash does not match is reported `unavailable` rather than used with someone else's thresholds.

| Model | medium | high | Test F1 at medium | Test precision at high | Test FPR at high |
| --- | --- | --- | --- | --- | --- |
| Text (1,758 test rows) | 0.4854 | 0.5657 | 0.945 | 0.966 | 0.019 |
| URL (5,398) | 0.4434 | 0.7031 | 0.913 | 0.982 | 0.014 |
| Image (1,661) | 0.5861 | 0.9998 | 0.697 | 0.773 | 0.004 |

Full confusion matrices: `mobile server/validation/model_test_metrics.json` (`thresholds evaluate`, test split, thresholds unchanged).

## 4. Risk layer

A model finding exists only at a tier: medium -> 0.45, high -> 0.75 (the raw score is kept in `detectors[].model_score`). Fusion weights were chosen on validation data: text 0.8, URL 0.8, image 0.55. With these, **no single model can reach HIGH** (max 60, ELEVATED); HIGH needs corroboration from another model or a rule.

| Weights | HIGH precision | HIGH recall | Legitimate in-domain cases at HIGH |
| --- | --- | --- | --- |
| 0.8 (chosen) | 0.973 | 0.11 | 0/3 |
| 1.0 | 0.98 | 0.94 | 2/3 |

The URL model is skipped for official domains (SEBI, RBI, NSE, BSE, AMFI, NPCI, CDSL, NSDL, Income Tax, and the bank domains in `detection.local.json`) because it flagged 8 of 19 official Indian financial sites, four of them at HIGH.

Response mapping: HIGH_ATTENTION -> `HIGH`; ELEVATED / MODERATE -> `MEDIUM`; LOW_ATTENTION -> `LOW`; INCONCLUSIVE -> `UNKNOWN`. Findings carry the reason, the quoted phrases that pushed the text model (`text_ml.suspicious_phrases`) or the scored URL, and the recommended action.

## 5. Held-out evaluation (full engine)

`mobile server/validation/engine_eval.py --split test`: every test message through `analyze_pasted_text`, the same code path as the API. Reports: `engine_eval_val.json`, `engine_eval_test.json`.

| Run | Precision | Recall | F1 | FPR | Confusion `[[TN, FP], [FN, TP]]` |
| --- | --- | --- | --- | --- | --- |
| Test, flagged = MEDIUM or HIGH | 0.946 | 0.939 | 0.943 | 0.032 | `[[1065, 35], [40, 618]]` |
| Test, HIGH only | 1.000 | 0.102 | | 0.000 | |
| Validation, flagged | 0.969 | 0.957 | 0.963 | 0.018 | |
| Test, rules only (models missing) | 0.95 | 0.144 | | | all results PARTIAL |

95 test messages were INCONCLUSIVE (too short to judge). Mean latency about 5.5 ms per message. The policy was chosen on validation and the test split was run once afterwards.

In-domain hand-written cases (`validation/cases.json`, text mode): scams 6 HIGH, 4 MEDIUM; legitimate 2 MEDIUM, 1 LOW. Live validation run: 25/29 (`validation/last_run.json`).

## 6. Application states

| State | API | App |
| --- | --- | --- |
| All checks ran | `analysis_status: COMPLETED` | Result with classification line "... · All checks ran" |
| A trained model is missing or invalid | `PARTIAL`; LOW becomes `classification: undetermined`; explanation says the result is incomplete | "Not determined · Some checks could not run"; low results use a neutral shield instead of the green check |
| Unreadable / too short | `INCONCLUSIVE`, category `UNKNOWN` | "Unclear" screen, never "low" |
| Server error / timeout / bad reply | 4xx/5xx `{detail, error}` | Scan error screen; nothing is shown as safe |
| Server unreachable | connection fails quickly | "Can't connect" |

Verified with `validation/e2e_api.py` against a normal server (13/13) and with `--expect-partial` against a server whose model paths point to missing files (13/13: every result PARTIAL, legitimate text `undetermined`, scams still HIGH from rules).

## 7. Performance (laptop CPU, measured before optimising)

From `validation/e2e_report.json`:

| Measure | Value |
| --- | --- |
| Pasted text, server time | median 6-9 ms, round trip 11-14 ms |
| Phone screenshot 1080x2400, JPEG q80 upload | 80-85 KB (q60 73 KB, q95 117 KB, PNG 122 KB) |
| Phone screenshot, server time | median **4.2 s** (was 9.0 s) |
| Server memory peak during screenshots | **1.65 GB** (was 2.6 GB) |

The measurement showed OCR text detection running at full resolution on tall phone screenshots. `ocr.DETECT_CANVAS = 1600` caps the detector's working size (words are still read from the full image). Benchmarked on the same images:

| Detector canvas | Mean OCR time | Text similarity to ground truth (44 px / 28 px text) |
| --- | --- | --- |
| 2560 (EasyOCR default) | 8.6 s | 0.981 / 0.967 |
| **1600 (chosen)** | **4.2 s** | 0.984 / 0.970 |
| 1280 | 3.0 s | 0.980 / 0.967 |

1600 halves the time with no accuracy loss; 1280 was not chosen because real screenshots contain smaller text than the benchmark. Regression after the change: 74 unit tests, 25/29 validation with identical scores.

## 8. Security and privacy review

- `security_check.py` against a default-configured server: 29/29 (upload validation, size and pixel limits, no echo of input in errors, nothing written to disk, planted private text never in the log, no stack traces, rapid repeated requests throttled with 429 under the default 30 per minute).
- Models are loaded only from local trusted paths; joblib/pickle files must never come from users.
- `/health` reports model status and reasons, never file paths or hashes.
- Reports in the repo contain only synthetic text and no local paths or user names (`model_check.json` records file names only).
- Message text and screenshots are not stored on the server; history stays on the phone.
- No third-party service receives message text (Safe Browsing stays off unless configured).

## 9. Known limitations

- The text model rates some genuine Indian financial notices (SIP confirmations, AGM notices) as MEDIUM; these are the 4 validation failures. Fix: retrain with labelled legitimate notices.
- The image model was trained on website screenshots and rarely fires on chat screenshots; its weight is kept low (0.55).
- HIGH recall on general phishing text is low (about 0.10) by design: HIGH requires corroboration, so most single-signal scams land in MEDIUM, which still tells the user to stop and verify.
- Scores are not calibrated probabilities.
