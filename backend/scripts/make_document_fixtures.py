"""Draw the till receipts and supplier invoices used to compare Document AI with Gemini vision.

Each image is a photo-like render (slight tilt, paper tone, noise) with its ground truth beside it
in ``truth.json``. Run once; the images are committed so every comparison reads the same pixels.

    uv run python scripts/make_document_fixtures.py
"""

from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "documents"
FONTS = Path("C:/Windows/Fonts")


def font(name: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in (FONTS / name, Path("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf")):
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default(size)


DOCS: list[dict[str, Any]] = [
    {
        "file": "receipt-cafe-sgd.jpg",
        "kind": "sales",
        "width": 620,
        "font": "consola.ttf",
        "date": "2026-10-14",
        "currency": "SGD",
        "header": [
            "KOPI CORNER",
            "Blk 85 Bedok North #01-12",
            "Tel 6441 2290",
            "",
            "14/10/2026  18:42",
            "Receipt 004182",
            "",
        ],
        "lines": [
            ("Kopi O", 3, 4.80),
            ("Teh Tarik", 2, 3.60),
            ("Kaya Toast Set", 4, 22.00),
            ("Half Boiled Eggs", 2, 4.00),
            ("Curry Puff", 5, 9.00),
        ],
        "footer": [
            "",
            "SUBTOTAL            43.40",
            "GST 9% (incl)        3.58",
            "TOTAL SGD           43.40",
            "NETS                43.40",
            "",
            "Thank you! Come again",
        ],
    },
    {
        "file": "receipt-kirana-inr.jpg",
        "kind": "sales",
        "width": 640,
        "font": "consola.ttf",
        "date": "2026-10-13",
        "currency": "INR",
        "header": [
            "SRI LAKSHMI STORES",
            "12 MG Road, Jayanagar",
            "Bengaluru 560041",
            "GSTIN 29ABCDE1234F1Z5",
            "",
            "Bill No: 7731   Dt: 13-10-2026",
            "Cashier: Ravi",
            "",
        ],
        "lines": [
            ("Toor Dal 1kg", 2, 340.00),
            ("Sona Masoori Rice 5kg", 1, 395.00),
            ("Sunflower Oil 1L", 3, 465.00),
            ("Parle-G Biscuit", 6, 60.00),
            ("Amul Butter 100g", 2, 116.00),
            ("Tata Salt 1kg", 1, 28.00),
        ],
        "footer": [
            "",
            "Items: 6      Qty: 15",
            "Net Amount       1404.00",
            "UPI              1404.00",
            "",
            "Goods once sold will not",
            "be taken back",
        ],
    },
    {
        "file": "zreport-bakery-sgd.jpg",
        "kind": "sales",
        "width": 600,
        "font": "cour.ttf",
        "date": "2026-10-15",
        "currency": "SGD",
        "header": [
            "ASHA BAKERY",
            "Z REPORT  #0219",
            "15/10/2026 21:05",
            "------------------------------",
            "PLU SALES",
            "",
        ],
        "lines": [
            ("Butter Croissant", 18, 63.00),
            ("Sourdough Loaf", 6, 51.00),
            ("Pandan Chiffon", 4, 34.00),
            ("Egg Tart", 22, 33.00),
        ],
        "footer": [
            "------------------------------",
            "GROSS SALES         181.00",
            "CASH                 71.00",
            "CARD                110.00",
            "TXN COUNT              37",
        ],
    },
    {
        "file": "invoice-supplier-inr.jpg",
        "kind": "delivery",
        "width": 900,
        "font": "arial.ttf",
        "date": "2026-10-12",
        "currency": "INR",
        "number": "SKD/2026/0457",
        "supplier": "Sree Krishna Distributors",
        "header": [
            "SREE KRISHNA DISTRIBUTORS",
            "TAX INVOICE",
            "45 KR Market, Bengaluru 560002   GSTIN 29KRSHN5678Q1Z2",
            "",
            "Invoice No: SKD/2026/0457        Invoice Date: 12/10/2026",
            "Bill To: Sri Lakshmi Stores, Jayanagar      PO Ref: PO-1188",
            "",
        ],
        "columns": True,
        "lines": [
            ("Toor Dal 30kg bag", 2, 4950.00),
            ("Sunflower Oil 15L tin", 1, 2180.00),
            ("Sugar 50kg bag", 1, 2275.00),
            ("Parle-G carton (48)", 3, 1440.00),
        ],
        "footer": [
            "",
            "Taxable value: 10845.00     CGST 2.5%: 271.13     SGST 2.5%: 271.13",
            "Invoice Total: INR 11387.26",
            "Payment terms: 15 days",
        ],
    },
    {
        "file": "invoice-wholesale-sgd.jpg",
        "kind": "delivery",
        "width": 900,
        "font": "arial.ttf",
        "date": "2026-10-09",
        "currency": "SGD",
        "number": "INV-30921",
        "supplier": "Fresh Harvest Trading Pte Ltd",
        "header": [
            "Fresh Harvest Trading Pte Ltd",
            "INVOICE",
            "21 Pasir Panjang Wholesale Centre, Singapore 110021",
            "",
            "Invoice: INV-30921       Date: 09 Oct 2026      Customer: Kopi Corner",
            "",
        ],
        "columns": True,
        "lines": [
            ("Eggs grade A (tray of 30)", 6, 54.00),
            ("Kaya jar 1kg", 4, 38.00),
            ("White bread loaf", 20, 46.00),
            ("Evaporated milk carton", 2, 61.20),
        ],
        "footer": [
            "",
            "Subtotal: 199.20",
            "GST 9%: 17.93",
            "Total due: SGD 217.13",
            "Payable within 30 days",
        ],
    },
    {
        "file": "delivery-note-flour-sgd.jpg",
        "kind": "delivery",
        "width": 820,
        "font": "cour.ttf",
        "date": "2026-10-11",
        "currency": "SGD",
        "number": "DN-5512",
        "supplier": "Prima Baking Supplies",
        "header": [
            "PRIMA BAKING SUPPLIES",
            "DELIVERY NOTE / INVOICE  DN-5512",
            "Date 11/10/2026",
            "Deliver to: Asha Bakery",
            "",
        ],
        "columns": True,
        "lines": [
            ("Bread flour 25kg", 3, 117.00),
            ("Unsalted butter 5kg", 2, 96.00),
            ("Caster sugar 10kg", 1, 18.50),
        ],
        "footer": ["", "TOTAL SGD 231.50", "Received by: ________"],
    },
]


def draw(doc: dict[str, Any], seed: int) -> Image.Image:
    rng = random.Random(seed)
    small = font(doc["font"], 22)
    big = font(doc["font"], 30)
    rows: list[tuple[str, Any]] = []
    for i, text in enumerate(doc["header"]):
        rows.append((text, big if i == 0 else small))
    if doc.get("columns"):
        rows.append(("#   Description                         Qty     Amount", small))
        for n, (item, qty, amount) in enumerate(doc["lines"], 1):
            rows.append((f"{n:<3} {item:<35} {qty:>4} {amount:>10.2f}", small))
    else:
        for item, qty, amount in doc["lines"]:
            rows.append((f"{qty} x {item}", small))
            rows.append((f"{'':>20}{amount:>10.2f}", small))
    rows.extend((text, small) for text in doc["footer"])
    height = 60 + sum(40 if f is big else 30 for _, f in rows)
    paper = Image.new("RGB", (doc["width"], height), (247, 244, 236))
    pen = ImageDraw.Draw(paper)
    y = 30
    for text, face in rows:
        pen.text((30, y), text, fill=(35, 35, 40), font=face)
        y += 40 if face is big else 30
    # A phone photo of the paper: on a table, slightly turned, a little soft and grainy.
    canvas = Image.new("RGB", (paper.width + 120, paper.height + 120), (92, 84, 74))
    canvas.paste(paper, (60, 60))
    canvas = canvas.rotate(
        rng.uniform(-2.5, 2.5), resample=Image.Resampling.BICUBIC, fillcolor=(92, 84, 74)
    )
    noise = Image.effect_noise(canvas.size, 18).convert("RGB")
    canvas = Image.blend(canvas, noise, 0.06).filter(ImageFilter.GaussianBlur(0.6))
    return canvas


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    truth = []
    for seed, doc in enumerate(DOCS):
        draw(doc, seed).save(OUT / doc["file"], format="JPEG", quality=88)
        truth.append(
            {
                "file": doc["file"],
                "kind": doc["kind"],
                "date": doc["date"],
                "currency": doc["currency"],
                **(
                    {"number": doc["number"], "supplier": doc["supplier"]}
                    if "number" in doc
                    else {}
                ),
                "lines": [
                    {"item": item, "quantity": qty, "amount": amount}
                    for item, qty, amount in doc["lines"]
                ],
            }
        )
    (OUT / "truth.json").write_text(json.dumps(truth, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(DOCS)} documents to {OUT}")


if __name__ == "__main__":
    main()
