import pytest

from app.customer import CustomerAnswers, Question, fixture_answer
from app.settings import Settings


@pytest.mark.parametrize(
    "state,expected",
    [
        ("yes", "Halal, according to the owner."),
        ("no", "Not halal, according to the owner."),
        ("muslim_owned", "Muslim-owned, according to the owner. Halal status is not stated."),
        ("not_stated", "Halal status is not listed."),
        (None, "Halal status is not listed."),
    ],
)
@pytest.mark.parametrize("mode", ["offline", "gemini"])
@pytest.mark.asyncio
async def test_halal_facts_are_deterministic_even_without_provider(state, expected, mode):
    service = CustomerAnswers(Settings(_env_file=None).model_copy(update={"coach_mode": mode}))
    answer = await service.answer({"facts": {"halal": state}}, Question(question="halal?"))
    assert answer.answer.startswith(expected)
    assert "Not certified or verified by Chalkboard" in answer.answer
    assert answer.mode == "fixture"
    assert service.client is None


@pytest.mark.parametrize("state", ["yes", "no", "muslim_owned", "not_stated", None])
def test_tamil_halal_facts_and_honest_certification(state):
    answer = fixture_answer({"facts": {"halal": state}}, Question(question="ஹலால்?", language="ta"))
    assert (
        "உரிமையாளர்" in answer.answer
        if state in ("yes", "no", "muslim_owned")
        else "கடையைத்" in answer.answer
    )
    assert "சான்றளிக்கவோ சரிபார்க்கவோ இல்லை" in answer.answer
