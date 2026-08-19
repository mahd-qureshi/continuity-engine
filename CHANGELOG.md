# Changelog

## 0.2.0 — 2026-08-19

Ships the four items listed under "Next" in the 0.1.0 README.

### Added

- Scenario validation at the boundary (`src/validate.js`): structural checks,
  duplicate ids, unknown metrics and operators, plus interval-based
  reachability analysis that flags content gated behind a value the scenario
  can never produce.
- `npm run validate`, wired into `npm run verify`, so dead content fails the
  build.
- A property-based testing harness (`tests/support/property.js`) with seeded
  generation and shrinking, and nine engine invariants over generated
  scenarios.
- Replay export and import (`src/replay.js`) with an integrity fingerprint that
  detects engine drift rather than silently loading a stale file.
- Share codes: because the engine is deterministic, a playthrough encodes to
  its choice ids alone and everything else is recomputed.
- A "Copy share link" button and `?replay=` support in the demo. The URL tracks
  the story as it advances.
- A weight-sensitivity experiment (`npm run experiment`) and its findings in
  `docs/experiments/weight-sensitivity.md`.

### Changed

- `METRIC_RANGES` is exported, so validation can reason about metric bounds.

## 0.1.0 — 2026-07-23

### Added

- Event-sourced character and relationship state.
- Canonical, immutable event replay with chronology validation.
- Emotional decay toward a configurable baseline.
- Explainable memory scoring with diversity selection.
- Prior-turn-only memory recall with duplicate-content filtering.
- Constrained three-beat narrative planning.
- One-time narrative choice enforcement.
- Original interactive orbital-relay scenario.
- Browser inspector for memory, planning, and rejected candidates.
- Determinism, bounds, eligibility, immutability, static UI, and error-path
  checks.
