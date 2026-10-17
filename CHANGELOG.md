# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
