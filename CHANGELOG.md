# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
