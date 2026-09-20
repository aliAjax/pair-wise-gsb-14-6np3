// Pinia store：规则层与存储层之间的接线，页面只调这里。
import { defineStore } from "pinia";
import { ref, watch } from "vue";
import {
  createBatch,
  reportConfirmation,
  setTerminalOnline,
  withdrawBatch,
  type CreateBatchInput,
  type PricingState,
  type ReportInput
} from "../domain/pricing";
import { loadPricingState, savePricingState } from "../storage/pricingStorage";

export const usePricingStore = defineStore("pricing", () => {
  const state = ref<PricingState>(loadPricingState());

  // 任何规则引起的变更都整体落库，刷新后批次、进度与价格历史保持一致
  watch(state, (value) => savePricingState(value), { deep: true });

  function create(input: CreateBatchInput) {
    return createBatch(state.value, input);
  }

  function report(input: ReportInput) {
    return reportConfirmation(state.value, input);
  }

  function withdraw(batchId: string) {
    return withdrawBatch(state.value, batchId);
  }

  function setOnline(stationId: string, terminalId: string, online: boolean) {
    setTerminalOnline(state.value, stationId, terminalId, online);
  }

  return { state, create, report, withdraw, setOnline };
});
