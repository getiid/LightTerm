import net from 'node:net'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'

function toPsSingleQuoted(text) {
  return String(text || '').replace(/'/g, "''")
}

function buildElevatedBridgeScript({ port, token, shellType, cwd }) {
  const shellExe = shellType === 'cmd' ? 'cmd.exe' : 'powershell.exe'
  const normalizedCwd = String(cwd || '').trim()
  const script = `
$ErrorActionPreference = 'Stop'
$token = '${toPsSingleQuoted(token)}'
$port = ${Number(port || 0)}
$host = '127.0.0.1'
$shell = '${toPsSingleQuoted(shellExe)}'
$cwd = '${toPsSingleQuoted(normalizedCwd)}'
if (-not (Test-Path -LiteralPath $cwd)) { $cwd = [Environment]::GetFolderPath('UserProfile') }

$tcp = New-Object System.Net.Sockets.TcpClient
$tcp.Connect($host, $port)
$stream = $tcp.GetStream()
$writer = New-Object System.IO.StreamWriter($stream, [System.Text.Encoding]::UTF8)
$writer.AutoFlush = $true
$reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)

function Send-Json([hashtable]$obj) {
  $writer.WriteLine(($obj | ConvertTo-Json -Compress))
}

Send-Json @{ type = 'hello'; token = $token; pid = $PID }

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $shell
$psi.WorkingDirectory = $cwd
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
if ($shell -eq 'powershell.exe') {
  $psi.Arguments = '-NoLogo'
}

$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi
if (-not $proc.Start()) {
  throw '无法启动提权终端进程'
}

$sendOutput = {
  param($prefix, $line)
  if ($null -ne $line) {
    Send-Json @{ type = 'data'; data = ($line + [Environment]::NewLine) }
  }
}

$null = Register-ObjectEvent -InputObject $proc -EventName 'OutputDataReceived' -Action {
  & $using:sendOutput '' $EventArgs.Data
}
$null = Register-ObjectEvent -InputObject $proc -EventName 'ErrorDataReceived' -Action {
  & $using:sendOutput '' $EventArgs.Data
}
$proc.BeginOutputReadLine()
$proc.BeginErrorReadLine()

try {
  while ($true) {
    $line = $reader.ReadLine()
    if ($null -eq $line) { break }
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    try {
      $msg = $line | ConvertFrom-Json
    } catch {
      continue
    }
    if ($msg.type -eq 'input') {
      $text = [string]$msg.data
      if ($null -ne $text) {
        $proc.StandardInput.Write($text)
        $proc.StandardInput.Flush()
      }
    } elseif ($msg.type -eq 'exit') {
      break
    }
  }
} finally {
  try {
    if (-not $proc.HasExited) {
      $proc.StandardInput.WriteLine('exit')
      $proc.StandardInput.Flush()
      if (-not $proc.WaitForExit(500)) {
        $proc.Kill()
      }
    }
  } catch {}
  try {
    Send-Json @{ type = 'exit'; code = (if ($proc.HasExited) { $proc.ExitCode } else { 0 }) }
  } catch {}
  try { $proc.Dispose() } catch {}
  try { $reader.Dispose() } catch {}
  try { $writer.Dispose() } catch {}
  try { $stream.Dispose() } catch {}
  try { $tcp.Close() } catch {}
}
`
  return Buffer.from(script, 'utf16le').toString('base64')
}

async function startWindowsElevatedBridge({ sessionId, shellType, cwd, cols, rows, timeoutMs = 20000 }) {
  const token = crypto.randomBytes(12).toString('hex')
  const connections = []

  let onDataHandlers = []
  let onExitHandlers = []
  let disposed = false
  let authenticated = false
  let socketRef = null
  let stdinReady = false

  const emitData = (text) => {
    const chunk = String(text || '')
    if (!chunk) return
    for (const fn of onDataHandlers) {
      try { fn(chunk) } catch {}
    }
  }

  const emitExit = (code = 0, signal = '') => {
    for (const fn of onExitHandlers) {
      try { fn({ exitCode: Number(code || 0), signal: String(signal || '') }) } catch {}
    }
  }

  const cleanupSocket = () => {
    if (socketRef) {
      try { socketRef.destroy() } catch {}
      socketRef = null
    }
  }

  const server = net.createServer((socket) => {
    connections.push(socket)
    socket.setEncoding('utf8')
    let buf = ''

    const closeWithError = (message) => {
      if (disposed) return
      disposed = true
      cleanupSocket()
      try { server.close() } catch {}
      throw new Error(message)
    }

    socket.on('data', (chunk) => {
      buf += String(chunk || '')
      let idx = buf.indexOf('\n')
      while (idx >= 0) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        if (line) {
          let msg
          try { msg = JSON.parse(line) } catch { msg = null }
          if (msg) {
            if (!authenticated) {
              if (msg.type === 'hello' && msg.token === token) {
                authenticated = true
                socketRef = socket
                stdinReady = true
              } else {
                try { socket.destroy() } catch {}
                return
              }
            } else if (msg.type === 'data') {
              emitData(String(msg.data || ''))
            } else if (msg.type === 'exit') {
              if (!disposed) {
                disposed = true
                cleanupSocket()
                try { server.close() } catch {}
                emitExit(Number(msg.code || 0), '')
              }
            }
          }
        }
        idx = buf.indexOf('\n')
      }
    })

    socket.on('close', () => {
      if (!disposed && authenticated) {
        disposed = true
        cleanupSocket()
        try { server.close() } catch {}
        emitExit(0, 'socket-close')
      }
    })

    socket.on('error', () => {
      if (!disposed && authenticated) {
        disposed = true
        cleanupSocket()
        try { server.close() } catch {}
        emitExit(1, 'socket-error')
      }
    })
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  if (!port) {
    try { server.close() } catch {}
    throw new Error('提权桥接端口初始化失败')
  }

  const encoded = buildElevatedBridgeScript({ port, token, shellType, cwd })
  const elevatedArgs = [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-Command',
    `Start-Process -Verb RunAs -WindowStyle Hidden -FilePath 'powershell.exe' -ArgumentList '-NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}'`,
  ]
  const launcher = spawn(process.env.POWERSHELL_EXE || 'powershell.exe', elevatedArgs, {
    windowsHide: true,
    stdio: 'ignore',
  })

  launcher.unref()

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('等待提权桥接超时，请确认 UAC 已允许'))
    }, timeoutMs)

    const check = () => {
      if (authenticated && stdinReady) {
        clearTimeout(timer)
        resolve()
      } else {
        setTimeout(check, 120)
      }
    }
    check()
  }).catch((err) => {
    try { server.close() } catch {}
    for (const s of connections) {
      try { s.destroy() } catch {}
    }
    throw err
  })

  const writeJson = (obj) => {
    if (!socketRef || disposed) throw new Error('提权桥接不可用')
    socketRef.write(`${JSON.stringify(obj)}\n`)
  }

  const proc = {
    write(data) {
      writeJson({ type: 'input', data: String(data || '') })
    },
    resize(_cols, _rows) {
      // 预留：当前桥接暂不支持 Windows ConPTY resize，避免破坏协议
    },
    kill() {
      if (disposed) return
      try { writeJson({ type: 'exit' }) } catch {}
      disposed = true
      cleanupSocket()
      try { server.close() } catch {}
      emitExit(0, 'killed')
    },
    onData(fn) {
      if (typeof fn === 'function') onDataHandlers.push(fn)
    },
    onExit(fn) {
      if (typeof fn === 'function') onExitHandlers.push(fn)
    },
  }

  emitData(`[管理员桥接已建立] session=${sessionId} shell=${shellType} cwd=${cwd}\r\n`)

  return { proc }
}

export function registerLocalIpc(ipcMain, deps) {
  const {
    getLocalShellCommand,
    buildShellSpawnOptions,
    applyLocalShellRuntimeEnv,
    getNodePtySpawn,
    closeLocalShellSession,
    appendAuditLog,
    broadcast,
    logOutputLines,
    flushResponseLogsForSession,
    logCommandLines,
    localShellSessions,
    localInputBuffers,
    localOutputBuffers,
  } = deps

  ipcMain.handle('local:connect', async (_event, payload) => {
    const sessionId = String(payload?.sessionId || '').trim()
    if (!sessionId) return { ok: false, error: '缺少 sessionId' }
    closeLocalShellSession(sessionId, 'reconnect')

    const shellType = String(payload?.shellType || 'auto').trim().toLowerCase()
    const elevatedRequested = !!payload?.elevated
    let elevated = elevatedRequested
    let connectWarning = ''
    const options = buildShellSpawnOptions(String(payload?.cwd || '').trim())

    if (process.platform === 'win32' && elevatedRequested) {
      elevated = false
      connectWarning = '已禁用应用内提权桥接（避免杀软拦截）。请右键“以管理员身份运行”启动 AstraShell。'
    }

    let shellCmd = getLocalShellCommand()
    let args = process.platform === 'win32' ? [] : ['-i', '-l']

    if (process.platform === 'win32') {
      if (shellType === 'cmd') {
        shellCmd = process.env.COMSPEC || 'cmd.exe'
        args = []
      } else if (shellType === 'powershell') {
        shellCmd = process.env.POWERSHELL_EXE || 'powershell.exe'
        args = ['-NoLogo']
      } else {
        shellCmd = process.env.COMSPEC || 'cmd.exe'
        args = []
      }
    }

    applyLocalShellRuntimeEnv(shellCmd, options.env)
    try {
      let proc
      if (process.platform === 'win32' && elevated) {
        const bridge = await startWindowsElevatedBridge({
          sessionId,
          shellType: shellType === 'cmd' ? 'cmd' : 'powershell',
          cwd: options.cwd,
          cols: Number(payload?.cols || 120),
          rows: Number(payload?.rows || 30),
        })
        proc = bridge.proc
      } else {
        const ptySpawn = await getNodePtySpawn()
        proc = ptySpawn(shellCmd, args, {
          cwd: options.cwd,
          env: options.env,
          cols: Number(payload?.cols || 120),
          rows: Number(payload?.rows || 30),
          name: process.platform === 'win32' ? 'xterm-color' : 'xterm-256color',
        })
      }

      const target = `本地终端${process.platform === 'win32' ? ` (${shellType}${elevated ? '+admin' : ''})` : ''}`
      const sessionRef = { proc, target, silentClose: false }
      localShellSessions.set(sessionId, sessionRef)
      localInputBuffers.set(sessionId, '')
      localOutputBuffers.set(sessionId, '')

      proc.onData((chunk) => {
        const text = String(chunk || '')
        const buffer = Buffer.from(text, 'utf8')
        broadcast('local:data', {
          sessionId,
          data: text,
          dataBase64: buffer.toString('base64'),
        })
        logOutputLines(localOutputBuffers, sessionId, text, 'local', target)
      })
      proc.onExit(({ exitCode, signal }) => {
        const active = localShellSessions.get(sessionId)
        if (active !== sessionRef) {
          localInputBuffers.delete(sessionId)
          localOutputBuffers.delete(sessionId)
          return
        }
        localShellSessions.delete(sessionId)
        localInputBuffers.delete(sessionId)
        localOutputBuffers.delete(sessionId)
        flushResponseLogsForSession('local', sessionId)
        if (sessionRef.silentClose) return
        broadcast('local:close', { sessionId, code: Number(exitCode || 0), signal: String(signal || '') })
        appendAuditLog({
          source: 'local',
          action: 'disconnect',
          target: sessionRef.target || target,
          content: `终端已退出（code=${Number(exitCode || 0)}）`,
        })
      })
      appendAuditLog({ source: 'local', action: 'connect', target, content: `连接成功（目录：${options.cwd}）` })
      if (connectWarning) {
        appendAuditLog({
          source: 'local',
          action: 'info',
          target,
          content: connectWarning,
        })
      }
      return {
        ok: true,
        shell: shellCmd,
        cwd: options.cwd,
        warning: connectWarning,
      }
    } catch (e) {
      const message = e?.message || '启动本地终端失败'
      appendAuditLog({ source: 'local', action: 'error', target: shellCmd, content: message, level: 'error' })
      return { ok: false, error: message }
    }
  })

  ipcMain.handle('local:write', async (_event, payload) => {
    const sessionId = String(payload?.sessionId || '').trim()
    const session = localShellSessions.get(sessionId)
    if (!session) return { ok: false, error: '本地终端会话不存在' }
    const data = String(payload?.data || '')
    if (!data) return { ok: true }
    try {
      session.proc?.write?.(data)
    } catch {
      return { ok: false, error: '写入本地终端失败' }
    }
    logCommandLines(localInputBuffers, sessionId, data, 'local', session.target || sessionId)
    return { ok: true }
  })

  ipcMain.handle('local:resize', async (_event, payload) => {
    const sessionId = String(payload?.sessionId || '').trim()
    const session = localShellSessions.get(sessionId)
    if (!session) return { ok: false, error: '本地终端会话不存在' }
    const cols = Math.max(20, Number(payload?.cols || 120))
    const rows = Math.max(8, Number(payload?.rows || 30))
    try {
      session.proc?.resize?.(cols, rows)
      return { ok: true }
    } catch (e) {
      const msg = String(e?.message || '')
      if (/already exited/i.test(msg) || /已退出/.test(msg)) {
        try { closeLocalShellSession(sessionId, 'resize-after-exit') } catch {}
        return { ok: false, error: '终端已退出' }
      }
      return { ok: false, error: '调整终端尺寸失败' }
    }
  })

  ipcMain.handle('local:disconnect', async (_event, payload) => {
    const sessionId = String(payload?.sessionId || '').trim()
    if (!sessionId) return { ok: true }
    closeLocalShellSession(sessionId, 'manual')
    return { ok: true }
  })
}
