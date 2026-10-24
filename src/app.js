import {
  createStory,
  choose,
  rewind,
  serialize,
  deserialize,
  getScene,
  getEnding,
} from "./continuity.js";

const SESSION_KEY = "continuity.mara.v1";
const ENDING_KEY = "continuity.mara.ending.v1";
const $ = (id) => document.getElementById(id);
const sceneRoot = $("scene");
let state = createStory();
let previousEnding = null;
let storageAvailable = true;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function notice(text) {
  $("notice").textContent = text;
  $("notice").hidden = !text;
}
function readSaved(key) {
  try {
    const code = localStorage.getItem(key);
    return code ? deserialize(code) : null;
  } catch {
    return null;
  }
}
function pathURL(value) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("story", serialize(value));
  return url.href;
}
function rememberEnding() {
  if (!state.finished) return;
  previousEnding = state;
  try {
    localStorage.setItem(ENDING_KEY, serialize(state));
  } catch {
    /* Story remains playable without storage. */
  }
}
function persist() {
  try {
    localStorage.setItem(SESSION_KEY, serialize(state));
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
  try {
    window.history.replaceState(null, "", pathURL(state));
  } catch {
    /* Embedded or file previews may restrict history. */
  }
  $("save-status").textContent = storageAvailable
    ? "Saved on this device"
    : "This tab only";
}
function paragraphs(values) {
  const container = element("div", "scene-prose");
  values.forEach((text) => container.append(element("p", "", text)));
  return container;
}
function actionButton(text, callback, className = "text-button") {
  const button = element("button", className, text);
  button.type = "button";
  button.addEventListener("click", callback);
  return button;
}
function applyChoice(id) {
  try {
    state = choose(state, id);
    notice("");
    persist();
    render(true);
  } catch {
    notice(
      "That decision is no longer available. Your current path has been kept.",
    );
  }
}
function goToDecision(count) {
  rememberEnding();
  state = rewind(state, count);
  $("history-dialog").close();
  notice("");
  persist();
  render(true);
}
function renderHistory() {
  $("history-list").replaceChildren();
  state.events.forEach((event, index) => {
    const row = element("li");
    row.append(
      element("h3", "", event.label),
      element("p", "", event.consequence),
    );
    const button = actionButton("Change this decision ↶", () =>
      goToDecision(index),
    );
    button.setAttribute(
      "aria-label",
      `Change decision ${index + 1}: ${event.label}`,
    );
    row.append(button);
    $("history-list").append(row);
  });
}
function showHistory() {
  renderHistory();
  $("history-dialog").showModal();
}
function renderEnding(ending) {
  sceneRoot.append(
    element("p", "ending-label", "One possible ending"),
    element("h2", "", ending.title),
    paragraphs(ending.paragraphs),
  );
  const actions = element("div", "ending-actions");
  actions.append(
    actionButton("Change a decision ↶", showHistory, "primary-button"),
    actionButton("Share this ending ↗", showShare),
  );
  sceneRoot.append(actions);
  const trace = element("details", "trace");
  trace.append(element("summary", "", "How your choices led here"));
  const list = element("ol");
  ending.callbacks.forEach((callback) => {
    const item = element("li", "", callback.text);
    if (callback.sourceStep > 0)
      item.append(
        document.createTextNode(` (Decision ${callback.sourceStep})`),
      );
    list.append(item);
  });
  trace.append(list);
  sceneRoot.append(trace);
  if (previousEnding && serialize(previousEnding) !== serialize(state)) {
    const previous = getEnding(previousEnding);
    const comparison = element("section", "comparison");
    comparison.setAttribute("aria-label", "Compare with your previous ending");
    comparison.append(
      element("p", "eyebrow", "Your previous path"),
      element("h3", "", previous.title),
      element("p", "", previous.summary),
    );
    const index = state.choices.findIndex(
      (id, i) => id !== previousEnding.choices[i],
    );
    comparison.append(
      element(
        "p",
        "",
        `The paths split at decision ${index + 1}: “${previousEnding.events[index].label}” became “${state.events[index].label}”.`,
      ),
    );
    if (previous.id === ending.id)
      comparison.append(
        element(
          "p",
          "",
          "Different choices brought Mara to the same kind of ending. The details she carries are different.",
        ),
      );
    const link = element("a", "", "Open that path ↗");
    link.href = pathURL(previousEnding);
    link.target = "_blank";
    link.rel = "noopener";
    comparison.append(link);
    sceneRoot.append(comparison);
  }
}
function render(focus = false) {
  const scene = getScene(state);
  const ending = getEnding(state);
  document.body.classList.toggle("has-progress", state.choices.length > 0);
  sceneRoot.replaceChildren();
  sceneRoot.classList.remove("scene-enter");
  $("scene-location").textContent = `${scene.location} · ${scene.time}`;
  $("scene-count").textContent = ending
    ? "05 / 05 — Complete"
    : `${String(state.choices.length + 1).padStart(2, "0")} / 05`;
  $("progress").replaceChildren();
  $("progress").setAttribute(
    "aria-label",
    `${state.choices.length} of 5 decisions made`,
  );
  for (let i = 0; i < 5; i++)
    $("progress").append(
      element(
        "span",
        i < state.choices.length
          ? "done"
          : i === state.choices.length
            ? "current"
            : "",
      ),
    );
  if (ending) renderEnding(ending);
  else {
    sceneRoot.append(
      element(
        "p",
        "chapter-label",
        `Chapter ${String(scene.chapter).padStart(2, "0")}`,
      ),
      element("h2", "", scene.title),
      paragraphs(scene.paragraphs),
    );
    if (scene.memory) {
      const memory = element("aside", "memory-callback");
      memory.setAttribute("aria-label", "A remembered choice");
      memory.append(
        element(
          "p",
          "eyebrow",
          scene.memory.sourceStep > 0
            ? `She remembers · Decision ${scene.memory.sourceStep}`
            : "Before this evening",
        ),
        element("p", "", scene.memory.text),
      );
      sceneRoot.append(memory);
    }
    sceneRoot.append(element("p", "choices-prompt", "What does Mara do?"));
    const choices = element("div", "choices");
    choices.setAttribute("role", "group");
    choices.setAttribute("aria-label", "Make Mara’s next decision");
    scene.choices.forEach((choice, i) => {
      const button = actionButton("", () => applyChoice(choice.id), "choice");
      button.dataset.choice = choice.id;
      const number = element(
        "span",
        "choice-number",
        String(i + 1).padStart(2, "0"),
      );
      number.setAttribute("aria-hidden", "true");
      const label = element("span");
      label.append(element("span", "choice-label", choice.label));
      if (choice.description)
        label.append(element("span", "choice-description", choice.description));
      const arrow = element("span", "choice-arrow", "↗");
      arrow.setAttribute("aria-hidden", "true");
      button.append(number, label, arrow);
      choices.append(button);
    });
    sceneRoot.append(choices);
  }
  $("undo-button").disabled = !state.choices.length;
  $("history-button").disabled = !state.choices.length;
  $("reset-button").disabled = !state.choices.length;
  $("announcer").textContent = ending
    ? `Story complete. ${ending.title}`
    : `Decision ${state.choices.length + 1} of 5. ${scene.title}`;
  if (focus) {
    sceneRoot.focus({ preventScroll: true });
    if (window.matchMedia("(max-width: 640px)").matches)
      sceneRoot.scrollIntoView({ behavior: "instant", block: "start" });
  }
  requestAnimationFrame(() => sceneRoot.classList.add("scene-enter"));
}
function showShare() {
  $("share-url").value = pathURL(state);
  $("copy-status").textContent = "";
  $("share-dialog").showModal();
}
$("copy-button").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("share-url").value);
    $("copy-status").textContent = "Link copied.";
  } catch {
    $("share-url").focus();
    $("share-url").select();
    $("copy-status").textContent =
      "Copy the selected link with your device’s copy command.";
  }
});
$("about-button").addEventListener("click", () =>
  $("about-dialog").showModal(),
);
$("history-button").addEventListener("click", showHistory);
$("undo-button").addEventListener("click", () =>
  goToDecision(state.choices.length - 1),
);
$("share-button").addEventListener("click", showShare);
$("reset-button").addEventListener("click", () =>
  $("reset-dialog").showModal(),
);
$("confirm-reset").addEventListener("click", () => {
  rememberEnding();
  state = createStory();
  $("reset-dialog").close();
  notice("");
  persist();
  render(true);
});
document
  .querySelectorAll("[data-close]")
  .forEach((button) =>
    button.addEventListener("click", () => button.closest("dialog").close()),
  );
document.querySelectorAll("dialog").forEach((dialog) =>
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      dialog.close();
  }),
);
document.addEventListener("keydown", (event) => {
  if (
    event.repeat ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    document.querySelector("dialog[open]")
  )
    return;
  if (
    event.target.closest(
      'button, a, input, textarea, select, summary, [contenteditable="true"]',
    )
  )
    return;
  const index = Number(event.key) - 1;
  if (!/^[1-3]$/.test(event.key) || state.finished) return;
  const choice = getScene(state).choices[index];
  if (choice) {
    event.preventDefault();
    applyChoice(choice.id);
  }
});
previousEnding = readSaved(ENDING_KEY);
if (previousEnding && !previousEnding.finished) previousEnding = null;
const savedState = readSaved(SESSION_KEY);
const params = new URLSearchParams(window.location.search);
if (params.has("story")) {
  try {
    const incomingState = deserialize(params.get("story"));
    if (
      savedState?.finished &&
      serialize(savedState) !== serialize(incomingState)
    ) {
      state = savedState;
      rememberEnding();
    }
    state = incomingState;
  } catch {
    state = savedState ?? createStory();
    notice(
      "This story link could not be read. Your saved path is still here, or you can start a new one.",
    );
  }
} else {
  state = savedState ?? createStory();
  if (state.choices.length)
    notice("Welcome back. Your story is where you left it.");
  if (params.has("replay"))
    notice(
      "This link belongs to the earlier orbital-relay demo. Meet Mara in the new story below.",
    );
}
persist();
render();
