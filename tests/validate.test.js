import test from "node:test";
import assert from "node:assert/strict";

import {
  assertValidScenario,
  reachableBounds,
  validateScenario,
} from "../src/validate.js";
import { orbitalRelay } from "../src/scenario.js";

/** The shipped scenario, with one surgical change, for negative cases. */
function mutate(change) {
  const copy = structuredClone(orbitalRelay);
  change(copy);
  return copy;
}

function codes(result) {
  return result.diagnostics.map((entry) => entry.code).sort();
}

test("the shipped scenario is clean", () => {
  const result = validateScenario(orbitalRelay);

  assert.equal(result.ok, true);
  assert.deepEqual(result.diagnostics, []);
});

test("a scenario that is not an object is rejected without throwing", () => {
  for (const value of [null, undefined, 42, "scenario", []]) {
    const result = validateScenario(value);
    assert.equal(result.ok, false);
  }
});

test("missing top-level fields are all reported in one pass", () => {
  const result = validateScenario({ id: "empty" });

  const missing = result.errors
    .filter((entry) => entry.code === "missing-field")
    .map((entry) => entry.path);

  // The point of collecting rather than throwing: one run, every problem.
  assert.ok(missing.length >= 7, `expected many missing fields, got ${missing.length}`);
  assert.ok(missing.includes("beats"));
  assert.ok(missing.includes("goal"));
});

test("duplicate ids are caught, because find() would silently ignore them", () => {
  const result = validateScenario(
    mutate((scenario) => {
      scenario.beats[1].id = scenario.beats[0].id;
    }),
  );

  assert.equal(result.ok, false);
  assert.ok(codes(result).includes("duplicate-id"));
});

test("an unknown metric is an error wherever it appears", () => {
  const inDelta = validateScenario(
    mutate((scenario) => {
      scenario.choices[0].deltas.charisma = 0.2;
    }),
  );
  const inConstraint = validateScenario(
    mutate((scenario) => {
      scenario.beats[0].requires = [{ metric: "charisma", operator: ">=", value: 0.5 }];
    }),
  );

  assert.ok(codes(inDelta).includes("unknown-metric"));
  assert.ok(codes(inConstraint).includes("unknown-metric"));
});

test("a threshold outside the metric range can never be satisfied", () => {
  const result = validateScenario(
    mutate((scenario) => {
      // trust is bounded 0..1, so this is a typo, not a design choice.
      scenario.beats[0].requires = [{ metric: "trust", operator: ">=", value: 2 }];
    }),
  );

  assert.equal(result.ok, false);
  assert.ok(codes(result).includes("impossible-constraint"));
});

test("an unknown operator is reported rather than reaching the engine", () => {
  const result = validateScenario(
    mutate((scenario) => {
      scenario.beats[0].requires = [{ metric: "trust", operator: "=>", value: 0.5 }];
    }),
  );

  assert.ok(codes(result).includes("unknown-operator"));
});

test("content gated behind an unreachable value is flagged as dead", () => {
  const bounds = reachableBounds(orbitalRelay);

  // affect.control tops out well below 1 in this scenario, so a beat demanding
  // more than its ceiling can never fire.
  assert.ok(bounds["affect.control"].maximum < 1);

  const result = validateScenario(
    mutate((scenario) => {
      scenario.beats[0].requires = [
        { metric: "affect.control", operator: ">=", value: 0.99 },
      ];
    }),
  );

  const unreachable = result.warnings.filter((entry) => entry.code === "unreachable");

  assert.equal(unreachable.length, 1);
  // A warning, not an error: the scenario still runs, it just has dead content.
  assert.equal(result.ok, true);
});

test("a reachable constraint is not flagged", () => {
  const result = validateScenario(
    mutate((scenario) => {
      scenario.beats[0].requires = [{ metric: "trust", operator: ">=", value: 0.5 }];
    }),
  );

  assert.deepEqual(
    result.warnings.filter((entry) => entry.code === "unreachable"),
    [],
  );
});

test("a goal the state can never reach is flagged", () => {
  const result = validateScenario(
    mutate((scenario) => {
      scenario.goal["affect.control"] = 0.99;
    }),
  );

  assert.ok(codes(result).includes("unreachable-goal"));
});

test("reachable bounds never exceed the metric's own range", () => {
  const bounds = reachableBounds(orbitalRelay);

  for (const [metric, band] of Object.entries(bounds)) {
    assert.ok(band.minimum <= band.maximum, `${metric} bounds are inverted`);
  }

  assert.ok(bounds.trust.minimum >= 0);
  assert.ok(bounds.trust.maximum <= 1);
  assert.ok(bounds["affect.valence"].minimum >= -1);
});

test("a memory with no tags warns without failing", () => {
  const result = validateScenario(
    mutate((scenario) => {
      scenario.memories[0].tags = [];
    }),
  );

  assert.equal(result.ok, true);
  assert.ok(codes(result).includes("no-tags"));
});

test("out-of-range memory intensity is an error", () => {
  const result = validateScenario(
    mutate((scenario) => {
      scenario.memories[0].intensity = 1.5;
    }),
  );

  assert.equal(result.ok, false);
  assert.ok(codes(result).includes("range"));
});

test("assertValidScenario passes the real scenario and throws on a broken one", () => {
  assert.doesNotThrow(() => assertValidScenario(orbitalRelay));

  assert.throws(
    () =>
      assertValidScenario(
        mutate((scenario) => {
          scenario.beats[0].requires = [{ metric: "trust", operator: ">=", value: 9 }];
        }),
      ),
    /is invalid/,
  );
});

test("warnings alone do not throw", () => {
  assert.doesNotThrow(() =>
    assertValidScenario(
      mutate((scenario) => {
        scenario.memories[0].tags = [];
      }),
    ),
  );
});
