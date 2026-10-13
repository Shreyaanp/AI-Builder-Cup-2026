import inspect

from google.adk.agents.live_request_queue import LiveRequestQueue
from google.adk.agents.run_config import RunConfig
from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_response import LlmResponse
from google.adk.runners import Runner
from google.adk.sessions import DatabaseSessionService

for obj in [
    BaseLlm.generate_content_async,
    Runner.run_async,
    Runner.run_live,
    LiveRequestQueue.send_realtime,
    LiveRequestQueue.send_content,
    DatabaseSessionService.__init__,
]:
    print(obj.__qualname__, inspect.signature(obj))
print("RunConfig fields:", list(RunConfig.model_fields))
print("LlmResponse fields:", list(LlmResponse.model_fields))
print("Session close:", getattr(DatabaseSessionService, "close", None))
