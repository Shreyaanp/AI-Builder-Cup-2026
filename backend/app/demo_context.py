"""Request-local service overrides for public demo tools; never mutate live globals."""

from collections.abc import Mapping
from contextvars import ContextVar
from types import MappingProxyType
from typing import Any

services: ContextVar[Mapping[str, Any]] = ContextVar("demo_services", default=MappingProxyType({}))
