"""Count the five NDVI classes emitted by NPT's existing Sentinel Hub evalscript.

These are sampled image pixels inside district boundaries, not crop hectares or
mean NDVI. Cloud/no-data pixels remain excluded. No credentials are read here.
"""
import json
import sys
from PIL import Image, ImageDraw

PALETTE = {
    (195, 175, 145, 60): (0, "ต่ำกว่า 0.10"),
    (234, 179, 8, 170): (1, "0.10 ถึงต่ำกว่า 0.25"),
    (132, 204, 22, 210): (2, "0.25 ถึงต่ำกว่า 0.45"),
    (34, 197, 94, 230): (3, "0.45 ถึงต่ำกว่า 0.65"),
    (21, 128, 61, 245): (4, "ตั้งแต่ 0.65"),
}


def summarize(image, bbox, districts):
    if image.width * image.height > 1024 * 1024:
        raise ValueError("Unexpected raster size")
    image = image.convert("RGBA")
    left, bottom, right, top = bbox
    if not (left < right and bottom < top):
        raise ValueError("Invalid raster bounds")
    rows = []
    for feature in districts["features"]:
        mask = Image.new("1", image.size)
        draw = ImageDraw.Draw(mask)
        geometry = feature["geometry"]
        polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
        for polygon in polygons:
            for index, ring in enumerate(polygon):
                points = [((x - left) / (right - left) * image.width - 0.5,
                           (top - y) / (top - bottom) * image.height - 0.5) for x, y, *_ in ring]
                draw.polygon(points, fill=1 if index == 0 else 0)
        counts = [0] * len(PALETTE)
        total = 0
        for included, pixel in zip(mask.get_flattened_data(), image.get_flattened_data()):
            if not included:
                continue
            total += 1
            if pixel[3] == 0:
                continue
            if pixel not in PALETTE:
                raise ValueError("NPT NDVI palette changed; refusing to infer NDVI values")
            counts[PALETTE[pixel][0]] += 1
        props = feature["properties"]
        for order, label in PALETTE.values():
            rows.append({"district_code": str(props["amp_code"]), "district": props["amp_th"],
                         "class_order": order, "ndvi_class": label, "pixel_count": counts[order],
                         "valid_pixels": sum(counts), "district_pixels": total})
    return rows


if __name__ == "__main__":
    if sys.argv[1:] == ["--check"]:
        district = {"features": [{"properties": {"amp_code": "7301", "amp_th": "test"},
                                  "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]}}]}
        im = Image.new("RGBA", (2, 2), (0, 0, 0, 0))
        im.putpixel((0, 0), tuple(next(iter(PALETTE))))
        rows = summarize(im, [0, 0, 1, 1], district)
        assert rows[0]["pixel_count"] == 1 and rows[0]["valid_pixels"] == 1
        assert sum(r["pixel_count"] for r in rows) == 1
        im.putpixel((1, 1), (1, 2, 3, 255))
        try:
            summarize(im, [0, 0, 1, 1], district)
            raise AssertionError("Unknown palette accepted")
        except ValueError:
            pass
        print("NDVI class, cloud exclusion and palette checks passed")
    else:
        with open(sys.argv[2], encoding="utf-8") as stream:
            config = json.load(stream)
        result = summarize(Image.open(sys.argv[1]), config["bbox"], config["districts"])
        print(json.dumps(result, ensure_ascii=True))
