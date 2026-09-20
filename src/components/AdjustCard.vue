<script setup lang="ts">
import { computed, reactive } from "vue";
import { usePriceStore } from "../price/store";
import { progressOf, statusLabel } from "../price/rules";
import { Adjustment } from "../price/types";

const props = defineProps<{ adjustment: Adjustment }>();
const store = usePriceStore();

const progress = computed(() => progressOf(props.adjustment));
const percent = computed(() =>
  progress.value.total === 0
    ? 0
    : Math.round((progress.value.confirmed / progress.value.total) * 100),
);

const confirmers = reactive<Record<string, string>>(
  Object.fromEntries(props.adjustment.items.map((i) => [i.terminalId, i.confirmer ?? ""])),
);
const withdrawReason = reactive({ value: "" });

const stationName = computed(() => store.stationName(props.adjustment.stationId));
const frozen = computed(() =>
  store.batches.some((b) => b.batchNo === props.adjustment.batchNo && b.frozen),
);
const isDispatching = computed(() => props.adjustment.status === "dispatching");

function report(terminalId: string) {
  store.report({
    adjustmentId: props.adjustment.id,
    terminalId,
    confirmer: confirmers[terminalId] ?? "",
  });
}

function toggleOnline(terminalId: string, event: Event) {
  const online = (event.target as HTMLInputElement).checked;
  store.toggleTerminal(terminalId, online);
}

function withdraw() {
  const reason = withdrawReason.value.trim();
  if (!reason) {
    store.pushToast("error", "请填写撤回原因");
    return;
  }
  store.withdraw(props.adjustment.id, reason);
  withdrawReason.value = "";
}

function formatTime(iso?: string) {
  return iso ? new Date(iso).toLocaleString("zh-CN", { hour12: false }) : "";
}
</script>

<template>
  <article class="adjust" :class="`adjust-${adjustment.status}`">
    <div class="record-head">
      <div>
        <p class="record-title">
          {{ stationName }} · {{ adjustment.fuel }}
          <span class="price-arrow">¥{{ adjustment.oldPrice.toFixed(2) }} → ¥{{ adjustment.targetPrice.toFixed(2) }}</span>
        </p>
        <p class="meta-line">
          调发起人 {{ adjustment.operator }} · {{ formatTime(adjustment.createdAt) }}
          <template v-if="adjustment.notes"> · {{ adjustment.notes }}</template>
        </p>
      </div>
      <span class="status" :class="`st-${adjustment.status}`">{{ statusLabel(adjustment.status) }}</span>
    </div>

    <!-- 确认进度：离线/重复回报不改变它，刷新后仍然保留 -->
    <div class="progress-row">
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: `${percent}%` }" />
      </div>
      <strong>{{ progress.confirmed }}/{{ progress.total }}</strong>
    </div>

    <div class="terminal-list">
      <div v-for="item in adjustment.items" :key="item.key" class="terminal-row">
        <div class="terminal-id">
          <span class="kind-dot" :class="item.kind" :title="item.kind === 'board' ? '价格牌' : '油枪'" />
          <span :class="{ 'is-confirmed': item.status === 'confirmed' }">{{ item.label }}</span>
          <label class="online-toggle" :title="frozen ? '批次已冻结' : '模拟终端在线/离线'">
            <input
              type="checkbox"
              :checked="store.isOnline(item.terminalId)"
              :disabled="frozen"
              @change="toggleOnline(item.terminalId, $event)"
            />
            <span :class="store.isOnline(item.terminalId) ? 'on' : 'off'">
              {{ store.isOnline(item.terminalId) ? "在线" : "离线" }}
            </span>
          </label>
        </div>

        <div v-if="item.status === 'confirmed'" class="confirmed-box">
          <span class="confirmed-text">
            ✓ {{ item.confirmer }} 于 {{ formatTime(item.confirmedAt) }} 确认
          </span>
          <button
            class="mini secondary"
            type="button"
            :disabled="frozen"
            @click="report(item.terminalId)"
          >
            模拟重复回报
          </button>
        </div>

        <div v-else class="report-box">
          <input
            v-model="confirmers[item.terminalId]"
            class="mini-input"
            type="text"
            placeholder="确认人姓名"
            :disabled="frozen"
          />
          <button
            class="mini"
            type="button"
            :disabled="frozen"
            @click="report(item.terminalId)"
          >
            模拟终端回报
          </button>
          <span v-if="!store.isOnline(item.terminalId)" class="offline-warn">离线回报将被拒绝</span>
        </div>
      </div>
    </div>

    <div v-if="adjustment.status === 'effective'" class="effective-box">
      挂牌价已于 {{ formatTime(adjustment.effectiveAt) }} 更新为
      <strong>¥{{ adjustment.targetPrice.toFixed(2) }}</strong>；如需再次调整请新建调价，本记录永久可追溯。
    </div>

    <div v-else-if="adjustment.status === 'withdrawn'" class="withdrawn-box">
      已于 {{ formatTime(adjustment.withdrawnAt) }} 撤回：{{ adjustment.withdrawReason }}；全部派发项已释放。
    </div>

    <div v-else class="withdraw-row">
      <input
        v-model="withdrawReason.value"
        type="text"
        placeholder="撤回原因（仅限未生效；撤回后释放全部派发项）"
      />
      <button class="danger mini" type="button" @click="withdraw">撤回本笔调价</button>
    </div>
  </article>
</template>
