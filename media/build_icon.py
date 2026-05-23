"""Render media/icon.png for the PR Review extension.

Design: rounded tile, a code-diff window in the center (green +, neutral,
red −), with a small green check-dot badge in the bottom-right
communicating "review approved".

Drawn directly with Pillow because cairosvg's native cairo dependency
isn't available on this Windows machine. Keep this in sync with
media/icon.svg.

CLI:
    py build_icon.py                     # writes media/icon.png with the active palette
    py build_icon.py --variants          # writes media/variants/icon-<name>.png for each palette
    py build_icon.py --palette github    # writes media/icon.png using a specific palette
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).parent

SIZE = 128
SCALE = 8  # supersample, then downsample for crisp anti-aliasing
W = SIZE * SCALE

WHITE = (255, 255, 255, 255)
GREEN = (52, 208, 88, 255)        # #34d058
RED = (249, 117, 131, 255)        # #f97583


@dataclass(frozen=True)
class Palette:
    name: str
    bg_top: tuple[int, int, int, int]
    bg_bottom: tuple[int, int, int, int]
    neutral_bar: tuple[int, int, int, int]
    frame_alpha: int = 130  # how visible the diff-window frame is
    halo: tuple[int, int, int, int] | None = None  # ring behind the check-dot


PALETTES: dict[str, Palette] = {
    # Original VS Code blue
    "vscode": Palette(
        name="vscode",
        bg_top=(0, 120, 212, 255),
        bg_bottom=(0, 90, 158, 255),
        neutral_bar=(200, 220, 245, 255),
    ),
    # Editor-dark — VS Code dark theme background, gives a true "code" feel
    "editor": Palette(
        name="editor",
        bg_top=(45, 45, 48, 255),       # #2d2d30
        bg_bottom=(30, 30, 30, 255),    # #1e1e1e
        neutral_bar=(170, 175, 185, 255),
        frame_alpha=90,
        halo=(20, 20, 20, 255),
    ),
    # GitHub dark — matches github.com dark mode (where reviews happen)
    "github": Palette(
        name="github",
        bg_top=(22, 27, 34, 255),       # #161b22
        bg_bottom=(13, 17, 23, 255),    # #0d1117
        neutral_bar=(139, 148, 158, 255),
        frame_alpha=80,
        halo=(13, 17, 23, 255),
    ),
    # Sunset — warm orange-to-pink, stands out hard in the marketplace grid
    "sunset": Palette(
        name="sunset",
        bg_top=(251, 146, 60, 255),     # #fb923c
        bg_bottom=(219, 39, 119, 255),  # #db2777
        neutral_bar=(255, 230, 220, 255),
    ),
}

ACTIVE_PALETTE = "editor"


def s(v: float) -> int:
    return round(v * SCALE)


def gradient_bg(w: int, h: int, top: tuple, bottom: tuple) -> Image.Image:
    img = Image.new("RGBA", (w, h), top)
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = (x + y) / (w + h)
            r = round(top[0] + (bottom[0] - top[0]) * t)
            g = round(top[1] + (bottom[1] - top[1]) * t)
            b = round(top[2] + (bottom[2] - top[2]) * t)
            px[x, y] = (r, g, b, 255)
    return img


def rounded_mask(w: int, h: int, radius: int) -> Image.Image:
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill=255)
    return mask


def load_font(size_px: int, *, bold: bool = True) -> ImageFont.FreeTypeFont:
    candidates = [
        "C:/Windows/Fonts/seguisb.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/segoeuib.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size_px)
    return ImageFont.load_default()


def render(palette: Palette) -> Image.Image:
    bg = gradient_bg(W, W, palette.bg_top, palette.bg_bottom)
    mask = rounded_mask(W, W, s(28))
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    img.paste(bg, (0, 0), mask)
    draw = ImageDraw.Draw(img)

    # Diff window frame
    fx0, fy0, fx1, fy1 = s(20), s(24), s(108), s(104)
    draw.rounded_rectangle(
        (fx0, fy0, fx1, fy1),
        radius=s(10),
        outline=(255, 255, 255, palette.frame_alpha),
        width=s(3),
    )

    # Diff rows
    rows = [
        (s(42), GREEN, "+"),
        (s(64), palette.neutral_bar, " "),
        (s(86), RED, "-"),
    ]
    bar_height = s(10)
    bar_x0 = s(46)
    bar_x1 = s(98)
    sign_font = load_font(s(20), bold=True)

    for cy, color, sign in rows:
        draw.rounded_rectangle(
            (bar_x0, cy - bar_height // 2, bar_x1, cy + bar_height // 2),
            radius=bar_height // 2,
            fill=color,
        )
        if sign.strip():
            bbox = draw.textbbox((0, 0), sign, font=sign_font)
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
            tx = s(32) - tw // 2 - bbox[0]
            ty = cy - th // 2 - bbox[1]
            draw.text((tx, ty), sign, font=sign_font, fill=color)

    # Check-dot badge
    dot_cx, dot_cy, dot_r = s(102), s(98), s(15)
    halo_r = dot_r + s(3)
    halo_color = palette.halo or palette.bg_bottom
    draw.ellipse(
        (dot_cx - halo_r, dot_cy - halo_r, dot_cx + halo_r, dot_cy + halo_r),
        fill=halo_color,
    )
    draw.ellipse(
        (dot_cx - dot_r, dot_cy - dot_r, dot_cx + dot_r, dot_cy + dot_r),
        fill=GREEN,
    )
    cw = s(4)
    p1 = (dot_cx - s(7), dot_cy)
    p2 = (dot_cx - s(1), dot_cy + s(6))
    p3 = (dot_cx + s(8), dot_cy - s(5))
    draw.line([p1, p2], fill=WHITE, width=cw)
    draw.line([p2, p3], fill=WHITE, width=cw)
    r = cw // 2
    for x, y in (p1, p2, p3):
        draw.ellipse((x - r, y - r, x + r, y + r), fill=WHITE)

    return img.resize((SIZE, SIZE), Image.LANCZOS)


def write(palette: Palette, out: Path) -> Path:
    out.parent.mkdir(parents=True, exist_ok=True)
    render(palette).save(out, "PNG")
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--variants", action="store_true",
                    help="render every palette to media/variants/")
    ap.add_argument("--palette", default=ACTIVE_PALETTE, choices=list(PALETTES),
                    help="palette to use for media/icon.png")
    args = ap.parse_args()

    if args.variants:
        for p in PALETTES.values():
            path = write(p, ROOT / "variants" / f"icon-{p.name}.png")
            print(f"wrote {path}")
    else:
        path = write(PALETTES[args.palette], ROOT / "icon.png")
        print(f"wrote {path} (palette={args.palette})")


if __name__ == "__main__":
    main()
