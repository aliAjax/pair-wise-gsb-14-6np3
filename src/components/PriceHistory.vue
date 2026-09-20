<script setup lang="ts">
import { computed, ref } from "vue";
import { usePriceStore } from "../price/store";

const store = usePriceStore();
const stationFilter = ref("all");

const rows = computed(() =>
  [...store.history]
    .reverse()
    .filter((h) => stationFilter.value === "all" || h.stationId === stationFilter.value),
);

function fmt(iso: string) {
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}
</script>

<template>
  <section class="list-panel">
    <div class="toolbar">
      <h2>挂牌价历史（旧价 / 确认人可追溯）</h2>
      <select v-model="stationFilter">
        <option value="all">全部站点</option>
        <option v-for="s in store.stations" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
    </div>

    <div class="table-wrap">
      <table class="history-table">
        <thead>
          <tr>
            <th>生效时间</th>
            <th>站点 / 油品</th>
            <th>批次</th>
            <th>旧价 → 新价</th>
            <th>调发起人</th>
            <th>确认人（价格牌 / 每把油枪）</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="h in rows" :key="h.id">
            <td>{{ fmt(h.effectiveAt) }}</td>
            <td>{{ store.stationName(h.stationId) }} · {{ h.fuel }}</td>
            <td>{{ h.batchNo }}</td>
            <td>
              <span class="old-price">¥{{ h.oldPrice.toFixed(2) }}</span>
              → <strong>¥{{ h.newPrice.toFixed(2) }}</strong>
            </td>
            <td>{{ h.operator }}</td>
            <td>
              <div class="confirmer-tags">
                <span v-for="(c, i) in h.confirmers" :key="i" class="confirmer-tag">{{ c }}</span>
              </div>
            </td>
          </tr>
          <tr v-if="rows.length === 0">
            <td colspan="6" class="empty">暂无生效记录；批次全部回报完成后自动写入</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
