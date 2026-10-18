"""Rebuild synthetic inputs only. Expectations are independent, reviewed literals below."""

import csv
import io
import json
from pathlib import Path

from openpyxl import Workbook

from app.supply_docs import DocLine, Party, SupplyDoc, render

ROOT = Path(__file__).parent / "cases"


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def case(name, adapter, filename, data, expected, **meta):
    folder = ROOT / name
    folder.mkdir(parents=True, exist_ok=True)
    (folder / filename).write_bytes(data if isinstance(data, bytes) else data.encode("utf-8"))
    write_json(folder / "case.json", {"adapter": adapter, "input": filename, **meta})
    write_json(folder / "expected.json", expected)
    return folder


def connector(
    name,
    headers,
    records,
    expected_rows,
    *,
    kind="menu",
    ext="csv",
    raw=None,
    error=None,
    notes="",
    source=None,
):
    if raw is None:
        if ext == "json":
            raw = json.dumps({"items": [dict(zip(headers, row, strict=False)) for row in records]})
        elif ext == "xlsx":
            book = Workbook()
            sheet = book.active
            assert sheet is not None
            for row in [headers, *records]:
                sheet.append(row)
            output = io.BytesIO()
            book.save(output)
            raw = output.getvalue()
        else:
            output = io.StringIO(newline="")
            writer = csv.writer(output, lineterminator="\n")
            writer.writerows([headers, *records])
            raw = output.getvalue()
    mime = {
        "csv": "text/csv",
        "json": "application/json",
        "xml": "application/xml",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }[ext]
    expected = error or {"kind": kind, "count": len(records), "rows": expected_rows}
    return case(
        name,
        "connector",
        f"input.{ext}",
        raw,
        expected,
        mime=mime,
        source=source or name,
        currency="INR",
        notes=notes,
    )


def build_connectors():
    connector(
        "reused-tally-vouchers",
        [],
        [[1], [2], [3], [4]],
        [
            {
                "date": "20261014",
                "name": "Filter Coffee",
                "price": 3000,
                "quantity": 5,
                "total": 15000,
            },
            {
                "date": "20261014",
                "name": "Masala Dosa",
                "price": 8000,
                "quantity": 3,
                "total": 24000,
            },
            {
                "date": "20261015",
                "name": "Filter Coffee",
                "price": 3000,
                "quantity": 7,
                "total": 21000,
            },
            {
                "date": "20261015",
                "name": "Paneer Butter Masala",
                "price": 18000,
                "quantity": 2,
                "total": 36000,
            },
        ],
        ext="xml",
        kind="sales",
        raw=(ROOT.parent.parent / "fixtures/connect/tally_sales.xml").read_bytes(),
        notes="Reuses existing synthetic tests/fixtures/connect/tally_sales.xml.",
    )
    headers = ["Item Name", "Price", "Stock", "Category", "SKU"]
    records = [
        ["Masala Chai", "15.50", "20", "Drinks", "TEA-01"],
        ["Bun", "25.00", "0", "Bakery", "BUN-02"],
    ]
    expected = [
        {"name": "Masala Chai", "price": 1550, "stock": 20, "category": "Drinks"},
        {"name": "Bun", "price": 2500, "stock": 0, "category": "Bakery"},
    ]
    for name, cols, ext in [
        ("generic-csv", headers, "csv"),
        ("generic-xlsx", headers, "xlsx"),
        ("generic-json", headers, "json"),
        ("square-items", headers, "csv"),
        ("zoho-inventory", ["Item Name", "Selling Price", "Stock", "Category", "SKU"], "csv"),
        ("loyverse", ["Item Name", "Price", "In Stock", "Category", "SKU"], "csv"),
        (
            "shopify-products",
            ["Title", "Variant Price", "Variant Inventory Qty", "Type", "Variant SKU"],
            "csv",
        ),
        ("petpooja", ["itemname", "price", "stock", "categoryname", "item_id"], "json"),
    ]:
        folder = connector(
            name,
            cols,
            records,
            expected,
            ext=ext,
            notes="SKU is present in input but unsupported by connector target schema.",
        )
        write_json(folder / "requirements.json", {"rows": [{"sku": "TEA-01"}, {"sku": "BUN-02"}]})
    connector(
        "square-sales",
        ["Date", "Item", "Qty", "Net Sales"],
        [["2026-10-17", "Chai", "3", "46.50"], ["2026-10-18", "Bun", "2", "50.00"]],
        [
            {"date": "2026-10-17", "name": "Chai", "quantity": 3, "total": 4650},
            {"date": "2026-10-18", "name": "Bun", "quantity": 2, "total": 5000},
        ],
        kind="sales",
    )
    connector(
        "tally-vouchers",
        [],
        [[1], [2]],
        [
            {"date": "20261017", "name": "Chai", "price": 1550, "quantity": 3, "total": 4650},
            {"date": "20261017", "name": "Bun", "price": 2500, "quantity": 2, "total": 5000},
        ],
        ext="xml",
        kind="sales",
        raw="""<ENVELOPE><VOUCHER><DATE>20261017</DATE>
<ALLINVENTORYENTRIES.LIST><STOCKITEMNAME>Chai</STOCKITEMNAME><RATE>15.50/cup</RATE>
<BILLEDQTY>3 cup</BILLEDQTY><AMOUNT>46.50</AMOUNT></ALLINVENTORYENTRIES.LIST>
<ALLINVENTORYENTRIES.LIST><STOCKITEMNAME>Bun</STOCKITEMNAME><RATE>25/piece</RATE>
<BILLEDQTY>2 piece</BILLEDQTY><AMOUNT>50</AMOUNT></ALLINVENTORYENTRIES.LIST>
</VOUCHER></ENVELOPE>""",
    )
    connector(
        "tally-stock",
        [],
        [[1]],
        [{"name": "Chai", "price": 1550, "stock": 20, "unit": "cup", "category": "Drinks"}],
        ext="xml",
        raw="""<ENVELOPE><STOCKITEM NAME="Chai"><BASEUNITS>cup</BASEUNITS>
<RATE>15.50</RATE><CLOSINGBALANCE>20</CLOSINGBALANCE><PARENT>Drinks</PARENT>
</STOCKITEM></ENVELOPE>""",
    )
    connector("broken-empty", [], [], [], raw=b"", error={"error": "EMPTY_FILE", "status": 422})
    connector(
        "broken-encoding",
        [],
        [[1]],
        [{"name": "Café", "price": 1200}],
        raw=b"Item,Price\nCaf\xe9,12\n",
        notes="Latin-1 fallback accepted; no app warning.",
    )
    connector(
        "extra-columns",
        headers + ["Owner note"],
        [records[0] + ["ignore this"]],
        expected[:1],
        notes="Unknown columns silently ignored; no app warning.",
    )
    connector(
        "missing-price",
        ["Item", "Price"],
        [["Chai", ""]],
        [{"name": "Chai"}],
        notes="Mapping preview retains row; downstream menu import skips missing price.",
    )
    connector(
        "duplicate-rows",
        headers,
        [records[0], records[0]],
        [expected[0], expected[0]],
        notes="Preview preserves duplicates; downstream menu import collapses name/unit.",
    )


def build_supply():
    # These are fixture transport encoders, not the expected-output oracle.
    for scenario, kind, qty in [
        ("order-create", "ORDERS", 20),
        ("order-change", "ORDERS", 25),
        ("forecast", "ORDERS", 35),
        ("supplier-ordrsp", "ORDRSP", 15),
        ("supplier-desadv", "DESADV", 15),
        ("supplier-invoic", "INVOIC", 15),
    ]:
        doc = SupplyDoc(
            kind=kind,
            number="GOLD-1001",
            ref="PO-100",
            issued="2026-10-18",
            delivery="2026-10-21",
            currency="INR",
            buyer=Party(name="Synthetic Chai Shop"),
            supplier=Party(name="Test Wholesale"),
            lines=[
                DocLine(
                    line=10, item="Sugar", quantity=qty, unit="kg", price=4400, total=qty * 4400
                )
            ],
            total=qty * 4400,
        )
        for fmt, ext in [("idoc", "xml"), ("csv", "csv"), ("text", "txt"), ("json", "json")]:
            expected = {
                "document": {
                    "kind": kind,
                    "number": "GOLD-1001",
                    "issued": "2026-10-18",
                    "delivery": "2026-10-21",
                    "currency": "INR",
                    "lines": [{"item": "Sugar", "quantity": qty, "unit": "kg"}],
                },
                "format": fmt,
                "ambiguous": [],
            }
            if kind != "DESADV":
                expected["document"]["lines"][0].update(price=4400, total=qty * 4400)
            if kind == "DESADV" and fmt == "idoc":
                expected["document"]["currency"] = "XXX"
            case(
                f"supply-{scenario}-{fmt}",
                "supply",
                f"input.{ext}",
                render(doc, fmt),
                expected,
                notes="Forecast is an ORDERS replenishment draft; no native forecast/ORDCHG kind.",
            )


def build_media():
    menus = [
        (
            "en-chai",
            "Synthetic Chai Stall",
            "INR",
            [("Masala Chai", 1500, "cup", "Drinks"), ("Ginger Chai", 2000, "cup", "Drinks")],
        ),
        (
            "hi-chai",
            "नमूना चाय दुकान",
            "INR",
            [("मसाला चाय", 1500, "cup", "पेय"), ("अदरक चाय", 2000, "cup", "पेय")],
        ),
        (
            "ta-bakery",
            "மாதிரி பேக்கரி",
            "INR",
            [("பன்", 2500, "piece", "பேக்கரி"), ("கேக்", 6000, "slice", "பேக்கரி")],
        ),
        (
            "zh-bakery",
            "示例面包店",
            "SGD",
            [("奶茶", 250, "cup", "饮料"), ("红豆面包", 180, "piece", "面包")],
        ),
        (
            "en-hardware",
            "Synthetic Hardware",
            "INR",
            [("Steel nails", 4500, "pack", "Tools"), ("Hammer", 22000, "piece", "Tools")],
        ),
        (
            "en-sizes",
            "Synthetic Bakery",
            "SGD",
            [("Coffee small", 250, "cup", "Drinks"), ("Coffee large", 350, "cup", "Drinks")],
        ),
    ]
    for name, title, currency, rows in menus:
        for variant in ("clean", "rotated", "low-light"):
            items = [
                dict(zip(("name", "price", "size", "category"), row, strict=False)) for row in rows
            ]
            folder = case(
                f"menu-{name}-{variant}",
                "menu",
                "input.png",
                b"",
                {"items": items},
                mime="image/png",
                currency=currency,
                render={"title": title, "variant": variant, "items": items},
                notes="Second item is marked SOLD OUT. Availability is not in extraction schema.",
            )
            write_json(
                folder / "response.json",
                {
                    "photo_kind": "menu",
                    "products": [
                        {"name": r[0], "price": r[1] / 100, "unit": r[2], "category": r[3]}
                        for r in rows
                    ],
                },
            )
            write_json(
                folder / "requirements.json", {"currency": currency, "sold_out": [rows[1][0]]}
            )
    for processor in ("invoice", "receipt"):
        for ext, mime in [("png", "image/png"), ("pdf", "application/pdf")]:
            name = f"document-{processor}-{ext}"
            expected = {
                "date": "2026-10-18",
                "currency": "INR",
                "supplier": "Test Wholesale",
                "total": 105.0,
                "lines": [{"item": "Sugar", "quantity": 2, "amount": 100.0}],
            }
            folder = case(
                name,
                "document",
                f"input.{ext}",
                b"",
                expected,
                processor=processor,
                mime=mime,
                render={
                    "title": "SUPPLIER INVOICE" if processor == "invoice" else "RETAIL RECEIPT",
                    "variant": "clean",
                },
                notes="Tax 5.00 is printed; parser omits tax.",
            )
            write_json(folder / "requirements.json", {"tax": 5.0})
            entities = [
                {"type": "supplier_name", "mentionText": "Test Wholesale"},
                {"type": "currency", "mentionText": "INR"},
                {
                    "type": "invoice_date" if processor == "invoice" else "receipt_date",
                    "normalizedValue": {"dateValue": {"year": 2026, "month": 10, "day": 18}},
                },
                {"type": "total_amount", "mentionText": "105.00"},
                {"type": "total_tax_amount", "mentionText": "5.00"},
                {
                    "type": "line_item",
                    "properties": [
                        {"type": "line_item/description", "mentionText": "Sugar"},
                        {"type": "line_item/quantity", "mentionText": "2"},
                        {"type": "line_item/amount", "mentionText": "100.00"},
                    ],
                },
            ]
            write_json(folder / "response.json", {"entities": entities})


if __name__ == "__main__":
    build_connectors()
    build_supply()
    build_media()
