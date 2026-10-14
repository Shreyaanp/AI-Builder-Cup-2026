from fastapi.testclient import TestClient

from app.tts import best_voice, language_for, speakable
from tests.test_photos import app, join  # noqa: F401  (fixture + consent helper)

VOICES = [
    ("en-US-Standard-A", ["en-US"]),
    ("en-US-Chirp3-HD-Achernar", ["en-US"]),
    ("ms-MY-Wavenet-A", ["ms-MY"]),
    ("ms-MY-Standard-A", ["ms-MY"]),
]


def test_language_follows_the_reply_script_then_the_app() -> None:
    assert language_for("मेरी दुकान पर चिकन हलाल है", "en") == "hi-IN"
    assert language_for("コーヒーは S$1.80 です", "en") == "ja-JP"
    assert language_for("咖椰吐司已售罄", "en") == "cmn-CN"
    assert language_for("Kopi sold out", "ms") == "ms-MY"
    assert language_for("Kopi sold out", "xx") == "en-US"


def test_best_voice_prefers_chirp_then_wavenet() -> None:
    assert best_voice(VOICES, "en-US") == "en-US-Chirp3-HD-Achernar"
    assert best_voice(VOICES, "ms-MY") == "ms-MY-Wavenet-A"
    assert best_voice(VOICES, "fr-FR") is None


def test_speakable_strips_formatting() -> None:
    assert speakable("**Kopi** is `S$1.80`\n\n> sold out") == "Kopi is S$1.80 sold out"


def test_offline_mode_tells_the_app_to_use_the_phone_voice(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        join(client)
        response = client.post("/api/v1/tts", json={"text": "Hello", "language": "en"})
        assert response.status_code == 204
        assert client.post("/api/v1/tts", json={"text": ""}).status_code == 422
