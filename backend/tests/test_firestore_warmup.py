"""OB-78: a new instance opens its Firestore connections at startup, not on the first request."""

from types import SimpleNamespace
from unittest.mock import MagicMock

from google.cloud import firestore

from app.warmup import firestore_clients, warm_firestore


def fake_client() -> MagicMock:
    return MagicMock(spec=firestore.Client)


def test_ob78_each_distinct_client_is_touched_once() -> None:
    shared, community, limiter = fake_client(), fake_client(), fake_client()
    services = (
        SimpleNamespace(client=shared),  # merchant store
        SimpleNamespace(client=shared),  # recall shares the merchant client
        SimpleNamespace(docs=SimpleNamespace(client=community)),
        SimpleNamespace(client=limiter),
        SimpleNamespace(),  # local SQLite store: no client
        None,
    )
    clients = firestore_clients(*services)
    assert clients == [shared, community, limiter]
    warm_firestore(clients, "ns")
    for client in clients:
        client.collection.assert_called_once_with("ns")
        client.collection.return_value.document.assert_called_once_with("readiness")
        client.collection.return_value.document.return_value.get.assert_called_once()


def test_ob78_a_failed_warm_up_never_stops_startup() -> None:
    broken, fine = fake_client(), fake_client()
    broken.collection.side_effect = RuntimeError("unavailable")
    warm_firestore([broken, fine], "ns")
    fine.collection.return_value.document.return_value.get.assert_called_once()
    warm_firestore([], "ns")
