# Adding steps to the pipeline

The pipeline is **config-driven**. You can add, rename, or reorder steps, and any step
can require a committed artifact before its tag is allowed. This guide walks through a
common customization: **adding a design step** with a required design document.

## Goal

Insert a `design` step between `in-progress` and `code-complete`, and require a
`docs/<taskId>/design.md` file to be committed before the task may advance into it:

```
   TASK-N ─▶ in-progress ─▶ design ─▶ code-complete ─▶ test-complete ─▶ review-complete ─▶ merged
                              │
                              └─ requires docs/{taskId}/design.md committed at HEAD
```

## 1. Write the config file

Create `.gitloop/pipeline.json` in the repo (a notifier/MCP server points at via
`GITLOOP_REPO`):

```json
{
  "steps": [
    { "name": "in-progress" },
    { "name": "design", "requiredArtifact": "docs/{taskId}/design.md" },
    { "name": "code-complete" },
    { "name": "test-complete" },
    { "name": "review-complete" },
    { "name": "merged" }
  ]
}
```

Config shape:

- `steps` is a **non-empty, ordered** array. The first entry is the first step a task
  advances into after the bare entry tag; the last entry is terminal.
- Each step has a `name` that must be **lowercase-kebab** (matches
  `^[a-z0-9]+(?:-[a-z0-9]+)*$`), e.g. `design`, `code-complete`. Step names must be
  unique.
- `requiredArtifact` is **optional**. When present it is a non-empty path template;
  `{taskId}` is substituted with the task id (e.g. `docs/TASK-1/design.md`).

## 2. Point a server at the config

A running MCP server and notifier resolve their pipeline config at startup, in this
order:

```
1. GITLOOP_CONFIG=<path>              explicit JSON file (error if unreadable/invalid)
        │ (not set)
        ▼
2. <GITLOOP_REPO>/.gitloop/pipeline.json   auto-discovered if the file exists
        │ (not present)
        ▼
3. DEFAULT_PIPELINE                   the five shipped steps
```

So you have two ways to apply the config above:

```bash
# Option A — auto-discovery: place the file at <repo>/.gitloop/pipeline.json
# (nothing else to set; the server finds it because GITLOOP_REPO points there)
export GITLOOP_REPO="$(pwd)"
pnpm start:mcp
pnpm start:notifier

# Option B — explicit path: point GITLOOP_CONFIG at any JSON file
export GITLOOP_CONFIG=/path/to/pipeline.json
pnpm start:mcp
pnpm start:notifier
```

`GITLOOP_CONFIG` wins if set. If it points at a missing or invalid file, startup
fails with an error — it does **not** silently fall back.

> **All workers must share the same config.** State derivation depends on the step
> list. A worker running a different pipeline would derive a different "next action"
> and the handoff would desync. Commit `.gitloop/pipeline.json` to the repo (or
> distribute the same `GITLOOP_CONFIG` file) so every worker resolves an identical
> pipeline.

## 3. What the new tags look like

Nothing about the tag grammar changes — your new step is just another `<step>` segment
with an always-explicit version:

```
TASK-1
in-progress/TASK-1/v1
design/TASK-1/v1            # the new step
code-complete/TASK-1/v1
test-complete/TASK-1/v1
review-complete/TASK-1/v1
merged/TASK-1/v1
```

A rejection still loops back to the **first** step (`in-progress`) at the next version,
and forward progress re-advances through every step — including `design` — at that
version (`design/TASK-1/v2`, …).

## 4. How the artifact gate blocks advance

When a worker calls `advance_task` to move a task **into** the `design` step, the tool
checks that the required artifact exists at **`HEAD`** — the commit the new tag will
point at. With the config above, the path resolves to `docs/TASK-1/design.md` for
`TASK-1`.

If that file is not committed at `HEAD`, `advance_task` does **not** push a tag. It
returns:

```
advanced: false
reason:   "required artifact missing at HEAD: docs/TASK-1/design.md"
```

To pass the gate, commit the artifact first, then advance:

```bash
mkdir -p docs/TASK-1
# ... write the design doc ...
git add docs/TASK-1/design.md
git commit -m "TASK-1: design"
# now the worker's advance_task into `design` succeeds and pushes design/TASK-1/v1
```

The gate applies only to **forward** advances. A rejection (loop-back) is never gated.

## 5. Renaming and reordering steps

Both are just edits to the `steps` array:

- **Rename**: change a step's `name` (keep it lowercase-kebab). Existing tags using the
  old name are no longer recognized by the new config — only do this on a fresh
  pipeline, or accept that in-flight tasks will not derive correctly.
- **Reorder**: change the position of entries in the array. The order in the file _is_
  the pipeline order; the first entry is the first step and the last is terminal.

Whatever you change, apply the same config to **every** worker. The set of tags plus
the shared config is the entire source of truth.

## See also

- [Getting started](./getting-started.md) — the mental model and a worked walkthrough.
- [FAQ](./faq.md) — config questions and design rationale.
- [Troubleshooting](./troubleshooting.md) — config not taking effect, artifact gate failures.
