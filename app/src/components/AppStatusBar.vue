<script setup lang="ts">
const { vm } = defineProps<{ vm: any }>()
</script>

<template>
  <footer class="status-bar fixed-bottom">
    <div class="status-left">状态：{{ vm.statusText.value }}</div>
    <div v-if="vm.statusBarMode.value === 'sftp'" class="status-right">
      <span>↑ {{ vm.sftpUploadProgress.value }}%</span>
      <div class="mini-bar"><div class="mini-fill" :style="{ width: `${vm.sftpUploadProgress.value}%` }"></div></div>
      <span>↓ {{ vm.sftpDownloadProgress.value }}%</span>
      <div class="mini-bar"><div class="mini-fill down" :style="{ width: `${vm.sftpDownloadProgress.value}%` }"></div></div>
    </div>
    <div v-else-if="vm.statusBarMode.value === 'ssh-metrics'" class="status-right server-metrics">
      <span v-if="vm.activeSshTabName.value" class="metric-host">{{ vm.activeSshTabName.value }}</span>
      <span v-for="item in vm.sshMetricChips.value" :key="item.label" class="metric-chip">
        <strong>{{ item.label }}</strong>
        <span>{{ item.value }}</span>
      </span>
      <span v-if="vm.sshServerMetricsLoading.value && !vm.sshServerMetrics.value.supported" class="metric-note">刷新中...</span>
      <span v-else-if="vm.sshServerMetricsError.value" class="metric-note warning">{{ vm.sshServerMetricsError.value }}</span>
    </div>
  </footer>
</template>
