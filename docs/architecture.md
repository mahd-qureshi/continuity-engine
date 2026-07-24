# Architecture

## System boundary

Continuity Engine is a static browser application with a pure domain core.
There is no backend, database, model provider, analytics collector, or
persistence layer.

```text
┌─────────────── Browser adapter ───────────────┐
│                                               │
│  choice controls                     inspector│
│         │                                ▲    │
└─────────┼────────────────────────────────┼────┘
          ▼                                │
┌──────────────── Domain engine ───────────┴────┐
│                                              │
│  choice event → replay → memory rank → plan  │
│       ▲                              │       │
│       └──────── selected beat event ─┘       │
└───────────────────┬──────────────────────────┘
                    │ reads
            ┌───────▼────────┐
            │ scenario data  │
            └────────────────┘
```

## Modules

### `src/engine.js`

Owns all domain behavior:

- numeric clamping and affect decay
- event replay
- memory scoring and diversity selection
- beat eligibility
- bounded beam search
- state fingerprints

It has no reference to the DOM, browser storage, time-of-day, randomness,
networking, or the included scenario.

### `src/scenario.js`

Contains one original fictional scenario as data:

- initial character and relationship state
- emotional baseline
- memories
- user choices and their state deltas
- story beats, preconditions, and state transitions
- target dramatic state

The engine receives this object as an argument rather than importing it.

### `src/app.js`

Adapts the domain result to the browser. It owns:

- button events
- accessible DOM rendering
- metric visualization
- reset and keyboard interaction

It does not calculate memory or story scores.

## State lifecycle

1. `startScenario` replays an empty event list.
2. Eligible memories are collected from history before the new choice.
3. A user choice is converted into a minimal `choice` event.
4. `replayEvents` validates and canonicalizes the event, then derives a
   provisional state.
5. Prior memories are scored against the choice context and diversified with
   MMR.
6. The planner searches eligible story-beat sequences.
7. The first beat in the winning path becomes a minimal `beat` event.
8. The complete event list is replayed into the next state.
9. The UI renders the result and its explanation.

No function silently mutates the caller's state.

## Determinism

Determinism comes from four constraints:

- time is explicit (`elapsedTime` on each event)
- there is no ambient randomness
- ties are ordered by stable identifiers
- state is reconstructed from canonical, deeply frozen events

This makes a serialized event list sufficient to reproduce a story path.

## Failure behavior

The engine throws on unknown event sources, choices, state metrics, comparison
operators, chronology errors, repeated one-time events, forged cached state,
and invalid search or retrieval options. Impossible beat constraints are
returned as explanation data rather than swallowed.

Scenario-schema validation is an intentional next step. Version 0.1 trusts the
bundled, tested scenario at its input boundary.

## Security and privacy

The application sends no data anywhere. It has no user accounts, cookies,
storage, third-party scripts, or API calls. Refreshing the page removes the
current story path.
