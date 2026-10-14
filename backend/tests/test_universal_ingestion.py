import io
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.imports import ColumnMap
from app.ingestion import ExtractedRow, Extraction, alias, clean
from tests.test_imports import make_shop, upload
from tests.test_photos import app, join, jpeg  # noqa: F401


def mock_extraction(application, monkeypatch, extraction):
    mapper = application.state.column_mapper
    mapper.settings = mapper.settings.model_copy(update={"coach_mode": "gemini"})
    generate = AsyncMock(
        return_value=SimpleNamespace(parsed=extraction, candidates=[], prompt_feedback=None)
    )
    fake = SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate)))
    monkeypatch.setattr(mapper, "client", lambda: fake)
    return generate


@pytest.mark.parametrize("mime", ["image/jpeg", "image/png", "image/webp"])
def test_image_sales_clean_alias_totals_and_require_exact_confirmation(app, monkeypatch, mime):  # noqa: F811
    with TestClient(app) as client:
        join(client)
        bid = make_shop(client)
        menu = upload(client, bid, b"Item,Price\nKopi,1.8\nKaya toast,2.5\n").json()["proposal"]
        client.post(f"/api/v1/proposals/{menu['id']}/approve", json={"digest": menu["digest"]})
        generate = mock_extraction(
            app,
            monkeypatch,
            Extraction(
                kind="sales",
                rows=[
                    ExtractedRow(
                        date="14/10/2026",
                        item="  k O P I  ",
                        quantity=10,
                        revenue=18,
                        confidence=0.99,
                    ),
                    ExtractedRow(
                        date="2026-10-14", item="Kopi", quantity=0, revenue=0, confidence=0.99
                    ),
                    ExtractedRow(
                        date="14 Oct 2026",
                        item="Kaya toas",
                        quantity=3,
                        revenue=7.5,
                        confidence=0.6,
                    ),
                    ExtractedRow(item="Grand Total", revenue=25.5),
                    ExtractedRow(item="Subtotal", revenue=25.5),
                ],
            ),
        )
        image = Image.new("RGB", (64, 48), "white")
        data = io.BytesIO()
        image.save(
            data, format={"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}[mime]
        )
        result = upload(client, bid, data.getvalue(), mime)
        assert result.status_code == 200, result.text
        body = result.json()
        assert body["dropped"] == 2
        assert body["sales"] == [
            {"date": "2026-10-14", "item": "Kaya toast", "quantity": 3, "revenue": 750},
            {"date": "2026-10-14", "item": "Kopi", "quantity": 10, "revenue": 1800},
        ]
        assert body["flags"] == [
            {"row": 3, "item": "Kaya toast", "reasons": ["alias", "extraction"]}
        ]
        assert body["summary"]["total_revenue"] == 25.5
        part = generate.call_args.kwargs["contents"][0].inline_data
        assert part.mime_type == "image/jpeg"
        assert not Image.open(io.BytesIO(part.data)).getexif()
        assert client.get(f"/api/v1/businesses/{bid}/sales").json() == []
        path = f"/api/v1/businesses/{bid}/import/{body['import_id']}/approve"
        assert client.post(path, json={"digest": "0" * 64}).status_code == 409
        assert client.post(path, json={"digest": body["digest"]}).status_code == 200


@pytest.mark.parametrize(
    "mime,data", [("application/pdf", b"%PDF-1.7 fixture"), ("text/plain", b"Kopi $1.80 per cup")]
)
def test_pdf_and_notes_prepare_bulk_menu(app, monkeypatch, mime, data):  # noqa: F811
    with TestClient(app) as client:
        join(client)
        bid = make_shop(client)
        mock_extraction(
            app,
            monkeypatch,
            Extraction(
                kind="menu",
                rows=[
                    ExtractedRow(name="Kopi", price=1.8, unit="cup", confidence=0.99),
                    ExtractedRow(name="Kaya toast", price=2.5, unit="set", confidence=0.5),
                ],
            ),
        )
        body = upload(client, bid, data, mime).json()
        assert len(body["proposal"]["snapshot"]["products"]) == 2
        assert body["flags"][0]["item"] == "Kaya toast"
        assert client.get(f"/api/v1/businesses/{bid}/inventory").json() == []


def test_moderation_blocks_before_model_and_offline_is_truthful(app, monkeypatch):  # noqa: F811
    with TestClient(app) as client:
        join(client)
        bid = make_shop(client)
        generate = mock_extraction(
            app, monkeypatch, Extraction(kind="menu", rows=[ExtractedRow(name="Kopi", price=1.8)])
        )
        assert upload(client, bid, jpeg(13), "image/jpeg").status_code == 422
        generate.assert_not_called()
        app.state.column_mapper.settings = app.state.column_mapper.settings.model_copy(
            update={"coach_mode": "offline"}
        )
        assert (
            upload(client, bid, jpeg(), "image/jpeg").json()["detail"] == "EXTRACTION_UNAVAILABLE"
        )


def test_cleaning_is_deterministic_and_flags_ambiguous_dates():
    mapping = ColumnMap(kind="sales", date=0, name=1)
    rows = [["02/03/2026", " kopi "], ["", "TOTAL SALES"]]
    result = clean(rows, mapping, [{"name": "Kopi"}])
    assert result == clean(rows, mapping, [{"name": "Kopi"}])
    assert result == (
        [["2026-03-02", "Kopi"]],
        [{"row": 1, "item": "Kopi", "reasons": ["date"]}],
        1,
    )
    assert alias("Kopi", ["Kopi O", "Kopi C"])[0] == "Kopi"
    # Fuzzy matching uses saved names only: new variants must not silently merge together.
    rows, _, _ = clean(
        [["Coffee 100g"], ["Coffee 200g"], [" coffee 100g "]], ColumnMap(kind="menu", name=0), []
    )
    assert rows == [["Coffee 100g"], ["Coffee 200g"], ["Coffee 100g"]]
    from app.imports import ImportRejected

    with pytest.raises(ImportRejected):
        clean([["Kopi"]], ColumnMap(kind="menu", name=99), [])


def test_coach_photo_uses_one_bulk_products_review(app, monkeypatch):  # noqa: F811
    import app.merchant_routes as routes
    from app.photos import ExtractedProduct, PhotoExtraction

    with TestClient(app) as client:
        join(client)
        bid = make_shop(client)
        extraction = PhotoExtraction(
            photo_kind="menu",
            products=[
                ExtractedProduct(name=f"Menu item {i}", price=1.8, unit="cup") for i in range(40)
            ],
        )
        monkeypatch.setattr(app.state.photos, "extract", AsyncMock(return_value=extraction))
        calls = []
        original = routes.propose_products

        def propose(items):
            calls.append(items)
            return original(items)

        monkeypatch.setattr(routes, "propose_products", propose)
        response = client.post(
            f"/api/v1/photos?business_id={bid}",
            content=jpeg(),
            headers={"content-type": "image/jpeg"},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert len(calls) == 1 and len(calls[0]) == 40
        assert len(body["proposal"]["snapshot"]["products"]) == 40
        assert client.get(f"/api/v1/businesses/{bid}/inventory").json() == []


def test_multimodal_truncation_rejects_partial_sales(app, monkeypatch):  # noqa: F811
    with TestClient(app) as client:
        join(client)
        bid = make_shop(client)
        generate = mock_extraction(
            app,
            monkeypatch,
            Extraction(
                kind="sales",
                rows=[ExtractedRow(date="2026-10-14", item="Kopi", quantity=5, revenue=9)],
            ),
        )
        generate.return_value.candidates = [SimpleNamespace(finish_reason="MAX_TOKENS")]
        response = upload(client, bid, jpeg(), "image/jpeg")
        assert response.status_code == 503
        assert client.get(f"/api/v1/businesses/{bid}/sales").json() == []
