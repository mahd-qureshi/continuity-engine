# Continuity Engine

> A deterministic character-continuity engine for interactive stories that
> remembers choices, updates emotional state, and explains what should happen
> next.

**Status:** v0.1 experiment · framework-free · zero API calls

**[Open the live demo](https://mahd-qureshi.github.io/continuity-engine/)**

Many AI character prototypes delegate memory and narrative decisions to a
model, making the resulting path difficult to replay or inspect. I built
Continuity Engine to explore a narrower question:

> Can character continuity be small, deterministic, and inspectable?

The included five-minute scene follows two people repairing a failing orbital
relay. Every choice becomes an immutable event. The engine recalls relevant but
non-duplicative memories, updates the character and relationship state, and
uses constrained beam search to propose a three-beat narrative path.

The same events always produce the same result.

## Try it

No installation or API key is required.

```bash
python3 -m http.server 4173
```

Open [http://localhost:4173](http://localhost:4173), make a choice, and expand
the decision trace.

Run the engineering checks:

```bash
npm run verify
```

Node.js 20 or newer is required for the test runner. The browser demo has no
runtime dependencies.

## The interesting parts

### 1. Event-sourced state

Choices and selected story beats are immutable events. Current state is rebuilt
by replaying them, which makes a path reproducible and debuggable instead of
quietly mutable.

### 2. Emotional decay

Valence, arousal, and control move toward a character-specific baseline over
simulated time:

```text
state(t) = baseline + (previous - baseline) × e^(-decay × elapsed)
```

### 3. Diverse memory retrieval

Each eligible prior memory receives an explicit relevance score:

```text
.40 tag similarity
+.25 recency
+.20 emotional intensity
+.15 relationship relevance
```

Maximal Marginal Relevance then penalizes memories that repeat information
already selected. The current action cannot be “recalled” until a later turn.

### 4. Constrained story planning

Story beats declare preconditions and state transitions. A bounded beam search
tests valid sequences against a target dramatic state, using deterministic
tie-breaking when scores match.

```text
choice
  → immutable event
  → replayed character state
  → ranked memories
  → constrained three-beat plan
  → selected beat event
  → inspectable next state
```

Read the [algorithm notes](docs/algorithms.md) and
[architecture](docs/architecture.md) for the exact scoring rules, complexity,
and boundaries.

## Repository shape

```text
src/
  engine.js      pure domain algorithms
  scenario.js    original story data
  app.js         browser adapter and rendering
  styles.css     responsive visual system
tests/
  engine.test.js deterministic and invariant checks
docs/
  algorithms.md
  architecture.md
  adr/
```

The engine imports no browser, storage, network, or UI code. Time is an explicit
event property. Scenario content is data.

## Evidence

- Nineteen deterministic engine and browser-contract checks.
- Explicit checks for bounded emotional and relationship state.
- Duplicate-ID and duplicate-content memory filtering.
- Planner preconditions and one-use beats enforced.
- One-time narrative choices become unavailable after use.
- Identical choice sequences produce identical state and explanations.
- Canonical, deeply frozen events resist forged or accidental mutation.
- Syntax and test checks run in GitHub Actions.
- Keyboard-accessible controls and reduced-motion support.

## What this does not solve

- It is not a dialogue generator or chatbot.
- Tags are authored, not embedded.
- The planner optimizes a deliberately small numeric dramatic state.
- One original scenario is included; there is no scenario editor.
- State is local to the page and disappears on refresh.

Version 0.1 keeps the problem deliberately small: one authored scenario,
explicit state, and decisions you can inspect.

## Decisions

- [Use a deterministic core instead of an LLM](docs/adr/001-deterministic-core.md)
- [Use events instead of mutable session state](docs/adr/002-event-sourced-state.md)

## Next

- Validate scenario data at the boundary.
- Add property-based tests for planner invariants.
- Export and import replay files.
- Measure how different scoring weights alter perceived continuity.

## License

[MIT](LICENSE). The story, characters, and interface are original.
