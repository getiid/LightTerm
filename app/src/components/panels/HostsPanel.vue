<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Pencil, Eye, EyeOff, Monitor, Plus, Server, Shield, Activity, TriangleAlert, Trash2 } from 'lucide-vue-next'

const { vm } = defineProps<{ vm: any }>()

const WARNING_DAYS = 15
const DAY_MS = 24 * 60 * 60 * 1000

const totalHosts = computed(() => vm.hostItems.value.length)
const filteredHostsCount = computed(() => vm.filteredHosts.value.length)
const selectedHost = computed(() => vm.hostItems.value.find((item: any) => item.id === vm.selectedHostId.value) || null)
const currentCategoryLabel = computed(() => (vm.selectedCategory.value === vm.allCategory ? '全部主机' : vm.selectedCategory.value))
const secondaryCategories = computed(() =>
  vm.displayCategories.value.filter((category: string) => category !== vm.allCategory && category !== vm.defaultCategory)
)

const countByCategory = (category: string) => {
  if (category === vm.allCategory) return vm.hostItems.value.length
  return vm.hostItems.value.filter((item: any) => (item.category || vm.defaultCategory) === category).length
}

const authLabel = (item: any) => ((item?.auth_type || item?.authType) === 'key' ? '密钥' : '密码')
const getHostExpiryDate = (item: any) => String(item?.expiryDate || item?.expiry_date || '').trim()

const probeLabel = (item: any) => {
  const state = vm.hostProbeClass(item.id)
  if (state === 'online') return '在线可连'
  if (state === 'offline') return '当前不可达'
  if (state === 'checking') return '正在检测'
  return '待检测'
}

const parseDateOnly = (value: string) => {
  const raw = String(value || '').trim()
  if (!raw) return null
  const date = new Date(`${raw}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

const daysUntilExpiry = (value: string) => {
  const expiry = parseDateOnly(value)
  if (!expiry) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((expiry.getTime() - today.getTime()) / DAY_MS)
}

const expiryText = (days: number | null) => {
  if (days == null) return '未设置到期'
  if (days < 0) return `已过期 ${Math.abs(days)} 天`
  if (days === 0) return '今天到期'
  return `还有 ${days} 天到期`
}

const expiringHosts = computed(() =>
  vm.hostItems.value
    .map((item: any) => {
      const days = daysUntilExpiry(getHostExpiryDate(item))
      return { item, days }
    })
    .filter(({ days }: { days: number | null }) => days != null && days <= WARNING_DAYS)
    .sort((a: { days: number | null }, b: { days: number | null }) => Number(a.days) - Number(b.days))
)

const jumpToExpiringHost = (item: any) => {
  vm.useHost(item)
  vm.openHostEditor(item)
}

const saveDateFieldIfExisting = async () => {
  if (!vm.editingHost.value?.id) return
  await vm.saveEditedHost()
}

const hostCategoryMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  category: '',
})

const closeHostCategoryMenu = () => {
  hostCategoryMenu.value.visible = false
}

const openHostCategoryMenu = (event: MouseEvent, category: string) => {
  if (!category || category === vm.defaultCategory || category === vm.allCategory) return
  event.preventDefault()
  hostCategoryMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    category,
  }
}

const renameHostCategoryFromMenu = () => {
  const category = hostCategoryMenu.value.category
  closeHostCategoryMenu()
  vm.beginRenameCategory(category)
}

const deleteHostCategoryFromMenu = () => {
  const category = hostCategoryMenu.value.category
  closeHostCategoryMenu()
  vm.deleteCategoryInline(category)
}

onMounted(() => {
  window.addEventListener('click', closeHostCategoryMenu)
  window.addEventListener('resize', closeHostCategoryMenu)
  window.addEventListener('scroll', closeHostCategoryMenu, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', closeHostCategoryMenu)
  window.removeEventListener('resize', closeHostCategoryMenu)
  window.removeEventListener('scroll', closeHostCategoryMenu, true)
})

</script>

<template>
  <section class="panel hosts-panel">
    <div class="hosts-shell">
      <header class="hosts-hero">
        <div class="hosts-hero-copy">
          <div class="hosts-hero-title-row">
            <div class="hosts-hero-headline">
              <span class="hosts-kicker">SSH WORKSPACE</span>
              <h3>主机管理</h3>
            </div>
            <span class="hosts-header-sub hosts-header-inline">{{ currentCategoryLabel }} · {{ filteredHostsCount }} / {{ totalHosts }} 台</span>
          </div>
          <div class="hosts-expiry-strip" :class="{ quiet: expiringHosts.length === 0 }">
            <div class="hosts-expiry-label">
              <TriangleAlert :size="14" />
              <span>到期预警</span>
            </div>
            <div v-if="expiringHosts.length > 0" class="hosts-expiry-list">
              <button
                v-for="entry in expiringHosts.slice(0, 4)"
                :key="entry.item.id"
                class="hosts-expiry-item"
                :class="{ danger: Number(entry.days) <= 3 }"
                @click="jumpToExpiringHost(entry.item)"
              >
                <strong>{{ entry.item.name }}</strong>
                <span>{{ expiryText(entry.days) }}</span>
              </button>
              <span v-if="expiringHosts.length > 4" class="hosts-expiry-more">还有 {{ expiringHosts.length - 4 }} 台待处理</span>
            </div>
            <span v-else class="hosts-expiry-empty">未来 {{ WARNING_DAYS }} 天内没有到期主机</span>
          </div>
        </div>

        <div class="hosts-quick-card">
          <div class="hosts-quick-card-head">
            <strong>快速连接</strong>
            <span>输入地址后可直接连接，也可以顺手保存到主机库。</span>
          </div>
          <div class="hosts-quick-connect">
            <input
              v-model="vm.quickConnectInput.value"
              placeholder="SSH 快速连接，例如 root@1.2.3.4 或 admin@1.2.3.4:22"
              @keyup.enter="vm.connectSSHFromHosts"
            />
            <button class="ghost small" @click="vm.saveCurrentHost">保存到主机库</button>
            <button class="muted small" @click="vm.connectSSHFromHosts">立即连接</button>
          </div>
        </div>
      </header>

      <div class="hosts-layout new-layout">
        <aside class="hosts-left">
          <div class="hosts-left-title">
            <span>分类导航</span>
            <button class="ghost tiny hosts-left-create" @click="vm.beginAddCategory">
              <Plus :size="12" /> 新建
            </button>
          </div>
          <p class="hosts-categories-caption">先按分类收缩范围，再在中间批量筛选和连接。</p>
          <div v-if="vm.newCategoryInputVisible.value" class="cat-item input-item">
            <input
              v-model="vm.newCategoryName.value"
              placeholder="输入分类名后回车"
              @keyup.enter="vm.addCategory"
              @blur="vm.addCategory"
            />
          </div>
          <div class="hosts-category-topline">
            <div
              class="cat-item compact"
              :class="{ activeCat: vm.selectedCategory.value === vm.allCategory }"
            >
              <button class="cat-name" @click="vm.selectedCategory.value = vm.allCategory">
                <span class="cat-name-main">{{ vm.allCategory }}</span>
                <span class="cat-count">{{ countByCategory(vm.allCategory) }}</span>
              </button>
            </div>
            <div
              class="cat-item compact"
              :class="{ activeCat: vm.selectedCategory.value === vm.defaultCategory }"
            >
              <button class="cat-name" @click="vm.selectedCategory.value = vm.defaultCategory">
                <span class="cat-name-main">{{ vm.defaultCategory }}</span>
                <span class="cat-count">{{ countByCategory(vm.defaultCategory) }}</span>
              </button>
            </div>
          </div>
          <div class="hosts-category-list">
            <div
              v-for="c in secondaryCategories"
              :key="c"
              class="cat-item"
              :class="{ activeCat: vm.selectedCategory.value === c }"
              @contextmenu="openHostCategoryMenu($event, c)"
            >
              <template v-if="vm.editingCategory.value === c">
                <input
                  v-model="vm.editingCategoryName.value"
                  class="cat-inline-input"
                  placeholder="输入新的分类名"
                  @click.stop
                  @keyup.enter="vm.renameCategoryInline()"
                  @keyup.esc="vm.cancelRenameCategory"
                  @blur="vm.renameCategoryInline()"
                />
              </template>
              <template v-else>
                <button class="cat-name" @click="vm.selectedCategory.value = c">
                  <span class="cat-name-main">{{ c }}</span>
                  <span class="cat-count">{{ countByCategory(c) }}</span>
                </button>
              </template>
            </div>
          </div>
        </aside>

        <main class="hosts-center">
          <section class="hosts-spotlight" :class="{ empty: !selectedHost }">
            <template v-if="selectedHost">
              <div class="hosts-spotlight-main">
                <div class="hosts-spotlight-icon slim">
                  <Server :size="18" />
                </div>
                <div class="hosts-spotlight-copy">
                  <span class="hosts-spotlight-label">当前聚焦</span>
                  <strong>{{ selectedHost.name }}</strong>
                  <p>{{ selectedHost.username }}@{{ selectedHost.host }}<template v-if="Number(selectedHost.port || 22) !== 22">:{{ selectedHost.port }}</template></p>
                </div>
                <div class="hosts-spotlight-meta">
                  <span class="pill ghost">{{ selectedHost.category || vm.defaultCategory }}</span>
                  <span class="pill ghost">{{ authLabel(selectedHost) }}</span>
                  <span class="pill ghost">{{ probeLabel(selectedHost) }}</span>
                  <span v-if="getHostExpiryDate(selectedHost)" class="pill ghost danger">{{ expiryText(daysUntilExpiry(getHostExpiryDate(selectedHost))) }}</span>
                </div>
              </div>
              <div class="hosts-spotlight-actions">
                <button class="ghost small" :disabled="vm.hostProbeRunning.value || vm.filteredHosts.value.length === 0" @click="vm.probeFilteredHosts">
                  {{ vm.hostProbeRunning.value ? '检测中...' : '检测当前列表' }}
                </button>
                <button class="muted small" @click="vm.openCreateHostEditor">新建服务器</button>
              </div>
            </template>
            <template v-else>
              <div class="hosts-spotlight-main">
                <div class="hosts-spotlight-icon empty slim">
                  <Shield :size="18" />
                </div>
                <div class="hosts-spotlight-copy">
                  <span class="hosts-spotlight-label">当前聚焦</span>
                  <strong>先选一台服务器</strong>
                  <p>下方主机卡片支持单击聚焦、双击直连，右侧会同步打开编辑面板。</p>
                </div>
              </div>
              <div class="hosts-spotlight-actions">
                <button class="ghost small" :disabled="vm.hostProbeRunning.value || vm.filteredHosts.value.length === 0" @click="vm.probeFilteredHosts">
                  {{ vm.hostProbeRunning.value ? '检测中...' : '检测当前列表' }}
                </button>
                <button class="muted small" @click="vm.openCreateHostEditor">新建服务器</button>
              </div>
            </template>
          </section>

          <div class="host-grid" :class="{ 'editor-open': vm.hostEditorVisible.value }">
            <article
              v-for="h in vm.filteredHosts.value"
              :key="h.id"
              class="host-card"
              :class="{ activeHost: vm.selectedHostId.value === h.id }"
              @click="vm.useHost(h)"
              @dblclick="vm.openHostTerminal(h)"
            >
              <div class="host-card-top">
                <div class="host-card-main">
                  <span class="host-icon">{{ (h.auth_type || h.authType) === 'key' ? '🔑' : '🖥' }}</span>
                  <div class="host-card-body">
                    <div class="host-card-title-row">
                      <div class="host-card-title">{{ h.name }}</div>
                      <span class="pill ghost">{{ authLabel(h) }}</span>
                    </div>
                    <div class="host-line">{{ h.username }}@{{ h.host }} · {{ Number(h.port || 22) }}</div>
                  </div>
                </div>
              </div>

              <div class="host-card-tags">
                <span class="host-mini-pill">{{ h.category || vm.defaultCategory }}</span>
                <span class="host-mini-pill">双击直连</span>
              </div>

              <div class="host-card-foot">
                <div class="host-health-line">
                  <button class="status-dot-btn" :title="vm.hostProbeTitle(h)" @click.stop="vm.testHostReachability(h)">
                    <span class="status-dot" :class="vm.hostProbeClass(h.id)"></span>
                  </button>
                  <span class="host-health-text">{{ probeLabel(h) }}</span>
                </div>
                <div class="host-card-actions">
                  <button
                    v-if="vm.hostConnectedSessionCount(h) > 0"
                    class="host-session-entry"
                    :title="`进入已打开会话（${vm.hostConnectedSessionCount(h)}）`"
                    @click.stop="vm.openExistingHostTerminal(h)"
                  >
                    <Monitor :size="13" />
                    <span v-if="vm.hostConnectedSessionCount(h) > 1" class="host-session-entry-count">
                      {{ vm.hostConnectedSessionCount(h) }}
                    </span>
                  </button>
                  <button class="ghost tiny" @click.stop="vm.openHostTerminal(h)">连接</button>
                  <button class="host-edit-btn" title="编辑主机" @click.stop="vm.openHostEditor(h)">
                    <Pencil :size="12" />
                  </button>
                  <button
                    class="host-delete-btn"
                    title="删除主机"
                    @click.stop="vm.selectedHostId.value = h.id; vm.deleteCurrentHost()"
                  >
                    <Trash2 :size="12" />
                  </button>
                </div>
              </div>
            </article>

            <div v-if="vm.filteredHosts.value.length === 0" class="hosts-empty-state">
              <div class="hosts-empty-icon">
                <Activity :size="18" />
              </div>
              <strong>当前没有可显示的主机</strong>
              <p>可以新建服务器，或切换左侧分类后继续管理。</p>
            </div>
          </div>
        </main>

        <aside class="hosts-editor-column" :class="{ visible: vm.hostEditorVisible.value }">
          <div v-if="vm.hostEditorVisible.value" class="host-editor-panel">
            <div class="editor-title">
              <div class="editor-title-main">
                <Pencil :size="14" />
                <div>
                  <strong>{{ vm.editingHost.value?.id ? '编辑 SSH 主机' : '新建 SSH 主机' }}</strong>
                  <small>右侧保持参数完整，左侧随时可以继续切换主机。</small>
                </div>
              </div>
              <div class="editor-title-actions">
                <button class="small" @click="vm.saveEditedHost">保存</button>
                <button class="ghost small" @click="vm.hostEditorVisible.value = false">收起</button>
              </div>
            </div>
            <div v-if="vm.editingHost.value" class="ssh-edit-zone">
              <div class="ssh-edit-grid">
                <div class="ssh-module">
                  <div class="module-title">基础信息</div>
                  <input v-model="vm.editingHost.value.name" placeholder="连接名称" />
                  <select v-model="vm.editingHost.value.category">
                    <option v-for="c in vm.hostCategories.value" :key="c" :value="c">{{ c }}</option>
                  </select>
                  <input v-model="vm.editingHost.value.host" placeholder="主机/IP" />
                  <div class="ssh-inline-grid">
                    <input v-model.number="vm.editingHost.value.port" type="number" placeholder="端口" />
                    <input v-model="vm.editingHost.value.username" placeholder="用户名" />
                  </div>
                </div>

                <div class="ssh-module">
                  <div class="module-title">认证方式</div>
                  <select v-model="vm.editingHost.value.authType">
                    <option value="password">密码认证</option>
                    <option value="key">密钥认证</option>
                  </select>
                  <div v-if="vm.editingHost.value.authType === 'password'" class="password-field">
                    <input
                      v-model="vm.editingHost.value.password"
                      :type="vm.editPasswordVisible.value ? 'text' : 'password'"
                      placeholder="密码"
                    />
                    <button
                      class="icon-btn password-toggle"
                      type="button"
                      :title="vm.editPasswordVisible.value ? '隐藏密码' : '显示密码'"
                      @click="vm.editPasswordVisible.value = !vm.editPasswordVisible.value"
                    >
                      <EyeOff v-if="vm.editPasswordVisible.value" :size="14" />
                      <Eye v-else :size="14" />
                    </button>
                  </div>
                  <select v-else v-model="vm.editingHost.value.privateKeyRef">
                    <option value="">选择密钥</option>
                    <option v-for="k in vm.vaultItems.value" :key="k.id" :value="k.id">{{ k.name }} ({{ k.type }})</option>
                  </select>
                </div>
              </div>

              <div class="ssh-edit-grid">
                <div class="ssh-module">
                  <div class="module-title">资产信息</div>
                  <label>购买日期</label>
                  <input v-model="vm.editingHost.value.purchaseDate" type="date" @change="saveDateFieldIfExisting" />
                  <label>有效期</label>
                  <input v-model="vm.editingHost.value.expiryDate" type="date" @change="saveDateFieldIfExisting" />
                </div>
              </div>
            </div>
            <div v-else class="empty-tip">先在中间选择一个 SSH 条目进行编辑</div>
          </div>
        </aside>
      </div>
    </div>
    <div
      v-if="hostCategoryMenu.visible"
      class="context-menu"
      :style="{ left: `${hostCategoryMenu.x}px`, top: `${hostCategoryMenu.y}px` }"
      @click.stop
    >
      <button class="menu-item" @click="renameHostCategoryFromMenu">重命名</button>
      <button class="menu-item danger" @click="deleteHostCategoryFromMenu">删除</button>
    </div>
  </section>
</template>
