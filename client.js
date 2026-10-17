/**
 * dsh-agent-team-console — Client half (browser bundle).
 * ============================================================================
 * Self-registering classic script loaded through window.__ModuleLoader__:
 *   - id MUST equal the package name.
 *   - only require('react') is allowed here; no @deepseek-ai/* imports.
 *   - Registers a sidebar.panellist entry (id 'team-console') and a keyed
 *     main panel (key 'team-console') that polls the Host half at
 *     GET /api/team-console/snapshot (same origin, read-only, 2s cadence).
 *   - All copy is bilingual through the Client locale service under the
 *     namespace 'agent-team-console' (zh + en kept in sync).
 *   - Colors/borders/backgrounds come exclusively from --dsw-alias-* theme
 *     tokens; the single <style> element lives in the Panel render so it is
 *     disposed together with the panel.
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
    const ACTIVITY_LIMIT = 12

    /* ------------------------------------------------------------------ */
    /* Locale dictionaries (zh + en, identical key sets)                   */
    /* ------------------------------------------------------------------ */

    const zh = {
      'panel.label': '团队看板',
      title: 'Agent Team 看板',
      subtitle: '实时查看成员状态、共享任务板与协作动态',
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
      'empty.body': '在会话中创建队友或共享任务后，它们会自动出现在这里。本页是只读视图，不会修改任何团队状态。',
      'empty.unsupported': '当前 profile 未提供 Agent Teams 服务，因此这里不会列出任何团队。',
      'kpi.members': '团队成员',
      'kpi.membersContext': '{running}/{total} 运行中',
      'kpi.tasks': '共享任务',
      'kpi.tasksContext': '{completed}/{total} 已完成',
      'kpi.inProgress': '进行中',
      'kpi.inProgressContext': '正在执行的任务',
      'kpi.blocked': '阻塞',
      'kpi.blockedContext': '等待依赖或未就绪',
      'section.team': '团队',
      'section.roster': '成员',
      'section.tasks': '共享任务',
      'section.activity': '最新动态',
      'team.summary': '{name} · {id} · {updated}',
      'team.idUpdated': '{id} · {updated}',
      'team.unnamed': '未命名团队',
      'team.error': '团队数据读取失败：{message}',
      'roster.empty': '暂无成员',
      'tasks.empty': '还没有共享任务',
      'activity.empty': '暂无最近动态',
      'activity.unknown': '未知动态',
      'context.fresh': '全新上下文',
      'context.fork': '继承上下文',
      'member.role.lead': 'Lead',
      'member.role.teammate': 'Teammate',
      'member.status.running': '运行中',
      'member.status.inactive': '未运行',
      'member.status.provisioning': '准备中',
      'member.status.failed': '失败',
      'member.open': '打开成员会话',
      'member.lastActive': '{time} · {event}',
      'member.noActivity': '暂无活动记录',
      'member.diagnostics': '诊断信息',
      'status.pending': '待处理',
      'status.in_progress': '进行中',
      'status.completed': '已完成',
      'task.col.pending': '待办',
      'task.col.inProgress': '进行中',
      'task.col.completed': '已完成',
      'task.owner': '负责人：{name}',
      'task.unowned': '未分配',
      'task.ready': '可开始',
      'task.blocked': '被依赖阻塞',
      'task.blockedBy': '被 {ids} 阻塞',
      'task.scopesLabel': '写入范围',
      'task.expand': '展开说明',
      'task.collapse': '收起说明',
      'task.emptyColumn': '暂无任务',
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
      subtitle: 'Live roster, shared task board, and collaboration activity',
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
      'empty.body': 'Teammates and shared tasks appear here automatically once you spawn them in a conversation. This page is read-only and never changes team state.',
      'empty.unsupported': 'The current profile does not provide the Agent Teams service, so no teams can be listed.',
      'kpi.members': 'Team members',
      'kpi.membersContext': '{running}/{total} running',
      'kpi.tasks': 'Shared tasks',
      'kpi.tasksContext': '{completed}/{total} completed',
      'kpi.inProgress': 'In progress',
      'kpi.inProgressContext': 'Tasks being worked on',
      'kpi.blocked': 'Blocked',
      'kpi.blockedContext': 'Waiting on dependencies',
      'section.team': 'Team',
      'section.roster': 'Members',
      'section.tasks': 'Shared tasks',
      'section.activity': 'Recent activity',
      'team.summary': '{name} · {id} · {updated}',
      'team.idUpdated': '{id} · {updated}',
      'team.unnamed': 'Unnamed team',
      'team.error': 'Team data could not be read: {message}',
      'roster.empty': 'No members',
      'tasks.empty': 'No shared tasks yet',
      'activity.empty': 'No recent activity',
      'activity.unknown': 'Unknown activity',
      'context.fresh': 'Fresh context',
      'context.fork': 'Forked context',
      'member.role.lead': 'Lead',
      'member.role.teammate': 'Teammate',
      'member.status.running': 'Running',
      'member.status.inactive': 'Idle',
      'member.status.provisioning': 'Provisioning',
      'member.status.failed': 'Failed',
      'member.open': 'Open member conversation',
      'member.lastActive': '{time} · {event}',
      'member.noActivity': 'No activity yet',
      'member.diagnostics': 'Diagnostics',
      'status.pending': 'Pending',
      'status.in_progress': 'In progress',
      'status.completed': 'Completed',
      'task.col.pending': 'To do',
      'task.col.inProgress': 'In progress',
      'task.col.completed': 'Done',
      'task.owner': 'Owner: {name}',
      'task.unowned': 'Unassigned',
      'task.ready': 'Ready',
      'task.blocked': 'Blocked by dependencies',
      'task.blockedBy': 'Blocked by {ids}',
      'task.scopesLabel': 'Write scopes',
      'task.expand': 'Show description',
      'task.collapse': 'Hide description',
      'task.emptyColumn': 'No tasks',
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

    function actionLabel(action, t) {
      const raw = asString(action)
      if (!raw) return ''
      const key = 'action.' + raw
      return hasKey(key) ? t(key) : raw
    }

    function taskStatusLabel(status, t) {
      const raw = asString(status)
      const key = 'status.' + raw
      return raw && hasKey(key) ? t(key) : raw || '—'
    }

    function memberStatusLabel(status, t) {
      const raw = asString(status)
      const key = 'member.status.' + raw
      return raw && hasKey(key) ? t(key) : raw || '—'
    }

    function memberContextLabel(context, t) {
      const raw = asString(context)
      if (raw === 'fresh') return t('context.fresh')
      if (raw === 'fork') return t('context.fork')
      return raw
    }

    /* ------------------------------------------------------------------ */
    /* Snapshot aggregation helpers (defensive about every field)          */
    /* ------------------------------------------------------------------ */

    function sumCounts(teams) {
      const totals = {
        teams: teams.length,
        members: 0,
        running: 0,
        provisioning: 0,
        failed: 0,
        tasks: 0,
        pending: 0,
        inProgress: 0,
        completed: 0,
        blocked: 0,
      }
      for (const team of teams) {
        const counts = team && typeof team.counts === 'object' && team.counts ? team.counts : {}
        const members = asArray(team && team.members)
        const tasks = asArray(team && team.tasks)
        const countBy = (status) => members.filter((member) => asString(member && member.status) === status).length
        const taskBy = (status) => tasks.filter((task) => asString(task && task.status) === status).length
        totals.members += numberOr(counts.members, members.length)
        totals.running += numberOr(counts.running, countBy('running'))
        totals.provisioning += numberOr(counts.provisioning, countBy('provisioning'))
        totals.failed += numberOr(counts.failed, countBy('failed'))
        totals.tasks += numberOr(counts.tasks, tasks.length)
        totals.pending += numberOr(counts.pending, taskBy('pending'))
        totals.inProgress += numberOr(counts.inProgress, taskBy('in_progress'))
        totals.completed += numberOr(counts.completed, taskBy('completed'))
        totals.blocked += numberOr(counts.blocked, tasks.filter((task) => (
          asString(task && task.status) !== 'completed' && asArray(task && task.blockedBy).length > 0
        )).length)
      }
      return totals
    }

    function kpiModel(data) {
      const teams = asArray(data && data.teams)
      const totals = data && typeof data.totals === 'object' && data.totals ? data.totals : {}
      const sums = sumCounts(teams)
      const hasTeams = teams.length > 0
      return {
        members: hasTeams ? sums.members : numberOr(totals.members, 0),
        running: hasTeams ? sums.running : numberOr(totals.running, 0),
        tasks: hasTeams ? sums.tasks : numberOr(totals.tasks, 0),
        completed: hasTeams ? sums.completed : numberOr(totals.completed, 0),
        inProgress: hasTeams ? sums.inProgress : numberOr(totals.inProgress, 0),
        blocked: hasTeams ? sums.blocked : numberOr(totals.blocked, 0),
      }
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
.atc-root button{font:inherit;color:inherit;}
.atc-page{max-width:1120px;margin:0 auto;padding:28px 32px 48px;display:flex;flex-direction:column;gap:20px;}
.atc-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px 24px;flex-wrap:wrap;}
.atc-header-main{display:flex;flex-direction:column;gap:2px;min-width:0;}
.atc-title{margin:0;font-size:21px;line-height:28px;font-weight:600;letter-spacing:-0.01em;}
.atc-subtitle{margin:0;font-size:12.5px;line-height:18px;color:var(--dsw-alias-label-secondary);}
.atc-header-side{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding-top:5px;}
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
.atc-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;}
.atc-kpi{display:flex;flex-direction:column;gap:1px;min-width:0;padding:14px 16px 13px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);}
.atc-kpi-value{font-size:20px;line-height:26px;font-weight:600;font-variant-numeric:tabular-nums;}
.atc-kpi-label{font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary);}
.atc-kpi-context{font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.atc-stale{display:flex;align-items:center;gap:8px;font-size:12px;line-height:18px;color:var(--dsw-alias-state-warn-primary);}
.atc-status-dot{width:6px;height:6px;border-radius:50%;flex:none;background:currentColor;}
.atc-stale-dot{background:var(--dsw-alias-state-warn-primary);}
.atc-notice{display:flex;flex-direction:column;gap:4px;padding:14px 16px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);}
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
.atc-empty{display:flex;flex-direction:column;align-items:center;gap:10px;padding:40px 24px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);text-align:center;}
.atc-empty-art{color:var(--dsw-alias-label-secondary);opacity:0.85;}
.atc-empty-title{font-size:14px;line-height:20px;font-weight:600;}
.atc-empty-body{margin:0;max-width:560px;font-size:12.5px;line-height:19px;color:var(--dsw-alias-label-secondary);}
.atc-empty-note{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-warn-primary);}
.atc-section{display:flex;flex-direction:column;gap:12px;min-width:0;}
.atc-section-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;}
.atc-section-title{display:flex;align-items:center;gap:8px;margin:0;font-size:13px;line-height:18px;font-weight:600;}
.atc-section-meta{font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}
.atc-count{display:inline-flex;align-items:center;justify-content:center;min-width:18px;padding:1px 6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;font-weight:500;font-variant-numeric:tabular-nums;}
.atc-team{display:flex;flex-direction:column;gap:20px;min-width:0;}
.atc-team-plain{padding-top:0;}
.atc-team:not(.atc-team-plain){padding:18px 20px 20px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;}
.atc-team-head{display:flex;flex-direction:column;gap:2px;}
.atc-team-title{margin:0;font-size:15px;line-height:22px;font-weight:600;}
.atc-team-meta{font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}
.atc-roster-lead{display:grid;grid-template-columns:minmax(0,1fr);}
.atc-roster-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;}
.atc-member{display:flex;flex-direction:column;gap:7px;min-width:0;padding:12px 14px 13px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);text-align:left;}
.atc-member-clickable{cursor:pointer;}
.atc-member-clickable:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2);}
.atc-member-clickable:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;}
.atc-member-top{display:flex;align-items:center;gap:10px;min-width:0;}
.atc-avatar{flex:none;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:600;line-height:1;text-transform:uppercase;}
.atc-avatar-lead{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,var(--dsw-alias-bg-layer-1));border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 34%,var(--dsw-alias-border-l1));color:var(--dsw-alias-brand-primary);}
.atc-member-ident{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1;}
.atc-member-name{font-size:13px;line-height:18px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.atc-role{font-size:11px;line-height:14px;letter-spacing:0.04em;color:var(--dsw-alias-label-secondary);text-transform:uppercase;}
.atc-member-pill{flex:none;margin-left:auto;}
.atc-status{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:999px;font-size:11px;line-height:16px;font-weight:500;white-space:nowrap;}
.atc-status-running{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent);}
.atc-status-inactive{color:var(--dsw-alias-state-idle-primary);background:color-mix(in srgb,var(--dsw-alias-state-idle-primary) 12%,transparent);}
.atc-status-provisioning{color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 12%,transparent);}
.atc-status-failed{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);}
.atc-member-meta{font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.atc-member-desc{display:-webkit-box;margin:0;font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary);-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;}
.atc-diagnostics{display:flex;flex-direction:column;gap:2px;}
.atc-diagnostic{margin:0;font-size:12px;line-height:16px;color:var(--dsw-alias-state-error-primary);word-break:break-word;}
.atc-board{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;align-items:start;}
.atc-col{display:flex;flex-direction:column;gap:8px;min-width:0;}
.atc-col-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 2px;}
.atc-col-title{font-size:12px;line-height:16px;font-weight:600;color:var(--dsw-alias-label-secondary);}
.atc-task{display:flex;flex-direction:column;gap:7px;min-width:0;padding:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);}
.atc-task-completed{opacity:0.62;}
.atc-task-top{display:flex;align-items:flex-start;gap:8px;min-width:0;}
.atc-task-dot{flex:none;width:7px;height:7px;margin-top:6px;border-radius:50%;background:var(--dsw-alias-state-idle-primary);}
.atc-dot-idle{background:var(--dsw-alias-state-idle-primary);}
.atc-dot-warn{background:var(--dsw-alias-state-warn-primary);}
.atc-dot-ongoing{background:var(--dsw-alias-brand-primary);}
.atc-dot-done{background:var(--dsw-alias-state-success-primary);}
.atc-task-subject{margin:0;font-size:13px;line-height:18px;font-weight:500;word-break:break-word;min-width:0;}
.atc-task-desc{display:-webkit-box;margin:0;font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary);-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;}
.atc-task-desc-open{display:block;overflow:visible;-webkit-line-clamp:unset;}
.atc-task-meta{display:flex;align-items:center;flex-wrap:wrap;gap:6px;min-width:0;}
.atc-chip{display:inline-flex;align-items:center;max-width:100%;padding:1px 7px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.atc-chip-owner{color:var(--dsw-alias-label-primary);}
.atc-task-id{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}
.atc-task-warn{font-size:11px;line-height:16px;color:var(--dsw-alias-state-warn-primary);word-break:break-word;}
.atc-expand{align-self:flex-start;padding:0;border:0;background:none;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;cursor:pointer;}
.atc-expand:hover{color:var(--dsw-alias-label-primary);}
.atc-expand:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:4px;}
.atc-empty-msg{padding:12px;border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);}
.atc-timeline{display:flex;flex-direction:column;}
.atc-tl-row{position:relative;display:grid;grid-template-columns:72px 22px minmax(0,1fr);gap:10px;align-items:start;padding:6px 0;}
.atc-tl-row:not(:last-child)::before{content:"";position:absolute;left:92px;top:26px;bottom:-8px;width:1px;background:var(--dsw-alias-border-l1);}
.atc-tl-time{font-size:11px;line-height:22px;color:var(--dsw-alias-label-secondary);text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.atc-tl-icon{position:relative;z-index:1;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border:1px solid var(--dsw-alias-border-l1);border-radius:50%;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);}
.atc-tl-text{font-size:12.5px;line-height:20px;min-width:0;word-break:break-word;}
.atc-tl-sub{display:block;font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary);}
.atc-skel{display:flex;flex-direction:column;gap:12px;animation:atc-breathe 1.6s ease-in-out infinite;}
.atc-skel-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;}
.atc-skel-block{height:78px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);}
.atc-skel-panel{height:240px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);}
.atc-sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;}
@keyframes atc-pulse{0%,100%{opacity:1;}50%{opacity:0.35;}}
@keyframes atc-rotate{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
@keyframes atc-breathe{0%,100%{opacity:1;}50%{opacity:0.55;}}
@media (max-width:899px){
.atc-page{padding:16px 16px 40px;gap:16px;}
.atc-kpis{grid-template-columns:repeat(2,minmax(0,1fr));}
.atc-skel-kpis{grid-template-columns:repeat(2,minmax(0,1fr));}
.atc-roster-grid{grid-template-columns:minmax(0,1fr);}
.atc-board{grid-template-columns:minmax(0,1fr);gap:16px;}
.atc-team:not(.atc-team-plain){padding:16px;}
.atc-tl-row{grid-template-columns:64px 22px minmax(0,1fr);gap:8px;}
.atc-tl-row:not(:last-child)::before{left:82px;}
.atc-header-side{padding-top:0;}
}
@media (max-width:559px){
.atc-kpis,.atc-skel-kpis{grid-template-columns:minmax(0,1fr);}
}
@media (prefers-reduced-motion:reduce){
.atc-pulse,.atc-spin,.atc-skel{animation:none !important;}
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

    function UsersIcon({ size }) {
      const dimension = svgSize(size, 12)
      return h('svg', {
        width: dimension,
        height: dimension,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
        style: { display: 'block' },
      },
        h('circle', { cx: 6, cy: 5.8, r: 2.1 }),
        h('path', { d: 'M2.6 13c0-1.8 1.5-3 3.4-3s3.4 1.2 3.4 3' }),
        h('circle', { cx: 11.4, cy: 6.4, r: 1.7 }),
        h('path', { d: 'M10.4 9.5c1.9.1 3.2 1.3 3.2 3' }))
    }

    function TaskIcon({ size }) {
      const dimension = svgSize(size, 12)
      return h('svg', {
        width: dimension,
        height: dimension,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
        style: { display: 'block' },
      },
        h('rect', { x: 2.6, y: 2.6, width: 10.8, height: 10.8, rx: 2.4 }),
        h('path', { d: 'M5.6 6.2h4.8M5.6 9.6h3.2' }))
    }

    function CheckIcon({ size }) {
      const dimension = svgSize(size, 12)
      return h('svg', {
        width: dimension,
        height: dimension,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.6,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
        style: { display: 'block' },
      },
        h('path', { d: 'm3 8.4 3.1 3.1L13 4.8' }))
    }

    function DotIcon({ size }) {
      const dimension = svgSize(size, 12)
      return h('svg', {
        width: dimension,
        height: dimension,
        viewBox: '0 0 16 16',
        fill: 'currentColor',
        stroke: 'none',
        'aria-hidden': 'true',
        focusable: 'false',
        style: { display: 'block' },
      },
        h('circle', { cx: 8, cy: 8, r: 2.2 }))
    }

    function ActivityKindIcon({ item, size }) {
      const kind = asString(item && item.kind)
      const action = asString(item && item.action)
      if (kind === 'member') return h(UsersIcon, { size })
      if (kind === 'task') return action === 'complete' ? h(CheckIcon, { size }) : h(TaskIcon, { size })
      return h(DotIcon, { size })
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

    function StatusPill({ status, label }) {
      const tone = hasKey('member.status.' + asString(status)) ? asString(status) : 'inactive'
      const animated = tone === 'running' || tone === 'provisioning'
      return h('span', { className: 'atc-status atc-status-' + tone, title: label },
        h('span', { className: 'atc-status-dot' + (animated ? ' atc-pulse' : ''), 'aria-hidden': 'true' }),
        h('span', null, label))
    }

    function KpiCard({ value, label, context }) {
      return h('div', { className: 'atc-kpi' },
        h('span', { className: 'atc-kpi-value' }, String(value)),
        h('span', { className: 'atc-kpi-label' }, label),
        h('span', { className: 'atc-kpi-context' }, context))
    }

    function KpiGrid({ data, t }) {
      const model = kpiModel(data)
      const cards = [
        {
          key: 'members',
          value: model.members,
          label: t('kpi.members'),
          context: t('kpi.membersContext', { running: model.running, total: model.members }),
        },
        {
          key: 'tasks',
          value: model.tasks,
          label: t('kpi.tasks'),
          context: t('kpi.tasksContext', { completed: model.completed, total: model.tasks }),
        },
        {
          key: 'inProgress',
          value: model.inProgress,
          label: t('kpi.inProgress'),
          context: t('kpi.inProgressContext'),
        },
        {
          key: 'blocked',
          value: model.blocked,
          label: t('kpi.blocked'),
          context: t('kpi.blockedContext'),
        },
      ]
      return h('div', { className: 'atc-kpis' }, cards.map((card) => h(KpiCard, {
        key: card.key,
        value: card.value,
        label: card.label,
        context: card.context,
      })))
    }

    function Header({ t, anyRunning, refreshing, onRefresh, updatedLabel }) {
      return h('header', { className: 'atc-header' },
        h('div', { className: 'atc-header-main' },
          h('h1', { className: 'atc-title' }, t('title')),
          h('p', { className: 'atc-subtitle' }, t('subtitle'))),
        h('div', { className: 'atc-header-side' },
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
        h('div', { className: 'atc-skel-kpis' }, [0, 1, 2, 3].map((index) => h('div', { key: index, className: 'atc-skel-block' }))),
        h('div', { className: 'atc-skel-panel' }))
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
        h('span', { className: 'atc-status-dot atc-stale-dot', 'aria-hidden': 'true' }),
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
    /* Roster                                                              */
    /* ------------------------------------------------------------------ */

    function MemberCard({ member, t, onOpen }) {
      const name = asString(member && member.name) || '—'
      const role = asString(member && member.role)
      const status = asString(member && member.status) || 'inactive'
      const statusLabel = memberStatusLabel(status, t)
      const initial = Array.from(name.trim())[0] || '?'
      const contextLabel = memberContextLabel(member && member.context, t)
      const metaParts = [
        asString(member && member.model),
        contextLabel,
        asString(member && member.provider),
      ].filter(Boolean)
      const metaText = metaParts.length ? metaParts.join(' · ') : '—'
      const lastActivityAt = asNumber(member && member.lastActivityAt)
      const eventType = asString(member && member.lastEventType)
      const activityText = lastActivityAt !== null
        ? t('member.lastActive', { time: formatRelative(lastActivityAt, t), event: eventType || '—' })
        : t('member.noActivity')
      const description = asString(member && member.description)
      const diagnostics = asArray(member && member.diagnostics).map(asString).filter(Boolean)
      const roleLabel = role === 'lead' ? t('member.role.lead') : t('member.role.teammate')
      const clickable = typeof onOpen === 'function' && asString(member && member.id) !== ''
      const activate = () => openMemberSession(member && member.id)
      const cardProps = {
        className: 'atc-member' + (clickable ? ' atc-member-clickable' : ''),
      }
      if (clickable) {
        cardProps.role = 'button'
        cardProps.tabIndex = 0
        cardProps['aria-label'] = name + ' · ' + statusLabel + ' · ' + t('member.open')
        cardProps.onClick = activate
        cardProps.onKeyDown = (event) => {
          if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
            event.preventDefault()
            activate()
          }
        }
      }
      return h('article', cardProps,
        h('div', { className: 'atc-member-top' },
          h('span', { className: 'atc-avatar' + (role === 'lead' ? ' atc-avatar-lead' : ''), 'aria-hidden': 'true' }, initial),
          h('div', { className: 'atc-member-ident' },
            h('span', { className: 'atc-member-name', title: name }, name),
            h('span', { className: 'atc-role' }, roleLabel)),
          h('span', { className: 'atc-member-pill' }, h(StatusPill, { status, label: statusLabel }))),
        h('div', { className: 'atc-member-meta', title: metaText }, metaText),
        h('div', { className: 'atc-member-meta' }, activityText),
        description ? h('p', { className: 'atc-member-desc', title: description }, description) : null,
        diagnostics.length
          ? h('div', { className: 'atc-diagnostics', 'aria-label': t('member.diagnostics') },
            diagnostics.map((line, index) => h('p', { className: 'atc-diagnostic', key: String(index) }, line)))
          : null)
    }

    function RosterSection({ team, t, onOpen }) {
      const members = asArray(team && team.members)
      const lead = members.find((member) => asString(member && member.role) === 'lead') || null
      const others = members.filter((member) => member !== lead)
      return h('section', { className: 'atc-section' },
        h('div', { className: 'atc-section-head' },
          h('h2', { className: 'atc-section-title' }, t('section.roster'), h('span', { className: 'atc-count' }, String(members.length)))),
        members.length
          ? [
            lead
              ? h('div', { className: 'atc-roster-lead', key: 'lead' }, h(MemberCard, { member: lead, t, onOpen }))
              : null,
            others.length
              ? h('div', { className: 'atc-roster-grid', key: 'others' },
                others.map((member, index) => h(MemberCard, {
                  key: asString(member && member.id) || 'member-' + index,
                  member,
                  t,
                  onOpen,
                })))
              : null,
          ]
          : h('div', { className: 'atc-empty-msg' }, t('roster.empty')))
    }

    /* ------------------------------------------------------------------ */
    /* Task board                                                          */
    /* ------------------------------------------------------------------ */

    function TaskCard({ task, t }) {
      const [expanded, setExpanded] = React.useState(false)
      const [clamped, setClamped] = React.useState(false)
      const textRef = React.useRef(null)
      const description = asString(task && task.description)
      const status = asString(task && task.status)
      const completed = status === 'completed'
      const ready = Boolean(task && task.ready === true)
      const blockedBy = asArray(task && task.blockedBy).map(asString).filter(Boolean)
      const writeScopes = asArray(task && task.writeScopes).map(asString).filter(Boolean)
      const writeWarnings = asArray(task && task.writeScopeWarnings).map(asString).filter(Boolean)
      const ownerName = asString(task && task.ownerName)
      const taskId = asString(task && task.id)
      const statusLabel = taskStatusLabel(status, t)
      const subject = asString(task && task.subject) || taskId || '—'
      let dotTone = 'idle'
      if (completed) dotTone = 'done'
      else if (status === 'in_progress') dotTone = 'ongoing'
      else if (status === 'pending' && (!ready || blockedBy.length > 0)) dotTone = 'warn'
      const dotTitle = [statusLabel, ready ? t('task.ready') : null, blockedBy.length ? t('task.blockedBy', { ids: blockedBy.join(', ') }) : null]
        .filter(Boolean)
        .join(' · ')
      let blockedLine = ''
      if (blockedBy.length) blockedLine = t('task.blockedBy', { ids: blockedBy.join(', ') })
      else if (status === 'pending' && !ready) blockedLine = t('task.blocked')

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

      return h('article', { className: 'atc-task' + (completed ? ' atc-task-completed' : '') },
        h('div', { className: 'atc-task-top' },
          h('span', { className: 'atc-task-dot atc-dot-' + dotTone, title: dotTitle, 'aria-hidden': 'true' }),
          h('h4', { className: 'atc-task-subject' }, subject),
          h('span', { className: 'atc-sr-only' }, statusLabel)),
        description
          ? h('p', { ref: textRef, className: 'atc-task-desc' + (expanded ? ' atc-task-desc-open' : '') }, description)
          : null,
        (clamped || expanded)
          ? h('button', {
            type: 'button',
            className: 'atc-expand',
            'aria-expanded': expanded,
            onClick: () => setExpanded((value) => !value),
          }, t(expanded ? 'task.collapse' : 'task.expand'))
          : null,
        h('div', { className: 'atc-task-meta' },
          h('span', { className: 'atc-chip atc-chip-owner', title: t('task.owner', { name: ownerName || t('task.unowned') }) },
            '@' + (ownerName || t('task.unowned'))),
          taskId ? h('span', { className: 'atc-task-id' }, taskId) : null,
          writeScopes.map((scope, index) => h('span', {
            className: 'atc-chip',
            key: 'scope-' + index,
            title: t('task.scopesLabel') + ': ' + scope,
          }, scope))),
        blockedLine ? h('div', { className: 'atc-task-warn' }, blockedLine) : null,
        writeWarnings.length
          ? h('div', { className: 'atc-diagnostics' },
            writeWarnings.map((warning, index) => h('p', { className: 'atc-diagnostic', key: 'warning-' + index }, warning)))
          : null)
    }

    function TaskBoard({ team, t }) {
      const tasks = asArray(team && team.tasks)
      const columns = [
        { key: 'pending', title: t('task.col.pending') },
        { key: 'in_progress', title: t('task.col.inProgress') },
        { key: 'completed', title: t('task.col.completed') },
      ]
      return h('div', { className: 'atc-board' }, columns.map((column) => {
        const items = tasks.filter((task) => asString(task && task.status) === column.key)
        return h('div', { className: 'atc-col', key: column.key },
          h('div', { className: 'atc-col-head' },
            h('span', { className: 'atc-col-title' }, column.title),
            h('span', { className: 'atc-count' }, String(items.length))),
          items.length
            ? items.map((task, index) => h(TaskCard, {
              key: asString(task && task.id) || 'task-' + column.key + '-' + index,
              task,
              t,
            }))
            : h('div', { className: 'atc-empty-msg' }, t('task.emptyColumn')))
      }))
    }

    function TaskSection({ team, t }) {
      const tasks = asArray(team && team.tasks)
      return h('section', { className: 'atc-section' },
        h('div', { className: 'atc-section-head' },
          h('h2', { className: 'atc-section-title' }, t('section.tasks'), h('span', { className: 'atc-count' }, String(tasks.length)))),
        tasks.length
          ? h(TaskBoard, { team, t })
          : h('div', { className: 'atc-empty-msg' }, t('tasks.empty')))
    }

    /* ------------------------------------------------------------------ */
    /* Activity timeline                                                   */
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
      const main = composed ? parts.join(' · ') : (fallbackText || actionText || t('activity.unknown'))
      const secondary = subject && subject !== main ? subject : (fallbackText && fallbackText !== main ? fallbackText : '')
      return h('div', { className: 'atc-tl-row' },
        h('span', { className: 'atc-tl-time', title: relativeTitle(item && item.time) }, formatRelative(item && item.time, t)),
        h('span', { className: 'atc-tl-icon' }, h(ActivityKindIcon, { item, size: 12 })),
        h('div', { className: 'atc-tl-text' },
          main,
          secondary ? h('span', { className: 'atc-tl-sub' }, secondary) : null))
    }

    function relativeTitle(ts) {
      const value = asNumber(ts)
      if (value === null) return ''
      try {
        return new Date(value).toLocaleString(languageTag())
      } catch (error) {
        return ''
      }
    }

    function ActivitySection({ team, t }) {
      const activity = asArray(team && team.activity).slice(0, ACTIVITY_LIMIT)
      return h('section', { className: 'atc-section' },
        h('div', { className: 'atc-section-head' },
          h('h2', { className: 'atc-section-title' }, t('section.activity'), h('span', { className: 'atc-count' }, String(activity.length)))),
        activity.length
          ? h('div', { className: 'atc-timeline' }, activity.map((item, index) => h(ActivityRow, {
            key: (asString(item && item.seq) || 'activity') + '-' + index,
            item,
            t,
          })))
          : h('div', { className: 'atc-empty-msg' }, t('activity.empty')))
    }

    /* ------------------------------------------------------------------ */
    /* Team block + page                                                   */
    /* ------------------------------------------------------------------ */

    function TeamBlock({ team, t, multi, onOpen }) {
      const members = asArray(team && team.members)
      const lead = members.find((member) => asString(member && member.role) === 'lead') || members[0] || null
      const leadName = lead ? asString(lead.name) || t('team.unnamed') : t('team.unnamed')
      const teamId = asString(team && team.id)
      const shortId = teamId ? teamId.slice(0, 8) : '—'
      const updated = formatRelative(teamLatestTime(team), t)
      const errorMessage = asString(team && team.error)
      const safeTeam = team && typeof team === 'object' ? team : {}
      const content = [
        errorMessage
          ? h('div', { className: 'atc-notice atc-notice-warn', role: 'alert', key: 'error' },
            h('div', { className: 'atc-notice-body' }, t('team.error', { message: errorMessage })))
          : null,
        h(RosterSection, { key: 'roster', team: safeTeam, t, onOpen }),
        h(TaskSection, { key: 'tasks', team: safeTeam, t }),
        h(ActivitySection, { key: 'activity', team: safeTeam, t }),
      ]
      if (!multi) {
        return h('section', { className: 'atc-team atc-team-plain' },
          h('div', { className: 'atc-section-head' },
            h('h2', { className: 'atc-section-title' }, t('section.team')),
            h('span', { className: 'atc-section-meta' }, t('team.summary', { name: leadName, id: shortId, updated }))),
          content)
      }
      return h('section', { className: 'atc-team' },
        h('header', { className: 'atc-team-head' },
          h('h2', { className: 'atc-team-title' }, leadName),
          h('span', { className: 'atc-team-meta' }, t('team.idUpdated', { id: shortId, updated }))),
        content)
    }

    function Panel() {
      useLocaleRevision()
      const t = runtime.t
      const snapshot = useSnapshot()
      const data = snapshot.data
      const phase = snapshot.phase
      const teams = asArray(data && data.teams)
      const unsupported = data ? asString(data.unsupported) : ''
      const model = data ? kpiModel(data) : null
      const anyRunning = Boolean(model && model.running > 0)
      let updatedLabel = t('neverUpdated')
      if (snapshot.updatedAt) updatedLabel = t('lastUpdated', { time: formatClock(snapshot.updatedAt) })
      else if (phase === 'loading') updatedLabel = t('loading')
      const canOpen = workspaceService() !== null
      const multi = teams.length > 1
      const busy = snapshot.refreshing || (phase === 'loading' && !data)
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
          body.push(h(KpiGrid, { key: 'kpis', data, t }))
        }
        if (teams.length === 0) {
          body.push(h(EmptyState, { key: 'empty', t, unsupported }))
        } else {
          for (let index = 0; index < teams.length; index += 1) {
            const team = teams[index]
            body.push(h(TeamBlock, {
              key: asString(team && team.id) || 'team-' + index,
              team,
              t,
              multi,
              onOpen: canOpen ? openMemberSession : null,
            }))
          }
        }
      }
      return h('div', { className: 'atc-root' },
        h('style', { 'data-atc-style': 'team-console' }, CSS),
        h('div', { className: 'atc-page' },
          h(Header, {
            t,
            anyRunning,
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
