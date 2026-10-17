/**
 * dsh-agent-team-console — Host half.
 * ============================================================================
 * Registers one read-only HTTP route on the Harness Web server:
 *
 *   GET /api/team-console/snapshot
 *
 * and answers with a self-contained JSON snapshot (contract version 2) of every
 * live Agent Team that the Host services `agentTeams` / `agents` / `sessions`
 * and the optional `workspaceRegistry` can see. The Client half (`client.js`)
 * polls this endpoint; this file never touches the disk, never starts timers,
 * and keeps no mutable module state — every request rebuilds the snapshot from
 * the live services.
 *
 * Contract version 2 additions (see docs/design.md):
 *  - Every listed team carries `project` (`{ id, title, path }` or null). It is
 *    resolved best effort from the optional `workspaceRegistry` service (an
 *    entity whose `sessionIds` owns the Lead session first, then a
 *    case-insensitive workspace-path match against the Lead session's immutable
 *    creation-header `cwd`) and otherwise falls back to a synthetic
 *    `id: 'cwd:' + cwd` project titled by the directory basename. A workspace
 *    entity without a usable title is titled by its path basename too. Teams
 *    with neither a workspace nor a cwd stay listed with `project: null`.
 *  - `active` flags surface the work in progress: a team is active when it has
 *    a running/provisioning member or an in-progress task, a member is active
 *    when running/provisioning, and a task is active when in progress.
 *  - Per-team counts add `idle` (inactive members) and `ready` (pending tasks
 *    with `ready === true`).
 *  - Top-level `totals` add `activeTeams`, `pending`, `inProgress` and
 *    `blocked`; top-level `projects` aggregates only the projects that own at
 *    least one listed team.
 *  - Teams are ordered active first, then most recent observed activity (the
 *    previous activityAt order). Projects are ordered by `activeTeams` desc,
 *    `teams` desc, then `title`.
 *
 * Design constraints (see docs/design.md):
 *  - Zero `import` statements, so plain `node` can import and unit-test this file.
 *  - `agentTeams` / `agents` / `sessions` / `workspaceRegistry` are OPTIONAL:
 *    resolved per request with `ctx.get(name)` and guarded. Missing Agent Teams
 *    support degrades to `unsupported` instead of throwing; a missing workspace
 *    registry degrades to the cwd fallback. The whole aggregation stays
 *    synchronous: no async request work, timers, disk access or mutations.
 *  - When the DSH `connection` service is mounted, every request passes its
 *    Host/Origin fence and browser-session admission before the route answers,
 *    so an anonymous HTTP client is rejected the same way as the Web UI itself.
 *  - The route handler never rejects / never leaks an unhandled error.
 *  - Everything the contract promises is JSON-safe: branded ids via `String()`,
 *    `undefined` replaced by `null`, descriptions capped at 2000 chars and
 *    activity texts at 200 chars.
 * ============================================================================
 */

/** The Web server route is required for this plugin; the Agent Team services are optional. */
export const inject = ['webServer']

/** Snapshot contract version. */
export const VERSION = 2

/** Valid JSON body used only when a response body cannot be encoded at all. */
const ENCODING_FALLBACK = `{"version":${VERSION},"ok":false,"error":"snapshot could not be encoded","teams":[]}`

const ROUTE_PREFIX = '/api/team-console'
const SNAPSHOT_PATH = '/api/team-console/snapshot'

const ACTIVITY_LIMIT = 40
/** First log window scanned for the activity timeline; expands ×4 until enough entries exist. */
const ACTIVITY_INITIAL_WINDOW = 400
/** Hard ceiling on how many trailing Lead-session events one activity scan may read. */
const ACTIVITY_MAX_WINDOW = 20000
const ACTIVITY_TARGET_ENTRIES = 12
const MEMBER_SCAN_EVENTS = 60
const ACTIVITY_TEXT_MAX = 200
const DESCRIPTION_MAX = 2000

/** Session event types owned by the Agent Teams projection (Lead session log only). */
const TEAM_EVENT_TYPES = new Set(['team/member', 'team/task'])

// ---------------------------------------------------------------------------
// Small value helpers
// ---------------------------------------------------------------------------

/** @returns whether value is a non-null, non-array object. */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Convert a primitive-ish value to text, or null when it is not representable. */
function toText(value) {
  if (typeof value === 'string') return value
  if (value === undefined || value === null) return null
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  return null
}

/** First value that can be rendered as text. */
function firstText(...values) {
  for (const value of values) {
    const text = toText(value)
    if (text !== null) return text
  }
  return null
}

/** Convert a branded id (or anything id-like) to a plain string. */
function toId(value) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'symbol' || typeof value === 'function') return ''
  return typeof value === 'string' ? value : String(value)
}

/** Cap a nullable string at `max` characters (code units); null stays null. */
function capText(value, max) {
  if (value === null || value === undefined) return null
  const text = typeof value === 'string' ? value : String(value)
  return text.length > max ? text.slice(0, max) : text
}

/** Convert to a finite number, or null. */
function toFiniteNumber(value) {
  if (value === undefined || value === null) return null
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

/** Convert to a truncated integer, or `fallback`. */
function toInt(value, fallback) {
  const number = toFiniteNumber(value)
  return number === null ? fallback : Math.trunc(number)
}

/** Copy a string[] defensively; non-string entries become their string form, other values are dropped. */
function toStringList(value) {
  if (!Array.isArray(value)) return []
  const result = []
  for (const item of value) {
    const text = toText(item)
    if (text !== null) result.push(text)
  }
  return result
}

/** Render any thrown value as a bounded one-line message. */
function errorText(error) {
  if (error instanceof Error) {
    const name = typeof error.name === 'string' && error.name.length > 0 ? error.name : 'Error'
    const message = typeof error.message === 'string' ? error.message : ''
    return message.length > 0 ? message : name
  }
  if (typeof error === 'string') return error
  try {
    const text = String(error)
    return text === '[object Object]' ? 'Unexpected error' : text
  } catch {
    return 'Unexpected error'
  }
}

function log(message) {
  try {
    console.log(`[agent-team-console] ${message}`)
  } catch {
    /* logging is best effort only */
  }
}

/** Optional-service lookup; never throws, never returns null. */
function getService(ctx, name) {
  if (!isRecord(ctx) || typeof ctx.get !== 'function') return undefined
  try {
    const service = ctx.get(name)
    return service === undefined || service === null ? undefined : service
  } catch {
    return undefined
  }
}

/**
 * Apply the DSH connection service's Host/Origin fence and browser-session
 * admission to one request, when that service is mounted. Web profiles that
 * serve the Web UI mount it; an embedder without it keeps the route under its
 * own deployment-level access control.
 * @param ctx - Cordis plugin context.
 * @param req - Node HTTP request.
 * @returns 401 or 403 when the request is rejected, `null` when admitted or
 *   when no connection service is present.
 */
function admissionRejection(ctx, req) {
  const connection = getService(ctx, 'connection')
  if (!connection || typeof connection.requestRejection !== 'function') return null
  try {
    const rejection = connection.requestRejection(req)
    return rejection === 401 || rejection === 403 ? rejection : null
  } catch {
    return 401
  }
}

/** Accept a Map or a plain `{ id: name }` object as a member-name lookup. */
function asNameMap(value) {
  if (value instanceof Map) return value
  const map = new Map()
  if (isRecord(value)) {
    for (const key of Object.keys(value)) {
      const name = firstText(value[key])
      if (name !== null) map.set(key, name)
    }
  }
  return map
}

// ---------------------------------------------------------------------------
// JSON safety
// ---------------------------------------------------------------------------

/**
 * Deep-copy a value into something JSON can represent losslessly:
 * `undefined`/functions/symbols/NaN/Infinity become `null`, bigints become
 * strings, circular references become `null`. The result round-trips through
 * `JSON.parse(JSON.stringify(...))` unchanged.
 * @param value - arbitrary value assembled by the aggregation.
 * @param seen - recursion guard for the current path.
 * @returns a JSON-safe clone.
 */
export function toJsonSafe(value, seen = new WeakSet()) {
  if (value === undefined || value === null) return null
  const type = typeof value
  if (type === 'string' || type === 'boolean') return value
  if (type === 'number') {
    if (!Number.isFinite(value)) return null
    return value === 0 ? 0 : value
  }
  if (type === 'bigint') return String(value)
  if (type === 'function' || type === 'symbol') return null
  if (type !== 'object') return String(value)
  if (seen.has(value)) return null
  seen.add(value)
  try {
    if (Array.isArray(value)) return value.map((item) => toJsonSafe(item, seen))
    const result = {}
    for (const key of Object.keys(value)) result[key] = toJsonSafe(value[key], seen)
    return result
  } finally {
    seen.delete(value)
  }
}

// ---------------------------------------------------------------------------
// Session reads (all best effort; a failing read degrades, never throws)
// ---------------------------------------------------------------------------

/**
 * Read a bounded tail of one live Session's event log.
 * @param session - live Session from the `sessions` service (or anything).
 * @param fromSeq - inclusive start offset.
 * @param toSeqExclusive - exclusive end offset.
 * @returns readonly SessionEvent[] (possibly empty); never throws.
 */
function snapshotEventsSafe(session, fromSeq, toSeqExclusive) {
  if (!isRecord(session) || typeof session.snapshotEvents !== 'function') return []
  try {
    const events = session.snapshotEvents(fromSeq, toSeqExclusive)
    return Array.isArray(events) ? events : []
  } catch {
    return []
  }
}

/**
 * Read a bounded tail of one live Session's event log.
 * @param session - live Session from the `sessions` service (or anything).
 * @param windowSize - how many trailing events to request.
 * @returns readonly SessionEvent[] (possibly empty).
 */
function readSessionEvents(session, windowSize) {
  if (!isRecord(session) || typeof session.snapshotEvents !== 'function') return []
  const seq = toFiniteNumber(session.seq)
  if (seq === null) return []
  const to = Math.max(0, Math.trunc(seq))
  const from = Math.max(0, to - Math.max(1, toInt(windowSize, MEMBER_SCAN_EVENTS)))
  return snapshotEventsSafe(session, from, to)
}

/**
 * Enrich one roster row with live Session activity: lastActivityAt /
 * lastEventType / turns / steps, plus provider/model from the session request
 * header when the roster view does not carry them.
 * @param member - normalized member row, mutated in place.
 * @param sessions - optional `sessions` service.
 */
function enrichMemberFromSession(member, sessions) {
  if (!isRecord(member) || !sessions || typeof sessions.get !== 'function') return
  let session
  try {
    session = sessions.get(member.id)
  } catch {
    session = undefined
  }
  if (!session) return
  const events = readSessionEvents(session, MEMBER_SCAN_EVENTS)
  if (events.length > 0) {
    const last = events[events.length - 1]
    if (isRecord(last)) {
      const time = toFiniteNumber(last.time)
      if (time !== null) member.lastActivityAt = time
      const type = firstText(last.type)
      if (type !== null) member.lastEventType = type
    }
    let turns = null
    let steps = null
    for (const event of events) {
      if (!isRecord(event)) continue
      const type = firstText(event.type)
      const data = isRecord(event.data) ? event.data : undefined
      if (data === undefined) continue
      if (type === 'turn/start') {
        const turn = toFiniteNumber(data.turn)
        if (turn !== null && (turns === null || turn > turns)) turns = turn
      } else if (type === 'step/start') {
        const step = toFiniteNumber(data.step)
        if (step !== null && (steps === null || step > steps)) steps = step
      }
    }
    member.turns = turns
    member.steps = steps
  }
  try {
    if (member.provider === null || member.model === null) {
      const header = typeof session.requestHeader === 'function' ? session.requestHeader() : undefined
      const config = isRecord(header) && isRecord(header.config) ? header.config : undefined
      if (config) {
        if (member.provider === null) member.provider = firstText(config.provider)
        if (member.model === null) member.model = firstText(config.model)
      }
    }
  } catch {
    /* request header is optional */
  }
}

// ---------------------------------------------------------------------------
// team/member + team/task activity normalization
// ---------------------------------------------------------------------------
//
// Real payloads (installed @deepseek-ai/dsh-experimental-agent-team, lib/index.js):
//   team/member  data = { version: 2, teamId, member: { id, name, description,
//                        provider, context: 'fresh'|'fork',
//                        phase: 'provisioning'|'active'|'failed', error? } }
//   team/task    data = { version: 2, teamId, task: { id, revision, subject,
//                        description, status: 'pending'|'in_progress'|'completed'|
//                        'deleted', ownerId?, blockedBy, writeScopes } }
// Anything else degrades to a generic entry with a `text` fallback.

function buildActivityText(kind, action, fields) {
  const label = kind === 'task' ? firstText(fields.taskId) ?? 'task' : firstText(fields.memberName) ?? 'member'
  const chunks = [label]
  if (action) chunks.push(action)
  if (kind === 'task' && fields.subject) chunks.push(String(fields.subject))
  return chunks.join(' · ')
}

/**
 * Normalize one raw `team/member` / `team/task` session-event payload into the
 * activity fields of the contract. Unknown shapes still produce a valid entry;
 * this function never throws.
 * @param type - raw session event type.
 * @param data - raw session event payload.
 * @param context - `{ memberNames?: Map|object, teamId?: string, previousTaskStatus?: (id)=>string|undefined }`.
 * @returns `{kind, action, memberName, taskId, subject, status, text}` or null for non-team types.
 */
export function normalizeTeamEvent(type, data, context = {}) {
  try {
    const kind = type === 'team/member' ? 'member' : type === 'team/task' ? 'task' : null
    if (kind === null) return null
    const safeContext = isRecord(context) ? context : {}
    const raw = isRecord(data) ? data : {}
    const nameMap = asNameMap(safeContext.memberNames)

    if (kind === 'member') {
      const member = isRecord(raw.member) ? raw.member : raw
      const name = firstText(member.name, raw.memberName, raw.name)
      const phase = firstText(member.phase, raw.phase, raw.memberPhase)
      // Labels picked to match the Client half's `action.*` locale keys where an
      // equivalent exists (`spawn`, `start`, `update`); unknown ones fall back to
      // the raw label.
      const action = phase === 'provisioning' ? 'spawn' : phase === 'active' ? 'start' : phase === 'failed' ? 'fail' : 'update'
      const status = phase === 'provisioning' ? 'provisioning' : phase === 'active' ? 'running' : phase === 'failed' ? 'failed' : null
      return {
        kind: 'member',
        action,
        memberName: name,
        taskId: null,
        subject: null,
        status,
        text: capText(buildActivityText('member', action, { memberName: name }), ACTIVITY_TEXT_MAX),
      }
    }

    const task = isRecord(raw.task) ? raw.task : raw
    const taskId = firstText(task.id, raw.taskId)
    const revision = toFiniteNumber(task.revision)
    const status = firstText(task.status)
    const subject = firstText(task.subject)
    const ownerId = firstText(task.ownerId)
    const teamId = firstText(safeContext.teamId)
    let memberName = ownerId !== null ? firstText(nameMap.get(ownerId)) : null
    if (memberName === null && ownerId !== null && teamId !== null && ownerId === teamId) memberName = 'lead'
    if (memberName === null) memberName = firstText(task.ownerName, raw.ownerName)
    const previous = typeof safeContext.previousTaskStatus === 'function' && taskId !== null ? safeContext.previousTaskStatus(taskId) : undefined
    let action
    if (revision === 1) action = 'create'
    else if (status === 'completed') action = 'complete'
    else if (status === 'deleted') action = 'delete'
    else if (status === 'in_progress') action = 'claim'
    else if (status === 'pending' && previous === 'in_progress') action = 'release'
    else if (status === 'pending' && previous === 'completed') action = 'reopen'
    else action = 'update'
    const normalizedStatus =
      status === 'pending' || status === 'in_progress' || status === 'completed' || status === 'deleted' ? status : null
    return {
      kind: 'task',
      action,
      memberName,
      taskId,
      subject,
      status: normalizedStatus,
      text: capText(buildActivityText('task', action, { taskId, subject }), ACTIVITY_TEXT_MAX),
    }
  } catch {
    return {
      kind: type === 'team/member' ? 'member' : 'task',
      action: 'update',
      memberName: null,
      taskId: null,
      subject: null,
      status: null,
      text: type === 'team/member' ? 'member update' : 'task update',
    }
  }
}

/**
 * Normalize one raw SessionEvent into a contract activity entry, or null when
 * the event is not a `team/member` / `team/task` event.
 * @param event - raw `{ type, seq, time, data }` session event.
 * @param context - see normalizeTeamEvent.
 */
export function normalizeActivityEvent(event, context = {}) {
  if (!isRecord(event)) return null
  const type = firstText(event.type)
  if (type === null || !TEAM_EVENT_TYPES.has(type)) return null
  const safeContext = isRecord(context) ? context : {}
  const teamId = firstText(safeContext.teamId)
  if (teamId !== null && isRecord(event.data)) {
    const eventTeamId = firstText(event.data.teamId)
    if (eventTeamId !== null && eventTeamId !== teamId) return null
  }
  const fields = normalizeTeamEvent(type, event.data, safeContext)
  if (fields === null) return null
  return {
    seq: toInt(event.seq, 0),
    time: toFiniteNumber(event.time) ?? 0,
    kind: fields.kind,
    action: fields.action,
    memberName: fields.memberName,
    taskId: fields.taskId,
    subject: fields.subject,
    status: fields.status,
    text: fields.text,
  }
}

/**
 * Normalize one chronological SessionEvent slice into capped, newest-first
 * activity entries.
 */
function normalizeActivityEvents(events, context, limit) {
  const safeContext = isRecord(context) ? context : {}
  const scanContext = {
    memberNames: asNameMap(safeContext.memberNames),
    teamId: firstText(safeContext.teamId),
    previousTaskStatus: undefined,
  }
  const taskStatus = new Map()
  scanContext.previousTaskStatus = (taskId) => taskStatus.get(taskId)
  const ordered = []
  for (const event of events) {
    const entry = normalizeActivityEvent(event, scanContext)
    if (entry === null) continue
    ordered.push(entry)
    if (entry.kind === 'task' && entry.taskId !== null && entry.taskId !== '' && entry.status !== null) {
      taskStatus.set(entry.taskId, entry.status)
    }
  }
  const capped = Math.max(0, toInt(limit, ACTIVITY_LIMIT))
  return ordered.slice(Math.max(0, ordered.length - capped)).reverse()
}

/**
 * Build the activity timeline for one team: filter the Lead session log down to
 * team events, newest first, capped at `limit` entries.
 *
 * Accepts either a live Session or a raw event array (handy for tests). For a
 * live Session it scans the newest 400 events first and expands ×4 until it has
 * enough entries, reaches the start of the log, or hits the 20000-event ceiling —
 * long-running Lead sessions stay cheap in the common case.
 * @param source - live Session (with `seq` + `snapshotEvents`) or SessionEvent[].
 * @param context - `{ memberNames, teamId }`.
 * @param limit - maximum entries to return (default 40).
 * @returns activity entries, newest first.
 */
export function normalizeActivity(source, context = {}, limit = ACTIVITY_LIMIT) {
  const capped = Math.max(0, toInt(limit, ACTIVITY_LIMIT))
  if (Array.isArray(source)) return normalizeActivityEvents(source, context, capped)
  if (!isRecord(source) || typeof source.snapshotEvents !== 'function') return []
  const seq = toFiniteNumber(source.seq)
  if (seq === null) return []
  const total = Math.max(0, Math.trunc(seq))
  if (total === 0 || capped === 0) return []
  const target = Math.min(capped, ACTIVITY_TARGET_ENTRIES)
  let window = Math.min(ACTIVITY_INITIAL_WINDOW, total)
  for (;;) {
    const from = Math.max(0, total - window)
    const entries = normalizeActivityEvents(snapshotEventsSafe(source, from, total), context, capped)
    if (entries.length >= target || from === 0 || window >= ACTIVITY_MAX_WINDOW) return entries
    window = Math.min(total, window * 4)
  }
}

// ---------------------------------------------------------------------------
// Roster / task board normalization
// ---------------------------------------------------------------------------

function normalizeMemberStatus(value) {
  return value === 'running' || value === 'inactive' || value === 'provisioning' || value === 'failed' ? value : 'inactive'
}

function normalizeContext(value) {
  return value === 'fresh' || value === 'fork' ? value : null
}

/** Active team member: currently running or being provisioned. */
function isMemberActive(status) {
  return status === 'running' || status === 'provisioning'
}

/**
 * Normalize one TeamMemberView into the contract member row (session fields are
 * filled in afterwards by enrichMemberFromSession).
 */
function normalizeMemberRow(view, leadId) {
  const raw = isRecord(view) ? view : {}
  const id = toId(raw.id)
  const isLead = raw.role === 'lead' || (id !== '' && id === leadId)
  const status = normalizeMemberStatus(raw.status)
  return {
    id,
    name: firstText(raw.name) ?? (isLead ? 'lead' : 'unknown'),
    role: isLead ? 'lead' : 'teammate',
    status,
    description: capText(firstText(raw.description), DESCRIPTION_MAX),
    provider: firstText(raw.provider),
    model: firstText(raw.model),
    context: normalizeContext(raw.context),
    diagnostics: toStringList(raw.diagnostics),
    lastActivityAt: null,
    lastEventType: null,
    turns: null,
    steps: null,
    active: isMemberActive(status),
  }
}

/**
 * Normalize one TeamTaskView into the contract task row.
 * @returns the task row, or null for deleted tombstones.
 */
function normalizeTaskRow(view) {
  const raw = isRecord(view) ? view : {}
  const status = firstText(raw.status)
  if (status === 'deleted') return null
  const normalizedStatus = status === 'pending' || status === 'in_progress' || status === 'completed' ? status : 'pending'
  return {
    id: toId(raw.id),
    revision: toInt(raw.revision, 0),
    subject: firstText(raw.subject) ?? '',
    description: capText(firstText(raw.description) ?? '', DESCRIPTION_MAX),
    status: normalizedStatus,
    ownerName: firstText(raw.ownerName),
    blockedBy: toStringList(raw.blockedBy),
    ready: raw.ready === true,
    writeScopes: toStringList(raw.writeScopes),
    writeScopeWarnings: toStringList(raw.writeScopeWarnings),
    active: normalizedStatus === 'in_progress',
  }
}

function computeTeamCounts(members, tasks) {
  const counts = {
    members: members.length,
    running: 0,
    provisioning: 0,
    failed: 0,
    idle: 0,
    tasks: tasks.length,
    pending: 0,
    inProgress: 0,
    completed: 0,
    blocked: 0,
    ready: 0,
  }
  for (const member of members) {
    if (member.status === 'running') counts.running += 1
    else if (member.status === 'provisioning') counts.provisioning += 1
    else if (member.status === 'inactive') counts.idle += 1
    else if (member.status === 'failed') counts.failed += 1
  }
  for (const task of tasks) {
    if (task.status === 'pending') {
      counts.pending += 1
      if (task.ready === true) counts.ready += 1
      if (task.ready === false && task.blockedBy.length > 0) counts.blocked += 1
    } else if (task.status === 'in_progress') counts.inProgress += 1
    else if (task.status === 'completed') counts.completed += 1
  }
  return counts
}

/** A team is active while any of its members or its task board is working. */
function isTeamActive(counts) {
  return counts.provisioning > 0 || counts.running > 0 || counts.inProgress > 0
}

function computeTotals(teams) {
  const totals = {
    teams: teams.length,
    activeTeams: 0,
    members: 0,
    running: 0,
    tasks: 0,
    pending: 0,
    inProgress: 0,
    blocked: 0,
    completed: 0,
  }
  for (const team of teams) {
    const counts = team.counts
    if (team.active === true) totals.activeTeams += 1
    totals.members += counts.members
    totals.running += counts.running
    totals.tasks += counts.tasks
    totals.pending += counts.pending
    totals.inProgress += counts.inProgress
    totals.blocked += counts.blocked
    totals.completed += counts.completed
  }
  return totals
}

/**
 * Aggregate the listed teams' resolved projects. Only projects that own at least
 * one listed team are returned (teams with `project: null` are not grouped into
 * a virtual project; the Client shows them under its all-projects filter).
 * Order: activeTeams desc, teams desc, then title asc.
 * @param teams - listed contract team objects.
 */
function computeProjects(teams) {
  const byId = new Map()
  for (const team of teams) {
    const project = isRecord(team.project) ? team.project : null
    if (project === null) continue
    const id = toId(project.id)
    let aggregate = byId.get(id)
    if (aggregate === undefined) {
      aggregate = {
        id,
        title: firstText(project.title),
        path: firstText(project.path),
        teams: 0,
        activeTeams: 0,
        running: 0,
        inProgress: 0,
      }
      byId.set(id, aggregate)
    }
    aggregate.teams += 1
    if (team.active === true) aggregate.activeTeams += 1
    aggregate.running += team.counts.running
    aggregate.inProgress += team.counts.inProgress
  }
  const projects = [...byId.values()]
  projects.sort((left, right) => {
    if (right.activeTeams !== left.activeTeams) return right.activeTeams - left.activeTeams
    if (right.teams !== left.teams) return right.teams - left.teams
    const leftTitle = left.title === null ? '' : left.title
    const rightTitle = right.title === null ? '' : right.title
    return leftTitle < rightTitle ? -1 : leftTitle > rightTitle ? 1 : 0
  })
  return projects
}

// ---------------------------------------------------------------------------
// Project / workspace resolution (v2)
// ---------------------------------------------------------------------------
//
// The optional Host `workspaceRegistry` service lists durable workspaces as
// entities with `{ id, path, title, sessionIds }` (all synchronous getters; the
// registry is NOT a required service). A team is tied to a project in three
// best-effort steps:
//   1. workspace entity whose `sessionIds` owns the Lead session id;
//   2. else workspace entity whose `path` equals the Lead session cwd
//      case-insensitively with `/` and `\` unified;
//   3. else a synthetic `cwd:<path>` project from the Lead session's immutable
//      creation header; teams with neither a workspace nor a cwd get null.

/** Basename of a Host path without importing `node:path`. Handles `/` and `\`. */
function pathBasename(path) {
  if (typeof path !== 'string' || path.length === 0) return null
  let end = path.length
  while (end > 0 && (path[end - 1] === '/' || path[end - 1] === '\\')) end -= 1
  // `/`, `\` or an empty-after-separator path: there is no final segment.
  if (end === 0) return path
  // Drive root (`C:`, `C:\`, `C:/`) and bare roots fall back to the path itself.
  if (end === 2 && path[1] === ':' && /^[A-Za-z]$/.test(path[0])) return path
  let start = end
  while (start > 0 && path[start - 1] !== '/' && path[start - 1] !== '\\') start -= 1
  return path.slice(start, end)
}

/**
 * Comparison key for a Host path: unify separators, drop trailing separators and
 * lowercase (Windows paths are case-insensitive). Display values stay untouched.
 */
function pathKey(path) {
  if (typeof path !== 'string' || path.length === 0) return ''
  let text = path.replace(/\\/g, '/')
  while (text.length > 1 && text.endsWith('/')) text = text.slice(0, -1)
  return text.toLowerCase()
}

/**
 * Read the Lead session's immutable creation-header cwd. The header is optional
 * and may legally omit `cwd`, so the absence degrades to null, never throws.
 */
function leadSessionCwd(session) {
  if (!isRecord(session)) return null
  try {
    const header = session.header
    if (!isRecord(header)) return null
    return typeof header.cwd === 'string' && header.cwd.length > 0 ? header.cwd : null
  } catch {
    return null
  }
}

/** Lead session id (the team id), with the team id as a defensive fallback. */
function leadSessionId(session, teamId) {
  if (!isRecord(session)) return teamId
  try {
    const id = toId(session.id)
    return id === '' ? teamId : id
  } catch {
    return teamId
  }
}

/**
 * Display title for a workspace-derived project: the trimmed entity title when
 * it has visible text, else the path basename (same rules as the cwd fallback,
 * including drive roots), else the raw path, else the project id. Always a
 * non-empty string, so the Client's project filter/chip never renders a blank
 * label (defensive only: runtime workspace entities always carry a title).
 * @param rawTitle - `firstText(entity.title)`.
 * @param path - `firstText(entity.path)`.
 * @param id - non-empty project id.
 */
function workspaceProjectTitle(rawTitle, path, id) {
  if (typeof rawTitle === 'string') {
    const trimmed = rawTitle.trim()
    if (trimmed.length > 0) return trimmed
  }
  const basename = pathBasename(path)
  if (basename !== null && basename.trim().length > 0) return basename
  if (typeof path === 'string' && path.trim().length > 0) return path
  return id
}

/** Contract project object from one workspace entity, or null when unusable. */
function workspaceProject(entity) {
  if (!isRecord(entity)) return null
  try {
    const id = toId(entity.id)
    if (id === '') return null
    const path = firstText(entity.path)
    return { id, title: workspaceProjectTitle(firstText(entity.title), path, id), path }
  } catch {
    return null
  }
}

/**
 * Find the workspace that owns one team. A `sessionIds` match wins over a path
 * match regardless of registry order; path matching is case-insensitive across
 * `/` and `\` spellings. `list()` entity getters are guarded one by one so a
 * single malformed entity cannot abandon the rest of the registry.
 */
function findWorkspaceProject(workspaces, sessionId, cwd) {
  const key = cwd === null ? '' : pathKey(cwd)
  let pathMatch = null
  for (const entity of workspaces) {
    const project = workspaceProject(entity)
    if (project === null) continue
    if (sessionId !== '') {
      let sessionIds = []
      try {
        const value = entity.sessionIds
        if (Array.isArray(value)) sessionIds = value
      } catch {
        sessionIds = []
      }
      if (sessionIds.some((id) => toId(id) === sessionId)) return project
    }
    if (pathMatch === null && key !== '' && project.path !== null && pathKey(project.path) === key) pathMatch = project
  }
  return pathMatch
}

/**
 * Resolve one team's `project`, best effort, never throwing. Returns null when
 * neither the workspace registry nor the Lead session cwd is available.
 * @param teamId - Lead session id / team id.
 * @param leadSession - live Lead Session (may be undefined).
 * @param workspaces - workspace registry entities, already listed.
 */
function resolveTeamProject(teamId, leadSession, workspaces) {
  try {
    const cwd = leadSessionCwd(leadSession)
    const sessionId = leadSessionId(leadSession, teamId)
    const workspace = findWorkspaceProject(workspaces, sessionId, cwd)
    if (workspace !== null) return workspace
    if (cwd === null) return null
    return { id: `cwd:${cwd}`, title: pathBasename(cwd), path: cwd }
  } catch {
    return null
  }
}

/**
 * Read the optional workspace registry's synchronous list. Missing services,
 * throwing calls and non-array results all degrade to "no workspaces", which
 * keeps project resolution on the cwd fallback.
 */
function listWorkspaces(workspaceRegistry) {
  if (!workspaceRegistry || typeof workspaceRegistry.list !== 'function') return []
  try {
    const value = workspaceRegistry.list()
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Team aggregation
// ---------------------------------------------------------------------------

function unsupportedReason(agentTeams, agents) {
  if (!agentTeams) return 'Agent Teams service is not mounted'
  if (!agents) return 'Agent service is not mounted'
  if (
    typeof agentTeams.tryMembership !== 'function' ||
    typeof agentTeams.listMembers !== 'function' ||
    typeof agentTeams.listTasks !== 'function'
  ) {
    return 'Agent Teams service does not expose the expected API'
  }
  if (typeof agents.list !== 'function') return 'Agent service does not expose list()'
  return null
}

/**
 * Build one team entry plus its sort keys (active flag and most recent observed
 * activity time). Roster/task read failures become `team.error` and degrade to
 * whatever was readable; a team always lists its Lead row. Listed teams also
 * resolve `project` best effort (v2 contract).
 * @param membership - Agent Team membership row from `agentTeams.tryMembership`.
 * @param agentTeams - Agent Teams service.
 * @param sessions - optional `sessions` service.
 * @param workspaces - workspace registry entities from listWorkspaces().
 * @returns `{ team, activityAt, listable }`.
 */
function buildTeam(membership, agentTeams, sessions, workspaces) {
  const rootAgent = isRecord(membership.root) ? membership.root : undefined
  const rootAgentId = rootAgent !== undefined ? rootAgent.id : undefined
  const teamId = toId(membership.id ?? rootAgentId)
  let teamError = null

  let rawMembers = []
  try {
    const value = agentTeams.listMembers(rootAgent)
    if (Array.isArray(value)) rawMembers = value
  } catch (error) {
    teamError = errorText(error)
  }

  let rawTasks = []
  try {
    const value = agentTeams.listTasks(rootAgent)
    if (Array.isArray(value)) rawTasks = value
  } catch (error) {
    teamError = teamError === null ? errorText(error) : teamError
  }

  let members = []
  for (const row of rawMembers) members.push(normalizeMemberRow(row, teamId))
  if (!members.some((member) => member.role === 'lead')) {
    const leadStatus = rootAgent !== undefined && rootAgent.status === 'running' ? 'running' : 'inactive'
    members.unshift(normalizeMemberRow({ id: teamId, name: 'lead', role: 'lead', status: leadStatus }, teamId))
  }
  members = [...members.filter((member) => member.role === 'lead'), ...members.filter((member) => member.role !== 'lead')]

  const tasks = []
  for (const row of rawTasks) {
    const task = normalizeTaskRow(row)
    if (task !== null) tasks.push(task)
  }

  // An ordinary runtime root is an implicit one-person Lead. Only teams with
  // real Team activity are listed, so skip the expensive session reads for the
  // rest of the live agents.
  const counts = computeTeamCounts(members, tasks)
  const active = isTeamActive(counts)
  const listable = counts.members > 1 || counts.tasks > 0

  let activity = []
  let leadSession
  if (listable) {
    const memberNames = new Map()
    for (const member of members) memberNames.set(member.id, member.name)
    for (const member of members) enrichMemberFromSession(member, sessions)
    if (sessions && typeof sessions.get === 'function') {
      try {
        leadSession = sessions.get(teamId)
      } catch {
        leadSession = undefined
      }
    }
    activity = normalizeActivity(leadSession, { memberNames, teamId })
  }
  // Non-listable teams never reach the snapshot, so project resolution (and its
  // workspace/session reads) is only paid for the teams the Client can see.
  const project = listable ? resolveTeamProject(teamId, leadSession, workspaces) : null

  const team = {
    id: teamId,
    error: teamError,
    project,
    active,
    counts,
    members,
    tasks,
    activity,
  }

  let activityAt = 0
  for (const member of members) {
    if (member.lastActivityAt !== null && member.lastActivityAt > activityAt) activityAt = member.lastActivityAt
  }
  for (const entry of activity) {
    if (entry.time > activityAt) activityAt = entry.time
  }
  return { team, activityAt, listable }
}

/**
 * Collect every live team as contract team objects: active teams first, then by
 * most recent observed activity. A team is listed only when it has more than one
 * member or at least one task (every ordinary runtime root is an implicit
 * one-person Lead, so unfiltered enumeration would surface unrelated sessions).
 * The optional workspace registry is listed once per snapshot for project
 * resolution; it never adds a required service.
 * @param ctx - Cordis plugin context.
 * @returns team objects, active first then most recent activity first.
 */
export function collectTeams(ctx) {
  const agentTeams = getService(ctx, 'agentTeams')
  const agents = getService(ctx, 'agents')
  if (unsupportedReason(agentTeams, agents) !== null) return []
  const sessions = getService(ctx, 'sessions')
  const workspaces = listWorkspaces(getService(ctx, 'workspaceRegistry'))

  const liveAgents = agents.list()
  if (!Array.isArray(liveAgents)) return []

  const seen = new Set()
  const entries = []
  for (const agent of liveAgents) {
    if (!isRecord(agent)) continue
    let membership
    try {
      membership = agentTeams.tryMembership(agent)
    } catch {
      membership = undefined
    }
    if (!isRecord(membership) || membership.role !== 'lead') continue
    const teamId = toId(membership.id ?? (isRecord(membership.root) ? membership.root.id : agent.id))
    if (teamId === '' || seen.has(teamId)) continue
    seen.add(teamId)
    entries.push(buildTeam(membership, agentTeams, sessions, workspaces))
  }

  entries.sort((left, right) => {
    const activeDelta = Number(right.team.active === true) - Number(left.team.active === true)
    return activeDelta !== 0 ? activeDelta : right.activityAt - left.activityAt
  })
  const teams = []
  for (const entry of entries) {
    if (entry.listable) teams.push(entry.team)
  }
  return teams
}

/**
 * Build the complete JSON snapshot returned by GET /api/team-console/snapshot.
 * Throws only on truly unexpected aggregation failures; the route turns those
 * into a valid HTTP 500 JSON body.
 * @param ctx - Cordis plugin context.
 */
export function createSnapshot(ctx) {
  const agentTeams = getService(ctx, 'agentTeams')
  const agents = getService(ctx, 'agents')
  const unsupported = unsupportedReason(agentTeams, agents)
  const teams = unsupported === null ? collectTeams(ctx) : []
  return toJsonSafe({
    version: VERSION,
    ok: true,
    generatedAt: Date.now(),
    unsupported,
    totals: computeTotals(teams),
    projects: computeProjects(teams),
    teams,
  })
}

// ---------------------------------------------------------------------------
// HTTP route
// ---------------------------------------------------------------------------

function writeJson(res, statusCode, body) {
  if (!res || typeof res.writeHead !== 'function' || typeof res.end !== 'function') return false
  let payload
  try {
    payload = JSON.stringify(toJsonSafe(body))
  } catch {
    payload = ENCODING_FALLBACK
  }
  if (typeof payload !== 'string') payload = ENCODING_FALLBACK
  try {
    res.writeHead(statusCode, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    })
    res.end(payload)
    return true
  } catch {
    try {
      res.end()
    } catch {
      /* the response is gone; nothing else to do */
    }
    return false
  }
}

function parsePathname(req) {
  try {
    const rawUrl = isRecord(req) && typeof req.url === 'string' ? req.url : '/'
    const url = new URL(rawUrl, 'http://127.0.0.1')
    return url.pathname
  } catch {
    return ''
  }
}

/**
 * Create the GET /api/team-console/snapshot handler. The returned function is
 * async only for Web-server compatibility; it can never reject.
 * @param ctx - Cordis plugin context (services are resolved per request).
 */
export function createRouteHandler(ctx) {
  return async function teamConsoleRouteHandler(req, res) {
    const rejection = admissionRejection(ctx, req)
    if (rejection !== null) {
      writeJson(res, rejection, {
        version: VERSION,
        ok: false,
        error: rejection === 401 ? 'unauthorized' : 'forbidden',
        teams: [],
      })
      return
    }
    const method = isRecord(req) && typeof req.method === 'string' ? req.method.toUpperCase() : ''
    const pathname = parsePathname(req)
    if (method === 'GET' && pathname === SNAPSHOT_PATH) {
      try {
        writeJson(res, 200, createSnapshot(ctx))
      } catch (error) {
        writeJson(res, 500, { version: VERSION, ok: false, error: errorText(error), teams: [] })
      }
      return
    }
    writeJson(res, 404, { version: VERSION, ok: false, error: `unknown ${method || 'request'} ${pathname || '/'}`, teams: [] })
  }
}

/**
 * Cordis plugin entry point: register the read-only snapshot route.
 * Missing `webServer` only logs and skips registration; missing Agent Team
 * services are handled per request as `unsupported`.
 * @param ctx - Cordis plugin context.
 */
export function apply(ctx) {
  try {
    const webServer = getService(ctx, 'webServer')
    if (!webServer || typeof webServer.register !== 'function') {
      log('webServer service is unavailable; snapshot route was not registered')
      return
    }
    if (!isRecord(ctx) || typeof ctx.effect !== 'function') {
      log('ctx.effect is unavailable; snapshot route was not registered')
      return
    }
    const handler = createRouteHandler(ctx)
    ctx.effect(
      () =>
        webServer.register({
          kind: 'prefix',
          path: ROUTE_PREFIX,
          handler,
        }),
      'agent-team-console: /api/team-console route',
    )
  } catch (error) {
    log(`apply failed: ${errorText(error)}`)
  }
}
