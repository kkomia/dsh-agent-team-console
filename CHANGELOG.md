# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2026-10-17

Visual-first agent stage with snapshot contract version 3.

### Added

- Snapshot contract v3: per-member `stats` (turns, steps, token usage buckets, `llmMs`, `toolMs`,
  `workingMs`, `idleMs`, `wallMs`, `workingRatio`, and `live`) and a per-team aggregated `stats` row
  with recomputed `workingRatio`. Stats come from the optional `sessionProjections` service
  (`sessionStats` and `tokenUsage`) with two bounded projection reads per member and no session-log
  scans.
- Optional `sessionProjections` service support: an absent service, a missing projection unit, or a
  throwing read degrades every stat to null without failing the snapshot.
- Workspace-first team headers: the project/workspace name now leads each team section, followed by
  the Lead, a working-vs-idle donut with a work/idle caption, team rounds, team token totals, and the
  in-progress count.
- Animated SVG agent stage: one node per member (Lead first; up to 8 plus a "+N" overflow node), with
  token-scaled node radius, a working-ratio arc ring, a running pulse/orbit, a provisioning dashed
  spin, muted idle nodes, a static failed ring, and a tiny "N rounds · X tok" line.
- Hover/focus member detail card: model, rounds, steps, token breakdown (uncached input, cache read,
  cache write, output, total), and working / idle time.
- Token-usage chip in the status strip (five chips total) and a compact per-team task summary line
  (in-progress / pending / blocked) with an in-progress-only expand.
- Host tests for the v3 stats mapping, missing/throwing projection degradation, ratio clamping, and
  team aggregation (39 tests total).

### Changed

- Replaced the text roster chips with the animated SVG agent stage.
- Replaced the in-progress task cards and collapsed task groups with a one-line task summary plus
  on-demand in-progress rows.
- Removed the activity list from the panel; the wire contract still carries it for API consumers.
- Package version bumped to 1.2.0, and `verify-live` now validates the v3 contract.

### Notes

- The snapshot contract is now version 3. It adds fields only; the endpoint stays read-only,
  same-origin, admission-checked, and mutation-free.
- Session projections are optional: without them the panel still renders, with dashes for statistics.
- No change to the plugin manifest wiring, admission behavior, polling transport, project filter, or
  the zero-dependency policy.

## [1.1.0] - 2026-10-17

Project-scoped, in-progress-first dashboard with snapshot contract version 2.

### Added

- Project/workspace view: every listed team carries `project: { id, title, path }` or `null`, resolved
  best effort from the optional Host `workspaceRegistry` service (session ownership first, then a
  case-insensitive workspace-path match) with a Lead-session cwd fallback. Teams without either stay
  listed with no project.
- Top-level `projects[]` aggregation (`teams`, `activeTeams`, `running`, `inProgress`), ordered by
  active teams, then team count, then title.
- Project filter in the panel header: a native select shown when more than one project has live teams,
  defaulting to "All projects". The selection is client-side only and is not persisted; duplicate
  project titles are disambiguated with a short path tail.
- Active-first snapshot ordering: teams are sorted active first, then by most recent activity.
- Per-team `active`, per-member `active` (running or provisioning), and per-task `active` (in
  progress) flags; per-team counts add `idle` and `ready`; top-level totals add `activeTeams`,
  `pending`, `inProgress`, and `blocked`.
- In-progress-first UI: in-progress task cards first, compact pending one-line rows, and a collapsed
  "Completed N" toggle per team; active teams expand by default and idle teams stay collapsed.
- Compact status strip and active-first roster chips (up to 8 per team, with an "N more" chip); member
  chips open the member session when `uiWorkspace` is available.
- Host tests for project resolution, `projects` aggregation and ordering, active-first ordering, the
  new counts and active flags, and version 2 route behavior.

### Changed

- Replaced the four KPI cards with a one-row status strip (in-progress, running, blocked, pending;
  zero values muted).
- Replaced the three-column kanban task board with in-progress-first task sections.
- Reduced the rendered activity list from 12 to 8 entries per team; the host still assembles up to 40.
- Updated the READMEs and design notes for the project-scoped, in-progress-first behavior and the
  version 2 snapshot contract.
- Package version bumped to 1.1.0.

### Notes

- The snapshot contract is now version 2. The version 1 shape only gains fields; the endpoint stays
  read-only, same-origin, admission-checked, and mutation-free.
- No change to the plugin manifest wiring, admission behavior, polling transport, or the
  zero-dependency policy.

## [1.0.0] - 2026-10-17

Initial public release of the plugin source.

### Added

- Host half (`index.js`): a read-only `GET /api/team-console/snapshot` route registered through
  `ctx.effect`, aggregating live teams from the optional `agentTeams`, `agents`, and `sessions`
  services into one JSON-safe snapshot (contract version 1).
- Snapshot content: per-team counts, Lead-first member roster with status, model, context mode,
  provider, last activity, turn and step counters, and diagnostics; shared task board with owners,
  blockers, readiness, and advisory write scopes; bounded team and task activity timeline derived from
  the Lead session log.
- Graceful degradation: `unsupported` snapshots when Agent Teams is not mounted, JSON 404 for unknown
  routes, JSON 500 for unexpected aggregation failures, and bounded text fields.
- Client half (`client.js`): self-registering browser bundle that adds a "Team console" sidebar entry
  and a main panel with KPI cards, roster, kanban task board, and activity timeline.
- Polling every 2 seconds while the panel is mounted and the tab is visible, with an in-flight guard,
  abort-on-unmount, a manual refresh button, and a reconnect hint that keeps stale data visible.
- States for loading, empty, unsupported service, hard error with retry, and stale data.
- Bilingual Chinese and English dictionaries through the DSH client locale service, plus
  theme-token-only styling, reduced-motion support, and keyboard-accessible member cards.
- Optional navigation: clicking a member card opens that member's session when `uiWorkspace` is
  available.
- Host snapshot contract and defensive-parsing tests using `node:test` with no dependencies
  (`test/snapshot.test.mjs`).
- Bundle manifest, Cordis patch, plugin icon, and English and Chinese display metadata.
- Public documentation: English and Chinese READMEs, design notes, contributing guide, and this
  changelog.
