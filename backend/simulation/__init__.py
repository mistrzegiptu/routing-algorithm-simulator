"""Discrete-event simulation of routing algorithms.

Architecture (see docs/simulation-design.md for the full contract):

    NetworkSnapshot  -- immutable copy of devices_db/links_db (no side effects)
    RoutingAlgorithm -- plugin contract; new algorithms live in simulation/algorithms/
    SimulationEngine -- event-driven engine emitting SimEvents (pure generator)
    SimulationSession-- WebSocket playback layer (pacing, pause/step/speed)
"""

from . import algorithms  # noqa: F401  (imports register the built-in algorithms)
