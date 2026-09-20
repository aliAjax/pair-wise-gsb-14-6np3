// 状态层：页面只通过该 store 操作；所有业务判断委托规则层，每次变更后由存储层落盘。

import { defineStore } from "pinia";
import {
  createAdjustment,
  reportConfirmation,
  setTerminalOnline,
  withdrawAdjustment,
} from "./rules";
import { clearState, loadState, resetState, saveState } from "./storage";
import { BASE_PRICES } from "./seed";
import { CreateAdjustmentInput, PriceState, ReportInput } from "./types";

interface Toast {
  id: number;
  type: "success" | "error" | "info";
  text: string;
}

export const usePriceStore = defineStore("price-board", {
  state: () => ({
    state: loadState() as PriceState,
    toasts: [] as Toast[],
    toastSeq: 0,
  }),

  getters: {
    basePrices: () => BASE_PRICES,
    stations: (s) => s.state.stations,
    adjustments: (s) => s.state.adjustments,
    batches: (s) => s.state.batches,
    history: (s) => s.state.history,
    rejected: (s) => s.state.rejected,
  },

  actions: {
    persist() {
      saveState(this.state);
    },
    pushToast(type: Toast["type"], text: string) {
      const id = ++this.toastSeq;
      this.toasts.push({ id, type, text });
      window.setTimeout(() => {
        this.toasts = this.toasts.filter((t) => t.id !== id);
      }, 3200);
    },
    stationName(id: string): string {
      return this.state.stations.find((s) => s.id === id)?.name ?? id;
    },
    isOnline(terminalId: string): boolean {
      const nozzle = this.state.stations.flatMap((s) => s.nozzles).find((n) => n.id === terminalId);
      if (nozzle) return nozzle.online;
      return this.state.boardOnline[terminalId] ?? true;
    },

    create(input: CreateAdjustmentInput) {
      const result = createAdjustment(this.state, input, BASE_PRICES);
      if (!result.ok) {
        this.pushToast("error", result.error);
        return false;
      }
      this.state = result.data.state;
      this.persist();
      this.pushToast("success", `已派发到批次 ${input.batchNo.trim()}，等待终端回报`);
      return true;
    },

    report(input: ReportInput) {
      const before = this.state.rejected.length;
      const result = reportConfirmation(this.state, input);
      if (!result.ok) {
        this.pushToast("error", result.error);
        return;
      }
      this.state = result.data.state;
      this.persist();
      if (this.state.rejected.length > before) {
        const latest = this.state.rejected[this.state.rejected.length - 1];
        this.pushToast("error", `${latest.terminalLabel}回报未生效：${latest.reason}`);
        return;
      }
      const adj = result.data.adjustment;
      if (adj.status === "effective") {
        this.pushToast("success", `全部终端已确认，挂牌价更新为 ${adj.targetPrice}，批次已冻结`);
      } else {
        this.pushToast("success", "回报已确认，部分进度已保存");
      }
    },

    withdraw(adjustmentId: string, reason: string) {
      const result = withdrawAdjustment(this.state, adjustmentId, reason);
      if (!result.ok) {
        this.pushToast("error", result.error);
        return;
      }
      this.state = result.data.state;
      this.persist();
      this.pushToast("info", "已撤回，全部派发项已释放");
    },

    toggleTerminal(terminalId: string, online: boolean) {
      this.state = setTerminalOnline(this.state, terminalId, online);
      this.persist();
    },

    resetDemo() {
      this.state = resetState();
      this.pushToast("info", "已恢复演示数据");
    },

    clearAll() {
      this.state = clearState();
      this.pushToast("info", "已清空调价与历史（站点油枪保留）");
    },
  },
});
