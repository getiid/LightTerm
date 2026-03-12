<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Server, FolderTree, Cable, KeyRound, RefreshCcwDot, Settings, Pencil } from 'lucide-vue-next'
import '@xterm/xterm/css/xterm.css'

type NavKey = 'hosts' | 'sftp' | 'serial' | 'vault' | 'sync' | 'settings'
const nav = ref<NavKey>('hosts')
const termEl = ref<HTMLElement | null>(null)

const sshForm = ref({ host: '', port: 22, username: 'root', password: '' })
const authType = ref<'password' | 'key'>('password')
const selectedKeyRef = ref('')
const sshStatus = ref('AstraShell 启动成功。')
const sshSessionId = ref('default')
const sshConnected = ref(false)
const focusTerminal = ref(false)

type LocalSSHConfig = { host: string; port?: number; username: string; password?: string; privateKey?: string }
const sshTabs = ref<Array<{ id: string; name: string; connected: boolean }>>([{ id: 'default', name: '会话-1', connected: false }])
const sshBuffers = ref<Record<string, string>>({ default: '' })

const hostName = ref('')
const hostCategory = ref('默认')
const hostItems = ref<any[]>([])
const selectedHostId = ref('')
const editingHost = ref<any | null>(null)
const hostEditorVisible = ref(false)
const selectedCategory = ref('默认')
const hostKeyword = ref('')
const newCategoryName = ref('')
const newCategoryInputVisible = ref(false)

const extraCategories = ref<string[]>([])

const notify = (ok: boolean, message: string) => {
  if (ok) {
    sshStatus.value = `✅ ${message}`
    window.alert(`✅ ${message}`)
  } else {
    sshStatus.value = `❌ ${message}`
    window.alert(`❌ ${message}`)
  }
}

const hostCategories = computed(() => {
  const set = new Set<string>(['默认'])
  hostItems.value.forEach((h) => set.add(h.category || '默认'))
  extraCategories.value.forEach((c) => set.add(c))
  return Array.from(set)
})

const createHost = () => {
  editingHost.value = {
    id: undefined,
    name: '',
    host: '',
    port: 22,
    username: 'root',
    password: '',
    category: selectedCategory.value || '默认',
    authType: 'password',
    privateKeyRef: '',
    purchaseDate: '',
    expiryDate: '',
  }
  hostEditorVisible.value = true
}

const addCategory = () => {
  const name = newCategoryName.value.trim()
  if (!name) {
    newCategoryInputVisible.value = false
    return
  }
  if (!extraCategories.value.includes(name) && !hostCategories.value.includes(name)) {
    extraCategories.value.push(name)
  }
  selectedCategory.value = name
  newCategoryName.value = ''
  newCategoryInputVisible.value = false
  notify(true, `分类已新建：${name}`)
}

const beginAddCategory = () => {
  newCategoryInputVisible.value = true
  newCategoryName.value = ''
}

const renameCategoryInline = async (from: string) => {
  if (from === '默认') return
  const to = window.prompt('重命名分类', from)?.trim()
  if (!to || to === from) return

  extraCategories.value = extraCategories.value.map((c) => (c === from ? to : c))

  const targets = hostItems.value.filter((h) => (h.category || '默认') === from)
  for (const h of targets) {
    await window.lightterm.hostsSave({
      id: h.id,
      name: h.name,
      host: h.host,
      port: h.port,
      username: h.username,
      password: h.password || '',
      category: to,
      authType: h.auth_type || 'password',
      privateKeyRef: h.private_key_ref || null,
    })
  }
  selectedCategory.value = to
  await refreshHosts()
  notify(true, `分类已重命名：${from} → ${to}`)
}

const groupedHosts = computed(() => {
  const keyword = hostKeyword.value.trim().toLowerCase()
  const rows = hostItems.value.filter((h) => {
    const inCategory = (h.category || '默认') === selectedCategory.value
    if (!inCategory) return false
    if (!keyword) return true
    return [h.name, h.host, h.username, h.category].some((v) => String(v || '').toLowerCase().includes(keyword))
  })
  const map = new Map<string, any[]>()
  rows.forEach((h) => {
    const cat = h.category || '默认'
    if (!map.has(cat)) map.set(cat, [])
    map.get(cat)!.push(h)
  })
  return Array.from(map.entries()).map(([name, items]) => ({ name, items }))
})

const sftpPath = ref('.')
const sftpRows = ref<any[]>([])
const sftpStatus = ref('')
const sftpHostId = ref('')
const sftpConnected = ref(false)
const sftpConnectPanelOpen = ref(false)
const sftpDragLocalPath = ref('')
const sftpDragRemoteFile = ref('')
const sftpUploadProgress = ref(0)
const sftpDownloadProgress = ref(0)
const selectedRemoteFile = ref('')
const sftpNewDirName = ref('')
const sftpRenameTo = ref('')
const remoteMenu = ref({ visible: false, x: 0, y: 0, filename: '' })
const localPath = ref('')
const localRows = ref<any[]>([])
const selectedLocalFile = ref('')

const vaultMaster = ref('')
const vaultStatus = ref('')
const bridgeReady = ref(typeof window !== 'undefined' && !!window.lightterm)
const vaultInitialized = ref(false)
const vaultUnlocked = ref(false)
const vaultItems = ref<any[]>([])
const vaultKeyName = ref('')
const vaultPrivateKey = ref('')
const vaultPublicKey = ref('')
const vaultCertificate = ref('')
const vaultKeyType = ref('auto')

const syncStatusText = ref('本地版：不走云端账号，同步依赖共享文件夹数据库。')
const syncQueueCount = ref(0)

const storageDbPath = ref('')
const storageFolderInput = ref('')
const storageMsg = ref('')

const serialPorts = ref<any[]>([])
const serialForm = ref<{ path: string; baudRate: number; dataBits: number; stopBits: number; parity: 'none' | 'even' | 'odd' }>({
  path: '', baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none',
})
const serialSendText = ref('')
const serialHexMode = ref(false)
const serialTimerMs = ref(0)
let serialTimer: number | null = null

let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null

watch(focusTerminal, (value) => {
  if (value) {
    nextTick(() => {
      initTerminal()
      fitAddon?.fit()
    })
  }
})

const initTerminal = () => {
  if (!termEl.value || terminal) return
  terminal = new Terminal({ convertEol: true, fontSize: 13, theme: { background: '#f8fafc', foreground: '#111827', cursor: '#2563eb' } })
  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.open(termEl.value)
  fitAddon.fit()
  // 启动提示改到状态栏，不占终端可视面积

  terminal.onData((data) => sshConnected.value && window.lightterm.sshWrite({ sessionId: sshSessionId.value, data }))
  window.lightterm.onSshData((msg) => {
    sshBuffers.value[msg.sessionId] = (sshBuffers.value[msg.sessionId] || '') + msg.data
    if (msg.sessionId === sshSessionId.value) terminal?.write(msg.data)
  })
  window.lightterm.onSshClose((msg) => {
    const tab = sshTabs.value.find((t) => t.id === msg.sessionId)
    if (tab) tab.connected = false
    if (msg.sessionId === sshSessionId.value) {
      sshConnected.value = false
      terminal?.writeln('\r\n[SSH 已断开]')
    }
  })
  window.lightterm.onSshError((msg) => msg.sessionId === sshSessionId.value && terminal?.writeln(`\r\n[SSH 错误] ${msg.error}`))
  window.lightterm.onSerialData((msg) => terminal?.writeln(`\r\n[串口 ${msg.path}] ${msg.data}`))
}

const restoreSshTabs = () => {
  try {
    const raw = localStorage.getItem('lightterm.sshTabs')
    if (!raw) return
    const parsed = JSON.parse(raw) as Array<{ id: string; name: string }>
    if (!Array.isArray(parsed) || parsed.length === 0) return
    sshTabs.value = parsed.map((p) => ({ ...p, connected: false }))
    const first = sshTabs.value[0]
    if (first) sshSessionId.value = first.id
    const buffers: Record<string, string> = {}
    sshTabs.value.forEach((t) => (buffers[t.id] = ''))
    sshBuffers.value = buffers
  } catch {}
}

const connectSSH = async () => {
  let privateKey = ''
  if (authType.value === 'key') {
    if (!selectedKeyRef.value) {
      sshStatus.value = '请先选择密钥'
      return
    }
    const keyRes = await window.lightterm.vaultKeyGet({ id: selectedKeyRef.value })
    if (!keyRes.ok) {
      sshStatus.value = `读取密钥失败：${keyRes.error}`
      return
    }
    privateKey = keyRes.item?.privateKey || ''
  }

  const res = await window.lightterm.sshConnect({
    ...sshForm.value,
    password: authType.value === 'password' ? sshForm.value.password : undefined,
    privateKey: authType.value === 'key' ? privateKey : undefined,
    sessionId: sshSessionId.value,
  })
  sshConnected.value = !!res.ok
  const tab = sshTabs.value.find((t) => t.id === sshSessionId.value)
  if (tab) tab.connected = !!res.ok
  sshStatus.value = res.ok ? 'SSH 交互会话已连接' : `SSH 连接失败：${res.error}`
  if (res.ok) {
    terminal?.writeln('\r\n[SSH 已连接，可直接输入命令]')
    focusTerminal.value = true
    nav.value = 'hosts'
  }
}

const refreshHosts = async () => {
  const res = await window.lightterm.hostsList()
  if (res.ok) {
    hostItems.value = res.items || []
    if (!hostCategories.value.includes(selectedCategory.value)) selectedCategory.value = '默认'
  }
}
const saveCurrentHost = async () => {
  const res = await window.lightterm.hostsSave({
    name: hostName.value || sshForm.value.host,
    category: hostCategory.value || '默认',
    ...sshForm.value,
    authType: authType.value,
    privateKeyRef: selectedKeyRef.value || null,
  })
  if (res.ok) {
    await refreshHosts()
    notify(true, '主机已保存')
  } else {
    notify(false, `主机保存失败：${res.error || '未知错误'}`)
  }
}
const useHost = (h: any) => {
  selectedHostId.value = h.id
  sshForm.value.host = h.host
  sshForm.value.port = h.port
  sshForm.value.username = h.username
  sshForm.value.password = h.password || ''
  hostName.value = h.name
  hostCategory.value = h.category || '默认'
  authType.value = h.auth_type === 'key' ? 'key' : 'password'
  selectedKeyRef.value = h.private_key_ref || ''
}
const openHostEditor = (h: any) => {
  useHost(h)
  editingHost.value = {
    id: h.id,
    name: h.name,
    host: h.host,
    port: h.port,
    username: h.username,
    password: h.password || '',
    category: h.category || '默认',
    authType: h.auth_type || 'password',
    privateKeyRef: h.private_key_ref || '',
    purchaseDate: h.purchaseDate || '',
    expiryDate: h.expiryDate || '',
  }
  hostEditorVisible.value = true
}

const openHostTerminal = async (h: any) => {
  openHostEditor(h)
  await connectSSH()
}
const saveEditedHost = async () => {
  if (!editingHost.value) return
  const h = editingHost.value
  const res = await window.lightterm.hostsSave({
    id: h.id || undefined,
    name: h.name,
    host: h.host,
    port: Number(h.port || 22),
    username: h.username,
    password: h.password || '',
    category: h.category || '默认',
    authType: h.authType || 'password',
    privateKeyRef: h.privateKeyRef || null,
    purchaseDate: h.purchaseDate || '',
    expiryDate: h.expiryDate || '',
  })
  if (res.ok) {
    await refreshHosts()
    notify(true, '主机参数已更新')
  } else {
    notify(false, `更新失败：${res.error || '未知错误'}`)
  }
}
const deleteCurrentHost = async () => {
  if (!selectedHostId.value) return
  await window.lightterm.hostsDelete({ id: selectedHostId.value })
  selectedHostId.value = ''
  editingHost.value = null
  hostEditorVisible.value = false
  await refreshHosts()
  sshStatus.value = '主机已删除'
}

const loadLocalFs = async () => {
  const res = await window.lightterm.localfsList({ localPath: localPath.value || undefined })
  if (!res.ok) return
  localPath.value = res.path || localPath.value
  localRows.value = res.items || []
}

const getSftpConfig = async () => {
  const host = hostItems.value.find((h) => h.id === sftpHostId.value)
  if (!host) {
    return { error: '请选择 SSH 服务器' }
  }

  const cfg: LocalSSHConfig = {
    host: host.host,
    port: Number(host.port || 22),
    username: host.username,
    password: host.password || undefined,
  }

  if (host.auth_type === 'key') {
    if (!host.private_key_ref) {
      return { error: '该主机未绑定密钥' }
    }
    const keyRes = await window.lightterm.vaultKeyGet({ id: host.private_key_ref })
    if (!keyRes.ok) {
      return { error: keyRes.error || '读取密钥失败' }
    }
    const privateKey = keyRes.item?.privateKey
    if (!privateKey) {
      return { error: '密钥内容为空' }
    }
    cfg.privateKey = privateKey
  }

  return { config: cfg }
}

const connectSftp = async () => {
  const { config, error } = await getSftpConfig()
  if (!config) {
    sftpStatus.value = error || '请选择 SSH 服务器'
    sftpConnected.value = false
    return
  }
  sftpConnected.value = true
  sftpConnectPanelOpen.value = false
  sftpStatus.value = `已连接：${config.host}`
  await loadSftp()
}

const loadSftp = async () => {
  const { config, error } = await getSftpConfig()
  if (!config) {
    sftpStatus.value = error || '请先选择并连接 SSH 服务器'
    return
  }
  sftpStatus.value = '读取中...'
  const res = await window.lightterm.sftpList({ ...config, remotePath: sftpPath.value })
  if (!res.ok) return (sftpStatus.value = `读取失败：${res.error}`)
  sftpRows.value = res.items || []
  sftpStatus.value = `已读取 ${sftpRows.value.length} 项`
}
const uploadSftp = async () => {
  const { config, error } = await getSftpConfig()
  if (!config) {
    sftpStatus.value = error || '请先选择并连接 SSH 服务器'
    return
  }
  sftpUploadProgress.value = 0
  const res = await window.lightterm.sftpUpload({ ...config, remoteDir: sftpPath.value, localFile: selectedLocalFile.value || undefined })
  sftpStatus.value = res.ok ? `上传成功：${res.remoteFile}` : `上传失败：${res.error}`
  if (res.ok) await loadSftp()
}
const openLocalItem = async (item: any) => {
  if (!item?.isDir) {
    selectedLocalFile.value = item.path
    return
  }
  localPath.value = item.path
  await loadLocalFs()
}
const localGoUp = async () => {
  if (!localPath.value) return
  const parts = localPath.value.split('/').filter(Boolean)
  const parent = parts.length ? `/${parts.slice(0, -1).join('/')}` || '/' : '/'
  localPath.value = parent
  await loadLocalFs()
}
const openRemoteItem = async (item: any) => {
  hideRemoteMenu()
  if (item?.isDir) {
    sftpPath.value = `${sftpPath.value.replace(/\/$/, '')}/${item.filename}`
    await loadSftp()
    return
  }
  selectedRemoteFile.value = item.filename
}

const onLocalDragStart = (item: any) => {
  if (item?.isDir) return
  sftpDragLocalPath.value = item.path
}

const onRemoteDragStart = (item: any) => {
  if (item?.isDir) return
  sftpDragRemoteFile.value = item.filename
}

const onRemoteDrop = async () => {
  if (!sftpDragLocalPath.value) return
  selectedLocalFile.value = sftpDragLocalPath.value
  await uploadSftp()
  sftpDragLocalPath.value = ''
}

const onLocalDrop = async () => {
  const { config, error } = await getSftpConfig()
  if (!config) {
    sftpStatus.value = error || '请先选择并连接 SSH 服务器'
    return
  }
  if (!sftpDragRemoteFile.value) return
  const remoteFile = `${sftpPath.value.replace(/\/$/, '')}/${sftpDragRemoteFile.value}`
  const res = await window.lightterm.sftpDownloadToLocal({ ...config, remoteFile, localDir: localPath.value || '/', filename: sftpDragRemoteFile.value })
  sftpStatus.value = res.ok ? `拖拽下载成功：${res.filePath}` : `拖拽下载失败：${res.error}`
  sftpDragRemoteFile.value = ''
  if (res.ok) await loadLocalFs()
}
const showRemoteMenu = (event: MouseEvent, item: any) => {
  event.preventDefault()
  selectedRemoteFile.value = item.filename
  remoteMenu.value = { visible: true, x: event.clientX, y: event.clientY, filename: item.filename }
}
const hideRemoteMenu = () => {
  remoteMenu.value.visible = false
}
const menuDownload = async () => {
  hideRemoteMenu()
  await downloadSftp()
}
const menuRename = async () => {
  hideRemoteMenu()
  const next = window.prompt('重命名为', selectedRemoteFile.value)
  if (!next) return
  sftpRenameTo.value = next
  await renameSftp()
}
const menuDelete = async () => {
  hideRemoteMenu()
  await deleteSftp()
}

const promptMkdirSftp = async () => {
  const name = window.prompt('新目录名', '')
  if (!name) return
  sftpNewDirName.value = name
  await mkdirSftp()
}
const remoteGoUp = async () => {
  const parts = sftpPath.value.split('/').filter(Boolean)
  sftpPath.value = parts.length ? `/${parts.slice(0, -1).join('/')}` || '/' : '/'
  await loadSftp()
}
const downloadSftp = async () => {
  const { config, error } = await getSftpConfig()
  if (!config) {
    sftpStatus.value = error || '请先选择并连接 SSH 服务器'
    return
  }
  if (!selectedRemoteFile.value) {
    sftpStatus.value = '请先在列表中选择远程文件'
    return
  }
  sftpDownloadProgress.value = 0
  const remoteFile = `${sftpPath.value.replace(/\/$/, '')}/${selectedRemoteFile.value}`
  const res = await window.lightterm.sftpDownload({ ...config, remoteFile })
  sftpStatus.value = res.ok ? `下载成功：${res.filePath}` : `下载失败：${res.error}`
}
const mkdirSftp = async () => {
  const { config, error } = await getSftpConfig()
  if (!config) {
    sftpStatus.value = error || '请先选择并连接 SSH 服务器'
    return
  }
  if (!sftpNewDirName.value) return
  const remoteDir = `${sftpPath.value.replace(/\/$/, '')}/${sftpNewDirName.value}`
  const res = await window.lightterm.sftpMkdir({ ...config, remoteDir })
  sftpStatus.value = res.ok ? `目录已创建：${remoteDir}` : `创建失败：${res.error}`
  if (res.ok) {
    sftpNewDirName.value = ''
    await loadSftp()
  }
}
const renameSftp = async () => {
  const { config, error } = await getSftpConfig()
  if (!config) {
    sftpStatus.value = error || '请先选择并连接 SSH 服务器'
    return
  }
  if (!selectedRemoteFile.value || !sftpRenameTo.value) return
  const oldPath = `${sftpPath.value.replace(/\/$/, '')}/${selectedRemoteFile.value}`
  const newPath = `${sftpPath.value.replace(/\/$/, '')}/${sftpRenameTo.value}`
  const res = await window.lightterm.sftpRename({ ...config, oldPath, newPath })
  sftpStatus.value = res.ok ? `已重命名为：${sftpRenameTo.value}` : `重命名失败：${res.error}`
  if (res.ok) {
    selectedRemoteFile.value = sftpRenameTo.value
    sftpRenameTo.value = ''
    await loadSftp()
  }
}
const deleteSftp = async () => {
  const { config, error } = await getSftpConfig()
  if (!config) {
    sftpStatus.value = error || '请先选择并连接 SSH 服务器'
    return
  }
  if (!selectedRemoteFile.value) return
  const remoteFile = `${sftpPath.value.replace(/\/$/, '')}/${selectedRemoteFile.value}`
  const res = await window.lightterm.sftpDelete({ ...config, remoteFile })
  sftpStatus.value = res.ok ? `已删除：${selectedRemoteFile.value}` : `删除失败：${res.error}`
  if (res.ok) {
    selectedRemoteFile.value = ''
    await loadSftp()
  }
}

const checkVault = async () => {
  if (!window.lightterm?.vaultStatus) {
    bridgeReady.value = false
    vaultStatus.value = '❌ 桌面桥接未加载（请完全退出 AstraShell 后重新打开桌面版 App）'
    return
  }
  bridgeReady.value = true
  const res = await window.lightterm.vaultStatus()
  vaultInitialized.value = res.initialized
  vaultUnlocked.value = res.unlocked
}
const initVault = async () => {
  try {
    if (!vaultMaster.value) {
      vaultStatus.value = '主密码不能为空'
      return
    }
    if (!window.lightterm?.vaultSetMaster) {
      bridgeReady.value = false
      vaultStatus.value = '❌ 桌面桥接未加载（当前不是可写入版本）'
      return
    }
    vaultStatus.value = '正在初始化仓库...'
    const res = await window.lightterm.vaultSetMaster({ masterPassword: vaultMaster.value })
    vaultStatus.value = res.ok ? '✅ 密钥仓库初始化成功（已解锁）' : `❌ 初始化失败：${res.error || '未知错误'}`
    await checkVault()
  } catch (e: any) {
    vaultStatus.value = `❌ 初始化异常：${e?.message || e}`
  }
}
const unlockVault = async () => {
  try {
    if (!vaultMaster.value) {
      vaultStatus.value = '请输入主密码'
      return
    }
    if (!window.lightterm?.vaultUnlock) {
      bridgeReady.value = false
      vaultStatus.value = '❌ 桌面桥接未加载（当前不是可写入版本）'
      return
    }
    vaultStatus.value = '正在解锁仓库...'
    const res = await window.lightterm.vaultUnlock({ masterPassword: vaultMaster.value })
    vaultStatus.value = res.ok ? '✅ 密钥仓库已解锁' : `❌ 解锁失败：${res.error || '未知错误'}`
    await checkVault()
    if (res.ok) await refreshVaultKeys()
  } catch (e: any) {
    vaultStatus.value = `❌ 解锁异常：${e?.message || e}`
  }
}
const resetVault = async () => {
  try {
    if (!window.lightterm?.vaultReset) {
      bridgeReady.value = false
      vaultStatus.value = '❌ 桌面桥接未加载（当前不是可写入版本）'
      return
    }
    vaultStatus.value = '正在重置仓库...'
    const res = await window.lightterm.vaultReset()
    vaultStatus.value = res.ok ? '✅ 密钥仓库已重置，请重新初始化' : `❌ 重置失败：${res.error || '未知错误'}`
    vaultMaster.value = ''
    await checkVault()
    await refreshVaultKeys()
  } catch (e: any) {
    vaultStatus.value = `❌ 重置异常：${e?.message || e}`
  }
}
const saveVaultKey = async () => {
  if (!vaultUnlocked.value) {
    vaultStatus.value = '请先解锁密钥仓库'
    return
  }
  if (!vaultPrivateKey.value.trim()) {
    vaultStatus.value = '私钥内容为空'
    return
  }
  const res = await window.lightterm.vaultKeySave({
    name: vaultKeyName.value || '未命名密钥',
    privateKey: vaultPrivateKey.value,
    publicKey: vaultPublicKey.value,
    certificate: vaultCertificate.value,
    type: vaultKeyType.value,
  })
  vaultStatus.value = res.ok ? `密钥已保存（格式：${res.detectedType || vaultKeyType.value}）` : `保存失败：${res.error}`
  if (res.ok) {
    vaultPrivateKey.value = ''
    vaultPublicKey.value = ''
    vaultCertificate.value = ''
    vaultKeyType.value = 'auto'
    await refreshVaultKeys()
  }
}
const importVaultKeyFile = async () => {
  const res = await window.lightterm.vaultKeyImportFile()
  if (!res.ok) {
    vaultStatus.value = res.error || '导入失败'
    if (res.raw) {
      vaultPrivateKey.value = res.raw
      vaultKeyType.value = 'ppk'
    }
    return
  }
  vaultPrivateKey.value = res.content || ''
  vaultKeyType.value = res.detectedType || 'openssh'
  if (!vaultKeyName.value && res.filePath) {
    const parts = res.filePath.split('/')
    vaultKeyName.value = parts[parts.length - 1] || ''
  }
  vaultStatus.value = `已导入文件：${res.filePath}`
}
const refreshVaultKeys = async () => {
  const res = await window.lightterm.vaultKeyList()
  if (res.ok) vaultItems.value = res.items || []
}

const refreshSyncStatus = async () => {
  const res = await window.lightterm.syncStatus()
  if (!res.ok) return
  syncQueueCount.value = res.queueCount || 0
}
const clearSyncQueue = async () => {
  await window.lightterm.syncClearQueue()
  await refreshSyncStatus()
  syncStatusText.value = '本地队列标记已清空'
}
const pushSyncNow = async () => {
  const res = await window.lightterm.syncPushNow()
  await refreshSyncStatus()
  syncStatusText.value = res.ok ? `本地队列处理完成：${res.pushed || 0} 条` : '处理失败'
}
const copyDbPath = async () => {
  if (!storageDbPath.value) return
  await navigator.clipboard.writeText(storageDbPath.value)
  syncStatusText.value = '数据库路径已复制'
}

const refreshStorageInfo = async () => {
  const res = await window.lightterm.appGetStorage()
  if (res.ok) {
    storageDbPath.value = res.dbPath || ''
  }
}
const pickStorageFolder = async () => {
  const res = await window.lightterm.appPickStorageFolder()
  if (res.ok && res.folder) storageFolderInput.value = res.folder
}
const applyStorageFolder = async () => {
  if (!storageFolderInput.value) return
  const res = await window.lightterm.appSetStorageFolder({ folder: storageFolderInput.value })
  storageMsg.value = res.ok
    ? `已设置数据库路径：${res.dbPath}（重启应用生效）`
    : `设置失败：${res.error}`
  await refreshStorageInfo()
}

const loadSerialPorts = async () => {
  serialPorts.value = await window.lightterm.listSerialPorts()
  if (!serialForm.value.path && serialPorts.value.length > 0) serialForm.value.path = serialPorts.value[0].path
}
const openSerial = async () => {
  if (!serialForm.value.path) return
  const res = await window.lightterm.openSerial(serialForm.value)
  terminal?.writeln(res.ok ? `\r\n串口已打开：${serialForm.value.path}` : `\r\n串口打开失败：${res.error}`)
}
const sendSerial = async () => {
  if (!serialForm.value.path || !serialSendText.value) return
  const res = await window.lightterm.sendSerial({ path: serialForm.value.path, data: serialSendText.value, isHex: serialHexMode.value })
  terminal?.writeln(res.ok ? `\r\n已发送：${serialSendText.value}` : `\r\n发送失败：${res.error}`)
}
const toggleTimerSend = () => {
  if (serialTimer) {
    clearInterval(serialTimer)
    serialTimer = null
    return
  }
  if (!serialTimerMs.value || serialTimerMs.value < 50) return
  serialTimer = window.setInterval(() => sendSerial(), serialTimerMs.value)
}

onMounted(async () => {
  restoreSshTabs()
  initTerminal()
  await loadSerialPorts()
  await refreshHosts()
  await checkVault()
  await refreshVaultKeys()
  await refreshSyncStatus()
  await refreshStorageInfo()
  await loadLocalFs()
  window.addEventListener('resize', () => {
    fitAddon?.fit()
    if (sshConnected.value && terminal) window.lightterm.sshResize({ sessionId: sshSessionId.value, cols: terminal.cols, rows: terminal.rows })
  })
  window.lightterm.onSftpProgress((p) => {
    if (p.type === 'upload') sftpUploadProgress.value = p.percent
    if (p.type === 'download') sftpDownloadProgress.value = p.percent
  })
  window.addEventListener('click', hideRemoteMenu)
})
</script>

<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand"><img src="/logo-astrashell.svg" alt="AstraShell" class="brand-logo" /> AstraShell</div>
      <ul>
        <li :class="{ active: nav === 'hosts' }" @click="focusTerminal = false; nav = 'hosts'"><Server :size="16" /> 主机</li>
        <li :class="{ active: nav === 'sftp' }" @click="focusTerminal = false; nav = 'sftp'"><FolderTree :size="16" /> SFTP</li>
        <li :class="{ active: nav === 'serial' }" @click="focusTerminal = false; nav = 'serial'"><Cable :size="16" /> 串口</li>
        <li :class="{ active: nav === 'vault' }" @click="focusTerminal = false; nav = 'vault'"><KeyRound :size="16" /> 密钥仓库</li>
        <li :class="{ active: nav === 'sync' }" @click="focusTerminal = false; nav = 'sync'"><RefreshCcwDot :size="16" /> 本地同步</li>
        <li :class="{ active: nav === 'settings' }" @click="focusTerminal = false; nav = 'settings'"><Settings :size="16" /> 设置</li>
      </ul>
    </aside>

    <main class="main">
      <div class="top-actions" v-if="focusTerminal">
        <button class="ghost" @click="focusTerminal = false">返回模块视图</button>
      </div>

      <section v-if="!focusTerminal && nav === 'hosts'" class="panel hosts-panel">
        <h3>SSH 管理台</h3>

        <div class="hosts-three-col" :class="{ collapsed: !hostEditorVisible }">
          <div class="col categories">
            <div class="col-title">分类</div>
            <div class="cat-tools-inline">
              <button class="ghost small" @click="beginAddCategory">+ 新建分类</button>
            </div>
            <div v-if="newCategoryInputVisible" class="cat-item input-item">
              <input v-model="newCategoryName" placeholder="输入分类名，回车确认" @keyup.enter="addCategory" @blur="addCategory" />
            </div>
            <div
              v-for="c in hostCategories"
              :key="c"
              class="cat-item"
              :class="{ activeCat: selectedCategory === c }"
            >
              <button class="cat-name" @click="selectedCategory = c">{{ c }}</button>
              <button v-if="c !== '默认'" class="icon-btn" @click="renameCategoryInline(c)"><Pencil :size="12" /></button>
            </div>
          </div>

          <div class="col host-list">
            <div class="col-title">SSH 列表 <div><button class="ghost small" @click="createHost">新建连接</button><button class="ghost small" v-if="!hostEditorVisible" @click="hostEditorVisible = true">展开编辑</button></div></div>
            <input v-model="hostKeyword" placeholder="搜索主机/用户名/IP" />
            <div class="groups">
              <div v-for="group in groupedHosts" :key="group.name" class="group-block">
                <div class="group-title">{{ group.name }}</div>
                <div class="host-grid">
                  <div
                    class="host-card"
                    v-for="h in group.items"
                    :key="h.id"
                    @click="openHostEditor(h)"
                    @dblclick="openHostTerminal(h)"
                    :class="{ activeHost: selectedHostId === h.id }"
                  >
                    <div class="host-card-head">
                      <span class="host-icon">⌘</span>
                      <div class="host-card-title">{{ h.name }}</div>
                    </div>
                    <div class="host-card-body">
                      <div class="host-line">{{ h.host }}:{{ h.port }}</div>
                      <div class="host-line dim">{{ h.username }}</div>
                    </div>
                    <div class="host-card-meta">
                      <span class="pill">{{ h.category || '默认' }}</span>
                      <span class="pill ghost">{{ h.auth_type === 'key' ? '密钥' : '密码' }}</span>
                    </div>
                    <div class="host-card-footer">
                      <span class="status-dot" :class="{ online: h.connected, offline: !h.connected }"></span>
                      <span>{{ h.connected ? '在线' : '离线' }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="col host-editor" v-if="hostEditorVisible">
            <div class="editor-title">
              <Pencil :size="14" /> SSH 编辑
              <button class="ghost small" @click="hostEditorVisible = false">收起</button>
            </div>
            <div v-if="editingHost" class="ssh-edit-zone">
              <div class="ssh-edit-grid">
                <div class="ssh-module">
                  <div class="module-title">基础信息</div>
                  <input v-model="editingHost.name" placeholder="连接名称" />
                  <select v-model="editingHost.category">
                    <option v-for="c in hostCategories" :key="c" :value="c">{{ c }}</option>
                  </select>
                  <input v-model="editingHost.host" placeholder="主机/IP" />
                  <input v-model.number="editingHost.port" type="number" placeholder="端口" />
                  <input v-model="editingHost.username" placeholder="用户名" />
                </div>
                <div class="ssh-module">
                  <div class="module-title">认证</div>
                  <select v-model="editingHost.authType">
                    <option value="password">密码认证</option>
                    <option value="key">密钥认证</option>
                  </select>
                  <input v-if="editingHost.authType === 'password'" v-model="editingHost.password" type="password" placeholder="密码" />
                  <select v-else v-model="editingHost.privateKeyRef">
                    <option value="">选择密钥</option>
                    <option v-for="k in vaultItems" :key="k.id" :value="k.id">{{ k.name }} ({{ k.type }})</option>
                  </select>
                </div>
              </div>
              <div class="ssh-edit-grid">
                <div class="ssh-module">
                  <div class="module-title">资产信息</div>
                  <label>购买日期</label>
                  <input v-model="editingHost.purchaseDate" type="date" />
                  <label>有效期</label>
                  <input v-model="editingHost.expiryDate" type="date" />
                </div>
                <div class="ssh-module">
                  <div class="module-title">操作</div>
                  <div class="ssh-actions">
                    <button @click="saveEditedHost">保存修改</button>
                    <button class="muted" @click="useHost(editingHost); connectSSH()">连接终端</button>
                    <button class="danger" @click="selectedHostId = editingHost.id; deleteCurrentHost()">删除主机</button>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="empty-tip">先在中间选择一个 SSH 条目进行编辑</div>

            <div class="divider"></div>
            <div class="col-title">快速新建</div>
            <div class="grid compact">
              <input v-model="hostName" placeholder="连接名称" />
              <select v-model="hostCategory">
                <option v-for="c in hostCategories" :key="c" :value="c">{{ c }}</option>
              </select>
              <input v-model="sshForm.host" placeholder="主机/IP" />
              <input v-model.number="sshForm.port" type="number" placeholder="端口" />
              <input v-model="sshForm.username" placeholder="用户名" />
              <input v-model="sshForm.password" type="password" placeholder="密码（可选）" />
              <button @click="saveCurrentHost">保存主机</button>
            </div>
            <p>{{ sshStatus }}</p>
          </div>
        </div>
      </section>

      <section v-else-if="!focusTerminal && nav === 'sftp'" class="panel sftp-panel">
        <h3>SFTP 双栏（本地/远程）</h3>
        <p>{{ sftpStatus }} ｜ {{ sftpConnected ? '已连接' : '未连接' }} ｜ 传输模式：二进制</p>
        <div class="split-head">
          <div class="head-left">
            <input v-model="localPath" placeholder="本地路径" />
            <button class="muted" @click="loadLocalFs">刷新本地</button>
          </div>
          <div class="head-right">
            <button @click="sftpConnectPanelOpen = !sftpConnectPanelOpen">链接</button>
            <div v-if="sftpConnectPanelOpen" class="connect-panel">
              <select v-model="sftpHostId">
                <option value="">选择 SSH 服务器</option>
                <option v-for="h in hostItems" :key="h.id" :value="h.id">{{ h.name }} ({{ h.host }})</option>
              </select>
              <button @click="connectSftp">连接并加载</button>
            </div>
          </div>
        </div>

        <div class="split">
          <div @dragover.prevent @drop="onLocalDrop" class="file-panel local-panel">
            <h4>本地（可接收远程拖拽下载） <button class="ghost small" @click="localGoUp">上一级</button></h4>
            <div class="file-stack">
              <div
                v-for="l in localRows"
                :key="l.path"
                class="file-row"
                :class="{ 'is-dir': l.isDir, active: selectedLocalFile === l.path }"
                @click="openLocalItem(l)"
                :draggable="!l.isDir"
                @dragstart="onLocalDragStart(l)"
              >
                <div class="file-info">
                  <span class="file-icon">{{ l.isDir ? '📁' : '📄' }}</span>
                  <span class="file-name">{{ l.name }}</span>
                </div>
                <div class="file-meta">
                  <span>{{ l.isDir ? '目录' : '文件' }}</span>
                </div>
              </div>
              <div v-if="localRows.length === 0" class="file-row empty">目录空</div>
            </div>
          </div>
          <div @dragover.prevent @drop="onRemoteDrop" class="file-panel remote-panel">
            <h4>远程（可接收本地拖拽上传） <button class="ghost small" @click="remoteGoUp">上一级</button> <button class="ghost small" @click="loadSftp">刷新</button> <button class="ghost small" @click="promptMkdirSftp">新建目录</button></h4>
            <div class="file-stack">
              <div
                v-for="r in sftpRows"
                :key="r.filename"
                class="file-row"
                :class="{ 'is-dir': r.isDir, active: selectedRemoteFile === r.filename }"
                @click="openRemoteItem(r)"
                @contextmenu="showRemoteMenu($event, r)"
                :draggable="!r.isDir"
                @dragstart="onRemoteDragStart(r)"
              >
                <div class="file-info">
                  <span class="file-icon">{{ r.isDir ? '📁' : '📄' }}</span>
                  <span class="file-name">{{ r.filename }}</span>
                </div>
                <div class="file-meta">
                  <span>{{ r.isDir ? '目录' : (r.size ?? '-') }}</span>
                  <span>{{ r.isDir ? '' : (r.mtime ? new Date(r.mtime * 1000).toLocaleDateString() : '未知时间') }}</span>
                </div>
              </div>
              <div v-if="sftpRows.length === 0" class="file-row empty">远程目录空</div>
            </div>
          </div>
        </div>
        <div
          v-if="remoteMenu.visible"
          class="context-menu"
          :style="{ left: `${remoteMenu.x}px`, top: `${remoteMenu.y}px` }"
        >
          <button class="menu-item" @click="menuDownload">下载</button>
          <button class="menu-item" @click="menuRename">重命名</button>
          <button class="menu-item danger" @click="menuDelete">删除</button>
        </div>
      </section>

      <section v-else-if="!focusTerminal && nav === 'serial'" class="panel">
        <h3>串口连接与发送面板</h3>
        <div class="grid">
          <select v-model="serialForm.path"><option value="">选择串口</option><option v-for="p in serialPorts" :key="p.path" :value="p.path">{{ p.path }}</option></select>
          <input v-model.number="serialForm.baudRate" type="number" placeholder="波特率" />
          <button @click="loadSerialPorts">刷新串口</button>
          <button @click="openSerial">打开串口</button>
        </div>
        <div class="send-box">
          <input v-model="serialSendText" :placeholder="serialHexMode ? 'HEX 示例：41 54 0D 0A' : '发送内容（ASCII）'" />
          <label><input v-model="serialHexMode" type="checkbox" /> HEX</label>
          <input v-model.number="serialTimerMs" type="number" placeholder="定时发送ms（>=50）" />
          <button @click="sendSerial">发送</button>
          <button class="muted" @click="toggleTimerSend">切换定时</button>
        </div>
      </section>

      <section v-else-if="!focusTerminal && nav === 'vault'" class="panel">
        <h3>密钥仓库（主密码 + 加密）</h3>
        <div class="grid">
          <input v-model="vaultMaster" type="password" placeholder="主密码" />
          <button v-if="!vaultInitialized" @click="initVault">初始化仓库</button>
          <button v-else @click="unlockVault">解锁仓库</button>
          <button class="muted" @click="refreshVaultKeys">刷新密钥列表</button>
          <button class="danger" @click="resetVault">重置仓库</button>
        </div>
        <p>{{ vaultStatus }} ｜ bridge={{ bridgeReady ? 'ok' : 'missing' }} ｜ initialized={{ vaultInitialized }} unlocked={{ vaultUnlocked }}</p>
        <div class="grid">
          <input v-model="vaultKeyName" placeholder="密钥名称" />
          <select v-model="vaultKeyType">
            <option value="auto">自动识别</option>
            <option value="openssh">OpenSSH</option>
            <option value="pem">PEM</option>
            <option value="ppk">PPK</option>
          </select>
          <textarea v-model="vaultPrivateKey" class="key-input" placeholder="Private Key（私钥，多行）"></textarea>
          <textarea v-model="vaultPublicKey" class="key-input" placeholder="Public Key（公钥，可选）"></textarea>
          <textarea v-model="vaultCertificate" class="key-input" placeholder="Certificate（证书，可选）"></textarea>
          <button @click="importVaultKeyFile">导入私钥文件</button>
          <button @click="saveVaultKey">保存密钥组</button>
        </div>
        <div class="key-grid">
          <div v-for="k in vaultItems" :key="k.id" class="key-card">
            <div class="key-card-title">{{ k.name }}</div>
            <div class="key-card-meta">
              <span class="pill ghost">{{ k.type }}</span>
              <span>{{ k.fingerprint || '无指纹' }}</span>
            </div>
            <div class="key-card-foot">
              <span>{{ k.updated_at ? new Date(k.updated_at).toLocaleDateString() : '未更新' }}</span>
              <button class="ghost tiny">详情</button>
            </div>
          </div>
        </div>
      </section>

      <section v-else-if="!focusTerminal && nav === 'sync'" class="panel">
        <h3>本地多端同步（共享文件夹模式）</h3>
        <p>{{ syncStatusText }}</p>
        <p>当前数据库：{{ storageDbPath }}</p>
        <div class="grid">
          <button class="muted" @click="refreshStorageInfo">刷新数据库路径</button>
          <button class="muted" @click="copyDbPath">复制数据库路径</button>
          <button @click="pushSyncNow">处理本地队列</button>
          <button class="muted" @click="clearSyncQueue">清空本地队列</button>
        </div>
        <p>待处理变更：{{ syncQueueCount }}</p>
        <p class="hint">建议：把数据库目录放到 iCloud/OneDrive/共享盘；同一时刻只在一台设备写入。</p>
      </section>

      <section v-else-if="!focusTerminal && nav === 'settings'" class="panel">
        <h3>本地存储设置（单机版）</h3>
        <p>当前数据库：{{ storageDbPath }}</p>
        <div class="grid">
          <input v-model="storageFolderInput" placeholder="选择 iCloud/共享文件夹目录" />
          <button class="muted" @click="pickStorageFolder">选择目录</button>
          <button @click="applyStorageFolder">应用目录</button>
          <button class="muted" @click="refreshStorageInfo">刷新</button>
        </div>
        <p>{{ storageMsg }}</p>
        <p class="hint">建议：跨设备同步时，只让一台设备在同一时刻写入数据库，避免冲突。</p>
      </section>

      <section v-else-if="!focusTerminal" class="panel"><h3>模块建设中</h3><p>当前页面：{{ nav }}</p></section>

      <section v-show="focusTerminal" class="terminal-wrap" :class="{ focus: focusTerminal }"><div ref="termEl" class="terminal"></div></section>
    </main>

    <footer class="status-bar fixed-bottom">
      <div class="status-left">状态：{{ sftpStatus || sshStatus || '就绪' }}</div>
      <div class="status-right">
        <span>↑ {{ sftpUploadProgress }}%</span>
        <div class="mini-bar"><div class="mini-fill" :style="{ width: `${sftpUploadProgress}%` }"></div></div>
        <span>↓ {{ sftpDownloadProgress }}%</span>
        <div class="mini-bar"><div class="mini-fill down" :style="{ width: `${sftpDownloadProgress}%` }"></div></div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.layout { display: grid; grid-template-columns: 220px 1fr; height: 100vh; padding-top: 0; }
.sidebar { background: linear-gradient(180deg, #eef2f7 0%, #e9edf3 100%); border-right: 1px solid var(--border); padding: 8px 16px 16px; }
.brand { font-weight: 800; margin-bottom: 14px; font-size: 18px; display: flex; align-items: center; gap: 8px; }
.brand-logo { width: 20px; height: 20px; border-radius: 5px; }
.sidebar ul { list-style: none; padding: 0; margin: 0; }
.sidebar li { padding: 10px 10px; border-radius: 10px; color: var(--text-main); cursor: pointer; margin-bottom: 6px; display: flex; align-items: center; gap: 8px; }
.sidebar li:hover { background: #dfe5ee; }
.sidebar li.active { background: #dbeafe; color: #1d4ed8; font-weight: 600; }
.main { padding: 12px; padding-bottom: 42px; display: flex; flex-direction: column; gap: 10px; height: 100vh; overflow: hidden; }
.topbar,.panel,.terminal-wrap { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 10px; }
.topbar { display: flex; align-items: center; justify-content: space-between; padding-left: 110px; min-height: 42px; -webkit-app-region: drag; flex-shrink: 0; }
.title { font-weight: 700; font-size: 14px; color: #111827; }
.actions { display: flex; gap: 8px; }
button.ghost { background: #f3f4f6; color: #111827; border: 1px solid #e5e7eb; display: inline-flex; align-items: center; gap: 6px; }
button.small { padding: 4px 8px; font-size: 12px; margin-left: auto; }
.topbar .actions, .topbar .actions *, .topbar button { -webkit-app-region: no-drag; }
.key-input { grid-column: span 2; }
.grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
.panel { overflow: auto; min-height: 120px; }
.hosts-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.sftp-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; }
input,select,button,textarea { padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-family: inherit; }
textarea { min-height: 74px; resize: vertical; }
button { background: #3b82f6; color: white; border: none; cursor: pointer; }
button.muted { background: #6b7280; }
button.danger { background: #ef4444; }
.tabs { display: flex; gap: 8px; margin: 8px 0 10px; flex-wrap: wrap; }
.tab { background: #e5e7eb; color: #111827; }
.tab.activeTab { background: #2563eb; color: #fff; }
.tab .x { margin-left: 6px; font-weight: 700; }
.send-box { display: grid; grid-template-columns: 1fr auto 180px 120px 120px; gap: 10px; margin-top: 10px; align-items: center; }
.terminal-wrap { flex: 1; min-height: 220px; overflow: hidden; }
.terminal-wrap.focus { min-height: calc(100vh - 150px); }
.terminal { height: 100%; }
.terminal-wrap.focus .terminal { height: calc(100vh - 210px); }
.split-head { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin:8px 0 10px; }
.head-left { display:flex; gap:8px; flex:1; }
.head-right { position:relative; }
.connect-panel { position:absolute; right:0; top:38px; background:#fff; border:1px solid var(--border); border-radius:10px; padding:10px; display:grid; gap:8px; min-width:280px; z-index:20; }
.split { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; min-height: 0; flex: 1; }
.split > div { border: 1px solid #dbe2ea; background: #f8fafc; border-radius: 10px; padding: 8px; display: flex; flex-direction: column; min-height: 0; }
.split > div:nth-child(2) { background: #f1f5f9; border-color: #cbd5e1; }
.file-panel { background: rgba(255, 255, 255, 0.85); border: 1px solid rgba(15,23,42,0.08); border-radius: 16px; padding: 16px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.6); }
.file-stack { display:flex; flex-direction:column; gap: 8px; max-height: 380px; overflow:auto; margin-top: 8px; }
.file-row { display:flex; align-items:center; justify-content:space-between; gap: 12px; padding: 10px 12px; border-radius: 12px; border: 1px solid transparent; background: rgba(248, 250, 252, 0.8); transition: background 0.2s ease, border 0.2s ease; }
.file-row.is-dir { background: rgba(59, 130, 246, 0.1); }
.file-row.active { border-color: var(--primary); background: rgba(37, 99, 235, 0.15); }
.file-row:not(.empty):hover { background: rgba(59, 130, 246, 0.1); }
.file-row.empty { justify-content:center; color: #94a3b8; background: transparent; border: 1px dashed rgba(15,23,42,0.2); }
.file-info { display:flex; align-items:center; gap: 10px; font-weight: 600; }
.file-icon { font-size: 18px; }
.file-name { color: #0f172a; }
.file-meta { display:flex; align-items:center; gap: 20px; font-size: 12px; color: #475569; }
.file-meta span { opacity: 0.8; display:inline-flex; gap: 6px; }
.list { margin: 6px 0 0; padding-left: 18px; flex: 1; min-height: 0; overflow: auto; }
.list li { display: flex; justify-content: space-between; padding-right: 8px; cursor: pointer; }
h4 { margin: 6px 0; }
.hosts-three-col { display: grid; grid-template-columns: 180px 1fr 1.05fr; gap: 12px; margin-top: 8px; flex: 1; min-height: 0; }
.hosts-three-col.collapsed { grid-template-columns: 180px 1fr; }
.col { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px; min-height: 0; display: flex; flex-direction: column; }
.col-title { font-weight: 700; margin-bottom: 8px; color: #0f172a; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.categories { display: flex; flex-direction: column; gap: 6px; }
.cat-tools-inline { margin-bottom: 6px; }
.col-title > div { display: inline-flex; gap: 6px; }
.cat-item { display:flex; align-items:center; gap:6px; background:#eef2ff; border:1px solid #dbeafe; border-radius:10px; padding:4px; }
.cat-item.activeCat { background:#dbeafe; border-color:#93c5fd; }
.cat-name { flex:1; text-align:left; background:transparent; color:#1e3a8a; }
.icon-btn { width:26px; height:26px; display:inline-flex; align-items:center; justify-content:center; background:#fff; color:#334155; border:1px solid #dbeafe; }
.input-item { background:#fff; border-style:dashed; }
.input-item input { width:100%; }
.groups { flex: 1; min-height: 0; overflow: auto; display: grid; gap: 10px; margin-top: 8px; }
.group-title { font-size: 12px; color: #6b7280; margin-bottom: 4px; }
.group-block { border-bottom: 1px dashed #e5e7eb; padding-bottom: 8px; }
.host-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 8px; }
.host-card { background: linear-gradient(180deg, rgba(255,255,255,0.9), #ffffff); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 16px; padding: 16px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); transition: transform 0.2s ease, border-color 0.2s ease; display:flex; flex-direction:column; gap: 8px; cursor: pointer; }
.host-card:hover { transform: translateY(-2px); border-color: var(--primary); }
.host-card.activeHost { border-color: var(--primary); box-shadow: 0 12px 34px rgba(59, 130, 246, 0.2); }
.host-card-head { display:flex; align-items:center; gap: 10px; }
.host-icon { width: 32px; height: 32px; border-radius: 10px; background: rgba(37, 99, 235, 0.12); display:flex; align-items:center; justify-content:center; font-size: 16px; color: var(--primary); font-weight: 600; }
.host-card-title { font-weight: 600; font-size: 14px; color: #0f172a; }
.host-card-body { display:flex; flex-direction:column; gap: 4px; }
.host-line { font-size: 13px; color: #111827; }
.host-line.dim { color: #6b7280; }
.host-card-meta { display:flex; gap: 6px; flex-wrap: wrap; }
.pill { border-radius: 999px; padding: 2px 10px; font-size: 11px; background: rgba(15,23,42,0.06); color: #0f172a; border: 1px solid transparent; }
.pill.ghost { background: rgba(15,23,42,0.04); border-color: rgba(15,23,42,0.08); }
.host-card-footer { display:flex; align-items:center; gap: 6px; font-size: 12px; color: #6b7280; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; display:inline-block; background: #ef4444; }
.status-dot.online { background: #22c55e; }
.status-dot.offline { background: #ef4444; }
.host-editor { background: #fbfdff; border: 1px solid #dbeafe; border-radius: 10px; padding: 10px; min-height: 0; }
.editor-title { display: flex; align-items: center; gap: 6px; font-weight: 700; margin-bottom: 8px; }
.grid.compact { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.ssh-edit-zone { margin-top: 12px; display:flex; flex-direction:column; gap: 12px; }
.ssh-edit-grid { display:grid; grid-template-columns: repeat(2, minmax(220px, 1fr)); gap: 12px; }
.ssh-module { background: rgba(255,255,255,0.9); border: 1px solid rgba(148, 163, 184, 0.4); border-radius: 16px; padding: 16px; box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08); display:flex; flex-direction:column; gap: 8px; }
.module-title { font-size: 12px; font-weight: 700; color: #2563eb; letter-spacing: 0.02em; text-transform: uppercase; }
.ssh-module input,
.ssh-module select { width: 100%; }
.ssh-module label { font-size: 12px; color: #475569; }
.ssh-actions { display:flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
.ssh-actions button { flex: 1 1 auto; }
.key-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 12px; }
.key-card { border: 1px solid var(--border); border-radius: 16px; padding: 14px; background: linear-gradient(180deg, rgba(99, 102, 241, 0.08), rgba(255, 255, 255, 0.8)); box-shadow: 0 12px 28px rgba(99, 102, 241, 0.2); display:flex; flex-direction:column; gap: 10px; }
.key-card-title { font-weight: 600; font-size: 14px; color: #0f172a; }
.key-card-meta { display:flex; align-items:center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: #475569; }
.key-card-foot { display:flex; align-items:center; justify-content:space-between; font-size: 12px; color: #475569; }
.key-card-foot button { padding: 4px 10px; font-size: 11px; align-self:flex-end; }
.empty-tip { color: #6b7280; font-size: 13px; padding: 8px 0; }
.divider { height: 1px; background: #e5e7eb; margin: 12px 0; }
.status-bar { height: 28px; border: 1px solid #d1d5db; border-radius: 8px; background: #f8fafc; display: flex; align-items: center; justify-content: space-between; padding: 0 10px; font-size: 12px; color: #374151; z-index: 50; }
.fixed-bottom { position: fixed; left: 232px; right: 12px; bottom: 8px; }
.status-right { display: flex; align-items: center; gap: 6px; min-width: 320px; }
.mini-bar { width: 90px; height: 6px; background: #e5e7eb; border-radius: 999px; overflow: hidden; }
.mini-fill { height: 100%; background: #3b82f6; transition: width .2s ease; }
.mini-fill.down { background: #10b981; }
.context-menu {
  position: fixed;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
  z-index: 99;
  display: flex;
  flex-direction: column;
  min-width: 120px;
  padding: 6px;
}
.menu-item {
  text-align: left;
  background: #f3f4f6;
  color: #111827;
  margin: 2px 0;
}
@media (max-width: 1400px) {
  .hosts-three-col { grid-template-columns: 150px 1fr 1fr; }
}
@media (max-width: 1200px) {
  .hosts-three-col { grid-template-columns: 1fr; }
  .col { min-height: auto; }
}

@media (max-width: 1100px) {
  .host-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ssh-edit-grid { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
}

@media (max-width: 768px) {
  .host-grid { grid-template-columns: 1fr; }
  .ssh-edit-grid { grid-template-columns: 1fr; }
}

.hint { color: #6b7280; font-size: 12px; }
</style>
