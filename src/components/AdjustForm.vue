<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { usePriceStore } from "../price/store";
import { currentPrice } from "../price/rules";
import { FUEL_TYPES, FuelType } from "../price/types";

const store = usePriceStore();

const stationId = ref("");
const fuel = ref<FuelType | "">("");
const targetPrice = ref<number | null>(null);
const operator = ref("");
const notes = ref("");
const mode = ref<"new" | "existing">("new");
const newBatchNo = ref(suggestBatchNo());
const existingBatchNo = ref("");

function suggestBatchNo(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const seq = store ? store.batches.filter((b) => b.batchNo.includes(day)).length + 1 : 1;
  return `B${day}${String(seq).padStart(2, "0")}`;
}

const openBatches = computed(() => store.batches.filter((b) => !b.frozen));

const stationFuels = computed(() => {
  const station = store.stations.find((s) => s.id === stationId.value);
  if (!station) return [];
  return [...new Set(station.nozzles.map((n) => n.fuel))];
});

const current = computed(() => {
  if (!stationId.value || !fuel.value) return undefined;
  return currentPrice(store.state, stationId.value, fuel.value, store.basePrices);
});

const nozzleCount = computed(() => {
  const station = store.stations.find((s) => s.id === stationId.value);
  if (!station || !fuel.value) return 0;
  return station.nozzles.filter((n) => n.fuel === fuel.value).length;
});

watch(stationId, () => {
  if (fuel.value && !stationFuels.value.includes(fuel.value)) fuel.value = "";
});

function submit() {
  if (!stationId.value || !fuel.value || targetPrice.value == null) return;
  const ok = store.create({
    stationId: stationId.value,
    fuel: fuel.value,
    targetPrice: Number(targetPrice.value),
    batchNo: mode.value === "new" ? newBatchNo.value.trim() : existingBatchNo.value,
    operator: operator.value,
    notes: notes.value,
    mode: mode.value,
  });
  if (ok) resetForm();
}

function resetForm() {
  targetPrice.value = null;
  operator.value = "";
  notes.value = "";
  mode.value = "new";
  newBatchNo.value = suggestBatchNo();
  existingBatchNo.value = "";
}
</script>

<template>
  <form class="panel" @submit.prevent="submit">
    <h2>新建调价派发</h2>
    <div class="form-grid">
      <label>
        站点
        <select v-model="stationId" required>
          <option value="">请选择站点</option>
          <option v-for="s in store.stations" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </label>

      <label>
        油品
        <select v-model="fuel" required :disabled="!stationId">
          <option value="">请选择油品</option>
          <option v-for="f in stationFuels.length ? stationFuels : FUEL_TYPES" :key="f" :value="f">
            {{ f }}
          </option>
        </select>
      </label>

      <div v-if="current !== undefined" class="price-hint">
        <span>当前挂牌价</span>
        <strong>¥{{ current.toFixed(2) }}</strong>
        <span class="muted">· 将生成 1 个价格牌 + {{ nozzleCount }} 把油枪确认项</span>
      </div>

      <label>
        目标挂牌价（元/升）
        <input
          v-model.number="targetPrice"
          type="number"
          min="0.01"
          step="0.01"
          placeholder="如 7.85"
          required
        />
      </label>

      <fieldset class="batch-field">
        <legend>批次</legend>
        <div class="mode-switch">
          <label class="inline">
            <input type="radio" value="new" v-model="mode" /> 新建批次
          </label>
          <label class="inline">
            <input type="radio" value="existing" v-model="mode" :disabled="openBatches.length === 0" />
            挂到未冻结批次
          </label>
        </div>
        <input v-if="mode === 'new'" v-model="newBatchNo" type="text" placeholder="批次号" required />
        <select v-else v-model="existingBatchNo" required>
          <option value="">请选择批次</option>
          <option v-for="b in openBatches" :key="b.batchNo" :value="b.batchNo">
            {{ b.batchNo }}（{{ b.createdAt.slice(0, 10) }}）
          </option>
        </select>
        <p v-if="mode === 'existing' && openBatches.length === 0" class="form-warn">
          没有未冻结批次，将自动新建
        </p>
      </fieldset>

      <label>
        调发起人
        <input v-model="operator" type="text" placeholder="姓名" required />
      </label>

      <label>
        调价说明
        <textarea v-model="notes" placeholder="填写调价原因、依据等" />
      </label>

      <button type="submit">派发价格牌确认</button>
      <p class="form-rule">
        同一终端同一批次只能一条确认项；重复派发会被拦截。已生效的批次自动冻结，再次调价请新建批次。
      </p>
    </div>
  </form>
</template>
