# Source layout

Three layers, dependencies point one direction only (enforced in `eslint.config.js`):

```
adapters  ──▶  pipeline  ──▶  core
   │                            ▲
   └────────────────────────────┘
```

- **`core/`** — git primitives and the tag schema. Reads/derives state from git. Pure
  where possible. Imports nothing from `pipeline/` or `adapters/`.
- **`pipeline/`** — the deterministic domain: legal transitions, next-legal-action
  derivation, claim/advance semantics, rejection loop-back. Imports `core/` only,
  never `adapters/`.
- **`adapters/`** — edges to the outside world: the tag-notifier HTTP service, the MCP
  tools, and the git hook installer. May import `pipeline/` and `core/`.

State authority: git tags are the single source of truth. Pipeline state is _derived_
from the tags present, never stored separately. Given the tag set, the next legal
action for any task must be unambiguous from git alone (the determinism guarantee).
