#!/usr/bin/env node
/**
 * Live verification for the dsh-agent-team-console plugin.
 * ============================================================================
 * Probes the installed Host half at
 *
 *   GET <TEAM_CONSOLE_URL>/api/team-console/snapshot
 *
 * and validates the v2 snapshot contract field by field. Dependency-free: it
 * needs only Node.js 22+ (global fetch + AbortController), so it can run on any
 * machine that can reach the Harness Web server.
 *
 * Usage:
 *   node scripts/verify-live.mjs
 *   TEAM_CONSOLE_URL=http://127.0.0.1:3000 node scripts/verify-live.mjs
 *
 * Environment:
 *   TEAM_CONSOLE_URL  Base URL of the Harness Web server. Defaults to
 *                     http://127.0.0.1:10100. The snapshot route path is
 *                     appended, so pass a base URL only.
 *
 * Exit codes:
 *   0  the route is reachable and the snapshot matches the v2 contract
 *   1  the route is unreachable, the response is not JSON, or the contract is
 *      violated
 *   2  the server answered 401/403: DSH connection admission rejected the
 *      anonymous probe, nothing was verified (expected against a DSH desktop
 *      app, see below)
 *
 * Authentication note: this script is a plain HTTP client and sends no browser
 * session cookie. The plugin's route enforces the DSH connection admission
 * (Host/Origin fence and browser-session check) when that service is mounted,
 * so an anonymous loopback probe against a running desktop app is rejected with
 * 401. That is expected and is not a plugin failure. Run this script against a
 * dev/web Harness server that exposes the route without that admission, or
 * against an authenticated setup you control.
 * ============================================================================
 */

const BASE = process.env.TEAM_CONSOLE_URL || 'http://127.0.0.1:10100'
const URL_ = BASE.replace(/\/+$/, '') + '/api/team-console/snapshot'

const problems = []
const note = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`)
  if (!ok) problems.push(msg)
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isStr = (v) => typeof v === 'string'
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const isStrOrNull = (v) => v === null || isStr(v)
const isNumOrNull = (v) => v === null || isNum(v)

// ---- fetch ---------------------------------------------------------------
let res
try {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  res = await fetch(URL_, { signal: controller.signal, headers: { accept: 'application/json' } })
  clearTimeout(timer)
} catch (err) {
  note(false, `route reachable (${err?.message ?? err})`)
  console.error('\nCannot reach', URL_)
  console.error('Check that the Harness Web server is running and that TEAM_CONSOLE_URL is correct.')
  process.exit(1)
}

note(true, `route reachable  GET ${URL_} -> ${res.status}`)

// ---- admission is a distinct, honest outcome ----------------------------
if (res.status === 401 || res.status === 403) {
  console.error('')
  console.error(
    `${res.status === 401 ? 'AUTH REQUIRED' : 'FORBIDDEN'}  the endpoint answered ${res.status}; nothing was verified.`,
  )
  console.error('')
  console.error('The plugin route enforces DSH connection admission (Host/Origin fence and')
  console.error('browser-session check) when the connection service is mounted. A command-line')
  console.error('probe sends no browser session, so a running desktop app rejects it with 401.')
  console.error('This is expected, not a plugin failure.')
  console.error('')
  console.error('Run this script against a dev/web Harness server that exposes the route without')
  console.error('that admission, or from an authenticated setup you control. The URL probed was:')
  console.error(`  ${URL_}`)
  process.exit(2)
}

note(res.status === 200, `HTTP status 200 (got ${res.status})`)
note(/application\/json/i.test(res.headers.get('content-type') || ''), 'content-type is JSON')

if (res.status !== 200) {
  console.error('\nThe route answered with an unexpected status; cannot validate the snapshot body.')
  process.exit(1)
}

// ---- parse ---------------------------------------------------------------
let body
try {
  body = await res.json()
  note(true, 'response is valid JSON')
} catch (err) {
  note(false, `response JSON parse (${err?.message ?? err})`)
  process.exit(1)
}

// ---- envelope ---------------------------------------------------------
note(isObj(body), 'body is an object')
note(body.version === 2, `version === 2 (got ${JSON.stringify(body.version)})`)
note(typeof body.ok === 'boolean', 'ok is boolean')
note(isNum(body.generatedAt), 'generatedAt is a number')
note(
  isStrOrNull(body.unsupported),
  `unsupported is string|null (got ${JSON.stringify(body.unsupported)})`,
)
note(isObj(body.totals), 'totals is an object')
note(Array.isArray(body.projects), 'projects is an array')
note(Array.isArray(body.teams), 'teams is an array')
note(JSON.stringify(body).includes('undefined') === false, 'no literal undefined in JSON')

const expectTotals = [
  'teams',
  'activeTeams',
  'members',
  'running',
  'tasks',
  'pending',
  'inProgress',
  'blocked',
  'completed',
]
for (const k of expectTotals) note(isNum(body.totals?.[k]), `totals.${k} is a number`)

// Defensive copies so a stale v1 payload (or a malformed body) still produces a
// clean FAIL summary instead of a TypeError in the middle of the report.
const teams = Array.isArray(body.teams) ? body.teams : []
const projects = Array.isArray(body.projects) ? body.projects : []
if (!Array.isArray(body.teams)) note(false, 'teams is an array (missing or not an array)')
if (!Array.isArray(body.projects)) note(false, 'projects is an array (missing or not an array)')

// ---- projects ------------------------------------------------------------
const projectIds = new Set()
for (const [i, project] of projects.entries()) {
  const tag = `projects[${i}]`
  note(isObj(project), `${tag} is an object`)
  note(isStr(project.id) && project.id.length > 0, `${tag}.id is a non-empty string`)
  note(isStr(project.title) && project.title.length > 0, `${tag}.title is a non-empty string`)
  note(isStrOrNull(project.path), `${tag}.path is string|null`)
  for (const k of ['teams', 'activeTeams', 'running', 'inProgress']) {
    note(isNum(project[k]), `${tag}.${k} is a number`)
  }
  if (isStr(project.id)) {
    note(!projectIds.has(project.id), `${tag}.id is unique (${project.id})`)
    projectIds.add(project.id)
  }
}

// ---- teams ------------------------------------------------------------
console.log(`\n${teams.length} team(s), ${projects.length} project(s); totals ${JSON.stringify(body.totals)}`)
let previousActive = true
for (const [i, team] of teams.entries()) {
  const tag = `teams[${i}]`
  note(isObj(team), `${tag} is an object`)
  note(isStr(team.id), `${tag}.id is a string`)
  note(isStrOrNull(team.error), `${tag}.error is string|null`)
  note(isObj(team.counts), `${tag}.counts is an object`)
  for (const k of [
    'members',
    'running',
    'provisioning',
    'failed',
    'idle',
    'tasks',
    'pending',
    'inProgress',
    'completed',
    'blocked',
    'ready',
  ]) {
    note(isNum(team.counts?.[k]), `${tag}.counts.${k} is a number`)
  }
  note(typeof team.active === 'boolean', `${tag}.active is a boolean`)
  if (team.active !== true) {
    previousActive = false
  } else {
    note(previousActive, `${tag} active teams are ordered before inactive teams`)
  }

  // project: null when the workspace could not be resolved, else an object
  note(team.project === null || isObj(team.project), `${tag}.project is object|null`)
  if (isObj(team.project)) {
    note(isStr(team.project.id) && team.project.id.length > 0, `${tag}.project.id is a non-empty string`)
    note(isStr(team.project.title) && team.project.title.length > 0, `${tag}.project.title is a non-empty string`)
    note(isStrOrNull(team.project.path), `${tag}.project.path is string|null`)
    note(
      projectIds.has(team.project.id),
      `${tag}.project.id ${JSON.stringify(team.project.id)} appears in projects[]`,
    )
  }

  note(Array.isArray(team.members) && team.members.length > 0, `${tag}.members is a non-empty array`)
  const leads = (team.members || []).filter((m) => m.role === 'lead')
  note(leads.length === 1, `${tag} has exactly one lead row (got ${leads.length})`)
  note((team.members || [])[0]?.role === 'lead', `${tag}.members[0] is the lead`)
  for (const [j, m] of (team.members || []).entries()) {
    const t2 = `${tag}.members[${j}]`
    note(isStr(m.id), `${t2}.id string`)
    note(isStr(m.name) && m.name.length > 0, `${t2}.name non-empty string`)
    note(m.role === 'lead' || m.role === 'teammate', `${t2}.role valid (${m.role})`)
    note(
      ['running', 'inactive', 'provisioning', 'failed'].includes(m.status),
      `${t2}.status valid (${m.status})`,
    )
    note(typeof m.active === 'boolean', `${t2}.active boolean`)
    note(
      m.active === (m.status === 'running' || m.status === 'provisioning'),
      `${t2}.active matches status (${m.status})`,
    )
    note(isStrOrNull(m.description), `${t2}.description string|null`)
    note(isStrOrNull(m.provider), `${t2}.provider string|null`)
    note(isStrOrNull(m.model), `${t2}.model string|null`)
    note(m.context === null || m.context === 'fresh' || m.context === 'fork', `${t2}.context valid (${m.context})`)
    note(Array.isArray(m.diagnostics), `${t2}.diagnostics array`)
    note(isNumOrNull(m.lastActivityAt), `${t2}.lastActivityAt number|null`)
    note(isStrOrNull(m.lastEventType), `${t2}.lastEventType string|null`)
    note(isNumOrNull(m.turns), `${t2}.turns number|null`)
    note(isNumOrNull(m.steps), `${t2}.steps number|null`)
  }
  note(Array.isArray(team.tasks), `${tag}.tasks is an array`)
  for (const [j, t2] of (team.tasks || []).entries()) {
    const tt = `${tag}.tasks[${j}]`
    note(isStr(t2.id), `${tt}.id string`)
    note(isNum(t2.revision), `${tt}.revision number`)
    note(isStr(t2.subject), `${tt}.subject string`)
    note(isStr(t2.description) && t2.description.length <= 2000, `${tt}.description string (<=2000)`)
    note(['pending', 'in_progress', 'completed'].includes(t2.status), `${tt}.status valid (${t2.status})`)
    note(typeof t2.active === 'boolean', `${tt}.active boolean`)
    note(t2.active === (t2.status === 'in_progress'), `${tt}.active matches status (${t2.status})`)
    note(isStrOrNull(t2.ownerName), `${tt}.ownerName string|null`)
    note(Array.isArray(t2.blockedBy), `${tt}.blockedBy array`)
    note(typeof t2.ready === 'boolean', `${tt}.ready boolean`)
    note(Array.isArray(t2.writeScopes), `${tt}.writeScopes array`)
    note(Array.isArray(t2.writeScopeWarnings), `${tt}.writeScopeWarnings array`)
  }
  note(Array.isArray(team.activity), `${tag}.activity is an array (<=40)`)
  note((team.activity || []).length <= 40, `${tag}.activity length <= 40`)
  for (const [j, a] of (team.activity || []).entries()) {
    const ta = `${tag}.activity[${j}]`
    note(isNum(a.seq), `${ta}.seq number`)
    note(isNum(a.time), `${ta}.time number`)
    note(a.kind === 'member' || a.kind === 'task', `${ta}.kind valid (${a.kind})`)
    note(isStr(a.action), `${ta}.action string`)
    note(isStr(a.text) && a.text.length > 0 && a.text.length <= 200, `${ta}.text string (1..200)`)
    note(isStrOrNull(a.memberName), `${ta}.memberName string|null`)
    note(isStrOrNull(a.taskId), `${ta}.taskId string|null`)
    note(isStrOrNull(a.subject), `${ta}.subject string|null`)
    note(isStrOrNull(a.status), `${ta}.status string|null`)
  }
  console.log(
    `${tag} ${team.id}: project=${team.project?.title ?? '(none)'} active=${team.active} lead=${leads[0]?.name} members=${team.members?.length} inProgress=${team.counts?.inProgress} pending=${team.counts?.pending}`,
  )
  for (const m of team.members || []) {
    console.log(
      `   - ${m.role.padEnd(8)} ${String(m.name).padEnd(16)} ${String(m.status).padEnd(13)} active=${m.active ? 'yes' : 'no '} model=${m.model ?? '-'} last=${m.lastEventType ?? '-'}`,
    )
  }
  for (const t2 of team.tasks || []) {
    console.log(
      `   * ${t2.id} [${t2.status}] active=${t2.active ? 'yes' : 'no '} ready=${t2.ready} owner=${t2.ownerName ?? '-'} ${t2.subject}`,
    )
  }
  for (const a of (team.activity || []).slice(0, 5)) {
    console.log(`   > ${new Date(a.time).toISOString()} ${a.kind}/${a.action} ${a.text}`)
  }
}

// ---- cross-checks against team rows --------------------------------------
if (teams.length > 0 && isObj(body.totals)) {
  const members = teams.reduce((n, t) => n + (t.members?.length || 0), 0)
  const running = teams.reduce(
    (n, t) => n + (t.members || []).filter((m) => m.status === 'running').length,
    0,
  )
  const activeTeams = teams.filter((t) => t.active === true).length
  const tasks = teams.reduce((n, t) => n + (t.tasks?.length || 0), 0)
  const pending = teams.reduce(
    (n, t) => n + (t.tasks || []).filter((x) => x.status === 'pending').length,
    0,
  )
  const inProgress = teams.reduce(
    (n, t) => n + (t.tasks || []).filter((x) => x.status === 'in_progress').length,
    0,
  )
  const completed = teams.reduce(
    (n, t) => n + (t.tasks || []).filter((x) => x.status === 'completed').length,
    0,
  )
  const blocked = teams.reduce((n, t) => {
    const pendingRows = (t.tasks || []).filter((x) => x.status === 'pending')
    return n + pendingRows.filter((x) => x.ready === false && Array.isArray(x.blockedBy) && x.blockedBy.length > 0).length
  }, 0)
  note(body.totals.teams === teams.length, 'totals.teams matches teams.length')
  note(body.totals.activeTeams === activeTeams, 'totals.activeTeams matches active team rows')
  note(body.totals.members === members, 'totals.members matches member rows')
  note(body.totals.running === running, 'totals.running matches running members')
  note(body.totals.tasks === tasks, 'totals.tasks matches task rows')
  note(body.totals.pending === pending, 'totals.pending matches pending tasks')
  note(body.totals.inProgress === inProgress, 'totals.inProgress matches in-progress tasks')
  note(body.totals.completed === completed, 'totals.completed matches completed tasks')
  note(body.totals.blocked === blocked, 'totals.blocked matches blocked pending tasks')

  // projects[] must describe exactly the listed teams that resolved a project.
  const grouped = new Map()
  for (const team of teams) {
    if (!isObj(team.project)) continue
    const current = grouped.get(team.project.id) || { teams: 0, activeTeams: 0, running: 0, inProgress: 0 }
    current.teams += 1
    if (team.active === true) current.activeTeams += 1
    current.running += (team.members || []).filter((m) => m.status === 'running').length
    current.inProgress += (team.tasks || []).filter((x) => x.status === 'in_progress').length
    grouped.set(team.project.id, current)
  }
  note(
    projects.length === grouped.size,
    `projects.length matches resolved team projects (${projects.length} vs ${grouped.size})`,
  )
  for (const project of projects) {
    const expected = grouped.get(project.id)
    if (expected === undefined) {
      note(false, `projects[] entry ${JSON.stringify(project.id)} owns no listed team`)
      continue
    }
    note(project.teams === expected.teams, `projects[${project.id}].teams matches team rows`)
    note(project.activeTeams === expected.activeTeams, `projects[${project.id}].activeTeams matches team rows`)
    note(project.running === expected.running, `projects[${project.id}].running matches member rows`)
    note(project.inProgress === expected.inProgress, `projects[${project.id}].inProgress matches task rows`)
  }
}

console.log(`\n${problems.length === 0 ? 'ALL CHECKS PASSED' : `${problems.length} CHECK(S) FAILED`}`)
process.exit(problems.length === 0 ? 0 : 1)
