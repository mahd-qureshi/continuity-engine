import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";

const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const pageURL = new URL("../index.html", import.meta.url);
// These checks cover authored markup and file references. Browser tests cover
// generated choices, focus, dialogs, saving, and replay interactions.
const tags = [...index.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)].map(
  ([, tag, source]) => ({
    tag: tag.toLowerCase(),
    attributes: Object.fromEntries(
      [
        ...source.matchAll(
          /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g,
        ),
      ].map(([, name, double, single, unquoted]) => [
        name.toLowerCase(),
        double ?? single ?? unquoted ?? "",
      ]),
    ),
  }),
);
const text = (value) => value.replace(/<[^>]*>/g, "").trim();
const elementsWithIDs = new Map(
  tags
    .filter(({ attributes }) => attributes.id)
    .map(({ attributes }) => [attributes.id, attributes]),
);
const elements = (tag) => [
  ...index.matchAll(
    new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}\\s*>`, "gi"),
  ),
];

function namedBy(attributes) {
  if (attributes["aria-label"]?.trim()) return true;
  const ids = attributes["aria-labelledby"]?.trim().split(/\s+/);
  return Boolean(
    ids?.length &&
      ids.every((id) => {
        if (!elementsWithIDs.has(id)) return false;
        const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const element = index.match(
          new RegExp(
            `<([a-z][\\w-]*)\\b[^>]*\\bid=["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/\\1\\s*>`,
            "i",
          ),
        );
        return element && text(element[2]);
      }),
  );
}

test("the story page has a language, title, landmarks, and a working skip link", () => {
  assert.ok(
    tags.find(({ tag, attributes }) => tag === "html" && attributes.lang),
  );
  assert.equal(elements("title").length, 1);
  assert.ok(text(elements("title")[0][2]));
  assert.equal(elements("main").length, 1);
  assert.equal(elements("h1").length, 1);
  const firstLink = tags.find(({ tag }) => tag === "a");
  assert.ok(firstLink.attributes.href.startsWith("#"));
  const target = elementsWithIDs.get(firstLink.attributes.href.slice(1));
  assert.ok(target, "Skip link must point to an existing element");
  assert.ok(
    "tabindex" in target,
    "Skip target must be programmatically focusable",
  );
});

test("local page assets and their CSS/module dependencies exist", () => {
  const inspected = new Set();
  function inspect(reference, base) {
    if (
      !reference ||
      reference.startsWith("#") ||
      /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(reference)
    )
      return;
    const url = new URL(reference, base);
    url.search = "";
    url.hash = "";
    assert.ok(existsSync(url), `Missing local reference: ${url.pathname}`);
    if (inspected.has(url.href) || !statSync(url).isFile()) return;
    inspected.add(url.href);
    if (url.pathname.endsWith(".css")) {
      const css = readFileSync(url, "utf8");
      for (const [, asset] of css.matchAll(
        /url\(\s*["']?([^\s"')]+)["']?\s*\)/g,
      ))
        inspect(asset, url);
      for (const [, asset] of css.matchAll(/@import\s+["']([^"']+)["']/g))
        inspect(asset, url);
    }
    if (url.pathname.endsWith(".js")) {
      const module = readFileSync(url, "utf8");
      for (const [, , dependency] of module.matchAll(
        /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)(["'])(\.[^"']+)\1/g,
      ))
        inspect(dependency, url);
    }
  }
  for (const { attributes } of tags) {
    for (const name of ["src", "href", "poster"])
      inspect(attributes[name], pageURL);
    for (const source of attributes.srcset?.split(",") ?? [])
      inspect(source.trim().split(/\s+/)[0], pageURL);
  }
  const scripts = tags.filter(({ tag }) => tag === "script");
  assert.ok(scripts.length, "The story needs a browser entrypoint");
  for (const { attributes } of scripts) {
    assert.equal(attributes.type, "module");
    assert.ok(
      attributes.src?.startsWith("./"),
      "Browser modules must be served locally",
    );
  }
});

test("dialogs, controls, and meaningful images expose accessible names", () => {
  const dialogs = tags.filter(({ tag }) => tag === "dialog");
  assert.ok(
    dialogs.length,
    "Project tools should expose their dialog semantics",
  );
  for (const { attributes } of dialogs)
    assert.ok(namedBy(attributes), `Unnamed dialog: ${attributes.id}`);
  const buttons = tags.filter(({ tag }) => tag === "button");
  const buttonContent = elements("button");
  buttons.forEach(({ attributes }, number) =>
    assert.ok(
      namedBy(attributes) || text(buttonContent[number][2]),
      "Button needs an accessible name",
    ),
  );
  for (const { tag, attributes } of tags) {
    if (tag === "img")
      assert.ok("alt" in attributes, "Every image needs an alt attribute");
    if (
      ["input", "textarea", "select"].includes(tag) &&
      attributes.type !== "hidden"
    ) {
      const label = tags.find(
        ({ tag: labelTag, attributes: labelAttributes }) =>
          labelTag === "label" && labelAttributes.for === attributes.id,
      );
      assert.ok(
        namedBy(attributes) || label,
        `Unlabelled field: ${attributes.id}`,
      );
    }
  }
});

test("markup uses unique IDs and contains no inline event handlers", () => {
  const ids = tags.map(({ attributes }) => attributes.id).filter(Boolean);
  assert.equal(
    new Set(ids).size,
    ids.length,
    "IDs must be unique for labels and focus targets",
  );
  for (const { tag, attributes } of tags) {
    for (const name of Object.keys(attributes))
      assert.ok(!/^on[a-z]/.test(name), `Inline handler ${name} on ${tag}`);
  }
});
