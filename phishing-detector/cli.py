"""cli.py - the single command-line entry point (run from src/).

    python -m phishing-detector.cli analyze screenshot.png [x1 y1 x2 y2] [--classify full|crop|none]
    python -m phishing-detector.cli ocr     screenshot.png [x1 y1 x2 y2]
    python -m phishing-detector.cli train
    python -m phishing-detector.cli eval
"""
import argparse


def _box(vals):
    if not vals:
        return None
    if len(vals) != 4:
        raise SystemExit("A selection box needs exactly 4 numbers: x1 y1 x2 y2")
    return tuple(vals)


def main(argv=None):
    p = argparse.ArgumentParser(prog="python -m phishing-detector.cli")
    sub = p.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("analyze", help="OCR + phishing check on a screenshot")
    a.add_argument("image")
    a.add_argument("box", nargs="*", type=int, help="x1 y1 x2 y2 (optional)")
    a.add_argument("--classify", choices=["full", "crop", "none"], default="full")

    o = sub.add_parser("ocr", help="OCR only")
    o.add_argument("image")
    o.add_argument("box", nargs="*", type=int, help="x1 y1 x2 y2 (optional)")

    sub.add_parser("train", help="train the classifier")
    sub.add_parser("eval", help="evaluate the saved model")

    args = p.parse_args(argv)

    if args.cmd == "analyze":
        from .pipeline import analyze
        out = analyze(args.image, _box(args.box), None if args.classify == "none" else args.classify)
        print("\n" + "=" * 50)
        print("EXTRACTED TEXT:")
        print(out["text"] or "[no text found]")
        if out["urls"]:
            print("\nURLs found:", out["urls"])
        if out["label"]:
            print(f"\nPhishing check: {out['label'].upper()} ({out['confidence']:.1f}% confident)")
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
        train_main()
    elif args.cmd == "eval":
        from .evaluate import main as eval_main
        eval_main()


if __name__ == "__main__":
    main()
