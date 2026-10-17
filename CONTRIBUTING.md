# Contributing to Agent Team Console

Thanks for taking a look. This is a small, deliberately narrow plugin: a read-only dashboard for
Agent Teams in the DeepSeek Harness (DSH) Web UI. Contributions that keep it small, dependency-free,
and read-only are very welcome.

This guide covers the project scope, local setup, coding conventions, DSH plugin rules, and the pull
request flow.

## Project scope

In scope:

- More accurate or more resilient snapshot aggregation in the host half.
- Clearer presentation of roster, task board, and activity data in the panel.
- Accessibility, keyboard, theme, and reduced-motion improvements.
- Bilingual copy fixes (Chinese and English dictionaries must stay in sync).
- Tests for defensive parsing and the HTTP contract.
- Documentation corrections.

Out of scope, by design:

- Any mutation of team, member, task, or session state (spawn, rename, interrupt, claim, complete,
  delete, reassign).
- Write endpoints, request bodies, or write access to disk.
- External network calls, telemetry, analytics, CDNs, or remote assets.
- New runtime dependencies, a bundler, a build step, or a test framework.
- Replacing the official Agent Teams service or UI.

If you are unsure whether an idea fits, open an issue first and describe it.

## Before you start

- Node.js **22.19 or newer** for the test tooling (the package's `engines.node`). The plugin itself
  does not need a separate Node installation when it runs inside DSH.
- A DSH **0.2.1-rc.2** Web or desktop app if you want to test the panel in a live UI.
- The official experimental **Agent Teams bundle** mounted in the same profile if you want live team
  data to appear; without it the panel correctly shows an "unsupported" notice.
- No `npm install` and no package manager setup: the package has zero dependencies.

## Development setup

1. Fork and clone the repository.
2. Work directly on a branch; there is no build step and no generated output to run.

```sh
git clone https://github.com/<your-fork>/dsh-agent-team-console.git
cd dsh-agent-team-console
node --version
```

`client.js` is a hand-written, committed browser bundle. Editing it is enough; nothing compiles it.

## Running checks

Run these before opening a pull request:

```sh
node --check index.js
node --check client.js
node --test test/snapshot.test.mjs
node scripts/ci-guard.mjs
```

`npm run check` runs the first three checks. The same commands run in CI on Node 22 and Node 24, so
run them locally on the same major version you target.

`node scripts/ci-guard.mjs` validates the cross-file DSH wiring: manifest fields, the exact
`engines.dsh` range, bundle patch references, exported client entry, the client bundle's
self-registration id, and locale metadata. Keep those invariants intact when renaming files or
changing exports.

To test a change in a live app, install the package into a DSH profile using an absolute local path
as the install spec, restart the app so the host half reloads, then open the panel. Host log lines
are prefixed `[agent-team-console]`. To probe the snapshot route of a running server:

```sh
TEAM_CONSOLE_URL=http://127.0.0.1:10100 node scripts/verify-live.mjs
```

It exits `0` when the v1 contract matches, `1` on an unreachable route or contract violation, and `2`
when admission rejects the request as unauthenticated. A `2` is expected against a running DSH
desktop app: the route enforces DSH connection admission, so an anonymous command-line probe is
answered with a JSON 401 before any snapshot logic; it is not a plugin failure.

## Repository layout

| Path | Contents |
| --- | --- |
| `index.js` | Host half: read-only snapshot route and aggregation. No `import` statements. |
| `client.js` | Client half: self-registering browser bundle (slots, locale, panel, polling). |
| `cordis.patch.yml` | Bundle patch that inserts the plugin into the profile's loader. |
| `package.json` | DSH bundle/client metadata, exports, scripts, engines. |
| `locale/*.json` | Display metadata (title and description) for the Plugins page. |
| `test/snapshot.test.mjs` | Dependency-free host contract and unit tests. |
| `scripts/ci-guard.mjs` | Manifest and wiring guard (used by CI). |
| `scripts/verify-live.mjs` | Live snapshot probe for a running server. |
| `docs/design.md` | Architecture, HTTP contract, and design rationale. |
| `CHANGELOG.md` | Release notes, shipped in the package for the npm page. |
| `README.zh.md` | Chinese README, kept structurally equivalent to `README.md`. |

## Coding conventions

Match the existing style; there is no formatter configuration to run and no lint step.

### JavaScript style

- ES modules (`"type": "module"` in `package.json`).
- Two-space indentation, single quotes, no semicolons at statement ends.
- JSDoc comments for exported functions and for non-obvious helpers.
- Prefer small pure helpers in `index.js` so they can be tested with plain Node.
- Defensive code: a failing optional service read must degrade to `null`, an empty list, or a
  fallback label. Nothing in the request path may throw or reject.
- Do not add emoji to code, comments, UI strings, documentation, or commit messages. This is a
  project-wide rule.

### Host half (`index.js`) rules

- **Zero `import` statements.** The test suite imports the file with plain Node, so imports would
  make it unloadable in that context.
- Export `inject = ['webServer']` and an `apply(ctx)` that registers the route inside
  `ctx.effect(...)`, so disposal removes it.
- Apply admission at the start of the route handler through the optional `connection` service's
  admission check, and fail closed with a JSON 401 when that check throws. Hosts without the service
  keep their own access control. Never add a second authentication mechanism.
- Resolve optional services with `ctx.get(...)` per request and guard every call. Missing Agent
  Teams support must produce a valid `unsupported` snapshot, not an error.
- Keep the host stateless: no mutable module state, no timers, no filesystem access, no mutation of
  service objects.
- Every response must be JSON-safe. Convert branded ids with `String(...)`, replace `undefined`
  with `null`, cap long strings, and catch unexpected aggregation errors into a valid JSON 500.
- Keep the snapshot contract versioned (`VERSION`). Additive fields are fine; removing or renaming a
  field requires a version bump and matching client support.

### Client half (`client.js`) rules

- Self-register through `window.__ModuleLoader__.load`, with `id` equal to the package name.
- The factory may `require('react')` and nothing else. Never require a `@deepseek-ai/*` package, and
  do not add a third-party bundle.
- Register locale dictionaries, the sidebar entry, and the main panel inside `apply(ctx)` (locale
  registration inside `ctx.effect(...)`). Unloading must dispose everything.
- The panel must not write to `document.body`, attach global listeners outside React effects, or
  leave intervals or fetches alive after unmount.
- Fetch the snapshot with a relative same-origin URL, `cache: 'no-store'`, an in-flight guard, and an
  `AbortController` cleaned up on unmount. Polling pauses while the tab is hidden.
- Use only `--dsw-*` theme tokens for colors, borders, and backgrounds; do not hardcode colors.
- Every visible string goes through `t(...)`. Keep the Chinese and English dictionaries key-for-key
  identical.
- Keep member cards keyboard accessible (role, tab index, Enter/Space) and respect
  `prefers-reduced-motion`.

### Tests

- Tests use `node:test` and `node:assert/strict` only; no test framework and no network access.
- Drive the host from fake Cordis services and fake session logs, as the existing suite does.
- Cover defensive behavior: unknown event shapes, missing services, throwing services, connection
  admission (401, 403, and fail-closed on a throwing check), JSON safety, and the 200/404/500 route
  shapes.
- A new snapshot field or behavior change should come with a test that would fail without the change.

### Manifest and DSH plugin rules

The DSH loader depends on these cross-file invariants; `scripts/ci-guard.mjs` enforces them:

- `package.json` keeps a `dsh.bundle.patch` pointing at `cordis.patch.yml`; the client half declares
  `dsh.client.platform: "web"` and `dsh.client.immediately: true`.
- `cordis.patch.yml` inserts exactly the bundle row whose `id` and `name` match the package.
- `exports['./client']` points at the browser bundle, and `files` includes every runtime file the
  plugin needs (`index.js`, `client.js`, `cordis.patch.yml`, `icon.svg`, `locale/*.json`) plus
  `CHANGELOG.md`, `CONTRIBUTING.md` and `docs/` so documentation links resolve on the npm package
  page.
- Keep `engines.dsh` at `>=0.2.1-rc.2 <0.3.0-0` unless the tested DSH range changes; the trailing
  `-0` also rejects 0.3.0 prereleases, and the manifest guard checks the exact value.
- The client registration `id` equals the package name.
- Locale metadata files remain valid JSON with `meta.title` and `meta.description`.

Do not publish, tag releases, or bump the version in a pull request; releases are cut by
maintainers.

## Commit messages

- Write an imperative subject line that describes the change ("Fix stale hint after a failed poll",
  not "fixed stuff").
- Explain the reason in the body when it is not obvious from the diff.
- Keep one logical change per commit where practical.

## Pull request flow

1. Fork the repository and create a branch from `main`.
2. Make the change, keeping the read-only and dependency-free guarantees intact.
3. Run the checks listed above, including `scripts/ci-guard.mjs`.
4. If behavior or UI copy changed, update `README.md`, `README.zh.md` and `CHANGELOG.md` under
   `Unreleased`, keeping the two READMEs structurally equivalent.
5. Open a pull request that explains what changed, why, and how it was verified. Screenshots are
   welcome only when captured from a real running instance; do not add mock screenshots.
6. CI must pass. A maintainer reviews the diff and may ask for a smaller change or a test.
7. Do not run `git push --force` against a shared branch, and do not include unrelated formatting
   churn.

## Reporting bugs and requesting features

Open a GitHub issue at <https://github.com/kkomia/dsh-agent-team-console/issues> and include:

- The DSH version, the profile name, and the operating system.
- The plugin version (from the Plugins page or `package.json`).
- What you expected and what happened instead; which panel state was shown (loading, error, stale,
  unsupported, empty).
- Any browser console error and the relevant host log lines (they are prefixed
  `[agent-team-console]`). Redact session content and anything private before posting.

Feature requests that require mutation controls, external services, or new dependencies are likely
to be declined because they conflict with the project's scope.

## Security

This plugin serves one read-only route on the local Harness Web server and keeps the snapshot within
your own instance. If you believe you found a security issue, please report it privately through the
repository's security advisories instead of opening a public issue, and do not include tokens,
cookies, session content, or other secrets in a report.

## License of contributions

By contributing, you agree that your contributions are licensed under the MIT License, the same
license as the project. See [LICENSE](LICENSE).
