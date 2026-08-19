import {
  advanceStory,
  evaluateChoiceEligibility,
  startScenario,
  stateFingerprint,
} from "./engine.js";
import { orbitalRelay } from "./scenario.js";
import { decodeShareCode, encodeShareCode } from "./replay.js";

const MAX_TURNS = 5;

const elements = Object.fromEntries(
  [
    "scenario-eyebrow",
    "story-title",
    "story-line",
    "turn-label",
    "state-fingerprint",
    "trust-value",
    "trust-fill",
    "trust-meter",
    "tension-value",
    "tension-fill",
    "tension-meter",
    "valence-value",
    "valence-fill",
    "valence-meter",
    "choice-list",
    "timeline",
    "memory-list",
    "plan-list",
    "planner-score",
    "trace-list",
    "reset-button",
    "share-button",
    "scene-card",
  ].map((id) => [id, document.getElementById(id)]),
);

// A share link carries only the choice ids; every beat, memory, and affect
// value below is recomputed from them. If the engine were not deterministic
// this would not be possible, so a broken link is a broken claim.
function stateFromLocation() {
  const code = new URLSearchParams(window.location.search).get("replay");
  if (!code) return startScenario(orbitalRelay);

  try {
    return decodeShareCode(orbitalRelay, code, advanceStory);
  } catch (error) {
    // A hand-edited or stale link should not brick the page.
    console.warn("Ignoring an invalid share link:", error.message);
    return startScenario(orbitalRelay);
  }
}

let state = stateFromLocation();
let latestTurn = null;

function createElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  if (text !== undefined) {
    element.textContent = text;
  }

  return element;
}

function choiceCount() {
  return state.events.filter((event) => event.type === "choice").length;
}

function asPercent(value) {
  return Math.round(value * 100);
}

function setMetric(name, value, displayValue, fillValue = value) {
  elements[`${name}-value`].textContent = displayValue;
  elements[`${name}-fill`].style.width = `${asPercent(fillValue)}%`;
  elements[`${name}-meter`].setAttribute("aria-valuenow", String(displayValue));
}

function renderMetrics() {
  setMetric("trust", state.trust, asPercent(state.trust));
  setMetric("tension", state.tension, asPercent(state.tension));
  setMetric(
    "valence",
    state.affect.valence,
    Math.round(state.affect.valence * 100),
    (state.affect.valence + 1) / 2,
  );
}

function renderStory() {
  const turns = choiceCount();
  const finished = turns >= MAX_TURNS;

  elements["scenario-eyebrow"].textContent = orbitalRelay.eyebrow;
  elements["story-title"].textContent = orbitalRelay.title;
  elements["story-line"].textContent = finished
    ? `${latestTurn?.narration ?? orbitalRelay.intro} That path is now fixed in the event log. Reset to try another.`
    : latestTurn?.narration ?? orbitalRelay.intro;
  elements["turn-label"].textContent =
    turns === 0 ? "Scene start" : `Turn ${turns} of ${MAX_TURNS}`;
  elements["state-fingerprint"].textContent = latestTurn?.fingerprint
    ?? stateFingerprint(state);
}

function handleChoice(choiceId) {
  latestTurn = advanceStory(orbitalRelay, state, choiceId, {
    memory: { limit: 3, lambda: 0.72 },
    planner: { horizon: 3, beamWidth: 4 },
  });
  state = latestTurn.nextState;

  // Keep the address bar in step with the story, so the URL is always a link
  // to exactly what is on screen without anyone pressing a button.
  window.history.replaceState(null, "", `?replay=${encodeShareCode(state)}`);

  elements["scene-card"].classList.remove("is-advancing");
  requestAnimationFrame(() => {
    elements["scene-card"].classList.add("is-advancing");
  });

  render();
}

function renderChoices() {
  const finished = choiceCount() >= MAX_TURNS;
  const fragment = document.createDocumentFragment();

  for (const choice of orbitalRelay.choices) {
    const eligibility = evaluateChoiceEligibility(state, choice);
    const button = createElement("button", "choice", undefined);
    const copy = createElement("span", "choice__copy", undefined);
    const label = createElement("strong", "", choice.label);
    const hint = createElement(
      "small",
      "",
      eligibility.eligible ? choice.hint : "Already part of this timeline.",
    );
    const arrow = createElement("span", "choice__arrow", "↗");

    button.type = "button";
    button.disabled = finished || !eligibility.eligible;
    button.setAttribute("aria-label", `${choice.label}: ${choice.hint}`);
    button.addEventListener("click", () => handleChoice(choice.id));

    copy.append(label, hint);
    button.append(copy, arrow);
    fragment.append(button);
  }

  elements["choice-list"].replaceChildren(fragment);
}

function renderTimeline() {
  const fragment = document.createDocumentFragment();

  if (state.events.length === 0) {
    const empty = createElement("li", "timeline__empty");
    empty.append(
      createElement("span", "timeline__index", "00"),
      createElement(
        "p",
        "",
        "No events yet. Your first choice starts the replay.",
      ),
    );
    fragment.append(empty);
  } else {
    for (const [index, event] of state.events.entries()) {
      const item = createElement("li", "timeline__item");
      const number = createElement(
        "span",
        "timeline__index",
        String(index + 1).padStart(2, "0"),
      );
      const copy = createElement("div", "timeline__copy");
      const type = createElement(
        "span",
        `event-type event-type--${event.type}`,
        event.type,
      );
      const line = createElement("p", "", event.line);
      copy.append(type, line);
      item.append(number, copy);
      fragment.append(item);
    }
  }

  elements.timeline.replaceChildren(fragment);
}

function renderMemories() {
  const fragment = document.createDocumentFragment();

  if (!latestTurn) {
    fragment.append(
      createElement(
        "p",
        "inspector-empty",
        "Choose an action to see which memories the engine recalls—and why.",
      ),
    );
  } else {
    for (const [index, memory] of latestTurn.recalledMemories.entries()) {
      const card = createElement("article", "memory-card");
      const header = createElement("header", "memory-card__header");
      const rank = createElement(
        "span",
        "memory-card__rank",
        `0${index + 1}`,
      );
      const score = createElement(
        "strong",
        "",
        `MMR ${memory.mmr.toFixed(3)}`,
      );
      const text = createElement("p", "", memory.text);
      const components = createElement("div", "memory-card__components");

      components.append(
        createElement("span", "", `relevance ${memory.score.toFixed(2)}`),
        createElement("span", "", `redundancy ${memory.redundancy.toFixed(2)}`),
      );

      for (const [name, value] of Object.entries(memory.components)) {
        components.append(
          createElement("span", "", `${name} ${value.toFixed(2)}`),
        );
      }

      header.append(rank, score);
      card.append(header, text, components);
      fragment.append(card);
    }
  }

  elements["memory-list"].replaceChildren(fragment);
}

function renderPlan() {
  const fragment = document.createDocumentFragment();

  if (!latestTurn || latestTurn.plan.path.length === 0) {
    const empty = createElement("li", "inspector-empty");
    empty.textContent =
      "Choose an action to see the three beats that could follow.";
    fragment.append(empty);
    elements["planner-score"].textContent = "beam width 4";
  } else {
    elements["planner-score"].textContent =
      `terminal fit ${latestTurn.plan.score.toFixed(3)}`;

    for (const [index, beat] of latestTurn.plan.path.entries()) {
      const item = createElement("li", "plan-item");
      const indexLabel = createElement(
        "span",
        "plan-item__index",
        String(index + 1),
      );
      const copy = createElement("div", "plan-item__copy");
      const title = createElement("strong", "", beat.title);
      const meta = createElement(
        "small",
        "",
        `fit ${beat.components.goalFit.toFixed(2)} · continuity ${beat.components.continuity.toFixed(2)}`,
      );

      copy.append(title, meta);
      item.append(indexLabel, copy);
      fragment.append(item);
    }
  }

  elements["plan-list"].replaceChildren(fragment);
}

function renderTrace() {
  const fragment = document.createDocumentFragment();

  if (!latestTurn) {
    fragment.append(
      createElement(
        "p",
        "inspector-empty",
        "Eligibility checks and rejected beats will appear here.",
      ),
    );
  } else {
    for (const candidate of latestTurn.plan.trace) {
      const row = createElement(
        "div",
        `trace-row ${candidate.eligible ? "is-eligible" : "is-rejected"}`,
      );
      const heading = createElement("div", "trace-row__heading");
      heading.append(
        createElement("strong", "", candidate.title),
        createElement(
          "span",
          "",
          candidate.eligible ? candidate.score.toFixed(3) : "rejected",
        ),
      );
      const reason = createElement(
        "small",
        "",
        candidate.eligible
          ? `goal ${candidate.components.goalFit.toFixed(2)} · continuity ${candidate.components.continuity.toFixed(2)}`
          : candidate.reasons.join(" · "),
      );
      row.append(heading, reason);
      fragment.append(row);
    }
  }

  elements["trace-list"].replaceChildren(fragment);
}

function render() {
  renderStory();
  renderMetrics();
  renderChoices();
  renderTimeline();
  renderMemories();
  renderPlan();
  renderTrace();
}

function resetStory() {
  state = startScenario(orbitalRelay);
  latestTurn = null;
  elements["scene-card"].classList.remove("is-advancing");
  window.history.replaceState(null, "", window.location.pathname);
  render();
}

function shareLink() {
  const url = new URL(window.location.href);
  url.search = state.events.length > 0 ? `?replay=${encodeShareCode(state)}` : "";
  return url.toString();
}

async function copyShareLink() {
  const link = shareLink();
  const button = elements["share-button"];
  const original = button.textContent;

  try {
    await navigator.clipboard.writeText(link);
    button.textContent = "Link copied";
  } catch {
    // Clipboard access is denied in some contexts; showing the URL still lets
    // someone copy it by hand, which is better than a button that does nothing.
    window.prompt("Copy this link:", link);
    button.textContent = original;
    return;
  }

  setTimeout(() => {
    button.textContent = original;
  }, 1600);
}

elements["reset-button"].addEventListener("click", resetStory);
elements["share-button"].addEventListener("click", copyShareLink);
document.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey) return;

  const key = event.key.toLowerCase();
  if (key === "r") resetStory();
  if (key === "s") copyShareLink();
});

render();
