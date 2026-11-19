#!/usr/bin/env python3
"""Generate all native Electron app icons from the original user-supplied SVG."""
from io import BytesIO
from pathlib import Path

import cairosvg
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "build" / "zt-multiapp-desktop.svg"
BUILD = ROOT / "build"
RUNTIME = ROOT / "src" / "assets"

def generate():
    BUILD.mkdir(parents=True, exist_ok=True)
    RUNTIME.mkdir(parents=True, exist_ok=True)
    png = cairosvg.svg2png(url=str(SOURCE), output_width=1024, output_height=1024)
    icon = Image.open(BytesIO(png)).convert("RGBA")
    if icon.size != (1024, 1024):
        raise ValueError("Icon must render at 1024x1024")
    icon.save(BUILD / "icon.png", format="PNG", optimize=True)
    icon.save(RUNTIME / "icon.png", format="PNG", optimize=True)
    icon.save(BUILD / "icon.ico", format="ICO", sizes=[
        (16, 16), (24, 24), (32, 32), (48, 48),
        (64, 64), (128, 128), (256, 256)
    ])
    icon.save(BUILD / "icon.icns", format="ICNS")
    print("Generated Windows ICO, macOS ICNS, Linux PNG and runtime PNG")

if __name__ == "__main__":
    generate()
