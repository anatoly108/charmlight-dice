# Upstream Roll Correctness Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Bring verified upstream bug fixes into Charmlight's private dice copy while preserving backend-supplied outcomes.

**Architecture:** Retain the existing renderer, physics engine, public methods and themes. Port targeted changes from upstream pull requests rather than importing their unrelated features and visual redesigns.

**Tech Stack:** Existing Three.js, cannon-es and Vite; Node's built-in test runner.

**Spec:** User request in this session: import upstream bug fixes; the backend supplies the random number.

## Global Constraints

- Preserve existing variable and function names and current rendering dependencies.
- Keep supplied-result notation and return formats compatible.
- Deliver a reviewable pull request against `main`.

## Review Focus

- Idle time before reroll must not fast-forward the animation.
- Configuration changes must preserve an omitted custom finish.
- Explicit null custom finishes and empty texture overrides must trigger theme loading.
- Enabling sound must load impact clips and tolerate collisions while banks are pending.
- Supplied d20 values and added dice must match final face geometry.

### Task 1: Reproduce and port targeted fixes

**Files:** Modify `src/DiceBox.js`, `package.json`; create regression tests in `tests/` and dependency lockfile.

**Interfaces:** Existing `reroll(diceIdArray)`, `updateConfig(options)`, `roll(notationSting)`, `add(notationSting)` remain unchanged.

- [x] Run regression tests on the upstream baseline; verify stale reroll timing and configuration failures.
- [x] Port upstream #20's `last_time` reset and the `updateConfig` corrections from upstream #21, commit `3371f897fdffbad8138bd366e907622333ed30f1`.
- [x] Run the full suite, including 1–20 supplied d20 results and added-dice completion.
- [x] Run the library build and review the final diff before opening a pull request.

## Investigation decisions

- The original #21 wake-up guard is redundant on this baseline: `spawnDice()` replaces reset bodies with awake dynamic bodies. The added-dice test passes without it. Keep that regression test rather than claiming an unproven fix.
- Defer #17's hover/click features and #21's later multi-colorset methods, lifecycle rewrite, packaging changes and theme redesign; these need separate review.
- Await sound loading when enabling it, matching `initialize()` semantics, instead of adopting the later branch's fire-and-forget loader.

## Final review

- Independent review confirmed the targeted timing change and identified a sound-loading collision race. Reproduced with a failing integration test, then ported upstream missing-bank guards.
- Narrowed reset documentation to the supported properties; existing named-colorset caching is documented rather than redesigned.
- Deferred lifecycle/theme rewrites and interaction features remain separate work. Browser visual/device verification remains outside these headless correctness checks.
