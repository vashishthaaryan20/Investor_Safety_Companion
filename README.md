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

CSV columns: `text,label`, labels `legitimate` or `phishing`. Source files are mapped and validated as described below. Prepared train/validation/test splits are preserved; otherwise a deterministic grouped split is assigned. Training rejects label conflicts and cross-split duplicates/groups, fits TF-IDF on training data only, and writes validation/test precision/recall/F1 and confusion counts beside the artifact. The implementation follows the [scikit-learn pipeline workflow](https://scikit-learn.org/stable/getting_started.html). Load only trusted joblib artifacts. Restart after replacing a model. Supply campaign/template groups or manually reviewed temporal splits. Exact duplicate checks do not detect every near-duplicate.

## Validation and remaining work

```powershell
python -m pip install -r requirements-dev.txt -r requirements-ml.txt
python -m pytest
```

Tests cover confidence, extraction boundaries, secret negation, blocklist overrides, brand lookalikes, blank input, one-pass orchestration, API contracts, feedback persistence and model training/reload. OCR/model boundaries are mocked where appropriate; tests do not establish real-world detection accuracy.

RDAP and PhishTank/OpenPhish remain `not_implemented`. Google Safe Browsing v4 has an opt-in adapter with timeouts, bounded caching, evidence provenance and explicit failure statuses (see below). No suspect URL is visited by the current implementation. A production domain-age implementation needs public-suffix-aware registrable domains rather than a last-two-label approximation.

Next data-dependent work: evaluate representative labeled screenshots; tune false-positive/false-negative thresholds; calibrate learned fusion on separate data; assess whether a transformer improves results. Review/admin workflows and automated confirmed-report export are not yet implemented. Explanations are deterministic structured evidence; no LLM receives screenshot text. General misinformation verification requires claim extraction and corroborating sources as a separate stage.


## Local image dataset and first training run

When the outer project is named `codeblooded_sangayan`, keep Python source in `src/` and the image dataset at `data/phishing_dataset/image/`. Configuration prefers that existing local folder; otherwise it falls back to `phishing_detector/.cache/data/` and the configured S3 download. Set the `DATA_DIR` environment variable to override the location. The `url/` spreadsheets are separate data and are not consumed by the image trainer.

From the outer project folder in PowerShell:

```powershell
.\src\venv\Scripts\Activate.ps1
cd src
python -c "from phishing_detector.config import DATA_DIR, device; print('Dataset:', DATA_DIR); print('Device:', device)"
python -m phishing_detector.cli train --output ../models/image-v2.pth
```

The current configuration runs one epoch with batch size 32; change training settings only after reviewing data and evaluation results. CPU training may take a long time; this is an initial experiment. The pretrained ResNet backbone may download on first use. The default checkpoint path is `src/phishing_detector/.cache/models/model.pth`; `--output` selects a new path and `IMAGE_MODEL_PATH` selects it for inference. Existing checkpoints are protected unless `--overwrite` is supplied. The trainer also evaluates its best checkpoint on the test split and saves results. S3 uploads now require `--upload`; that option writes the configured model key, so choose a versioned key when preserving an existing artifact matters. Model-specific metrics are saved next to the checkpoint.

Restart Uvicorn after training to load the new weights. This dataset consists of website screenshot files; assess performance on held-out mobile message screenshots separately before interpreting image-model outputs for that use case. Class counts alone do not establish label quality or absence of duplicate screenshots across splits.


### OCR links

URL extraction can repair whitespace around visible URL separators and a limited set of OCR scheme mistakes such as `httpsll`. Source text and character spans remain unchanged in entities; recovered links carry `recovered_from_ocr` and confidence is capped at 0.7 so they cannot trigger a certain blocklist override. `detected_urls` contains the normalized recovered URL. Missing hostname dots are not inferred: a fragment such as `httpsll apiwhatsapp comlsend?` is exposed in `url_candidates` with an informational review signal. This does not imply the link is malicious or identify its destination. Restart the backend after changing extraction code.


## Preparing the next training round

No training runs during preparation, configuration validation or pipeline evaluation. Both trainers print numbered, flushed stage messages, and image training also prints epoch/batch progress. Set `PIPELINE_VERBOSE=1` for analysis-stage messages; these contain counts/stage names, not screenshot text.

### Source data can remain in separate files

Different sources may have different column counts and names. Keep originals under `../data/raw/`; copy `examples/text-sources.example.json` to `examples/text-sources.local.json` and edit its source paths/column mappings. Paths are relative to the mapping file. CSV, TSV and JSONL are supported; export Excel sheets to CSV first. Every source needs message text and a reviewed label. Extra columns are allowed. Explicit label mappings are supported, but a spam label is not automatically a phishing label. Numeric URL/DNS feature tables and images require separate models and cannot substitute for message text in the TF-IDF trainer.

Canonical text data uses `text,label,group,split,source`. Only `text` and `label` are required in raw canonical files; labels must be `legitimate` or `phishing`. Supply a campaign/template identifier in `group` when available. Group IDs shared across sources mean the same campaign; use a source `group_prefix` in the mapping if IDs are only unique inside a particular source. Prepared outputs use generated group identifiers that preserve the connected campaign partitions. With no supplied groups, exact normalized text is the only grouping signal and template overlap still needs manual review.

```powershell
# Run from codeblooded_sangayan/src/ in the existing virtual environment.
python -m phishing_detector.cli prepare-text examples/text-sources.local.json ../data/text_prepared_v1
python -m phishing_detector.cli check-text ../data/text_prepared_v1
python -m phishing_detector.cli check-config detection.local.json
python -m phishing_detector.cli check-images ../data/phishing_dataset/image
```

`prepare-text` reads all mapped files, deduplicates text, rejects conflicting labels, and writes `train.csv`, `val.csv`, `test.csv`, plus `dataset-report.json`. Campaign groups stay together. Unassigned data is split approximately 70/15/15 by groups with seed 42, so sample counts may differ from those percentages. Each split must contain both classes. You may supply reviewed train/val/test assignments for every row; those assignments are preserved and checked for leakage. Mixed assigned/unassigned rows are rejected. Prepared output directories must be empty/new. A raw folder is not automatically scanned by the model: map it first. The trainer accepts either one canonical CSV or a directory of canonical CSVs and reads every CSV in that directory; keep unrelated tables outside that directory.

`check-images` verifies folder/class consistency, decodes images, and rejects exact duplicate pixels across splits or labels. It reports duplicates within one class/split as warnings. `--structure-only` is a quick folder check and does not establish full training readiness. Preflight does not judge label correctness or detect all near-duplicate pages. The image trainer runs the full preflight before loading its backbone.

### Evaluate detection before choosing thresholds

Make a reviewed manifest using `examples/evaluation.example.csv`. Each row needs `label` and either `text` or `image_path`; optional columns are `id,group,split,source`. Image paths are relative to the manifest. Include real mobile-message screenshots alongside website screenshots. Use separate val/test manifests or explicit split assignments, and keep related examples together.

```powershell
python -m phishing_detector.cli eval-pipeline ../data/evaluation/manifest.csv ../data/evaluation/validation-report.json --split val
```

The report includes false-positive/false-negative IDs, unknown/abstained cases, per-source results, detector scores/statuses and settings for reproducing the verdict. Validation reports include a diagnostic threshold sweep; test reports never suggest thresholds. Sweeps do not change configuration, train or calibrate a model. Update `fusion.weights`, `fusion.suspicious_threshold` and `fusion.dangerous_threshold` in detection settings only after reviewing validation results. Verified hard overrides stay dangerous even if a detector weight is zero. Brand names/aliases map to independently verified official domains; `check-config` validates syntax, not ownership.

### Optional reputation checks

To enable Google Safe Browsing v4, set `SAFE_BROWSING_API_KEY` in the backend environment or ignored `src/.env`, and set `safe_browsing.enabled` to true in your selected detection JSON. `timeout_seconds` defaults to 2 and is limited to 0.1?10. Enabling this submits complete extracted URL strings (including paths/query values) to Google; it never visits the suspect page. The adapter follows the [official lookup API](https://developers.google.com/safe-browsing/v4/lookup-api). Provider failures are `unavailable`, missing credentials are `not_configured`, and disabled checks are `disabled`; no match is not a safety guarantee. Positive cache entries respect the returned duration up to five minutes, negative entries last 30 seconds, and the cache is capped at 1,024 entries. Recovered/low-confidence OCR matches cannot trigger a certain hard override. Provider tests use stubs; verify a real API key/response separately before relying on it.

### Train only after data review

```powershell
# Future commands: run after preparation and review, not as part of setup.
python -m phishing_detector.text_ml ../data/text_prepared_v1 ../models/text-v1.joblib
python -m phishing_detector.cli train --output ../models/image-v2.pth
```

Text training prints eight stages: read/validate, verify splits, build, fit, validation evaluation, test evaluation, save, finish. Image training prints seven stages: preflight, loaders, backbone, training, validation, test evaluation, save report. Both save model-specific metrics and protect existing artifacts. The first finite image validation score saves a checkpoint even at zero accuracy. Atomic checkpoint replacement reduces the risk of loading a partial model. Remote image-model publishing requires `--upload`.

Activate reviewed artifacts explicitly using `TEXT_MODEL_PATH` and `IMAGE_MODEL_PATH`, then restart the API. Keep your existing model until a new artifact performs acceptably on held-out data. Learned fusion calibration and a transformer remain data-dependent later work.


## Clean and prepare image screenshots

Run from `src/` in the existing virtual environment:

```powershell
python -m phishing_detector.prepare_images "../data/dataset/dataset/Phishing dataset/image" ../data/prepared/phishing_images_v1
```

The output directory must not exist. Originals remain unchanged. The script prints five progress stages, converts retained single-frame images to RGB PNG, removes exact pixel duplicates, and copies unreadable/oversized/multi-frame images and every conflicting-label duplicate into `quarantine/`. Original train/val/test assignments are preserved. When identical pixels appear in several splits with one label, only the test copy is retained if present, otherwise validation, otherwise training. It never guesses a conflicting label or moves held-out samples into training.

Read `preparation-report.json` and `manifest.jsonl` for counts and per-file decisions. `PREPARATION_COMPLETE` means decoding, classes and exact-duplicate checks passed; `PREPARATION_INCOMPLETE` means the output must not be used. Class labels, related domains/campaigns and near-duplicates still require review. Existing test data is not a fresh benchmark for a previously trained model. Quarantine is outside the ImageFolder root and never used for training. Do not re-add quarantined cases without reviewing labels and rerunning preparation from the originals.

After review, use the generated image root explicitly:

```powershell
$env:DATA_DIR = (Resolve-Path ../data/prepared/phishing_images_v1/image).Path
python -m phishing_detector.cli check-images $env:DATA_DIR
```

This does not train or activate a model. Set `DATA_DIR` in the training process environment or your ignored `.env` before a later training run. Keep the source files available; duplicate records reference their retained original in the manifest.


## Training on the RTX laptop

The portable launcher `python -m phishing_detector.train_all` runs image, URL, then message-text training, stopping on any error. All selected datasets pass preflight before any model fits. Paths in `training.json` are relative to that configuration file, not your Windows username or terminal directory. No S3 publishing or automatic model activation occurs.

Copy/transfer this layout (datasets and model files are not supplied by pulling source code):

```text
codeblooded_sangayan/
  src/
    training.json
    requirements-training.txt
    phishing_detector/
  data/prepared/
    phishing_images_v1/
      PREPARATION_COMPLETE
      preparation-report.json
      image/{train,val,test}/{legitimate,phishing}/
    phishing_urls_v1/{train,val,test}.csv
    phishing_messages_v1/{train,val,test}.csv
  models/                       # Generated by training
```

URL CSVs require `url,label`, canonical labels `legitimate`/`phishing`, and optional `split,group`. File names assign splits; a supplied split must match. Raw `URL,Label` and 0/1 data must be cleaned/mapped first. Identical hostnames cannot span splits; also group related registrable domains/campaigns yourself before splitting. The URL model is character TF-IDF plus logistic regression, distinct from message word TF-IDF. URL feature spreadsheets are not inputs.

Message CSVs require `text,label,split`; split values must match file names. Optional `group,source` are supported. Use reviewed phishing labels, not an automatic spam-to-phishing mapping. `prepare-text` already generates this schema. Both classes must exist in each split. The image completion report and marker must accompany the image folder; historical absolute paths inside its report are informational, not used by the launcher.

On the new Windows laptop, install Python 3.11 and a compatible NVIDIA driver, then open PowerShell in `codeblooded_sangayan/src`:

```powershell
py -3.11 -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
python -m pip install -r requirements-training.txt
python -c "import torch; print(torch.__version__); print('CUDA:', torch.cuda.is_available()); print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'GPU unavailable')"
```

Use the [official PyTorch Windows/Pip/CUDA selector](https://pytorch.org/get-started/locally/) if your driver requires a different CUDA build. The training-only dependency file intentionally excludes the API/OCR stack and leaves CUDA PyTorch installation separate. Do not copy the old virtual environment. CUDA must report True for the required-GPU commands below; URL and message baselines run on CPU.

```powershell
# Validate everything; no fitting.
python -m phishing_detector.train_all --check --require-cuda
# Train image -> URL -> text.
python -m phishing_detector.train_all --require-cuda
# Or run each independently (also useful to continue after a failed model).
python -m phishing_detector.train_all --models image --require-cuda
python -m phishing_detector.train_all --models url
python -m phishing_detector.train_all --models text
```

`training.json` starts image training at 10 epochs and batch size 8. Adjust these before a run; reduce batch size if GPU memory is insufficient. Existing outputs are protected: choose a new `output` directory for a rerun, or select only models whose artifacts have not been created. Failure leaves completed checkpoints in place. The image trainer may download ResNet backbone weights on first use. Image training independently repeats its dataset audit.

Artifacts are `models/training-v1/image.pth`, `url.joblib`, and `text.joblib`, each with `.metrics.json`. After a successful selected sequence, `activation.env` contains paths for `IMAGE_MODEL_PATH`, `URL_MODEL_PATH`, and/or `TEXT_MODEL_PATH`. Copy reviewed values into the API environment and restart; regenerate paths if artifacts move to another computer. The URL model contributes an OCR-confidence-weighted signal through `url_ml` (default fusion weight 0.8). Baselines and fusion remain uncalibrated until held-out evaluation. No training was performed while implementing the launcher.
