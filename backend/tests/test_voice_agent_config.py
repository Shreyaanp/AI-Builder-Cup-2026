from app.agent import make_agent
from app.settings import Settings


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
