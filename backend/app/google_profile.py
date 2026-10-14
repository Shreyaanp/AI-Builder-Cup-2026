"""Business Profile boundary. API access is pending; only the offline adapter exists."""

from typing import Protocol

from .google_sim import Scenario, SimAction, SimFacts, SimState, initial, step


class BusinessProfileAdapter(Protocol):
    def initial(self, facts: SimFacts, scenario: Scenario) -> SimState: ...

    def advance(self, state: SimState, action: SimAction) -> SimState: ...


class SimulatedBusinessProfile:
    """Fictional transitions only; never connects to Google or changes merchant records."""

    def initial(self, facts: SimFacts, scenario: Scenario) -> SimState:
        return initial(facts, scenario)

    def advance(self, state: SimState, action: SimAction) -> SimState:
        return step(state, action, state.scenario)
