"""
Tests postprocess_results() / to_schema_input() using a fake object that
mimics the shape of Ultralytics' Results/Boxes API — this lets us verify
the class-mapping and normalization logic without ultralytics or a GPU
installed (not available in this offline sandbox).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from detect import CLASS_MAP_STAGE1, Detection, postprocess_results, to_schema_input


class FakeTensor(list):
    """Mimics a torch tensor well enough for float()/indexing in our code."""
    def __getitem__(self, i):
        v = list.__getitem__(self, i)
        return v


class FakeBox:
    def __init__(self, cls_id, conf, xyxy):
        self.cls = FakeTensor([cls_id])
        self.conf = FakeTensor([conf])
        self.xyxy = FakeTensor([FakeTensor(xyxy)])


class FakeResult:
    def __init__(self, boxes):
        self.boxes = boxes


passed, failed = 0, 0


def check(name, fn):
    global passed, failed
    try:
        fn()
        print(f"PASS  {name}")
        passed += 1
    except Exception as e:
        print(f"FAIL  {name}: {e}")
        failed += 1


def test_postprocess_maps_classes_correctly():
    fake_results = [
        FakeResult([
            FakeBox(0, 0.91, [10, 10, 110, 60]),   # container
            FakeBox(1, 0.77, [20, 70, 200, 90]),   # text
        ])
    ]
    dets = postprocess_results(fake_results, CLASS_MAP_STAGE1)
    assert len(dets) == 2
    assert dets[0].label == "container"
    assert dets[0].confidence == 0.91
    assert dets[0].width == 100
    assert dets[0].height == 50
    assert dets[1].label == "text"


def test_unknown_class_id_falls_back_gracefully():
    fake_results = [FakeResult([FakeBox(99, 0.5, [0, 0, 10, 10])])]
    dets = postprocess_results(fake_results, CLASS_MAP_STAGE1)
    assert dets[0].label == "unknown_99"


def test_to_schema_input_shape():
    dets = [Detection("button", 0.9, 0, 0, 50, 20)]
    schema_input = to_schema_input(dets)
    assert schema_input == [
        {"type": "button", "confidence": 0.9, "x": 0.0, "y": 0.0, "width": 50.0, "height": 20.0}
    ]


def test_empty_results_returns_empty_list():
    assert postprocess_results([], CLASS_MAP_STAGE1) == []


if __name__ == "__main__":
    check("test_postprocess_maps_classes_correctly", test_postprocess_maps_classes_correctly)
    check("test_unknown_class_id_falls_back_gracefully", test_unknown_class_id_falls_back_gracefully)
    check("test_to_schema_input_shape", test_to_schema_input_shape)
    check("test_empty_results_returns_empty_list", test_empty_results_returns_empty_list)
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)
