# Continuity Engine

> A deterministic character-continuity engine for interactive stories that
> remembers choices, updates emotional state, and explains what should happen
> next.

**Status:** v0.2 experiment · framework-free · zero API calls

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

## What 0.2 added

The 0.1 README listed four things as next. All four are in.

### Scenario validation at the boundary

`validateScenario` collects every problem in one pass instead of throwing on
the first. Beyond types and duplicate ids, it computes an interval
over-approximation of what each metric can ever reach, and flags content gated
behind a value the scenario cannot produce:

```text
warn  beats[3].requires[0]  affect.control can only reach 0.22..0.7 in this
                            scenario, so "affect.control >= 0.99" never holds
                            and this content is dead.
```

The approximation is unsound in one direction only: it can call a value
reachable when no legal path reaches it, but never the reverse. So a warning is
always a real problem. `npm run validate` runs it in CI.

### Property-based tests

The engine is pure and deterministic, so invariants can be checked over
generated inputs rather than hand-picked examples — that the planner never
schedules an ineligible beat, that a plan never exceeds its horizon, that
applied deltas always land inside their declared range, that affect never
overshoots its baseline.

The harness is ~150 lines with no dependency. It seeds every run so failures
reproduce, and shrinks counterexamples by bisection rather than decrement,
which is the difference between reporting `844` and reporting the actual
boundary at `500`.

### Replay files and share codes

A replay file carries every event plus a fingerprint of the final state, so a
future engine that replays those events differently is detected instead of
quietly loading.

Share codes carry **only the choice ids**. Beats, memories, and affect are all
recomputed, so a whole playthrough fits in a URL — and that only works because
the engine is deterministic. The demo keeps `?replay=` in the address bar as
you play. A hand-edited link cannot reach a state a real playthrough could not.

### Weight sensitivity

Of 286 weightings on a simplex grid, only 5.2% reproduce the default recall,
and tag overlap is by far the most stable component. Full write-up in
[docs/experiments/weight-sensitivity.md](docs/experiments/weight-sensitivity.md).

## Next

- Score recall against human judgements rather than against the default.
- Support more than two characters in a scene.

## License

[MIT](LICENSE). The story, characters, and interface are original.
