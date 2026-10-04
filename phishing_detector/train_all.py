"""Portable sequential training launcher; no fitting in --check mode."""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

from .datasets import audit_images, load_text_data
from .progress import stage
from .url_ml import load_url_data

SRC_DIR = Path(__file__).resolve().parent.parent


def preflight(config, models):
    config = Path(config).resolve()
    settings = json.loads(config.read_text(encoding="utf-8"))
    output = (config.parent / settings["output"]).resolve()
    jobs = []
    # Check every required path before the expensive image audit.
    for name in models:
        data = (config.parent / settings[name]["data"]).resolve()
        if not data.is_dir():
            raise ValueError(f"Missing prepared {name} dataset: {data}")
        if name in {"url", "text"}:
            for split in ("train", "val", "test"):
                if not (data / f"{split}.csv").is_file():
                    raise ValueError(f"Missing {name} split: {data / (split + '.csv')}")
    for name in models:
        options = settings[name]
        data = (config.parent / options["data"]).resolve()
        artifact = output / ("image.pth" if name == "image" else f"{name}.joblib")
        if artifact.exists() or Path(str(artifact) + ".metrics.json").exists():
            raise FileExistsError(
                f"Existing artifact/report: {artifact}; choose another output in training.json"
            )
        stage("train-all", 1, 3, f"Preflight {name}: {data}")
        if name == "image":
            if (
                not (data.parent / "PREPARATION_COMPLETE").is_file()
                or (data.parent / "PREPARATION_INCOMPLETE").exists()
            ):
                raise ValueError("Image preparation must complete before training")
            if any(
                type(options.get(key)) is not int or options[key] < 1
                for key in ("epochs", "batch_size")
            ):
                raise ValueError(
                    "Image epochs and batch_size must be positive integers"
                )
            report = audit_images(data)
            if report["errors"]:
                raise ValueError(
                    "Image preflight failed: " + "; ".join(report["errors"][:5])
                )
        elif name == "url":
            load_url_data(data)
        else:
            for split in ("train", "val", "test"):
                if not (data / f"{split}.csv").is_file():
                    raise ValueError(f"Missing text split: {data / (split + '.csv')}")
            load_text_data(data)
            # Require explicit assignments matching the files, rather than silently splitting.
            from .datasets import read_source

            for split in ("train", "val", "test"):
                rows = read_source(data / f"{split}.csv")
                if any(row["split"] != split for row in rows):
                    raise ValueError(
                        "Text CSVs require split column matching train/val/test filenames"
                    )
        jobs.append(
            {"name": name, "data": data, "artifact": artifact, "options": options}
        )
    return output, jobs


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=SRC_DIR / "training.json")
    parser.add_argument(
        "--models",
        nargs="+",
        choices=["image", "url", "text"],
        default=["image", "url", "text"],
    )
    parser.add_argument(
        "--check", action="store_true", help="Validate all inputs without fitting"
    )
    parser.add_argument(
        "--require-cuda",
        action="store_true",
        help="Fail before fitting if image training cannot use CUDA",
    )
    args = parser.parse_args(argv)
    if len(set(args.models)) != len(args.models):
        parser.error("Select each model at most once")
    output, jobs = preflight(args.config, args.models)
    if "image" in args.models:
        import torch
        import torchvision  # noqa: F401

        print(
            f"[train-all] PyTorch {torch.__version__}; CUDA available: {torch.cuda.is_available()}",
            flush=True,
        )
        if args.require_cuda and not torch.cuda.is_available():
            raise RuntimeError(
                "CUDA unavailable: install a CUDA PyTorch build and verify NVIDIA driver"
            )
        if torch.cuda.is_available():
            print(f"[train-all] GPU: {torch.cuda.get_device_name(0)}", flush=True)
    import sklearn  # noqa: F401

    if args.check:
        print(
            "[train-all] All selected datasets passed preflight; no training started",
            flush=True,
        )
        return
    output.mkdir(parents=True, exist_ok=True)
    for index, job in enumerate(jobs, 1):
        name = job["name"]
        stage("train-all", 2, 3, f"Start model {index}/{len(jobs)}: {name}")
        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"
        if name == "image":
            env.update(
                DATA_DIR=str(job["data"]),
                TRAIN_EPOCHS=str(job["options"]["epochs"]),
                TRAIN_BATCH_SIZE=str(job["options"]["batch_size"]),
            )
            command = [
                sys.executable,
                "-m",
                "phishing_detector.cli",
                "train",
                "--output",
                str(job["artifact"]),
            ]
        else:
            command = [
                sys.executable,
                "-c",
                "import sys; from phishing_detector."
                + ("url_ml" if name == "url" else "text_ml")
                + " import train; train(sys.argv[1], sys.argv[2])",
                str(job["data"]),
                str(job["artifact"]),
            ]
        subprocess.run(command, cwd=SRC_DIR, env=env, check=True)
    activation = "\n".join(
        f"{ {'image': 'IMAGE_MODEL_PATH', 'url': 'URL_MODEL_PATH', 'text': 'TEXT_MODEL_PATH'}[job['name']] }={job['artifact'].as_posix()}"
        for job in jobs
    )
    (output / "activation.env").write_text(activation + "\n", encoding="utf-8")
    stage(
        "train-all",
        3,
        3,
        f"Finished. Models and metrics: {output}; activation.env is not automatically applied",
    )


if __name__ == "__main__":
    main()
