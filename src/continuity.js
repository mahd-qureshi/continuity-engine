import {
  endingFor,
  initialMemories,
  outcomeFor,
  sceneFor,
  story,
} from "./story.js";

const VERSION = 1;
const MAX_SHARE_LENGTH = 160;
const ID_PATTERN = /^[a-z]+(?:-[a-z]+)*$/;

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
}

export function createStory() {
  return freeze({
    version: VERSION,
    choices: [],
    events: [],
    traits: { resolve: 50, openness: 50 },
    memories: initialMemories.map((memory) => ({ ...memory })),
    finished: false,
  });
}

function advance(state, choiceId) {
  if (state.finished)
    throw new Error("This story is complete. Rewind to make another choice.");
  if (
    typeof choiceId !== "string" ||
    choiceId.length > 40 ||
    !ID_PATTERN.test(choiceId)
  )
    throw new Error("Choice ID must be a valid string.");
  const choice = sceneFor(state).choices.find(
    (candidate) => candidate.id === choiceId,
  );
  if (!choice)
    throw new Error(
      `Choice \"${choiceId}\" is not available at decision ${state.choices.length + 1}.`,
    );
  const { consequence, memory, changes, deltas } = outcomeFor(state, choice);
  const step = state.choices.length + 1;
  const event = {
    id: `decision-${step}`,
    step,
    choiceId,
    label: choice.label,
    consequence,
    memory,
    changes,
  };
  return freeze({
    version: VERSION,
    choices: [...state.choices, choiceId],
    events: [...state.events, event],
    traits: Object.fromEntries(
      Object.entries(state.traits).map(([trait, value]) => [
        trait,
        Math.max(0, Math.min(100, value + deltas[trait])),
      ]),
    ),
    memories: [
      ...state.memories,
      { id: `memory-${step}`, text: memory, sourceStep: step },
    ],
    finished: step === story.totalSteps,
  });
}

/** Rebuild all derived state from a bounded, legal sequence of decisions. */
export function replay(choiceIds) {
  if (!Array.isArray(choiceIds) || choiceIds.length > story.totalSteps)
    throw new Error("A story must contain between zero and five choices.");
  let state = createStory();
  for (const choiceId of choiceIds) state = advance(state, choiceId);
  return state;
}

function canonicalState(state) {
  if (!state || typeof state !== "object" || state.version !== VERSION)
    throw new Error("Unsupported story version.");
  return replay(state.choices);
}

export function choose(state, choiceId) {
  return advance(canonicalState(state), choiceId);
}

/** Count is the number of decisions to retain, not the number to remove. */
export function rewind(state, count) {
  const current = canonicalState(state);
  if (!Number.isInteger(count) || count < 0 || count > current.choices.length)
    throw new Error(
      "Rewind count must be a valid number of retained decisions.",
    );
  return replay(current.choices.slice(0, count));
}

export function getScene(state) {
  return freeze(sceneFor(canonicalState(state)));
}

export function getEnding(state) {
  return freeze(endingFor(canonicalState(state)));
}

/** Compact URL-safe format; only authored choice IDs cross the share boundary. */
export function serialize(state) {
  const current = canonicalState(state);
  return [`v${VERSION}`, ...current.choices].join(".");
}

export function deserialize(code) {
  if (
    typeof code !== "string" ||
    code.length > MAX_SHARE_LENGTH ||
    !/^v1(?:\.[a-z]+(?:-[a-z]+)*){0,5}$/.test(code)
  ) {
    throw new Error("Invalid or unsupported story link.");
  }
  return replay(code.split(".").slice(1));
}
