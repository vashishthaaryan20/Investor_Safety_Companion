"""Optional TF-IDF/logistic baseline. Load only trusted local model artifacts."""

import logging
from functools import lru_cache

from .detectors import Detection, Finding


@lru_cache(maxsize=2)
def load_model(path):
    import joblib

    return joblib.load(path)


def detect(text, path=None):
    if not path:
        return Detection("text_ml", "not_configured")
    try:
        model = load_model(path)
        index = list(model.classes_).index("phishing")
        score = float(model.predict_proba([text])[0][index])
        return Detection(
            "text_ml",
            findings=[
                Finding(
                    "text_ml",
                    score,
                    "Text classifier signal",
                    "The trained text model found language associated with phishing.",
                    "TF-IDF + logistic regression",
                )
            ],
        )
    except Exception:
        logging.getLogger(__name__).exception("Optional text classifier unavailable")
        return Detection(
            "text_ml", "unavailable", detail="Model could not be loaded or evaluated"
        )


def train(csv_path, output):
    import csv
    import json
    from pathlib import Path

    import joblib
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import classification_report, confusion_matrix
    from sklearn.model_selection import train_test_split
    from sklearn.pipeline import make_pipeline

    with open(csv_path, encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream))
    labels = {}
    for row in rows:
        text, label = row["text"].strip(), row["label"]
        if not text or label not in {"legitimate", "phishing"}:
            raise ValueError("Expected nonempty text and legitimate/phishing labels")
        if text in labels and labels[text] != label:
            raise ValueError("Conflicting labels for duplicate text")
        labels[text] = label
    x_train, x_test, y_train, y_test = train_test_split(
        list(labels),
        list(labels.values()),
        test_size=0.25,
        random_state=42,
        stratify=list(labels.values()),
    )
    model = make_pipeline(
        TfidfVectorizer(ngram_range=(1, 2), max_features=50000),
        LogisticRegression(max_iter=1000, class_weight="balanced", random_state=42),
    )
    model.fit(x_train, y_train)
    predictions = model.predict(x_test)
    report = {
        "classification": classification_report(
            y_test, predictions, output_dict=True, zero_division=0
        ),
        "confusion_matrix": confusion_matrix(
            y_test, predictions, labels=["legitimate", "phishing"]
        ).tolist(),
        "label_order": ["legitimate", "phishing"],
        "train_count": len(x_train),
        "test_count": len(x_test),
    }
    joblib.dump(model, output)
    Path(str(output) + ".metrics.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8"
    )
    return report


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_path")
    parser.add_argument("output")
    args = parser.parse_args()
    print(train(args.csv_path, args.output))
