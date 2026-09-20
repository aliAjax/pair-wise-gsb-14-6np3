<script setup lang="ts">
import { computed } from "vue";
import { usePriceStore } from "./price/store";
import { currentPrice, progressOf } from "./price/rules";
import AdjustForm from "./components/AdjustForm.vue";
import BatchList from "./components/BatchList.vue";
import PriceHistory from "./components/PriceHistory.vue";
import RejectedLog from "./components/RejectedLog.vue";

const store = usePriceStore();

const metrics = computed(() => {
  const dispatching = store.adjustments.filter((a) => a.status === "dispatching");
  const pendingItems = dispatching.reduce(
    (sum, a) => sum + (progressOf(a).total - progressOf(a).confirmed),
    0,
  );
  const frozenBatches = store.batches.filter((b) => b.frozen).length;
  const allPrices = store.stations.flatMap((s) =>
    [...new Set(s.nozzles.map((n) => n.fuel))].map((fuel) =>
      currentPrice(store.state, s.id, fuel, store.basePrices),
    ),
  );
  const avg = (allPrices.reduce((a, b) => a + b, 0) / Math.max(allPrices.length, 1)).toFixed(2);
  return [
    { label: "进行中调价", value: dispatching.length },
    { label: "待回报确认项", value: pendingItems },
    { label: "已冻结批次", value: frozenBatches },
    { label: "平均挂牌价", value: `¥${avg}` },
  ];
});
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">石油行业 · 价格牌下发确认闭环</p>
          <h1>油品价格维护 · 下发确认</h1>
          <p class="subtitle">
            每笔调价选站点、油品、目标价与批次：价格牌与每把油枪逐把回报，全部确认后才更新挂牌价并冻结批次；
            终端离线、重复回报一律不生效，撤回仅限未生效且释放全部派发项，旧价与确认人全程可追溯。
          </p>
        </div>
        <div class="stack">
          <span class="tag">Vue3</span>
          <span class="tag">Pinia</span>
          <span class="tag">规则/存储/页面分层</span>
          <span class="tag">localStorage 持久化</span>
        </div>
      </header>

      <section class="metrics">
        <article v-for="m in metrics" :key="m.label" class="metric">
          <span>{{ m.label }}</span>
          <strong>{{ m.value }}</strong>
        </article>
      </section>

      <section class="workspace workspace-wide">
        <div class="side-col">
          <AdjustForm />
          <RejectedLog />
        </div>
        <div class="main-col">
          <BatchList />
          <PriceHistory />
        </div>
      </section>

      <footer class="foot">
        <button class="secondary" type="button" @click="store.resetDemo()">恢复演示数据</button>
        <button class="secondary" type="button" @click="store.clearAll()">清空业务数据</button>
        <span class="foot-tip">所有状态保存在浏览器本地，刷新后批次、进度与价格历史保持一致</span>
      </footer>
    </div>

    <div class="toast-stack">
      <transition-group name="toast">
        <div v-for="t in store.toasts" :key="t.id" class="toast" :class="`toast-${t.type}`">
          {{ t.text }}
        </div>
      </transition-group>
    </div>
  </main>
</template>
