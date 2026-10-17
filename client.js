/**
 * dsh-agent-team-console — Client half (browser bundle), snapshot contract v4.
 * ============================================================================
 * Self-registering classic script loaded through window.__ModuleLoader__:
 *   - id MUST equal the package name.
 *   - only require('react') is allowed here; no @deepseek-ai/* imports.
 *   - Registers a sidebar.panellist entry (id 'team-console') and a keyed
 *     main panel (key 'team-console') that polls the Host half at
 *     GET /api/team-console/snapshot (same origin, read-only, 2s cadence).
 *   - Read-only, graph-first design (1.4.0 / contract v4):
 *       header (project filter, live dot, refresh)
 *       -> compact status chip strip (in-progress / running / tokens / blocked / pending)
 *       -> a responsive grid of workspace/team block cards: exactly one team is
 *          expanded into a full-row card at a time (single accordion; default:
 *          first active team). The expanded card keeps the workspace-first header
 *          with the working-vs-idle donut and stats, and its body is a top-down
 *          layered SVG data-flow graph: the Lead at the top (root), teammates in
 *          balanced rows below, downward cubic hand-off edges with a slow dash
 *          flow, curved message chords, and one deterministic pixel-art character
 *          per member with status motion; below it a collapsed task summary line
 *          with in-progress rows on demand. The pure layout/edge geometry lives
 *          in a marked self-contained block below (unit-tested standalone by the
 *          repo check script).
 *     The activity timeline is intentionally not rendered (contract keeps it for
 *     API consumers); stats come from contract v3 `team.stats` / `member.stats`,
 *     edges from contract v4 `team.edges` (with a structural star fallback).
 *   - All copy is bilingual through the Client locale service under the
 *     namespace 'agent-team-console' (zh + en kept key-for-key in sync); the
 *     Chinese dictionary is primary and the English one mirrors it.
 *   - Colors/borders/backgrounds come exclusively from --dsw-* theme tokens;
 *     the single <style> element lives in the Panel render so it is disposed
 *     together with the panel.
 * ============================================================================
 */
window.__ModuleLoader__.load({
  id: 'dsh-agent-team-console',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    const NS = 'agent-team-console'
    const API = '/api/team-console/snapshot'
    const POLL_MS = 2000
    const MEMBER_LIMIT = 8
    const EDGE_RECENT_MS = 30000
    const PIXEL_SIZE = 2
    const PIXEL_GRID_WIDTH = 10
    const PIXEL_GRID_HEIGHT = 12
    const RADIUS_MIN = 16
    const RADIUS_MAX = 26
    const LEAD_RADIUS_BONUS = 2

    /* ------------------------------------------------------------------ */
    /* Locale dictionaries (zh + en, identical key sets)                   */
    /* ------------------------------------------------------------------ */

    const zh = {
      'panel.label': '团队看板',
      title: 'Agent Team 看板',
      subtitle: '实时舞台：每个 Agent 的状态、轮次与 Token 用量',
      live: '实时 · {interval}',
      refresh: '刷新',
      refreshing: '正在刷新',
      lastUpdated: '更新于 {time}',
      neverUpdated: '尚未更新',
      loading: '正在读取团队快照…',
      retry: '重试',
      'error.title': '读取团队快照失败',
      stale: '连接中断 —— 显示的是上一次成功获取的数据',
      'unsupported.title': 'Agent Teams 服务未挂载',
      'unsupported.body': '当前运行环境没有提供 Agent Teams 服务：{message}',
      'empty.title': '还没有正在运行的 Agent Team',
      'empty.body': '在会话中创建队友或共享任务后，它们会自动出现在这里；空闲的团队也会保留在列表中（默认折叠）。本页是只读视图，不会修改任何团队状态。',
      'empty.unsupported': '当前 profile 未提供 Agent Teams 服务，因此这里不会列出任何团队。',
      'filter.label': '按项目筛选',
      'filter.all': '全部项目',
      'project.none': '未分组',
      'stat.inProgress': '进行中任务',
      'stat.runningMembers': '运行成员',
      'stat.tokens': 'Token 用量',
      'stat.blocked': '阻塞任务',
      'stat.pending': '待处理任务',
      'team.turns': '{n} 轮',
      'team.tokens': '{n} tok',
      'team.work': '工作',
      'team.idle': '闲置',
      'team.workIdle': '{work} · {idle}',
      'team.inProgress': '进行中 {n}',
      'team.expand': '展开',
      'team.collapse': '收起',
      'team.unnamed': '未命名团队',
      'team.error': '团队数据读取失败：{message}',
      'team.graphLabel': '{n} 位成员的协作关系图',
      'team.edgeLead': 'Lead 分发',
      'team.edgeMessage': '消息连线',
      'team.edgeSummary': '消息 {in} 收 / {out} 发',
      'team.overflow': '另有 {n} 位成员',
      'team.nodeAria': '{name}，{status}，{turns}，{tokens}；{edges}',
      'team.statLine': '{turns} · {tokens}',
      'member.role.lead': 'Lead',
      'member.role.teammate': 'Teammate',
      'member.status.running': '运行中',
      'member.status.inactive': '未运行',
      'member.status.provisioning': '准备中',
      'member.status.failed': '失败',
      'tooltip.model': '模型',
      'tooltip.turns': '轮次',
      'tooltip.steps': '步骤',
      'tooltip.tokens': '合计',
      'tooltip.input': '未缓存输入',
      'tooltip.cacheRead': '缓存读取',
      'tooltip.cacheWrite': '缓存写入',
      'tooltip.output': '输出',
      'tooltip.working': '工作时间',
      'tooltip.idle': '闲置时间',
      'roster.empty': '暂无成员',
      'tasks.summary': '{inProgress} · {pending} · {blocked}',
      'tasks.inProgress': '进行中 {n}',
      'tasks.pending': '待办 {n}',
      'tasks.blocked': '阻塞 {n}',
      'tasks.toggle': '展开或收起进行中任务',
      'tasks.noInProgress': '暂无进行中的任务',
      'section.inProgress': '进行中',
      'task.owner': '负责人：{name}',
      'task.unowned': '未分配',
      'status.in_progress': '进行中',
      'duration.seconds': '{n} 秒',
      'duration.minutes': '{n} 分',
      'duration.hours': '{n} 小时',
      'duration.hoursMinutes': '{h} 小时 {m} 分',
      'duration.days': '{n} 天',
    }

    const en = {
      'panel.label': 'Team console',
      title: 'Agent Team Console',
      subtitle: 'A live stage of each agent‘s state, rounds, and token usage',
      live: 'Live · {interval}',
      refresh: 'Refresh',
      refreshing: 'Refreshing',
      lastUpdated: 'Updated {time}',
      neverUpdated: 'Not updated yet',
      loading: 'Loading team snapshot…',
      retry: 'Retry',
      'error.title': 'Could not load the team snapshot',
      stale: 'Connection lost — showing the last successful snapshot',
      'unsupported.title': 'Agent Teams service is not mounted',
      'unsupported.body': 'The current runtime does not provide the Agent Teams service: {message}',
      'empty.title': 'No running Agent Team yet',
      'empty.body': 'Teammates and shared tasks appear here automatically once you spawn them in a conversation; idle teams stay listed too (collapsed by default). This page is read-only and never changes team state.',
      'empty.unsupported': 'The current profile does not provide the Agent Teams service, so no teams can be listed.',
      'filter.label': 'Filter by project',
      'filter.all': 'All projects',
      'project.none': 'Ungrouped',
      'stat.inProgress': 'In-progress tasks',
      'stat.runningMembers': 'Running members',
      'stat.tokens': 'Token usage',
      'stat.blocked': 'Blocked tasks',
      'stat.pending': 'Pending tasks',
      'team.turns': '{n} turns',
      'team.tokens': '{n} tok',
      'team.work': 'Work',
      'team.idle': 'Idle',
      'team.workIdle': '{work} · {idle}',
      'team.inProgress': '{n} in progress',
      'team.expand': 'Expand',
      'team.collapse': 'Collapse',
      'team.unnamed': 'Unnamed team',
      'team.error': 'Team data could not be read: {message}',
      'team.graphLabel': 'Interaction graph of {n} members',
      'team.edgeLead': 'Lead hand-off',
      'team.edgeMessage': 'Message link',
      'team.edgeSummary': 'Messages {in} in / {out} out',
      'team.overflow': '{n} more members',
      'team.nodeAria': '{name}, {status}, {turns}, {tokens}; {edges}',
      'team.statLine': '{turns} · {tokens}',
      'member.role.lead': 'Lead',
      'member.role.teammate': 'Teammate',
      'member.status.running': 'Running',
      'member.status.inactive': 'Idle',
      'member.status.provisioning': 'Provisioning',
      'member.status.failed': 'Failed',
      'tooltip.model': 'Model',
      'tooltip.turns': 'Rounds',
      'tooltip.steps': 'Steps',
      'tooltip.tokens': 'Total',
      'tooltip.input': 'Uncached input',
      'tooltip.cacheRead': 'Cache read',
      'tooltip.cacheWrite': 'Cache write',
      'tooltip.output': 'Output',
      'tooltip.working': 'Working time',
      'tooltip.idle': 'Idle time',
      'roster.empty': 'No members',
      'tasks.summary': '{inProgress} · {pending} · {blocked}',
      'tasks.inProgress': '{n} in progress',
      'tasks.pending': '{n} pending',
      'tasks.blocked': '{n} blocked',
      'tasks.toggle': 'Expand or collapse in-progress tasks',
      'tasks.noInProgress': 'No task in progress',
      'section.inProgress': 'In progress',
      'task.owner': 'Owner: {name}',
      'task.unowned': 'Unassigned',
      'status.in_progress': 'In progress',
      'duration.seconds': '{n}s',
      'duration.minutes': '{n}m',
      'duration.hours': '{n}h',
      'duration.hoursMinutes': '{h}h {m}m',
      'duration.days': '{n}d',
    }

    /* ------------------------------------------------------------------ */
    /* Runtime binding (locale + navigation handle live in apply)          */
    /* ------------------------------------------------------------------ */

    function createFallbackT(dict) {
      return (key, params) => {
        const template = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key
        if (!params) return template
        return String(template).replace(/\{(\w+)\}/g, (match, name) => (
          Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
        ))
      }
    }

    const runtime = {
      ctx: null,
      locale: null,
      t: createFallbackT(zh),
    }

    const hasKey = (key) => Object.prototype.hasOwnProperty.call(zh, key)
    const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key)

    /* ------------------------------------------------------------------ */
    /* Small pure helpers                                                  */
    /* ------------------------------------------------------------------ */

    const asArray = (value) => (Array.isArray(value) ? value : [])
    const asString = (value) => {
      if (typeof value === 'string') return value
      if (value === null || value === undefined) return ''
      return String(value)
    }
    const asNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null)
    const numberOr = (value, fallback) => {
      const parsed = asNumber(value)
      return parsed === null ? fallback : parsed
    }

    function activeLocale() {
      const locale = runtime.locale
      try {
        if (locale && typeof locale.getSnapshot === 'function') {
          const snapshot = locale.getSnapshot()
          if (snapshot && typeof snapshot.active === 'string' && snapshot.active) return snapshot.active
        }
      } catch (error) {
        /* fall back to the zh document language */
      }
      return 'zh'
    }

    function languageTag() {
      return activeLocale() === 'en' ? 'en-US' : 'zh-CN'
    }

    function formatClock(ts) {
      const value = asNumber(ts)
      if (value === null) return '—'
      try {
        return new Date(value).toLocaleTimeString(languageTag(), {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      } catch (error) {
        return new Date(value).toISOString().slice(11, 19)
      }
    }

    function truncateText(value, max) {
      const characters = Array.from(asString(value))
      if (characters.length <= max) return characters.join('')
      return characters.slice(0, Math.max(1, max - 1)).join('') + '…'
    }

    /** Compact token count: 950 -> 950, 12.3k, 1.2M, 3.4B. */
    function formatTokens(value) {
      const number = asNumber(value)
      if (number === null) return '—'
      const trim = (text) => (text.endsWith('.0') ? text.slice(0, -2) : text)
      const absolute = Math.abs(number)
      if (absolute < 10000) return String(Math.round(number))
      const units = [
        { scale: 1e9, suffix: 'B' },
        { scale: 1e6, suffix: 'M' },
        { scale: 1e3, suffix: 'k' },
      ]
      const index = units.findIndex((unit) => absolute >= unit.scale)
      if (index < 0) return String(Math.round(number))
      const rounded = Math.round((number / units[index].scale) * 10) / 10
      // Promote on rounding so 999,950 renders as 1M rather than 1000k.
      if (Math.abs(rounded) >= 1000 && index > 0) {
        const promoted = units[index - 1]
        return trim((number / promoted.scale).toFixed(1)) + promoted.suffix
      }
      return trim(rounded.toFixed(1)) + units[index].suffix
    }

    /** Compact duration from milliseconds: 45s, 12m, 2h 5m, 3d. */
    function formatDuration(value, t) {
      const milliseconds = asNumber(value)
      if (milliseconds === null || milliseconds < 0) return '—'
      const seconds = Math.floor(milliseconds / 1000)
      if (seconds < 60) return t('duration.seconds', { n: seconds })
      const minutes = Math.floor(seconds / 60)
      if (minutes < 60) return t('duration.minutes', { n: minutes })
      const hours = Math.floor(minutes / 60)
      const restMinutes = minutes % 60
      if (hours < 24) {
        return restMinutes > 0
          ? t('duration.hoursMinutes', { h: hours, m: restMinutes })
          : t('duration.hours', { n: hours })
      }
      return t('duration.days', { n: Math.floor(hours / 24) })
    }

    function addNullable(total, value) {
      if (value === null || value === undefined) return total
      return total === null ? value : total + value
    }

    function ratioFrom(workingMs, idleMs) {
      if (workingMs === null || idleMs === null) return null
      const denominator = workingMs + idleMs
      if (!(denominator > 0)) return null
      const ratio = workingMs / denominator
      return Math.min(1, Math.max(0, Math.round(ratio * 10000) / 10000))
    }

    function pathBasename(path) {
      const raw = asString(path).replace(/[\\/]+$/, '')
      if (!raw) return ''
      const parts = raw.split(/[\\/]+/)
      return parts[parts.length - 1] || raw
    }

    /* ------------------------------------------------------------------ */
    /* Contract v3 stats (best effort; every field may be null)            */
    /* ------------------------------------------------------------------ */

    function readTokenStats(raw) {
      if (!raw || typeof raw !== 'object') return null
      const uncachedInput = asNumber(raw.uncachedInput)
      const cacheRead = asNumber(raw.cacheRead)
      const cacheWrite = asNumber(raw.cacheWrite)
      const output = asNumber(raw.output)
      const explicitTotal = asNumber(raw.total)
      const known = [uncachedInput, cacheRead, cacheWrite, output].filter((value) => value !== null)
      let total = explicitTotal
      if (total === null) {
        if (known.length === 0) return null
        total = known.reduce((sum, value) => sum + value, 0)
      }
      return {
        total,
        uncachedInput: uncachedInput === null ? 0 : uncachedInput,
        cacheRead: cacheRead === null ? 0 : cacheRead,
        cacheWrite: cacheWrite === null ? 0 : cacheWrite,
        output: output === null ? 0 : output,
      }
    }

    function readStats(raw) {
      const value = raw && typeof raw === 'object' ? raw : {}
      const ratioValue = asNumber(value.workingRatio)
      return {
        turns: asNumber(value.turns),
        steps: asNumber(value.steps),
        tokens: readTokenStats(value.tokens),
        llmMs: asNumber(value.llmMs),
        toolMs: asNumber(value.toolMs),
        workingMs: asNumber(value.workingMs),
        idleMs: asNumber(value.idleMs),
        wallMs: asNumber(value.wallMs),
        workingRatio: ratioValue === null ? null : Math.min(1, Math.max(0, ratioValue)),
        live: value.live === true,
      }
    }

    const STAT_NUMBER_KEYS = ['turns', 'steps', 'llmMs', 'toolMs', 'workingMs', 'idleMs', 'wallMs']

    /** Sum the available numeric fields of several member stats rows. */
    function combineStats(statsList) {
      const totals = { tokens: null, workingRatio: null }
      for (const key of STAT_NUMBER_KEYS) totals[key] = null
      for (const stats of statsList) {
        for (const key of STAT_NUMBER_KEYS) totals[key] = addNullable(totals[key], stats[key])
        if (stats.tokens) {
          if (totals.tokens === null) {
            totals.tokens = { total: 0, uncachedInput: 0, cacheRead: 0, cacheWrite: 0, output: 0 }
          }
          totals.tokens.total += stats.tokens.total
          totals.tokens.uncachedInput += stats.tokens.uncachedInput
          totals.tokens.cacheRead += stats.tokens.cacheRead
          totals.tokens.cacheWrite += stats.tokens.cacheWrite
          totals.tokens.output += stats.tokens.output
        }
      }
      totals.workingRatio = ratioFrom(totals.workingMs, totals.idleMs)
      return totals
    }

    function teamStatsFor(team) {
      const raw = team && typeof team.stats === 'object' && team.stats ? team.stats : null
      if (raw) {
        const stats = readStats(raw)
        const hasAny = stats.turns !== null || stats.steps !== null || stats.tokens !== null
          || stats.workingMs !== null || stats.idleMs !== null || stats.wallMs !== null
        if (hasAny) return stats
      }
      // Defensive fallback for a v2 payload: aggregate the member stats we have.
      return combineStats(asArray(team && team.members).map((member) => readStats(member && member.stats)))
    }

    function memberStatsFor(member) {
      return readStats(member && member.stats)
    }

    function memberStatLine(stats, t) {
      const turns = stats && stats.turns !== null ? t('team.turns', { n: stats.turns }) : '—'
      const tokens = stats && stats.tokens ? t('team.tokens', { n: formatTokens(stats.tokens.total) }) : '—'
      return t('team.statLine', { turns, tokens })
    }

    /* ------------------------------------------------------------------ */
    /* Snapshot aggregation helpers (defensive about every field)          */
    /*                                                                     */
    /* Contract v3 semantics: `team.stats` / `member.stats` are best-effort */
    /* and may be null. Readiness: only a pending task with ready === false */
    /* is blocked; in-progress tasks always carry ready === false and are   */
    /* claimed work, never blocked.                                        */
    /* ------------------------------------------------------------------ */

    function teamCounts(team) {
      const counts = team && typeof team.counts === 'object' && team.counts ? team.counts : {}
      const members = asArray(team && team.members)
      const tasks = asArray(team && team.tasks)
      const membersBy = (status) => members.filter((member) => asString(member && member.status) === status).length
      const tasksBy = (status) => tasks.filter((task) => asString(task && task.status) === status).length
      const blockedTasks = tasks.filter((task) => (
        asString(task && task.status) === 'pending' && task && task.ready === false
      )).length
      const readyTasks = tasks.filter((task) => (
        asString(task && task.status) === 'pending' && task && task.ready === true
      )).length
      return {
        members: numberOr(counts.members, members.length),
        running: numberOr(counts.running, membersBy('running')),
        provisioning: numberOr(counts.provisioning, membersBy('provisioning')),
        failed: numberOr(counts.failed, membersBy('failed')),
        idle: numberOr(counts.idle, membersBy('inactive')),
        tasks: numberOr(counts.tasks, tasks.length),
        pending: numberOr(counts.pending, tasksBy('pending')),
        inProgress: numberOr(counts.inProgress, tasksBy('in_progress')),
        completed: numberOr(counts.completed, tasksBy('completed')),
        blocked: numberOr(counts.blocked, blockedTasks),
        ready: numberOr(counts.ready, readyTasks),
      }
    }

    const TOTALS_KEYS = [
      'members', 'running', 'provisioning', 'failed', 'idle',
      'tasks', 'pending', 'inProgress', 'completed', 'blocked', 'ready',
    ]

    function teamActiveFromCounts(team, counts) {
      if (team && typeof team.active === 'boolean') return team.active
      return counts.provisioning > 0 || counts.running > 0 || counts.inProgress > 0
    }

    function teamActive(team) {
      return teamActiveFromCounts(team, teamCounts(team))
    }

    function aggregateTeams(teams) {
      const totals = { teams: 0, activeTeams: 0, tokens: null }
      for (const key of TOTALS_KEYS) totals[key] = 0
      for (const team of asArray(teams)) {
        const counts = teamCounts(team)
        const stats = teamStatsFor(team)
        totals.teams += 1
        if (teamActiveFromCounts(team, counts)) totals.activeTeams += 1
        for (const key of TOTALS_KEYS) totals[key] += counts[key]
        if (stats.tokens) totals.tokens = (totals.tokens === null ? 0 : totals.tokens) + stats.tokens.total
      }
      return totals
    }

    function teamProject(team) {
      const project = team && typeof team.project === 'object' && team.project ? team.project : null
      if (!project) return null
      const id = asString(project.id)
      const title = asString(project.title)
      const path = asString(project.path)
      if (!id && !title && !path) return null
      return { id, title, path: path || null }
    }

    function projectLabel(project, t) {
      const title = asString(project && project.title)
      if (title) return title
      const base = pathBasename(project && project.path)
      if (base) return base
      return t('project.none')
    }

    /**
     * Build the <option> model for the project filter. Duplicate project titles
     * (same workspace basename in different folders) get the shortest unique
     * path tail appended; ids are the last-resort discriminator.
     */
    function uniqueProjectOptions(projects, t) {
      const entries = []
      for (const project of asArray(projects)) {
        const id = asString(project && project.id)
        if (!id) continue
        const path = asString(project && project.path)
        const parts = path ? path.split(/[\\/]+/).filter(Boolean) : []
        entries.push({ id, title: projectLabel(project, t), parts })
      }
      const byTitle = new Map()
      for (const entry of entries) {
        const bucket = byTitle.get(entry.title)
        if (bucket) bucket.push(entry)
        else byTitle.set(entry.title, [entry])
      }
      const labels = new Map()
      for (const [title, bucket] of byTitle) {
        if (bucket.length === 1) {
          labels.set(bucket[0], title)
          continue
        }
        const maxParts = bucket.reduce((max, entry) => Math.max(max, entry.parts.length), 0)
        let tails = null
        for (let length = 1; length <= maxParts && tails === null; length += 1) {
          const candidates = bucket.map((entry) => entry.parts.slice(-length).join('/'))
          const unique = candidates.every(Boolean) && new Set(candidates).size === bucket.length
          if (unique) tails = candidates
        }
        bucket.forEach((entry, index) => {
          const tail = tails ? tails[index] : (entry.id.length > 8 ? entry.id.slice(-8) : entry.id)
          labels.set(entry, title + ' · ' + tail)
        })
      }
      return entries.map((entry) => ({ id: entry.id, label: labels.get(entry) || entry.title }))
    }

    function effectiveProjectId(projectId, projects) {
      const wanted = asString(projectId)
      if (!wanted || wanted === 'all') return 'all'
      const exists = asArray(projects).some((project) => asString(project && project.id) === wanted)
      return exists ? wanted : 'all'
    }

    function filterTeams(teams, projectId) {
      const list = asArray(teams)
      if (!projectId || projectId === 'all') return list
      return list.filter((team) => {
        const project = teamProject(team)
        return project !== null && project.id === projectId
      })
    }

    /** The Lead member comes first; the remaining teammates keep served order. */
    function stageMembers(members) {
      const list = asArray(members)
      const lead = list.find((member) => asString(member && member.role) === 'lead') || null
      const ordered = []
      if (lead) ordered.push(lead)
      for (const member of list) {
        if (member !== lead) ordered.push(member)
      }
      return ordered
    }

    /**
     * Resolve the interaction graph for one rendered team. Endpoints must be
     * rendered member ids; duplicate (from,to,kind) pairs are dropped. When the
     * payload has no usable lead edge (v3 or older payloads), a structural star
     * from the center member is derived so the graph still renders as a star.
     */
    function teamGraphEdges(team, renderedMembers) {
      const ids = new Set()
      for (const member of renderedMembers) {
        const id = asString(member && member.id)
        if (id) ids.add(id)
      }
      const centerId = asString(renderedMembers[0] && renderedMembers[0].id)
      const edges = []
      const seen = new Set()
      const addEdge = (from, to, kind, weight, lastAt) => {
        if (!from || !to || from === to) return
        if (!ids.has(from) || !ids.has(to)) return
        const key = kind + '\u0000' + from + '\u0000' + to
        if (seen.has(key)) return
        seen.add(key)
        const parsedWeight = asNumber(weight)
        edges.push({
          from,
          to,
          kind,
          weight: parsedWeight === null ? 1 : Math.max(1, Math.round(parsedWeight)),
          lastAt: asNumber(lastAt),
        })
      }
      for (const edge of asArray(team && team.edges)) {
        if (!edge || typeof edge !== 'object') continue
        const kind = asString(edge.kind)
        if (kind !== 'lead' && kind !== 'message') continue
        addEdge(asString(edge.from), asString(edge.to), kind, edge.weight, edge.lastAt)
      }
      const hasLead = edges.some((edge) => edge.kind === 'lead')
      if (!hasLead && centerId) {
        for (const member of renderedMembers) {
          const id = asString(member && member.id)
          if (id && id !== centerId) addEdge(centerId, id, 'lead', 1, null)
        }
      }
      const messageIn = new Map()
      const messageOut = new Map()
      for (const edge of edges) {
        if (edge.kind !== 'message') continue
        messageIn.set(edge.to, (messageIn.get(edge.to) || 0) + edge.weight)
        messageOut.set(edge.from, (messageOut.get(edge.from) || 0) + edge.weight)
      }
      return {
        edges,
        messageIn: (id) => messageIn.get(id) || 0,
        messageOut: (id) => messageOut.get(id) || 0,
      }
    }

    function isRecentEdge(edge, now) {
      const lastAt = asNumber(edge && edge.lastAt)
      return lastAt !== null && now - lastAt <= EDGE_RECENT_MS
    }

    function edgeStrokeWidth(edge) {
      if (!edge || edge.kind !== 'message') return 1
      return Math.round((1 + Math.min(3, Math.sqrt(edge.weight))) * 100) / 100
    }

    /** Log scale against the team max: members without tokens keep RADIUS_MIN. */
    function nodeRadius(tokensTotal, maxTokens, isLead) {
      let ratio = 0
      if (tokensTotal !== null && tokensTotal > 0 && maxTokens > 0) {
        ratio = Math.log1p(tokensTotal) / Math.log1p(maxTokens)
        if (!Number.isFinite(ratio)) ratio = 0
        ratio = Math.min(1, Math.max(0, ratio))
      }
      const radius = RADIUS_MIN + (RADIUS_MAX - RADIUS_MIN) * ratio + (isLead ? LEAD_RADIUS_BONUS : 0)
      return Math.round(radius * 10) / 10
    }

    /** Stable key for one team row (member/session ids are strings). */
    function teamKeyOf(team, index) {
      const id = asString(team && team.id)
      return id || 'team-' + index
    }

    function memberStatusLabel(status, t) {
      const raw = asString(status)
      const key = 'member.status.' + raw
      return raw && hasKey(key) ? t(key) : raw || '—'
    }

    function memberStatusTone(status) {
      const raw = asString(status)
      if (raw === 'running') return 'running'
      if (raw === 'provisioning') return 'provisioning'
      if (raw === 'failed') return 'failed'
      return 'inactive'
    }

    function memberRoleLabel(role, t) {
      return asString(role) === 'lead' ? t('member.role.lead') : t('member.role.teammate')
    }

    /* ------------------------------------------------------------------ */
    /* Deterministic pixel-art characters (theme-token palette)            */
    /* ------------------------------------------------------------------ */

    const PIXEL_BASE_ROWS = [
      '..........',
      '..HHHHHH..',
      '.HHHHHHHH.',
      '.HSSSSSSH.',
      '.HSESSESH.',
      '.HSSSSSSH.',
      '..SSSSSS..',
      '.TTTTTTTT.',
      'STTTTTTTTS',
      '.TTTTTTTT.',
      '.PPPPPPPP.',
      '.PP....PP.',
    ]

    const PIXEL_CLASSES = {
      H: 'hair',
      S: 'skin',
      E: 'eye',
      P: 'pants',
    }

    /** FNV-1a-ish 32-bit string hash; deterministic per member. */
    function hashString(value) {
      const text = asString(value)
      let hash = 2166136261
      for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
      }
      return hash >>> 0
    }

    /**
     * One deterministic 10x12 pixel character. H hair, S skin, E eye, T shirt,
     * A accent, P pants; every row is fixed-width. The Lead always wears the
     * brand-token shirt and a brand accent marker (crown).
     */
    function pixelCharacter(member) {
      const isLead = asString(member && member.role) === 'lead'
      const hash = hashString(asString(member && member.id) + '|' + asString(member && member.name))
      const rows = PIXEL_BASE_ROWS.slice()
      const hairStyle = hash % 3
      if (hairStyle === 1) {
        rows[1] = '.HHHHHHHH.'
        rows[2] = 'HHHHHHHHHH'
      } else if (hairStyle === 2) {
        rows[1] = '..HHHHHH..'
        rows[2] = '..HHHHHH..'
        rows[3] = '.HHSSSSHH.'
      }
      const accessory = isLead ? 0 : (hash >>> 3) % 3
      if (accessory === 0) {
        rows[0] = '..AAAAAA..'
      } else if (accessory === 1) {
        rows[7] = '.TTAAATTT.'
      } else {
        rows[8] = 'STTTATTTTS'
      }
      const shirtClass = isLead ? 'shirt-lead' : 'shirt-' + (hash % 4)
      const accentClass = isLead ? 'accent-lead' : 'accent'
      const pixels = []
      for (let y = 0; y < rows.length; y += 1) {
        const row = rows[y]
        for (let x = 0; x < row.length; x += 1) {
          const token = row[x]
          if (token === '.') continue
          let pixelClass
          if (token === 'T') pixelClass = shirtClass
          else if (token === 'A') pixelClass = accentClass
          else pixelClass = PIXEL_CLASSES[token] || 'hair'
          pixels.push({ x, y, c: pixelClass })
        }
      }
      return pixels
    }

    /* ------------------------------------------------------------------ */
    /* Pure top-down layout + edge geometry (standalone, unit-tested by    */
    /* scripts/client-check.mjs through the markers below)                 */
    /* ------------------------------------------------------------------ */

    /* @atc-layout-begin */
    const LAYOUT = {
      padX: 108,
      padTop: 56,
      padBottom: 92,
      minWidth: 380,
      slotX: 108,
      rowGap: 132,
      singleRowMax: 5,
      leadY: 96,
      overflowRadius: 21,
    }

    function layoutTopDown(nodes, hasOverflow) {
      const list = nodes && typeof nodes.length === 'number' ? nodes : []
      const rest = []
      for (let index = 1; index < list.length; index += 1) rest.push(list[index])
      const restCount = rest.length + (hasOverflow ? 1 : 0)
      const rowSizes = []
      if (restCount > 0) {
        if (restCount <= LAYOUT.singleRowMax) {
          rowSizes.push(restCount)
        } else {
          const firstRow = Math.ceil(restCount / 2)
          rowSizes.push(firstRow)
          rowSizes.push(restCount - firstRow)
        }
      }
      const maxCols = rowSizes.length > 0 ? rowSizes[0] : 0
      const width = Math.max(LAYOUT.minWidth, (maxCols - 1) * LAYOUT.slotX + 2 * LAYOUT.padX)
      const leadNode = list.length > 0 ? list[0] : null
      const leadKey = leadNode && leadNode.key !== undefined && leadNode.key !== null ? '' + leadNode.key : ''
      const lead = { key: leadKey, x: width / 2, y: LAYOUT.leadY }
      const positions = {}
      if (leadNode) positions[leadKey] = { x: lead.x, y: lead.y }
      let overflow = null
      let cursor = 0
      for (let row = 0; row < rowSizes.length; row += 1) {
        const count = rowSizes[row]
        const equalRows = rowSizes.length === 2 && rowSizes[0] === rowSizes[1]
        // Amendment (row-2 alignment): for equal-length rows (4+4 / 3+3) the
        // second row shifts right by half a slot so lower nodes sit in the gaps
        // between upper characters and a lead edge passes between them.
        const rowShift = row === 1 && equalRows ? LAYOUT.slotX / 2 : 0
        const start = (width - (count - 1) * LAYOUT.slotX) / 2 + rowShift
        const y = LAYOUT.leadY + (row + 1) * LAYOUT.rowGap
        for (let column = 0; column < count; column += 1) {
          const x = start + column * LAYOUT.slotX
          const lastSlot = row === rowSizes.length - 1 && column === count - 1
          if (hasOverflow && lastSlot) {
            overflow = { x, y }
            continue
          }
          const node = rest[cursor]
          cursor += 1
          if (!node) continue
          const key = node.key !== undefined && node.key !== null ? '' + node.key : 'node-' + cursor
          positions[key] = { x, y }
        }
      }
      const height = LAYOUT.leadY + rowSizes.length * LAYOUT.rowGap + LAYOUT.padBottom
      return { width, height, positions, lead, overflow, rows: rowSizes.length }
    }

    function edgePath(from, to, kind) {
      const x1 = from && Number.isFinite(from.x) ? from.x : 0
      const y1 = from && Number.isFinite(from.y) ? from.y : 0
      const x2 = to && Number.isFinite(to.x) ? to.x : 0
      const y2 = to && Number.isFinite(to.y) ? to.y : 0
      const dx = x2 - x1
      const dy = y2 - y1
      if (kind === 'lead') {
        if (!(dy > 0)) return 'M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2
        const handle = Math.max(28, dy / 2)
        return 'M ' + x1 + ' ' + y1
          + ' C ' + x1 + ' ' + (y1 + handle)
          + ' ' + x2 + ' ' + (y2 - handle)
          + ' ' + x2 + ' ' + y2
      }
      const distance = Math.sqrt(dx * dx + dy * dy)
      if (!(distance > 0)) return 'M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2
      const bend = Math.min(56, distance * 0.18)
      let direction = 1
      if (Math.abs(dy) < Math.abs(dx) * 0.7) direction = dx >= 0 ? -1 : 1
      const normalX = (-dy / distance) * direction
      const normalY = (dx / distance) * direction
      const midX = (x1 + x2) / 2
      const midY = (y1 + y2) / 2
      return 'M ' + x1 + ' ' + y1
        + ' Q ' + (midX + normalX * bend) + ' ' + (midY + normalY * bend)
        + ' ' + x2 + ' ' + y2
    }
    /* @atc-layout-end */

    /* ------------------------------------------------------------------ */
    /* Optional navigation through uiWorkspace (never required)            */
    /* ------------------------------------------------------------------ */

    function workspaceService() {
      const ctx = runtime.ctx
      if (!ctx) return null
      try {
        const service = typeof ctx.get === 'function' ? ctx.get('uiWorkspace') : ctx.uiWorkspace
        return service && typeof service.openSession === 'function' ? service : null
      } catch (error) {
        return null
      }
    }

    function openMemberSession(id) {
      const memberId = asString(id)
      if (!memberId) return
      try {
        const workspace = workspaceService()
        if (workspace) workspace.openSession(memberId)
      } catch (error) {
        /* navigation is best-effort: never break the read-only panel */
      }
    }

    /* ------------------------------------------------------------------ */
    /* Styles — one <style> element rendered by the Panel                  */
    /* ------------------------------------------------------------------ */

    const CSS = `
.atc-root{box-sizing:border-box;height:100%;min-height:0;overflow-y:auto;overflow-x:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5;}
.atc-root,.atc-root *,.atc-root *::before,.atc-root *::after{box-sizing:border-box;}
.atc-root button,.atc-root select{font:inherit;color:inherit;}
.atc-page{max-width:1120px;margin:0 auto;padding:20px 24px 40px;display:flex;flex-direction:column;gap:14px;}
.atc-header{display:flex;align-items:center;justify-content:space-between;gap:10px 20px;flex-wrap:wrap;}
.atc-header-main{display:flex;flex-direction:column;gap:1px;min-width:0;}
.atc-title{margin:0;font-size:18px;line-height:24px;font-weight:600;letter-spacing:-0.01em;}
.atc-subtitle{margin:0;font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary);}
.atc-header-side{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.atc-filter{position:relative;display:inline-flex;align-items:center;}
.atc-select{height:28px;max-width:230px;padding:0 26px 0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12px;line-height:16px;cursor:pointer;appearance:none;-webkit-appearance:none;}
.atc-select:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2);}
.atc-select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;}
.atc-filter::after{content:"";position:absolute;right:10px;width:6px;height:6px;border-right:1.5px solid var(--dsw-alias-label-secondary);border-bottom:1.5px solid var(--dsw-alias-label-secondary);transform:rotate(45deg);pointer-events:none;}
.atc-live{display:inline-flex;align-items:center;gap:6px;font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}
.atc-live-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-idle-primary);flex:none;}
.atc-live-on{background:var(--dsw-alias-state-success-primary);}
.atc-pulse{animation:atc-pulse 1.8s ease-in-out infinite;}
.atc-updated{font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap;}
.atc-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:none;color:var(--dsw-alias-label-secondary);cursor:pointer;flex:none;}
.atc-icon-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2);}
.atc-icon-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;}
.atc-refresh-icon{display:inline-flex;align-items:center;justify-content:center;}
.atc-spin{animation:atc-rotate 1s linear infinite;}
.atc-stats{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:7px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);}
.atc-stat{display:inline-flex;align-items:baseline;gap:6px;padding:2px 10px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);font-size:12px;line-height:18px;white-space:nowrap;}
.atc-stat-value{font-weight:600;font-size:13px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);}
.atc-stat-label{color:var(--dsw-alias-label-secondary);}
.atc-stat-inprogress .atc-stat-value{color:var(--dsw-alias-brand-primary);}
.atc-stat-running .atc-stat-value{color:var(--dsw-alias-state-success-primary);}
.atc-stat-tokens .atc-stat-value{color:var(--dsw-alias-label-primary);}
.atc-stat-blocked .atc-stat-value{color:var(--dsw-alias-state-warn-primary);}
.atc-stat-pending .atc-stat-value{color:var(--dsw-alias-label-secondary);}
.atc-stat-zero .atc-stat-value{color:var(--dsw-alias-label-secondary);font-weight:500;}
.atc-stale{display:flex;align-items:center;gap:8px;font-size:12px;line-height:18px;color:var(--dsw-alias-state-warn-primary);}
.atc-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-idle-primary);flex:none;}
.atc-dot-brand{background:var(--dsw-alias-brand-primary);}
.atc-dot-success{background:var(--dsw-alias-state-success-primary);}
.atc-dot-warn{background:var(--dsw-alias-state-warn-primary);}
.atc-dot-idle{background:var(--dsw-alias-state-idle-primary);}
.atc-notice{display:flex;flex-direction:column;gap:4px;padding:12px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);}
.atc-notice-title{font-size:13px;line-height:18px;font-weight:600;}
.atc-notice-body{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);word-break:break-word;}
.atc-notice-warn{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 36%,var(--dsw-alias-border-l1));}
.atc-notice-warn .atc-notice-body{color:var(--dsw-alias-state-warn-primary);}
.atc-error-card{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 36%,var(--dsw-alias-border-l1));border-radius:10px;background:var(--dsw-alias-bg-layer-1);}
.atc-error-body{display:flex;flex-direction:column;gap:2px;min-width:0;}
.atc-error-title{font-size:13px;line-height:18px;font-weight:600;color:var(--dsw-alias-state-error-primary);}
.atc-error-detail{font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary);word-break:break-word;}
.atc-btn{flex:none;padding:6px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;line-height:16px;cursor:pointer;}
.atc-btn:hover{background:var(--dsw-alias-bg-overlay);}
.atc-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;}
.atc-empty{display:flex;flex-direction:column;align-items:center;gap:10px;padding:36px 24px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);text-align:center;}
.atc-empty-art{color:var(--dsw-alias-label-secondary);opacity:0.85;}
.atc-empty-title{font-size:14px;line-height:20px;font-weight:600;}
.atc-empty-body{margin:0;max-width:560px;font-size:12.5px;line-height:19px;color:var(--dsw-alias-label-secondary);}
.atc-empty-note{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-warn-primary);}
.atc-teams{display:grid;grid-template-columns:repeat(auto-fill,minmax(232px,1fr));gap:10px;align-items:start;min-width:0;}
.atc-card{display:flex;flex-direction:column;gap:4px;width:100%;min-height:118px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);text-align:left;cursor:pointer;color:var(--dsw-alias-label-primary);}
.atc-card:hover{border-color:var(--dsw-alias-border-l2);}
.atc-card:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;}
.atc-card-active{border-color:var(--dsw-alias-border-l2);}
.atc-card-top{display:flex;align-items:center;gap:6px;min-width:0;}
.atc-card-project{flex:1;min-width:0;font-size:15px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.atc-card-badge{flex:none;padding:1px 6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary);font-size:10.5px;line-height:14px;font-weight:500;white-space:nowrap;}
.atc-card-lead{display:block;}
.atc-card-stats{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.atc-card-caption{font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}
.atc-team{min-width:0;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);}
.atc-team-expanded{grid-column:1 / -1;}
.atc-team-active{border-color:var(--dsw-alias-border-l2);}
.atc-team-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;width:100%;padding:9px 12px;border:0;border-radius:10px;background:none;text-align:left;cursor:pointer;}
.atc-team-head:hover{background:var(--dsw-alias-bg-layer-2);}
.atc-team-head:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px;}
.atc-team-project{min-width:0;max-width:260px;font-size:15px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.atc-team-project-none{color:var(--dsw-alias-label-secondary);}
.atc-team-lead{min-width:0;font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.atc-team-role{font-size:10px;line-height:14px;letter-spacing:0.05em;text-transform:uppercase;color:var(--dsw-alias-label-secondary);}
.atc-team-caption{font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap;}
.atc-headstat{font-size:11.5px;line-height:16px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap;}
.atc-headstat-inprogress{color:var(--dsw-alias-brand-primary);font-weight:500;}
.atc-team-error{padding:5px 12px;border-top:1px solid var(--dsw-alias-border-l1);font-size:11.5px;line-height:16px;color:var(--dsw-alias-state-warn-primary);word-break:break-word;}
.atc-team-body{display:flex;flex-direction:column;gap:8px;padding:2px 12px 12px;}
.atc-caret{display:inline-block;width:6px;height:6px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);transition:transform 120ms ease;flex:none;}
.atc-caret-open{transform:rotate(45deg);}
.atc-donut{display:block;flex:none;}
.atc-donut-track{stroke:var(--dsw-alias-border-l2);}
.atc-donut-arc{stroke:var(--dsw-alias-state-success-primary);stroke-linecap:round;transition:stroke-dasharray 300ms ease;}
.atc-graph{position:relative;display:flex;flex-direction:column;gap:6px;min-width:0;}
.atc-graph-svg{display:block;width:100%;height:auto;max-height:560px;overflow:visible;}
.atc-graph-legend{display:flex;flex-wrap:wrap;align-items:center;gap:12px;font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary);}
.atc-legend-item{display:inline-flex;align-items:center;gap:5px;white-space:nowrap;}
.atc-legend-swatch{display:inline-block;width:16px;height:0;border-top:1px solid var(--dsw-alias-border-l2);}
.atc-legend-lead{border-top-color:var(--dsw-alias-border-l2);}
.atc-legend-message{border-top-color:var(--dsw-alias-brand-primary);border-top-style:dashed;}
.atc-edge{fill:none;stroke-linecap:round;}
.atc-edge-lead{stroke:var(--dsw-alias-border-l2);opacity:0.5;stroke-dasharray:6 8;animation:atc-lead-flow 2.8s linear infinite;}
.atc-edge-message{stroke:var(--dsw-alias-brand-primary);opacity:0.45;}
.atc-edge-faint{opacity:0.28;}
.atc-edge-recent{opacity:0.9;stroke-dasharray:5 7;animation:atc-edge-flow 1.1s linear infinite;}
.atc-node{outline:none;}
.atc-node-clickable{cursor:pointer;}
.atc-node-track{stroke:var(--dsw-alias-border-l2);stroke-width:3;}
.atc-node-arc{stroke:var(--dsw-alias-state-success-primary);stroke-width:3;stroke-linecap:round;transition:stroke-dasharray 300ms ease;}
.atc-node-hit{fill:var(--dsw-alias-bg-layer-1);opacity:0;pointer-events:all;}
.atc-node-name{fill:var(--dsw-alias-label-primary);font-size:11.5px;text-anchor:middle;}
.atc-node-stat{fill:var(--dsw-alias-label-secondary);font-size:10px;text-anchor:middle;font-variant-numeric:tabular-nums;}
.atc-focus-ring{fill:none;stroke:var(--dsw-alias-brand-primary);stroke-width:1.5;opacity:0;pointer-events:none;}
.atc-node:hover .atc-focus-ring{opacity:1;stroke:var(--dsw-alias-border-l2);}
.atc-node:focus-visible .atc-focus-ring{opacity:1;stroke:var(--dsw-alias-brand-primary);}
.atc-node-dash{fill:none;stroke:var(--dsw-alias-state-warn-primary);stroke-width:2;stroke-dasharray:4 5;opacity:0.9;transform-box:fill-box;transform-origin:center;}
.atc-node-provisioning .atc-node-dash{animation:atc-ring-spin 6s linear infinite;}
.atc-node-fail{fill:none;stroke:var(--dsw-alias-state-error-primary);stroke-width:2.5;}
.atc-node-idle{opacity:0.7;}
.atc-node-overflow-ring{fill:var(--dsw-alias-bg-layer-1);stroke:var(--dsw-alias-border-l2);stroke-width:1;stroke-dasharray:3 3;}
.atc-node-overflow-label{fill:var(--dsw-alias-label-secondary);font-size:11px;font-weight:600;text-anchor:middle;dominant-baseline:central;}
.atc-char{transform-box:fill-box;transform-origin:center;pointer-events:none;}
.atc-char-body,.atc-char-spark{pointer-events:none;}
.atc-px{shape-rendering:crispEdges;}
.atc-px-hair{fill:var(--dsw-alias-label-primary);}
.atc-px-skin{fill:var(--dsw-alias-label-secondary);}
.atc-px-eye{fill:var(--dsw-alias-bg-base);}
.atc-px-pants{fill:var(--dsw-alias-state-idle-primary);}
.atc-px-shirt-0{fill:var(--dsw-alias-state-idle-primary);}
.atc-px-shirt-1{fill:var(--dsw-alias-state-success-primary);}
.atc-px-shirt-2{fill:var(--dsw-alias-state-warn-primary);}
.atc-px-shirt-3{fill:var(--dsw-alias-bg-overlay);}
.atc-px-shirt-lead{fill:var(--dsw-alias-brand-primary);}
.atc-px-accent{fill:var(--dsw-alias-label-primary);}
.atc-px-accent-lead{fill:var(--dsw-alias-brand-primary);}
.atc-spark{fill:var(--dsw-alias-state-success-primary);}
.atc-char-spark{opacity:0;}
.atc-node-running .atc-char{animation:atc-char-bob 1.6s ease-in-out infinite alternate;}
.atc-node-running .atc-char-spark{animation:atc-char-spark 0.9s steps(1,end) infinite;}
.atc-node-provisioning .atc-char{animation:atc-soft-blink 2.2s ease-in-out infinite;}
.atc-detail{display:flex;flex-direction:column;gap:6px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);}
.atc-detail-head{display:flex;align-items:center;gap:6px;font-size:12px;line-height:16px;font-weight:600;}
.atc-detail-name{color:var(--dsw-alias-label-primary);}
.atc-detail-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:1px 14px;}
.atc-detail-row{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:11px;line-height:16px;}
.atc-detail-label{color:var(--dsw-alias-label-secondary);}
.atc-detail-value{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;}
.atc-detail-edges{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}
.atc-mstatus{display:inline-flex;align-items:center;gap:4px;font-size:11px;line-height:14px;color:var(--dsw-alias-label-secondary);}
.atc-mdot{width:6px;height:6px;border-radius:50%;background:currentColor;flex:none;}
.atc-mstatus-running{color:var(--dsw-alias-state-success-primary);}
.atc-mstatus-provisioning{color:var(--dsw-alias-state-warn-primary);}
.atc-mstatus-failed{color:var(--dsw-alias-state-error-primary);}
.atc-mstatus-inactive{color:var(--dsw-alias-state-idle-primary);}
.atc-tasks{display:flex;flex-direction:column;gap:4px;min-width:0;}
.atc-task-summary{display:flex;align-items:center;gap:8px;width:100%;padding:0;border:0;border-radius:6px;background:none;text-align:left;cursor:pointer;font-size:12px;line-height:16px;}
.atc-task-summary:hover{color:var(--dsw-alias-label-primary);}
.atc-task-summary:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;}
.atc-task-summary-text{min-width:0;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}
.atc-task-toggle-hint{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;}
.atc-rows{display:flex;flex-direction:column;margin:0;padding:0;}
.atc-row{display:flex;align-items:center;gap:8px;min-width:0;padding:3px 2px;font-size:12px;line-height:18px;}
.atc-row + .atc-row{border-top:1px solid var(--dsw-alias-border-l1);}
.atc-row-dot{width:6px;height:6px;}
.atc-row-subject{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.atc-row-owner{flex:none;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);white-space:nowrap;}
.atc-empty-line{padding:2px;font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary);}
.atc-skel{display:flex;flex-direction:column;gap:10px;animation:atc-breathe 1.6s ease-in-out infinite;}
.atc-skel-strip{height:36px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);}
.atc-skel-graph{height:320px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);}
.atc-skel-line{height:34px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);}
.atc-sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;}
@keyframes atc-pulse{0%,100%{opacity:1;}50%{opacity:0.35;}}
@keyframes atc-rotate{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
@keyframes atc-breathe{0%,100%{opacity:1;}50%{opacity:0.55;}}
@keyframes atc-ring-spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
@keyframes atc-char-bob{from{transform:translateY(0);}to{transform:translateY(-2.5px);}}
@keyframes atc-char-spark{0%,49%{opacity:0;}50%,100%{opacity:1;}}
@keyframes atc-soft-blink{0%,100%{opacity:1;}50%{opacity:0.55;}}
@keyframes atc-edge-flow{from{stroke-dashoffset:12;}to{stroke-dashoffset:0;}}
@keyframes atc-lead-flow{from{stroke-dashoffset:14;}to{stroke-dashoffset:0;}}
@media (max-width:899px){
.atc-page{padding:14px 14px 32px;gap:12px;}
.atc-header-side{width:100%;}
.atc-select{max-width:100%;}
.atc-team-project{max-width:100%;}
.atc-detail-grid{grid-template-columns:repeat(auto-fill,minmax(130px,1fr));}
}
@media (max-width:640px){
.atc-teams{grid-template-columns:minmax(0,1fr);}
}
@media (prefers-reduced-motion:reduce){
.atc-pulse,.atc-spin,.atc-skel,.atc-node-dash,.atc-char,.atc-char-spark,.atc-edge-recent,.atc-edge-lead,.atc-donut-arc,.atc-caret{animation:none !important;transition:none !important;}
.atc-char-spark{display:none;}
}
`

    /* ------------------------------------------------------------------ */
    /* Icons (monochrome, currentColor, no external assets)                */
    /* ------------------------------------------------------------------ */

    function svgSize(size, fallback) {
      return typeof size === 'number' && Number.isFinite(size) && size > 0 ? size : fallback
    }

    function PanelIcon(props) {
      const options = props && typeof props === 'object' ? props : {}
      const size = svgSize(options.size, 20)
      const active = options.active === true
      const filled = active ? 'currentColor' : 'none'
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: active ? 1.9 : 1.6,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
        style: { display: 'block' },
      },
        h('path', { d: 'M12 9.2v3.4M12 12.6 6.6 15.8M12 12.6l5.4 3.2' }),
        h('circle', { cx: 12, cy: 6.6, r: 2.6, fill: filled }),
        h('circle', { cx: 5.8, cy: 17.6, r: 2.2, fill: filled }),
        h('circle', { cx: 18.2, cy: 17.6, r: 2.2, fill: filled }))
    }

    function RefreshIcon({ size }) {
      const dimension = svgSize(size, 14)
      return h('svg', {
        width: dimension,
        height: dimension,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
        style: { display: 'block' },
      },
        h('path', { d: 'M13.6 8a5.6 5.6 0 1 1-1.7-4' }),
        h('path', { d: 'M13.7 2.2v4h-4' }))
    }

    function EmptyGraph() {
      return h('svg', {
        width: 132,
        height: 64,
        viewBox: '0 0 132 64',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
      },
        h('path', { d: 'M66 25v7M66 32 36 45M66 32l30 13' }),
        h('circle', { cx: 66, cy: 16, r: 8 }),
        h('circle', { cx: 32, cy: 49, r: 6 }),
        h('circle', { cx: 100, cy: 49, r: 6 }),
        h('path', { d: 'M106 12l3.4-3.4M109.4 12 106 8.6M114 20h4.4' }))
    }

    /* ------------------------------------------------------------------ */
    /* Polling hook: 2s cadence, visibility-aware, in-flight guarded       */
    /* ------------------------------------------------------------------ */

    const initialState = {
      phase: 'loading',
      data: null,
      error: null,
      stale: false,
      updatedAt: null,
      refreshing: false,
    }

    function useSnapshot() {
      const [state, setState] = React.useState(initialState)
      const mountedRef = React.useRef(false)
      const inflightRef = React.useRef(false)
      const abortRef = React.useRef(null)

      const load = React.useCallback((manual) => {
        if (inflightRef.current) return
        inflightRef.current = true
        let controller = null
        try {
          if (typeof AbortController === 'function') controller = new AbortController()
        } catch (error) {
          controller = null
        }
        abortRef.current = controller
        if (manual) {
          if (mountedRef.current) setState((previous) => ({ ...previous, refreshing: true }))
        }
        const finish = (patch) => {
          if (!mountedRef.current) return
          setState((previous) => ({ ...previous, ...(typeof patch === 'function' ? patch(previous) : patch) }))
        }
        const requestOptions = {
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { accept: 'application/json' },
        }
        if (controller) requestOptions.signal = controller.signal
        fetch(API, requestOptions)
          .then((response) => {
            if (!response || !response.ok) throw new Error('HTTP ' + (response ? response.status : '?'))
            return response.json()
          })
          .then((json) => {
            if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('Invalid snapshot payload')
            if (json.ok === false) throw new Error(asString(json.error) || 'Snapshot request failed')
            finish({
              phase: 'ok',
              data: json,
              error: null,
              stale: false,
              refreshing: false,
              updatedAt: numberOr(json.generatedAt, Date.now()),
            })
          })
          .catch((error) => {
            if (controller && controller.signal && controller.signal.aborted) {
              finish({ refreshing: false })
              return
            }
            const message = error && error.message ? String(error.message) : String(error)
            finish((previous) => ({
              phase: previous.data ? 'ok' : 'error',
              error: message,
              stale: Boolean(previous.data),
              refreshing: false,
            }))
          })
          .finally(() => {
            inflightRef.current = false
            if (abortRef.current === controller) abortRef.current = null
          })
      }, [])

      React.useEffect(() => {
        mountedRef.current = true
        load(false)
        const visible = () => (typeof document === 'undefined' || document.visibilityState === 'visible')
        const timer = setInterval(() => {
          if (visible()) load(false)
        }, POLL_MS)
        const onVisibility = () => {
          if (visible()) load(false)
        }
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)
        return () => {
          mountedRef.current = false
          clearInterval(timer)
          if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
          const controller = abortRef.current
          abortRef.current = null
          if (controller) {
            try {
              controller.abort()
            } catch (error) {
              /* ignore */
            }
          }
        }
      }, [load])

      const refresh = React.useCallback(() => {
        load(true)
      }, [load])

      return {
        phase: state.phase,
        data: state.data,
        error: state.error,
        stale: state.stale,
        updatedAt: state.updatedAt,
        refreshing: state.refreshing,
        refresh,
      }
    }

    function useLocaleRevision() {
      const [, force] = React.useReducer((value) => value + 1, 0)
      React.useEffect(() => {
        const locale = runtime.locale
        if (!locale || typeof locale.subscribe !== 'function') return undefined
        let alive = true
        let unsubscribe = null
        try {
          unsubscribe = locale.subscribe(() => {
            if (alive) force()
          })
        } catch (error) {
          unsubscribe = null
        }
        return () => {
          alive = false
          if (typeof unsubscribe === 'function') {
            try {
              unsubscribe()
            } catch (error) {
              /* ignore */
            }
          }
        }
      }, [])
      return null
    }

    /* ------------------------------------------------------------------ */
    /* Small presentational components                                     */
    /* ------------------------------------------------------------------ */

    function WorkDonut({ ratio }) {
      const size = 34
      const stroke = 4
      const radius = (size - stroke) / 2 - 1
      const circumference = 2 * Math.PI * radius
      const pct = typeof ratio === 'number' && Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : null
      const arc = pct !== null && pct > 0
        ? h('circle', {
          className: 'atc-donut-arc',
          cx: size / 2,
          cy: size / 2,
          r: radius,
          fill: 'none',
          strokeWidth: stroke,
          strokeDasharray: `${(pct * circumference).toFixed(2)} ${circumference.toFixed(2)}`,
          transform: `rotate(-90 ${size / 2} ${size / 2})`,
        })
        : null
      return h('svg', {
        className: 'atc-donut',
        width: size,
        height: size,
        viewBox: `0 0 ${size} ${size}`,
        'aria-hidden': 'true',
        focusable: 'false',
      },
        h('circle', {
          className: 'atc-donut-track',
          cx: size / 2,
          cy: size / 2,
          r: radius,
          fill: 'none',
          strokeWidth: stroke,
        }),
        arc)
    }

    function StatusStrip({ totals, t }) {
      const tokensValue = totals.tokens !== null
        ? t('team.tokens', { n: formatTokens(totals.tokens) })
        : '—'
      const chips = [
        {
          key: 'inProgress',
          className: 'atc-stat-inprogress',
          value: String(totals.inProgress),
          label: t('stat.inProgress'),
          zero: totals.inProgress === 0,
        },
        {
          key: 'running',
          className: 'atc-stat-running',
          value: totals.running + '/' + totals.members,
          label: t('stat.runningMembers'),
          zero: totals.running === 0,
        },
        {
          key: 'tokens',
          className: 'atc-stat-tokens',
          value: tokensValue,
          label: t('stat.tokens'),
          zero: totals.tokens === null || totals.tokens === 0,
        },
        {
          key: 'blocked',
          className: 'atc-stat-blocked',
          value: String(totals.blocked),
          label: t('stat.blocked'),
          zero: totals.blocked === 0,
        },
        {
          key: 'pending',
          className: 'atc-stat-pending',
          value: String(totals.pending),
          label: t('stat.pending'),
          zero: totals.pending === 0,
        },
      ]
      return h('div', { className: 'atc-stats' }, chips.map((chip) => h('div', {
        key: chip.key,
        className: 'atc-stat ' + chip.className + (chip.zero ? ' atc-stat-zero' : ''),
      },
        h('span', { className: 'atc-stat-value' }, chip.value),
        h('span', { className: 'atc-stat-label' }, chip.label))))
    }

    function Header({ t, totals, projects, projectId, onProjectChange, refreshing, onRefresh, updatedLabel }) {
      const anyRunning = totals.running > 0
      const options = asArray(projects).length > 1 ? uniqueProjectOptions(projects, t) : []
      return h('header', { className: 'atc-header' },
        h('div', { className: 'atc-header-main' },
          h('h1', { className: 'atc-title' }, t('title')),
          h('p', { className: 'atc-subtitle' }, t('subtitle'))),
        h('div', { className: 'atc-header-side' },
          options.length
            ? h('span', { className: 'atc-filter' },
              h('select', {
                className: 'atc-select',
                value: projectId,
                title: t('filter.label'),
                'aria-label': t('filter.label'),
                onChange: (event) => {
                  if (event && event.target) onProjectChange(event.target.value)
                },
              },
                h('option', { value: 'all' }, t('filter.all')),
                options.map((option) => h('option', { key: option.id, value: option.id }, option.label))))
            : null,
          h('span', { className: 'atc-live', role: 'status', 'aria-live': 'polite' },
            h('span', { className: 'atc-live-dot' + (anyRunning ? ' atc-live-on atc-pulse' : ''), 'aria-hidden': 'true' }),
            h('span', null, t('live', { interval: `${POLL_MS / 1000}s` }))),
          h('span', { className: 'atc-updated' }, updatedLabel),
          h('button', {
            type: 'button',
            className: 'atc-icon-btn',
            'aria-label': refreshing ? t('refreshing') : t('refresh'),
            title: refreshing ? t('refreshing') : t('refresh'),
            'aria-busy': refreshing ? 'true' : undefined,
            onClick: onRefresh,
          }, h('span', { className: 'atc-refresh-icon' + (refreshing ? ' atc-spin' : '') }, h(RefreshIcon, { size: 15 })))))
    }

    function Skeleton() {
      return h('div', { className: 'atc-skel', 'aria-hidden': 'true' },
        h('div', { className: 'atc-skel-strip' }),
        h('div', { className: 'atc-skel-graph' }),
        h('div', { className: 'atc-skel-line' }))
    }

    function ErrorCard({ t, message, onRetry }) {
      return h('div', { className: 'atc-error-card', role: 'alert' },
        h('div', { className: 'atc-error-body' },
          h('div', { className: 'atc-error-title' }, t('error.title')),
          message ? h('div', { className: 'atc-error-detail' }, message) : null),
        h('button', { type: 'button', className: 'atc-btn', onClick: onRetry }, t('retry')))
    }

    function StaleHint({ t }) {
      return h('div', { className: 'atc-stale', role: 'status' },
        h('span', { className: 'atc-dot atc-dot-warn', 'aria-hidden': 'true' }),
        h('span', null, t('stale')))
    }

    function NoticeCard({ title, message, tone }) {
      return h('div', { className: 'atc-notice' + (tone === 'warn' ? ' atc-notice-warn' : ''), role: 'status' },
        h('div', { className: 'atc-notice-title' }, title),
        message ? h('div', { className: 'atc-notice-body' }, message) : null)
    }

    function EmptyState({ t, unsupported }) {
      return h('div', { className: 'atc-empty' },
        h('div', { className: 'atc-empty-art' }, h(EmptyGraph)),
        h('div', { className: 'atc-empty-title' }, t('empty.title')),
        h('p', { className: 'atc-empty-body' }, t('empty.body')),
        unsupported ? h('p', { className: 'atc-empty-note' }, t('empty.unsupported')) : null)
    }

    /* ------------------------------------------------------------------ */
    /* Agent graph: Lead hub + member ring, pixel-art characters, edges    */
    /* ------------------------------------------------------------------ */

    function PixelCharacter({ member }) {
      const pixels = pixelCharacter(member)
      const offsetX = -(PIXEL_GRID_WIDTH * PIXEL_SIZE) / 2
      const offsetY = -(PIXEL_GRID_HEIGHT * PIXEL_SIZE) / 2
      return h('g', { className: 'atc-char' },
        h('g', { className: 'atc-char-body' }, pixels.map((pixel) => h('rect', {
          key: pixel.x + '-' + pixel.y,
          className: 'atc-px atc-px-' + pixel.c,
          x: offsetX + pixel.x * PIXEL_SIZE,
          y: offsetY + pixel.y * PIXEL_SIZE,
          width: PIXEL_SIZE,
          height: PIXEL_SIZE,
        }))),
        h('g', { className: 'atc-char-spark' },
          h('rect', { className: 'atc-spark', x: 9, y: -2, width: 2, height: 2 }),
          h('rect', { className: 'atc-spark', x: 12, y: 1, width: 2, height: 2 }),
          h('rect', { className: 'atc-spark', x: 7, y: -6, width: 2, height: 2 })))
    }

    function MemberDetail({ member, stats, edges, t }) {
      const name = asString(member && member.name) || '—'
      const status = asString(member && member.status) || 'inactive'
      const tone = memberStatusTone(status)
      const statusLabel = memberStatusLabel(status, t)
      const rows = [
        { key: 'model', label: t('tooltip.model'), value: asString(member && member.model) || '—' },
        { key: 'turns', label: t('tooltip.turns'), value: stats.turns !== null ? String(stats.turns) : '—' },
        { key: 'steps', label: t('tooltip.steps'), value: stats.steps !== null ? String(stats.steps) : '—' },
        { key: 'working', label: t('tooltip.working'), value: formatDuration(stats.workingMs, t) },
        { key: 'idle', label: t('tooltip.idle'), value: formatDuration(stats.idleMs, t) },
      ]
      if (stats.tokens) {
        rows.push({ key: 'total', label: t('tooltip.tokens'), value: formatTokens(stats.tokens.total) })
        rows.push({ key: 'input', label: t('tooltip.input'), value: formatTokens(stats.tokens.uncachedInput) })
        rows.push({ key: 'cacheRead', label: t('tooltip.cacheRead'), value: formatTokens(stats.tokens.cacheRead) })
        rows.push({ key: 'cacheWrite', label: t('tooltip.cacheWrite'), value: formatTokens(stats.tokens.cacheWrite) })
        rows.push({ key: 'output', label: t('tooltip.output'), value: formatTokens(stats.tokens.output) })
      } else {
        rows.push({ key: 'total', label: t('tooltip.tokens'), value: '—' })
      }
      return h('div', { className: 'atc-detail' },
        h('div', { className: 'atc-detail-head' },
          h('span', { className: 'atc-mstatus atc-mstatus-' + tone },
            h('span', { className: 'atc-mdot', 'aria-hidden': 'true' }),
            statusLabel),
          h('span', { className: 'atc-detail-name' }, name)),
        h('div', { className: 'atc-detail-grid' },
          rows.map((row) => h('div', { key: row.key, className: 'atc-detail-row' },
            h('span', { className: 'atc-detail-label' }, row.label),
            h('span', { className: 'atc-detail-value' }, row.value)))),
        edges ? h('div', { className: 'atc-detail-edges' }, edges) : null)
    }

    function AgentGraph({ team, members, t, onOpen }) {
      const [activeId, setActiveId] = React.useState(null)
      const ordered = stageMembers(members)
      if (ordered.length === 0) return h('div', { className: 'atc-empty-line' }, t('roster.empty'))
      const shown = ordered.slice(0, MEMBER_LIMIT)
      const overflow = ordered.length - shown.length
      const memberStatsList = shown.map((member) => memberStatsFor(member))
      // Scale nodes against the whole team's max token total, not only the
      // visible window (the frozen spec's log-scale rule).
      let maxTokens = 0
      for (const member of ordered) {
        const stats = memberStatsFor(member)
        if (stats.tokens && stats.tokens.total > maxTokens) maxTokens = stats.tokens.total
      }
      const graph = teamGraphEdges(team, shown)
      const hasLead = asString(shown[0] && shown[0].role) === 'lead'
      const nodeKeys = shown.map((member, index) => asString(member && member.id) || 'member-' + index)
      const nodeRadii = shown.map((member, index) => nodeRadius(
        memberStatsList[index].tokens ? memberStatsList[index].tokens.total : null,
        maxTokens,
        index === 0 && hasLead,
      ))
      const layout = layoutTopDown(shown.map((member, index) => ({
        key: nodeKeys[index],
        isLead: index === 0 && hasLead,
        radius: nodeRadii[index],
      })), overflow > 0)
      const positionFor = (index) => (
        index === 0 ? layout.lead : (layout.positions[nodeKeys[index]] || layout.lead)
      )
      const now = Date.now()
      const nodeInfos = []
      const nodeById = new Map()
      for (let index = 0; index < shown.length; index += 1) {
        const member = shown[index]
        const id = asString(member && member.id)
        const position = positionFor(index)
        const info = {
          index,
          id,
          member,
          stats: memberStatsList[index],
          radius: nodeRadii[index],
          x: position.x,
          y: position.y,
          isLead: index === 0 && hasLead,
        }
        nodeInfos.push(info)
        if (id) nodeById.set(id, info)
      }
      const activeMember = activeId
        ? shown.find((member) => asString(member && member.id) === activeId) || null
        : null
      const activeEdges = activeMember
        ? t('team.edgeSummary', {
          in: graph.messageIn(asString(activeMember.id)),
          out: graph.messageOut(asString(activeMember.id)),
        })
        : ''
      const edgeElements = []
      const sortedEdges = graph.edges.slice().sort((left, right) => (
        (left.kind === 'lead' ? 0 : 1) - (right.kind === 'lead' ? 0 : 1)
      ))
      for (let index = 0; index < sortedEdges.length; index += 1) {
        const edge = sortedEdges[index]
        const from = nodeById.get(edge.from)
        const to = nodeById.get(edge.to)
        if (!from || !to) continue
        const recent = edge.kind === 'message' && isRecentEdge(edge, now)
        edgeElements.push(h('path', {
          key: edge.kind + '-' + index + '-' + edge.from + '-' + edge.to,
          className: 'atc-edge atc-edge-' + edge.kind
            + (edge.kind === 'message' ? (recent ? ' atc-edge-recent' : ' atc-edge-faint') : ''),
          d: edgePath({ x: from.x, y: from.y }, { x: to.x, y: to.y }, edge.kind),
          strokeWidth: edgeStrokeWidth(edge),
          'aria-hidden': 'true',
        }))
      }
      const nodeElements = []
      const labelElements = []
      const buildNode = (info) => {
        const { id, member, stats, radius, x, y, isLead, index } = info
        const name = asString(member && member.name) || t('team.unnamed')
        const status = asString(member && member.status) || 'inactive'
        const tone = memberStatusTone(status)
        const nodeTone = tone === 'inactive' ? 'idle' : tone
        const statusLabel = memberStatusLabel(status, t)
        const edgesText = t('team.edgeSummary', {
          in: graph.messageIn(id),
          out: graph.messageOut(id),
        })
        const nodeAria = t('team.nodeAria', {
          name,
          status: statusLabel,
          turns: stats.turns !== null ? String(stats.turns) : '—',
          tokens: stats.tokens ? formatTokens(stats.tokens.total) : '—',
          edges: edgesText,
        })
        const clickable = typeof onOpen === 'function' && id !== ''
        const showDetail = () => setActiveId(id || null)
        const hideDetail = () => setActiveId((current) => (current === id ? null : current))
        const activate = () => {
          if (clickable) onOpen(id)
        }
        const nodeProps = {
          key: id || 'member-' + index,
          className: 'atc-node atc-node-' + nodeTone
            + (isLead ? ' atc-node-lead' : '')
            + (clickable ? ' atc-node-clickable' : ''),
          transform: `translate(${x} ${y})`,
          tabIndex: 0,
          role: clickable ? 'button' : 'group',
          'aria-label': nodeAria,
          onMouseEnter: showDetail,
          onMouseLeave: hideDetail,
          onFocus: showDetail,
          onBlur: hideDetail,
        }
        if (clickable) {
          nodeProps.onClick = activate
          nodeProps.onKeyDown = (event) => {
            if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
              event.preventDefault()
              activate()
            }
          }
        }
        const art = [
          h('circle', { key: 'hit', className: 'atc-node-hit', r: radius + 7, fill: 'none' }),
          h('circle', { key: 'track', className: 'atc-node-track', r: radius + 5, fill: 'none' }),
        ]
        if (stats.workingRatio !== null && stats.workingRatio > 0) {
          art.push(h('circle', {
            key: 'arc',
            className: 'atc-node-arc',
            r: radius + 5,
            fill: 'none',
            pathLength: 100,
            strokeDasharray: `${(Math.min(1, stats.workingRatio) * 100).toFixed(2)} 100`,
            transform: 'rotate(-90)',
          }))
        }
        if (tone === 'provisioning') {
          art.push(h('circle', { key: 'dash', className: 'atc-node-dash', r: radius + 5, fill: 'none' }))
        } else if (tone === 'failed') {
          art.push(h('circle', { key: 'fail', className: 'atc-node-fail', r: radius + 5, fill: 'none' }))
        }
        art.push(h('circle', { key: 'focus', className: 'atc-focus-ring', r: radius + 10, fill: 'none' }))
        art.push(h(PixelCharacter, { key: 'character', member }))
        nodeElements.push(h('g', nodeProps, art))
        labelElements.push(h('text', {
          key: 'name-' + index,
          className: 'atc-node-name',
          x,
          y: y + radius + 17,
        }, truncateText(name, 12)))
        labelElements.push(h('text', {
          key: 'stat-' + index,
          className: 'atc-node-stat',
          x,
          y: y + radius + 31,
        }, memberStatLine(stats, t)))
      }
      // Hub first so keyboard order follows the member order (lead first);
      // nodes never overlap, so paint order does not matter.
      for (let index = 0; index < nodeInfos.length; index += 1) buildNode(nodeInfos[index])
      if (overflow > 0 && layout.overflow !== null) {
        nodeElements.push(h('g', {
          key: 'overflow',
          className: 'atc-node atc-node-overflow',
          transform: `translate(${layout.overflow.x} ${layout.overflow.y})`,
          role: 'img',
          'aria-label': t('team.overflow', { n: overflow }),
        },
          h('circle', { className: 'atc-node-overflow-ring', r: LAYOUT.overflowRadius, fill: 'none' }),
          h('text', { className: 'atc-node-overflow-label' }, '+' + overflow)))
      }
      const hasMessageEdges = graph.edges.some((edge) => edge.kind === 'message')
      return h('div', { className: 'atc-graph' },
        graph.edges.length > 0
          ? h('div', { className: 'atc-graph-legend' },
            h('span', { className: 'atc-legend-item' },
              h('span', { className: 'atc-legend-swatch atc-legend-lead', 'aria-hidden': 'true' }),
              t('team.edgeLead')),
            hasMessageEdges
              ? h('span', { className: 'atc-legend-item' },
                h('span', { className: 'atc-legend-swatch atc-legend-message', 'aria-hidden': 'true' }),
                t('team.edgeMessage'))
              : null)
          : null,
        h('svg', {
          className: 'atc-graph-svg',
          viewBox: `0 0 ${layout.width} ${layout.height}`,
          role: 'group',
          'aria-label': t('team.graphLabel', { n: ordered.length }),
        }, edgeElements.concat(nodeElements, labelElements)),
        activeMember
          ? h(MemberDetail, {
            key: 'detail',
            member: activeMember,
            stats: memberStatsFor(activeMember),
            edges: activeEdges,
            t,
          })
          : null)
    }

    /* ------------------------------------------------------------------ */
    /* Tasks: one compact summary line + in-progress rows on demand        */
    /* ------------------------------------------------------------------ */

    function TaskRow({ task, t }) {
      const safe = task && typeof task === 'object' ? task : {}
      const subject = asString(safe.subject) || asString(safe.id) || '—'
      const ownerName = asString(safe.ownerName)
      const description = asString(safe.description)
      return h('div', { className: 'atc-row', role: 'listitem', title: description || undefined },
        h('span', {
          className: 'atc-dot atc-dot-brand atc-row-dot',
          title: t('status.in_progress'),
          'aria-hidden': 'true',
        }),
        h('span', { className: 'atc-row-subject' }, subject),
        h('span', {
          className: 'atc-row-owner',
          title: t('task.owner', { name: ownerName || t('task.unowned') }),
        }, ownerName ? '@' + ownerName : t('task.unowned')))
    }

    function TasksSummary({ team, counts, t, expanded, onToggle }) {
      const inProgress = asArray(team && team.tasks).filter((task) => asString(task && task.status) === 'in_progress')
      const summary = t('tasks.summary', {
        inProgress: t('tasks.inProgress', { n: counts.inProgress }),
        pending: t('tasks.pending', { n: counts.pending }),
        blocked: t('tasks.blocked', { n: counts.blocked }),
      })
      return h('div', { className: 'atc-tasks' },
        h('button', {
          type: 'button',
          className: 'atc-task-summary',
          'aria-expanded': expanded,
          'aria-label': t('tasks.toggle'),
          onClick: onToggle,
        },
          h('span', { className: 'atc-caret' + (expanded ? ' atc-caret-open' : ''), 'aria-hidden': 'true' }),
          h('span', { className: 'atc-task-summary-text' }, summary),
          h('span', { className: 'atc-task-toggle-hint' }, t(expanded ? 'team.collapse' : 'team.expand'))),
        expanded
          ? (inProgress.length > 0
            ? h('div', { className: 'atc-rows', role: 'list', 'aria-label': t('section.inProgress') },
              inProgress.map((task, index) => h(TaskRow, {
                key: asString(task && task.id) || 'task-' + index,
                task,
                t,
              })))
            : h('div', { className: 'atc-empty-line' }, t('tasks.noInProgress')))
          : null)
    }

    /* ------------------------------------------------------------------ */
    /* Team section: workspace-first header + stage + task summary         */
    /* ------------------------------------------------------------------ */

    function TeamSection({ team, index, expanded, tasksExpanded, onToggle, onToggleTasks, onOpen, t }) {
      const safe = team && typeof team === 'object' ? team : {}
      const counts = teamCounts(safe)
      const active = teamActiveFromCounts(safe, counts)
      const project = teamProject(safe)
      const projectTitle = project ? projectLabel(project, t) : t('project.none')
      const members = stageMembers(asArray(safe.members))
      const lead = members[0] || null
      const leadName = lead ? (asString(lead.name) || t('team.unnamed')) : t('team.unnamed')
      const leadRole = lead ? memberRoleLabel(lead.role, t) : ''
      const stats = teamStatsFor(safe)
      const turnsText = stats.turns !== null ? t('team.turns', { n: stats.turns }) : '—'
      const tokensText = stats.tokens ? t('team.tokens', { n: formatTokens(stats.tokens.total) }) : '—'
      const caption = t('team.workIdle', {
        work: t('team.work') + ' ' + formatDuration(stats.workingMs, t),
        idle: t('team.idle') + ' ' + formatDuration(stats.idleMs, t),
      })
      const errorMessage = asString(safe.error)
      const memberBusy = counts.running + counts.provisioning > 0
      let dotClass = 'atc-dot-idle'
      if (memberBusy) dotClass = 'atc-dot-success atc-pulse'
      else if (counts.inProgress > 0) dotClass = 'atc-dot-brand'
      const bodyId = 'atc-team-body-' + index
      if (!expanded) {
        const cardLabel = projectTitle + ' · ' + leadName + ' · ' + t('team.expand')
        return h('button', {
          type: 'button',
          className: 'atc-card' + (active ? ' atc-card-active' : ''),
          'aria-expanded': false,
          'aria-controls': bodyId,
          'aria-label': cardLabel,
          title: t('team.expand'),
          onClick: onToggle,
        },
          h('span', { className: 'atc-card-top' },
            h('span', { className: 'atc-dot ' + dotClass, 'aria-hidden': 'true' }),
            h('span', {
              className: 'atc-card-project' + (project ? '' : ' atc-team-project-none'),
              title: project && project.path ? project.path : projectTitle,
            }, projectTitle),
            counts.inProgress > 0
              ? h('span', { className: 'atc-card-badge' }, t('team.inProgress', { n: counts.inProgress }))
              : null),
          h('span', { className: 'atc-team-lead atc-card-lead' }, leadName),
          h('span', { className: 'atc-card-stats' },
            h(WorkDonut, { ratio: stats.workingRatio }),
            h('span', { className: 'atc-headstat' }, turnsText),
            h('span', { className: 'atc-headstat' }, tokensText)),
          h('span', { className: 'atc-card-caption' }, caption))
      }
      const headingText = projectTitle + ' · ' + leadName
      return h('section', { className: 'atc-team atc-team-expanded' + (active ? ' atc-team-active' : '') },
        h('h2', { className: 'atc-sr-only' }, headingText),
        h('button', {
          type: 'button',
          className: 'atc-team-head',
          'aria-expanded': expanded,
          'aria-controls': bodyId,
          title: expanded ? t('team.collapse') : t('team.expand'),
          onClick: onToggle,
        },
          h('span', {
            className: 'atc-team-project' + (project ? '' : ' atc-team-project-none'),
            title: project && project.path ? project.path : undefined,
          }, projectTitle),
          h('span', { className: 'atc-team-lead' }, leadName),
          leadRole ? h('span', { className: 'atc-team-role' }, leadRole) : null,
          h('span', { className: 'atc-dot ' + dotClass, 'aria-hidden': 'true' }),
          h(WorkDonut, { ratio: stats.workingRatio }),
          h('span', { className: 'atc-team-caption' }, caption),
          h('span', { className: 'atc-headstat' }, turnsText),
          h('span', { className: 'atc-headstat' }, tokensText),
          counts.inProgress > 0
            ? h('span', { className: 'atc-headstat atc-headstat-inprogress' }, t('team.inProgress', { n: counts.inProgress }))
            : null,
          h('span', { className: 'atc-caret' + (expanded ? ' atc-caret-open' : ''), 'aria-hidden': 'true' }),
          h('span', { className: 'atc-sr-only' }, t(expanded ? 'team.collapse' : 'team.expand'))),
        errorMessage ? h('div', { className: 'atc-team-error', role: 'alert' }, t('team.error', { message: errorMessage })) : null,
        h('div', { className: 'atc-team-body', id: bodyId },
          h(AgentGraph, { team: safe, members, t, onOpen }),
          h(TasksSummary, { team: safe, counts, t, expanded: tasksExpanded, onToggle: onToggleTasks })))
    }

    /* ------------------------------------------------------------------ */
    /* Page                                                                */
    /* ------------------------------------------------------------------ */

    function Panel() {
      useLocaleRevision()
      const t = runtime.t
      const snapshot = useSnapshot()
      const data = snapshot.data
      const phase = snapshot.phase
      const teams = asArray(data && data.teams)
      const projects = asArray(data && data.projects).filter((project) => project && asString(project.id))
      const unsupported = data ? asString(data.unsupported) : ''

      const [projectState, setProjectState] = React.useState('all')
      const [expandedKey, setExpandedKey] = React.useState(null)
      const [touchedExpansion, setTouchedExpansion] = React.useState(false)
      const [expandedTasks, setExpandedTasks] = React.useState({})
      const projectId = effectiveProjectId(projectState, projects)
      const filtered = filterTeams(teams, projectId)
      const totals = aggregateTeams(filtered)

      // Single-accordion expansion: default to the first active team until the
      // user touches it; an explicit collapse (null) survives the 2s polls, and
      // a stored key that no longer exists in the filtered list falls back to
      // the default for that render instead of stranding the UI.
      let defaultKey = null
      for (let index = 0; index < filtered.length; index += 1) {
        if (teamActive(filtered[index])) {
          defaultKey = teamKeyOf(filtered[index], index)
          break
        }
      }
      let effectiveKey = touchedExpansion ? expandedKey : defaultKey
      if (touchedExpansion && expandedKey !== null) {
        const storedExists = filtered.some((team, index) => teamKeyOf(team, index) === expandedKey)
        if (!storedExists) effectiveKey = defaultKey
      }

      let updatedLabel = t('neverUpdated')
      if (snapshot.updatedAt) updatedLabel = t('lastUpdated', { time: formatClock(snapshot.updatedAt) })
      else if (phase === 'loading') updatedLabel = t('loading')
      const canOpen = workspaceService() !== null
      const memberOpener = canOpen ? openMemberSession : null
      const busy = snapshot.refreshing || (phase === 'loading' && !data)

      const toggleTeam = (teamKey, isExpanded) => {
        setExpandedKey(isExpanded ? null : teamKey)
        setTouchedExpansion(true)
      }
      const toggleTasks = (teamKey) => {
        setExpandedTasks((previous) => ({ ...previous, [teamKey]: !previous[teamKey] }))
      }

      const body = []
      if (phase === 'loading' && !data) {
        body.push(h(Skeleton, { key: 'skeleton' }))
      } else if (phase === 'error' && !data) {
        body.push(h(ErrorCard, { key: 'error', t, message: snapshot.error, onRetry: snapshot.refresh }))
      } else {
        if (snapshot.stale) body.push(h(StaleHint, { key: 'stale', t }))
        if (unsupported) {
          body.push(h(NoticeCard, {
            key: 'unsupported',
            title: t('unsupported.title'),
            message: t('unsupported.body', { message: unsupported }),
          }))
        } else if (data) {
          body.push(h(StatusStrip, { key: 'stats', totals, t }))
        }
        if (teams.length === 0 || filtered.length === 0) {
          body.push(h(EmptyState, { key: 'empty', t, unsupported }))
        } else {
          const sections = []
          for (let index = 0; index < filtered.length; index += 1) {
            const team = filtered[index]
            const teamKey = teamKeyOf(team, index)
            const expanded = effectiveKey === teamKey
            const tasksExpanded = hasOwn(expandedTasks, teamKey) ? expandedTasks[teamKey] === true : false
            sections.push(h(TeamSection, {
              key: teamKey,
              team,
              index,
              expanded,
              tasksExpanded,
              onToggle: () => toggleTeam(teamKey, expanded),
              onToggleTasks: () => toggleTasks(teamKey),
              onOpen: memberOpener,
              t,
            }))
          }
          body.push(h('div', { key: 'teams', className: 'atc-teams' }, sections))
        }
      }

      return h('div', { className: 'atc-root' },
        h('style', { 'data-atc-style': 'team-console' }, CSS),
        h('div', { className: 'atc-page' },
          h(Header, {
            t,
            totals,
            projects,
            projectId,
            onProjectChange: setProjectState,
            refreshing: busy,
            onRefresh: snapshot.refresh,
            updatedLabel,
          }),
          body))
    }

    /* ------------------------------------------------------------------ */
    /* Registration                                                        */
    /* ------------------------------------------------------------------ */

    function apply(ctx) {
      runtime.ctx = ctx || null

      let translate = runtime.t
      let locale = null
      try {
        locale = ctx && typeof ctx.get === 'function' ? ctx.get('locale') : (ctx && ctx.locale)
      } catch (error) {
        locale = null
      }
      if (locale && typeof locale.register === 'function' && typeof locale.bind === 'function') {
        runtime.locale = locale
        ctx.effect(() => {
          const disposeZh = locale.register(NS, 'zh', zh)
          const disposeEn = locale.register(NS, 'en', en)
          return () => {
            try {
              disposeEn()
            } catch (error) {
              /* already disposed */
            }
            try {
              disposeZh()
            } catch (error) {
              /* already disposed */
            }
          }
        }, 'agent-team-console: dictionaries')
        try {
          translate = locale.bind(NS)
        } catch (error) {
          translate = runtime.t
        }
        runtime.t = translate
      }

      const slots = ctx
        ? (ctx.slots || (typeof ctx.get === 'function' ? ctx.get('slots') : null))
        : null
      if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') return

      slots.inject('sidebar.panellist', () => slots.register({
        name: 'sidebar.panellist',
        id: 'team-console',
        order: 20,
        label: () => runtime.t('panel.label'),
      }, PanelIcon))

      slots.inject('main', () => slots.register({
        name: 'main',
        key: 'team-console',
      }, Panel))
    }

    return {
      inject: ['slots', 'locale'],
      apply,
    }
  },
})
