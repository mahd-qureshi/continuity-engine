# Contributing

Continuity Engine is a small experiment. Changes should make the core question
clearer rather than turn it into a general narrative platform.

## Local loop

```bash
git switch -c feat/short-description
npm run verify
python3 -m http.server 4173
```

Open a pull request that explains why the change exists, how it was verified,
and what was deliberately left out.

## Commit style

Use one coherent change per commit and an imperative subject:

```text
feat(memory): expose diversity penalty in the inspector
fix(planner): reject one-use beats during deeper search
docs(adr): explain deterministic tie-breaking
```

Avoid activity-only commits such as `updates`, `worked on UI`, or `final`.

## Project constraints

- Keep the engine free of browser and network dependencies.
- Make time and randomness explicit inputs.
- Add a regression test for every engine bug.
- Use only original or correctly licensed story content and assets.
- Document new scoring constants and their tradeoffs.
