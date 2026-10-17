#!/usr/bin/env node
/**
 * Live verification for the dsh-agent-team-console plugin.
 * ============================================================================
 * Probes the installed Host half at
 *
 *   GET <TEAM_CONSOLE_URL>/api/team-console/snapshot
 *
 * and validates the v1 snapshot contract field by field. Dependency-free: it
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
 *   0  the route is reachable and the snapshot matches the v1 contract
 *   1  the route is unreachable, the response is not JSON, or the contract is
 *      violated
 *   2  the server answered 401: browser authentication is required, nothing was
 *      verified (expected against a DSH desktop app, see below)
 *
 * Authentication note: this script is a plain HTTP client and sends no browser
 * session cookie. The DSH desktop app's Web server only serves an authenticated
 * browser session and rejects anonymous loopback HTTP requests, so a 401 here
 * is expected against a running desktop app and is not a plugin failure. Run
 * this script against a dev/web Harness server that exposes the route without
 * auth, or against an authenticated setup you control.
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

// ---- authentication is a distinct, honest outcome ------------------------
if (res.status === 401) {
  console.error('')
  console.error('AUTH REQUIRED  the endpoint answered 401 Unauthorized; nothing was verified.')
  console.error('')
  console.error('The DSH desktop app serves its Web UI behind browser session authentication and')
  console.error('rejects anonymous loopback HTTP requests, so a command-line probe cannot read the')
  console.error('snapshot from a running desktop app. This is expected there, not a plugin failure.')
  console.error('')
  console.error('Run this script against a dev/web Harness server that exposes the route without')
  console.error('auth, or from an authenticated setup you control. The URL probed was:')
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
note(body.version === 1, `version === 1 (got ${JSON.stringify(body.version)})`)
note(typeof body.ok === 'boolean', 'ok is boolean')
note(isNum(body.generatedAt), 'generatedAt is a number')
note(isStrOrNull(body.unsupported), `unsupported is string|null (got ${JSON.stringify(body.unsupported)})`)
note(isObj(body.totals), 'totals is an object')
note(Array.isArray(body.teams), 'teams is an array')
note(JSON.stringify(body).includes('undefined') === false, 'no literal undefined in JSON')

const expectTotals = ['teams', 'members', 'running', 'tasks', 'completed']
for (const k of expectTotals) note(isNum(body.totals?.[k]), `totals.${k} is a number`)

// ---- teams ------------------------------------------------------------
console.log(`\n${body.teams.length} team(s) reported; totals ${JSON.stringify(body.totals)}`)
for (const [i, team] of body.teams.entries()) {
  const tag = `teams[${i}]`
  note(isObj(team), `${tag} is an object`)
  note(isStr(team.id), `${tag}.id is a string`)
  note(isStrOrNull(team.error), `${tag}.error is string|null`)
  note(isObj(team.counts), `${tag}.counts is an object`)
  for (const k of ['members', 'running', 'provisioning', 'failed', 'tasks', 'pending', 'inProgress', 'completed', 'blocked']) {
    note(isNum(team.counts?.[k]), `${tag}.counts.${k} is a number`)
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
    note(['running', 'inactive', 'provisioning', 'failed'].includes(m.status), `${t2}.status valid (${m.status})`)
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
  console.log(`${tag} ${team.id}: lead=${leads[0]?.name} members=${team.members?.length} tasks=${team.tasks?.length} activity=${team.activity?.length}`)
  for (const m of team.members || []) {
    console.log(`   - ${m.role.padEnd(8)} ${String(m.name).padEnd(16)} ${String(m.status).padEnd(13)} model=${m.model ?? '-'} last=${m.lastEventType ?? '-'} @${m.lastActivityAt ?? '-'}`)
  }
  for (const t2 of team.tasks || []) {
    console.log(`   * ${t2.id} [${t2.status}] ready=${t2.ready} owner=${t2.ownerName ?? '-'} ${t2.subject}`)
  }
  for (const a of (team.activity || []).slice(0, 5)) {
    console.log(`   > ${new Date(a.time).toISOString()} ${a.kind}/${a.action} ${a.text}`)
  }
}

// Cross-check totals against team rows.
if (body.teams.length > 0) {
  const members = body.teams.reduce((n, t) => n + (t.members?.length || 0), 0)
  const running = body.teams.reduce((n, t) => n + (t.members || []).filter((m) => m.status === 'running').length, 0)
  const tasks = body.teams.reduce((n, t) => n + (t.tasks?.length || 0), 0)
  const completed = body.teams.reduce((n, t) => n + (t.tasks || []).filter((x) => x.status === 'completed').length, 0)
  note(body.totals.teams === body.teams.length, 'totals.teams matches teams.length')
  note(body.totals.members === members, 'totals.members matches member rows')
  note(body.totals.running === running, 'totals.running matches running members')
  note(body.totals.tasks === tasks, 'totals.tasks matches task rows')
  note(body.totals.completed === completed, 'totals.completed matches completed tasks')
}

console.log(`\n${problems.length === 0 ? 'ALL CHECKS PASSED' : `${problems.length} CHECK(S) FAILED`}`)
process.exit(problems.length === 0 ? 0 : 1)
