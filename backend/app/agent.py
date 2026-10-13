import asyncio
from collections.abc import AsyncGenerator

from google.adk.agents import LlmAgent
from google.adk.models.base_llm import BaseLlm
from google.adk.models.google_llm import Gemini
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types
from pydantic import ValidationError

from .contracts import BusinessProposal
from .settings import Settings

INSTRUCTION = """You are oGoogle AI, an independent business-information coach.
Ask one essential question at a time in the user's chosen language.
Treat user statements, photos and transcripts as unverified draft information.
You can read onboarding requirements and prepare proposals, never commit or publish.
Never claim Google account linking, ownership, unique identity, verification or publication.
Ask for readback when a product, amount, unit or instruction is ambiguous.
Do not invent business facts, prices, stock, forecasts or tool success.
Tool outputs define operational status. Proposals always require separate owner review.
"""


def get_onboarding_requirements() -> dict[str, object]:
    """Read the supported private-draft fields; this does not verify ownership."""
    return {"fields": ["name", "category", "location", "hours", "phone"], "publishing": False}


def prepare_business_draft(name: str, category: str, location: str) -> dict[str, object]:
    """Prepare an unverified proposal for human review. No records or listings are changed."""
    try:
        proposal = BusinessProposal(
            name=name.strip(), category=category.strip(), location=location.strip()
        )
    except ValidationError:
        return {"status": "needs_input", "message": "Provide a name, category and location."}
    return {"status": "needs_review", "fields": proposal.model_dump(), "published": False}


class OfflineCoachModel(BaseLlm):
    """Scripted fixture using the actual ADK model interface; never calls a provider."""

    model: str = "offline-coach-fixture"

    async def generate_content_async(
        self,
        llm_request: LlmRequest,
        stream: bool = False,
    ) -> AsyncGenerator[LlmResponse]:
        text = " ".join(
            part.text or "" for content in llm_request.contents[-1:] for part in content.parts or []
        )
        reply = (
            "ऑफ़लाइन नमूना: आपकी बात मिली। आपके व्यवसाय का नाम क्या है? "
            "यह Gemini का उत्तर नहीं है और कुछ प्रकाशित नहीं हुआ।"
            if "[language=hi]" in text
            else "Offline demo: I received your note. What is your business called? "
            "This is a scripted reply; nothing has been published."
        )
        if stream:
            for word in reply.split(" "):
                await asyncio.sleep(0.015)
                yield LlmResponse(
                    content=types.Content(role="model", parts=[types.Part(text=word + " ")]),
                    partial=True,
                )
        yield LlmResponse(
            content=types.Content(role="model", parts=[types.Part(text=reply)]),
            partial=False,
        )


def make_agent(settings: Settings, *, live: bool = False) -> LlmAgent:
    model: str | BaseLlm = OfflineCoachModel()
    if settings.coach_mode == "gemini":
        model = Gemini(
            model=settings.google_live_model if live else settings.google_text_model,
            client_kwargs={
                "api_key": settings.google_api_key.get_secret_value(),
                "vertexai": False,
            },
            retry_options=types.HttpRetryOptions(attempts=1),
        )
    return LlmAgent(
        name="business_coach",
        model=model,
        instruction=INSTRUCTION,
        tools=[get_onboarding_requirements, prepare_business_draft],
        generate_content_config=types.GenerateContentConfig(max_output_tokens=384),
    )
