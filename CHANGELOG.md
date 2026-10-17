# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.4.0] - 2026-10-17

Top-down layered flow graph and workspace card grid. UI-only release: the snapshot contract stays at
version 4 and the host half does not change.

### Added

- Client layout check: `scripts/client-check.mjs` extracts the self-contained
  `@atc-layout-begin` / `@atc-layout-end` pure layout block from `client.js`, evaluates it with Node, and
  asserts the layered geometry (root topmost and centred, balanced teammate rows below it, row spacing
  and overlap bounds, overflow placement, hand-off edge control points between rows, finite message-edge
  paths, and the empty/single-member cases). CI runs it after the syntax checks.

### Changed

- Replaced the centre-hub/ring interaction graph with a top-down layered data-flow graph: Lead/root at
  the top centre, teammates in balanced rows below (one row for up to 5; otherwise two balanced rows,
  larger first; up to 8 shown plus a "+N" overflow node in the last row), downward hand-off edges with a
  subtle animated dash flow, and curved message arcs that bend upward when both endpoints share a row.
- Replaced the full-width stacked team sections with a responsive grid of workspace block cards: a
  collapsed card shows the status dot, workspace name, in-progress badge, Lead, work-ratio donut,
  rounds/tokens, and work-vs-idle caption; exactly one team expands at a time to a full-row card with the
  full header, graph, and task summary. The default expanded card is the first active team, and an
  explicit collapse sticks across the 2-second polls.
- Updated the READMEs and design notes for the layered graph and workspace card grid; package version
  bumped to 1.4.0.

### Notes

- No snapshot contract change: the endpoint stays at contract version 4 with the same `edges`, stats,
  projects, tasks, and activity payloads. This release changes only the client UI and documentation.
- Everything remains read-only, dependency-free, and local: no new services and no new network calls.

## [1.3.0] - 2026-10-17

Graph-first UI with pixel-art agents and snapshot contract version 4.

### Added

- Snapshot contract v4: every listed team carries `edges[]` — structural `lead` edges (Lead to each
  teammate, weight 1, no timestamp) plus aggregated `message` edges from two bounded sources: live
  `agent-message` deliveries observed in each member's session log (newest 1000 events per listed
  member, Lead included) and legacy `team/message/queued` records in the newest 2000 Lead-session
  events. Weights add across both sources, message counts cap at 99, `lastAt` keeps the newest observed
  time, self-edges and unknown/malformed endpoints are dropped, and edges are deduped and ordered
  lead-first, then weight/lastAt.
- Animated SVG interaction graph: Lead at the center hub, teammates on an evenly spaced ring (up to 8
  plus a "+N" node), faint quadratic lead spokes, curved message chords whose thickness scales with
  weight and opacity with recency, an animated direction flow on recent edges, and a structural star
  fallback when a payload has no edge data.
- Deterministic pixel-art characters: every member is drawn from an SVG rectangle template with a
  theme-token palette (brand outfit and marker for the Lead); running bobs with a work spark,
  provisioning spins and blinks, idle is muted, and failed keeps a static error ring.
- Graph legend and an edge recap in the hover/focus detail card (messages received/sent per member).
- Host tests for the v4 edges: structural edges, live `agent-message` aggregation (lead-to-member,
  member-to-lead, member-to-member), legacy queued aggregation, weights combining across both sources,
  the weight cap, endpoint validation, dedupe/order, the per-member 1000-event and Lead 2000-event
  bounds, and structural-only degradation (50 tests total).

### Changed

- Replaced the linear agent stage with the interaction graph.
- Replaced letter avatars with deterministic pixel-art characters.
- Package version bumped to 1.3.0, and `verify-live` now validates the v4 contract.
- Updated the READMEs and design notes for the graph-first UI and contract version 4.

### Notes

- The snapshot contract is now version 4. It adds fields only; the endpoint stays read-only,
  same-origin, admission-checked, and mutation-free.
- Message edges come from two bounded session-log sources (the newest 1000 events per listed member
  plus the newest 2000 Lead-session events for legacy records): no full-log scan, no new required
  service, and no mailbox rendering.
- The activity list remains wire-only: the contract still carries it for API consumers, but the panel
  does not render it.

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
