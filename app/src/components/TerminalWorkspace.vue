<script setup lang="ts">
import { ref, watch } from 'vue'
import { Menu, X } from 'lucide-vue-next'

const { vm } = defineProps<{ vm: any }>()

const toolsDrawerOpen = ref(false)

const closeToolsDrawer = () => {
  toolsDrawerOpen.value = false
}

const toggleToolsDrawer = () => {
  toolsDrawerOpen.value = !toolsDrawerOpen.value
}

watch(() => vm.focusTerminal.value, (visible: boolean) => {
  if (!visible) closeToolsDrawer()
})

watch(() => vm.activeTerminalMode.value, () => {
  closeToolsDrawer()
})
</script>

<template>
  <div class="terminal-workspace" :class="{ active: vm.focusTerminal.value }">
    <div class="top-actions terminal-top-actions" v-if="vm.focusTerminal.value">
      <div class="terminal-mode-line" :class="{ 'ssh-mode-line': vm.activeTerminalMode.value === 'ssh' }">
        <span class="status-pill mode terminal-mode-pill" :class="{ 'ssh-terminal-mode-pill': vm.activeTerminalMode.value === 'ssh' }">
          {{ vm.terminalModeLabel.value }}
        </span>
        <div v-if="vm.activeTerminalMode.value === 'ssh'" class="terminal-tabs terminal-tabs-inline">
          <div
            v-for="tab in vm.sshTabs.value"
            :key="tab.id"
            class="terminal-tab"
            :class="{ active: vm.sshSessionId.value === tab.id }"
          >
            <button type="button" class="terminal-tab-main" @click="vm.switchSshTab(tab.id)">
              <span class="terminal-tab-name">{{ tab.name }}</span>
              <span class="status-dot" :class="tab.connected ? 'online' : 'offline'"></span>
            </button>
            <button
              type="button"
              class="terminal-tab-close"
              title="关闭并断开"
              @pointerdown.stop.prevent
              @mousedown.stop.prevent
              @click.stop.prevent="vm.handleSshTabClose(tab.id)"
            >
              ×
            </button>
          </div>
        </div>
        <span v-else class="status-pill plain">{{ vm.terminalTargetLabel.value }}</span>
        <div v-if="vm.activeTerminalMode.value === 'ssh'" class="terminal-mode-tools">
          <button type="button" class="ghost small terminal-return-btn" @click="vm.openSshConnectionChooser()">返回</button>
          <button type="button" class="ghost small terminal-menu-btn" title="终端工具" @click="toggleToolsDrawer">
            <Menu :size="16" />
          </button>
        </div>
        <div v-else-if="vm.activeTerminalMode.value === 'local'" class="terminal-mode-tools">
          <button type="button" class="ghost small terminal-return-btn" @click="vm.openLocalTerminalChooser()">返回</button>
          <button type="button" class="ghost small terminal-menu-btn" title="终端工具" @click="toggleToolsDrawer">
            <Menu :size="16" />
          </button>
        </div>
      </div>
      <div v-if="vm.activeTerminalMode.value === 'local'" class="terminal-tabs">
        <div
          v-for="tab in vm.localTabs.value"
          :key="tab.id"
          class="terminal-tab"
          :class="{ active: vm.activeLocalTabId.value === tab.id }"
        >
          <button type="button" class="terminal-tab-main" @click="vm.switchLocalTab(tab.id)">
            <span class="terminal-tab-name">{{ tab.name }}</span>
            <span class="status-dot" :class="tab.connected ? 'online' : 'offline'"></span>
          </button>
          <button
            type="button"
            class="terminal-tab-close"
            title="关闭本地标签"
            @click="vm.closeLocalTab(tab.id)"
          >
            ×
          </button>
        </div>
        <button type="button" class="ghost small" @click="vm.connectLocalTerminal()">+ 本地标签</button>
      </div>
      <div v-if="vm.activeTerminalMode.value === 'serial'" class="serial-live-toolbar">
        <div class="terminal-tools-left">
          <button class="ghost terminal-tool-btn" @click="vm.exitTerminalView">返回串口面板</button>
          <button class="danger terminal-tool-btn terminal-tool-btn-danger" @click="vm.closeSerial">断开串口</button>
        </div>
        <div class="terminal-tools-right">
          <select v-model="vm.terminalSnippetCategory.value" class="terminal-tool-select">
            <option v-for="cat in vm.terminalSnippetCategories.value" :key="cat" :value="cat">
              {{ cat }}
            </option>
          </select>
          <select v-model="vm.terminalSnippetId.value" class="terminal-tool-select">
            <option value="">选择代码片段</option>
            <option v-for="item in vm.terminalSnippetItems.value" :key="item.id" :value="item.id">
              {{ item.name }}
            </option>
          </select>
          <button class="muted terminal-tool-btn" :disabled="vm.snippetRunning.value" @click="vm.runTerminalSnippet">执行片段</button>
        </div>
      </div>
    </div>

    <section
      v-show="vm.focusTerminal.value"
      class="terminal-wrap"
      :class="{ focus: vm.focusTerminal.value, 'serial-live-shell': vm.activeTerminalMode.value === 'serial' }"
    >
      <div class="terminal-core">
        <div :ref="vm.bindTermEl" class="terminal" @contextmenu.prevent="vm.openTerminalContextMenu"></div>
      </div>
      <aside v-if="vm.activeTerminalMode.value === 'serial'" class="serial-snippet-rail">
        <div class="serial-rail-head">
          <button class="ghost small" @click="vm.openSnippetsPanel">打开片段库</button>
        </div>
        <div class="serial-rail-search">
          <input v-model="vm.snippetKeyword.value" placeholder="搜索片段" />
        </div>
        <div class="serial-rail-list">
          <article
            v-for="item in vm.terminalSnippetItems.value.slice(0, 16)"
            :key="`serial-rail-${item.id}`"
            class="serial-rail-item"
            @click="vm.terminalSnippetId.value = item.id"
          >
            <header>
              <span>{{ item.name }}</span>
              <small>{{ vm.snippetCommandLines(item.commands).length }} 条</small>
            </header>
            <pre>{{ vm.snippetCommandLines(item.commands).slice(0, 2).join(' ; ') }}</pre>
          </article>
        </div>
      </aside>
    </section>
    <div v-if="toolsDrawerOpen && vm.activeTerminalMode.value !== 'serial'" class="terminal-tools-overlay" @click="closeToolsDrawer"></div>
    <aside v-if="toolsDrawerOpen && vm.activeTerminalMode.value !== 'serial'" class="terminal-tools-drawer">
      <div class="terminal-tools-drawer-head">
        <strong>终端工具</strong>
        <button type="button" class="ghost small terminal-drawer-close" @click="closeToolsDrawer">
          <X :size="16" />
        </button>
      </div>
      <div class="terminal-tools-drawer-body">
        <label class="terminal-drawer-field">
          <span>终端编码</span>
          <select v-model="vm.terminalEncoding.value" class="terminal-tool-select encoding-select" title="终端解码">
            <option value="utf-8">UTF-8</option>
            <option value="gb18030">GBK / GB18030</option>
          </select>
        </label>
        <label class="terminal-drawer-field">
          <span>片段分类</span>
          <select v-model="vm.terminalSnippetCategory.value" class="terminal-tool-select">
            <option v-for="cat in vm.terminalSnippetCategories.value" :key="cat" :value="cat">
              {{ cat }}
            </option>
          </select>
        </label>
        <label class="terminal-drawer-field">
          <span>代码片段</span>
          <select v-model="vm.terminalSnippetId.value" class="terminal-tool-select">
            <option value="">选择代码片段</option>
            <option v-for="item in vm.terminalSnippetItems.value" :key="item.id" :value="item.id">
              {{ item.name }}
            </option>
          </select>
        </label>
        <div class="terminal-drawer-actions">
          <button class="muted terminal-tool-btn" :disabled="vm.snippetRunning.value" @click="vm.runTerminalSnippet">执行片段</button>
          <button class="ghost terminal-tool-btn" @click="vm.sendSnippetRawToTerminal">发送原文</button>
          <button class="ghost terminal-tool-btn" @click="vm.openSnippetsPanel">打开片段</button>
        </div>
      </div>
    </aside>
  </div>
</template>
