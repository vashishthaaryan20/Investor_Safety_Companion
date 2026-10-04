import pytest
from PIL import Image

from phishing_detector.prepare_images import prepare_images


def source_images(root):
    for split in ("train", "val", "test"):
        for label in ("legitimate", "phishing"):
            directory = root / split / label
            directory.mkdir(parents=True)
            value = (
                30 * (1 + ("train", "val", "test").index(split)),
                100 if label == "phishing" else 0,
                50,
            )
            Image.new("RGB", (8, 8), value).save(directory / "valid.png")


def test_cleanup_preserves_holdout_quarantines_conflicts_and_originals(tmp_path):
    source, output = tmp_path / "raw", tmp_path / "prepared"
    source_images(source)
    duplicate = source / "train/legitimate/duplicate.png"
    duplicate.write_bytes((source / "test/legitimate/valid.png").read_bytes())
    for label in ("legitimate", "phishing"):
        Image.new("RGB", (8, 8), (250, 250, 250)).save(
            source / f"train/{label}/conflict.png"
        )
    broken = source / "val/phishing/broken.jpg"
    broken.write_bytes(b"not an image")
    before = {
        p.relative_to(source): p.read_bytes() for p in source.rglob("*") if p.is_file()
    }
    report = prepare_images(source, output)
    assert report["counts"] == {"kept": 6, "quarantined": 3, "duplicate": 1}
    assert report["audit"]["errors"] == []
    assert report["audit"]["warnings"] == []
    assert len(list((output / "quarantine").rglob("*.*"))) == 3
    assert (output / "PREPARATION_COMPLETE").exists()
    assert not (output / "PREPARATION_INCOMPLETE").exists()
    assert before == {
        p.relative_to(source): p.read_bytes() for p in source.rglob("*") if p.is_file()
    }
    with pytest.raises(FileExistsError):
        prepare_images(source, output)


def test_output_must_be_separate_and_every_class_must_survive(tmp_path):
    source = tmp_path / "raw"
    source_images(source)
    with pytest.raises(ValueError, match="non-nested"):
        prepare_images(source, source / "prepared")
    (source / "train/phishing/valid.png").write_bytes(b"broken")
    output = tmp_path / "prepared"
    with pytest.raises(ValueError, match="failed audit"):
        prepare_images(source, output)
    assert (output / "PREPARATION_INCOMPLETE").exists()
    assert not (output / "PREPARATION_COMPLETE").exists()
