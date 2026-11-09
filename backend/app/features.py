"""Public, typed visibility switches. These never grant account/business authority."""

from pydantic import BaseModel, ConfigDict


class FeatureFlags(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    google_guide: bool = False
    guest_customer: bool = False
    # The face check is deferred (OB-269): off, nobody is offered it; earlier results stay.
    face_check: bool = False
    # OB-56: joins a guest's pre-#335 account into the new one. A production data move: off.
    guest_merge: bool = False
