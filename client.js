/**
 * dsh-agent-team-console — Client half (browser bundle), snapshot contract v2.
 * ============================================================================
 * Self-registering classic script loaded through window.__ModuleLoader__:
 *   - id MUST equal the package name.
 *   - only require('react') is allowed here; no @deepseek-ai/* imports.
 *   - Registers a sidebar.panellist entry (id 'team-console') and a keyed
 *     main panel (key 'team-console') that polls the Host half at
 *     GET /api/team-console/snapshot (same origin, read-only, 2s cadence).
 *   - Read-only, in-progress-first design (contract v1.1.0):
 *       header (project filter, live dot, refresh)
 *       -> compact status chip strip (in-progress / running / blocked / pending)
 *       -> per-team section (active expanded, idle collapsed): roster chips,
 *          in-progress task cards, compact pending rows, collapsed completed
 *          group, compact activity list.
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
    const ACTIVITY_LIMIT = 8
    const MEMBER_LIMIT = 8

    /* ------------------------------------------------------------------ */
    /* Locale dictionaries (zh + en, identical key sets)                   */
    /* ------------------------------------------------------------------ */

    const zh = {
      'panel.label': '团队看板',
      title: 'Agent Team 看板',
      subtitle: '按项目查看进行中的工作、成员与协作动态',
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
      'empty.body': '在会话中创建队友或共享任务后，它们会自动出现在这里；空闲的团队也会保留在列表中。本页是只读视图，不会修改任何团队状态。',
      'empty.unsupported': '当前 profile 未提供 Agent Teams 服务，因此这里不会列出任何团队。',
      'filter.label': '按项目筛选',
      'filter.all': '全部项目',
      'project.none': '未归属项目',
      'stat.inProgress': '进行中任务',
      'stat.runningMembers': '运行成员',
      'stat.blocked': '阻塞任务',
      'stat.pending': '待处理任务',
      'section.inProgress': '进行中',
      'section.pending': '待处理',
      'section.completed': '已完成',
      'section.roster': '成员',
      'section.activity': '最新动态',
      'team.idle': '空闲',
      'team.expand': '展开',
      'team.collapse': '收起',
      'team.unnamed': '未命名团队',
      'team.error': '团队数据读取失败：{message}',
      'team.members': '成员 {n}',
      'team.inProgress': '进行中 {n}',
      'team.blocked': '阻塞 {n}',
      'roster.empty': '暂无成员',
      'roster.more': '另有 {n}',
      'member.role.lead': 'Lead',
      'member.role.teammate': 'Teammate',
      'member.status.running': '运行中',
      'member.status.inactive': '未运行',
      'member.status.provisioning': '准备中',
      'member.status.failed': '失败',
      'member.open': '打开成员会话',
      'status.pending': '待处理',
      'status.in_progress': '进行中',
      'status.completed': '已完成',
      'task.owner': '负责人：{name}',
      'task.unowned': '未分配',
      'task.ready': '可开始',
      'task.blocked': '被依赖阻塞',
      'task.blockedBy': '被 {ids} 阻塞',
      'task.scopesLabel': '写入范围',
      'task.expand': '展开说明',
      'task.collapse': '收起说明',
      'tasks.empty': '还没有共享任务',
      'tasks.noInProgress': '暂无进行中的任务',
      'tasks.completedCount': '已完成 {n}',
      'tasks.completedToggle': '展开或收起已完成任务',
      'activity.empty': '暂无最近动态',
      'activity.unknown': '未知动态',
      'action.spawn': '创建',
      'action.create': '创建',
      'action.claim': '认领',
      'action.complete': '完成',
      'action.update': '更新',
      'action.release': '释放',
      'action.assign': '分配',
      'action.delete': '删除',
      'action.start': '开始',
      'action.fail': '失败',
      'action.reopen': '重新打开',
      'time.justNow': '刚刚',
      'time.seconds': '{n} 秒前',
      'time.minutes': '{n} 分钟前',
      'time.hours': '{n} 小时前',
      'time.days': '{n} 天前',
    }

    const en = {
      'panel.label': 'Team console',
      title: 'Agent Team Console',
      subtitle: 'In-progress work, members, and activity by project',
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
      'empty.body': 'Teammates and shared tasks appear here automatically once you spawn them in a conversation; idle teams stay listed too. This page is read-only and never changes team state.',
      'empty.unsupported': 'The current profile does not provide the Agent Teams service, so no teams can be listed.',
      'filter.label': 'Filter by project',
      'filter.all': 'All projects',
      'project.none': 'No project',
      'stat.inProgress': 'In-progress tasks',
      'stat.runningMembers': 'Running members',
      'stat.blocked': 'Blocked tasks',
      'stat.pending': 'Pending tasks',
      'section.inProgress': 'In progress',
      'section.pending': 'Pending',
      'section.completed': 'Completed',
      'section.roster': 'Members',
      'section.activity': 'Recent activity',
      'team.idle': 'Idle',
      'team.expand': 'Expand',
      'team.collapse': 'Collapse',
      'team.unnamed': 'Unnamed team',
      'team.error': 'Team data could not be read: {message}',
      'team.members': '{n} members',
      'team.inProgress': '{n} in progress',
      'team.blocked': '{n} blocked',
      'roster.empty': 'No members',
      'roster.more': '{n} more',
      'member.role.lead': 'Lead',
      'member.role.teammate': 'Teammate',
      'member.status.running': 'Running',
      'member.status.inactive': 'Idle',
      'member.status.provisioning': 'Provisioning',
      'member.status.failed': 'Failed',
      'member.open': 'Open member conversation',
      'status.pending': 'Pending',
      'status.in_progress': 'In progress',
      'status.completed': 'Completed',
      'task.owner': 'Owner: {name}',
      'task.unowned': 'Unassigned',
      'task.ready': 'Ready',
      'task.blocked': 'Blocked by dependencies',
      'task.blockedBy': 'Blocked by {ids}',
      'task.scopesLabel': 'Write scopes',
      'task.expand': 'Show description',
      'task.collapse': 'Hide description',
      'tasks.empty': 'No shared tasks yet',
      'tasks.noInProgress': 'No task in progress',
      'tasks.completedCount': 'Completed {n}',
      'tasks.completedToggle': 'Expand or collapse completed tasks',
      'activity.empty': 'No recent activity',
      'activity.unknown': 'Unknown activity',
      'action.spawn': 'spawned',
      'action.create': 'created',
      'action.claim': 'claimed',
      'action.complete': 'completed',
      'action.update': 'updated',
      'action.release': 'released',
      'action.assign': 'assigned',
      'action.delete': 'deleted',
      'action.start': 'started',
      'action.fail': 'failed',
      'action.reopen': 'reopened',
      'time.justNow': 'just now',
      'time.seconds': '{n}s ago',
      'time.minutes': '{n}m ago',
      'time.hours': '{n}h ago',
      'time.days': '{n}d ago',
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

    function formatShortDate(ts) {
      const value = asNumber(ts)
      if (value === null) return '—'
      try {
        return new Date(value).toLocaleString(languageTag(), {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      } catch (error) {
        return new Date(value).toISOString().slice(5, 16).replace('T', ' ')
      }
    }

    function formatRelative(ts, t) {
      const value = asNumber(ts)
      if (value === null) return '—'
      const diffMs = Date.now() - value
      if (diffMs < 0) return t('time.justNow')
      const seconds = Math.floor(diffMs / 1000)
      if (seconds < 5) return t('time.justNow')
      if (seconds < 60) return t('time.seconds', { n: seconds })
      const minutes = Math.floor(seconds / 60)
      if (minutes < 60) return t('time.minutes', { n: minutes })
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return t('time.hours', { n: hours })
      const days = Math.floor(hours / 24)
      if (days < 7) return t('time.days', { n: days })
      return formatShortDate(value)
    }

    function pathBasename(path) {
      const raw = asString(path).replace(/[\\/]+$/, '')
      if (!raw) return ''
      const parts = raw.split(/[\\/]+/)
      return parts[parts.length - 1] || raw
    }

    function actionLabel(action, t) {
      const raw = asString(action)
      if (!raw) return ''
      const key = 'action.' + raw
      return hasKey(key) ? t(key) : raw
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
    /* Snapshot aggregation helpers (defensive about every field)          */
    /*                                                                     */
    /* Contract v2 semantics used below:                                   */
    /*   - team.active === true when the team has provisioning/running     */
    /*     members or in-progress tasks (host-computed, derived as a       */
    /*     fallback for older snapshots).                                  */
    /*   - member.active === running || provisioning; task.active ===      */
    /*     status in_progress.                                             */
    /*   - counts.idle = inactive members, counts.ready = ready pending    */
    /*     tasks.                                                          */
    /* ------------------------------------------------------------------ */

    function teamCounts(team) {
      const counts = team && typeof team.counts === 'object' && team.counts ? team.counts : {}
      const members = asArray(team && team.members)
      const tasks = asArray(team && team.tasks)
      const membersBy = (status) => members.filter((member) => asString(member && member.status) === status).length
      const tasksBy = (status) => tasks.filter((task) => asString(task && task.status) === status).length
      const blockedTasks = tasks.filter((task) => (
        asString(task && task.status) !== 'completed' && asArray(task && task.blockedBy).length > 0
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
      const totals = { teams: 0, activeTeams: 0 }
      for (const key of TOTALS_KEYS) totals[key] = 0
      for (const team of asArray(teams)) {
        const counts = teamCounts(team)
        totals.teams += 1
        if (teamActiveFromCounts(team, counts)) totals.activeTeams += 1
        for (const key of TOTALS_KEYS) totals[key] += counts[key]
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

    function teamLatestTime(team) {
      let latest = null
      for (const member of asArray(team && team.members)) {
        const value = asNumber(member && member.lastActivityAt)
        if (value !== null && (latest === null || value > latest)) latest = value
      }
      for (const item of asArray(team && team.activity)) {
        const value = asNumber(item && item.time)
        if (value !== null && (latest === null || value > latest)) latest = value
      }
      return latest
    }

    function memberRank(member) {
      const status = asString(member && member.status)
      if (status === 'running' || status === 'provisioning') return 0
      if (status === 'inactive') return 1
      if (status === 'failed') return 2
      return 3
    }

    /** Stable active-first ordering: running/provisioning, idle, failed. */
    function sortMembers(members) {
      return asArray(members)
        .map((member, index) => ({ member, index }))
        .sort((left, right) => (memberRank(left.member) - memberRank(right.member)) || (left.index - right.index))
        .map((entry) => entry.member)
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
.atc-team-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;width:100%;padding:8px 12px;border:0;border-radius:10px;background:none;text-align:left;cursor:pointer;}
.atc-team-head:hover{background:var(--dsw-alias-bg-layer-2);}
.atc-team-head:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px;}
.atc-team-lead{min-width:0;font-size:13px;line-height:18px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.atc-team-role{font-size:10px;line-height:14px;letter-spacing:0.05em;text-transform:uppercase;color:var(--dsw-alias-label-secondary);}
.atc-headstat{font-size:11.5px;line-height:16px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap;}
.atc-headstat-inprogress{color:var(--dsw-alias-brand-primary);font-weight:500;}
.atc-headstat-zero{color:var(--dsw-alias-label-secondary);font-weight:400;}
.atc-headstat-blocked{color:var(--dsw-alias-state-warn-primary);}
.atc-team-last{margin-left:auto;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap;}
.atc-team-error{padding:5px 12px;border-top:1px solid var(--dsw-alias-border-l1);font-size:11.5px;line-height:16px;color:var(--dsw-alias-state-warn-primary);word-break:break-word;}
.atc-team-body{display:flex;flex-direction:column;gap:10px;padding:2px 12px 12px;}
.atc-caret{display:inline-block;width:6px;height:6px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);transition:transform 120ms ease;flex:none;}
.atc-caret-open{transform:rotate(45deg);}
.atc-chip{display:inline-flex;align-items:center;max-width:220px;padding:1px 7px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.atc-chip-idle{color:var(--dsw-alias-label-secondary);}
.atc-chip-owner{color:var(--dsw-alias-label-primary);}
.atc-project-chip{max-width:180px;color:var(--dsw-alias-label-primary);}
.atc-roster{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-width:0;}
.atc-member{display:inline-flex;align-items:center;gap:6px;max-width:100%;min-width:0;padding:3px 9px 3px 4px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-base);font-size:12px;line-height:16px;text-align:left;color:var(--dsw-alias-label-primary);}
.atc-member-clickable{cursor:pointer;}
.atc-member-clickable:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2);}
.atc-member-clickable:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;}
.atc-member-idle{opacity:0.66;}
.atc-member-failed{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 40%,var(--dsw-alias-border-l1));}
.atc-avatar{display:inline-flex;align-items:center;justify-content:center;flex:none;width:18px;height:18px;border-radius:50%;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:10px;line-height:1;font-weight:600;text-transform:uppercase;}
.atc-avatar-lead{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-brand-primary);}
.atc-member-name{max-width:160px;font-size:12px;line-height:16px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.atc-member-role{font-size:10px;line-height:12px;letter-spacing:0.05em;text-transform:uppercase;color:var(--dsw-alias-label-secondary);}
.atc-mstatus{display:inline-flex;align-items:center;gap:4px;font-size:11px;line-height:14px;color:var(--dsw-alias-label-secondary);}
.atc-mdot{width:6px;height:6px;border-radius:50%;background:currentColor;flex:none;}
.atc-mstatus-running{color:var(--dsw-alias-state-success-primary);}
.atc-mstatus-provisioning{color:var(--dsw-alias-state-warn-primary);}
.atc-mstatus-failed{color:var(--dsw-alias-state-error-primary);}
.atc-mstatus-inactive{color:var(--dsw-alias-state-idle-primary);}
.atc-member-more{color:var(--dsw-alias-label-secondary);}
.atc-tasks{display:flex;flex-direction:column;gap:5px;min-width:0;}
.atc-subhead{display:flex;align-items:center;gap:6px;margin:0;padding:0;font-size:12px;line-height:16px;font-weight:600;color:var(--dsw-alias-label-secondary);}
.atc-subhead-inprogress{color:var(--dsw-alias-label-primary);}
.atc-subhead-title{white-space:nowrap;}
.atc-subhead-rule{flex:1;height:1px;min-width:8px;background:var(--dsw-alias-border-l1);}
.atc-subhead-btn{width:100%;padding:2px 0;border:0;background:none;text-align:left;cursor:pointer;border-radius:6px;}
.atc-subhead-btn:hover{color:var(--dsw-alias-label-primary);}
.atc-subhead-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;}
.atc-subhead-hint{font-size:11px;font-weight:400;color:var(--dsw-alias-label-secondary);white-space:nowrap;}
.atc-count{display:inline-flex;align-items:center;justify-content:center;min-width:18px;padding:1px 6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;font-weight:500;font-variant-numeric:tabular-nums;}
.atc-progress{display:flex;flex-direction:column;gap:6px;}
.atc-icard{display:flex;flex-direction:column;gap:5px;min-width:0;padding:9px 11px;border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 26%,var(--dsw-alias-border-l1));border-left:2px solid var(--dsw-alias-brand-primary);border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 4%,var(--dsw-alias-bg-layer-1));}
.atc-icard-top{display:flex;align-items:flex-start;gap:7px;min-width:0;}
.atc-icard-top .atc-dot{margin-top:5px;}
.atc-icard-subject{flex:1;min-width:0;margin:0;font-size:13px;line-height:18px;font-weight:600;word-break:break-word;}
.atc-task-id{max-width:150px;font-size:10.5px;line-height:16px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.atc-meta{display:flex;flex-wrap:wrap;align-items:center;gap:5px;min-width:0;}
.atc-icard-desc{display:-webkit-box;margin:0;font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary);-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;}
.atc-icard-desc-open{display:block;overflow:visible;-webkit-line-clamp:unset;}
.atc-expand{align-self:flex-start;padding:0;border:0;background:none;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;cursor:pointer;}
.atc-expand:hover{color:var(--dsw-alias-label-primary);}
.atc-expand:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:4px;}
.atc-diagnostics{display:flex;flex-direction:column;gap:2px;}
.atc-diagnostic{margin:0;font-size:11px;line-height:16px;color:var(--dsw-alias-state-error-primary);word-break:break-word;}
.atc-rows{display:flex;flex-direction:column;margin:0;padding:0;}
.atc-row{display:flex;align-items:center;gap:8px;min-width:0;padding:3px 2px;font-size:12px;line-height:18px;}
.atc-row + .atc-row{border-top:1px solid var(--dsw-alias-border-l1);}
.atc-row-dot{width:6px;height:6px;}
.atc-row-subject{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.atc-row-owner{flex:none;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);white-space:nowrap;}
.atc-row-mark{flex:none;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);white-space:nowrap;}
.atc-row-mark-warn{color:var(--dsw-alias-state-warn-primary);}
.atc-rows-dim .atc-row{opacity:0.62;}
.atc-empty-line{padding:2px;font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary);}
.atc-activity{display:flex;flex-direction:column;gap:3px;min-width:0;}
.atc-minihead{margin:0;font-size:11px;line-height:15px;font-weight:600;color:var(--dsw-alias-label-secondary);}
.atc-act{display:flex;flex-direction:column;min-width:0;}
.atc-act-row{display:flex;align-items:baseline;gap:8px;min-width:0;padding:1px 0;font-size:11.5px;line-height:16px;}
.atc-act-time{flex:none;width:64px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-secondary);}
.atc-act-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);}
.atc-skel{display:flex;flex-direction:column;gap:10px;animation:atc-breathe 1.6s ease-in-out infinite;}
.atc-skel-strip{height:36px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);}
.atc-skel-panel{height:132px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);}
.atc-skel-panel-short{height:84px;}
.atc-sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;}
@keyframes atc-pulse{0%,100%{opacity:1;}50%{opacity:0.35;}}
@keyframes atc-rotate{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
@keyframes atc-breathe{0%,100%{opacity:1;}50%{opacity:0.55;}}
@media (max-width:899px){
.atc-page{padding:14px 14px 32px;gap:12px;}
.atc-header-side{width:100%;}
.atc-select{max-width:100%;}
.atc-team-last{margin-left:0;}
.atc-act-time{width:56px;}
}
@media (prefers-reduced-motion:reduce){
.atc-pulse,.atc-spin,.atc-skel{animation:none !important;}
.atc-caret{transition:none !important;}
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

    const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect

    /* ------------------------------------------------------------------ */
    /* Small presentational components                                     */
    /* ------------------------------------------------------------------ */

    function StatusStrip({ totals, t }) {
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
        h('div', { className: 'atc-skel-panel' }),
        h('div', { className: 'atc-skel-panel atc-skel-panel-short' }))
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
    /* Roster: compact active-first member chips                           */
    /* ------------------------------------------------------------------ */

    function MemberChip({ member, t, onOpen }) {
      const safe = member && typeof member === 'object' ? member : {}
      const id = asString(safe.id)
      const name = asString(safe.name) || '—'
      const role = asString(safe.role)
      const status = asString(safe.status) || 'inactive'
      const tone = memberStatusTone(status)
      const statusLabel = memberStatusLabel(status, t)
      const roleLabel = memberRoleLabel(role, t)
      const initial = Array.from(name.trim())[0] || '?'
      const model = asString(safe.model)
      const provider = asString(safe.provider)
      const lastActivityAt = asNumber(safe.lastActivityAt)
      const titleParts = []
      if (model) titleParts.push(model)
      if (provider && provider !== model) titleParts.push(provider)
      if (lastActivityAt !== null) titleParts.push(formatRelative(lastActivityAt, t))
      const title = titleParts.length ? titleParts.join(' · ') : statusLabel
      const clickable = typeof onOpen === 'function' && id !== ''
      const tag = clickable ? 'button' : 'span'
      const props = {
        className: 'atc-member'
          + (clickable ? ' atc-member-clickable' : '')
          + (tone === 'inactive' ? ' atc-member-idle' : '')
          + (tone === 'failed' ? ' atc-member-failed' : ''),
        title,
      }
      if (clickable) {
        props.type = 'button'
        props['aria-label'] = [name, roleLabel, statusLabel, t('member.open')].filter(Boolean).join(' · ')
        props.onClick = () => onOpen(id)
      }
      return h(tag, props,
        h('span', { className: 'atc-avatar' + (role === 'lead' ? ' atc-avatar-lead' : ''), 'aria-hidden': 'true' }, initial),
        h('span', { className: 'atc-member-name' }, name),
        h('span', { className: 'atc-member-role' }, roleLabel),
        h('span', { className: 'atc-mstatus atc-mstatus-' + tone },
          h('span', {
            className: 'atc-mdot' + ((tone === 'running' || tone === 'provisioning') ? ' atc-pulse' : ''),
            'aria-hidden': 'true',
          }),
          statusLabel))
    }

    function Roster({ members, t, onOpen }) {
      const list = asArray(members)
      if (list.length === 0) return h('div', { className: 'atc-empty-line' }, t('roster.empty'))
      const visible = list.slice(0, MEMBER_LIMIT)
      const hidden = list.length - visible.length
      return h('div', { className: 'atc-roster', role: 'group', 'aria-label': t('section.roster') },
        visible.map((member, index) => h(MemberChip, {
          key: asString(member && member.id) || 'member-' + index,
          member,
          t,
          onOpen,
        })),
        hidden > 0 ? h('span', { className: 'atc-chip atc-member-more' }, t('roster.more', { n: hidden })) : null)
    }

    /* ------------------------------------------------------------------ */
    /* Tasks: in-progress cards first, compact pending/completed rows      */
    /* ------------------------------------------------------------------ */

    /**
     * A task is only "blocked" while it is still pending and the runtime reports
     * it as not ready. `ready` is derived from completed blockers, and the
     * runtime retains `blockedBy` after a blocker completes, so the dependency
     * list alone is not a blocking signal. In-progress tasks always carry
     * `ready === false` by contract, so they are claimed work, never blocked:
     * only pending rows may render a blocked marker.
     */
    function pendingBlockedMarker(task, t) {
      const safe = task && typeof task === 'object' ? task : {}
      if (asString(safe.status) !== 'pending' || safe.ready !== false) return { text: '', blocked: false }
      const blockedBy = asArray(safe.blockedBy).map(asString).filter(Boolean)
      return {
        text: blockedBy.length > 0 ? t('task.blockedBy', { ids: blockedBy.join(', ') }) : t('task.blocked'),
        blocked: true,
      }
    }

    function InProgressCard({ task, t }) {
      const [expanded, setExpanded] = React.useState(false)
      const [clamped, setClamped] = React.useState(false)
      const textRef = React.useRef(null)
      const safe = task && typeof task === 'object' ? task : {}
      const description = asString(safe.description)
      const subject = asString(safe.subject) || asString(safe.id) || '—'
      const taskId = asString(safe.id)
      const ownerName = asString(safe.ownerName)
      const writeScopes = asArray(safe.writeScopes).map(asString).filter(Boolean)
      const writeWarnings = asArray(safe.writeScopeWarnings).map(asString).filter(Boolean)

      useIsomorphicLayoutEffect(() => {
        if (expanded || !description) {
          setClamped(false)
          return undefined
        }
        const node = textRef.current
        if (!node) return undefined
        const measure = () => {
          try {
            setClamped(node.scrollHeight > node.clientHeight + 1)
          } catch (error) {
            /* measurement is cosmetic */
          }
        }
        measure()
        if (typeof ResizeObserver === 'undefined') return undefined
        let observer = null
        try {
          observer = new ResizeObserver(measure)
          observer.observe(node)
        } catch (error) {
          observer = null
        }
        return () => {
          if (observer) {
            try {
              observer.disconnect()
            } catch (error) {
              /* ignore */
            }
          }
        }
      }, [description, expanded])

      return h('article', { className: 'atc-icard' },
        h('div', { className: 'atc-icard-top' },
          h('span', { className: 'atc-dot atc-dot-brand', title: t('status.in_progress'), 'aria-hidden': 'true' }),
          h('h4', { className: 'atc-icard-subject' }, subject),
          taskId ? h('span', { className: 'atc-task-id', title: taskId }, taskId) : null),
        h('div', { className: 'atc-meta' },
          h('span', { className: 'atc-chip atc-chip-owner', title: t('task.owner', { name: ownerName || t('task.unowned') }) },
            '@' + (ownerName || t('task.unowned'))),
          writeScopes.map((scope, index) => h('span', {
            className: 'atc-chip',
            key: 'scope-' + index,
            title: t('task.scopesLabel') + ': ' + scope,
          }, scope))),
        writeWarnings.length
          ? h('div', { className: 'atc-diagnostics' },
            writeWarnings.map((warning, index) => h('p', { className: 'atc-diagnostic', key: 'warning-' + index }, warning)))
          : null,
        description
          ? h('p', { ref: textRef, className: 'atc-icard-desc' + (expanded ? ' atc-icard-desc-open' : '') }, description)
          : null,
        description && (clamped || expanded)
          ? h('button', {
            type: 'button',
            className: 'atc-expand',
            'aria-expanded': expanded,
            onClick: () => setExpanded((value) => !value),
          }, t(expanded ? 'task.collapse' : 'task.expand'))
          : null)
    }

    function PendingRow({ task, t }) {
      const safe = task && typeof task === 'object' ? task : {}
      const subject = asString(safe.subject) || asString(safe.id) || '—'
      const ownerName = asString(safe.ownerName)
      const description = asString(safe.description)
      const blocked = pendingBlockedMarker(safe, t)
      // A ready pending task wins over a retained blockedBy list (completed blockers).
      const marker = blocked.blocked ? blocked.text : (safe.ready === true ? t('task.ready') : '')
      const markerWarn = blocked.blocked
      return h('div', { className: 'atc-row', role: 'listitem', title: description || undefined },
        h('span', {
          className: 'atc-dot atc-row-dot' + (markerWarn ? ' atc-dot-warn' : ''),
          title: t('status.pending'),
          'aria-hidden': 'true',
        }),
        h('span', { className: 'atc-row-subject' }, subject),
        h('span', { className: 'atc-row-owner' }, ownerName ? '@' + ownerName : t('task.unowned')),
        marker ? h('span', { className: 'atc-row-mark' + (markerWarn ? ' atc-row-mark-warn' : '') }, marker) : null)
    }

    function CompletedRow({ task, t }) {
      const safe = task && typeof task === 'object' ? task : {}
      const subject = asString(safe.subject) || asString(safe.id) || '—'
      const ownerName = asString(safe.ownerName)
      return h('div', { className: 'atc-row', role: 'listitem' },
        h('span', { className: 'atc-dot atc-dot-success', title: t('status.completed'), 'aria-hidden': 'true' }),
        h('span', { className: 'atc-row-subject' }, subject),
        h('span', { className: 'atc-row-owner' }, ownerName ? '@' + ownerName : t('task.unowned')))
    }

    function TasksSection({ team, t, completedOpen, onToggleCompleted }) {
      const tasks = asArray(team && team.tasks)
      const inProgress = tasks.filter((task) => asString(task && task.status) === 'in_progress')
      const pending = tasks.filter((task) => asString(task && task.status) === 'pending')
      const completed = tasks.filter((task) => asString(task && task.status) === 'completed')
      const blocks = []
      blocks.push(h('section', { key: 'inprogress', className: 'atc-tasks', 'aria-label': t('section.inProgress') },
        h('h3', { className: 'atc-subhead atc-subhead-inprogress' },
          h('span', { className: 'atc-subhead-title' }, t('section.inProgress')),
          h('span', { className: 'atc-count' }, String(inProgress.length)),
          h('span', { className: 'atc-subhead-rule', 'aria-hidden': 'true' })),
        inProgress.length
          ? h('div', { className: 'atc-progress' }, inProgress.map((task, index) => h(InProgressCard, {
            key: asString(task && task.id) || 'task-' + index,
            task,
            t,
          })))
          : h('div', { className: 'atc-empty-line' }, tasks.length === 0 ? t('tasks.empty') : t('tasks.noInProgress'))))
      if (pending.length > 0) {
        blocks.push(h('section', { key: 'pending', className: 'atc-tasks', 'aria-label': t('section.pending') },
          h('h3', { className: 'atc-subhead' },
            h('span', { className: 'atc-subhead-title' }, t('section.pending')),
            h('span', { className: 'atc-count' }, String(pending.length)),
            h('span', { className: 'atc-subhead-rule', 'aria-hidden': 'true' })),
          h('div', { className: 'atc-rows', role: 'list' }, pending.map((task, index) => h(PendingRow, {
            key: asString(task && task.id) || 'task-pending-' + index,
            task,
            t,
          })))))
      }
      if (completed.length > 0) {
        blocks.push(h('div', { key: 'completed', className: 'atc-tasks' },
          h('button', {
            type: 'button',
            className: 'atc-subhead atc-subhead-btn',
            'aria-expanded': completedOpen,
            'aria-label': t('tasks.completedToggle'),
            onClick: onToggleCompleted,
          },
            h('span', { className: 'atc-caret' + (completedOpen ? ' atc-caret-open' : ''), 'aria-hidden': 'true' }),
            h('span', { className: 'atc-subhead-title' }, t('tasks.completedCount', { n: completed.length })),
            h('span', { className: 'atc-subhead-rule', 'aria-hidden': 'true' }),
            h('span', { className: 'atc-subhead-hint' }, t(completedOpen ? 'team.collapse' : 'team.expand'))),
          completedOpen
            ? h('div', {
              className: 'atc-rows atc-rows-dim',
              role: 'list',
              'aria-label': t('section.completed'),
            }, completed.map((task, index) => h(CompletedRow, {
              key: asString(task && task.id) || 'task-completed-' + index,
              task,
              t,
            })))
            : null))
      }
      return h(React.Fragment, null, blocks)
    }

    /* ------------------------------------------------------------------ */
    /* Activity: compact list, latest entries first                        */
    /* ------------------------------------------------------------------ */

    function ActivityRow({ item, t }) {
      const kind = asString(item && item.kind)
      const fallbackText = asString(item && item.text)
      const taskId = asString(item && item.taskId)
      const memberName = asString(item && item.memberName)
      const subject = asString(item && item.subject)
      const actionText = actionLabel(item && item.action, t)
      const parts = []
      if (taskId) parts.push(taskId)
      if (actionText) parts.push(actionText)
      if (memberName) parts.push(memberName)
      const composed = (kind === 'task' || kind === 'member') && parts.length > 0
      const main = composed ? parts.join(' · ') : (fallbackText || actionText || subject || t('activity.unknown'))
      const secondary = subject && subject !== main ? subject : ''
      const absolute = asNumber(item && item.time) !== null ? formatShortDate(item && item.time) : ''
      const rowTitle = [secondary, absolute].filter(Boolean).join(' · ')
      return h('div', { className: 'atc-act-row', title: rowTitle || undefined },
        h('span', { className: 'atc-act-time', title: absolute || undefined }, formatRelative(item && item.time, t)),
        h('span', { className: 'atc-act-text', title: secondary || undefined }, main))
    }

    function ActivityList({ team, t }) {
      const items = asArray(team && team.activity).slice(0, ACTIVITY_LIMIT)
      return h('section', { className: 'atc-activity', 'aria-label': t('section.activity') },
        h('h3', { className: 'atc-minihead' }, t('section.activity')),
        items.length
          ? h('div', { className: 'atc-act' }, items.map((item, index) => h(ActivityRow, {
            key: (asString(item && item.seq) || 'activity') + '-' + index,
            item,
            t,
          })))
          : h('div', { className: 'atc-empty-line' }, t('activity.empty')))
    }

    /* ------------------------------------------------------------------ */
    /* Team section: collapsible header + body                             */
    /* ------------------------------------------------------------------ */

    function TeamSection({ team, index, expanded, completedOpen, onToggle, onToggleCompleted, onOpen, t }) {
      const safe = team && typeof team === 'object' ? team : {}
      const counts = teamCounts(safe)
      const active = teamActiveFromCounts(safe, counts)
      const project = teamProject(safe)
      const projectTitle = project ? projectLabel(project, t) : ''
      const members = sortMembers(asArray(safe.members))
      const lead = asArray(safe.members).find((member) => asString(member && member.role) === 'lead') || members[0] || null
      const leadName = lead ? (asString(lead.name) || t('team.unnamed')) : t('team.unnamed')
      const leadRole = lead ? memberRoleLabel(lead.role, t) : ''
      const lastActivity = formatRelative(teamLatestTime(safe), t)
      const errorMessage = asString(safe.error)
      const memberBusy = counts.running + counts.provisioning > 0
      let dotClass = 'atc-dot-idle'
      if (memberBusy) dotClass = 'atc-dot-success atc-pulse'
      else if (counts.inProgress > 0) dotClass = 'atc-dot-brand'
      const bodyId = 'atc-team-body-' + index
      const headingText = projectTitle ? projectTitle + ' · ' + leadName : leadName
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
          h('span', { className: 'atc-dot ' + dotClass, 'aria-hidden': 'true' }),
          projectTitle ? h('span', {
            className: 'atc-chip atc-project-chip',
            title: project && project.path ? project.path : projectTitle,
          }, projectTitle) : null,
          h('span', { className: 'atc-team-lead' }, leadName),
          leadRole ? h('span', { className: 'atc-team-role' }, leadRole) : null,
          active ? null : h('span', { className: 'atc-chip atc-chip-idle' }, t('team.idle')),
          h('span', {
            className: 'atc-headstat atc-headstat-inprogress' + (counts.inProgress === 0 ? ' atc-headstat-zero' : ''),
          }, t('team.inProgress', { n: counts.inProgress })),
          h('span', { className: 'atc-headstat' }, t('team.members', { n: counts.members })),
          counts.blocked > 0 ? h('span', { className: 'atc-headstat atc-headstat-blocked' }, t('team.blocked', { n: counts.blocked })) : null,
          h('span', { className: 'atc-team-last' }, lastActivity),
          h('span', { className: 'atc-caret' + (expanded ? ' atc-caret-open' : ''), 'aria-hidden': 'true' }),
          h('span', { className: 'atc-sr-only' }, t(expanded ? 'team.collapse' : 'team.expand'))),
        errorMessage ? h('div', { className: 'atc-team-error', role: 'alert' }, t('team.error', { message: errorMessage })) : null,
        expanded
          ? h('div', { className: 'atc-team-body', id: bodyId },
            h(Roster, { members, t, onOpen }),
            h(TasksSection, { team: safe, t, completedOpen, onToggleCompleted }),
            h(ActivityList, { team: safe, t }))
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
      const [completedTeams, setCompletedTeams] = React.useState({})
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
      const toggleCompleted = (teamKey) => {
        setCompletedTeams((previous) => ({ ...previous, [teamKey]: !previous[teamKey] }))
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
            const completedOpen = hasOwn(completedTeams, teamKey) ? completedTeams[teamKey] === true : false
            sections.push(h(TeamSection, {
              key: teamKey,
              team,
              index,
              expanded,
              completedOpen,
              onToggle: () => toggleTeam(teamKey, teamActive(team)),
              onToggleCompleted: () => toggleCompleted(teamKey),
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
