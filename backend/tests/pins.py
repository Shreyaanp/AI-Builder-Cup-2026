"""OB-168: only a pinned shop can be public, so fixtures that share a shop give it a pin."""

from typing import Any

from app.merchant import BusinessFields, MerchantRepository, ProposalRequest

SHOP_PIN = {"lat": 1.2847, "lng": 103.832}
# The owner's own confirmed point, for requests (pin fields from a client are never trusted).
OWNER_PIN = {"owner_location": {**SHOP_PIN, "accuracy_m": 0, "source": "pin"}}


def pin_shop(store: MerchantRepository, uid: str, bid: str) -> None:
    """The owner confirms the saved shop's pin (a reviewed edit), as before sharing it."""
    business = store.context(uid, bid)["business"]
    proposal = store.propose(
        uid,
        ProposalRequest(
            kind="business",
            business_id=bid,
            revision=business["revision"],
            business=BusinessFields.model_validate({**business["fields"], **SHOP_PIN}),
        ),
    )
    store.commit(uid, proposal["id"], proposal["digest"])


def pin_shop_over_http(client: Any, bid: str) -> None:
    """The same confirmation through the owner's routes."""
    shop = next(s for s in client.get("/api/v1/businesses").json() if s["id"] == bid)
    proposal = client.post(
        "/api/v1/proposals",
        json={
            "kind": "business",
            "business_id": bid,
            "revision": shop["revision"],
            "business": shop["fields"],
            **OWNER_PIN,
        },
    ).json()
    approved = client.post(
        f"/api/v1/proposals/{proposal['id']}/approve", json={"digest": proposal["digest"]}
    )
    assert approved.status_code == 200
