"""Live voice cost (OB-181): the token counts the provider reports, summed per voice socket for
the voice_closed log (counts only: no words, no phone numbers)."""

from google.genai import types


def add_usage(tokens: dict[str, int], usage: types.GenerateContentResponseUsageMetadata) -> None:
    """Add one Live usage report (the provider sends one per model turn)."""

    def add(key: str, count: int | None) -> None:
        if count:
            tokens[key] = tokens.get(key, 0) + count

    add("prompt", usage.prompt_token_count)
    add("response", usage.candidates_token_count)
    add("cached", usage.cached_content_token_count)
    add("total", usage.total_token_count)
    for side, details in (
        ("in", usage.prompt_tokens_details),
        ("out", usage.candidates_tokens_details),
    ):
        for detail in details or []:
            modality = (detail.modality.value if detail.modality else "other").lower()
            add(f"{side}_{modality}", detail.token_count)
