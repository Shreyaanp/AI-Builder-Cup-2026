from types import SimpleNamespace

import pytest

from app.agent import rename_call

SAVED = SimpleNamespace(business_id="b1")


@pytest.mark.parametrize(
    ("text", "name"),
    [
        ("Rename my shop to Chai Point", "Chai Point"),
        ("please change my shop name to Chai Point.", "Chai Point"),
        ('update the store name to "Chai Point"', "Chai Point"),
        ("my shop name is now Chai Point", "Chai Point"),
        ("dukaan ka naam Masala Chai karo", "Masala Chai"),
        ("dukaan ka naam: Masala Chai", "Masala Chai"),
    ],
)
def test_rename_phrases_prepare_a_name_only_edit(text: str, name: str) -> None:
    call = rename_call(text, SAVED)
    assert call is not None and call.function_call is not None
    assert call.function_call.name == "propose_business"
    assert call.function_call.args == {"name": name}


@pytest.mark.parametrize(
    "text",
    ["Kopi is two dollars now", "rename my shop to " + "x" * 81, "what is my shop name?", "hello"],
)
def test_other_messages_are_not_renames(text: str) -> None:
    assert rename_call(text, SAVED) is None


def test_no_rename_without_a_saved_shop() -> None:
    assert rename_call("rename my shop to Chai Point", SimpleNamespace(business_id=None)) is None
