"""Small, flushed stage messages; never print screenshot text or credentials."""

import os


def stage(scope, number, total, message):
    print(f"[{scope} {number}/{total}] {message}", flush=True)


def pipeline_stage(number, message):
    if os.getenv("PIPELINE_VERBOSE", "0") == "1":
        stage("pipeline", number, 5, message)
