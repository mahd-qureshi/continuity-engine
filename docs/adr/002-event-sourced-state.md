# ADR 002: Derive state from immutable events

- **Status:** accepted
- **Date:** 2026-07-23

## Context

Interactive stories accumulate many small state changes. Mutating a shared
session object is concise at first but makes incorrect transitions difficult to
trace and exact replay difficult to guarantee.

## Decision

Choices and selected beats are stored as immutable events. Current state is
derived by replaying the event sequence from the scenario's initial state.

## Consequences

### Positive

- A story path is reproducible from data.
- Bugs can be attached to the exact event that introduced them.
- Reset, replay, branching, and future save-file export have a clear model.
- Tests can compare complete paths without mocking hidden state.

### Negative

- Replay work grows with the event list.
- Event shapes become a compatibility boundary once save files exist.
- Events must include elapsed time instead of reading the system clock.

## Rejected alternative

Mutable in-memory state would be sufficient for the five-turn demo, but it
would remove the project's strongest guarantee. Snapshots can be introduced
later if replay cost becomes measurable.
