# ADR 001: Use a deterministic core instead of an LLM

- **Status:** accepted
- **Date:** 2026-07-23

## Context

The project asks whether character continuity can be inspectable. Calling an
LLM for every decision would make the most important behavior variable,
provider-dependent, and difficult to test.

## Decision

Version 0.1 uses explicit state transitions, memory scoring, constraints, and
bounded search. It performs no model or network calls.

## Consequences

### Positive

- Every result can be replayed and tested.
- Scoring and rejected alternatives are visible.
- The demo works offline and has no operating cost.
- Reviewers can inspect the actual intelligence of the system.

### Negative

- Dialogue and story beats must be authored.
- The state model is intentionally narrow.
- The engine cannot interpret arbitrary natural-language input.

## Rejected alternative

An LLM with a long system prompt would produce more varied prose quickly, but
it would answer a different question. A later adapter could verbalize an
already-selected beat without controlling state or planning.
