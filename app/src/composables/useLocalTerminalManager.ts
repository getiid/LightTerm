import { computed, ref, type Ref } from 'vue'

type TerminalMode = 'ssh' | 'serial' | 'local'
type LocalCommandState = 'idle' | 'running' | 'error' | 'closed'

type LocalTabItem = {
  id: string
  sessionId: string
  name: string
  cwd: string
  connected: boolean
  status: string
  commandPreview: string
  commandState: LocalCommandState
}

type UseLocalTerminalManagerParams = {
  isWindowsClient: Readonly<Ref<boolean>>
  activeTerminalMode: Ref<TerminalMode>
  focusTerminal: Ref<boolean>
  saveSessionRestoreState: (payload: any) => void
  clearSessionRestoreState: () => void
  renderLocalSession: (sessionId: string, options?: { announce?: string }) => Promise<void>
}

export function useLocalTerminalManager(params: UseLocalTerminalManagerParams) {
  const {
    isWindowsClient,
    activeTerminalMode,
    focusTerminal,
    saveSessionRestoreState,
    clearSessionRestoreState,
    renderLocalSession,
  } = params

  const localTabs = ref<LocalTabItem[]>([])
  const activeLocalTabId = ref('')
  const selectedLocalTabId = ref('')
  const localBufferBySession = ref<Record<string, string>>({})
  const localInputDraftBySession = ref<Record<string, string>>({})
  const localOutputTailBySession = ref<Record<string, string>>({})
  const localCwd = ref('')
  const localStatus = ref('未连接')
  const localShellType = ref<'auto' | 'cmd' | 'powershell'>('auto')
  const localElevated = ref(false)

  const activeLocalTab = computed(() => localTabs.value.find((tab) => tab.id === activeLocalTabId.value) || null)
  const selectedLocalTab = computed(() => {
    if (selectedLocalTabId.value) {
      return localTabs.value.find((tab) => tab.id === selectedLocalTabId.value) || null
    }
    return activeLocalTab.value
  })
  const activeLocalSessionId = computed(() => selectedLocalTab.value?.sessionId || '')
  const localConnected = computed(() => !!selectedLocalTab.value?.connected)

  const createLocalSessionId = () => `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const createLocalTabId = () => `ltab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  const stripAnsi = (input: string) => String(input || '')
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '')
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')

  const sanitizeCommandPreview = (input: string) => stripAnsi(String(input || ''))
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const sanitizeOutputLine = (input: string) => stripAnsi(String(input || ''))
    .replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '')
    .trim()

  const isLikelyLocalPromptLine = (text: string) => {
    const value = String(text || '').trim()
    if (!value) return false
    const compact = value.replace(/\s+/g, ' ')
    if (/^[\w.-]+@[\w.-]+.*[>%#$]\s*$/.test(compact)) return true
    if (/^\[[^\]]+@[\w.-]+\s+[^\]]+\][>%#$]\s*$/.test(compact)) return true
    if (/^[A-Za-z]:\\.*>\s*$/.test(compact)) return true
    if (/^PS\s+.+>\s*$/.test(compact)) return true
    return false
  }

  const getLocalTabBySessionId = (sessionId: string) => localTabs.value.find((item) => item.sessionId === sessionId) || null

  const localCommandTitle = (tab: LocalTabItem) => tab.commandPreview || '等待命令'

  const localCommandStateLabel = (tab: LocalTabItem) => {
    if (tab.commandState === 'running') return '处理中'
    if (tab.commandState === 'error') return '异常'
    if (tab.commandState === 'closed') return '已断开'
    return tab.commandPreview ? '已完成' : '等待命令'
  }

  const localCommandStateClass = (tab: LocalTabItem) => {
    if (tab.commandState === 'running') return 'running'
    if (tab.commandState === 'error') return 'error'
    if (tab.commandState === 'closed') return 'offline'
    return tab.commandPreview ? 'done' : 'plain'
  }

  const localCommandMeta = (tab: LocalTabItem) => tab.cwd || tab.status || tab.name || ''

  const markLocalCommandSubmitted = (sessionId: string, draftRaw: string) => {
    const tab = getLocalTabBySessionId(sessionId)
    if (!tab) return
    const command = sanitizeCommandPreview(draftRaw).slice(0, 160)
    if (!command) return
    tab.commandPreview = command
    tab.commandState = 'running'
    if (sessionId === activeLocalSessionId.value) {
      localStatus.value = `执行中：${command}`
    }
  }

  const localSessionLabel = (cwd: string, idx: number) => {
    const normalized = String(cwd || '').trim()
    const tail = normalized.split(/[\\/]/).filter(Boolean).pop() || '~'
    return `${tail} · ${idx}`
  }

  const switchLocalTab = async (tabId: string) => {
    const tab = localTabs.value.find((item) => item.id === tabId)
    if (!tab) return
    selectedLocalTabId.value = tab.id
    activeLocalTabId.value = tab.id
    localStatus.value = tab.status || (tab.connected ? '已连接' : '未连接')
    localCwd.value = tab.cwd || localCwd.value
    activeTerminalMode.value = 'local'
    if (focusTerminal.value) {
      await renderLocalSession(tab.sessionId)
    }
  }

  const recordLocalInput = (sessionId: string, data: string) => {
    const tab = getLocalTabBySessionId(sessionId)
    if (!tab) return
    const normalized = String(data || '')
      .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
      .replace(/\x1b./g, '')
    let draft = String(localInputDraftBySession.value[sessionId] || '')
    for (const char of normalized) {
      if (char === '\u0003') {
        draft = ''
        tab.commandState = 'idle'
        continue
      }
      if (char === '\r' || char === '\n') {
        markLocalCommandSubmitted(sessionId, draft)
        draft = ''
        continue
      }
      if (char === '\b' || char === '\u007f') {
        draft = draft.slice(0, -1)
        continue
      }
      if (char >= ' ') draft += char
    }
    localInputDraftBySession.value[sessionId] = draft.slice(-400)
  }

  const selectLocalTab = (tabId: string) => {
    const tab = localTabs.value.find((item) => item.id === tabId)
    if (!tab) return
    selectedLocalTabId.value = tab.id
    localStatus.value = `已选中：${tab.commandPreview || tab.name}`
    localCwd.value = tab.cwd || localCwd.value
  }

  const openLocalTab = async (tabId: string) => {
    if (!tabId) return
    focusTerminal.value = true
    await switchLocalTab(tabId)
  }

  const connectLocalTerminal = async () => {
    const sessionId = createLocalSessionId()
    const tabId = createLocalTabId()
    const tabIndex = localTabs.value.length + 1
    const res = await window.lightterm.localConnect({
      sessionId,
      cwd: localCwd.value.trim() || undefined,
      cols: 120,
      rows: 30,
      shellType: localShellType.value,
      elevated: !!(isWindowsClient.value && localElevated.value),
    })
    if (!res.ok) {
      localStatus.value = `连接失败：${res.error || '未知错误'}`
      return
    }

    const finalCwd = String(res.cwd || localCwd.value || '~')
    const warningText = String((res as any)?.warning || '').trim()
    const tab: LocalTabItem = {
      id: tabId,
      sessionId,
      name: localSessionLabel(finalCwd, tabIndex),
      cwd: finalCwd,
      connected: true,
      status: `${res.shell || 'shell'} @ ${finalCwd}`,
      commandPreview: '',
      commandState: 'idle',
    }
    localTabs.value.push(tab)
    selectedLocalTabId.value = tabId
    localBufferBySession.value[sessionId] = ''
    localInputDraftBySession.value[sessionId] = ''
    localOutputTailBySession.value[sessionId] = ''
    await switchLocalTab(tabId)

    activeTerminalMode.value = 'local'
    focusTerminal.value = true
    saveSessionRestoreState({ type: 'local', cwd: finalCwd })
    localStatus.value = warningText ? `${tab.status} ｜ ⚠ ${warningText}` : tab.status
    localCwd.value = finalCwd
    await renderLocalSession(sessionId, { announce: `[本地终端已连接] ${tab.status}` })
  }

  const closeLocalTab = async (tabId: string) => {
    const tab = localTabs.value.find((item) => item.id === tabId)
    if (!tab) return
    if (tab.connected && tab.sessionId) {
      await window.lightterm.localDisconnect({ sessionId: tab.sessionId })
    }
    localTabs.value = localTabs.value.filter((item) => item.id !== tabId)
    delete localBufferBySession.value[tab.sessionId]
    delete localInputDraftBySession.value[tab.sessionId]
    delete localOutputTailBySession.value[tab.sessionId]

    if (!localTabs.value.length) {
      activeLocalTabId.value = ''
      selectedLocalTabId.value = ''
      localStatus.value = '已断开'
      clearSessionRestoreState()
      if (activeTerminalMode.value === 'local') focusTerminal.value = false
      return
    }

    if (selectedLocalTabId.value === tabId) {
      selectedLocalTabId.value = localTabs.value[localTabs.value.length - 1]?.id || ''
    }
    if (activeLocalTabId.value === tabId) {
      const fallback = localTabs.value[localTabs.value.length - 1]
      if (fallback) await switchLocalTab(fallback.id)
    }
  }

  const disconnectLocalTerminal = async () => {
    if (!activeLocalTabId.value) return
    await closeLocalTab(activeLocalTabId.value)
  }

  const runLocalQuickCommand = async (cmd: string) => {
    const text = String(cmd || '').trim()
    if (!localConnected.value || !activeLocalSessionId.value) {
      localStatus.value = '请先连接本地终端'
      return
    }
    if (!text) return
    const res = await window.lightterm.localWrite({ sessionId: activeLocalSessionId.value, data: `${text}\n` })
    if (!res.ok) {
      localStatus.value = `发送失败：${res.error || '未知错误'}`
      return
    }
    recordLocalInput(activeLocalSessionId.value, `${text}\n`)
    activeTerminalMode.value = 'local'
    focusTerminal.value = true
    await renderLocalSession(activeLocalSessionId.value)
  }

  const appendLocalData = (sessionId: string, text: string) => {
    localBufferBySession.value[sessionId] = `${localBufferBySession.value[sessionId] || ''}${text}`
    const tab = getLocalTabBySessionId(sessionId)
    if (!tab) return
    const merged = `${localOutputTailBySession.value[sessionId] || ''}${String(text || '')}`.replace(/\r/g, '\n')
    const lines = merged.split('\n')
    localOutputTailBySession.value[sessionId] = String(lines.pop() || '').slice(-400)
    const checkPrompt = (rawLine: string) => {
      const content = sanitizeOutputLine(rawLine)
      if (!content) return
      if (isLikelyLocalPromptLine(content)) {
        if (tab.commandState === 'running') tab.commandState = 'idle'
        if (sessionId === activeLocalSessionId.value) {
          localStatus.value = tab.commandPreview ? `已完成：${tab.commandPreview}` : tab.status
        }
      }
    }
    lines.forEach(checkPrompt)
    checkPrompt(localOutputTailBySession.value[sessionId] || '')
  }

  const handleLocalClose = (sessionId: string, code: number) => {
    const tab = localTabs.value.find((item) => item.sessionId === sessionId)
    if (!tab) return
    tab.connected = false
    tab.commandState = 'closed'
    tab.status = `本地终端已断开（code=${code}）`
    if (sessionId === activeLocalSessionId.value) {
      localStatus.value = tab.status
    }
  }

  const handleLocalError = (sessionId: string, error: string) => {
    const tab = localTabs.value.find((item) => item.sessionId === sessionId)
    if (!tab) return
    tab.commandState = 'error'
    tab.status = `本地终端错误：${error || '未知错误'}`
    if (sessionId === activeLocalSessionId.value) {
      localStatus.value = tab.status
    }
  }

  const disconnectAllLocalTabs = async () => {
    for (const tab of localTabs.value) {
      if (tab.connected && tab.sessionId) {
        await window.lightterm.localDisconnect({ sessionId: tab.sessionId })
      }
    }
  }

  return {
    localTabs,
    activeLocalTabId,
    selectedLocalTabId,
    localBufferBySession,
    localCwd,
    localStatus,
    localShellType,
    localElevated,
    activeLocalTab,
    activeLocalSessionId,
    localConnected,
    localCommandTitle,
    localCommandStateLabel,
    localCommandStateClass,
    localCommandMeta,
    selectLocalTab,
    switchLocalTab,
    openLocalTab,
    recordLocalInput,
    connectLocalTerminal,
    closeLocalTab,
    disconnectLocalTerminal,
    runLocalQuickCommand,
    appendLocalData,
    handleLocalClose,
    handleLocalError,
    disconnectAllLocalTabs,
  }
}
