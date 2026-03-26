import type { Ref } from 'vue'
import { useHostCrud } from './useHostCrud'
import { useHostFilters } from './useHostFilters'
import { useHostProbe } from './useHostProbe'

type UseHostWorkspaceParams = {
  hostItems: Ref<any[]>
  extraCategories: Ref<string[]>
  selectedHostId: Ref<string>
  sshForm: Ref<any>
  quickConnectInput: Ref<string>
  hostName: Ref<string>
  hostCategory: Ref<string>
  authType: Ref<'password' | 'key'>
  selectedKeyRef: Ref<string>
  sshStatus: Ref<string>
  editingHost: Ref<any | null>
  editPasswordVisible: Ref<boolean>
  hostEditorVisible: Ref<boolean>
  hostsLoaded: Ref<boolean>
  defaultCategory: string
  allCategory: string
  notify: (ok: boolean, message: string) => void
  sshTabs: Ref<any[]>
  switchSshTab: (sessionId: string) => void
  focusTerminal: Ref<boolean>
  createSshTab: (name?: string, meta?: { hostId?: string; host?: string; port?: number; username?: string }) => string
  closeSshTab: (sessionId: string) => Promise<void>
  connectSSH: (options?: { keepNav?: boolean } | Event) => Promise<boolean>
}

export function useHostWorkspace(params: UseHostWorkspaceParams) {
  const {
    hostItems,
    extraCategories,
    selectedHostId,
    sshForm,
    quickConnectInput,
    hostName,
    hostCategory,
    authType,
    selectedKeyRef,
    sshStatus,
    editingHost,
    editPasswordVisible,
    hostEditorVisible,
    hostsLoaded,
    defaultCategory,
    allCategory,
    notify,
    sshTabs,
    switchSshTab,
    focusTerminal,
    createSshTab,
    closeSshTab,
    connectSSH,
  } = params

  let selectedCategoryRef: Ref<string> | null = null
  let hostCategoriesRef: Ref<string[]> | null = null
  let syncHostProbeMap = () => {}
  let probeAllHosts = async () => {}

  const refreshHosts = async (options: { probe?: boolean } = {}) => {
    const res = await window.lightterm.hostsList()
    if (!res.ok) return

    hostItems.value = res.items || []
    extraCategories.value = Array.isArray(res.extraCategories) ? res.extraCategories : []
    hostsLoaded.value = true

    if (
      selectedCategoryRef
      && hostCategoriesRef
      && !hostCategoriesRef.value.includes(selectedCategoryRef.value)
      && selectedCategoryRef.value !== allCategory
    ) {
      selectedCategoryRef.value = allCategory
    }

    syncHostProbeMap()
    if (options.probe) await probeAllHosts()
  }

  const hostFilters = useHostFilters({
    hostItems,
    extraCategories,
    defaultCategory,
    allCategory,
    notify,
    refreshHosts: async () => refreshHosts(),
  })

  selectedCategoryRef = hostFilters.selectedCategory
  hostCategoriesRef = hostFilters.hostCategories as unknown as Ref<string[]>

  const hostProbe = useHostProbe({
    hostItems,
    filteredHosts: hostFilters.filteredHosts as unknown as Ref<any[]>,
  })

  syncHostProbeMap = hostProbe.syncHostProbeMap
  probeAllHosts = hostProbe.probeAllHosts

  const applyHostToConnectionForm = (host: any) => {
    if (!host) return
    selectedHostId.value = String(host?.id || '')
    sshForm.value.host = String(host?.host || '')
    sshForm.value.port = Number(host?.port || 22)
    sshForm.value.username = String(host?.username || '')
    sshForm.value.password = String(host?.password || '')
    quickConnectInput.value = `${sshForm.value.username}@${sshForm.value.host}${sshForm.value.port && Number(sshForm.value.port) !== 22 ? `:${sshForm.value.port}` : ''}`
    hostName.value = String(host?.name || sshForm.value.host || '')
    hostCategory.value = String(host?.category || defaultCategory)
    authType.value = host?.auth_type === 'key' ? 'key' : 'password'
    selectedKeyRef.value = String(host?.private_key_ref || '')
  }

  const findExistingSshTabs = (host: any) => {
    const hostId = String(host?.id || '')
    const hostValue = String(host?.host || '').trim()
    const username = String(host?.username || '').trim()
    const port = Number(host?.port || 22)
    const matches = sshTabs.value.filter((tab) => {
      if (!tab) return false
      if (hostId && String(tab.hostId || '') === hostId) return true
      return String(tab.host || '').trim() === hostValue
        && String(tab.username || '').trim() === username
        && Number(tab.port || 22) === port
    })
    return matches
  }

  const hostConnectedSessionCount = (host: any) => findExistingSshTabs(host).filter((tab) => tab.connected).length

  const openExistingHostTerminal = async (host: any) => {
    const matches = findExistingSshTabs(host)
    const existingTab = matches.find((tab) => tab.connected) || matches[0] || null
    if (!existingTab?.id) {
      sshStatus.value = '当前主机没有已打开的 SSH 会话'
      return
    }
    applyHostToConnectionForm(host)
    const res = await window.lightterm.sshList()
    if (!res.ok) {
      sshStatus.value = 'SSH 会话状态获取失败，正在重新连接...'
      await connectHostTerminal(host)
      return
    }
    const activeSessionIds = new Set((res.items || []).map((item) => String(item?.sessionId || '')))
    if (!activeSessionIds.has(String(existingTab.id))) {
      sshStatus.value = '原 SSH 会话已失效，正在重新连接...'
      await connectHostTerminal(host)
      return
    }
    switchSshTab(existingTab.id)
    focusTerminal.value = true
    sshStatus.value = `已进入 SSH 会话：${existingTab.name || host?.name || host?.host || '已连接主机'}`
  }

  const connectHostTerminal = async (host: any) => {
    applyHostToConnectionForm(host)
    const tabId = createSshTab((host?.name || host?.host || '新会话').trim(), {
      hostId: String(host?.id || ''),
      host: String(host?.host || ''),
      port: Number(host?.port || 22),
      username: String(host?.username || ''),
    })
    const ok = await connectSSH()
    if (!ok) await closeSshTab(tabId)
  }

  const hostCrud = useHostCrud({
    sshForm,
    quickConnectInput,
    selectedHostId,
    hostName,
    hostCategory,
    selectedCategory: hostFilters.selectedCategory as unknown as Ref<string>,
    defaultCategory,
    allCategory,
    authType,
    selectedKeyRef,
    sshStatus,
    editingHost,
    editPasswordVisible,
    hostEditorVisible,
    notify,
    refreshHosts: async () => refreshHosts(),
    connectHostTerminal,
  })

  return {
    refreshHosts,
    hostConnectedSessionCount,
    openExistingHostTerminal,
    ...hostFilters,
    ...hostProbe,
    ...hostCrud,
  }
}
