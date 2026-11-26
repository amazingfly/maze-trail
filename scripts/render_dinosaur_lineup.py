#!/usr/bin/env python3
"""Capture the browser lineup from several views. Requires Pillow and Playwright."""
import argparse
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

VIEWS = (
    ('three', 'idle', .8, 'Three-quarter · Idle'),
    ('side', 'walk', .32, 'Side · Walk at 0.32 s'),
    ('side', 'walk', .49, 'Side · Walk at 0.49 s'),
    ('three', 'turn', .9, 'Three-quarter · Turning stride'),
    ('front', 'call', 1.48, 'Front · Calling'),
    ('side', 'sit', 1.55, 'Side · Sitting'),
    ('rear', 'gesture', 1.7, 'Rear · Gestures'),
)


def capture(page, age, angle, pose, seconds):
    page.locator('#age').select_option(age)
    page.locator('#angle').select_option(angle)
    page.locator('#pose').select_option(pose)
    page.evaluate("""async seconds => {
      location.hash = 'time=' + seconds
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    }""", seconds)
    return Image.open(BytesIO(page.locator('#stage').screenshot())).convert('RGB')


def save_sheet(views, destination):
    width, height = 1060, 380
    captions = 36
    sheet = Image.new('RGB', (2 * width, ((len(views) + 1) // 2) * (height + captions)), '#122923')
    pen = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=21)
    for i, (image, title) in enumerate(views):
        x = i % 2 * width
        y = i // 2 * (height + captions)
        image.thumbnail((width, height))
        sheet.paste(image, (x + (width - image.width) // 2, y))
        pen.text((x + 18, y + height + 4), title, font=font, fill='#fff4d9')
    sheet.save(destination, quality=92)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url', help='Full URL of the dinosaur lineup')
    parser.add_argument('destination', type=Path)
    parser.add_argument('--chromium', help='Path to a local Chromium executable')
    args = parser.parse_args()
    args.destination.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=args.chromium,
            args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        )
        page = browser.new_page(viewport={'width': 1300, 'height': 735})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(args.url)
        page.locator('#sound:enabled').wait_for(timeout=20000)
        for age in ['baby', 'adult']:
            views = [
                (capture(page, age, angle, pose, seconds),
                 'Front · Roaring' if age == 'adult' and pose == 'call' else title)
                for angle, pose, seconds, title in VIEWS
            ]
            save_sheet(views, args.destination / f'{age}-poses.jpg')
        capture(page, 'comparison', 'three', 'idle', .8).save(
            args.destination / 'scale-comparison.jpg', quality=93
        )
        browser.close()
        if errors:
            raise RuntimeError(errors)


if __name__ == '__main__':
    main()
