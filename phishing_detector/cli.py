"""cli.py - the single command-line entry point (run from src/).

python -m phishing_detector.cli analyze screenshot.png [x1 y1 x2 y2] [--classify full|crop|none]
python -m phishing_detector.cli ocr     screenshot.png [x1 y1 x2 y2]
python -m phishing_detector.cli train
python -m phishing_detector.cli eval
"""

import argparse


def _box(vals):
    if not vals:
        return None
    if len(vals) != 4:
        raise SystemExit("A selection box needs exactly 4 numbers: x1 y1 x2 y2")
    return tuple(vals)


def main(argv=None):
    p = argparse.ArgumentParser(prog="python -m phishing_detector.cli")
    sub = p.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("analyze", help="OCR + phishing check on a screenshot")
    a.add_argument("image")
    a.add_argument("box", nargs="*", type=int, help="x1 y1 x2 y2 (optional)")
    a.add_argument("--classify", choices=["full", "crop", "none"], default="full")

    o = sub.add_parser("ocr", help="OCR only")
    o.add_argument("image")
    o.add_argument("box", nargs="*", type=int, help="x1 y1 x2 y2 (optional)")

    training = sub.add_parser("train", help="preflight and train the image classifier")
    training.add_argument("--output", help="new model checkpoint path")
    training.add_argument(
        "--overwrite",
        action="store_true",
        help="explicitly replace an existing checkpoint",
    )
    training.add_argument(
        "--upload",
        action="store_true",
        help="upload model/report to configured S3 keys",
    )
    prepare = sub.add_parser(
        "prepare-text", help="map source files and prepare leakage-checked text splits"
    )
    prepare.add_argument("manifest")
    prepare.add_argument("output_dir")
    prepare.add_argument("--seed", type=int, default=42)
    check_text = sub.add_parser(
        "check-text", help="validate prepared text data without fitting a model"
    )
    check_text.add_argument("path")
    check_images = sub.add_parser(
        "check-images", help="audit image folders/decoding/exact duplicate leakage"
    )
    check_images.add_argument("path")
    check_images.add_argument("--structure-only", action="store_true")
    check_config = sub.add_parser(
        "check-config", help="validate detector settings without OCR or training"
    )
    check_config.add_argument("path", nargs="?")
    evaluate = sub.add_parser(
        "eval-pipeline",
        help="evaluate labeled text/screenshots without fitting a model",
    )
    evaluate.add_argument("manifest")
    evaluate.add_argument("output")
    evaluate.add_argument("--split", choices=["val", "test"], required=True)
    evaluate.add_argument(
        "--classify", choices=["full", "crop", "none"], default="full"
    )
    sub.add_parser("eval", help="evaluate the saved model")

    args = p.parse_args(argv)

    if args.cmd == "analyze":
        from .pipeline import analyze

        out = analyze(
            args.image,
            _box(args.box),
            None if args.classify == "none" else args.classify,
        )
        print("\n" + "=" * 50)
        print("EXTRACTED TEXT:")
        print(out["text"] or "[no text found]")
        if out["urls"]:
            print("\nURLs found:", out["urls"])
        if out["label"]:
            print(
                f"\nPhishing check: {out['label'].upper()} ({out['confidence']:.1f}% confident)"
            )
            print("  ", {k: f"{v:.1f}%" for k, v in out["probs"].items()})
        if out["warning"]:
            print("\nWARNING:", out["warning"])
        print("=" * 50)
    elif args.cmd == "ocr":
        from .ocr import extract_text, find_urls

        text = extract_text(args.image, _box(args.box))
        print("\n----- EXTRACTED TEXT -----")
        print(text or "[no text found]")
        urls = find_urls(text)
        if urls:
            print("\nURLs detected:", urls)
    elif args.cmd == "train":
        from .train import main as train_main

        train_main(args.output, args.overwrite, args.upload)
    elif args.cmd == "prepare-text":
        from .datasets import prepare_text

        print(prepare_text(args.manifest, args.output_dir, args.seed))
    elif args.cmd == "check-text":
        from .datasets import load_text_data

        _, report = load_text_data(args.path)
        print(report)
    elif args.cmd == "check-images":
        from .datasets import audit_images

        report = audit_images(args.path, decode=not args.structure_only)
        import json

        print(json.dumps(report, indent=2))
        if report["errors"]:
            raise SystemExit(1)
    elif args.cmd == "check-config":
        import json
        from pathlib import Path

        from .settings import load_settings, validate_settings

        settings = (
            validate_settings(json.loads(Path(args.path).read_text(encoding="utf-8")))
            if args.path
            else load_settings()
        )
        print(
            f"Configuration valid: {len(settings['brands'])} brand aliases; {len(settings['blocklist'])} blocklist entries; Safe Browsing enabled: {settings['safe_browsing']['enabled']}"
        )
    elif args.cmd == "eval-pipeline":
        from .screening_eval import evaluate_pipeline

        print(
            evaluate_pipeline(
                args.manifest,
                args.output,
                args.split,
                None if args.classify == "none" else args.classify,
            )
        )
    elif args.cmd == "eval":
        from .evaluate import main as eval_main

        eval_main()


if __name__ == "__main__":
    main()
