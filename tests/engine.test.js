import test from "node:test";
import assert from "node:assert/strict";

import {
  applyDeltas,
  advanceStory,
  decayAffect,
  evaluateBeatEligibility,
  evaluateChoiceEligibility,
  planBeats,
  rankMemories,
  replayEvents,
  runChoices,
  startScenario,
} from "../src/engine.js";
import { orbitalRelay } from "../src/scenario.js";

test("affect decays toward its baseline", () => {
  const result = decayAffect(
    { valence: 1, arousal: 0.8, control: 0.2 },
    { valence: 0, arousal: 0.4, control: 0.5 },
    0.25,
    2,
  );

  assert.ok(result.valence > 0 && result.valence < 1);
  assert.ok(result.arousal > 0.4 && result.arousal < 0.8);
  assert.ok(result.control > 0.2 && result.control < 0.5);
});

test("memory ranking is deterministic and returns no duplicates", () => {
  const options = {
    limit: 3,
    lambda: 0.72,
  };
  const first = rankMemories(
    orbitalRelay.memories,
    { tags: ["truth", "trust", "secret"] },
    2,
    options,
  );
  const second = rankMemories(
    orbitalRelay.memories,
    { tags: ["truth", "trust", "secret"] },
    2,
    options,
  );

  assert.deepEqual(first, second);
  assert.equal(new Set(first.map((memory) => memory.id)).size, first.length);
  assert.equal(
    new Set(first.map((memory) => memory.text.toLowerCase())).size,
    first.length,
  );
  assert.ok(
    first.every(
      (memory) =>
        Number.isFinite(memory.score)
        && Number.isFinite(memory.mmr)
        && Number.isFinite(memory.redundancy),
    ),
  );
});

test("memory ranking safely removes duplicate IDs and content", () => {
  const duplicate = orbitalRelay.memories[0];
  const sameText = {
    ...orbitalRelay.memories[1],
    id: "different-id",
    text: duplicate.text,
  };
  const result = rankMemories(
    [duplicate, duplicate, sameText],
    { tags: ["promise", "trust"] },
    2,
    { limit: 3 },
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].id, duplicate.id);
});

test("beat eligibility explains failed preconditions", () => {
  const state = startScenario(orbitalRelay);
  const beat = orbitalRelay.beats.find(
    (candidate) => candidate.id === "dawn-frequency",
  );
  const result = evaluateBeatEligibility(state, beat);

  assert.equal(result.eligible, false);
  assert.match(result.reasons[0], /trust/);
});

test("one-time choices become ineligible after use", () => {
  const first = advanceStory(
    orbitalRelay,
    startScenario(orbitalRelay),
    "tell-truth",
  );
  const choice = orbitalRelay.choices.find(
    (candidate) => candidate.id === "tell-truth",
  );

  assert.equal(evaluateChoiceEligibility(first.nextState, choice).eligible, false);
  assert.throws(
    () => advanceStory(orbitalRelay, first.nextState, "tell-truth"),
    /already used/,
  );
});

test("planner never selects an ineligible beat", () => {
  const state = startScenario(orbitalRelay);
  const plan = planBeats(
    state,
    orbitalRelay.beats,
    ["repair", "fear"],
    orbitalRelay.goal,
    orbitalRelay,
    { horizon: 3, beamWidth: 4 },
  );

  assert.equal(plan.path.length, 3);

  let simulatedState = state;
  for (const selected of plan.path) {
    const beat = orbitalRelay.beats.find(
      (candidate) => candidate.id === selected.id,
    );
    const eligibility = evaluateBeatEligibility(simulatedState, beat);
    assert.equal(eligibility.eligible, true);
    const decayedState = {
      ...simulatedState,
      affect: decayAffect(
        simulatedState.affect,
        orbitalRelay.affectBaseline,
        orbitalRelay.affectDecayRate,
        1,
      ),
    };
    simulatedState = applyDeltas(decayedState, beat.deltas);
    simulatedState = {
      ...simulatedState,
      usedBeats: [...simulatedState.usedBeats, beat.id],
    };
  }
});

test("planner prefers the path with the best reachable terminal state", () => {
  const beats = [
    {
      id: "toward",
      title: "Move toward target",
      line: "Toward.",
      tags: ["motion"],
      oneShot: true,
      requires: [],
      deltas: { trust: 1 },
    },
    {
      id: "away",
      title: "Move away first",
      line: "Away.",
      tags: ["motion"],
      oneShot: true,
      requires: [],
      deltas: { trust: -1 },
    },
  ];
  const scenario = {
    affectBaseline: { valence: 0, arousal: 0, control: 0 },
    affectDecayRate: 0,
    initialState: {
      step: 0,
      trust: 0,
      tension: 0,
      affect: { valence: 0, arousal: 0, control: 0 },
    },
    choices: [],
    beats,
  };
  const plan = planBeats(
    startScenario(scenario),
    beats,
    ["motion"],
    { trust: 1 },
    scenario,
    { horizon: 2, beamWidth: 2 },
  );

  assert.deepEqual(
    plan.path.map((beat) => beat.id),
    ["away", "toward"],
  );
  assert.equal(plan.score, 1);
});

test("the same choices produce the same state and explanation", () => {
  const choices = ["tell-truth", "reassure", "deflect"];
  const first = runChoices(orbitalRelay, choices);
  const second = runChoices(orbitalRelay, choices);

  assert.deepEqual(first, second);
});

test("a choice becomes a memory on the next turn, not its creation turn", () => {
  const first = advanceStory(
    orbitalRelay,
    startScenario(orbitalRelay),
    "tell-truth",
    { memory: { limit: 10 } },
  );

  assert.equal(
    first.recalledMemories.some((memory) => memory.id.includes("truth-revealed")),
    false,
  );

  const second = advanceStory(
    orbitalRelay,
    first.nextState,
    "reassure",
    { memory: { limit: 10 } },
  );

  assert.equal(
    second.recalledMemories.some((memory) => memory.id.includes("truth-revealed")),
    true,
  );
});

test("story advancement keeps every bounded metric in range", () => {
  let state = startScenario(orbitalRelay);

  for (const choice of [
    "accuse",
    "sacrifice",
    "deflect",
    "tell-truth",
    "reassure",
  ]) {
    state = advanceStory(orbitalRelay, state, choice).nextState;

    assert.ok(state.trust >= 0 && state.trust <= 1);
    assert.ok(state.tension >= 0 && state.tension <= 1);
    assert.ok(state.affect.valence >= -1 && state.affect.valence <= 1);
    assert.ok(state.affect.arousal >= 0 && state.affect.arousal <= 1);
    assert.ok(state.affect.control >= 0 && state.affect.control <= 1);
  }
});

test("returned state and events cannot be mutated", () => {
  const result = advanceStory(
    orbitalRelay,
    startScenario(orbitalRelay),
    "reassure",
  );

  assert.equal(Object.isFrozen(result.nextState), true);
  assert.equal(Object.isFrozen(result.nextState.events), true);
  assert.equal(Object.isFrozen(result.nextState.events[0]), true);
  assert.throws(() => {
    result.nextState.events[0].step = 99;
  }, TypeError);
  assert.throws(() => {
    result.nextState.events.push({ type: "choice" });
  }, TypeError);
});

test("event replay derives canonical data and rejects invalid history", () => {
  const canonical = replayEvents(orbitalRelay, [
    {
      type: "choice",
      sourceId: "reassure",
      step: 1,
      elapsedTime: 1,
      deltas: { trust: 99 },
      line: "forged",
    },
  ]);

  assert.equal(canonical.trust, 0.49);
  assert.equal(canonical.events[0].line, orbitalRelay.choices[1].result);

  assert.throws(
    () => replayEvents(orbitalRelay, [{ type: "teleport", step: 1 }]),
    /Unknown event type/,
  );
  assert.throws(
    () =>
      replayEvents(orbitalRelay, [
        {
          type: "choice",
          sourceId: "reassure",
          step: 3,
          elapsedTime: 1,
        },
      ]),
    /chronology is invalid/,
  );
  assert.throws(
    () =>
      replayEvents(orbitalRelay, [
        {
          type: "choice",
          sourceId: "tell-truth",
          step: 1,
          elapsedTime: 1,
        },
        {
          type: "choice",
          sourceId: "tell-truth",
          step: 2,
          elapsedTime: 1,
        },
      ]),
    /already used/,
  );
});

test("story advancement rejects cached state that disagrees with its events", () => {
  const result = advanceStory(
    orbitalRelay,
    startScenario(orbitalRelay),
    "reassure",
  );
  const tampered = JSON.parse(JSON.stringify(result.nextState));
  tampered.trust = 0;

  assert.throws(
    () => advanceStory(orbitalRelay, tampered, "deflect"),
    /does not match its event history/,
  );
});

test("invalid retrieval and planning options fail clearly", () => {
  for (const limit of [Number.NaN, Number.POSITIVE_INFINITY, 2.5, -1]) {
    assert.throws(
      () =>
        rankMemories(
          orbitalRelay.memories,
          { tags: ["trust"] },
          1,
          { limit },
        ),
      /Memory limit/,
    );
  }

  assert.throws(
    () =>
      rankMemories(
        orbitalRelay.memories,
        { tags: ["trust"] },
        1,
        { lambda: Number.NaN },
      ),
    /lambda/,
  );
  assert.throws(
    () =>
      rankMemories(
        orbitalRelay.memories,
        { tags: ["trust"] },
        1,
        {
          weights: {
            tags: 0.4,
            recency: 0.2,
            intensity: 0.2,
            relationship: 0.1,
          },
        },
      ),
    /sum to 1/,
  );

  const state = startScenario(orbitalRelay);
  for (const horizon of [Number.NaN, Number.POSITIVE_INFINITY, 1.5, 0]) {
    assert.throws(
      () =>
        planBeats(
          state,
          orbitalRelay.beats,
          ["trust"],
          orbitalRelay.goal,
          orbitalRelay,
          { horizon },
        ),
      /Planner horizon/,
    );
  }

  assert.throws(
    () =>
      planBeats(
        state,
        orbitalRelay.beats,
        ["trust"],
        {},
        orbitalRelay,
      ),
    /at least one metric/,
  );
  assert.throws(
    () =>
      planBeats(
        state,
        orbitalRelay.beats,
        ["trust"],
        { "affect.unknown": 0 },
        orbitalRelay,
      ),
    /Unknown state metric/,
  );
});

test("unknown choices fail with a useful error", () => {
  assert.throws(
    () => advanceStory(orbitalRelay, startScenario(orbitalRelay), "teleport"),
    /Unknown choice: teleport/,
  );
});
