from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.connector import (
    _heuristic_connector_mapping,
    compute_diff,
    parse_any,
)
from app.merchant import BusinessFields, ProposalRequest
from tests.test_imports import make_shop
from tests.test_merchant_store import store  # noqa: F401 (sqlite + firestore fixture)
from tests.test_photos import app, join  # noqa: F401 (fixture + consent helper)

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "connect"


def test_parse_and_map_pos_menu_csv() -> None:
    data = (FIXTURES_DIR / "pos_menu.csv").read_bytes()
    headers, rows = parse_any(data, "text/csv")
    assert len(rows) == 7
    assert "Item Name" in headers
    assert "Price" in headers

    mapping = _heuristic_connector_mapping(headers, rows, "Square")
    assert mapping.kind == "menu"
    roles = {f.target_field: f.source_field for f in mapping.fields}
    assert roles["name"] == "Item Name"
    assert roles["price"] == "Price"
    assert roles["stock"] == "Stock"
    assert roles["category"] == "Category"
    assert roles["unit"] == "Unit"

    # Confidences are high for exact/substring matches
    for f in mapping.fields:
        assert f.confidence >= 0.8


def test_parse_and_map_tally_sales_xml() -> None:
    data = (FIXTURES_DIR / "tally_sales.xml").read_bytes()
    headers, rows = parse_any(data, "application/xml")
    assert len(rows) == 4
    assert "STOCKITEMNAME" in headers
    assert "DATE" in headers

    mapping = _heuristic_connector_mapping(headers, rows, "Tally")
    assert mapping.kind == "sales"
    roles = {f.target_field: f.source_field for f in mapping.fields}
    assert roles["name"] == "STOCKITEMNAME"
    assert roles["date"] == "DATE"
    assert roles["quantity"] == "BILLEDQTY"
    assert roles["total"] == "AMOUNT" or roles["price"] == "RATE"


def test_parse_and_map_shopify_products_csv() -> None:
    data = (FIXTURES_DIR / "shopify_products.csv").read_bytes()
    headers, rows = parse_any(data, "text/csv")
    assert len(rows) == 4
    assert "Title" in headers
    assert "Variant Price" in headers

    mapping = _heuristic_connector_mapping(headers, rows, "Shopify")
    assert mapping.kind == "menu"
    roles = {f.target_field: f.source_field for f in mapping.fields}
    assert roles["name"] == "Title"
    assert roles["price"] == "Variant Price"
    assert roles["stock"] == "Variant Inventory Qty"
    assert roles["category"] == "Type"


def test_parse_and_map_petpooja_menu_json() -> None:
    data = (FIXTURES_DIR / "petpooja_menu.json").read_bytes()
    headers, rows = parse_any(data, "application/json")
    assert len(rows) == 4
    assert "itemname" in headers
    assert "price" in headers

    mapping = _heuristic_connector_mapping(headers, rows, "Petpooja")
    assert mapping.kind == "menu"
    roles = {f.target_field: f.source_field for f in mapping.fields}
    assert roles["name"] == "itemname"
    assert roles["price"] == "price"
    assert roles["category"] == "categoryname"
    assert roles["unit"] == "unit"
    assert roles["stock"] == "stock"


def test_compute_diff_added_updated_removed() -> None:
    current = [
        {"name": "Filter Coffee", "price": 3000, "unit": "cup", "stock": 50, "category": "Drinks"},
        {"name": "Old Bun", "price": 1500, "unit": "piece", "stock": 5, "category": "Food"},
    ]
    incoming = [
        {"name": "Filter Coffee", "price": 35.0, "unit": "cup", "stock": 40, "category": "Drinks"},
        {"name": "Masala Dosa", "price": 80.0, "unit": "plate", "stock": 20, "category": "Food"},
    ]
    diff = compute_diff(current, incoming, currency="INR")
    assert len(diff["added"]) == 1
    assert diff["added"][0]["name"] == "Masala Dosa"

    assert len(diff["updated"]) == 1
    assert diff["updated"][0]["name"] == "Filter Coffee"
    assert "price" in diff["updated"][0]["fields"]
    assert "stock" in diff["updated"][0]["fields"]

    assert len(diff["removed"]) == 1
    assert diff["removed"][0]["name"] == "Old Bun"


def test_store_connector_mapping_lifecycle(store) -> None:  # noqa: F811
    # Create business
    req = ProposalRequest(kind="business", business=BusinessFields(name="Connector Test Cafe"))
    prop = store.propose("test_owner", req)
    bid = str(store.commit("test_owner", prop["id"], prop["digest"])["business_id"])

    # Initially empty
    assert store.list_connector_mappings("test_owner", bid) == []
    assert store.get_connector_mapping("test_owner", bid, "Petpooja") is None

    # Save mapping
    mapping_data = {
        "source_label": "Petpooja",
        "kind": "menu",
        "confirmed": True,
        "fields": [
            {
                "source_field": "itemname",
                "target_field": "name",
                "confidence": 0.95,
                "sample_values": ["Coffee"],
            },
            {
                "source_field": "price",
                "target_field": "price",
                "confidence": 0.95,
                "sample_values": ["120"],
            },
        ],
    }
    saved = store.save_connector_mapping("test_owner", bid, mapping_data)
    assert saved["source_label"] == "Petpooja"

    # Retrieve mapping (case-insensitive)
    found = store.get_connector_mapping("test_owner", bid, "petpooja")
    assert found is not None
    assert found["source_label"] == "Petpooja"
    assert len(found["fields"]["fields"]) == 2
    assert found["last_synced"] is None

    # Record sync
    store.record_connector_sync("test_owner", bid, "Petpooja")
    synced = store.get_connector_mapping("test_owner", bid, "Petpooja")
    assert synced is not None and synced["last_synced"] is not None

    # List mappings
    mappings = store.list_connector_mappings("test_owner", bid)
    assert len(mappings) == 1
    assert mappings[0]["source_label"] == "Petpooja"

    # Erase owner cleans up
    deleted = store.erase_owner("test_owner")
    assert bid in deleted


def test_api_analyze_and_mapping(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        join(client)
        bid = make_shop(client)

        # 1. Analyze sample CSV
        sample_csv = "Item Name,Price,Unit,Stock,Category\nFilter Coffee,30.00,cup,50,Drinks\n"
        res = client.post(
            f"/api/v1/businesses/{bid}/connect/analyze?source_label=Petpooja",
            content=sample_csv.encode("utf-8"),
            headers={"content-type": "text/csv"},
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["mapping"]["source_label"] == "Petpooja"
        assert data["reused"] is False
        assert len(data["preview_rows"]) == 1
        assert data["preview_rows"][0]["name"] == "Filter Coffee"

        # 2. Confirm and save mapping
        mapping = data["mapping"]
        mapping["confirmed"] = True
        save_res = client.post(
            f"/api/v1/businesses/{bid}/connect/mapping",
            json=mapping,
        )
        assert save_res.status_code == 200

        # 3. List mappings
        list_res = client.get(f"/api/v1/businesses/{bid}/connect/mappings")
        assert list_res.status_code == 200
        saved_list = list_res.json()
        assert len(saved_list) == 1
        assert saved_list[0]["source_label"] == "Petpooja"

        # 4. Re-analyze reuses saved mapping
        res2 = client.post(
            f"/api/v1/businesses/{bid}/connect/analyze?source_label=Petpooja",
            content=sample_csv.encode("utf-8"),
            headers={"content-type": "text/csv"},
        )
        assert res2.status_code == 200
        assert res2.json()["reused"] is True


def test_api_sync_never_silent_writes(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        join(client)
        bid = make_shop(client, currency="SGD")

        # First upload a sample and save mapping
        petpooja_data = (FIXTURES_DIR / "petpooja_menu.json").read_bytes()
        analyze_res = client.post(
            f"/api/v1/businesses/{bid}/connect/analyze?source_label=Petpooja",
            content=petpooja_data,
            headers={"content-type": "application/json"},
        )
        assert analyze_res.status_code == 200
        mapping = analyze_res.json()["mapping"]

        client.post(
            f"/api/v1/businesses/{bid}/connect/mapping",
            json=mapping,
        )

        # Sync using saved mapping
        sync_res = client.post(
            f"/api/v1/businesses/{bid}/connect/sync?source_label=Petpooja",
            content=petpooja_data,
            headers={"content-type": "application/json"},
        )
        assert sync_res.status_code == 200
        sync_data = sync_res.json()
        assert sync_data["status"] == "needs_review"
        assert sync_data["proposal"]["id"]
        assert sync_data["proposal"]["digest"]
        assert sync_data["items"] == 4
        assert len(sync_data["diff"]["added"]) == 4

        # Crucial: NOTHING is saved to inventory yet! (Review before save rule)
        inv = client.get(f"/api/v1/businesses/{bid}/inventory").json()
        assert len(inv) == 0

        # Owner approves proposal
        prop = sync_data["proposal"]
        approve_res = client.post(
            f"/api/v1/proposals/{prop['id']}/approve",
            json={"digest": prop["digest"]},
        )
        assert approve_res.status_code == 200

        # Now items exist in inventory
        inv_after = client.get(f"/api/v1/businesses/{bid}/inventory").json()
        assert len(inv_after) == 4
        names = {p["name"] for p in inv_after}
        assert "Cold Coffee with Ice Cream" in names


def test_firestore_connector_store_unit() -> None:
    from unittest.mock import MagicMock

    from app.merchant_firestore import FirestoreMerchantStore

    mock_client = MagicMock()
    fs_store = FirestoreMerchantStore(mock_client, "test_ns")
    fs_store.owned_business = MagicMock()

    col = fs_store.businesses.document.return_value.collection.return_value
    doc_ref = col.document.return_value

    # Test save
    doc_ref.set = MagicMock()
    mapping_data = {"source_label": "Petpooja", "kind": "menu", "fields": []}
    res = fs_store.save_connector_mapping(
        "uid1", "00000000-0000-0000-0000-000000000001", mapping_data
    )
    assert res["source_label"] == "Petpooja"

    # Test get
    mock_doc = MagicMock()
    mock_doc.exists = True
    mock_doc.to_dict.return_value = {"source_label": "Petpooja", "fields": mapping_data}
    doc_ref.get.return_value = mock_doc
    found = fs_store.get_connector_mapping(
        "uid1", "00000000-0000-0000-0000-000000000001", "Petpooja"
    )
    assert found is not None and found["source_label"] == "Petpooja"

    # Test list
    fs_store.businesses.document.return_value.collection.return_value.stream.return_value = [
        mock_doc
    ]
    items = fs_store.list_connector_mappings("uid1", "00000000-0000-0000-0000-000000000001")
    assert len(items) == 1

    # Test sync record
    fs_store.record_connector_sync("uid1", "00000000-0000-0000-0000-000000000001", "Petpooja")
    doc_ref.update.assert_called_once()
