"""Pure binary metrics shared by evaluation and training reports."""

LABELS = ("legitimate", "phishing")


def binary_metrics(expected, predicted):
    if len(expected) != len(predicted) or not expected:
        raise ValueError("Metrics require equally sized, nonempty labels")
    matrix = [[0, 0], [0, 0]]
    for truth, guess in zip(expected, predicted, strict=True):
        if truth not in LABELS or guess not in LABELS:
            raise ValueError("Expected legitimate/phishing labels")
        matrix[LABELS.index(truth)][LABELS.index(guess)] += 1
    tn, fp = matrix[0]
    fn, tp = matrix[1]
    precision = tp / (tp + fp) if tp + fp else 0
    recall = tp / (tp + fn) if tp + fn else 0
    return {
        "label_order": list(LABELS),
        "confusion_matrix": matrix,
        "accuracy": (tn + tp) / len(expected),
        "phishing_precision": precision,
        "phishing_recall": recall,
        "phishing_f1": 2 * precision * recall / (precision + recall)
        if precision + recall
        else 0,
        "false_positives": fp,
        "false_negatives": fn,
        "false_positive_rate": fp / (fp + tn) if fp + tn else 0,
        "false_negative_rate": fn / (fn + tp) if fn + tp else 0,
    }
