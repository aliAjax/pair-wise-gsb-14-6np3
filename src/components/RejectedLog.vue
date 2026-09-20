<script setup lang="ts">
import { computed } from "vue";
import { usePriceStore } from "../price/store";

const store = usePriceStore();
const recent = computed(() => [...store.rejected].reverse().slice(0, 8));

function fmt(iso: string) {
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}
</script>

<template>
  <section class="panel reject-panel">
    <h2>未生效回报记录</h2>
    <p class="muted small">终端离线、重复回报等尝试不会改变确认进度，仅在此留痕。</p>
    <div v-if="recent.length === 0" class="empty compact">暂无被拒绝的回报</div>
    <ul v-else class="reject-list">
      <li v-for="r in recent" :key="r.id">
        <div class="reject-head">
          <strong>{{ store.stationName(r.stationId) }} · {{ r.terminalLabel }}</strong>
          <span class="muted small">{{ fmt(r.at) }}</span>
        </div>
        <p class="reject-reason">{{ r.reason }}</p>
        <p class="muted small">批次 {{ r.batchNo }} · {{ r.fuel }}</p>
      </li>
    </ul>
  </section>
</template>
