# How much do the memory weights matter?

Reproduce with `npm run experiment`.

## Question

Recall scores a memory as a weighted sum of four components. The shipped
defaults were chosen by taste:

```text
tags 0.40 · recency 0.25 · intensity 0.20 · relationship 0.15
```

Taste is a bad reason to keep a number if the number does not matter, and a
worse reason if it matters enormously. So: sweep every weighting on a simplex
grid (step 0.1, 286 vectors summing to 1), replay one fixed playthrough under
each, and measure how far the recalled set drifts from the default.

Playthrough: `tell-truth → reassure → sacrifice`.

## Result

| | |
|---|---|
| Weight vectors tested | 286 |
| Recall identical to default | **15 (5.2%)** |

Pushing a single component to 0.9 or above, and measuring the share of turns
whose recalled memories change:

| Dominant component | Turns changed |
|---|---|
| intensity | 100% |
| relationship | 100% |
| recency | 67% |
| **tags** | **33%** |

## Reading it

**The weights are load-bearing.** Only 5% of weightings reproduce the default
recall. This is not a knob that could be dropped for a flat average.

**Tag overlap is the most stable dimension.** When tags dominate, two thirds of
turns still recall what the default recalls; when intensity or relationship
dominates, every turn changes. Relevance to what was just said is doing the
work, and the other three components are adjusting it at the margin.

**Intensity and relationship are the volatile ones.** Both are properties of a
memory alone rather than of the memory *in context*, so weighting them heavily
makes recall ignore the conversation — the same few dramatic memories surface
regardless of what the scene is about. That is the failure mode the default
weighting is guarding against, and it is why tags carry the largest share.

## Caveats

One scenario and one playthrough. This measures sensitivity, not quality —
"different from the default" is not "worse than the default", and nothing here
establishes that the default is optimal. It establishes that the choice matters
and which direction is dangerous.

A stronger version would score recall against human judgements of which memory
*should* surface. That needs data this project does not have.
