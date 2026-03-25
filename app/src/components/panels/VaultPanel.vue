<script setup lang="ts">
import { KeyRound, Trash2, Upload, Save } from 'lucide-vue-next'

const { vm } = defineProps<{ vm: any }>()

const formatVaultDate = (value: string | number | null | undefined) => {
  if (!value) return '未更新'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未更新'
  return date.toLocaleDateString()
}
</script>

<template>
  <section class="panel vault-panel">
    <div class="vault-header">
      <h3>密钥管理</h3>
      <p class="vault-status">
        {{ vm.vaultStatus.value }} ｜ bridge={{ vm.bridgeReady.value ? 'ok' : 'missing' }}
      </p>
    </div>

    <div class="vault-layout">
      <div class="vault-list">
        <div class="vault-list-head">
          <input v-model="vm.vaultKeyword.value" placeholder="搜索密钥名/类型/指纹" />
          <button class="ghost small" @click="vm.clearVaultEditor">新建密钥</button>
        </div>
        <div class="vault-card-grid">
          <div
            v-for="k in vm.filteredVaultItems.value"
            :key="k.id"
            class="vault-mini-card"
            :class="{ active: vm.selectedVaultKeyId.value === k.id }"
            @click="vm.openVaultEditor(k)"
            @keydown.enter="vm.openVaultEditor(k)"
            @keydown.space.prevent="vm.openVaultEditor(k)"
            tabindex="0"
            role="button"
          >
            <div class="vault-mini-head">
              <span class="vault-mini-title">{{ k.name }}</span>
              <div class="vault-mini-actions">
                <span class="pill ghost">{{ k.type }}</span>
                <button class="vault-mini-action danger" title="删除密钥" @click.stop="vm.deleteVaultKey(k)">
                  <Trash2 :size="12" />
                </button>
              </div>
            </div>
            <div class="vault-mini-fp">{{ k.fingerprint || '无指纹' }}</div>
            <div class="vault-mini-time">{{ formatVaultDate(k.updated_at) }}</div>
          </div>
          <div v-if="vm.filteredVaultItems.value.length === 0" class="file-row empty">暂无密钥数据</div>
        </div>
      </div>

      <div class="vault-editor-column" :class="{ visible: vm.vaultEditorVisible.value }">
        <div class="vault-editor-panel">
          <div class="editor-title">
            <KeyRound :size="14" /> 密钥编辑
            <button class="ghost small" @click="vm.clearVaultEditor">清空</button>
          </div>
          <div class="vault-form-grid">
            <input v-model="vm.vaultKeyName.value" placeholder="密钥名称" />
            <div class="vault-type-row">
              <span class="vault-field-label">密钥组</span>
              <select v-model="vm.vaultKeyType.value">
                <option value="auto">自动识别</option>
                <option value="openssh">OpenSSH</option>
                <option value="pem">PEM</option>
                <option value="ppk">PPK</option>
                <option value="public">Public</option>
                <option value="certificate">Certificate</option>
                <option value="bundle">Bundle</option>
              </select>
            </div>
            <p class="hint vault-form-hint">私钥/公钥/证书三项至少填写一项即可保存。</p>
            <textarea v-model="vm.vaultPrivateKey.value" class="key-input" placeholder="Private Key（可选）"></textarea>
            <textarea v-model="vm.vaultPublicKey.value" class="key-input" placeholder="Public Key（可选）"></textarea>
            <textarea v-model="vm.vaultCertificate.value" class="key-input" placeholder="Certificate（可选）"></textarea>
            <div class="vault-actions">
              <button class="vault-action-btn ghost" @click="vm.importVaultKeyFile">
                <Upload :size="14" /> 导入文件
              </button>
              <button class="vault-action-btn primary" @click="vm.saveVaultKey">
                <Save :size="14" /> {{ vm.selectedVaultKeyId.value ? '保存修改' : '保存密钥组' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
