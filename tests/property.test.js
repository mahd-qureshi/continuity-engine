//
//  property.test.js — invariants that must hold for every input, not just the
//  cases I thought of.
//
//  Scenarios are built deterministically from a generated spec, so shrinking a
//  failure shrinks the spec (fewer beats, smaller deltas) and reports a seed
//  that reproduces it exactly.
//

import test from "node:test";
import assert from "node:assert/strict";

import { forAll, gen } from "./support/property.js";
import {
  METRIC_RANGES,
  applyDeltas,
  decayAffect,
  evaluateBeatEligibility,
  planBeats,
  rankMemories,
  replayEvents,
  startScenario,
  stateFingerprint,
} from "../src/engine.js";
import { validateScenario } from "../src/validate.js";

const METRICS = Object.keys(METRIC_RANGES);

const specGen = gen.record({
  beatCount: gen.integer(1, 6),
  choiceCount: gen.integer(1, 4),
  memoryCount: gen.integer(0, 5),
  decayRate: gen.number(0, 1, 2),
  trust: gen.number(0, 1, 2),
  tension: gen.number(0, 1, 2),
  valence: gen.number(-1, 1, 2),
  arousal: gen.number(0, 1, 2),
  control: gen.number(0, 1, 2),
  horizon: gen.integer(1, 4),
  beamWidth: gen.integer(1, 4),
  scale: gen.number(0.02, 0.25, 2),
  gate: gen.number(0, 0.9, 2),
});

const TAG_POOL = ["trust", "fear", "repair", "archive", "promise", "loss"];

/** Deterministic scenario from a spec. No randomness beyond the spec itself. */
function buildScenario(spec) {
  const tagsAt = (index) => [
    TAG_POOL[index % TAG_POOL.length],
    TAG_POOL[(index + 2) % TAG_POOL.length],
  ];

  const deltasAt = (index) => {
    const metric = METRICS[index % METRICS.length];
    const other = METRICS[(index + 3) % METRICS.length];
    const sign = index % 2 === 0 ? 1 : -1;
    return { [metric]: spec.scale * sign, [other]: spec.scale * -sign * 0.5 };
  };

  return {
    id: "generated",
    title: "Generated",
    affectBaseline: { valence: 0, arousal: 0.4, control: 0.5 },
    affectDecayRate: spec.decayRate,
    initialState: {
      step: 0,
      trust: spec.trust,
      tension: spec.tension,
      affect: { valence: spec.valence, arousal: spec.arousal, control: spec.control },
    },
    goal: { trust: 0.6, tension: 0.5 },
    memories: Array.from({ length: spec.memoryCount }, (_, index) => ({
      id: `m${index}`,
      text: `Memory ${index}`,
      tags: tagsAt(index),
      createdAt: -index - 1,
      intensity: 0.5,
      relationship: 0.5,
    })),
    choices: Array.from({ length: spec.choiceCount }, (_, index) => ({
      id: `c${index}`,
      oneShot: index % 2 === 0,
      label: `Choice ${index}`,
      hint: "",
      tags: tagsAt(index),
      deltas: deltasAt(index),
      result: `Result ${index}`,
    })),
    beats: Array.from({ length: spec.beatCount }, (_, index) => ({
      id: `b${index}`,
      title: `Beat ${index}`,
      line: `Line ${index}`,
      tags: tagsAt(index + 1),
      oneShot: index % 3 !== 0,
      // Some beats are gated, so eligibility actually varies across the search.
      requires:
        index % 2 === 0 ? [] : [{ metric: "trust", operator: ">=", value: spec.gate }],
      deltas: deltasAt(index + 1),
    })),
  };
}

function planFor(spec) {
  const scenario = buildScenario(spec);
  const state = startScenario(scenario);
  const plan = planBeats(
    state,
    scenario.beats,
    ["trust", "repair"],
    scenario.goal,
    scenario,
    { horizon: spec.horizon, beamWidth: spec.beamWidth },
  );
  return { scenario, state, plan };
}

test("every generated scenario is structurally valid", () => {
  forAll(specGen, (spec) => {
    const result = validateScenario(buildScenario(spec));
    assert.deepEqual(result.errors, [], "generator produced an invalid scenario");
  });
});

test("the planner never schedules a beat that is ineligible when it runs", () => {
  forAll(specGen, (spec) => {
    const { scenario, state, plan } = planFor(spec);

    // Walk the plan forward exactly as the planner does: decay one step, then
    // apply the beat's deltas, then mark it used.
    let current = structuredClone(state);

    for (const step of plan.path) {
      const beat = scenario.beats.find((candidate) => candidate.id === step.id);
      assert.ok(beat, `plan referenced unknown beat ${step.id}`);

      const eligibility = evaluateBeatEligibility(current, beat);
      assert.equal(
        eligibility.eligible,
        true,
        `beat ${beat.id} was ineligible: ${eligibility.reasons.join(", ")}`,
      );

      current.affect = decayAffect(
        current.affect,
        scenario.affectBaseline,
        scenario.affectDecayRate,
        1,
      );
      current = applyDeltas(current, beat.deltas);
      current.usedBeats = [...current.usedBeats, beat.id];
    }
  });
});

test("a plan never exceeds its horizon", () => {
  forAll(specGen, (spec) => {
    const { plan } = planFor(spec);
    assert.ok(plan.path.length <= spec.horizon);
  });
});

test("a one-shot beat is never scheduled twice in one plan", () => {
  forAll(specGen, (spec) => {
    const { scenario, plan } = planFor(spec);
    const seen = new Set();

    for (const step of plan.path) {
      const beat = scenario.beats.find((candidate) => candidate.id === step.id);
      if (!beat?.oneShot) continue;
      assert.equal(seen.has(beat.id), false, `${beat.id} scheduled twice`);
      seen.add(beat.id);
    }
  });
});

test("planning is deterministic", () => {
  forAll(specGen, (spec) => {
    const first = planFor(spec).plan;
    const second = planFor(spec).plan;
    assert.deepEqual(first, second);
  });
});

test("applied deltas always land inside the metric's declared range", () => {
  const deltaGen = gen.record({
    trust: gen.number(0, 1, 2),
    tension: gen.number(0, 1, 2),
    valence: gen.number(-1, 1, 2),
    arousal: gen.number(0, 1, 2),
    control: gen.number(0, 1, 2),
    // Deliberately large enough to push past the bounds if clamping is wrong.
    push: gen.number(-3, 3, 2),
  });

  forAll(deltaGen, (values) => {
    const state = {
      step: 0,
      trust: values.trust,
      tension: values.tension,
      affect: { valence: values.valence, arousal: values.arousal, control: values.control },
      usedChoices: [],
      usedBeats: [],
      events: [],
    };

    const next = applyDeltas(state, Object.fromEntries(METRICS.map((m) => [m, values.push])));

    for (const metric of METRICS) {
      const [minimum, maximum] = METRIC_RANGES[metric];
      const actual = metric.startsWith("affect.")
        ? next.affect[metric.slice(7)]
        : next[metric];
      assert.ok(
        actual >= minimum && actual <= maximum,
        `${metric} left its range at ${actual}`,
      );
    }
  });
});

test("affect always moves toward the baseline, never past it", () => {
  const decayGen = gen.record({
    value: gen.number(-1, 1, 2),
    baseline: gen.number(-1, 1, 2),
    rate: gen.number(0, 2, 2),
    elapsed: gen.number(0, 6, 2),
  });

  forAll(decayGen, (spec) => {
    const before = { valence: spec.value, arousal: 0.5, control: 0.5 };
    const baseline = { valence: spec.baseline, arousal: 0.5, control: 0.5 };
    const after = decayAffect(before, baseline, spec.rate, spec.elapsed);

    const distanceBefore = Math.abs(spec.value - spec.baseline);
    const distanceAfter = Math.abs(after.valence - spec.baseline);

    assert.ok(
      distanceAfter <= distanceBefore + 1e-9,
      `moved away from baseline: ${distanceBefore} -> ${distanceAfter}`,
    );
  });
});

test("recall returns no duplicates and respects its limit", () => {
  const recallGen = gen.record({
    memoryCount: gen.integer(0, 8),
    limit: gen.integer(0, 5),
    lambda: gen.number(0, 1, 2),
    step: gen.integer(1, 10),
  });

  forAll(recallGen, (spec) => {
    const memories = Array.from({ length: spec.memoryCount }, (_, index) => ({
      id: `m${index}`,
      text: `Memory ${index}`,
      tags: [TAG_POOL[index % TAG_POOL.length]],
      createdAt: -index - 1,
      intensity: 0.5,
      relationship: 0.5,
    }));

    const recalled = rankMemories(memories, { tags: ["trust"] }, spec.step, {
      limit: spec.limit,
      lambda: spec.lambda,
    });

    assert.ok(recalled.length <= spec.limit);
    assert.equal(new Set(recalled.map((m) => m.id)).size, recalled.length);
  });
});

test("replaying the same events twice yields the same fingerprint", () => {
  forAll(specGen, (spec) => {
    const scenario = buildScenario(spec);
    const events = scenario.choices.slice(0, 2).map((choice, index) => ({
      type: "choice",
      sourceId: choice.id,
      step: index + 1,
      elapsedTime: 1,
    }));

    let expected;
    try {
      expected = replayEvents(scenario, events);
    } catch {
      // An ineligible sequence is a legal outcome; the invariant is about
      // replays that succeed.
      return;
    }

    const again = replayEvents(scenario, events);
    assert.equal(stateFingerprint(again), stateFingerprint(expected));
  });
});
