"""OB-273 helper for tests/share-seo.spec.ts: seed one shared shop with a full home address
into a fresh local SQLite file (argv[1]) and print its ID. Local test data only."""

import sys

from app.merchant import BusinessFields, MerchantStore, ProductFields, ProposalRequest

store = MerchantStore(sys.argv[1])
proposal = store.propose(
    "seo-owner",
    ProposalRequest(
        kind="business",
        business=BusinessFields(
            name="Meena Home Bakes",
            location="Block 412 Bedok North Ave 2 #05-123, Singapore 460412",
            phone="+65 8123 4567",
            lat=1.3329,
            lng=103.9312,
        ),
        products=[ProductFields(name="Pineapple tart", price=150, unit="piece")],
    ),
)
bid = store.commit("seo-owner", proposal["id"], proposal["digest"])["business_id"]
store.share("seo-owner", bid, True)
print(bid)
