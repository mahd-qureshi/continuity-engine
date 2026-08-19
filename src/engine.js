const SCORE_PRECISION = 4;

export const METRIC_RANGES = Object.freeze({
  trust: [0, 1],
  tension: [0, 1],
  "affect.valence": [-1, 1],
  "affect.arousal": [0, 1],
  "affect.control": [0, 1],
});

export const DEFAULT_MEMORY_WEIGHTS = Object.freeze({
  tags: 0.4,
  recency: 0.25,
  intensity: 0.2,
  relationship: 0.15,
});

export function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function round(value, precision = SCORE_PRECISION) {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return value;
}

function assertFiniteNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number.`);
  }
}

function assertInteger(value, name, minimum) {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}.`);
  }
}

function assertKnownMetric(metric) {
  if (!(metric in METRIC_RANGES)) {
    throw new Error(`Unknown state metric: ${metric}`);
  }
}

function validateWeights(weights) {
  const expected = Object.keys(DEFAULT_MEMORY_WEIGHTS);
  const actual = Object.keys(weights);

  if (
    actual.length !== expected.length
    || expected.some((key) => !(key in weights))
  ) {
    throw new Error(`Memory weights must define: ${expected.join(", ")}.`);
  }

  for (const [name, weight] of Object.entries(weights)) {
    assertFiniteNumber(weight, `Memory weight "${name}"`);

    if (weight < 0 || weight > 1) {
      throw new Error(`Memory weight "${name}" must be between 0 and 1.`);
    }
  }

  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);

  if (Math.abs(total - 1) > 1e-9) {
    throw new Error("Memory weights must sum to 1.");
  }
}

function validateGoal(goal) {
  const entries = Object.entries(goal ?? {});

  if (entries.length === 0) {
    throw new Error("Planner goal must define at least one metric.");
  }

  for (const [metric, target] of entries) {
    assertKnownMetric(metric);
    assertFiniteNumber(target, `Goal metric "${metric}"`);
    const [minimum, maximum] = METRIC_RANGES[metric];

    if (target < minimum || target > maximum) {
      throw new Error(
        `Goal metric "${metric}" must be between ${minimum} and ${maximum}.`,
      );
    }
  }
}

function readMetric(state, path) {
  assertKnownMetric(path);
  return path.split(".").reduce((value, key) => value?.[key], state);
}

function writeMetric(state, path, value) {
  const keys = path.split(".");
  let target = state;

  for (const key of keys.slice(0, -1)) {
    target = target[key];
  }

  target[keys.at(-1)] = value;
}

export function applyDeltas(state, deltas = {}) {
  const next = clone(state);

  for (const [metric, delta] of Object.entries(deltas)) {
    assertKnownMetric(metric);
    assertFiniteNumber(delta, `Delta for "${metric}"`);
    const current = readMetric(next, metric);
    assertFiniteNumber(current, `Current state metric "${metric}"`);
    const [minimum, maximum] = METRIC_RANGES[metric];
    writeMetric(next, metric, round(clamp(current + delta, minimum, maximum)));
  }

  return next;
}

export function decayAffect(
  affect,
  baseline,
  rate,
  elapsedTime,
) {
  assertFiniteNumber(rate, "Decay rate");
  assertFiniteNumber(elapsedTime, "Elapsed time");

  if (rate < 0 || elapsedTime < 0) {
    throw new Error("Decay rate and elapsed time must be non-negative.");
  }

  const multiplier = Math.exp(-rate * elapsedTime);

  return Object.fromEntries(
    Object.keys(affect).map((dimension) => {
      assertFiniteNumber(affect[dimension], `Affect "${dimension}"`);
      assertFiniteNumber(baseline[dimension], `Affect baseline "${dimension}"`);

      return [
        dimension,
        round(
          baseline[dimension]
            + (affect[dimension] - baseline[dimension]) * multiplier,
        ),
      ];
    }),
  );
}

export function tagSimilarity(left = [], right = []) {
  const a = new Set(left);
  const b = new Set(right);
  const union = new Set([...a, ...b]);

  if (union.size === 0) {
    return 0;
  }

  const intersection = [...a].filter((tag) => b.has(tag)).length;
  return round(intersection / union.size);
}

export function scoreMemory(
  memory,
  context,
  currentStep,
  weights = DEFAULT_MEMORY_WEIGHTS,
) {
  assertInteger(currentStep, "Current memory step", 0);
  validateWeights(weights);
  assertFiniteNumber(memory.createdAt, `Memory "${memory.id}" creation step`);
  assertFiniteNumber(memory.intensity, `Memory "${memory.id}" intensity`);
  assertFiniteNumber(memory.relationship, `Memory "${memory.id}" relationship`);

  const age = Math.max(0, currentStep - memory.createdAt);
  const components = {
    tags: tagSimilarity(memory.tags, context.tags),
    recency: round(Math.exp(-0.18 * age)),
    intensity: clamp(memory.intensity),
    relationship: clamp(memory.relationship),
  };

  const score = Object.entries(weights).reduce(
    (total, [key, weight]) => total + components[key] * weight,
    0,
  );

  return {
    ...clone(memory),
    components,
    score: round(score),
  };
}

function memoryContentKey(memory) {
  return memory.text.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function rankMemories(
  memories,
  context,
  currentStep,
  { limit = 3, lambda = 0.72, weights = DEFAULT_MEMORY_WEIGHTS } = {},
) {
  assertInteger(limit, "Memory limit", 0);
  assertFiniteNumber(lambda, "Memory diversity lambda");
  validateWeights(weights);

  if (lambda < 0 || lambda > 1) {
    throw new Error("Memory diversity lambda must be between 0 and 1.");
  }

  if (!Array.isArray(context?.tags)) {
    throw new Error("Memory context must provide a tags array.");
  }

  const seenIds = new Set();
  const seenContent = new Set();
  const candidates = memories
    .map((memory) => scoreMemory(memory, context, currentStep, weights))
    .sort(
      (left, right) =>
        right.score - left.score || left.id.localeCompare(right.id),
    )
    .filter((memory) => {
      const contentKey = memoryContentKey(memory);

      if (seenIds.has(memory.id) || seenContent.has(contentKey)) {
        return false;
      }

      seenIds.add(memory.id);
      seenContent.add(contentKey);
      return true;
    });
  const selected = [];

  while (selected.length < Math.min(limit, candidates.length)) {
    const remaining = candidates
      .filter(
        (candidate) =>
          !selected.some((memory) => memory.id === candidate.id),
      )
      .map((candidate) => {
        const redundancy =
          selected.length === 0
            ? 0
            : Math.max(
                ...selected.map((memory) =>
                  tagSimilarity(candidate.tags, memory.tags),
                ),
              );

        return {
          ...candidate,
          redundancy: round(redundancy),
          mmr: round(lambda * candidate.score - (1 - lambda) * redundancy),
        };
      })
      .sort((left, right) => right.mmr - left.mmr || left.id.localeCompare(right.id));

    if (remaining.length === 0) {
      break;
    }

    selected.push(remaining[0]);
  }

  return deepFreeze(selected);
}

function compare(actual, operator, expected) {
  assertFiniteNumber(actual, "Constraint state value");
  assertFiniteNumber(expected, "Constraint target");

  switch (operator) {
    case ">=":
      return actual >= expected;
    case "<=":
      return actual <= expected;
    case ">":
      return actual > expected;
    case "<":
      return actual < expected;
    case "==":
      return actual === expected;
    default:
      throw new Error(`Unknown constraint operator: ${operator}`);
  }
}

export function evaluateChoiceEligibility(state, choice) {
  const reasons = [];

  if (choice.oneShot && state.usedChoices.includes(choice.id)) {
    reasons.push("already used");
  }

  for (const constraint of choice.requires ?? []) {
    const actual = readMetric(state, constraint.metric);

    if (!compare(actual, constraint.operator, constraint.value)) {
      reasons.push(
        `${constraint.metric} ${round(actual)} must be ${constraint.operator} ${constraint.value}`,
      );
    }
  }

  return {
    eligible: reasons.length === 0,
    reasons,
  };
}

export function evaluateBeatEligibility(state, beat) {
  const reasons = [];

  if (beat.oneShot && state.usedBeats.includes(beat.id)) {
    reasons.push("already used");
  }

  for (const constraint of beat.requires ?? []) {
    const actual = readMetric(state, constraint.metric);

    if (!compare(actual, constraint.operator, constraint.value)) {
      reasons.push(
        `${constraint.metric} ${round(actual)} must be ${constraint.operator} ${constraint.value}`,
      );
    }
  }

  return {
    eligible: reasons.length === 0,
    reasons,
  };
}

function goalFit(state, goal) {
  const distances = Object.entries(goal).map(([metric, target]) => {
    const [minimum, maximum] = METRIC_RANGES[metric];
    const range = maximum - minimum;
    return Math.abs(readMetric(state, metric) - target) / range;
  });

  return round(1 - clamp(distances.reduce((sum, value) => sum + value, 0) / distances.length));
}

function simulateBeat(state, beat, scenario) {
  let next = clone(state);
  next.affect = decayAffect(
    next.affect,
    scenario.affectBaseline,
    scenario.affectDecayRate,
    1,
  );
  next = applyDeltas(next, beat.deltas);
  next.usedBeats = [...next.usedBeats, beat.id];
  return next;
}

function evaluateBeat(state, beat, contextTags, goal, scenario) {
  const eligibility = evaluateBeatEligibility(state, beat);

  if (!eligibility.eligible) {
    return {
      id: beat.id,
      title: beat.title,
      eligible: false,
      reasons: eligibility.reasons,
      score: null,
      components: null,
    };
  }

  const nextState = simulateBeat(state, beat, scenario);
  const components = {
    goalFit: goalFit(nextState, goal),
    continuity: tagSimilarity(beat.tags, contextTags),
  };

  return {
    id: beat.id,
    title: beat.title,
    eligible: true,
    reasons: [],
    score: round(components.goalFit * 0.68 + components.continuity * 0.32),
    components,
    nextState,
  };
}

function pathKey(node) {
  return node.path.map((beat) => beat.id).join(":");
}

function comparePaths(left, right) {
  return (
    right.terminalGoalFit - left.terminalGoalFit
    || right.continuityScore - left.continuityScore
    || pathKey(left).localeCompare(pathKey(right))
  );
}

export function planBeats(
  state,
  beats,
  contextTags,
  goal,
  scenario,
  { horizon = 3, beamWidth = 4 } = {},
) {
  assertInteger(horizon, "Planner horizon", 1);
  assertInteger(beamWidth, "Planner beam width", 1);
  validateGoal(goal);

  if (!Array.isArray(contextTags)) {
    throw new Error("Planner context tags must be an array.");
  }

  const firstStep = beats
    .map((beat) => evaluateBeat(state, beat, contextTags, goal, scenario))
    .map(({ nextState, ...trace }) => trace);

  let frontier = [{
    state: clone(state),
    path: [],
    contextTags: [...contextTags],
    terminalGoalFit: goalFit(state, goal),
    continuityScore: 0,
  }];

  for (let depth = 0; depth < horizon; depth += 1) {
    const candidates = [];

    for (const node of frontier) {
      for (const beat of beats) {
        const evaluation = evaluateBeat(
          node.state,
          beat,
          node.contextTags,
          goal,
          scenario,
        );

        if (!evaluation.eligible) {
          continue;
        }

        const discountedContinuity =
          evaluation.components.continuity * 0.82 ** depth;
        candidates.push({
          state: evaluation.nextState,
          contextTags: [...beat.tags],
          path: [
            ...node.path,
            {
              id: beat.id,
              title: beat.title,
              line: beat.line,
              score: evaluation.score,
              components: evaluation.components,
            },
          ],
          terminalGoalFit: evaluation.components.goalFit,
          continuityScore: round(
            node.continuityScore + discountedContinuity,
          ),
        });
      }
    }

    if (candidates.length === 0) {
      break;
    }

    frontier = candidates
      .sort(comparePaths)
      .slice(0, beamWidth);
  }

  const winner = frontier
    .filter((node) => node.path.length > 0)
    .sort(comparePaths)[0];

  return deepFreeze({
    path: winner?.path ?? [],
    score: winner?.terminalGoalFit ?? 0,
    continuityScore: winner?.continuityScore ?? 0,
    trace: firstStep.sort(
      (left, right) =>
        Number(right.eligible) - Number(left.eligible)
        || (right.score ?? -1) - (left.score ?? -1)
        || left.id.localeCompare(right.id),
    ),
  });
}

function canonicalizeEvent(scenario, event, expectedStep, state) {
  if (event === null || typeof event !== "object") {
    throw new Error(`Event ${expectedStep} must be an object.`);
  }

  if (event.type !== "choice" && event.type !== "beat") {
    throw new Error(`Unknown event type: ${event.type}`);
  }

  assertInteger(event.step, `Event ${expectedStep} step`, 1);

  if (event.step !== expectedStep) {
    throw new Error(
      `Event chronology is invalid: expected step ${expectedStep}, received ${event.step}.`,
    );
  }

  const elapsedTime = event.elapsedTime ?? 1;
  assertFiniteNumber(elapsedTime, `Event ${expectedStep} elapsed time`);

  if (elapsedTime < 0) {
    throw new Error(`Event ${expectedStep} elapsed time must be non-negative.`);
  }

  if (event.type === "choice") {
    const choice = scenario.choices.find(
      (candidate) => candidate.id === event.sourceId,
    );

    if (!choice) {
      throw new Error(`Unknown choice event source: ${event.sourceId}`);
    }

    const eligibility = evaluateChoiceEligibility(state, choice);

    if (!eligibility.eligible) {
      throw new Error(
        `Choice "${choice.id}" is ineligible: ${eligibility.reasons.join(", ")}.`,
      );
    }

    return {
      type: "choice",
      sourceId: choice.id,
      step: expectedStep,
      elapsedTime,
      deltas: clone(choice.deltas),
      tags: clone(choice.tags),
      line: choice.result,
      memory: clone(choice.memory),
    };
  }

  const beat = scenario.beats.find(
    (candidate) => candidate.id === event.sourceId,
  );

  if (!beat) {
    throw new Error(`Unknown beat event source: ${event.sourceId}`);
  }

  const eligibility = evaluateBeatEligibility(state, beat);

  if (!eligibility.eligible) {
    throw new Error(
      `Beat "${beat.id}" is ineligible: ${eligibility.reasons.join(", ")}.`,
    );
  }

  return {
    type: "beat",
    sourceId: beat.id,
    step: expectedStep,
    elapsedTime,
    deltas: clone(beat.deltas),
    tags: clone(beat.tags),
    line: beat.line,
  };
}

export function replayEvents(scenario, events = []) {
  if (!Array.isArray(events)) {
    throw new Error("Event history must be an array.");
  }

  let state = {
    ...clone(scenario.initialState),
    usedChoices: [],
    usedBeats: [],
    events: [],
  };

  for (const rawEvent of events) {
    const event = canonicalizeEvent(
      scenario,
      rawEvent,
      state.step + 1,
      state,
    );
    state.affect = decayAffect(
      state.affect,
      scenario.affectBaseline,
      scenario.affectDecayRate,
      event.elapsedTime ?? 1,
    );
    state = applyDeltas(state, event.deltas);

    if (event.type === "choice") {
      state.usedChoices = [...state.usedChoices, event.sourceId];
    } else {
      state.usedBeats = [...state.usedBeats, event.sourceId];
    }

    state.step = event.step;
    state.events = [...state.events, event];
  }

  return deepFreeze(state);
}

export function startScenario(scenario) {
  return replayEvents(scenario, []);
}

export function collectMemories(scenario, events) {
  const rememberedEvents = events
    .filter((event) => event.memory)
    .map((event, index) => ({
      ...clone(event.memory),
      id: `${event.memory.id}-${event.step}-${index}`,
      createdAt: event.step,
    }));

  return deepFreeze([...clone(scenario.memories), ...rememberedEvents]);
}

export function stateFingerprint(state) {
  const input = JSON.stringify(state);
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function advanceStory(
  scenario,
  state,
  choiceId,
  options = {},
) {
  if (!Array.isArray(state?.events)) {
    throw new Error("Story state must include an event history.");
  }

  const canonicalState = replayEvents(scenario, state.events);

  if (stateFingerprint(canonicalState) !== stateFingerprint(state)) {
    throw new Error("Story state does not match its event history.");
  }

  const choice = scenario.choices.find((candidate) => candidate.id === choiceId);

  if (!choice) {
    throw new Error(`Unknown choice: ${choiceId}`);
  }

  const choiceEligibility = evaluateChoiceEligibility(canonicalState, choice);

  if (!choiceEligibility.eligible) {
    throw new Error(
      `Choice "${choice.id}" is ineligible: ${choiceEligibility.reasons.join(", ")}.`,
    );
  }

  const choiceEvent = {
    type: "choice",
    sourceId: choice.id,
    step: canonicalState.step + 1,
    elapsedTime: 1,
  };

  const provisionalEvents = [...canonicalState.events, choiceEvent];
  const provisionalState = replayEvents(scenario, provisionalEvents);
  const memories = collectMemories(scenario, canonicalState.events);
  const recalledMemories = rankMemories(
    memories,
    { tags: choice.tags },
    provisionalState.step,
    options.memory,
  );
  const contextTags = [
    ...new Set([
      ...choice.tags,
      ...recalledMemories.flatMap((memory) => memory.tags),
    ]),
  ];
  const plan = planBeats(
    provisionalState,
    scenario.beats,
    contextTags,
    scenario.goal,
    scenario,
    options.planner,
  );
  const selectedBeat = plan.path[0] ?? null;
  const beat = selectedBeat
    ? scenario.beats.find((candidate) => candidate.id === selectedBeat.id)
    : null;
  const beatEvent = beat
    ? {
        type: "beat",
        sourceId: beat.id,
        step: provisionalState.step + 1,
        elapsedTime: 1,
      }
    : null;
  const nextEvents = beatEvent
    ? [...provisionalEvents, beatEvent]
    : provisionalEvents;
  const nextState = replayEvents(scenario, nextEvents);

  return deepFreeze({
    nextState,
    recalledMemories,
    plan,
    narration: [choice.result, beat?.line].filter(Boolean).join(" "),
    selectedBeat,
    fingerprint: stateFingerprint(nextState),
  });
}

export function runChoices(scenario, choiceIds, options = {}) {
  let state = startScenario(scenario);
  const turns = [];

  for (const choiceId of choiceIds) {
    const result = advanceStory(scenario, state, choiceId, options);
    turns.push(result);
    state = result.nextState;
  }

  return deepFreeze({ state, turns });
}
