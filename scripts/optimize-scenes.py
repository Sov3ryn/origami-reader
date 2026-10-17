"""Convert scene paintings to the WebP files the app ships.

Sources live in assets/scenes-source as PNG (kept for future edits and not
bundled). Output goes to public/. Quality 95 measured at 42 to 45 dB PSNR
against the originals, which is visually lossless behind the reading page.

Usage: python scripts/optimize-scenes.py            (all sources)
       python scripts/optimize-scenes.py autumn-day (one scene)
Requires Pillow: python -m pip install pillow
"""
from pathlib import Path
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "scenes-source"
# moonlit-lake stays at the public root; every other scene is in backgrounds/.
TARGETS = {"moonlit-lake": ROOT / "public" / "moonlit-lake.webp"}
SIZE = (1672, 941)


def main(names):
    sources = sorted(SOURCE.glob("*.png"))
    if names:
        sources = [s for s in sources if s.stem in names]
    if not sources:
        sys.exit("No matching PNG files in " + str(SOURCE))
    for source in sources:
        image = Image.open(source).convert("RGB")
        if image.size != SIZE:
            # The coded mist, cabin light and moon layers are placed for this
            # framing. A different aspect ratio would misalign them.
            ratio = image.size[0] / image.size[1]
            if abs(ratio - SIZE[0] / SIZE[1]) > 0.01:
                sys.exit(f"{source.name}: expected a {SIZE[0]}x{SIZE[1]} composition, got {image.size}")
            image = image.resize(SIZE, Image.Resampling.LANCZOS)
        target = TARGETS.get(source.stem, ROOT / "public" / "backgrounds" / (source.stem + ".webp"))
        image.save(target, "WEBP", quality=95, method=6)
        print(f"{source.name} -> {target.relative_to(ROOT)} ({target.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main(set(sys.argv[1:]))
