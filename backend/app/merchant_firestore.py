"""Durable owner-scoped merchant records in the app's dedicated Firestore namespace.

Mirrors MerchantStore so ADK tools and routes are adapter-agnostic. Every write that depends
on a revision, a proposal digest or a single-use challenge runs in one Firestore transaction.
"""

from __future__ import annotations

import hashlib
import json
import re
import secrets
import time
from threading import Lock
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException
from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from .customer import Inquiry, InquiryInput, InquiryReceipt, inquiry_key
from .merchant import (
    CHALLENGE_SECONDS,
    PROPOSAL_SECONDS,
    ProposalRequest,
    challenge_prompts,
    public_projection,
    seal_proposal,
    validate_proposal,
)


def document_id(value: str | None, missing: str) -> str:
    """Only server-generated UUIDs may name documents; reject paths and arbitrary strings."""
    try:
        return str(UUID(str(value)))
    except ValueError as error:
        raise HTTPException(404, missing) from error


def product_key(name: str, unit: str) -> str:
    return hashlib.sha256(f"{name}\0{unit}".encode()).hexdigest()


class FirestoreMerchantStore:
    def __init__(self, client: firestore.Client, namespace: str) -> None:
        self.client = client
        root = client.collection(namespace).document("merchant")
        self.people = root.collection("people")
        self.businesses = root.collection("businesses")
        self.proposals = root.collection("proposals")
        self.challenges = root.collection("challenges")
        # Avoid competing local read-lock upgrades on one dedupe document. Transactions
        # still enforce deduplication and sharing across independent server processes.
        self.inquiry_lock = Lock()

    def person_ref(self, uid: str) -> Any:
        return self.people.document(hashlib.sha256(uid.encode()).hexdigest())

    def sim_state(self, uid: str, bid: str) -> dict[str, Any] | None:
        self.owned_business(uid, bid)
        ref = self.businesses.document(document_id(bid, "Business not found."))
        data = ref.collection("google_sim").document(hashlib.sha256(uid.encode()).hexdigest()).get()
        return data.to_dict() if data.exists else None

    def save_sim_state(self, uid: str, bid: str, state: dict[str, Any]) -> None:
        business = self.businesses.document(document_id(bid, "Business not found."))
        ref = business.collection("google_sim").document(hashlib.sha256(uid.encode()).hexdigest())

        @firestore.transactional
        def run(transaction: Any) -> None:
            self.owned(business.get(transaction=transaction), uid)
            current = ref.get(transaction=transaction).to_dict() or {}
            if state["version"] != current.get("version", 0) + 1:
                raise HTTPException(409, "Simulator changed. Reload before reviewing.")
            transaction.set(ref, state)

        run(self.client.transaction())

    @staticmethod
    def owned(snapshot: Any, uid: str) -> dict[str, Any]:
        data = snapshot.to_dict() if snapshot.exists else None
        if not data or uid not in data.get("owners", []):
            raise HTTPException(404, "Business not found.")
        return dict(data)

    def owned_business(self, uid: str, bid: str, transaction: Any = None) -> dict[str, Any]:
        ref = self.businesses.document(document_id(bid, "Business not found."))
        return self.owned(ref.get(transaction=transaction), uid)

    @staticmethod
    def present(bid: str, data: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": bid,
            "fields": data["fields"],
            "revision": data["revision"],
            "registration": data["status"],
            "public": bool(data.get("public")),
            "google_publication": "not_connected",
        }

    def list_businesses(self, uid: str) -> list[dict[str, Any]]:
        query = self.businesses.where(filter=FieldFilter("owners", "array_contains", uid))
        rows = [(snapshot.id, snapshot.to_dict() or {}) for snapshot in query.limit(50).stream()]
        rows.sort(key=lambda row: (row[1].get("created", 0), row[0]))
        return [self.present(bid, data) for bid, data in rows]

    def context(self, uid: str, bid: str | None) -> dict[str, Any]:
        person = self.person_ref(uid).get().to_dict() or {}
        business = self.present(bid, self.owned_business(uid, bid)) if bid else None
        return {
            "business": business,
            "inventory": self.inventory(uid, bid) if bid else [],
            "person_verification": person.get("verification", "not_enrolled"),
        }

    def inventory(self, uid: str, bid: str) -> list[dict[str, Any]]:
        self.owned_business(uid, bid)
        ref = self.businesses.document(document_id(bid, "Business not found."))
        rows = [
            (snapshot.id, snapshot.to_dict() or {})
            for snapshot in ref.collection("inventory").limit(500).stream()
        ]
        rows.sort(key=lambda row: (row[1].get("created", 0), row[0]))
        return [{"id": pid, **data["fields"]} for pid, data in rows]

    def propose(self, uid: str, request: ProposalRequest) -> dict[str, Any]:
        validate_proposal(request)
        if request.business_id:
            current = self.owned_business(uid, request.business_id)
            if current["revision"] != request.revision:
                raise HTTPException(409, "The business changed. Reload before reviewing.")
        elif request.revision != 0:
            raise HTTPException(409, "A new business starts at revision zero.")
        payload, text, digest = seal_proposal(request)
        pid = str(uuid4())
        expires = time.time() + PROPOSAL_SECONDS
        self.proposals.document(pid).create(
            {"uid": uid, "payload": text, "digest": digest, "expires": expires, "receipt": None}
        )
        return {"id": pid, "digest": digest, "expires": expires, "snapshot": payload}

    def commit(self, uid: str, pid: str, digest: str) -> dict[str, Any]:
        proposal_ref = self.proposals.document(document_id(pid, "Proposal not found."))

        @firestore.transactional
        def run(transaction: Any) -> dict[str, Any]:
            snapshot = proposal_ref.get(transaction=transaction)
            proposal = snapshot.to_dict() if snapshot.exists else None
            if not proposal or proposal["uid"] != uid:
                raise HTTPException(404, "Proposal not found.")
            if not secrets.compare_digest(proposal["digest"], digest):
                raise HTTPException(409, "Review the exact proposal before saving.")
            if proposal["receipt"]:
                return dict(json.loads(proposal["receipt"]))
            if proposal["expires"] < time.time():
                raise HTTPException(409, "Review expired; prepare a new proposal.")
            data = json.loads(proposal["payload"])
            bid = data["business_id"]
            business_ref = self.businesses.document(bid)
            business = business_ref.get(transaction=transaction)
            if business.exists:
                if self.owned(business, uid)["revision"] != data["revision"]:
                    raise HTTPException(409, "The business changed; review again.")
            elif data["kind"] != "business" or data["revision"] != 0:
                raise HTTPException(404, "Business not found.")
            now = time.time()
            # Firestore transactions require every read before the first write.
            items = [
                business_ref.collection("inventory").document(
                    product_key(product["name"], product["unit"])
                )
                for product in data["products"]
            ]
            existing = {ref.id: ref.get(transaction=transaction) for ref in items}
            if data["kind"] == "business" and business.exists:
                transaction.update(
                    business_ref, {"fields": data["business"], "revision": data["revision"] + 1}
                )
            elif data["kind"] == "business":
                transaction.create(
                    business_ref,
                    {
                        "fields": data["business"],
                        "revision": 1,
                        "status": "draft",
                        "owners": [uid],
                        "public": False,
                        "created": now,
                    },
                )
            else:
                transaction.update(business_ref, {"revision": data["revision"] + 1})
            # Inventory proposals, or a brand-new shop arriving with its menu.
            for ref, product in zip(items, data["products"], strict=True):
                prior = existing[ref.id]
                created = (prior.to_dict() or {}).get("created", now) if prior.exists else now
                transaction.set(ref, {"fields": product, "created": created, "updated": now})
            receipt = {
                "business_id": bid,
                "revision": data["revision"] + 1,
                "receipt_id": str(uuid4()),
                "google_publication": "not_connected",
            }
            transaction.update(proposal_ref, {"receipt": json.dumps(receipt)})
            return receipt

        return run(self.client.transaction())

    def challenge(self, uid: str, bid: str) -> dict[str, Any]:
        business_ref = self.businesses.document(document_id(bid, "Business not found."))
        cid = str(uuid4())
        prompts = challenge_prompts()
        expires = time.time() + CHALLENGE_SECONDS

        @firestore.transactional
        def run(transaction: Any) -> None:
            self.owned(business_ref.get(transaction=transaction), uid)
            transaction.create(
                self.challenges.document(cid),
                {
                    "uid": uid,
                    "business_id": business_ref.id,
                    "prompts": prompts,
                    "expires": expires,
                    "consumed": False,
                    "result": None,
                },
            )
            transaction.update(business_ref, {"status": "verification_pending"})

        run(self.client.transaction())
        return {
            "id": cid,
            "prompts": prompts,
            "expires": expires,
            "max_seconds": 8,
            "max_bytes": 8 * 1024 * 1024,
        }

    def consume(self, uid: str, cid: str) -> dict[str, Any]:
        ref = self.challenges.document(document_id(cid, "Challenge not found."))

        @firestore.transactional
        def run(transaction: Any) -> dict[str, Any]:
            snapshot = ref.get(transaction=transaction)
            row = snapshot.to_dict() if snapshot.exists else None
            if not row or row["uid"] != uid:
                raise HTTPException(404, "Challenge not found.")
            if row["consumed"] or row["expires"] < time.time():
                raise HTTPException(409, "Challenge expired or already used. Retry the scan.")
            self.owned(
                self.businesses.document(row["business_id"]).get(transaction=transaction), uid
            )
            transaction.update(ref, {"consumed": True})
            return {"business_id": row["business_id"], "prompts": row["prompts"]}

        return run(self.client.transaction())

    def challenge_row(self, uid: str, cid: str) -> tuple[Any, dict[str, Any]]:
        ref = self.challenges.document(document_id(cid, "Challenge not found."))
        snapshot = ref.get()
        row = snapshot.to_dict() if snapshot.exists else None
        if not row or row["uid"] != uid:
            raise HTTPException(404, "Challenge not found.")
        return ref, row

    def face_result(self, uid: str, cid: str, result: dict[str, Any]) -> None:
        ref, _ = self.challenge_row(uid, cid)
        ref.update({"result": result})
        self.person_ref(uid).set({"verification": "review_pending"}, merge=True)

    def result(self, uid: str, cid: str) -> dict[str, Any]:
        _, row = self.challenge_row(uid, cid)
        return dict(row["result"]) if row["result"] else {"status": "awaiting_capture"}

    def invalidate_face(self, uid: str) -> None:
        self.person_ref(uid).set({"verification": "not_enrolled"}, merge=True)
        batch = self.client.batch()
        owned = self.businesses.where(filter=FieldFilter("owners", "array_contains", uid))
        for snapshot in owned.limit(50).stream():
            batch.update(snapshot.reference, {"status": "verification_pending"})
        for snapshot in self.challenges.where(filter=FieldFilter("uid", "==", uid)).stream():
            batch.delete(snapshot.reference)
        batch.commit()

    def consent(self, uid: str) -> dict[str, Any] | None:
        record = (self.person_ref(uid).get().to_dict() or {}).get("consent")
        return dict(record) if record else None

    def record_consent(self, uid: str, version: str) -> dict[str, Any]:
        record = {"version": version, "accepted": time.time()}
        self.person_ref(uid).set({"consent": record}, merge=True)
        return record

    def erase_owner(self, uid: str) -> list[str]:
        refs: list[Any] = []
        owned = []
        query = self.businesses.where(filter=FieldFilter("owners", "array_contains", uid))
        for snapshot in query.stream():
            owned.append(snapshot.id)
            refs += [item.reference for item in snapshot.reference.collection("inventory").stream()]
            refs += [
                item.reference for item in snapshot.reference.collection("google_sim").stream()
            ]
            refs += [item.reference for item in snapshot.reference.collection("planning").stream()]
            for collection in ("inquiries", "inquiry_dedupe"):
                refs += [
                    item.reference for item in snapshot.reference.collection(collection).stream()
                ]
            refs.append(snapshot.reference)
        for collection in (self.proposals, self.challenges):
            refs += [
                s.reference for s in collection.where(filter=FieldFilter("uid", "==", uid)).stream()
            ]
        refs.append(self.person_ref(uid))
        for start in range(0, len(refs), 400):  # Firestore batches accept up to 500 writes.
            batch = self.client.batch()
            for ref in refs[start : start + 400]:
                batch.delete(ref)
            batch.commit()
        return owned

    def set_availability(
        self, uid: str, bid: str, product_id: str, available: bool
    ) -> dict[str, Any]:
        business_ref = self.businesses.document(document_id(bid, "Business not found."))
        if not re.fullmatch(r"[0-9a-f]{64}", product_id):
            raise HTTPException(404, "Product not found.")
        item_ref = business_ref.collection("inventory").document(product_id)

        @firestore.transactional
        def run(transaction: Any) -> dict[str, Any]:
            business = self.owned(business_ref.get(transaction=transaction), uid)
            item = item_ref.get(transaction=transaction)
            if not item.exists:
                raise HTTPException(404, "Product not found.")
            fields = {**(item.to_dict() or {})["fields"], "available": available}
            transaction.update(item_ref, {"fields": fields, "updated": time.time()})
            transaction.update(business_ref, {"revision": business["revision"] + 1})
            return {"id": product_id, **fields, "revision": business["revision"] + 1}

        return run(self.client.transaction())

    def share(self, uid: str, bid: str, public: bool) -> dict[str, Any]:
        ref = self.businesses.document(document_id(bid, "Business not found."))
        self.owned(ref.get(), uid)
        ref.update({"public": public})
        return {"business_id": ref.id, "public": public}

    def shared_shops(self) -> list[dict[str, Any]]:
        from google.cloud.firestore_v1.base_query import FieldFilter

        rows = self.businesses.where(filter=FieldFilter("public", "==", True)).stream()
        return [shop for row in rows if (shop := self.public_shop(row.id)) is not None]

    def public_shop(self, bid: str) -> dict[str, Any] | None:
        try:
            ref = self.businesses.document(document_id(bid, "Not found."))
        except HTTPException:
            return None
        snapshot = ref.get()
        data = snapshot.to_dict() if snapshot.exists else None
        if not data or not data.get("public"):
            return None
        rows = [s.to_dict() or {} for s in ref.collection("inventory").limit(500).stream()]
        rows.sort(key=lambda row: row.get("created", 0))
        return public_projection(ref.id, data["fields"], [row["fields"] for row in rows])

    # Contact records never enter public projections, ADK tools or merchant revisions.
    def add_inquiry(self, bid: str, body: InquiryInput) -> InquiryReceipt:
        business = self.businesses.document(document_id(bid, "This shop page is not available."))
        dedupe = business.collection("inquiry_dedupe").document(inquiry_key(body))
        ref = business.collection("inquiries").document(str(uuid4()))

        @firestore.transactional
        def run(transaction: Any) -> InquiryReceipt:
            shop = business.get(transaction=transaction).to_dict() or {}
            if not shop.get("public"):
                raise HTTPException(404, "This shop page is not available.")
            prior = dedupe.get(transaction=transaction).to_dict() or {}
            now = time.time()
            if prior.get("created", 0) > now - 120:
                return InquiryReceipt(id=prior["id"])
            record = Inquiry(id=ref.id, **body.model_dump(), created=now)
            transaction.create(ref, record.model_dump())
            transaction.set(dedupe, {"id": ref.id, "created": now})
            return InquiryReceipt(id=ref.id)

        with self.inquiry_lock:
            return run(self.client.transaction())

    def inquiries(self, uid: str, bid: str) -> list[Inquiry]:
        self.owned_business(uid, bid)
        query = (
            self.businesses.document(document_id(bid, "Business not found."))
            .collection("inquiries")
            .order_by("created", direction=firestore.Query.DESCENDING)
            .limit(100)
        )
        return [Inquiry.model_validate(snapshot.to_dict()) for snapshot in query.stream()]

    def complete_inquiry(self, uid: str, bid: str, iid: str) -> Inquiry:
        business = self.businesses.document(document_id(bid, "Business not found."))
        ref = business.collection("inquiries").document(document_id(iid, "Message not found."))

        @firestore.transactional
        def run(transaction: Any) -> Inquiry:
            self.owned(business.get(transaction=transaction), uid)
            snapshot = ref.get(transaction=transaction)
            if not snapshot.exists:
                raise HTTPException(404, "Message not found.")
            record = Inquiry.model_validate(snapshot.to_dict()).model_copy(update={"done": True})
            transaction.update(ref, {"done": True})
            return record

        return run(self.client.transaction())

    def planning(
        self, uid: str, bid: str, pid: str, action: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        from datetime import date

        from .planning import change

        business_ref = self.businesses.document(document_id(bid, "Business not found."))
        if not re.fullmatch(r"[0-9a-f]{64}", pid):
            raise HTTPException(404, "Product not found.")
        item_ref = business_ref.collection("inventory").document(pid)
        ref = business_ref.collection("planning").document(pid)

        @firestore.transactional
        def run(transaction: Any) -> dict[str, Any]:
            business = self.owned(business_ref.get(transaction=transaction), uid)
            if not item_ref.get(transaction=transaction).exists:
                raise HTTPException(404, "Product not found.")
            change_payload = payload
            state = ref.get(transaction=transaction).to_dict() or {}
            if action != "read":
                if action == "prepare":
                    change_payload = {
                        **payload,
                        "business_id": bid,
                        "product_id": pid,
                        "revision": business["revision"],
                    }
                elif (
                    state.get("pending", {}).get("snapshot", {}).get("revision")
                    != business["revision"]
                ):
                    raise HTTPException(409, "Business changed. Review planning again.")
                state = change(state, action, change_payload, date.today())
                transaction.set(ref, state)
            return dict(state)

        return run(self.client.transaction())
