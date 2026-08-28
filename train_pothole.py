"""Prepare, train, evaluate, and run a one-class pothole detector."""

from __future__ import annotations

import argparse
import json
import random
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path


CLASS_NAME = "pothole"
SEED = 42
ROOT = Path(__file__).resolve().parent


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["prepare", "train", "test", "predict", "all"])
    parser.add_argument(
        "--source",
        type=Path,
        default=Path.home() / "Downloads" / "potholes file" / "archive",
    )
    parser.add_argument("--output", type=Path, default=Path("pothole_dataset"))
    parser.add_argument("--model", type=Path, default=Path("runs/pothole/weights/best.pt"))
    parser.add_argument("--image", type=Path)
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--device", default="auto", help="Ultralytics device, such as auto, mps, cpu, or 0.")
    parser.add_argument("--conf", type=float, default=0.35)
    parser.add_argument(
        "--meters-per-pixel",
        type=float,
        help="Optional calibrated scale for physical size estimates.",
    )
    return parser.parse_args()


def read_boxes(xml_path: Path) -> tuple[int, int, list[tuple[int, int, int, int]]]:
    root = ET.parse(xml_path).getroot()
    width = int(root.findtext("size/width", "0"))
    height = int(root.findtext("size/height", "0"))
    boxes = []
    for obj in root.findall("object"):
        if obj.findtext("name", "").strip().lower() != CLASS_NAME:
            continue
        box = obj.find("bndbox")
        if box is None:
            continue
        xmin = int(float(box.findtext("xmin", "0")))
        ymin = int(float(box.findtext("ymin", "0")))
        xmax = int(float(box.findtext("xmax", "0")))
        ymax = int(float(box.findtext("ymax", "0")))
        if 0 <= xmin < xmax <= width and 0 <= ymin < ymax <= height:
            boxes.append((xmin, ymin, xmax, ymax))
    return width, height, boxes


def prepare_dataset(source: Path, output: Path) -> Path:
    images_dir = source / "images"
    annotations_dir = source / "annotations"
    images = sorted(images_dir.glob("*.png"))
    pairs = [(image, annotations_dir / f"{image.stem}.xml") for image in images]
    pairs = [(image, xml) for image, xml in pairs if xml.exists()]
    if not pairs:
        raise FileNotFoundError(f"No PNG/XML pairs found under {source}")

    random.Random(SEED).shuffle(pairs)
    train_end = int(len(pairs) * 0.70)
    val_end = train_end + int(len(pairs) * 0.20)
    splits = {"train": pairs[:train_end], "val": pairs[train_end:val_end], "test": pairs[val_end:]}

    if output.exists():
        shutil.rmtree(output)
    for split, split_pairs in splits.items():
        image_output = output / split / "images"
        label_output = output / split / "labels"
        image_output.mkdir(parents=True)
        label_output.mkdir(parents=True)
        for image, xml in split_pairs:
            width, height, boxes = read_boxes(xml)
            shutil.copy2(image, image_output / image.name)
            labels = []
            for xmin, ymin, xmax, ymax in boxes:
                x_center = ((xmin + xmax) / 2) / width
                y_center = ((ymin + ymax) / 2) / height
                box_width = (xmax - xmin) / width
                box_height = (ymax - ymin) / height
                labels.append(f"0 {x_center:.6f} {y_center:.6f} {box_width:.6f} {box_height:.6f}")
            label_text = "\n".join(labels)
            if label_text:
                label_text += "\n"
            (label_output / f"{image.stem}.txt").write_text(label_text, encoding="ascii")

    data_yaml = output / "data.yaml"
    data_yaml.write_text(
        f"path: {output.resolve().as_posix()}\n"
        "train: train/images\n"
        "val: val/images\n"
        "test: test/images\n"
        "names:\n"
        "  0: pothole\n",
        encoding="ascii",
    )
    print(f"Prepared {len(pairs)} pairs: train={len(splits['train'])}, val={len(splits['val'])}, test={len(splits['test'])}")
    print(f"YOLO dataset: {data_yaml}")
    return data_yaml


def train(data_yaml: Path, epochs: int, imgsz: int, device: str) -> Path:
    import torch
    from ultralytics import YOLO

    if device == "auto":
        device = "mps" if torch.backends.mps.is_available() else "cpu"

    model = YOLO("yolo11n.pt")
    result = model.train(
        data=str(data_yaml),
        epochs=epochs,
        imgsz=imgsz,
        device=device,
        seed=SEED,
        project=str(ROOT / "runs"),
        name="pothole",
        exist_ok=True,
        workers=0,
        amp=False,
        deterministic=False,
    )
    best = Path(result.save_dir) / "weights" / "best.pt"
    print(f"Best model: {best}")
    return best


def test(model_path: Path, data_yaml: Path, imgsz: int) -> None:
    from ultralytics import YOLO

    test_images = data_yaml.parent / "test" / "images"
    if not test_images.exists() or not any(test_images.iterdir()):
        raise FileNotFoundError(
            f"No test images found under {test_images}. "
            "Prepare an independent test split before running test."
        )

    model = YOLO(str(model_path))
    metrics = model.val(data=str(data_yaml), split="test", imgsz=imgsz)
    print(f"Test mAP50: {metrics.box.map50:.4f}")
    print(f"Test mAP50-95: {metrics.box.map:.4f}")


def predict(model_path: Path, image: Path, conf: float, meters_per_pixel: float | None) -> None:
    from ultralytics import YOLO

    model = YOLO(str(model_path))
    result = model.predict(source=str(image), conf=conf, save=True, project="runs", name="predictions", exist_ok=True)[0]
    detections = []
    for box in result.boxes:
        x1, y1, x2, y2 = [round(float(value), 2) for value in box.xyxy[0].tolist()]
        pixel_width = round(x2 - x1, 2)
        pixel_height = round(y2 - y1, 2)
        detection = {
            "class": CLASS_NAME,
            "confidence": round(float(box.conf[0]), 4),
            "box_pixels": {"xmin": x1, "ymin": y1, "xmax": x2, "ymax": y2},
            "width_pixels": pixel_width,
            "height_pixels": pixel_height,
            "area_pixels": round(pixel_width * pixel_height, 2),
            "physical_size": None,
            "depth": None,
        }
        if meters_per_pixel is not None:
            detection["physical_size"] = {
                "width_m": round(pixel_width * meters_per_pixel, 4),
                "height_m": round(pixel_height * meters_per_pixel, 4),
                "area_m2": round(pixel_width * pixel_height * meters_per_pixel**2, 4),
            }
        detections.append(detection)
    output = Path("runs/predictions") / f"{image.stem}.json"
    output.write_text(json.dumps({"image": str(image), "detections": detections}, indent=2), encoding="ascii")
    print(f"Marked image: runs/predictions/{image.name}")
    print(f"Measurements: {output}")
    print("Depth: unavailable from a normal RGB image; use depth-camera data or calibrated monocular depth.")


def main() -> None:
    args = parse_args()
    data_yaml = args.output / "data.yaml"
    if args.command in {"prepare", "all"}:
        data_yaml = prepare_dataset(args.source, args.output)
    if args.command in {"train", "all"}:
        if not data_yaml.exists():
            data_yaml = prepare_dataset(args.source, args.output)
        args.model = train(data_yaml, args.epochs, args.imgsz, args.device)
    if args.command == "test":
        test(args.model, data_yaml, args.imgsz)
    if args.command == "predict":
        if args.image is None:
            raise SystemExit("--image is required for predict")
        predict(args.model, args.image, args.conf, args.meters_per_pixel)


if __name__ == "__main__":
    main()