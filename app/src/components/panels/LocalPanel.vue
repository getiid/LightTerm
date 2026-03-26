<script setup lang="ts">
const { vm } = defineProps<{ vm: any }>()
</script>

<template>
  <section class="panel local-panel">
    <div class="serial-head">
      <div>
        <h3>本地终端</h3>
        <p class="hosts-header-sub">科技风终端皮肤，支持中文显示、代码片段分类和快速执行</p>
      </div>
      <div class="serial-head-actions">
        <button class="ghost" @click="vm.connectLocalTerminal">+ 新本地标签</button>
        <button class="muted" :disabled="!vm.localConnected.value" @click="vm.disconnectLocalTerminal">关闭当前标签</button>
      </div>
    </div>
    <div class="grid local-shell-grid">
      <select v-model="vm.localShellType.value">
        <option value="auto">终端类型：自动</option>
        <option value="cmd">终端类型：CMD</option>
        <option value="powershell">终端类型：PowerShell</option>
      </select>
      <label
        v-if="vm.isWindowsClient.value"
        class="serial-inline-check"
        title="勾选后连接时将触发 UAC，在 AstraShell 内桥接管理员终端"
      >
        <input v-model="vm.localElevated.value" type="checkbox" /> 管理员模式（触发 UAC 后桥接到本体）
      </label>
    </div>
    <div class="local-status">{{ vm.localStatus.value }}</div>
    <div class="local-session-card compact">
      <div class="hosts-left-title">
        <span>已开连接</span>
        <span class="hosts-stat">展示最近命令和处理状态</span>
      </div>
      <div v-if="vm.localTabs.value.length > 0" class="local-session-list">
        <div
          v-for="tab in vm.localTabs.value"
          :key="tab.id"
          class="local-session-item"
          :class="{ active: vm.selectedLocalTabId.value === tab.id, entered: vm.activeLocalTabId.value === tab.id }"
        >
          <button
            class="local-session-main card"
            :title="tab.status"
            @click="vm.selectLocalTab(tab.id)"
            @dblclick="vm.openLocalTab(tab.id)"
          >
            <div class="local-session-card-head">
              <span class="local-session-state status-pill" :class="vm.localCommandStateClass(tab)">{{ vm.localCommandStateLabel(tab) }}</span>
            </div>
            <div class="local-session-copy card">
              <strong>{{ vm.localCommandTitle(tab) }}</strong>
              <span>{{ vm.localCommandMeta(tab) }}</span>
            </div>
          </button>
          <button class="local-session-close" title="关闭本地标签" @click="vm.closeLocalTab(tab.id)">×</button>
        </div>
      </div>
      <div v-else class="local-session-empty">当前没有已开连接</div>
    </div>
    <div class="local-tools-card">
      <div class="hosts-left-title">
        <span>代码片段快速执行</span>
        <span class="hosts-stat">支持分类筛选，点击后直接发送到当前本地终端</span>
      </div>

      <div class="local-quick-toolbar">
        <select v-model="vm.localSnippetCategory.value" class="file-sort">
          <option v-for="cat in vm.localSnippetCategories.value" :key="cat" :value="cat">{{ cat }}</option>
        </select>
        <input v-model="vm.localSnippetKeyword.value" placeholder="搜索片段名称/说明/命令" />
        <span class="hosts-stat">共 {{ vm.filteredLocalSnippetItems.value.length }} 条</span>
        <div class="serial-head-actions">
          <button class="ghost tiny" @click="vm.openSnippetsPanel">管理片段</button>
        </div>
      </div>
      <div v-if="vm.snippetStatus.value" class="local-status snippet-status">{{ vm.snippetStatus.value }}</div>

      <div class="local-quick-layout">
        <div class="local-tool-grid scrollable">
          <div v-for="item in vm.filteredLocalSnippetItems.value" :key="item.id" class="local-tool-item snippet-tool-item">
            <div class="local-tool-head">
              <strong>{{ item.name }}</strong>
              <span class="pill ghost">{{ item.category }}</span>
            </div>
            <div class="local-tool-desc">{{ item.description || '无说明' }}</div>
            <div class="local-tool-meta">
              <span class="hosts-stat">命令数：{{ vm.snippetCommandLines(item.commands).length }}</span>
            </div>
            <button class="ghost" :disabled="vm.snippetRunning.value || !vm.localConnected.value" @click="vm.executeSnippetOnLocalTerminal(item)">
              {{ vm.snippetRunning.value ? '执行中…' : '执行到本地终端' }}
            </button>
          </div>
          <div v-if="vm.filteredLocalSnippetItems.value.length === 0" class="file-row empty">当前分类暂无代码片段</div>
        </div>
      </div>
    </div>
  </section>
</template>
