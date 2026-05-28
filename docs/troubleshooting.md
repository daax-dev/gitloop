# Troubleshooting

Remember the golden rule: **git tags are the source of truth.** The notifier and its
events are advisory. Most "nothing happened" symptoms are timing or configuration, not
lost state — when in doubt, `git fetch --tags` and inspect `git tag -l`.

## Quick reference

| Symptom                                   | Likely cause                                         | Fix                                                        |
| ----------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| Hook never fires                          | `curl` missing / hook not installed / not a tag push | Install `curl`, run `pnpm install:hook`, push a tag        |
| Notifier shows nothing right after a push | Advisory timing (pre-push fires before tag lands)    | Re-derive from git; check `/state`, not just `/events`     |
| Push feels slow when notifier is down     | `curl -m 2` cap on an unreachable host               | Start the notifier, or accept the bounded 2s delay         |
| `claim_task` returns `lost`               | Another worker won the claim race                    | Expected — move to another pending task                    |
| `advance_task` blocked: artifact missing  | Required artifact not committed at `HEAD`            | Commit the artifact, then advance                          |
| Config change has no effect               | Wrong path / discovery location / workers disagree   | Fix `GITLOOP_CONFIG` or `.gitloop/pipeline.json`; sync all |
| `EADDRINUSE` on notifier start            | Port already in use                                  | Change `GITLOOP_NOTIFIER_PORT` or free the port            |
| `tsx` / engine errors                     | Wrong Node version                                   | Use Node 22 (`.nvmrc`)                                     |

---

## The hook does not fire

The pre-push hook is what POSTs pushed tags to the notifier. If the notifier records no
events on a push, check, in order:

1. **`curl` is missing.** The hook uses `curl` to POST. If `curl` is not on `PATH`, the
   notification is silently skipped (the push still succeeds). Verify:
   ```bash
   curl --version
   ```
2. **The hook is not installed.** Confirm the hook exists and is executable in the repo
   you are pushing from:
   ```bash
   cat "$(git rev-parse --git-path hooks)/pre-push"
   ```
   It should contain the line `# gitloop pre-push hook`. If not, install it:
   ```bash
   pnpm install:hook /path/to/repo
   ```
3. **`GITLOOP_NOTIFIER_URL` points elsewhere.** The hook POSTs to
   `$GITLOOP_NOTIFIER_URL` (default `http://127.0.0.1:7777`). If the notifier listens on
   a different port, set the URL in the environment git runs the push from:
   ```bash
   export GITLOOP_NOTIFIER_URL=http://127.0.0.1:7777
   ```
4. **You are not pushing a tag.** The hook only forwards `refs/tags/*` pushes. Pushing a
   branch fires nothing. Tag deletions (all-zero sha) are also skipped. Push a real tag:
   ```bash
   git push origin refs/tags/TASK-1
   ```

> The hook also drops any tag name containing characters outside
> `a-zA-Z0-9/_.-` (a JSON-injection guard). Valid pipeline tags are always within this
> set, so this only matters if you push unusually named tags.

## The notifier shows nothing immediately after a push

This is usually **expected advisory timing**, not a bug. The hook is `pre-push`, so it
fires _just before_ the tag lands on the remote (git has no post-push hook — see
arch-010). The event POST and the actual ref update race; the event may show up a
moment later, or the push may even be rejected after the event was sent.

Do not treat the absence of an event as missing state. Re-derive from git, which is
authoritative:

```bash
git fetch --tags
git tag -l
# or ask the notifier to derive live state from tags:
curl http://127.0.0.1:7777/state
```

`/state` derives from current tags on demand, so it is reliable even when the event
queue lagged.

## Push feels slow when the notifier is down

If the notifier host is **unreachable** (e.g. a blackholed address rather than simply
refused), `curl` waits up to its bounded timeout before giving up. The hook caps this
with `curl -m 2`, so the worst case is roughly a 2-second pause, after which the push
proceeds normally — the hook never fails the push.

- A **refused** connection (notifier process down on localhost) returns almost
  instantly; the push is not noticeably delayed.
- A **blackholed/unreachable** host hits the 2-second cap.

Fix by starting the notifier, or pointing `GITLOOP_NOTIFIER_URL` at a reachable
address. Functionally nothing is lost either way — the event is advisory.

## `claim_task` says `lost`

When `claim_task` returns:

```
outcome: "lost"
claimed: false
```

another worker won the atomic claim race for that step. **This is expected** under
concurrency — the claim tag's ref update is a compare-and-swap and exactly one worker
wins. The returned `owner` field tells you who holds the claim. Move on to another
pending task from `get_pending_tasks`; do not retry the same claim.

## `advance_task` blocked by "required artifact missing"

If a step declares a `requiredArtifact`, `advance_task` checks it at `HEAD` before
pushing the step's tag. When it is absent you get:

```
advanced: false
reason:   "required artifact missing at HEAD: <path>"
```

The check is against `HEAD` — the commit the tag would point at — not the working tree.
Staging is not enough: **commit** the artifact, then advance.

```bash
git add <path>          # e.g. docs/TASK-1/design.md
git commit -m "TASK-1: artifact"
# re-run advance_task; the gate now passes
```

The `<path>` is the step's `requiredArtifact` with `{taskId}` substituted (e.g.
`docs/TASK-1/design.md`). See [Adding steps](./adding-steps.md).

## Config changes are not taking effect

Pipeline config is resolved **once at process startup**, in this order:

1. `GITLOOP_CONFIG=<path>` — explicit JSON file (startup **errors** if unreadable or
   invalid; it does not fall back).
2. `<GITLOOP_REPO>/.gitloop/pipeline.json` — auto-discovered if present.
3. The five shipped default steps.

Checklist:

- **Restart the server.** Config is loaded at startup; a running MCP server/notifier
  will not pick up edits until restarted.
- **Check `GITLOOP_CONFIG`.** If set, it wins over discovery. Make sure it points at the
  file you intend.
- **Check the discovery location.** Auto-discovery looks specifically at
  `<GITLOOP_REPO>/.gitloop/pipeline.json`. Confirm both `GITLOOP_REPO` and the file
  location:
  ```bash
  echo "$GITLOOP_REPO"
  ls "$GITLOOP_REPO/.gitloop/pipeline.json"
  ```
- **All workers must share the same config.** If one worker uses a different pipeline,
  it derives a different "next action" and handoffs desync. Distribute one config to
  every worker (commit `.gitloop/pipeline.json` to the repo).

An invalid config surfaces a `PipelineConfigError` at startup — for example a step name
that is not lowercase-kebab, a duplicate step name, or an empty `steps` array.

## Port already in use

If `pnpm start:notifier` fails with an address-in-use error (`EADDRINUSE`), something
else holds the port (default `7777`). Either pick another port:

```bash
GITLOOP_NOTIFIER_PORT=7778 pnpm start:notifier
```

and set the hook's URL to match (`GITLOOP_NOTIFIER_URL=http://127.0.0.1:7778`), or free
the existing port. An out-of-range port value (`< 0` or `> 65535`) also fails at startup
with an invalid-port error.

## Wrong Node version

gitloop requires **Node 22** (the `engines` field is `>=22 <23`, pinned in `.nvmrc`).
On a different major version, `tsx` or dependency installs may fail. With `nvm`:

```bash
nvm use        # reads .nvmrc → Node 22
node -v        # should report v22.x
```

## See also

- [Getting started](./getting-started.md)
- [Adding steps](./adding-steps.md)
- [FAQ](./faq.md)
