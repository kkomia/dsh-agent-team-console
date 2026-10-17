/**
 * dsh-agent-team-console — Client half (browser bundle), snapshot contract v3.
 * ============================================================================
 * Self-registering classic script loaded through window.__ModuleLoader__:
 *   - id MUST equal the package name.
 *   - only require('react') is allowed here; no @deepseek-ai/* imports.
 *   - Registers a sidebar.panellist entry (id 'team-console') and a keyed
 *     main panel (key 'team-console') that polls the Host half at
 *     GET /api/team-console/snapshot (same origin, read-only, 2s cadence).
 *   - Read-only, visual-first design (1.2.0 / contract v3):
 *       header (project filter, live dot, refresh)
 *       -> compact status chip strip (in-progress / running / tokens / blocked / pending)
 *       -> per-team section (active expanded, idle collapsed) whose header starts
 *          with the workspace/project name and carries the working-vs-idle donut
 *          and stats, and whose body is an animated SVG "agent stage" (one node
 *          per member: tokens-scaled avatar, working-ratio ring, status motion)
 *          plus a collapsed task summary line with in-progress rows on demand.
 *     The activity timeline is intentionally not rendered (contract keeps it for
 *     API consumers); stats come from the contract v3 `team.stats` / `member.stats`.
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
    const NODE_GAP = 96
    const STAGE_MIN_WIDTH = 340
    const STAGE_HEIGHT = 140
    const STAGE_CENTER_Y = 60
    const STAGE_NAME_Y = 106
    const STAGE_STAT_Y = 120
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
      'team.stageLabel': '{n} 位成员的实时状态',
      'team.nodeAria': '{name}，{status}，{turns}，{tokens}',
      'team.statLine': '{turns} · {tokens}',
      'team.moreMembers': '另有 {n} 位成员',
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
      'team.stageLabel': 'Live status of {n} members',
      'team.nodeAria': '{name}, {status}, {turns}, {tokens}',
      'team.statLine': '{turns} · {tokens}',
      'team.moreMembers': '{n} more members',
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

    /** The Lead node comes first; the remaining teammates keep the served order. */
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

    function initialOf(name) {
      const characters = Array.from(asString(name).trim())
      return characters.length > 0 ? characters[0] : '?'
    }

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
.atc-teams{display:flex;flex-direction:column;gap:8px;min-width:0;}
.atc-team{min-width:0;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);}
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
.atc-stage{position:relative;min-width:0;}
.atc-stage-svg{display:block;width:100%;height:auto;max-height:180px;overflow:visible;}
.atc-stage-line{stroke:var(--dsw-alias-border-l1);stroke-width:1;}
.atc-node{outline:none;}
.atc-node-clickable{cursor:pointer;}
.atc-node-track{stroke:var(--dsw-alias-border-l2);stroke-width:3;}
.atc-node-arc{stroke:var(--dsw-alias-state-success-primary);stroke-width:3;stroke-linecap:round;transition:stroke-dasharray 300ms ease;}
.atc-node-avatar{fill:var(--dsw-alias-bg-layer-2);stroke:var(--dsw-alias-border-l1);stroke-width:1.5;}
.atc-node-avatar-lead{stroke:var(--dsw-alias-brand-primary);stroke-width:2.5;}
.atc-node-initial{fill:var(--dsw-alias-label-primary);font-size:12px;font-weight:600;text-anchor:middle;dominant-baseline:central;}
.atc-node-name{fill:var(--dsw-alias-label-primary);font-size:11.5px;text-anchor:middle;}
.atc-node-stat{fill:var(--dsw-alias-label-secondary);font-size:10px;text-anchor:middle;font-variant-numeric:tabular-nums;}
.atc-focus-ring{fill:none;stroke:var(--dsw-alias-brand-primary);stroke-width:1.5;opacity:0;pointer-events:none;}
.atc-node:hover .atc-focus-ring{opacity:1;stroke:var(--dsw-alias-border-l2);}
.atc-node:focus-visible .atc-focus-ring{opacity:1;stroke:var(--dsw-alias-brand-primary);}
.atc-node-pulse{fill:none;stroke:var(--dsw-alias-state-success-primary);stroke-width:2;opacity:0;transform-box:fill-box;transform-origin:center;}
.atc-node-running .atc-node-pulse{animation:atc-node-pulse 1.8s ease-out infinite;}
.atc-node-orbit{transform-box:fill-box;transform-origin:center;}
.atc-node-orbit-dot{fill:var(--dsw-alias-state-success-primary);}
.atc-node-running .atc-node-orbit{animation:atc-orbit 2.6s linear infinite;}
.atc-node-dash{fill:none;stroke:var(--dsw-alias-state-warn-primary);stroke-width:2;stroke-dasharray:4 5;opacity:0.9;transform-box:fill-box;transform-origin:center;}
.atc-node-provisioning .atc-node-dash{animation:atc-orbit 6s linear infinite;}
.atc-node-fail{fill:none;stroke:var(--dsw-alias-state-error-primary);stroke-width:2.5;}
.atc-node-idle{opacity:0.65;}
.atc-node-overflow .atc-node-avatar{stroke:var(--dsw-alias-border-l2);}
.atc-detail{display:flex;flex-direction:column;gap:6px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);}
.atc-detail-head{display:flex;align-items:center;gap:6px;font-size:12px;line-height:16px;font-weight:600;}
.atc-detail-name{color:var(--dsw-alias-label-primary);}
.atc-detail-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:1px 14px;}
.atc-detail-row{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:11px;line-height:16px;}
.atc-detail-label{color:var(--dsw-alias-label-secondary);}
.atc-detail-value{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;}
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
.atc-skel-stage{height:176px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);}
.atc-skel-line{height:34px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);}
.atc-sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;}
@keyframes atc-pulse{0%,100%{opacity:1;}50%{opacity:0.35;}}
@keyframes atc-rotate{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
@keyframes atc-breathe{0%,100%{opacity:1;}50%{opacity:0.55;}}
@keyframes atc-orbit{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
@keyframes atc-node-pulse{0%{transform:scale(1);opacity:0.55;}70%,100%{transform:scale(1.25);opacity:0;}}
@media (max-width:899px){
.atc-page{padding:14px 14px 32px;gap:12px;}
.atc-header-side{width:100%;}
.atc-select{max-width:100%;}
.atc-team-project{max-width:100%;}
.atc-detail-grid{grid-template-columns:repeat(auto-fill,minmax(130px,1fr));}
}
@media (prefers-reduced-motion:reduce){
.atc-pulse,.atc-spin,.atc-skel,.atc-node-pulse,.atc-node-orbit,.atc-node-dash,.atc-donut-arc,.atc-caret{animation:none !important;transition:none !important;}
.atc-node-pulse,.atc-node-orbit{display:none;}
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
        h('div', { className: 'atc-skel-stage' }),
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
    /* Agent stage: one animated SVG node per member                       */
    /* ------------------------------------------------------------------ */

    function MemberDetail({ member, stats, t }) {
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
            h('span', { className: 'atc-detail-value' }, row.value)))))
    }

    function AgentStage({ members, t, onOpen }) {
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
      const total = shown.length + (overflow > 0 ? 1 : 0)
      const width = Math.max(STAGE_MIN_WIDTH, 64 + Math.max(0, total - 1) * NODE_GAP)
      const step = NODE_GAP
      const startX = width / 2 - (Math.max(0, total - 1) * step) / 2
      const hasLead = asString(shown[0] && shown[0].role) === 'lead'
      const activeMember = activeId
        ? shown.find((member) => asString(member && member.id) === activeId) || null
        : null
      const elements = []
      if (total > 0) {
        elements.push(h('line', {
          key: 'connector',
          className: 'atc-stage-line',
          x1: startX,
          y1: STAGE_CENTER_Y,
          x2: startX + Math.max(0, total - 1) * step,
          y2: STAGE_CENTER_Y,
        }))
      }
      for (let index = 0; index < shown.length; index += 1) {
        const member = shown[index]
        const stats = memberStatsList[index]
        const id = asString(member && member.id)
        const name = asString(member && member.name) || t('team.unnamed')
        const status = asString(member && member.status) || 'inactive'
        const tone = memberStatusTone(status)
        const nodeTone = tone === 'inactive' ? 'idle' : tone
        const isLead = index === 0 && hasLead
        const radius = nodeRadius(stats.tokens ? stats.tokens.total : null, maxTokens, isLead)
        const centerX = startX + index * step
        const statusLabel = memberStatusLabel(status, t)
        const nodeAria = t('team.nodeAria', {
          name,
          status: statusLabel,
          turns: stats.turns !== null ? String(stats.turns) : '—',
          tokens: stats.tokens ? formatTokens(stats.tokens.total) : '—',
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
          transform: `translate(${centerX} ${STAGE_CENTER_Y})`,
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
        if (tone === 'running') {
          art.push(h('circle', { key: 'pulse', className: 'atc-node-pulse', r: radius + 5, fill: 'none' }))
          art.push(h('g', { key: 'orbit', className: 'atc-node-orbit' },
            h('circle', { className: 'atc-node-orbit-keep', r: radius + 5, fill: 'none', stroke: 'none' }),
            h('circle', { className: 'atc-node-orbit-dot', cx: 0, cy: -(radius + 5), r: 2.5 })))
        } else if (tone === 'provisioning') {
          art.push(h('circle', { key: 'dash', className: 'atc-node-dash', r: radius + 5, fill: 'none' }))
        } else if (tone === 'failed') {
          art.push(h('circle', { key: 'fail', className: 'atc-node-fail', r: radius + 5, fill: 'none' }))
        }
        art.push(h('circle', { key: 'focus', className: 'atc-focus-ring', r: radius + 10, fill: 'none' }))
        art.push(h('circle', {
          key: 'avatar',
          className: 'atc-node-avatar' + (isLead ? ' atc-node-avatar-lead' : ''),
          r: radius,
        }))
        art.push(h('text', { key: 'initial', className: 'atc-node-initial', y: 0.5 }, initialOf(name)))
        elements.push(h('g', nodeProps, art))
        elements.push(h('text', {
          key: 'name-' + index,
          className: 'atc-node-name',
          x: centerX,
          y: STAGE_NAME_Y,
        }, truncateText(name, 12)))
        elements.push(h('text', {
          key: 'stat-' + index,
          className: 'atc-node-stat',
          x: centerX,
          y: STAGE_STAT_Y,
        }, memberStatLine(stats, t)))
      }
      if (overflow > 0) {
        const centerX = startX + shown.length * step
        const overflowLabel = t('team.moreMembers', { n: overflow })
        elements.push(h('g', {
          key: 'overflow',
          className: 'atc-node atc-node-overflow',
          transform: `translate(${centerX} ${STAGE_CENTER_Y})`,
          role: 'img',
          'aria-label': overflowLabel,
        },
          h('circle', { className: 'atc-node-track', r: RADIUS_MIN + 5, fill: 'none' }),
          h('circle', { className: 'atc-node-avatar', r: RADIUS_MIN }),
          h('text', { className: 'atc-node-initial', y: 0.5 }, '+' + overflow)))
      }
      return h('div', { className: 'atc-stage' },
        h('svg', {
          className: 'atc-stage-svg',
          viewBox: `0 0 ${width} ${STAGE_HEIGHT}`,
          role: 'group',
          'aria-label': t('team.stageLabel', { n: ordered.length }),
        }, elements),
        activeMember ? h(MemberDetail, { key: 'detail', member: activeMember, stats: memberStatsFor(activeMember), t }) : null)
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
      const headingText = projectTitle + ' · ' + leadName
      return h('section', { className: 'atc-team' + (active ? ' atc-team-active' : '') },
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
        expanded
          ? h('div', { className: 'atc-team-body', id: bodyId },
            h(AgentStage, { members, t, onOpen }),
            h(TasksSummary, { team: safe, counts, t, expanded: tasksExpanded, onToggle: onToggleTasks }))
          : null)
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
      const [expandedTeams, setExpandedTeams] = React.useState({})
      const [expandedTasks, setExpandedTasks] = React.useState({})
      const projectId = effectiveProjectId(projectState, projects)
      const filtered = filterTeams(teams, projectId)
      const totals = aggregateTeams(filtered)

      let updatedLabel = t('neverUpdated')
      if (snapshot.updatedAt) updatedLabel = t('lastUpdated', { time: formatClock(snapshot.updatedAt) })
      else if (phase === 'loading') updatedLabel = t('loading')
      const canOpen = workspaceService() !== null
      const memberOpener = canOpen ? openMemberSession : null
      const busy = snapshot.refreshing || (phase === 'loading' && !data)

      const toggleTeam = (teamKey, activeDefault) => {
        setExpandedTeams((previous) => {
          const current = hasOwn(previous, teamKey) ? previous[teamKey] === true : activeDefault
          return { ...previous, [teamKey]: !current }
        })
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
            const teamKey = asString(team && team.id) || 'team-' + index
            const expanded = hasOwn(expandedTeams, teamKey) ? expandedTeams[teamKey] === true : teamActive(team)
            const tasksExpanded = hasOwn(expandedTasks, teamKey) ? expandedTasks[teamKey] === true : false
            sections.push(h(TeamSection, {
              key: teamKey,
              team,
              index,
              expanded,
              tasksExpanded,
              onToggle: () => toggleTeam(teamKey, teamActive(team)),
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
