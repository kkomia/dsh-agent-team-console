/**
 * Host-half unit tests for dsh-agent-team-console.
 *
 * Plain `node --test` (no dependencies): imports the exported helpers from
 * ../index.js and drives them against fake Cordis services. Covers the v2
 * snapshot contract (projects/workspace resolution, active-first ordering,
 * idle/ready counts, totals/projects aggregation), defensive `team/member` +
 * `team/task` normalization, JSON safety, and the route's 200/404/500 behavior.
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
/** Fake Lead-session creation cwd; with no workspace registry this is the project fallback. */
const ROOT_CWD = 'C:\\Users\\dev\\team'
const DEFAULT_CONFIG = { provider: 'deepseek', model: 'deepseek-flash' }
/** Pinned snapshot clock for deterministic wallMs/stats assertions. */
const FIXED_NOW = 1_700_000_000_000
/** Expected all-null rows when the session projections are unavailable. */
const NULL_MEMBER_STATS = {
  turns: null,
  steps: null,
  tokens: null,
  llmMs: null,
  toolMs: null,
  workingMs: null,
  idleMs: null,
  wallMs: null,
  workingRatio: null,
  live: false,
}
const NULL_TEAM_STATS = {
  turns: null,
  steps: null,
  tokens: null,
  llmMs: null,
  toolMs: null,
  workingMs: null,
  idleMs: null,
  wallMs: null,
  workingRatio: null,
}

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

/**
 * Fake live Session. `header` is the config-bearing request header; the fourth
 * argument is the immutable creation header read for `header.cwd` (v2).
 */
function makeSession(id, events, header, creationHeader) {
  const sorted = [...events].sort((a, b) => Number(a.seq) - Number(b.seq))
  const seq = sorted.reduce((max, event) => Math.max(max, Number(event.seq) + 1), 0)
  return {
    id,
    seq,
    header: creationHeader,
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

/** Workspace registry entity fake: `{ id, path, title, sessionIds }` (all synchronous). */
function makeWorkspace(id, path, title, sessionIds = []) {
  return { id, path, title, sessionIds: [...sessionIds] }
}

function createFakeWorkspaceRegistry(workspaces) {
  return {
    list() {
      return workspaces
    },
  }
}

/**
 * Fake `sessionProjections` service: `stateOf(session, key)` reads one
 * per-session state map shaped `{ [sessionId]: { sessionStats?, tokenUsage? } }`.
 */
function createFakeSessionProjections(statesBySessionId) {
  return {
    stateOf(session, key) {
      if (!session || typeof session.id !== 'string') return undefined
      const states = statesBySessionId[session.id]
      return states ? states[key] : undefined
    },
  }
}

function teamEvent(seq, time, member) {
  return { type: 'team/member', seq, time, data: { version: 2, teamId: ROOT_ID, member } }
}

function taskEvent(seq, time, task) {
  return { type: 'team/task', seq, time, data: { version: 2, teamId: ROOT_ID, task } }
}

/** TeamTaskView fake with two-state `ready` (the only field the contract inspects). */
function taskView({ id, status = 'pending', ready = false, blockedBy = [], subject = id, ownerName = null } = {}) {
  return {
    id,
    revision: 1,
    subject,
    description: `task ${id}`,
    status,
    ownerName,
    blockedBy,
    ready,
    writeScopes: [],
    writeScopeWarnings: [],
  }
}

/**
 * One complete team: Lead + one teammate + 4 tasks (in-progress / blocked
 * pending / completed / ready pending), with real version-2 team events in the
 * Lead log and a creation-header cwd (no workspace registry: cwd fallback).
 * @param options.withSessions - mount the `sessions` service (default true).
 * @param options.cwd - Lead session creation cwd; null/empty omits `header.cwd`.
 * @param options.workspaces - when an array, mounts a fake `workspaceRegistry`.
 * @param options.createdAt - creation-header `createdAt`; undefined omits it.
 * @param options.projections - session-id -> projection states fake mount.
 */
function buildTeamServices({ withSessions = true, cwd = ROOT_CWD, workspaces = null, createdAt, projections = null } = {}) {
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

  const leadCreationHeader = {}
  if (typeof cwd === 'string' && cwd.length > 0) leadCreationHeader.cwd = cwd
  if (createdAt !== undefined) leadCreationHeader.createdAt = createdAt
  const leadHeader = Object.keys(leadCreationHeader).length > 0 ? leadCreationHeader : undefined
  const memberCreationHeader = createdAt !== undefined ? { createdAt } : undefined
  const sessions = {
    get(id) {
      if (id === ROOT_ID) return makeSession(ROOT_ID, rootEvents, { config: { provider: 'deepseek', model: 'deepseek-flash' } }, leadHeader)
      if (id === TEAMMATE_ID) return makeSession(TEAMMATE_ID, reviewerEvents, { config: { provider: 'deepseek', model: 'deepseek-chat' } }, memberCreationHeader)
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
    {
      id: 'task-4',
      revision: 1,
      subject: 'Ready pending task',
      description: 'ready',
      status: 'pending',
      blockedBy: [],
      ready: true,
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
    listMembers(rootAgentValue) {
      assert.equal(rootAgentValue.id, ROOT_ID)
      return members
    },
    listTasks(rootAgentValue) {
      assert.equal(rootAgentValue.id, ROOT_ID)
      return tasks
    },
  }

  const agents = { list: () => [rootAgent, teammateAgent] }
  const services = { agents, agentTeams }
  if (withSessions) services.sessions = sessions
  if (Array.isArray(workspaces)) services.workspaceRegistry = createFakeWorkspaceRegistry(workspaces)
  if (projections !== null) services.sessionProjections = createFakeSessionProjections(projections)
  return { services, rootEvents, sessions, members, tasks }
}

/**
 * Smaller team fixture for the focused v2/v3 tests: Lead + teammate(s) + tasks,
 * one task event to anchor `activityAt`, optional creation header (cwd +
 * createdAt), fake workspace registry and fake session projections. Reuses the
 * same session/workspace fakes as above.
 */
function buildSimpleTeam({
  teamId = ROOT_ID,
  cwd = ROOT_CWD,
  createdAt,
  rootStatus = 'running',
  memberStatus = 'running',
  members,
  tasks = [],
  latestTime = 1000,
  workspaces = null,
  withSessions = true,
  projections = null,
} = {}) {
  const rootAgent = { id: teamId, status: rootStatus }
  const teammateViews =
    Array.isArray(members) && members.length > 0
      ? members
      : [{ id: `${teamId}-helper`, name: 'helper', role: 'teammate', status: memberStatus, description: 'h', diagnostics: [] }]
  const memberViews = [{ id: teamId, name: 'lead', role: 'lead', status: rootStatus, diagnostics: [] }, ...teammateViews]
  const rootEvents = [
    {
      type: 'team/task',
      seq: 1,
      time: latestTime,
      data: {
        version: 2,
        teamId,
        task: { id: 'task-event', revision: 1, subject: 'event', status: 'pending', blockedBy: [], writeScopes: [] },
      },
    },
  ]
  const creationHeader = {}
  if (typeof cwd === 'string' && cwd.length > 0) creationHeader.cwd = cwd
  if (createdAt !== undefined) creationHeader.createdAt = createdAt
  const header = Object.keys(creationHeader).length > 0 ? creationHeader : undefined
  const memberIds = new Set(memberViews.map((member) => member.id))
  const services = {
    agents: { list: () => [rootAgent] },
    agentTeams: {
      tryMembership(agent) {
        if (agent.id === teamId) return { root: rootAgent, id: teamId, role: 'lead', name: 'lead' }
        return undefined
      },
      listMembers(rootAgentValue) {
        assert.equal(rootAgentValue.id, teamId)
        return memberViews
      },
      listTasks(rootAgentValue) {
        assert.equal(rootAgentValue.id, teamId)
        return tasks
      },
    },
  }
  if (withSessions) {
    services.sessions = {
      get(id) {
        if (id === teamId) return makeSession(teamId, rootEvents, { config: DEFAULT_CONFIG }, header)
        if (memberIds.has(id)) return makeSession(id, [], { config: DEFAULT_CONFIG }, header)
        return undefined
      },
    }
  }
  if (Array.isArray(workspaces)) services.workspaceRegistry = createFakeWorkspaceRegistry(workspaces)
  if (projections !== null) services.sessionProjections = createFakeSessionProjections(projections)
  return { services, rootAgent, teamId, memberViews, tasks }
}

/** Merge several single-team fixtures into one fake service set (multi-team snapshots). */
function combineTeamServices(...fixtures) {
  const fixtureFor = (teamId) => fixtures.find((fixture) => fixture.teamId === teamId)
  const services = {
    agents: { list: () => fixtures.flatMap((fixture) => fixture.services.agents.list()) },
    agentTeams: {
      tryMembership(agent) {
        for (const fixture of fixtures) {
          const membership = fixture.services.agentTeams.tryMembership(agent)
          if (membership) return membership
        }
        return undefined
      },
      listMembers(rootAgent) {
        return fixtureFor(rootAgent.id).services.agentTeams.listMembers(rootAgent)
      },
      listTasks(rootAgent) {
        return fixtureFor(rootAgent.id).services.agentTeams.listTasks(rootAgent)
      },
    },
  }
  const sessionOwners = fixtures.filter((fixture) => fixture.services.sessions)
  if (sessionOwners.length > 0) {
    services.sessions = {
      get(id) {
        for (const fixture of sessionOwners) {
          const session = fixture.services.sessions.get(id)
          if (session) return session
        }
        return undefined
      },
    }
  }
  const registryOwners = fixtures.filter((fixture) => fixture.services.workspaceRegistry)
  if (registryOwners.length > 0) {
    services.workspaceRegistry = {
      list() {
        const workspaces = []
        for (const fixture of registryOwners) workspaces.push(...fixture.services.workspaceRegistry.list())
        return workspaces
      },
    }
  }
  const projectionOwners = fixtures.filter((fixture) => fixture.services.sessionProjections)
  if (projectionOwners.length > 0) {
    services.sessionProjections = {
      stateOf(session, key) {
        for (const fixture of projectionOwners) {
          const state = fixture.services.sessionProjections.stateOf(session, key)
          if (state !== undefined) return state
        }
        return undefined
      },
    }
  }
  return services
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
  assert.equal(VERSION, 3)
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

const EMPTY_TOTALS = { teams: 0, activeTeams: 0, members: 0, running: 0, tasks: 0, pending: 0, inProgress: 0, blocked: 0, completed: 0 }

test('unsupported: no services yields ok:true + unsupported string + empty teams/projects', () => {
  const snapshot = createSnapshot(createFakeContext())
  assert.equal(snapshot.version, 3)
  assert.equal(snapshot.ok, true)
  assert.equal(typeof snapshot.unsupported, 'string')
  assert.ok(snapshot.unsupported.length > 0)
  assert.deepEqual(snapshot.teams, [])
  assert.deepEqual(snapshot.projects, [])
  assert.deepEqual(snapshot.totals, EMPTY_TOTALS)
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
  assert.deepEqual(snapshot.projects, [])
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
  assert.deepEqual(snapshot.projects, [])
  assert.deepEqual(snapshot.totals, EMPTY_TOTALS)
  assertLossless(snapshot)
})

// ---------------------------------------------------------------------------
// full team
// ---------------------------------------------------------------------------

test('one team: members, project fallback, enrichment, counts, tasks, and activity timeline', () => {
  const { services } = buildTeamServices()
  const snapshot = createSnapshot(createFakeContext(services))

  assert.equal(snapshot.version, 3)
  assert.equal(snapshot.ok, true)
  assert.equal(snapshot.unsupported, null)
  assert.equal(snapshot.teams.length, 1)

  const team = snapshot.teams[0]
  assert.equal(team.id, ROOT_ID)
  assert.equal(team.error, null)
  assert.equal(team.active, true)

  // project: no workspace registry -> synthetic project from the Lead session header.cwd
  assert.deepEqual(team.project, { id: `cwd:${ROOT_CWD}`, title: 'team', path: ROOT_CWD })

  // v3 stats: no sessionProjections service mounted and no creation-header createdAt
  assert.deepEqual(team.stats, NULL_TEAM_STATS)
  for (const member of team.members) assert.deepEqual(member.stats, NULL_MEMBER_STATS)

  // counts: 2 members (running), 4 tasks (1 in_progress, 1 blocked pending, 1 completed, 1 ready pending)
  assert.deepEqual(team.counts, {
    members: 2,
    running: 2,
    provisioning: 0,
    failed: 0,
    idle: 0,
    tasks: 4,
    pending: 2,
    inProgress: 1,
    completed: 1,
    blocked: 1,
    ready: 1,
  })

  // roster: lead first, creation order preserved; both members currently active
  assert.equal(team.members.length, 2)
  assert.deepEqual(
    team.members.map((member) => member.role),
    ['lead', 'teammate'],
  )
  assert.deepEqual(
    team.members.map((member) => member.name),
    ['lead', 'reviewer'],
  )
  assert.deepEqual(
    team.members.map((member) => member.active),
    [true, true],
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

  // tasks: numeric creation order, description capped at 2000, active only in progress
  assert.deepEqual(
    team.tasks.map((task) => task.id),
    ['task-1', 'task-2', 'task-3', 'task-4'],
  )
  assert.deepEqual(
    team.tasks.map((task) => task.active),
    [true, false, false, false],
  )
  assert.equal(team.tasks[0].description.length, 2000)
  assert.deepEqual(team.tasks[1].blockedBy, ['task-1'])
  assert.equal(team.tasks[1].ready, false)
  assert.equal(team.tasks[2].ownerName, 'lead')
  assert.equal(team.tasks[3].ready, true)

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

  // totals + projects: one active team owning one cwd project
  assert.deepEqual(snapshot.totals, {
    teams: 1,
    activeTeams: 1,
    members: 2,
    running: 2,
    tasks: 4,
    pending: 2,
    inProgress: 1,
    blocked: 1,
    completed: 1,
  })
  assert.deepEqual(snapshot.projects, [
    {
      id: `cwd:${ROOT_CWD}`,
      title: 'team',
      path: ROOT_CWD,
      teams: 1,
      activeTeams: 1,
      running: 2,
      inProgress: 1,
    },
  ])
  assertLossless(snapshot)
})

test('collectTeams returns the same team objects sorted by recent activity', () => {
  const { services } = buildTeamServices()
  const teams = collectTeams(createFakeContext(services))
  assert.equal(teams.length, 1)
  assert.equal(teams[0].id, ROOT_ID)
  assert.deepEqual(teams[0].project, { id: `cwd:${ROOT_CWD}`, title: 'team', path: ROOT_CWD })
})

test('missing sessions service degrades enrichment/activity and leaves project null', () => {
  const { services } = buildTeamServices({ withSessions: false })
  const snapshot = createSnapshot(createFakeContext(services))
  assert.equal(snapshot.ok, true)
  assert.equal(snapshot.unsupported, null)
  assert.equal(snapshot.teams.length, 1)
  const team = snapshot.teams[0]
  assert.equal(team.project, null)
  assert.deepEqual(snapshot.projects, [])
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
// ordering
// ---------------------------------------------------------------------------

test('teams with equal active state are ordered by most recent activity (desc)', () => {
  const fresh = buildSimpleTeam({ teamId: 'session-new', latestTime: 9000 })
  const old = buildSimpleTeam({ teamId: 'session-old', latestTime: 500 })
  const snapshot = createSnapshot(createFakeContext(combineTeamServices(fresh, old)))
  assert.deepEqual(
    snapshot.teams.map((team) => team.id),
    ['session-new', 'session-old'],
  )
  assert.equal(snapshot.teams[0].activity[0].time, 9000)
  assert.equal(snapshot.teams[1].activity[0].time, 500)
  assertLossless(snapshot)
})

test('active teams are ordered before idle teams even when the idle team is more recent', () => {
  const activeOld = buildSimpleTeam({ teamId: 'session-active-old', latestTime: 500 })
  const activeRecent = buildSimpleTeam({ teamId: 'session-active-recent', latestTime: 3000 })
  const idleRecent = buildSimpleTeam({ teamId: 'session-idle-recent', rootStatus: 'inactive', memberStatus: 'inactive', latestTime: 9000 })
  const snapshot = createSnapshot(createFakeContext(combineTeamServices(activeOld, activeRecent, idleRecent)))

  assert.deepEqual(
    snapshot.teams.map((team) => team.id),
    ['session-active-recent', 'session-active-old', 'session-idle-recent'],
  )
  assert.deepEqual(
    snapshot.teams.map((team) => team.active),
    [true, true, false],
  )
  assert.equal(snapshot.totals.activeTeams, 2)
  assertLossless(snapshot)
})

// ---------------------------------------------------------------------------
// project / workspace resolution
// ---------------------------------------------------------------------------

test('project: workspaceRegistry entity wins by lead sessionIds and beats a cwd path match', () => {
  const { services } = buildTeamServices({
    workspaces: [
      // Listed first and path-matches the cwd, but does not own the Lead session.
      makeWorkspace('workspace-path', ROOT_CWD, 'path-match', []),
      makeWorkspace('workspace-owner', 'D:\\repos\\team', 'team-owner', [ROOT_ID]),
    ],
  })
  const snapshot = createSnapshot(createFakeContext(services))
  assert.deepEqual(snapshot.teams[0].project, { id: 'workspace-owner', title: 'team-owner', path: 'D:\\repos\\team' })
  assert.deepEqual(snapshot.projects, [
    {
      id: 'workspace-owner',
      title: 'team-owner',
      path: 'D:\\repos\\team',
      teams: 1,
      activeTeams: 1,
      running: 2,
      inProgress: 1,
    },
  ])

  // The sessionIds match works even without a sessions service (no cwd needed).
  const withoutSessions = buildTeamServices({
    withSessions: false,
    workspaces: [makeWorkspace('workspace-owner', 'D:\\repos\\team', 'team-owner', [ROOT_ID])],
  })
  const fallbackSnapshot = createSnapshot(createFakeContext(withoutSessions.services))
  assert.deepEqual(fallbackSnapshot.teams[0].project, { id: 'workspace-owner', title: 'team-owner', path: 'D:\\repos\\team' })
  assertLossless(snapshot)
})

test('project: workspace path matches the Lead cwd case-insensitively across separators', () => {
  const cases = [
    {
      cwd: 'c:\\users\\dev\\team',
      workspace: makeWorkspace('workspace-backslash', 'C:\\Users\\DEV\\Team', 'repo', []),
      expected: { id: 'workspace-backslash', title: 'repo', path: 'C:\\Users\\DEV\\Team' },
    },
    {
      cwd: 'C:/Users/dev/TEAM',
      workspace: makeWorkspace('workspace-mixed', 'C:\\Users\\Dev\\team\\', 'repo-mixed', []),
      expected: { id: 'workspace-mixed', title: 'repo-mixed', path: 'C:\\Users\\Dev\\team\\' },
    },
  ]
  for (const item of cases) {
    const { services } = buildTeamServices({ cwd: item.cwd, workspaces: [item.workspace] })
    const snapshot = createSnapshot(createFakeContext(services))
    assert.deepEqual(snapshot.teams[0].project, item.expected)
    assertLossless(snapshot)
  }
})

test('project: workspace-derived title falls back to the path basename when blank', () => {
  const cases = [
    {
      label: 'missing title (sessionIds match)',
      workspace: { id: 'workspace-no-title', path: 'C:\\repos\\alpha', sessionIds: [ROOT_ID] },
      expected: { id: 'workspace-no-title', title: 'alpha', path: 'C:\\repos\\alpha' },
    },
    {
      label: 'empty title (sessionIds match)',
      workspace: { id: 'workspace-empty-title', path: 'D:/repos/beta/', title: '', sessionIds: [ROOT_ID] },
      expected: { id: 'workspace-empty-title', title: 'beta', path: 'D:/repos/beta/' },
    },
    {
      label: 'whitespace title (sessionIds match)',
      workspace: { id: 'workspace-blank-title', path: 'C:\\repos\\gamma', title: '   ', sessionIds: [ROOT_ID] },
      expected: { id: 'workspace-blank-title', title: 'gamma', path: 'C:\\repos\\gamma' },
    },
    {
      label: 'drive-root path',
      workspace: { id: 'workspace-root', path: 'C:\\', sessionIds: [ROOT_ID] },
      expected: { id: 'workspace-root', title: 'C:\\', path: 'C:\\' },
    },
    {
      label: 'path/cwd match branch',
      workspace: { id: 'workspace-path-titleless', path: 'c:/users/dev/team', title: '  ' },
      expected: { id: 'workspace-path-titleless', title: 'team', path: 'c:/users/dev/team' },
    },
  ]
  for (const item of cases) {
    const { services } = buildTeamServices({ workspaces: [item.workspace] })
    const snapshot = createSnapshot(createFakeContext(services))
    assert.deepEqual(snapshot.teams[0].project, item.expected, item.label)
    assert.equal(snapshot.projects.length, 1, item.label)
    assert.equal(snapshot.projects[0].id, item.expected.id, item.label)
    assert.equal(snapshot.projects[0].title, item.expected.title, item.label)
    assert.equal(typeof snapshot.projects[0].title, 'string', item.label)
    assert.ok(snapshot.projects[0].title.trim().length > 0, item.label)
    assertLossless(snapshot)
  }

  // A usable title is trimmed; when the title and the path are both unusable
  // the project id keeps the label non-empty.
  const trimmed = createSnapshot(
    createFakeContext(
      buildTeamServices({
        workspaces: [{ id: 'workspace-trimmed', title: '  Team Alpha  ', path: 'C:\\repos\\alpha', sessionIds: [ROOT_ID] }],
      }).services,
    ),
  )
  assert.deepEqual(trimmed.teams[0].project, { id: 'workspace-trimmed', title: 'Team Alpha', path: 'C:\\repos\\alpha' })

  const idOnly = createSnapshot(
    createFakeContext(buildTeamServices({ workspaces: [{ id: 'workspace-id-only', title: ' \t ', sessionIds: [ROOT_ID] }] }).services),
  )
  assert.deepEqual(idOnly.teams[0].project, { id: 'workspace-id-only', title: 'workspace-id-only', path: null })
  assertLossless(trimmed)
  assertLossless(idOnly)
})

test('project: cwd fallback handles Windows separators, trailing separators and drive roots', () => {
  const cases = [
    { cwd: ROOT_CWD, title: 'team' },
    { cwd: 'C:\\Users\\dev\\team\\', title: 'team' },
    { cwd: 'D:/work/proj', title: 'proj' },
    { cwd: 'C:\\', title: 'C:\\' },
    { cwd: 'C:/', title: 'C:/' },
  ]
  for (const item of cases) {
    const { services } = buildTeamServices({ cwd: item.cwd })
    const snapshot = createSnapshot(createFakeContext(services))
    assert.deepEqual(snapshot.teams[0].project, { id: `cwd:${item.cwd}`, title: item.title, path: item.cwd })
    assert.equal(snapshot.projects.length, 1)
    assert.equal(snapshot.projects[0].id, `cwd:${item.cwd}`)
    assertLossless(snapshot)
  }
})

test('project: null without workspace/cwd; those teams are never grouped into a project', () => {
  const noSessions = createSnapshot(createFakeContext(buildTeamServices({ withSessions: false }).services))
  assert.equal(noSessions.teams.length, 1)
  assert.equal(noSessions.teams[0].project, null)
  assert.deepEqual(noSessions.projects, [])
  assert.equal(noSessions.totals.teams, 1)

  const noCwd = createSnapshot(createFakeContext(buildTeamServices({ cwd: null }).services))
  assert.equal(noCwd.teams.length, 1)
  assert.equal(noCwd.teams[0].project, null)
  assert.deepEqual(noCwd.projects, [])
  assert.ok(noCwd.teams[0].activity.length > 0) // sessions still work for enrichment

  const unmatched = createSnapshot(
    createFakeContext(
      buildTeamServices({ cwd: null, workspaces: [makeWorkspace('workspace-other', 'D:\\elsewhere', 'other', ['session-other'])] }).services,
    ),
  )
  assert.equal(unmatched.teams[0].project, null)
  assert.deepEqual(unmatched.projects, [])

  // Mixed snapshot: the project-less team is still listed and counted, but the
  // virtual null-project group never appears in `projects`.
  const mixed = createSnapshot(
    createFakeContext(
      combineTeamServices(
        buildSimpleTeam({ teamId: 'session-with-cwd' }),
        buildSimpleTeam({ teamId: 'session-without-cwd', cwd: null, withSessions: false }),
      ),
    ),
  )
  assert.equal(mixed.teams.length, 2)
  assert.equal(mixed.totals.teams, 2)
  assert.equal(mixed.teams.filter((team) => team.project === null).length, 1)
  assert.deepEqual(
    mixed.projects.map((project) => project.teams),
    [1],
  )
  assertLossless(noSessions)
  assertLossless(noCwd)
  assertLossless(unmatched)
  assertLossless(mixed)
})

test('project: throwing/odd workspaceRegistry never throws; malformed entities are skipped', () => {
  const thrown = buildTeamServices()
  thrown.services.workspaceRegistry = {
    list() {
      throw new Error('registry broke')
    },
  }
  const thrownSnapshot = createSnapshot(createFakeContext(thrown.services))
  assert.deepEqual(thrownSnapshot.teams[0].project, { id: `cwd:${ROOT_CWD}`, title: 'team', path: ROOT_CWD })

  const nonArray = buildTeamServices()
  nonArray.services.workspaceRegistry = { list: () => null }
  const nonArraySnapshot = createSnapshot(createFakeContext(nonArray.services))
  assert.deepEqual(nonArraySnapshot.teams[0].project, { id: `cwd:${ROOT_CWD}`, title: 'team', path: ROOT_CWD })

  const throwingSessionIds = { id: 'workspace-throws', path: 'C:\\elsewhere', title: 'broken' }
  Object.defineProperty(throwingSessionIds, 'sessionIds', {
    get() {
      throw new Error('sessionIds broke')
    },
  })
  const guarded = buildTeamServices({
    workspaces: [null, { id: '', path: 'C:\\nope', title: 'no-id' }, throwingSessionIds, makeWorkspace('workspace-ok', ROOT_CWD, 'ok', [])],
  })
  const guardedSnapshot = createSnapshot(createFakeContext(guarded.services))
  assert.deepEqual(guardedSnapshot.teams[0].project, { id: 'workspace-ok', title: 'ok', path: ROOT_CWD })
  assertLossless(thrownSnapshot)
  assertLossless(guardedSnapshot)
})

// ---------------------------------------------------------------------------
// counts, active flags, totals and projects aggregation
// ---------------------------------------------------------------------------

test('counts idle/ready plus member and task active flags', () => {
  const members = [
    { id: 'session-idle', name: 'idle', role: 'teammate', status: 'inactive', description: 'i', diagnostics: [] },
    { id: 'session-prov', name: 'prov', role: 'teammate', status: 'provisioning', description: 'p', diagnostics: [] },
    { id: 'session-failed', name: 'failed', role: 'teammate', status: 'failed', description: 'f', diagnostics: [] },
  ]
  const tasks = [
    taskView({ id: 'task-ready', status: 'pending', ready: true }),
    taskView({ id: 'task-blocked', status: 'pending', ready: false, blockedBy: ['task-ready'] }),
    taskView({ id: 'task-pending', status: 'pending', ready: false }),
    taskView({ id: 'task-active', status: 'in_progress', ownerName: 'helper' }),
    taskView({ id: 'task-completed', status: 'completed' }),
  ]
  const fixture = buildSimpleTeam({ members, tasks })
  const snapshot = createSnapshot(createFakeContext(fixture.services))
  const team = snapshot.teams[0]

  assert.deepEqual(team.counts, {
    members: 4,
    running: 1,
    provisioning: 1,
    failed: 1,
    idle: 1,
    tasks: 5,
    pending: 3,
    inProgress: 1,
    completed: 1,
    blocked: 1,
    ready: 1,
  })
  assert.equal(team.active, true)

  // Lead (running) is active; inactive/failed are not, provisioning is.
  assert.deepEqual(
    team.members.map((member) => member.name),
    ['lead', 'idle', 'prov', 'failed'],
  )
  assert.deepEqual(
    team.members.map((member) => member.active),
    [true, false, true, false],
  )
  assert.deepEqual(
    team.tasks.map((task) => task.active),
    [false, false, false, true, false],
  )

  assert.deepEqual(snapshot.totals, {
    teams: 1,
    activeTeams: 1,
    members: 4,
    running: 1,
    tasks: 5,
    pending: 3,
    inProgress: 1,
    blocked: 1,
    completed: 1,
  })
  assert.deepEqual(snapshot.projects, [
    { id: `cwd:${ROOT_CWD}`, title: 'team', path: ROOT_CWD, teams: 1, activeTeams: 1, running: 1, inProgress: 1 },
  ])
  assertLossless(snapshot)
})

test('projects aggregate listed teams only, with activeTeams/teams/title ordering', () => {
  const alphaRun = buildSimpleTeam({
    teamId: 'session-alpha-run',
    cwd: 'C:\\repo\\alpha',
    latestTime: 500,
    tasks: [taskView({ id: 'task-alpha', status: 'in_progress' })],
  })
  const alphaIdle = buildSimpleTeam({
    teamId: 'session-alpha-idle',
    cwd: 'C:\\repo\\alpha',
    rootStatus: 'inactive',
    memberStatus: 'inactive',
    latestTime: 9000,
  })
  const betaRun = buildSimpleTeam({ teamId: 'session-beta-run', cwd: 'C:\\repo\\beta', latestTime: 2000 })
  const gammaRun = buildSimpleTeam({ teamId: 'session-gamma-run', cwd: 'C:\\repo\\gamma', latestTime: 3000 })
  const deltaIdle = buildSimpleTeam({
    teamId: 'session-delta-idle',
    cwd: 'C:\\repo\\delta',
    rootStatus: 'inactive',
    memberStatus: 'inactive',
    latestTime: 4000,
  })
  const services = combineTeamServices(alphaRun, alphaIdle, betaRun, gammaRun, deltaIdle)

  // The optional registry must be listed at most once per snapshot, not per team.
  let listCalls = 0
  services.workspaceRegistry = {
    list() {
      listCalls += 1
      return []
    },
  }

  const snapshot = createSnapshot(createFakeContext(services))
  assert.equal(listCalls, 1)

  // Teams: active first (activity desc), then idle (activity desc).
  assert.deepEqual(
    snapshot.teams.map((team) => team.id),
    ['session-gamma-run', 'session-beta-run', 'session-alpha-run', 'session-alpha-idle', 'session-delta-idle'],
  )
  assert.deepEqual(
    snapshot.teams.map((team) => team.project === null ? null : team.project.id),
    [
      'cwd:C:\\repo\\gamma',
      'cwd:C:\\repo\\beta',
      'cwd:C:\\repo\\alpha',
      'cwd:C:\\repo\\alpha',
      'cwd:C:\\repo\\delta',
    ],
  )

  // Projects: activeTeams desc, teams desc, then title asc.
  assert.deepEqual(snapshot.projects, [
    { id: 'cwd:C:\\repo\\alpha', title: 'alpha', path: 'C:\\repo\\alpha', teams: 2, activeTeams: 1, running: 2, inProgress: 1 },
    { id: 'cwd:C:\\repo\\beta', title: 'beta', path: 'C:\\repo\\beta', teams: 1, activeTeams: 1, running: 2, inProgress: 0 },
    { id: 'cwd:C:\\repo\\gamma', title: 'gamma', path: 'C:\\repo\\gamma', teams: 1, activeTeams: 1, running: 2, inProgress: 0 },
    { id: 'cwd:C:\\repo\\delta', title: 'delta', path: 'C:\\repo\\delta', teams: 1, activeTeams: 0, running: 0, inProgress: 0 },
  ])

  assert.deepEqual(snapshot.totals, {
    teams: 5,
    activeTeams: 3,
    members: 10,
    running: 6,
    tasks: 1,
    pending: 0,
    inProgress: 1,
    blocked: 0,
    completed: 0,
  })
  assertLossless(snapshot)
})

// ---------------------------------------------------------------------------
// v3 session stats (optional sessionProjections service)
// ---------------------------------------------------------------------------

test('stats: member and team stats map the projections (tokens, work/idle, ratio, live)', () => {
  const createdAt = FIXED_NOW - 600_000
  const projections = {
    [ROOT_ID]: {
      sessionStats: { turns: 8, steps: 21, llmMs: 90000, toolMs: 20000, ttftMs: 3000, ttftSteps: 5, decodeMs: 500, decodeTokens: 100 },
      tokenUsage: { uncachedInputTokens: 4567, outputTokens: 15544, cacheReadTokens: 90000, cacheWriteTokens: 1000 },
    },
    [TEAMMATE_ID]: {
      sessionStats: { turns: 3, steps: 5, llmMs: 40000, toolMs: 10000, ttftMs: 1000, ttftSteps: 2, decodeMs: 200, decodeTokens: 50 },
      tokenUsage: { uncachedInputTokens: 1000, outputTokens: 500, cacheReadTokens: 2000, cacheWriteTokens: 0 },
    },
  }
  const { services } = buildTeamServices({ createdAt, projections })
  const snapshot = createSnapshot(createFakeContext(services), FIXED_NOW)
  const team = snapshot.teams[0]

  const lead = team.members[0]
  assert.deepEqual(lead.stats, {
    turns: 8,
    steps: 21,
    tokens: { total: 111111, uncachedInput: 4567, cacheRead: 90000, cacheWrite: 1000, output: 15544 },
    llmMs: 90000,
    toolMs: 20000,
    workingMs: 110000,
    idleMs: 490000,
    wallMs: 600000,
    workingRatio: 0.1833,
    live: true,
  })

  const reviewer = team.members[1]
  assert.deepEqual(reviewer.stats, {
    turns: 3,
    steps: 5,
    tokens: { total: 3500, uncachedInput: 1000, cacheRead: 2000, cacheWrite: 0, output: 500 },
    llmMs: 40000,
    toolMs: 10000,
    workingMs: 50000,
    idleMs: 550000,
    wallMs: 600000,
    workingRatio: 0.0833,
    live: true,
  })

  assert.deepEqual(team.stats, {
    turns: 11,
    steps: 26,
    tokens: { total: 114611, uncachedInput: 5567, cacheRead: 92000, cacheWrite: 1000, output: 16044 },
    llmMs: 130000,
    toolMs: 30000,
    workingMs: 160000,
    idleMs: 1040000,
    wallMs: 1200000,
    workingRatio: 0.1333,
  })

  // v2 fields/behavior are untouched by the stats addition.
  assert.equal(team.id, ROOT_ID)
  assert.equal(team.active, true)
  assert.deepEqual(team.project, { id: `cwd:${ROOT_CWD}`, title: 'team', path: ROOT_CWD })
  assert.equal(team.counts.members, 2)
  assert.equal(team.counts.inProgress, 1)
  assert.equal(snapshot.totals.activeTeams, 1)
  assert.equal(snapshot.projects.length, 1)
  assertLossless(snapshot)
})

test('stats: missing sessionProjections yields all-null member and team stats', () => {
  const { services } = buildTeamServices()
  const snapshot = createSnapshot(createFakeContext(services), FIXED_NOW)
  const team = snapshot.teams[0]
  assert.deepEqual(team.stats, NULL_TEAM_STATS)
  for (const member of team.members) assert.deepEqual(member.stats, NULL_MEMBER_STATS)
  assertLossless(snapshot)
})

test('stats: throwing or garbage stateOf degrades to nulls without throwing', () => {
  const createdAt = FIXED_NOW - 30_000
  const throwing = buildTeamServices({ createdAt })
  throwing.services.sessionProjections = {
    stateOf() {
      throw new Error('projection registry broke')
    },
  }
  let snapshot
  assert.doesNotThrow(() => {
    snapshot = createSnapshot(createFakeContext(throwing.services), FIXED_NOW)
  })
  const thrownTeam = snapshot.teams[0]
  for (const member of thrownTeam.members) {
    assert.equal(member.stats.turns, null)
    assert.equal(member.stats.steps, null)
    assert.equal(member.stats.tokens, null)
    assert.equal(member.stats.workingMs, null)
    assert.equal(member.stats.idleMs, null)
    assert.equal(member.stats.workingRatio, null)
    assert.equal(member.stats.wallMs, 30000) // wall time survives a projection failure
    assert.equal(member.stats.live, true)
  }
  assert.equal(thrownTeam.stats.turns, null)
  assert.equal(thrownTeam.stats.tokens, null)
  assert.equal(thrownTeam.stats.workingRatio, null)
  assert.equal(thrownTeam.stats.wallMs, 60000)
  assertLossless(snapshot)

  const garbage = buildTeamServices({
    createdAt,
    projections: {
      [ROOT_ID]: { sessionStats: 'garbage', tokenUsage: [1, 2, 3] },
      [TEAMMATE_ID]: {
        sessionStats: { turns: 'x', steps: Number.NaN, llmMs: Number.POSITIVE_INFINITY, toolMs: -5 },
        tokenUsage: { uncachedInputTokens: 'oops' },
      },
    },
  })
  const garbageSnapshot = createSnapshot(createFakeContext(garbage.services), FIXED_NOW)
  const garbageTeam = garbageSnapshot.teams[0]
  for (const member of garbageTeam.members) {
    assert.equal(member.stats.turns, null)
    assert.equal(member.stats.tokens, null)
    assert.equal(member.stats.llmMs, null)
    assert.equal(member.stats.toolMs, null)
    assert.equal(member.stats.workingMs, null)
    assert.equal(member.stats.wallMs, 30000)
  }
  assert.equal(garbageTeam.stats.tokens, null)
  assertLossless(garbageSnapshot)
})

test('stats: missing or invalid session createdAt leaves wall/idle/ratio null', () => {
  const projections = {
    [ROOT_ID]: { sessionStats: { turns: 1, steps: 1, llmMs: 1000, toolMs: 500 } },
    [TEAMMATE_ID]: { sessionStats: { turns: 1, steps: 1, llmMs: 1000, toolMs: 500 } },
  }
  const cases = [undefined, null, 'not-a-number', -100, Number.POSITIVE_INFINITY]
  for (const createdAt of cases) {
    const { services } = buildTeamServices({ createdAt, projections })
    const snapshot = createSnapshot(createFakeContext(services), FIXED_NOW)
    const team = snapshot.teams[0]
    for (const member of team.members) {
      assert.equal(member.stats.turns, 1)
      assert.equal(member.stats.workingMs, 1500)
      assert.equal(member.stats.wallMs, null)
      assert.equal(member.stats.idleMs, null)
      assert.equal(member.stats.workingRatio, null)
      assert.equal(member.stats.live, false)
    }
    assert.equal(team.stats.workingMs, 3000)
    assert.equal(team.stats.wallMs, null)
    assert.equal(team.stats.idleMs, null)
    assert.equal(team.stats.workingRatio, null)
    assertLossless(snapshot)
  }
})

test('stats: zero usage totals 0 and missing tokenUsage stays null', () => {
  const createdAt = FIXED_NOW - 10_000
  const projections = {
    [ROOT_ID]: {
      sessionStats: { turns: 2, steps: 3, llmMs: 1000, toolMs: 500 },
      tokenUsage: { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
    [TEAMMATE_ID]: { sessionStats: { turns: 1, steps: 1, llmMs: 0, toolMs: 0 } },
  }
  const { services } = buildTeamServices({ createdAt, projections })
  const snapshot = createSnapshot(createFakeContext(services), FIXED_NOW)
  const team = snapshot.teams[0]

  assert.deepEqual(team.members[0].stats.tokens, {
    total: 0,
    uncachedInput: 0,
    cacheRead: 0,
    cacheWrite: 0,
    output: 0,
  })
  assert.equal(team.members[1].stats.tokens, null) // sessionStats present, tokenUsage absent
  assert.equal(team.members[1].stats.turns, 1)
  assert.equal(team.members[1].stats.workingMs, 0)
  assert.equal(team.members[1].stats.idleMs, 10000)
  assert.equal(team.members[1].stats.workingRatio, 0)

  assert.deepEqual(team.stats.tokens, { total: 0, uncachedInput: 0, cacheRead: 0, cacheWrite: 0, output: 0 })
  assert.equal(team.stats.turns, 3)
  assert.equal(team.stats.workingMs, 1500)
  assert.equal(team.stats.idleMs, 18500)
  assert.equal(team.stats.wallMs, 20000)
  assert.equal(team.stats.workingRatio, 0.075)

  // A partially reported usage object counts missing buckets as 0.
  const partial = buildTeamServices({ projections: { [ROOT_ID]: { tokenUsage: { cacheReadTokens: 42 } } } })
  const partialSnapshot = createSnapshot(createFakeContext(partial.services), FIXED_NOW)
  assert.deepEqual(partialSnapshot.teams[0].members[0].stats.tokens, {
    total: 42,
    uncachedInput: 0,
    cacheRead: 42,
    cacheWrite: 0,
    output: 0,
  })
  assertLossless(snapshot)
  assertLossless(partialSnapshot)
})

test('stats: team aggregation sums known fields and keeps mixed members null-safe', () => {
  const createdAt = FIXED_NOW - 600_000
  const members = [
    { id: 'session-partial', name: 'partial', role: 'teammate', status: 'running', description: 'p', diagnostics: [] },
    { id: 'session-none', name: 'none', role: 'teammate', status: 'inactive', description: 'n', diagnostics: [] },
  ]
  const projections = {
    'session-mixed': {
      sessionStats: { turns: 8, llmMs: 90000 },
      tokenUsage: { uncachedInputTokens: 1000, outputTokens: 500, cacheReadTokens: 2000, cacheWriteTokens: 0 },
    },
    'session-partial': {
      sessionStats: { turns: 2, steps: 5, llmMs: 10000, toolMs: 5000 },
      tokenUsage: { uncachedInputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  }
  const fixture = buildSimpleTeam({ teamId: 'session-mixed', createdAt, members, projections })
  const snapshot = createSnapshot(createFakeContext(fixture.services), FIXED_NOW)
  const team = snapshot.teams[0]
  assert.equal(team.members.length, 3)

  const [lead, partial, none] = team.members
  assert.deepEqual(lead.stats, {
    turns: 8,
    steps: null,
    tokens: { total: 3500, uncachedInput: 1000, cacheRead: 2000, cacheWrite: 0, output: 500 },
    llmMs: 90000,
    toolMs: null,
    workingMs: null,
    idleMs: null,
    wallMs: 600000,
    workingRatio: null,
    live: true,
  })
  assert.deepEqual(partial.stats, {
    turns: 2,
    steps: 5,
    tokens: { total: 150, uncachedInput: 100, cacheRead: 0, cacheWrite: 0, output: 50 },
    llmMs: 10000,
    toolMs: 5000,
    workingMs: 15000,
    idleMs: 585000,
    wallMs: 600000,
    workingRatio: 0.025,
    live: true,
  })
  assert.deepEqual(none.stats, {
    turns: null,
    steps: null,
    tokens: null,
    llmMs: null,
    toolMs: null,
    workingMs: null,
    idleMs: null,
    wallMs: 600000,
    workingRatio: null,
    live: false,
  })

  assert.deepEqual(team.stats, {
    turns: 10,
    steps: 5,
    tokens: { total: 3650, uncachedInput: 1100, cacheRead: 2000, cacheWrite: 0, output: 550 },
    llmMs: 100000,
    toolMs: 5000,
    workingMs: 15000,
    idleMs: 585000,
    wallMs: 1800000,
    workingRatio: 0.025,
  })
  assertLossless(snapshot)
})

test('stats: workingRatio clamps/rounds and is null without a positive denominator', () => {
  // working > wall: idle clamps to 0 and the ratio is exactly 1.
  const overworked = buildTeamServices({
    createdAt: FIXED_NOW - 10_000,
    projections: {
      [ROOT_ID]: { sessionStats: { turns: 0, steps: 0, llmMs: 20000, toolMs: 0 } },
      [TEAMMATE_ID]: { sessionStats: { turns: 0, steps: 0, llmMs: 20000, toolMs: 0 } },
    },
  })
  const overworkedSnapshot = createSnapshot(createFakeContext(overworked.services), FIXED_NOW)
  assert.equal(overworkedSnapshot.teams[0].members[0].stats.idleMs, 0)
  assert.equal(overworkedSnapshot.teams[0].members[0].stats.workingRatio, 1)
  assert.equal(overworkedSnapshot.teams[0].stats.workingRatio, 1)

  // working 0 with wall > 0: ratio 0.
  const idling = buildTeamServices({
    createdAt: FIXED_NOW - 10_000,
    projections: {
      [ROOT_ID]: { sessionStats: { turns: 0, steps: 0, llmMs: 0, toolMs: 0 } },
      [TEAMMATE_ID]: { sessionStats: { turns: 0, steps: 0, llmMs: 0, toolMs: 0 } },
    },
  })
  const idlingSnapshot = createSnapshot(createFakeContext(idling.services), FIXED_NOW)
  assert.equal(idlingSnapshot.teams[0].members[0].stats.workingRatio, 0)
  assert.equal(idlingSnapshot.teams[0].stats.workingRatio, 0)

  // zero-length observation window: no denominator -> null.
  const emptyWindow = buildTeamServices({
    createdAt: FIXED_NOW,
    projections: {
      [ROOT_ID]: { sessionStats: { turns: 0, steps: 0, llmMs: 0, toolMs: 0 } },
      [TEAMMATE_ID]: { sessionStats: { turns: 0, steps: 0, llmMs: 0, toolMs: 0 } },
    },
  })
  const emptyWindowSnapshot = createSnapshot(createFakeContext(emptyWindow.services), FIXED_NOW)
  assert.equal(emptyWindowSnapshot.teams[0].members[0].stats.wallMs, 0)
  assert.equal(emptyWindowSnapshot.teams[0].members[0].stats.workingRatio, null)
  assert.equal(emptyWindowSnapshot.teams[0].members[0].stats.live, true)
  assert.equal(emptyWindowSnapshot.teams[0].stats.workingRatio, null)

  // rounding: 20000 / 60000 -> 0.3333.
  const rounded = buildTeamServices({
    createdAt: FIXED_NOW - 60_000,
    projections: {
      [ROOT_ID]: { sessionStats: { turns: 0, steps: 0, llmMs: 20000, toolMs: 0 } },
      [TEAMMATE_ID]: { sessionStats: { turns: 0, steps: 0, llmMs: 20000, toolMs: 0 } },
    },
  })
  const roundedSnapshot = createSnapshot(createFakeContext(rounded.services), FIXED_NOW)
  assert.equal(roundedSnapshot.teams[0].members[0].stats.workingRatio, 0.3333)
  assert.equal(roundedSnapshot.teams[0].stats.workingRatio, 0.3333)
  assertLossless(overworkedSnapshot)
  assertLossless(idlingSnapshot)
  assertLossless(emptyWindowSnapshot)
  assertLossless(roundedSnapshot)
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

test('task release/reopen actions are derived from the previous in-window status', () => {
  const entries = normalizeActivity(
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
  assert.equal(snapshot.teams[0].project, null) // session has no creation-header cwd
  assert.deepEqual(snapshot.projects, [])
  assertLossless(snapshot)

  const member = snapshot.teams[0].members[0]
  assert.equal(member.name, 'lead')
  assert.equal(member.status, 'inactive')
  assert.equal(member.active, false)
  assert.deepEqual(member.diagnostics, ['diag'])
  assert.deepEqual(member.stats, NULL_MEMBER_STATS)
  const teammate = snapshot.teams[0].members[1]
  assert.equal(teammate.name, 'helper')
  assert.equal(teammate.context, null)
  assert.equal(teammate.status, 'failed')
  assert.equal(teammate.active, false)
  assert.deepEqual(teammate.stats, NULL_MEMBER_STATS)
  assert.deepEqual(snapshot.teams[0].stats, NULL_TEAM_STATS)
  const task = snapshot.teams[0].tasks[0]
  assert.equal(task.id, 'task-1')
  assert.equal(task.revision, 0)
  assert.equal(task.subject, '')
  assert.equal(task.status, 'pending')
  assert.equal(task.active, false)
  assert.deepEqual(task.blockedBy, ['task-0'])
})

// ---------------------------------------------------------------------------
// HTTP route
// ---------------------------------------------------------------------------

test('route: GET snapshot -> 200 JSON v3 with cache headers; other requests -> 404', async () => {
  const { services } = buildTeamServices()
  const handler = createRouteHandler(createFakeContext(services))

  const okResponse = createFakeResponse()
  await handler({ method: 'GET', url: '/api/team-console/snapshot?ts=1' }, okResponse)
  assert.equal(okResponse.statusCode, 200)
  assert.equal(okResponse.headers['content-type'], 'application/json; charset=utf-8')
  assert.equal(okResponse.headers['cache-control'], 'no-store')
  const body = JSON.parse(okResponse.body)
  assert.equal(body.ok, true)
  assert.equal(body.version, 3)
  assert.equal(body.teams.length, 1)
  assert.equal(body.projects.length, 1)
  assert.equal(body.totals.activeTeams, 1)
  // v3 stats are on the wire even when the projections are unavailable.
  assert.deepEqual(body.teams[0].stats, NULL_TEAM_STATS)
  assert.deepEqual(body.teams[0].members[0].stats, NULL_MEMBER_STATS)
  assertLossless(body)

  const notFoundResponse = createFakeResponse()
  await handler({ method: 'POST', url: '/api/team-console/snapshot' }, notFoundResponse)
  assert.equal(notFoundResponse.statusCode, 404)
  assert.equal(JSON.parse(notFoundResponse.body).ok, false)
  assert.equal(JSON.parse(notFoundResponse.body).version, 3)

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
  assert.equal(body.version, 3)
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
  assert.equal(anonymousBody.version, 3)
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
