<script setup lang="ts">
const { vm } = defineProps<{ vm: any }>()
</script>

<template>
  <div v-if="vm.startupGateVisible.value" class="startup-overlay">
    <div class="startup-card">
      <h3>正在准备本地数据库...</h3>
      <p>应用启动后固定使用本地数据库运行；如果启用了同步，会在进入后后台检查远端数据库文件。</p>
      <p class="hint">当前数据文件：{{ vm.storageDbPath.value || vm.startupDbPath.value || '读取中...' }}</p>
      <p class="vault-status">{{ vm.startupGateError.value || vm.plainVaultMessage(vm.vaultStatus.value) || '就绪' }}</p>
    </div>
  </div>
</template>
