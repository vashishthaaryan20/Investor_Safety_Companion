# Screenshot scam screening

The backend screens screenshots for phishing/scam indicators. It does not determine whether arbitrary claims are true or detect every form of image fraud. Scores are provisional 0?100 risk indicators, not calibrated probabilities. Low risk is not a safety guarantee; unreadable input returns `unknown`.

## Start here

Use `src/main.py` as the sole API entry point. `anweshabackend/` is an older parallel backend, retained for reference; it does not run this pipeline.

```powershell
cd src
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Set the mobile `API_BASE_URL` in `mobile/src/services/api.ts` to your laptop address. Both existing upload routes remain supported. EasyOCR downloads its models on first use. Existing ResNet weights are loaded through `config.py` / `storage.py`; unavailable weights are reported without suppressing text checks.

## Code map

| Stage | Module | Responsibility |
| --- | --- | --- |
| Transport | `main.py` | Validate uploads; run analysis outside the event loop; feedback endpoint |
| 0 | `phishing_detector/ocr.py` | Image loading, preprocessing, single OCR pass, region confidence and spans |
| 1 | `phishing_detector/entities.py` | URLs/domains, email, phone, UPI, accounts/IFSC, wallet candidates, brands, secret requests |
| 2 | `phishing_detector/detectors.py` | URL heuristics, text rules, brand/domain differences, reviewed local blocklist |
| 2 | `phishing_detector/text_ml.py` | Optional TF-IDF/logistic regression training and inference |
| 2 | `phishing_detector/model.py` | Existing ResNet50 image model |
| 3?4 | `phishing_detector/fusion.py` | Weighted detector families, hard overrides, up to three reasons and one action |
| Orchestration | `phishing_detector/service.py` | Connect stages and produce the mobile response |
| 5 | `phishing_detector/feedback.py` | SQLite report queue, initially pending review |

`pipeline.analyze`, package-level `analyze`, and `ocr.analyze_image` are compatibility entry points. Text-only experiments can use `service.analyze_text` without importing torch or EasyOCR. Confidence refers to OCR regions, not independently measured word/character confidence. Bounding boxes use the preprocessed crop coordinate system. All nonempty OCR regions are retained, including low-confidence ones.

## Configure evidence

Copy `detection.example.json` to your own configuration and set `DETECTION_CONFIG` to its path. The default lists are deliberately empty. Populate official domains from verified sources and maintain aliases separately:

```json
{
  "brands": {"example bank": ["bank.example"]},
  "blocklist": [{"type": "domain", "value": "bad.example", "source": "reviewed case 123"}],
  "shorteners": [],
  "risky_tlds": []
}
```

These are fictional examples. Domain membership requires an exact host or a dot-boundary subdomain. URL paths and query case are preserved. A blocklist match overrides other scores only with sufficient OCR confidence (at least 0.8). Brand co-occurrence is provisional evidence, not proof that a message claims to be from that brand. Unicode skeleton checks are limited heuristics, not complete Unicode confusable detection. Phone/account/wallet matches are candidates, without checksum or ownership verification.

## API and feedback

- `GET /api/v1/health`: confirms the API process is running; does not check model readiness.
- `POST /api/v1/analyze-text`: `{ "text": "<message>" }`; runs entity extraction and the existing text/risk pipeline without OCR. Accepts up to 20,000 characters.
- `POST /api/v1/analyze`: multipart `image`.
- `POST /api/v1/save-image-json`: `{ "image": "<base64 or image data URI>" }`; same analysis under `result`.
- `POST /api/v1/feedback`: `{ "analysis_id": "<UUID>", "kind": "wrong_verdict | report_scam", "note": "optional", "evidence_text": "optional" }`.

Responses retain mobile fields (`risk`, `signals`, `explanation`, `verification`) and add `analysis_id`, `tokens`, `entities`, `detectors`, and `score_version`. Detector statuses distinguish unavailable/disabled checks from completed checks. Upload limits are 10 MiB and 20 million pixels. API deployments should also cap incoming request bodies at the proxy and add authentication/rate limits before public exposure.

The mobile result screen includes feedback buttons and discloses that extracted text is submitted. Reports are stored in `phishing_detector/.cache/feedback.sqlite3` (override with `FEEDBACK_DB`). Submitted text can contain sensitive information; configure access and retention before collecting real user data. Analysis images/text are not automatically persisted. Report IDs reference client-provided analysis UUIDs and are not authenticated provenance. Review reports, correct labels, then manually promote confirmed indicators into configuration; reports never automatically poison the blocklist.

## Train the text baseline

```powershell
python -m pip install -r requirements-ml.txt
python -m phishing_detector.text_ml labeled.csv text-model.joblib
$env:TEXT_MODEL_PATH = "text-model.joblib"
```

CSV columns: `text,label`, labels `legitimate` or `phishing`. Use enough examples of each class for a stratified 25% holdout. Training removes exact duplicates, rejects conflicting labels, fits TF-IDF on training data only, and writes holdout precision/recall/F1 and confusion counts beside the artifact. The implementation follows the [scikit-learn pipeline workflow](https://scikit-learn.org/stable/getting_started.html). Load only trusted joblib artifacts. Restart after replacing a model. Template/campaign leakage still requires a grouped or temporal split in a real dataset.

## Validation and remaining work

```powershell
python -m pip install -r requirements-dev.txt -r requirements-ml.txt
python -m pytest
```

Tests cover confidence, extraction boundaries, secret negation, blocklist overrides, brand lookalikes, blank input, one-pass orchestration, API contracts, feedback persistence and model training/reload. OCR/model boundaries are mocked where appropriate; tests do not establish real-world detection accuracy.

RDAP and Safe Browsing/PhishTank/OpenPhish are explicitly `not_implemented`; no network reputation verdict is fabricated. Add provider adapters with timeouts, caching, provenance and failure statuses before enabling these checks. No suspect URL is visited by the current implementation. A production domain-age implementation needs public-suffix-aware registrable domains rather than a last-two-label approximation.

Next data-dependent work: evaluate representative labeled screenshots; tune false-positive/false-negative thresholds; calibrate learned fusion on separate data; assess whether a transformer improves results. Review/admin workflows and automated confirmed-report export are not yet implemented. Explanations are deterministic structured evidence; no LLM receives screenshot text. General misinformation verification requires claim extraction and corroborating sources as a separate stage.


## Local image dataset and first training run

When the outer project is named `codeblooded_sangayan`, keep Python source in `src/` and the image dataset at `data/phishing_dataset/image/`. Configuration prefers that existing local folder; otherwise it falls back to `phishing_detector/.cache/data/` and the configured S3 download. Set the `DATA_DIR` environment variable to override the location. The `url/` spreadsheets are separate data and are not consumed by the image trainer.

From the outer project folder in PowerShell:

```powershell
.\venv\Scripts\Activate.ps1
cd src
python -c "from phishing_detector.config import DATA_DIR, device; print('Dataset:', DATA_DIR); print('Device:', device)"
python -m phishing_detector.cli train
```

The current defaults run two epochs with batch size 32. CPU training may take a long time; this is an initial experiment. The pretrained ResNet backbone may download on first use. Best weights are saved at `src/phishing_detector/.cache/models/model.pth`. The trainer also evaluates its best checkpoint on the test split and saves results. If S3 is configured, the current trainer uploads the model and results at the end, potentially replacing the configured model key; choose a new versioned key before training when preserving an existing artifact matters.

Restart Uvicorn after training to load the new weights. This dataset consists of website screenshot files; assess performance on held-out mobile message screenshots separately before interpreting image-model outputs for that use case. Class counts alone do not establish label quality or absence of duplicate screenshots across splits.
