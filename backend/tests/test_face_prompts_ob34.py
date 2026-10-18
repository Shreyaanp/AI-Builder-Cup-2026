"""Regression OB-34: the face challenge always asks for two head movements."""

from app.merchant import challenge_prompts


def test_two_prompts_even_when_the_client_excludes_some():
    for exclude in (
        None,
        [],
        ["turn_left"],
        ["turn_left", "turn_right"],
        ["turn_left", "turn_right", "look_up"],
    ):
        for _ in range(30):
            prompts = challenge_prompts(exclude)
            assert len(prompts) == 2
            assert len(set(prompts)) == 2
            assert set(prompts) <= {"turn_left", "turn_right", "look_up"}


def test_exclusions_are_avoided_when_possible():
    for _ in range(30):
        assert "turn_left" not in challenge_prompts(["turn_left"])
