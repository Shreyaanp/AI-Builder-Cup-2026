from google.genai import types

from app.agent import live_history, make_agent
from app.settings import Settings


def test_voice_history_drops_text_model_thoughts_but_keeps_the_conversation() -> None:
    """Regression: text-coach thought signatures in the shared history made the Live model
    reject every voice session (1007 "PassbackContext should be decrypted")."""
    history = [
        types.Content(role="user", parts=[types.Part(text="Kopi is $2 now")]),
        types.Content(
            role="model",
            parts=[
                types.Part(text="private reasoning", thought=True),
                types.Part(
                    function_call=types.FunctionCall(name="propose_products", args={}),
                    thought_signature=b"encrypted",
                ),
            ],
        ),
        types.Content(role="model", parts=[types.Part(text="hidden", thought=True)]),
        types.Content(
            role="model",
            parts=[types.Part(text="Prepared. Check and confirm.", thought_signature=b"x")],
        ),
    ]
    cleaned = live_history(history)
    assert [c.role for c in cleaned] == ["user", "model", "model"]  # thought-only turn dropped
    parts = [p for c in cleaned for p in c.parts or []]
    assert all(not p.thought and p.thought_signature is None for p in parts)
    assert parts[1].function_call and parts[1].function_call.name == "propose_products"
    assert parts[2].text == "Prepared. Check and confirm."
    assert history[1].parts and history[1].parts[1].thought_signature == b"encrypted"  # untouched


def test_voice_agent_sends_no_thinking_level_but_text_agent_keeps_it() -> None:
    """Regression: the Live model rejects a custom thinking level ("project is not allowlisted"),
    which ended every voice session immediately with "Voice connection ended"."""
    settings = Settings(_env_file=None)
    voice = make_agent(settings, live=True).generate_content_config
    text = make_agent(settings).generate_content_config
    assert voice is not None and voice.thinking_config is None
    assert text is not None and text.thinking_config is not None
    assert text.thinking_config.thinking_budget == 512
    # Both still get the same tools, so voice can prepare price and menu changes for review.
    assert [t.__name__ for t in make_agent(settings, live=True).tools] == [  # type: ignore[union-attr]
        t.__name__  # type: ignore[union-attr]
        for t in make_agent(settings).tools
    ]


def test_voice_starts_with_recent_turns_at_a_clean_owner_turn() -> None:
    from google.genai import types

    from app.agent import LIVE_HISTORY_TURNS

    def say(role: str, text: str) -> types.Content:
        return types.Content(role=role, parts=[types.Part(text=text)])

    call = types.Content(
        role="model",
        parts=[types.Part(function_call=types.FunctionCall(name="get_forecast", args={}))],
    )
    result = types.Content(
        role="user",
        parts=[
            types.Part(
                function_response=types.FunctionResponse(name="get_forecast", response={"ok": 1})
            )
        ],
    )
    history = [say("user", f"turn {i}") for i in range(40)] + [call, result, say("model", "done")]
    cleaned = live_history(history)
    assert len(cleaned) <= LIVE_HISTORY_TURNS
    first = cleaned[0]
    assert first.role == "user" and not any(p.function_response for p in first.parts or [])
    assert cleaned[-1].parts[0].text == "done"  # the newest turns are kept
