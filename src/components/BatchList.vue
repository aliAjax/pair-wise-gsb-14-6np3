<script setup lang="ts">
import { computed, ref } from "vue";
import { usePriceStore } from "../price/store";
import { batchAdjustments, currentPrice, progressOf } from "../price/rules";
import AdjustCard from "./AdjustCard.vue";
import { Batch } from "../price/types";

const store = usePriceStore();
const showFrozen = ref(false);
const showWithdrawn = ref(false);

interface BatchGroup {
  batch: Batch;
  total: number;
  confirmed: number;
  done: boolean;
}

const groups = computed<BatchGroup[]>(() =>
  [...store.batches]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((batch) => {
      const adjs = batchAdjustments(store.state, batch.batchNo);
      const total = adjs.reduce((s, a) => s + progressOf(a).total, 0);
      const confirmed = adjs.reduce((s, a) => s + progressOf(a).confirmed, 0);
      return { batch, total, confirmed, done: total > 0 && confirmed === total };
    }),
);

const openGroups = computed(() => groups.value.filter((g) => !g.batch.frozen));
const frozenGroups = computed(() => groups.value.filter((g) => g.batch.frozen));

const withdrawn = computed(() =>
  store.adjustments
    .filter((a) => a.status === "withdrawn")
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
);

const priceBoard = computed(() =>
  store.stations.map((station) => ({
    station,
    rows: [...new Set(station.nozzles.map((n) => n.fuel))].map((fuel) => ({
      fuel,
      price: currentPrice(store.state, station.id, fuel, store.basePrices),
    })),
  })),
);

function fmt(iso: string) {
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}
</script>

<template>
  <section class="list-panel">
    <div class="toolbar">
      <h2>各站点当前挂牌价</h2>
      <span class="muted">全部终端回报完成后此处才会变化</span>
    </div>
    <div class="price-board">
      <div v-for="group in priceBoard" :key="group.station.id" class="price-station">
        <p class="price-station-name">{{ group.station.name }}</p>
        <div class="price-cells">
          <div v-for="r in group.rows" :key="r.fuel" class="price-cell">
            <span>{{ r.fuel }}</span>
            <strong>¥{{ r.price.toFixed(2) }}</strong>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="list-panel">
    <div class="toolbar">
      <h2>批次与确认进度</h2>
      <span class="muted">价格牌 + 每把油枪逐项回报；部分进度刷新不丢失</span>
    </div>

    <div v-if="openGroups.length === 0" class="empty">暂无进行中的批次，请在左侧新建调价</div>

    <div v-for="g in openGroups" :key="g.batch.batchNo" class="batch-block">
      <div class="batch-head">
        <div>
          <span class="batch-no">{{ g.batch.batchNo }}</span>
          <span class="batch-state open">未冻结 · 下发中</span>
        </div>
        <span class="batch-progress">{{ g.confirmed }}/{{ g.total }} 项已确认</span>
      </div>
      <AdjustCard
        v-for="adj in batchAdjustments(store.state, g.batch.batchNo)"
        :key="adj.id"
        :adjustment="adj"
      />
    </div>

    <div v-if="frozenGroups.length > 0" class="frozen-toggle">
      <button class="secondary mini" type="button" @click="showFrozen = !showFrozen">
        {{ showFrozen ? "收起" : "查看" }}已冻结批次（{{ frozenGroups.length }}）
      </button>
    </div>

    <template v-if="showFrozen">
      <div v-for="g in frozenGroups" :key="g.batch.batchNo" class="batch-block frozen-block">
        <div class="batch-head">
          <div>
            <span class="batch-no">{{ g.batch.batchNo }}</span>
            <span class="batch-state frozen">已冻结 · {{ fmt(g.batch.frozenAt ?? g.batch.createdAt) }}</span>
          </div>
          <span class="batch-progress">{{ g.confirmed }}/{{ g.total }} 项已确认</span>
        </div>
        <AdjustCard
          v-for="adj in batchAdjustments(store.state, g.batch.batchNo).filter((a) => a.status === 'effective')"
          :key="adj.id"
          :adjustment="adj"
        />
      </div>
    </template>

    <div v-if="withdrawn.length > 0" class="frozen-toggle">
      <button class="secondary mini" type="button" @click="showWithdrawn = !showWithdrawn">
        {{ showWithdrawn ? "收起" : "查看" }}已撤回调价（{{ withdrawn.length }}）
      </button>
    </div>
    <template v-if="showWithdrawn">
      <AdjustCard v-for="adj in withdrawn" :key="adj.id" :adjustment="adj" />
    </template>
  </section>
</template>
