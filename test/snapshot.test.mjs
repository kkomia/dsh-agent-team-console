/**
 * Host-half unit tests for dsh-agent-team-console.
 *
 * Plain `node --test` (no dependencies): imports the exported helpers from
 * ../index.js and drives them against fake Cordis services. Covers the snapshot
 * contract, defensive `team/member` + `team/task` normalization, JSON safety,
 * and the route's 200/404/500 behavior.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  VERSION,
  apply,
  collectTeams,
  createRouteHandler,
  createSnapshot,
  inject,
  normalizeActivity,
  normalizeTeamEvent,
  toJsonSafe,
} from '../index.js'

const ROOT_ID = 'session-root'
const TEAMMATE_ID = 'session-reviewer'

// ---------------------------------------------------------------------------
// fakes
// ---------------------------------------------------------------------------

function createFakeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(statusCode, headers) {
      this.statusCode = statusCode
      this.headers = headers || {}
      return this
    },
    end(payload) {
      this.body = payload === undefined ? '' : String(payload)
    },
  }
}

function createFakeContext(services = {}) {
  const registered = []
  return {
    registered,
    get(name) {
      return services[name]
    },
    effect(fn, label) {
      registered.push({ label })
      return fn()
    },
  }
}

function makeSession(id, events, header) {
  const sorted = [...events].sort((a, b) => Number(a.seq) - Number(b.seq))
  const seq = sorted.reduce((max, event) => Math.max(max, Number(event.seq) + 1), 0)
  return {
    id,
    seq,
    snapshotEvents(fromSeq, toSeqExclusive) {
      const from = Number.isFinite(Number(fromSeq)) ? Number(fromSeq) : 0
      const to = Number.isFinite(Number(toSeqExclusive)) ? Number(toSeqExclusive) : Number.POSITIVE_INFINITY
      return sorted.filter((event) => Number(event.seq) >= from && Number(event.seq) < to)
    },
    requestHeader() {
      return header
    },
  }
}

function teamEvent(seq, time, member) {
  return { type: 'team/member', seq, time, data: { version: 2, teamId: ROOT_ID, member } }
}

function taskEvent(seq, time, task) {
  return { type: 'team/task', seq, time, data: { version: 2, teamId: ROOT_ID, task } }
}

/**
 * One complete team: Lead + one teammate + 3 tasks (in-progress / blocked
 * pending / completed), with real version-2 team events in the Lead log.
 */
function buildTeamServices({ withSessions = true } = {}) {
  const rootAgent = { id: ROOT_ID, status: 'running' }
  const teammateAgent = { id: TEAMMATE_ID, status: 'running' }

  const rootEvents = [
    { type: 'session/start', seq: 0, time: 1000, data: {} },
    teamEvent(1, 1100, {
      id: TEAMMATE_ID,
      name: 'reviewer',
      description: 'Reviews the diff',
      provider: 'deepseek',
      context: 'fresh',
      phase: 'provisioning',
    }),
    taskEvent(2, 1200, {
      id: 'task-1',
      revision: 1,
      subject: 'Review the diff',
      description: 'd'.repeat(2500),
      status: 'pending',
      blockedBy: [],
      writeScopes: ['team-console/index.js'],
    }),
    { type: 'tool/result', seq: 3, time: 1250, data: {} },
    taskEvent(4, 1300, {
      id: 'task-1',
      revision: 2,
      subject: 'Review the diff',
      description: 'short',
      status: 'in_progress',
      ownerId: TEAMMATE_ID,
      blockedBy: [],
      writeScopes: [],
    }),
    teamEvent(5, 1400, {
      id: TEAMMATE_ID,
      name: 'reviewer',
      description: 'Reviews the diff',
      provider: 'deepseek',
      context: 'fresh',
      phase: 'active',
    }),
  ]

  const reviewerEvents = [
    { type: 'turn/start', seq: 0, time: 1100, data: { turn: 1 } },
    { type: 'step/start', seq: 1, time: 1110, data: { step: 2 } },
    { type: 'turn/start', seq: 2, time: 1120, data: { turn: 3 } },
    { type: 'step/start', seq: 3, time: 1130, data: { step: 9 } },
    { type: 'tool/result', seq: 4, time: 1180, data: {} },
  ]

  const sessions = {
    get(id) {
      if (id === ROOT_ID) return makeSession(ROOT_ID, rootEvents, { config: { provider: 'deepseek', model: 'deepseek-flash' } })
      if (id === TEAMMATE_ID) return makeSession(TEAMMATE_ID, reviewerEvents, { config: { provider: 'deepseek', model: 'deepseek-chat' } })
      return undefined
    },
  }

  const members = [
    // Lead row deliberately lacks provider/model/description/context (real service shape).
    { id: ROOT_ID, name: 'lead', role: 'lead', status: 'running', diagnostics: [] },
    // Teammate row deliberately lacks provider/model/context (filled from the session header).
    { id: TEAMMATE_ID, name: 'reviewer', role: 'teammate', status: 'running', description: 'Reviews the diff', diagnostics: [] },
  ]

  const tasks = [
    {
      id: 'task-1',
      revision: 2,
      subject: 'Review the diff',
      description: 'd'.repeat(2500),
      status: 'in_progress',
      ownerName: 'reviewer',
      blockedBy: [],
      ready: false,
      writeScopes: [],
      writeScopeWarnings: [],
    },
    {
      id: 'task-2',
      revision: 1,
      subject: 'Write client panel',
      description: 'client.js',
      status: 'pending',
      blockedBy: ['task-1'],
      ready: false,
      writeScopes: ['team-console/client.js'],
      writeScopeWarnings: [],
    },
    {
      id: 'task-3',
      revision: 3,
      subject: 'Done task',
      description: 'done',
      status: 'completed',
      ownerName: 'lead',
      blockedBy: [],
      ready: false,
      writeScopes: [],
      writeScopeWarnings: [],
    },
  ]

  const agentTeams = {
    tryMembership(agent) {
      if (agent.id === ROOT_ID) return { root: rootAgent, id: ROOT_ID, role: 'lead', name: 'lead' }
      if (agent.id === TEAMMATE_ID) return { root: rootAgent, id: ROOT_ID, role: 'teammate', name: 'reviewer' }
      return undefined
    },
    listMembers(rootAgent) {
      assert.equal(rootAgent.id, ROOT_ID)
      return members
    },
    listTasks(rootAgent) {
      assert.equal(rootAgent.id, ROOT_ID)
      return tasks
    },
  }

  const agents = { list: () => [rootAgent, teammateAgent] }
  const services = { agents, agentTeams }
  if (withSessions) services.sessions = sessions
  return { services, rootEvents, sessions, members, tasks }
}

/** JSON losslessness: stringify/parse must round-trip and contain no undefined. */
function assertLossless(value) {
  const text = JSON.stringify(value)
  assert.equal(typeof text, 'string')
  assert.equal(text.includes('undefined'), false)
  assert.deepEqual(JSON.parse(text), value)
}

// ---------------------------------------------------------------------------
// contract surface
// ---------------------------------------------------------------------------

test('module exports inject=[webServer] and pure helpers', () => {
  assert.deepEqual(inject, ['webServer'])
  assert.equal(VERSION, 1)
  assert.equal(typeof apply, 'function')
  assert.equal(typeof collectTeams, 'function')
  assert.equal(typeof createSnapshot, 'function')
  assert.equal(typeof createRouteHandler, 'function')
  assert.equal(typeof normalizeActivity, 'function')
  assert.equal(typeof normalizeTeamEvent, 'function')
  assert.equal(typeof toJsonSafe, 'function')
})

test('index.js has no import statements (dependency-free ESM)', () => {
  const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8')
  assert.equal(/^\s*import\b/m.test(source), false)
  assert.equal(/^\s*export\s+[^;]*\bfrom\s+['"]/m.test(source), false)
})

// ---------------------------------------------------------------------------
// unsupported / empty
// ---------------------------------------------------------------------------

test('unsupported: no services yields ok:true + unsupported string + empty teams', () => {
  const snapshot = createSnapshot(createFakeContext())
  assert.equal(snapshot.version, 1)
  assert.equal(snapshot.ok, true)
  assert.equal(typeof snapshot.unsupported, 'string')
  assert.ok(snapshot.unsupported.length > 0)
  assert.deepEqual(snapshot.teams, [])
  assert.deepEqual(snapshot.totals, { teams: 0, members: 0, running: 0, tasks: 0, completed: 0 })
  assert.equal(typeof snapshot.generatedAt, 'number')
  assertLossless(snapshot)
})

test('unsupported: agentTeams without agents is still reported as unsupported', () => {
  const snapshot = createSnapshot(
    createFakeContext({
      agentTeams: { tryMembership() {}, listMembers() { return [] }, listTasks() { return [] } },
    }),
  )
  assert.equal(snapshot.ok, true)
  assert.equal(typeof snapshot.unsupported, 'string')
  assert.deepEqual(snapshot.teams, [])
})

test('empty: implicit one-person Lead with no tasks is filtered out', () => {
  const rootAgent = { id: ROOT_ID, status: 'running' }
  const services = {
    agents: { list: () => [rootAgent] },
    agentTeams: {
      tryMembership: () => ({ root: rootAgent, id: ROOT_ID, role: 'lead', name: 'lead' }),
      listMembers: () => [{ id: ROOT_ID, name: 'lead', role: 'lead', status: 'running', diagnostics: [] }],
      listTasks: () => [],
    },
  }
  const snapshot = createSnapshot(createFakeContext(services))
  assert.equal(snapshot.unsupported, null)
  assert.deepEqual(snapshot.teams, [])
  assert.deepEqual(snapshot.totals, { teams: 0, members: 0, running: 0, tasks: 0, completed: 0 })
  assertLossless(snapshot)
})

// ---------------------------------------------------------------------------
// full team
// ---------------------------------------------------------------------------

test('one team: members, enrichment, counts, tasks, and activity timeline', () => {
  const { services } = buildTeamServices()
  const snapshot = createSnapshot(createFakeContext(services))

  assert.equal(snapshot.version, 1)
  assert.equal(snapshot.ok, true)
  assert.equal(snapshot.unsupported, null)
  assert.equal(snapshot.teams.length, 1)

  const team = snapshot.teams[0]
  assert.equal(team.id, ROOT_ID)
  assert.equal(team.error, null)

  // counts: 2 members (running), 3 tasks (1 pending/blocked, 1 in_progress, 1 completed)
  assert.deepEqual(team.counts, {
    members: 2,
    running: 2,
    provisioning: 0,
    failed: 0,
    tasks: 3,
    pending: 1,
    inProgress: 1,
    completed: 1,
    blocked: 1,
  })

  // roster: lead first, creation order preserved
  assert.equal(team.members.length, 2)
  assert.deepEqual(
    team.members.map((member) => member.role),
    ['lead', 'teammate'],
  )
  assert.deepEqual(
    team.members.map((member) => member.name),
    ['lead', 'reviewer'],
  )

  const lead = team.members[0]
  assert.equal(lead.id, ROOT_ID)
  assert.equal(lead.description, null)
  assert.equal(lead.provider, 'deepseek') // filled from session requestHeader
  assert.equal(lead.model, 'deepseek-flash') // filled from session requestHeader
  assert.equal(lead.lastActivityAt, 1400)
  assert.equal(lead.lastEventType, 'team/member')

  const reviewer = team.members[1]
  assert.equal(reviewer.id, TEAMMATE_ID)
  assert.equal(reviewer.status, 'running')
  assert.equal(reviewer.description, 'Reviews the diff')
  assert.equal(reviewer.provider, 'deepseek') // filled from requestHeader
  assert.equal(reviewer.model, 'deepseek-chat') // filled from requestHeader
  assert.equal(reviewer.lastActivityAt, 1180)
  assert.equal(reviewer.lastEventType, 'tool/result')
  assert.equal(reviewer.turns, 3)
  assert.equal(reviewer.steps, 9)

  // tasks: numeric creation order, description capped at 2000
  assert.deepEqual(
    team.tasks.map((task) => task.id),
    ['task-1', 'task-2', 'task-3'],
  )
  assert.equal(team.tasks[0].description.length, 2000)
  assert.deepEqual(team.tasks[1].blockedBy, ['task-1'])
  assert.equal(team.tasks[1].ready, false)
  assert.equal(team.tasks[2].ownerName, 'lead')

  // activity: newest first, only team/member + team/task
  assert.deepEqual(
    team.activity.map((entry) => entry.seq),
    [5, 4, 2, 1],
  )
  for (const entry of team.activity) {
    assert.equal(typeof entry.text, 'string')
    assert.ok(entry.text.length > 0)
    assert.ok(entry.text.length <= 200)
    assert.equal(typeof entry.time, 'number')
    assert.equal(entry.kind === 'member' || entry.kind === 'task', true)
  }
  assert.deepEqual(
    team.activity.map((entry) => entry.action),
    ['start', 'claim', 'create', 'spawn'],
  )
  assert.deepEqual(
    team.activity.map((entry) => entry.kind),
    ['member', 'task', 'task', 'member'],
  )
  assert.equal(team.activity[0].status, 'running')
  assert.equal(team.activity[1].memberName, 'reviewer')
  assert.equal(team.activity[1].taskId, 'task-1')
  assert.equal(team.activity[2].subject, 'Review the diff')

  assert.deepEqual(snapshot.totals, { teams: 1, members: 2, running: 2, tasks: 3, completed: 1 })
  assertLossless(snapshot)
})

test('collectTeams returns the same team objects sorted by recent activity', () => {
  const { services } = buildTeamServices()
  const teams = collectTeams(createFakeContext(services))
  assert.equal(teams.length, 1)
  assert.equal(teams[0].id, ROOT_ID)
})

test('teams are ordered by most recent activity (desc)', () => {
  const makeTeam = (rootId, memberId, latestTime) => {
    const rootAgent = { id: rootId, status: 'running' }
    const memberAgent = { id: memberId, status: 'inactive' }
    const rootSession = makeSession(
      rootId,
      [
        {
          type: 'team/task',
          seq: 1,
          time: latestTime,
          data: {
            version: 2,
            teamId: rootId,
            task: { id: 'task-1', revision: 1, subject: 's', status: 'pending', blockedBy: [], writeScopes: [] },
          },
        },
      ],
      undefined,
    )
    return {
      rootAgent,
      memberAgent,
      services: {
        agents: { list: () => [rootAgent, memberAgent] },
        agentTeams: {
          tryMembership(agent) {
            if (agent.id === rootId) return { root: rootAgent, id: rootId, role: 'lead', name: 'lead' }
            if (agent.id === memberId) return { root: rootAgent, id: rootId, role: 'teammate', name: 'helper' }
            return undefined
          },
          listMembers: () => [
            { id: rootId, name: 'lead', role: 'lead', status: 'running', diagnostics: [] },
            { id: memberId, name: 'helper', role: 'teammate', status: 'inactive', description: 'h', diagnostics: [] },
          ],
          listTasks: () => [
            {
              id: 'task-1',
              revision: 1,
              subject: 's',
              description: 'd',
              status: 'pending',
              blockedBy: [],
              ready: true,
              writeScopes: [],
              writeScopeWarnings: [],
            },
          ],
        },
        sessions: { get: (id) => (id === rootId ? rootSession : undefined) },
      },
    }
  }

  const fresh = makeTeam('session-new', 'session-new-teammate', 9000)
  const old = makeTeam('session-old', 'session-old-teammate', 500)
  const combined = {
    agents: { list: () => [fresh.rootAgent, fresh.memberAgent, old.rootAgent, old.memberAgent] },
    agentTeams: {
      tryMembership(agent) {
        return fresh.services.agentTeams.tryMembership(agent) ?? old.services.agentTeams.tryMembership(agent)
      },
      listMembers(rootAgent) {
        return (rootAgent.id === 'session-new' ? fresh : old).services.agentTeams.listMembers()
      },
      listTasks(rootAgent) {
        return (rootAgent.id === 'session-new' ? fresh : old).services.agentTeams.listTasks()
      },
    },
    sessions: { get: (id) => fresh.services.sessions.get(id) ?? old.services.sessions.get(id) },
  }

  const snapshot = createSnapshot(createFakeContext(combined))
  assert.deepEqual(
    snapshot.teams.map((team) => team.id),
    ['session-new', 'session-old'],
  )
  assert.equal(snapshot.teams[0].activity.length, 1)
  assert.equal(snapshot.teams[0].activity[0].time, 9000)
  assert.equal(snapshot.teams[1].activity[0].time, 500)
  assertLossless(snapshot)
})

test('missing sessions service degrades enrichment/activity without failing', () => {
  const { services } = buildTeamServices({ withSessions: false })
  const snapshot = createSnapshot(createFakeContext(services))
  assert.equal(snapshot.ok, true)
  assert.equal(snapshot.unsupported, null)
  assert.equal(snapshot.teams.length, 1)
  const team = snapshot.teams[0]
  assert.deepEqual(team.activity, [])
  for (const member of team.members) {
    assert.equal(member.lastActivityAt, null)
    assert.equal(member.lastEventType, null)
    assert.equal(member.turns, null)
    assert.equal(member.steps, null)
  }
  assertLossless(snapshot)
})

// ---------------------------------------------------------------------------
// defensive normalization
// ---------------------------------------------------------------------------

test('unknown activity payload shapes never throw and always yield text', () => {
  const weirdEvents = [
    { type: 'team/member', seq: 1, time: 1, data: {} },
    { type: 'team/member', seq: 2, time: 2, data: null },
    { type: 'team/task', seq: 3, time: 3, data: { version: 99, task: { id: 'task-9' } } },
    { type: 'team/task', seq: 4, time: 4, data: { taskId: 'task-10', status: 'completed', revision: 3 } },
    { type: 'team/other', seq: 5, time: 5, data: {} },
    { type: 'team/task', seq: 6, time: 6, data: 42 },
    {
      type: 'team/task',
      seq: 7,
      time: 7,
      data: { version: 2, task: { id: 'task-11', revision: 1, subject: 'S'.repeat(500), status: 'pending', blockedBy: [], writeScopes: [] } },
    },
    null,
  ]

  let activity
  assert.doesNotThrow(() => {
    activity = normalizeActivity(weirdEvents, {
      memberNames: new Map([[TEAMMATE_ID, 'reviewer']]),
      teamId: ROOT_ID,
    })
  })
  assert.equal(activity.length, 6) // non-team + null entries filtered; other team ids absent
  for (const entry of activity) {
    assert.equal(typeof entry.text, 'string')
    assert.ok(entry.text.length > 0)
    assert.ok(entry.text.length <= 200)
    assert.equal(typeof entry.seq, 'number')
    assert.equal(typeof entry.time, 'number')
    assert.equal(entry.kind === 'member' || entry.kind === 'task', true)
  }
  assert.deepEqual(
    activity.map((entry) => entry.seq),
    [7, 6, 4, 3, 2, 1],
  )
  assert.equal(activity[0].taskId, 'task-11')
  assert.equal(activity[0].text.length, 200)
  assert.equal(activity[1].action, 'update') // payload was a number: generic fallback
  assert.equal(activity[2].taskId, 'task-10')
  assert.equal(activity[2].action, 'complete')
  assert.equal(activity[3].taskId, 'task-9')
  assert.equal(activity[3].action, 'update')
  assert.equal(activity[4].kind, 'member')
  assert.equal(activity[5].kind, 'member')

  assert.equal(normalizeTeamEvent('pancake', {}, {}), null)
  assert.equal(normalizeTeamEvent('team/task', undefined, undefined).text, 'task · update')
  assert.doesNotThrow(() => normalizeTeamEvent('team/member', undefined, undefined))
  assert.doesNotThrow(() => normalizeActivity(null, undefined, undefined))
})

test('team events for a different team id are ignored', () => {
  const entries = normalizeActivity(
    [
      { type: 'team/task', seq: 1, time: 1, data: { version: 2, teamId: 'session-other', task: { id: 'task-1', revision: 1, status: 'pending' } } },
      { type: 'team/task', seq: 2, time: 2, data: { version: 2, teamId: ROOT_ID, task: { id: 'task-2', revision: 1, status: 'pending' } } },
    ],
    { teamId: ROOT_ID },
  )
  assert.equal(entries.length, 1)
  assert.equal(entries[0].taskId, 'task-2')
})

test('normalizeActivity expands the scan window for long Lead logs', () => {
  const events = []
  for (let seq = 0; seq < 2000; seq += 1) {
    if (seq === 100) {
      events.push({
        type: 'team/member',
        seq,
        time: 100,
        data: { version: 2, teamId: ROOT_ID, member: { id: TEAMMATE_ID, name: 'reviewer', phase: 'provisioning' } },
      })
    } else {
      events.push({ type: 'tool/result', seq, time: 1000 + seq, data: {} })
    }
  }
  const session = {
    id: ROOT_ID,
    seq: 2000,
    snapshotEvents(fromSeq, toSeqExclusive) {
      return events.filter((event) => event.seq >= fromSeq && event.seq < toSeqExclusive)
    },
  }
  const entries = normalizeActivity(session, { teamId: ROOT_ID })
  assert.equal(entries.length, 1)
  assert.equal(entries[0].seq, 100)
  assert.equal(entries[0].action, 'spawn')
})

test('normalizeActivity caps the timeline at 40 entries, newest first', () => {
  const events = []
  for (let seq = 0; seq < 100; seq += 1) {
    events.push({
      type: 'team/member',
      seq,
      time: seq,
      data: { version: 2, teamId: ROOT_ID, member: { id: TEAMMATE_ID, name: 'reviewer', phase: 'active' } },
    })
  }
  const session = {
    id: ROOT_ID,
    seq: 100,
    snapshotEvents(fromSeq, toSeqExclusive) {
      return events.filter((event) => event.seq >= fromSeq && event.seq < toSeqExclusive)
    },
  }
  const entries = normalizeActivity(session, { teamId: ROOT_ID })
  assert.equal(entries.length, 40)
  assert.equal(entries[0].seq, 99)
  assert.equal(entries[39].seq, 60)
})

test('task release/reopen actions are derived from the previous in-window status', () => {  const entries = normalizeActivity(
    [
      { type: 'team/task', seq: 1, time: 1, data: { version: 2, task: { id: 'task-1', revision: 1, status: 'pending' } } },
      { type: 'team/task', seq: 2, time: 2, data: { version: 2, task: { id: 'task-1', revision: 2, status: 'in_progress', ownerId: 'lead' } } },
      { type: 'team/task', seq: 3, time: 3, data: { version: 2, task: { id: 'task-1', revision: 3, status: 'pending' } } },
      { type: 'team/task', seq: 4, time: 4, data: { version: 2, task: { id: 'task-1', revision: 4, status: 'completed' } } },
      { type: 'team/task', seq: 5, time: 5, data: { version: 2, task: { id: 'task-1', revision: 5, status: 'pending' } } },
    ],
    { teamId: ROOT_ID },
  )
  assert.deepEqual(
    entries.map((entry) => entry.action),
    ['reopen', 'complete', 'release', 'claim', 'create'],
  )
})

// ---------------------------------------------------------------------------
// JSON safety
// ---------------------------------------------------------------------------

test('toJsonSafe removes undefined/NaN/circular values and survives bigints', () => {
  const safe = toJsonSafe({
    a: undefined,
    b: [undefined, 'x', 1, NaN, Number.POSITIVE_INFINITY],
    c: () => null,
    d: 10n,
    e: { f: undefined },
  })
  assert.deepEqual(safe, { a: null, b: [null, 'x', 1, null, null], c: null, d: '10', e: { f: null } })
  assertLossless(safe)

  const circular = { name: 'loop' }
  circular.self = circular
  let encoded
  assert.doesNotThrow(() => {
    encoded = JSON.stringify(toJsonSafe(circular))
  })
  assert.equal(encoded, '{"name":"loop","self":null}')
})

test('snapshot stays lossless even when roster/task rows contain undefined and junk', () => {
  const rootAgent = { id: ROOT_ID, status: 'running' }
  const services = {
    agents: { list: () => [rootAgent, { id: TEAMMATE_ID }] },
    agentTeams: {
      tryMembership(agent) {
        if (agent.id === ROOT_ID) return { root: rootAgent, id: ROOT_ID, role: 'lead', name: 'lead' }
        return undefined
      },
      listMembers: () => [
        { id: ROOT_ID, name: undefined, role: 'lead', status: 'weird', diagnostics: [undefined, 'diag'] },
        { id: TEAMMATE_ID, name: 'helper', role: 'teammate', status: 'failed', provider: undefined, model: undefined, context: 'other', diagnostics: undefined },
      ],
      listTasks: () => [
        {
          id: 'task-1',
          revision: undefined,
          subject: undefined,
          description: undefined,
          status: undefined,
          ownerName: undefined,
          blockedBy: [undefined, 'task-0'],
          ready: undefined,
          writeScopes: undefined,
          writeScopeWarnings: undefined,
        },
      ],
    },
    sessions: {
      get: () => ({
        id: ROOT_ID,
        seq: 1,
        snapshotEvents: () => [{ type: 'team/task', seq: 0, time: undefined, data: undefined }],
        requestHeader: () => ({ config: { provider: undefined, model: undefined } }),
      }),
    },
  }
  const snapshot = createSnapshot(createFakeContext(services))
  assert.equal(snapshot.ok, true)
  assert.equal(snapshot.teams.length, 1)
  assertLossless(snapshot)

  const member = snapshot.teams[0].members[0]
  assert.equal(member.name, 'lead')
  assert.equal(member.status, 'inactive')
  assert.deepEqual(member.diagnostics, ['diag'])
  const teammate = snapshot.teams[0].members[1]
  assert.equal(teammate.name, 'helper')
  assert.equal(teammate.context, null)
  const task = snapshot.teams[0].tasks[0]
  assert.equal(task.id, 'task-1')
  assert.equal(task.revision, 0)
  assert.equal(task.subject, '')
  assert.equal(task.status, 'pending')
  assert.deepEqual(task.blockedBy, ['task-0'])
})

// ---------------------------------------------------------------------------
// HTTP route
// ---------------------------------------------------------------------------

test('route: GET snapshot -> 200 JSON with cache headers; other requests -> 404', async () => {
  const { services } = buildTeamServices()
  const handler = createRouteHandler(createFakeContext(services))

  const okResponse = createFakeResponse()
  await handler({ method: 'GET', url: '/api/team-console/snapshot?ts=1' }, okResponse)
  assert.equal(okResponse.statusCode, 200)
  assert.equal(okResponse.headers['content-type'], 'application/json; charset=utf-8')
  assert.equal(okResponse.headers['cache-control'], 'no-store')
  const body = JSON.parse(okResponse.body)
  assert.equal(body.ok, true)
  assert.equal(body.version, 1)
  assert.equal(body.teams.length, 1)
  assertLossless(body)

  const notFoundResponse = createFakeResponse()
  await handler({ method: 'POST', url: '/api/team-console/snapshot' }, notFoundResponse)
  assert.equal(notFoundResponse.statusCode, 404)
  assert.equal(JSON.parse(notFoundResponse.body).ok, false)

  const wrongPathResponse = createFakeResponse()
  await handler({ method: 'GET', url: '/api/team-console/other' }, wrongPathResponse)
  assert.equal(wrongPathResponse.statusCode, 404)
  assert.equal(typeof JSON.parse(wrongPathResponse.body).error, 'string')
})

test('route: aggregation failure -> 500 valid JSON, handler never rejects', async () => {
  const brokenCtx = createFakeContext({
    agents: {
      list() {
        throw new Error('boom')
      },
    },
    agentTeams: {
      tryMembership: () => undefined,
      listMembers: () => [],
      listTasks: () => [],
    },
  })
  const handler = createRouteHandler(brokenCtx)
  const response = createFakeResponse()
  await assert.doesNotReject(() => handler({ method: 'GET', url: '/api/team-console/snapshot' }, response))
  assert.equal(response.statusCode, 500)
  const body = JSON.parse(response.body)
  assert.equal(body.version, 1)
  assert.equal(body.ok, false)
  assert.equal(body.error, 'boom')
  assert.deepEqual(body.teams, [])
  assertLossless(body)
})

test('route: destroyed/invalid response objects do not throw', async () => {
  const { services } = buildTeamServices()
  const handler = createRouteHandler(createFakeContext(services))
  await assert.doesNotReject(() => handler({ method: 'GET', url: '/api/team-console/snapshot' }, null))
  const brokenResponse = {
    writeHead() {
      throw new Error('closed')
    },
    end() {
      throw new Error('closed')
    },
  }
  await assert.doesNotReject(() => handler({ method: 'GET', url: '/api/team-console/snapshot' }, brokenResponse))
})

test('route: DSH connection admission is enforced when the connection service is mounted', async () => {
  const { services } = buildTeamServices()
  const connection = {
    requestRejection(req) {
      return req.authorized === true ? undefined : 401
    },
  }
  const handler = createRouteHandler(createFakeContext({ ...services, connection }))

  const anonymousResponse = createFakeResponse()
  await handler({ method: 'GET', url: '/api/team-console/snapshot' }, anonymousResponse)
  assert.equal(anonymousResponse.statusCode, 401)
  assert.equal(anonymousResponse.headers['content-type'], 'application/json; charset=utf-8')
  assert.equal(anonymousResponse.headers['cache-control'], 'no-store')
  const anonymousBody = JSON.parse(anonymousResponse.body)
  assert.equal(anonymousBody.version, 1)
  assert.equal(anonymousBody.ok, false)
  assert.equal(anonymousBody.error, 'unauthorized')
  assert.deepEqual(anonymousBody.teams, [])

  const admittedResponse = createFakeResponse()
  await handler({ method: 'GET', url: '/api/team-console/snapshot', authorized: true }, admittedResponse)
  assert.equal(admittedResponse.statusCode, 200)
  assert.equal(JSON.parse(admittedResponse.body).ok, true)

  const forbiddenHandler = createRouteHandler(
    createFakeContext({ ...services, connection: { requestRejection: () => 403 } }),
  )
  const forbiddenResponse = createFakeResponse()
  await forbiddenHandler({ method: 'GET', url: '/api/team-console/snapshot' }, forbiddenResponse)
  assert.equal(forbiddenResponse.statusCode, 403)
  assert.equal(JSON.parse(forbiddenResponse.body).error, 'forbidden')
})

test('route: a throwing connection admission check fails closed with 401', async () => {
  const { services } = buildTeamServices()
  const handler = createRouteHandler(
    createFakeContext({
      ...services,
      connection: {
        requestRejection() {
          throw new Error('admission broke')
        },
      },
    }),
  )
  const response = createFakeResponse()
  await assert.doesNotReject(() => handler({ method: 'GET', url: '/api/team-console/snapshot' }, response))
  assert.equal(response.statusCode, 401)
  assert.equal(JSON.parse(response.body).error, 'unauthorized')
})

// ---------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------

test('apply registers a prefix route and tolerates a missing webServer', () => {
  const originalLog = console.log
  const messages = []
  console.log = (...args) => {
    messages.push(args.join(' '))
  }
  try {
    const registrations = []
    const effectLabels = []
    const webServer = {
      register(config) {
        registrations.push(config)
        return () => undefined
      },
    }
    const ctx = {
      get(name) {
        return name === 'webServer' ? webServer : undefined
      },
      effect(fn, label) {
        effectLabels.push(label)
        return fn()
      },
    }
    apply(ctx)
    assert.equal(registrations.length, 1)
    assert.equal(registrations[0].kind, 'prefix')
    assert.equal(registrations[0].path, '/api/team-console')
    assert.equal(typeof registrations[0].handler, 'function')
    assert.equal(effectLabels.length, 1)
    assert.equal(typeof effectLabels[0], 'string')

    assert.doesNotThrow(() => apply({ get: () => undefined, effect: () => () => undefined }))
    assert.equal(messages.length, 1)
    assert.match(messages[0], /webServer/)
  } finally {
    console.log = originalLog
  }
})

test('apply tolerates a throwing register/webServer and never throws', () => {
  const originalLog = console.log
  console.log = () => {}
  try {
    const ctx = {
      get() {
        return {
          register() {
            throw new Error('register failed')
          },
        }
      },
      effect(fn) {
        return fn()
      },
    }
    assert.doesNotThrow(() => apply(ctx))
  } finally {
    console.log = originalLog
  }
})
