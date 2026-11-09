"""OB-56: joining a pre-#335 guest account, which stays off unless GUEST_MERGE is set."""

from __future__ import annotations

from typing import Any

from app.community import Community, Profile, SqliteDocuments
from app.demo_uploads import BAKERY_ITEMS, RETAIL_ITEMS, SAMPLE_ITEMS, sample_items
from app.features import FeatureFlags
from app.guest_merge import merge_guest, merge_passport
from app.passport import PassportState, PassportStore, ShopProgress, StampRecord
from app.settings import Settings


def stamp(shop: str, day: str, points: int = 10, at: float = 1.0) -> StampRecord:
    return StampRecord(
        id=f"{shop}-{day}",
        shop_id=shop,
        kind="visit",
        day=day,
        week="2026-W40",
        at=at,
        points=points,
    )


def old_guest() -> PassportState:
    return PassportState(
        points=20,
        stamps=[stamp("chai", "2026-10-01"), stamp("bakery", "2026-10-02")],
        shops={
            "chai": ShopProgress(days=["2026-10-01"], visits=1, card=1),
            "bakery": ShopProgress(days=["2026-10-02"], visits=1, card=1),
        },
    )


def test_ob56_stamps_move_and_a_shared_day_counts_once() -> None:
    new = PassportState(
        points=10,
        stamps=[stamp("chai", "2026-10-01", at=2.0)],
        shops={"chai": ShopProgress(days=["2026-10-01"], visits=1, card=1)},
    )
    assert merge_passport(new, old_guest(), "old") is True
    assert sorted(s.shop_id for s in new.stamps) == ["bakery", "chai"]
    assert new.points == 20  # 10 of its own + only the bakery stamp, not chai again
    assert new.shops["bakery"].visits == 1
    assert new.shops["chai"].visits == 1


def test_ob56_the_same_guest_can_never_be_added_twice() -> None:
    new = PassportState()
    assert merge_passport(new, old_guest(), "old") is True
    points = new.points
    assert merge_passport(new, old_guest(), "old") is False
    assert new.points == points and len(new.stamps) == 2


def test_ob56_follows_and_passport_land_on_the_new_account(tmp_path: Any) -> None:
    docs = SqliteDocuments(str(tmp_path / "docs.sqlite3"))
    passports, community = PassportStore(docs), Community(docs)
    passports.edit("old", lambda state: state.__dict__.update(old_guest().__dict__))

    def follows(*ids: str) -> Any:
        def edit(profile: Profile) -> bool:
            profile.follows = list(ids)
            return True

        return edit

    community.edit_profile("old", follows("chai", "bakery"))
    community.edit_profile("new", follows("tailor", "chai"))
    result = merge_guest(passports, community, "old", "new")
    assert result == {"merged": True, "follows": 3, "stamps": 2}
    assert community.profile("new").follows == ["tailor", "chai", "bakery"]
    assert community.profile("old").follows == []
    assert passports.get("old").stamps == []
    # A retry after a lost response changes nothing.
    assert merge_guest(passports, community, "old", "new")["stamps"] == 2
    assert passports.get("new").points == 20


def test_ob56_the_production_data_move_is_off_by_default() -> None:
    assert Settings.model_fields["guest_merge"].default is False
    assert FeatureFlags().guest_merge is False


def test_ob269_the_face_check_is_not_offered_by_default() -> None:
    assert Settings.model_fields["feature_face_check"].default is False
    assert FeatureFlags().face_check is False


def test_ob271_samples_match_the_kind_of_shop() -> None:
    assert sample_items("Bakery") is BAKERY_ITEMS
    assert sample_items("Minimart") is RETAIL_ITEMS
    assert sample_items("Supermarket") is RETAIL_ITEMS
    assert sample_items("Tea stall") is SAMPLE_ITEMS
