"""
OPTIONAL YOLOv8 sidecar — not part of the default pipeline.

backend/server.js's default path calls scripts/cli_pipeline.py directly
(which uses heuristic_detector.py, real CV, no model/service needed). This
Flask sidecar is only relevant if you've fine-tuned a YOLOv8 model on real
wireframe data and want to swap it in for higher accuracy than the
heuristic detector — see detect.py's docstring for the stage-1/stage-2
class-map notes. Nothing else in the pipeline needs to change if you do:
update scripts/cli_pipeline.py's cmd_detect() to call this over HTTP
(the same shape as the old sidecar-based server.js had, if you want it
back) instead of heuristic_detector.detect_from_path().

Run: python3 sidecar.py
(requires `pip install ultralytics flask` — not available in this sandbox)
"""

from flask import Flask, request, jsonify
from detect import Detector, to_schema_input

app = Flask(__name__)

MODEL_PATH = "models/yolov8_wireframe.pt"  # your fine-tuned weights
detector: Detector | None = None


def get_detector() -> Detector:
    global detector
    if detector is None:
        detector = Detector(MODEL_PATH)
    return detector


@app.route("/detect", methods=["POST"])
def detect():
    if "image" not in request.files:
        return jsonify({"error": "multipart field 'image' is required"}), 400

    file = request.files["image"]
    tmp_path = f"/tmp/{file.filename}"
    file.save(tmp_path)

    try:
        dets = get_detector().detect(tmp_path)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    return jsonify({"elements": to_schema_input(dets)})


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8001)
