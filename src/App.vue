<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { storeToRefs } from "pinia";
import {
  BATCH_STATUS_TEXT,
  CONFIRM_STATUS_TEXT,
  FUELS,
  batchProgress,
  confirmersOfBatch,
  currentPrice,
  itemsOfBatch,
  nextBatchNo,
  type PriceBatch,
  type RuleResult
} from "./domain/pricing";
import { usePricingStore } from "./stores/pricing";

const store = usePricingStore();
const { state } = storeToRefs(store);

const STATUS_FILTERS = ["全部状态", "下发中", "已生效", "已撤回"] as const;

const form = reactive({
  stationId: state.value.stations[0]?.id ?? "",
  fuel: FUELS[0] as string,
  targetPrice: null as number | null,
  operator: "站长",
  note: ""
});

const statusFilter = ref<(typeof STATUS_FILTERS)[number]>("全部状态");
const feedback = ref<{ type: "success" | "error"; text: string } | null>(null);
const expanded = reactive(new Set<string>());
const confirmerDrafts = reactive<Record<string, string>>({});

const nextBatch = computed(() => nextBatchNo(state.value.batchSeq));
const listedPrice = computed(() => currentPrice(state.value, form.stationId, form.fuel));

const metrics = computed(() => {
  const batches = state.value.batches;
  const dispatchingIds = new Set(batches.filter((batch) => batch.status === "dispatching").map((batch) => batch.id));
  const pending = state.value.items.filter(
    (item) => item.status === "pending" && dispatchingIds.has(item.batchId)
  ).length;
  return [
    { label: "调价批次", value: batches.length },
    { label: "下发中", value: dispatchingIds.size },
    { label: "待确认派发项", value: pending },
    { label: "已生效批次", value: batches.filter((batch) => batch.status === "effective").length }
  ];
});

const filteredBatches = computed(() => {
  if (statusFilter.value === "全部状态") return state.value.batches;
  const text = statusFilter.value as string;
  return state.value.batches.filter((batch) => BATCH_STATUS_TEXT[batch.status] === text);
});

const historyRows = computed(() =>
  [...state.value.history].reverse().map((entry) => ({
    ...entry,
    stationName: stationName(entry.stationId),
    confirmers:
      entry.batchId === "INIT"
        ? "—"
        : confirmersOfBatch(state.value, entry.batchId)
            .map((row) => `${row.terminalLabel}·${row.confirmer}`)
            .join("、") || "—"
  }))
);

function stationName(stationId: string) {
  return state.value.stations.find((station) => station.id === stationId)?.name ?? stationId;
}

function apply(result: RuleResult) {
  feedback.value = { type: result.ok ? "success" : "error", text: result.message };
}

function submit() {
  const result = store.create({
    stationId: form.stationId,
    fuel: form.fuel,
    targetPrice: Number(form.targetPrice),
    operator: form.operator,
    note: form.note
  });
  apply(result);
  if (result.ok) {
    form.targetPrice = null;
    form.note = "";
  }
}

function toggleExpand(batch: PriceBatch) {
  if (expanded.has(batch.id)) {
    expanded.delete(batch.id);
  } else {
    expanded.add(batch.id);
    confirmerDrafts[batch.id] = confirmerDrafts[batch.id] ?? batch.operator;
  }
}

function report(batch: PriceBatch, terminalId: string) {
  const confirmer = (confirmerDrafts[batch.id] ?? "").trim() || batch.operator;
  apply(store.report({ batchId: batch.id, terminalId, confirmer }));
}

function withdraw(batch: PriceBatch) {
  if (!window.confirm(`确认撤回批次 ${batch.batchNo}？将释放全部派发项。`)) return;
  apply(store.withdraw(batch.id));
}

function toggleOnline(stationId: string, terminalId: string) {
  store.setOnline(stationId, terminalId, !terminalOnline(stationId, terminalId));
}

function terminalOnline(stationId: string, terminalId: string) {
  return (
    state.value.stations
      .find((station) => station.id === stationId)
      ?.terminals.find((terminal) => terminal.id === terminalId)?.online ?? false
  );
}

function progressOf(batchId: string) {
  return batchProgress(state.value, batchId);
}

function progressPct(batchId: string) {
  const { confirmed, total } = progressOf(batchId);
  return total === 0 ? 0 : Math.round((confirmed / total) * 100);
}

function itemsOf(batchId: string) {
  return itemsOfBatch(state.value, batchId);
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

function fmtPrice(price: number | null) {
  return price == null ? "—" : `¥${price.toFixed(2)}`;
}
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">石油行业 · 价格牌下发确认闭环</p>
          <h1>油品价格维护</h1>
          <p class="subtitle">
            每笔调价选定站点、油品、目标价并生成批次；价格牌与每把油枪各自回报确认，全部回报后挂牌价才生效并冻结批次。
          </p>
        </div>
        <div class="stack">
          <span class="tag">Vue3</span>
          <span class="tag">Vite</span>
          <span class="tag">TypeScript</span>
          <span class="tag">Pinia</span>
          <span class="tag">localStorage</span>
        </div>
      </header>

      <section class="metrics">
        <article v-for="metric in metrics" :key="metric.label" class="metric">
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
        </article>
      </section>

      <p v-if="feedback" class="banner" :class="{ error: feedback.type === 'error' }">{{ feedback.text }}</p>

      <section class="workspace">
        <form class="panel" @submit.prevent="submit">
          <h2>新建调价下发</h2>
          <div class="form-grid">
            <label>
              站点
              <select v-model="form.stationId" required>
                <option v-for="station in state.stations" :key="station.id" :value="station.id">
                  {{ station.name }}
                </option>
              </select>
            </label>
            <label>
              油品
              <select v-model="form.fuel" required>
                <option v-for="fuel in FUELS" :key="fuel" :value="fuel">{{ fuel }}</option>
              </select>
            </label>
            <p class="price-now">当前挂牌价：{{ fmtPrice(listedPrice) }} ｜ 批次号：{{ nextBatch }}</p>
            <label>
              目标价（元/升）
              <input v-model.number="form.targetPrice" type="number" step="0.01" min="0.01" placeholder="例如 7.66" required />
            </label>
            <label>
              操作员
              <input v-model="form.operator" required />
            </label>
            <label>
              备注
              <textarea v-model="form.note" placeholder="调价原因、通知文号等" />
            </label>
            <button type="submit">创建批次并下发</button>
          </div>
        </form>

        <section class="list-panel">
          <div class="toolbar">
            <h2>调价批次</h2>
            <select v-model="statusFilter">
              <option v-for="item in STATUS_FILTERS" :key="item">{{ item }}</option>
            </select>
          </div>

          <div class="record-grid">
            <div v-if="filteredBatches.length === 0" class="empty">暂无批次，请先创建调价</div>
            <article v-for="batch in filteredBatches" :key="batch.id" class="record">
              <div class="record-head">
                <p class="record-title">{{ batch.batchNo }} · {{ stationName(batch.stationId) }} · {{ batch.fuel }}</p>
                <span class="status" :class="batch.status">{{ BATCH_STATUS_TEXT[batch.status] }}</span>
              </div>
              <div class="details">
                <span>目标价: {{ fmtPrice(batch.targetPrice) }}</span>
                <span>原挂牌价: {{ fmtPrice(batch.oldPrice) }}</span>
                <span>操作员: {{ batch.operator }}</span>
                <span>创建: {{ fmtTime(batch.createdAt) }}</span>
                <span v-if="batch.effectiveAt">生效: {{ fmtTime(batch.effectiveAt) }}</span>
                <span v-if="batch.withdrawnAt">撤回: {{ fmtTime(batch.withdrawnAt) }}</span>
              </div>
              <p v-if="batch.note" class="note">{{ batch.note }}</p>

              <div class="progress-row">
                <div class="bar-track">
                  <div class="bar-fill" :style="{ width: `${progressPct(batch.id)}%` }" />
                </div>
                <span>{{ progressOf(batch.id).confirmed }}/{{ progressOf(batch.id).total }} 已确认</span>
              </div>

              <div class="actions">
                <button type="button" class="secondary" @click="toggleExpand(batch)">
                  {{ expanded.has(batch.id) ? "收起明细" : "确认明细" }}
                </button>
                <button v-if="batch.status === 'dispatching'" type="button" class="danger" @click="withdraw(batch)">
                  撤回并释放
                </button>
                <span v-else-if="batch.status === 'effective'" class="frozen">已冻结，调价需新建批次</span>
                <span v-else class="frozen">已撤回，派发项全部释放</span>
              </div>

              <div v-if="expanded.has(batch.id)" class="items">
                <label class="confirmer">
                  确认人
                  <input v-model="confirmerDrafts[batch.id]" placeholder="默认取操作员" />
                </label>
                <div class="item-row item-head">
                  <span>终端</span>
                  <span>链路</span>
                  <span>确认项</span>
                  <span>确认人</span>
                  <span>确认时间</span>
                  <span>操作</span>
                </div>
                <div v-for="item in itemsOf(batch.id)" :key="item.id" class="item-row">
                  <span>{{ item.terminalLabel }}（{{ item.terminalKind === "sign" ? "价格牌" : "油枪" }}）</span>
                  <span class="pill" :class="terminalOnline(batch.stationId, item.terminalId) ? 'on' : 'off'">
                    {{ terminalOnline(batch.stationId, item.terminalId) ? "在线" : "离线" }}
                  </span>
                  <span class="pill" :class="item.status">{{ CONFIRM_STATUS_TEXT[item.status] }}</span>
                  <span>{{ item.confirmer ?? "—" }}</span>
                  <span>{{ item.confirmedAt ? fmtTime(item.confirmedAt) : "—" }}</span>
                  <span class="item-actions">
                    <button
                      v-if="item.status === 'pending' && batch.status === 'dispatching'"
                      type="button"
                      @click="report(batch, item.terminalId)"
                    >
                      模拟回报
                    </button>
                    <button type="button" class="secondary" @click="toggleOnline(batch.stationId, item.terminalId)">
                      {{ terminalOnline(batch.stationId, item.terminalId) ? "设为离线" : "恢复在线" }}
                    </button>
                  </span>
                </div>
              </div>
            </article>
          </div>
        </section>
      </section>

      <section class="list-panel history">
        <h2>挂牌价历史</h2>
        <table>
          <thead>
            <tr>
              <th>站点</th>
              <th>油品</th>
              <th>价格变化</th>
              <th>批次</th>
              <th>操作员</th>
              <th>确认人</th>
              <th>生效时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in historyRows" :key="row.id">
              <td>{{ row.stationName }}</td>
              <td>{{ row.fuel }}</td>
              <td>{{ fmtPrice(row.oldPrice) }} → {{ fmtPrice(row.price) }}</td>
              <td>{{ row.batchNo }}</td>
              <td>{{ row.operator }}</td>
              <td>{{ row.confirmers }}</td>
              <td>{{ fmtTime(row.effectiveAt) }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </main>
</template>
