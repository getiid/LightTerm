import { computed, ref, watch, type Ref } from 'vue'

export type SnippetItem = {
  id: string
  name: string
  category: string
  hostId: string
  description: string
  commands: string
  reminderDate: string
  lastRunAt: number
  lastRunStatus: 'idle' | 'running' | 'success' | 'error'
  lastRunOutput: string
  createdAt: number
  updatedAt: number
}

type LegacyQuickToolItem = {
  id: string
  category: string
  label: string
  cmd: string
  updatedAt?: number
}

type TerminalMode = 'ssh' | 'serial' | 'local'

type UseSnippetManagerParams = {
  hostItems: Ref<any[]>
  sshForm: Ref<{ host: string; port: number; username: string }>
  sshConnected: Ref<boolean>
  sshSessionId: Ref<string>
  activeTerminalMode: Ref<TerminalMode>
  serialConnected: Ref<boolean>
  serialCurrentPath: Ref<string>
  localConnected: Readonly<Ref<boolean>>
  activeLocalSessionId: Readonly<Ref<string>>
  recordLocalInput: (sessionId: string, data: string) => void
  useHost: (host: any) => void
  connectSSH: (options?: { keepNav?: boolean } | Event) => Promise<boolean>
  focusTerminal: () => void
  defaultCategory?: string
  allCategory?: string
  legacyStorageKey?: string
}

const DEFAULT_SNIPPET_CATEGORY = '部署'
const ALL_SNIPPET_CATEGORY = '全部'
const LEGACY_STORAGE_KEY = 'astrashell.snippets.v1'
const WARNING_DAYS = 15
const DAY_MS = 24 * 60 * 60 * 1000

export function useSnippetManager(params: UseSnippetManagerParams) {
  const {
    hostItems,
    sshForm,
    sshConnected,
    sshSessionId,
    activeTerminalMode,
    serialConnected,
    serialCurrentPath,
    localConnected,
    activeLocalSessionId,
    recordLocalInput,
    useHost,
    connectSSH,
    focusTerminal,
    defaultCategory = DEFAULT_SNIPPET_CATEGORY,
    allCategory = ALL_SNIPPET_CATEGORY,
    legacyStorageKey = LEGACY_STORAGE_KEY,
  } = params

  const createEmptySnippet = (): SnippetItem => ({
    id: '',
    name: '',
    category: defaultCategory,
    hostId: '',
    description: '',
    commands: '',
    reminderDate: '',
    lastRunAt: 0,
    lastRunStatus: 'idle',
    lastRunOutput: '',
    createdAt: 0,
    updatedAt: 0,
  })

  const snippetItems = ref<SnippetItem[]>([])
  const snippetsLoaded = ref(false)
  const snippetKeyword = ref('')
  const snippetCategory = ref(allCategory)
  const localSnippetCategory = ref(allCategory)
  const localSnippetKeyword = ref('')
  const terminalSnippetCategory = ref(allCategory)
  const snippetStatus = ref('')
  const snippetRunDelayMs = ref(1200)
  const snippetRunning = ref(false)
  const snippetStopRequested = ref(false)
  const selectedSnippetId = ref('')
  const snippetEditorVisible = ref(true)
  const snippetEdit = ref<SnippetItem>(createEmptySnippet())
  const snippetExtraCategories = ref<string[]>([])
  const newSnippetCategoryName = ref('')
  const newSnippetCategoryInputVisible = ref(false)
  const editingSnippetCategory = ref('')
  const editingSnippetCategoryName = ref('')
  const terminalSnippetId = ref('')

  const snippetCategories = computed(() => {
    const set = new Set<string>([defaultCategory])
    snippetItems.value.forEach((item) => set.add(item.category || defaultCategory))
    snippetExtraCategories.value.forEach((category) => set.add(category))
    return Array.from(set)
  })

  const displaySnippetCategories = computed(() => [allCategory, ...snippetCategories.value])

  const resolveDraftCategory = () => (
    snippetCategory.value !== allCategory && snippetCategories.value.includes(snippetCategory.value)
      ? snippetCategory.value
      : defaultCategory
  )

  const filteredSnippetItems = computed(() => {
    const keyword = snippetKeyword.value.trim().toLowerCase()
    return snippetItems.value
      .filter((item) => {
        const inCategory = snippetCategory.value === allCategory || item.category === snippetCategory.value
        if (!inCategory) return false
        if (!keyword) return true
        return [item.name, item.description, item.commands]
          .some((value) => String(value || '').toLowerCase().includes(keyword))
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
  })

  const localSnippetCategories = computed(() => [allCategory, ...snippetCategories.value])

  const filteredLocalSnippetItems = computed(() => {
    const keyword = localSnippetKeyword.value.trim().toLowerCase()
    return snippetItems.value
      .filter((item) => {
        const inCategory = localSnippetCategory.value === allCategory || item.category === localSnippetCategory.value
        if (!inCategory) return false
        if (!keyword) return true
        return [item.name, item.description, item.commands]
          .some((value) => String(value || '').toLowerCase().includes(keyword))
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
  })

  const ensureValidCategorySelection = () => {
    if (snippetCategory.value !== allCategory && !snippetCategories.value.includes(snippetCategory.value)) {
      snippetCategory.value = allCategory
    }
    if (localSnippetCategory.value !== allCategory && !snippetCategories.value.includes(localSnippetCategory.value)) {
      localSnippetCategory.value = allCategory
    }
    if (terminalSnippetCategory.value !== allCategory && !snippetCategories.value.includes(terminalSnippetCategory.value)) {
      terminalSnippetCategory.value = allCategory
    }
    if (snippetEdit.value.category && !snippetCategories.value.includes(snippetEdit.value.category)) {
      snippetEdit.value.category = defaultCategory
    }
  }

  const currentSessionHostId = computed(() => {
    const host = hostItems.value.find((item) =>
      item.host === sshForm.value.host
      && Number(item.port || 22) === Number(sshForm.value.port || 22)
      && item.username === sshForm.value.username,
    )
    return host?.id || ''
  })

  const terminalSnippetCategories = computed(() => [allCategory, ...snippetCategories.value])

  const terminalSnippetItems = computed(() => {
    const currentHostId = currentSessionHostId.value
    return [...snippetItems.value]
      .filter((item) => terminalSnippetCategory.value === allCategory || item.category === terminalSnippetCategory.value)
      .sort((a, b) => {
        const aMatched = !!currentHostId && a.hostId === currentHostId
        const bMatched = !!currentHostId && b.hostId === currentHostId
        if (aMatched !== bMatched) return aMatched ? -1 : 1
        return b.updatedAt - a.updatedAt
      })
  })

  const formatSnippetRunTime = (value: number) => {
    if (!value) return '未执行'
    const date = new Date(value)
    const y = date.getFullYear()
    const m = `${date.getMonth() + 1}`.padStart(2, '0')
    const d = `${date.getDate()}`.padStart(2, '0')
    const hh = `${date.getHours()}`.padStart(2, '0')
    const mm = `${date.getMinutes()}`.padStart(2, '0')
    const ss = `${date.getSeconds()}`.padStart(2, '0')
    return `${y}/${m}/${d} ${hh}:${mm}:${ss}`
  }

  const snippetLastRunLabel = (item: SnippetItem) => {
    if (!item?.lastRunAt) return '未执行'
    if (item.lastRunStatus === 'success') return `成功 · ${formatSnippetRunTime(item.lastRunAt)}`
    if (item.lastRunStatus === 'error') return `失败 · ${formatSnippetRunTime(item.lastRunAt)}`
    if (item.lastRunStatus === 'running') return '执行中...'
    return formatSnippetRunTime(item.lastRunAt)
  }

  const snippetListRunLabel = (item: SnippetItem) => {
    if (!item?.lastRunAt) return '未执行'
    if (item.lastRunStatus === 'success') return '成功'
    if (item.lastRunStatus === 'error') return '失败'
    if (item.lastRunStatus === 'running') return '执行中'
    return '已执行'
  }

  const snippetLastRunTone = (item: SnippetItem) => item?.lastRunStatus || 'idle'

  const parseDateOnly = (value: string) => {
    const raw = String(value || '').trim()
    if (!raw) return null
    const date = new Date(`${raw}T00:00:00`)
    return Number.isNaN(date.getTime()) ? null : date
  }

  const normalizeReminderDate = (value: string) => {
    const raw = String(value || '').trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) && !!parseDateOnly(raw) ? raw : ''
  }

  const daysUntilReminder = (value: string) => {
    const reminder = parseDateOnly(value)
    if (!reminder) return null
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Math.ceil((reminder.getTime() - today.getTime()) / DAY_MS)
  }

  const snippetReminderDate = (item: SnippetItem) => normalizeReminderDate(item?.reminderDate || '')

  const snippetReminderDays = (item: SnippetItem) => daysUntilReminder(snippetReminderDate(item))

  const snippetReminderLabel = (item: SnippetItem) => {
    const reminderDate = snippetReminderDate(item)
    if (!reminderDate) return '未设提醒'
    const days = snippetReminderDays(item)
    if (days == null) return reminderDate
    if (days < 0) return `已超出 ${Math.abs(days)} 天`
    if (days === 0) return '今天提醒'
    if (days <= WARNING_DAYS) return `还有 ${days} 天提醒`
    return `提醒 ${reminderDate}`
  }

  const snippetReminderTone = (item: SnippetItem) => {
    const reminderDate = snippetReminderDate(item)
    if (!reminderDate) return 'idle'
    const days = snippetReminderDays(item)
    if (days == null) return 'idle'
    if (days <= 3) return 'danger'
    if (days <= WARNING_DAYS) return 'warning'
    return 'quiet'
  }

  const buildDefaultDockerSnippet = (): SnippetItem => ({
    id: `snippet-${Date.now().toString(36)}-docker`,
    name: '部署 Docker（Debian/Ubuntu）',
    category: defaultCategory,
    hostId: '',
    description: '安装 Docker CE、启动服务并加入当前用户组。',
    commands: [
      'sudo apt-get update',
      'sudo apt-get install -y ca-certificates curl gnupg',
      'sudo install -m 0755 -d /etc/apt/keyrings',
      'curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg',
      'sudo chmod a+r /etc/apt/keyrings/docker.gpg',
      'echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null',
      'sudo apt-get update',
      'sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin',
      'sudo systemctl enable docker --now',
      'sudo usermod -aG docker $USER',
      'docker --version',
    ].join('\n'),
    reminderDate: '',
    lastRunAt: 0,
    lastRunStatus: 'idle',
    lastRunOutput: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })

  const readLegacySnippets = () => {
    try {
      const raw = localStorage.getItem(legacyStorageKey)
      if (!raw) return null
      const parsed = JSON.parse(raw) as { items?: SnippetItem[]; extraCategories?: string[] }
      return {
        items: Array.isArray(parsed?.items) ? parsed.items : [],
        extraCategories: Array.isArray(parsed?.extraCategories) ? parsed.extraCategories : [],
      }
    } catch {
      return null
    }
  }

  const readLegacyQuickTools = async () => {
    try {
      const res = await window.lightterm.quicktoolsGetState()
      const parsed = Array.isArray(res.items) ? res.items : []
      const items = parsed
        .map((item: any) => ({
          id: String(item?.id || ''),
          category: String(item?.category || defaultCategory).trim() || defaultCategory,
          label: String(item?.label || '').trim(),
          cmd: String(item?.cmd || '').trim(),
          updatedAt: Number(item?.updatedAt || 0),
        }))
        .filter((item: LegacyQuickToolItem) => item.label && item.cmd)
      const extraCategories = [...new Set(items.map((item) => item.category).filter(Boolean))]
      return { items, extraCategories }
    } catch {
      return { items: [], extraCategories: [] }
    }
  }

  const normalizeQuickToolsAsSnippets = (items: LegacyQuickToolItem[]) => items.map((item, index) => {
    const now = Number(item.updatedAt || Date.now() + index)
    return {
      id: `snippet-${String(item.id || `quick-${index}`).replace(/[^a-zA-Z0-9_-]/g, '')}`,
      name: item.label,
      category: item.category || defaultCategory,
      hostId: '',
      description: '由快捷工具迁移',
      commands: item.cmd,
      reminderDate: '',
      lastRunAt: 0,
      lastRunStatus: 'idle' as const,
      lastRunOutput: '',
      createdAt: now,
      updatedAt: now,
    }
  })

  const mergeSnippetSources = (
    remoteItems: SnippetItem[],
    remoteCategories: string[],
    legacyItems: SnippetItem[],
    legacyCategories: string[],
  ) => {
    const merged = [...remoteItems]
    let changed = false

    for (const item of legacyItems) {
      const legacyName = String(item?.name || '').trim()
      const legacyCommands = String(item?.commands || '').trim()
      if (!legacyName || !legacyCommands) continue

      const index = merged.findIndex((current) => (
        current.id === item.id
        || (
          String(current?.name || '').trim() === legacyName
          && String(current?.commands || '').trim() === legacyCommands
        )
      ))

      if (index === -1) {
        merged.push({ ...item })
        changed = true
        continue
      }

      if (Number(item.updatedAt || 0) > Number(merged[index]?.updatedAt || 0)) {
        merged[index] = { ...merged[index], ...item }
        changed = true
      }
    }

    const extraCategories = [...new Set(
      [...remoteCategories, ...legacyCategories]
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    )]
    if (extraCategories.length !== remoteCategories.length) changed = true

    return {
      items: merged.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)),
      extraCategories,
      changed,
    }
  }

  const applySnippetState = (items: SnippetItem[], extraCategories: string[]) => {
    snippetItems.value = [...items].sort((a, b) => b.updatedAt - a.updatedAt)
    snippetExtraCategories.value = [...new Set(extraCategories.filter(Boolean))]
  }

  const saveSnippetState = async (
    items = snippetItems.value,
    extraCategories = snippetExtraCategories.value,
  ) => {
    const plainItems = (Array.isArray(items) ? items : []).map((item) => ({
      id: String(item?.id || ''),
      name: String(item?.name || ''),
      category: String(item?.category || ''),
      hostId: String(item?.hostId || ''),
      description: String(item?.description || ''),
      commands: String(item?.commands || ''),
      reminderDate: normalizeReminderDate(String(item?.reminderDate || '')),
      lastRunAt: Number(item?.lastRunAt || 0),
      lastRunStatus: String(item?.lastRunStatus || 'idle'),
      lastRunOutput: String(item?.lastRunOutput || ''),
      createdAt: Number(item?.createdAt || 0),
      updatedAt: Number(item?.updatedAt || 0),
    }))
    const plainExtraCategories = (Array.isArray(extraCategories) ? extraCategories : [])
      .map((value) => String(value || ''))

    const res = await window.lightterm.snippetsSetState({
      items: plainItems,
      extraCategories: plainExtraCategories,
    })
    if (!res.ok) {
      snippetStatus.value = `代码片段保存失败：${res.error || '未知错误'}`
      return false
    }
    applySnippetState((res.items || []) as SnippetItem[], res.extraCategories || [])
    return true
  }

  const restoreSnippets = async () => {
    try {
      const res = await window.lightterm.snippetsGetState()
      if (!res.ok) {
        applySnippetState([buildDefaultDockerSnippet()], [])
        await saveSnippetState()
        return
      }

      const remoteItems = Array.isArray(res.items) ? (res.items as SnippetItem[]) : []
      const remoteCategories = Array.isArray(res.extraCategories) ? res.extraCategories : []
      const legacy = readLegacySnippets()
      const legacyQuickTools = await readLegacyQuickTools()
      const migratedQuickSnippets = normalizeQuickToolsAsSnippets(legacyQuickTools.items)
      let mergedChanged = false
      let merged = {
        items: remoteItems,
        extraCategories: remoteCategories,
        changed: false,
      }
      if (legacy && (legacy.items.length > 0 || legacy.extraCategories.length > 0)) {
        merged = mergeSnippetSources(merged.items, merged.extraCategories, legacy.items, legacy.extraCategories)
        mergedChanged = mergedChanged || merged.changed
      }
      if (migratedQuickSnippets.length > 0 || legacyQuickTools.extraCategories.length > 0) {
        merged = mergeSnippetSources(merged.items, merged.extraCategories, migratedQuickSnippets, legacyQuickTools.extraCategories)
        mergedChanged = mergedChanged || merged.changed
      }
      if ((legacy && (legacy.items.length > 0 || legacy.extraCategories.length > 0)) || migratedQuickSnippets.length > 0) {
        applySnippetState(merged.items, merged.extraCategories)
        if (mergedChanged || remoteItems.length === 0 || migratedQuickSnippets.length > 0) {
          await saveSnippetState(merged.items, merged.extraCategories)
          if (migratedQuickSnippets.length > 0) {
            snippetStatus.value = '已将快捷工具迁移到代码片段'
            try { await window.lightterm.quicktoolsSetState({ items: [] }) } catch {}
          } else {
            snippetStatus.value = remoteItems.length > 0 || remoteCategories.length > 0
              ? '已合并本机旧版代码片段到共享数据库'
              : '已迁移本机旧版代码片段到共享数据库'
          }
        }
        try { localStorage.removeItem(legacyStorageKey) } catch {}
        return
      }

      if (remoteItems.length > 0 || remoteCategories.length > 0) {
        applySnippetState(remoteItems, remoteCategories)
        return
      }

      applySnippetState([buildDefaultDockerSnippet()], [])
      await saveSnippetState()
    } finally {
      snippetsLoaded.value = true
    }
  }

  const openSnippetEditor = (item: SnippetItem) => {
    selectedSnippetId.value = item.id
    snippetEdit.value = { ...item }
    snippetEditorVisible.value = true
  }

  const clearSnippetEditor = () => {
    selectedSnippetId.value = ''
    snippetEdit.value = {
      ...createEmptySnippet(),
      category: resolveDraftCategory(),
    }
    snippetEditorVisible.value = true
  }

  const beginAddSnippetCategory = () => {
    editingSnippetCategory.value = ''
    editingSnippetCategoryName.value = ''
    newSnippetCategoryInputVisible.value = true
    newSnippetCategoryName.value = ''
  }

  const beginRenameSnippetCategory = (category: string) => {
    if (!category || category === defaultCategory || category === allCategory) return
    newSnippetCategoryInputVisible.value = false
    editingSnippetCategory.value = category
    editingSnippetCategoryName.value = category
  }

  const cancelRenameSnippetCategory = () => {
    editingSnippetCategory.value = ''
    editingSnippetCategoryName.value = ''
  }

  const addSnippetCategory = async () => {
    const name = newSnippetCategoryName.value.trim()
    if (!name) {
      newSnippetCategoryInputVisible.value = false
      return
    }
    if (name === defaultCategory || name === allCategory) {
      snippetStatus.value = `分类名不能使用「${name}」`
      return
    }
    if (!snippetCategories.value.includes(name) && !snippetExtraCategories.value.includes(name)) {
      snippetExtraCategories.value.push(name)
      await saveSnippetState()
    }
    snippetCategory.value = name
    snippetEdit.value.category = name
    newSnippetCategoryName.value = ''
    newSnippetCategoryInputVisible.value = false
  }

  const renameSnippetCategory = async (from = editingSnippetCategory.value) => {
    if (!from || from === defaultCategory || from === allCategory) return
    const to = editingSnippetCategory.value === from
      ? editingSnippetCategoryName.value.trim()
      : ''
    if (!to || to === from) {
      cancelRenameSnippetCategory()
      return
    }
    if (to === defaultCategory || to === allCategory) {
      snippetStatus.value = `分类名不能使用「${to}」`
      return
    }

    const now = Date.now()
    snippetExtraCategories.value = [...new Set(snippetExtraCategories.value.map((item) => (item === from ? to : item)).concat(to))]
    snippetItems.value = snippetItems.value.map((item) => (
      item.category === from ? { ...item, category: to, updatedAt: now } : item
    ))
    if (snippetCategory.value === from) snippetCategory.value = to
    if (snippetEdit.value.category === from) snippetEdit.value.category = to
    const ok = await saveSnippetState()
    if (!ok) return
    cancelRenameSnippetCategory()
    snippetStatus.value = `分类已重命名：${from} → ${to}`
  }

  const deleteSnippetCategory = async (category: string) => {
    if (!category || category === defaultCategory || category === allCategory) return
    const confirmed = window.confirm(`删除分类「${category}」后，相关片段会自动迁移到「${defaultCategory}」。是否继续？`)
    if (!confirmed) return

    const now = Date.now()
    snippetItems.value = snippetItems.value.map((item) => (
      item.category === category ? { ...item, category: defaultCategory, updatedAt: now } : item
    ))
    snippetExtraCategories.value = snippetExtraCategories.value.filter((item) => item !== category)
    if (snippetCategory.value === category) snippetCategory.value = defaultCategory
    if (snippetEdit.value.category === category) snippetEdit.value.category = defaultCategory
    cancelRenameSnippetCategory()
    const ok = await saveSnippetState()
    if (!ok) return
    snippetStatus.value = `分类已删除：${category}`
  }

  const saveSnippet = async () => {
    const draft = snippetEdit.value
    const name = draft.name.trim()
    const commands = draft.commands.trim()
    if (!name) {
      snippetStatus.value = '请填写片段名称'
      return
    }
    if (!commands) {
      snippetStatus.value = '请至少填写一条命令'
      return
    }
    const reminderDate = normalizeReminderDate(draft.reminderDate || '')
    if (draft.reminderDate && !reminderDate) {
      snippetStatus.value = '请填写有效的提醒日期'
      return
    }

    const now = Date.now()
    const next: SnippetItem = {
      ...draft,
      id: draft.id || `snippet-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      category: draft.category || defaultCategory,
      hostId: draft.hostId || '',
      description: draft.description || '',
      commands,
      reminderDate,
      lastRunAt: Number(draft.lastRunAt || 0),
      lastRunStatus: (draft.lastRunStatus || 'idle') as SnippetItem['lastRunStatus'],
      lastRunOutput: String(draft.lastRunOutput || ''),
      createdAt: draft.createdAt || now,
      updatedAt: now,
    }

    const index = snippetItems.value.findIndex((item) => item.id === next.id)
    if (index >= 0) {
      snippetItems.value.splice(index, 1, next)
    } else {
      snippetItems.value.unshift(next)
    }
    selectedSnippetId.value = next.id
    snippetEdit.value = { ...next }
    await saveSnippetState()
    snippetStatus.value = `片段已保存：${next.name}`
  }

  const deleteSnippet = async () => {
    const id = selectedSnippetId.value || snippetEdit.value.id
    if (!id) return
    const target = snippetItems.value.find((item) => item.id === id)
    if (!target) return
    const confirmed = window.confirm(`确定删除代码片段「${target.name}」吗？`)
    if (!confirmed) return
    snippetItems.value = snippetItems.value.filter((item) => item.id !== id)
    await saveSnippetState()
    clearSnippetEditor()
    snippetStatus.value = '片段已删除'
  }

  const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

  const updateSnippetResult = async (
    snippetId: string,
    patch: Partial<Pick<SnippetItem, 'lastRunAt' | 'lastRunStatus' | 'lastRunOutput' | 'updatedAt'>>,
  ) => {
    if (!snippetId) return
    const nextUpdatedAt = Number(patch.updatedAt || Date.now())
    snippetItems.value = snippetItems.value.map((item) => (
      item.id === snippetId
        ? {
            ...item,
            ...patch,
            updatedAt: nextUpdatedAt,
          }
        : item
    ))
    if (snippetEdit.value.id === snippetId) {
      snippetEdit.value = {
        ...snippetEdit.value,
        ...patch,
        updatedAt: nextUpdatedAt,
      }
    }
    await saveSnippetState()
  }

  const buildSnippetExecConfig = async (target: SnippetItem) => {
    const host = hostItems.value.find((item) => item.id === target.hostId)
    if (!host) throw new Error('未找到绑定的目标服务器')
    let privateKey = ''
    if ((host.auth_type || host.authType) === 'key') {
      const keyRef = String(host.private_key_ref || host.privateKeyRef || '').trim()
      if (!keyRef) throw new Error('目标服务器缺少可用密钥')
      const keyRes = await window.lightterm.vaultKeyGet({ id: keyRef })
      if (!keyRes.ok || !keyRes.item?.privateKey) {
        throw new Error(keyRes.error || '读取服务器密钥失败')
      }
      privateKey = String(keyRes.item.privateKey || '')
    }
    return {
      host: String(host.host || ''),
      port: Number(host.port || 22),
      username: String(host.username || ''),
      password: (host.auth_type || host.authType) === 'key' ? undefined : (String(host.password || '') || undefined),
      privateKey: privateKey || undefined,
    }
  }

  const executeSnippetTask = async (target: SnippetItem) => {
    if (!target?.id) {
      snippetStatus.value = '请先选择一个代码片段'
      return false
    }
    if (!target.hostId) {
      const message = '请先给代码片段绑定目标服务器'
      snippetStatus.value = message
      await updateSnippetResult(target.id, {
        lastRunAt: Date.now(),
        lastRunStatus: 'error',
        lastRunOutput: message,
      })
      return false
    }
    const script = String(target.commands || '').trim()
    if (!script) {
      snippetStatus.value = '片段内容为空'
      return false
    }
    const currentItem = snippetItems.value.find((item) => item.id === target.id)
    if (currentItem?.lastRunStatus === 'running') return false

    await updateSnippetResult(target.id, {
      lastRunAt: Date.now(),
      lastRunStatus: 'running',
      lastRunOutput: '正在执行片段...',
    })
    try {
      const config = await buildSnippetExecConfig(target)
      const res = await window.lightterm.sshExecScript({
        ...config,
        script,
        timeoutMs: 180000,
      })
      const stdout = String(res.stdout || '').trim()
      const stderr = String(res.stderr || '').trim()
      const mergedOutput = [stdout, stderr].filter(Boolean).join('\n\n').trim()
      const finalOutput = mergedOutput || (res.ok ? '执行完成，无输出' : (res.error || '执行失败'))
      await updateSnippetResult(target.id, {
        lastRunAt: Date.now(),
        lastRunStatus: res.ok ? 'success' : 'error',
        lastRunOutput: finalOutput.slice(0, 8000),
      })
      snippetStatus.value = res.ok
        ? `执行完成：${target.name}`
        : `执行失败：${target.name}${res.error ? ` ｜ ${res.error}` : ''}`
      return !!res.ok
    } catch (error) {
      const message = error instanceof Error ? error.message : '执行失败'
      await updateSnippetResult(target.id, {
        lastRunAt: Date.now(),
        lastRunStatus: 'error',
        lastRunOutput: message,
      })
      snippetStatus.value = `执行失败：${message}`
      return false
    }
  }

  const snippetCommandLines = (commands: string) => (
    commands
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => !!line && !line.startsWith('#'))
  )

  const sendCommandsToLocalTerminal = async (target: SnippetItem, lines: string[]) => {
    if (!localConnected.value || !activeLocalSessionId.value) {
      snippetStatus.value = '请先连接本地终端'
      return
    }
    snippetRunning.value = true
    snippetStopRequested.value = false
    const delayMs = Math.max(120, Number(snippetRunDelayMs.value || 0))
    let sent = 0
    for (let i = 0; i < lines.length; i += 1) {
      if (snippetStopRequested.value) break
      const cmd = lines[i]
      const res = await window.lightterm.localWrite({ sessionId: activeLocalSessionId.value, data: `${cmd}\n` })
      if (!res.ok) {
        snippetStatus.value = `本地执行失败：${res.error || '未知错误'}`
        break
      }
      recordLocalInput(activeLocalSessionId.value, `${cmd}\n`)
      sent += 1
      if (i < lines.length - 1) await sleep(delayMs)
    }
    snippetRunning.value = false
    snippetStopRequested.value = false
    snippetStatus.value = sent === lines.length
      ? `本地执行完成：${target.name}`
      : `本地已执行 ${sent}/${lines.length}`
    focusTerminal()
  }

  const snippetLineCount = (commands: string) => {
    const raw = String(commands || '')
    if (!raw.trim()) return 0
    return raw.split('\n').length
  }

  const ensureSnippetSession = async (target: SnippetItem) => {
    if (target.hostId) {
      const host = hostItems.value.find((item) => item.id === target.hostId)
      if (!host) {
        snippetStatus.value = '片段绑定的主机不存在，请重新选择'
        return false
      }
      const sameHost = sshConnected.value
        && sshForm.value.host === host.host
        && Number(sshForm.value.port || 22) === Number(host.port || 22)
        && sshForm.value.username === host.username
      if (!sameHost) {
        useHost(host)
        await connectSSH({ keepNav: true })
        if (!sshConnected.value) {
          snippetStatus.value = '目标主机连接失败，已停止执行'
          return false
        }
      }
    } else if (!sshConnected.value) {
      snippetStatus.value = '请先连接 SSH，或在片段里绑定目标主机'
      return false
    }
    return true
  }

  const runSnippet = async (item?: SnippetItem) => {
    const target = item
      || snippetItems.value.find((entry) => entry.id === selectedSnippetId.value)
      || snippetEdit.value
    await executeSnippetTask(target)
  }

  const stopSnippet = () => {
    if (!snippetRunning.value) return
    snippetStopRequested.value = true
  }

  const snippetHostLabel = (hostId: string) => {
    if (!hostId) return '当前 SSH 会话'
    const host = hostItems.value.find((item) => item.id === hostId)
    return host ? `${host.name} (${host.host})` : '未找到主机'
  }

  const getTerminalSnippet = () => {
    if (terminalSnippetId.value) {
      const matched = terminalSnippetItems.value.find((item) => item.id === terminalSnippetId.value)
      if (matched) return matched
    }
    if (selectedSnippetId.value) {
      const selected = terminalSnippetItems.value.find((item) => item.id === selectedSnippetId.value)
      if (selected) return selected
    }
    return terminalSnippetItems.value[0] || null
  }

  const runTerminalSnippet = async () => {
    const target = getTerminalSnippet()
    if (!target) {
      snippetStatus.value = '没有可执行的代码片段'
      return
    }

    if (activeTerminalMode.value === 'ssh') {
      await runSnippet(target)
      focusTerminal()
      return
    }

    const lines = snippetCommandLines(target.commands || '')
    if (lines.length === 0) {
      snippetStatus.value = '没有可执行命令（空行和 # 注释会自动跳过）'
      return
    }

    if (activeTerminalMode.value === 'serial') {
      if (!serialConnected.value || !serialCurrentPath.value) {
        snippetStatus.value = '请先连接串口'
        return
      }
      snippetRunning.value = true
      snippetStopRequested.value = false
      let sent = 0
      const delayMs = Math.max(100, Number(snippetRunDelayMs.value || 0))
      for (let i = 0; i < lines.length; i += 1) {
        if (snippetStopRequested.value) break
        const cmd = lines[i]
        const res = await window.lightterm.sendSerial({
          path: serialCurrentPath.value,
          data: `${cmd}\r\n`,
          isHex: false,
        })
        if (!res.ok) {
          snippetStatus.value = `串口发送失败：${res.error || '未知错误'}`
          break
        }
        sent += 1
        if (i < lines.length - 1) await sleep(delayMs)
      }
      snippetRunning.value = false
      snippetStopRequested.value = false
      snippetStatus.value = sent === lines.length
        ? `串口发送完成：${target.name}`
        : `串口已发送 ${sent}/${lines.length}`
      focusTerminal()
      return
    }

    await sendCommandsToLocalTerminal(target, lines)
  }

  const executeSnippetOnLocalTerminal = async (target: SnippetItem) => {
    if (!target?.id) {
      snippetStatus.value = '没有可执行的代码片段'
      return
    }
    const lines = snippetCommandLines(target.commands || '')
    if (lines.length === 0) {
      snippetStatus.value = '没有可执行命令（空行和 # 注释会自动跳过）'
      return
    }
    await sendCommandsToLocalTerminal(target, lines)
  }

  const sendSnippetRawToTerminal = async () => {
    const target = getTerminalSnippet()
    if (!target) {
      snippetStatus.value = '没有可发送的代码片段'
      return
    }
    const payload = target.commands || ''
    if (!payload.trim()) {
      snippetStatus.value = '片段内容为空'
      return
    }

    if (activeTerminalMode.value === 'ssh') {
      const ready = await ensureSnippetSession(target)
      if (!ready) return
    } else if (activeTerminalMode.value === 'serial' && (!serialConnected.value || !serialCurrentPath.value)) {
      snippetStatus.value = '请先连接串口'
      return
    } else if (activeTerminalMode.value === 'local' && (!localConnected.value || !activeLocalSessionId.value)) {
      snippetStatus.value = '请先连接本地终端'
      return
    }

    const res = activeTerminalMode.value === 'ssh'
      ? await window.lightterm.sshWrite({ sessionId: sshSessionId.value, data: payload })
      : activeTerminalMode.value === 'serial'
        ? await window.lightterm.sendSerial({ path: serialCurrentPath.value, data: payload, isHex: false })
        : await window.lightterm.localWrite({ sessionId: activeLocalSessionId.value, data: payload })
    if (res.ok && activeTerminalMode.value === 'local' && activeLocalSessionId.value) {
      recordLocalInput(activeLocalSessionId.value, payload)
    }
    snippetStatus.value = res.ok ? `片段原文已发送：${target.name}` : `片段发送失败：${res.error || '未知错误'}`
    focusTerminal()
  }

  watch(snippetItems, (items) => {
    if (!items.some((item) => item.id === terminalSnippetId.value)) {
      terminalSnippetId.value = items[0]?.id || ''
    }
  }, { immediate: true })

  watch(terminalSnippetItems, (items) => {
    if (!items.some((item) => item.id === terminalSnippetId.value)) {
      terminalSnippetId.value = items[0]?.id || ''
    }
  }, { immediate: true })

  watch(snippetCategories, () => {
    ensureValidCategorySelection()
  }, { immediate: true })

  return {
    snippetItems,
    snippetsLoaded,
    snippetKeyword,
    snippetCategory,
    localSnippetCategory,
    localSnippetKeyword,
    terminalSnippetCategory,
    snippetStatus,
    snippetRunDelayMs,
    snippetRunning,
    snippetStopRequested,
    selectedSnippetId,
    snippetEditorVisible,
    snippetEdit,
    snippetExtraCategories,
    newSnippetCategoryName,
    newSnippetCategoryInputVisible,
    editingSnippetCategory,
    editingSnippetCategoryName,
    terminalSnippetId,
    snippetCategories,
    displaySnippetCategories,
    filteredSnippetItems,
    localSnippetCategories,
    filteredLocalSnippetItems,
    terminalSnippetCategories,
    currentSessionHostId,
    terminalSnippetItems,
    createEmptySnippet,
    restoreSnippets,
    openSnippetEditor,
    clearSnippetEditor,
    beginAddSnippetCategory,
    addSnippetCategory,
    beginRenameSnippetCategory,
    cancelRenameSnippetCategory,
    renameSnippetCategory,
    deleteSnippetCategory,
    saveSnippet,
    deleteSnippet,
    executeSnippetTask,
    snippetCommandLines,
    snippetLineCount,
    runSnippet,
    stopSnippet,
    snippetHostLabel,
    formatSnippetRunTime,
    snippetLastRunLabel,
    snippetListRunLabel,
    snippetLastRunTone,
    snippetReminderDate,
    snippetReminderDays,
    snippetReminderLabel,
    snippetReminderTone,
    getTerminalSnippet,
    runTerminalSnippet,
    executeSnippetOnLocalTerminal,
    sendSnippetRawToTerminal,
  }
}
