// 价格牌下发确认闭环 —— 纯业务规则层
// 不依赖 Vue / Pinia / localStorage，所有函数对传入状态做不可变更新，便于测试与复用。

import {
  Adjustment,
  Batch,
  ConfirmItem,
  CreateAdjustmentInput,
  PriceHistoryEntry,
  PriceState,
  RejectedReport,
  ReportInput,
  RuleResult,
  Terminal,
  priceKey,
} from "./types";

let seq = 0;
function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------- 只读查询 ----------

export function getStation(state: PriceState, stationId: string) {
  return state.stations.find((s) => s.id === stationId);
}

export function getBatch(state: PriceState, batchNo: string): Batch | undefined {
  return state.batches.find((b) => b.batchNo === batchNo);
}

export function isBatchFrozen(state: PriceState, batchNo: string): boolean {
  return state.batches.some((b) => b.batchNo === batchNo && b.frozen);
}

/** 同一终端 + 同一批次，在未撤回的调价中是否已有确认项 */
function findActiveItem(
  state: PriceState,
  batchNo: string,
  terminalId: string,
  excludeAdjustmentId?: string,
): ConfirmItem | undefined {
  for (const adj of state.adjustments) {
    if (adj.status === "withdrawn" || adj.id === excludeAdjustmentId) continue;
    if (adj.batchNo !== batchNo) continue;
    const hit = adj.items.find((item) => item.terminalId === terminalId);
    if (hit) return hit;
  }
  return undefined;
}

export function stationFuels(state: PriceState, stationId: string): string[] {
  const station = getStation(state, stationId);
  if (!station) return [];
  return [...new Set(station.nozzles.map((n) => n.fuel))];
}

/** 当前挂牌价：初始价 + 价格历史中最后一次生效记录 */
export function currentPrice(
  state: PriceState,
  stationId: string,
  fuel: string,
  basePrices: Record<string, number>,
): number {
  const entries = state.history.filter((h) => h.stationId === stationId && h.fuel === fuel);
  if (entries.length > 0) return entries[entries.length - 1].newPrice;
  return basePrices[priceKey(stationId, fuel as never)] ?? 0;
}

export function progressOf(adj: Adjustment): { confirmed: number; total: number } {
  return {
    confirmed: adj.items.filter((i) => i.status === "confirmed").length,
    total: adj.items.length,
  };
}

export function batchAdjustments(state: PriceState, batchNo: string): Adjustment[] {
  return state.adjustments.filter((a) => a.batchNo === batchNo && a.status !== "withdrawn");
}

// ---------- 规则：新建调价（派发） ----------

export function createAdjustment(
  prev: PriceState,
  input: CreateAdjustmentInput,
  basePrices: Record<string, number>,
): RuleResult<{ state: PriceState; adjustment: Adjustment }> {
  const station = getStation(prev, input.stationId);
  if (!station) return { ok: false, error: "请选择站点" };
  if (!input.fuel) return { ok: false, error: "请选择油品" };
  if (!input.batchNo.trim()) return { ok: false, error: "请填写或选择批次号" };
  if (!input.operator.trim()) return { ok: false, error: "请填写调发起人" };
  if (!(input.targetPrice > 0)) return { ok: false, error: "目标价必须大于 0" };

  const batch = getBatch(prev, input.batchNo.trim());
  if (input.mode === "existing") {
    if (!batch) return { ok: false, error: "所选批次不存在" };
    if (batch.frozen) return { ok: false, error: "批次已冻结（已全部回报生效），请新建调价" };
  } else if (batch) {
    return { ok: false, error: "批次号已存在，请选择挂到该批次或换一个批次号" };
  }

  // 同站点同油品在未生效批次中只允许一笔，生效后只能新建 —— 旧价才连续可追溯
  const dupFlow = prev.adjustments.find(
    (a) =>
      a.stationId === input.stationId &&
      a.fuel === input.fuel &&
      a.status === "dispatching" &&
      !isBatchFrozen(prev, a.batchNo),
  );
  if (dupFlow) {
    return {
      ok: false,
      error: `该站点${input.fuel}在批次 ${dupFlow.batchNo} 中已有进行中的调价，请先撤回或等其生效后再新建`,
    };
  }

  const fuelNozzles = station.nozzles.filter((n) => n.fuel === input.fuel);
  if (fuelNozzles.length === 0) {
    return { ok: false, error: `${station.name}没有经营${input.fuel}的油枪，无法派发` };
  }

  // 价格牌一项 + 每把油枪各一项；同一终端同一批次只能一条
  const terminals: Terminal[] = [
    {
      id: `${station.id}-board-${input.fuel}`,
      kind: "board",
      fuel: input.fuel,
      online: true,
    },
    ...fuelNozzles,
  ];

  const items: ConfirmItem[] = [];
  for (const terminal of terminals) {
    const clash = findActiveItem(prev, input.batchNo.trim(), terminal.id);
    if (clash) {
      return {
        ok: false,
        error: `终端 ${terminal.kind === "board" ? `价格牌(${terminal.fuel})` : `${terminal.nozzleNo}号枪`} 在批次 ${input.batchNo.trim()} 中已存在确认项，不能重复派发`,
      };
    }
    items.push({
      key: `${terminal.id}__${input.batchNo.trim()}`,
      terminalId: terminal.id,
      kind: terminal.kind,
      label: terminal.kind === "board" ? "价格牌" : `${terminal.nozzleNo}号枪`,
      status: "pending",
    });
  }

  const oldPrice = currentPrice(prev, input.stationId, input.fuel, basePrices);
  if (input.targetPrice === oldPrice) {
    return { ok: false, error: "目标价与当前挂牌价一致，无需调价" };
  }

  const now = new Date().toISOString();
  const adjustment: Adjustment = {
    id: uid("adj"),
    stationId: input.stationId,
    fuel: input.fuel,
    oldPrice,
    targetPrice: Number(input.targetPrice.toFixed(2)),
    batchNo: input.batchNo.trim(),
    operator: input.operator.trim(),
    notes: input.notes.trim(),
    status: "dispatching",
    createdAt: now,
    items,
  };

  const batches =
    input.mode === "new"
      ? [...prev.batches, { batchNo: adjustment.batchNo, createdAt: now, frozen: false }]
      : prev.batches;

  return {
    ok: true,
    data: {
      state: { ...prev, adjustments: [...prev.adjustments, adjustment], batches },
      adjustment,
    },
  };
}

// ---------- 规则：终端回报确认 ----------

export function reportConfirmation(
  prev: PriceState,
  report: ReportInput,
): RuleResult<{ state: PriceState; adjustment: Adjustment }> {
  const adj = prev.adjustments.find((a) => a.id === report.adjustmentId);
  if (!adj) return { ok: false, error: "调价单不存在" };
  if (adj.status !== "dispatching") {
    return { ok: false, error: `调价单当前为「${statusLabel(adj.status)}」，不再接收回报` };
  }
  if (isBatchFrozen(prev, adj.batchNo)) {
    return { ok: false, error: "批次已冻结，回报不再生效" };
  }
  const item = adj.items.find((i) => i.terminalId === report.terminalId);
  if (!item) return { ok: false, error: "该终端不在本笔调价的派发清单中" };

  const station = getStation(prev, adj.stationId);
  const terminal =
    station?.nozzles.find((n) => n.id === report.terminalId) ??
    (item.kind === "board"
      ? ({
          id: report.terminalId,
          kind: "board" as const,
          fuel: adj.fuel,
          online: prev.boardOnline[report.terminalId] ?? true,
        } satisfies Terminal)
      : undefined);

  const reject = (reason: string): PriceState => ({
    ...prev,
    rejected: [
      ...prev.rejected,
      {
        id: uid("rej"),
        batchNo: adj.batchNo,
        stationId: adj.stationId,
        fuel: adj.fuel,
        terminalId: report.terminalId,
        terminalLabel: item.label,
        reason,
        at: new Date().toISOString(),
      },
    ],
  });

  // 终端离线：回报不得生效（进度保留不变）
  if (terminal && !terminal.online) {
    return { ok: true, data: { state: reject("终端离线，回报已拒绝"), adjustment: adj } };
  }
  // 重复回报：不得生效
  if (item.status === "confirmed") {
    return {
      ok: true,
      data: { state: reject("重复回报，该终端已确认过"), adjustment: adj },
    };
  }
  if (!report.confirmer.trim()) {
    return { ok: true, data: { state: reject("回报缺少确认人"), adjustment: adj } };
  }

  const now = new Date().toISOString();
  const newItems = adj.items.map((i) =>
    i.terminalId === report.terminalId
      ? { ...i, status: "confirmed" as const, confirmer: report.confirmer.trim(), confirmedAt: now }
      : i,
  );

  let adjustments = prev.adjustments.map((a) => (a.id === adj.id ? { ...a, items: newItems } : a));
  let history = prev.history;
  let batches = prev.batches;

  const updated = adjustments.find((a) => a.id === adj.id)!;
  const allDone = updated.items.every((i) => i.status === "confirmed");

  // 全部回报后才更新挂牌价并冻结批次
  if (allDone) {
    updated.status = "effective";
    updated.effectiveAt = now;
    const entry: PriceHistoryEntry = {
      id: uid("his"),
      stationId: adj.stationId,
      fuel: adj.fuel,
      oldPrice: adj.oldPrice,
      newPrice: adj.targetPrice,
      batchNo: adj.batchNo,
      operator: adj.operator,
      confirmers: newItems.map((i) => `${i.label}:${i.confirmer ?? "未知"}`),
      effectiveAt: now,
      adjustmentId: adj.id,
    };
    history = [...history, entry];

    const stillDispatching = adjustments.some(
      (a) => a.batchNo === adj.batchNo && a.status === "dispatching",
    );
    if (!stillDispatching) {
      batches = batches.map((b) =>
        b.batchNo === adj.batchNo ? { ...b, frozen: true, frozenAt: now } : b,
      );
    }
  }

  return { ok: true, data: { state: { ...prev, adjustments, history, batches }, adjustment: updated } };
}

// ---------- 规则：撤回（仅限未生效，且释放全部派发项） ----------

export function withdrawAdjustment(
  prev: PriceState,
  adjustmentId: string,
  reason: string,
): RuleResult<{ state: PriceState }> {
  const adj = prev.adjustments.find((a) => a.id === adjustmentId);
  if (!adj) return { ok: false, error: "调价单不存在" };
  if (adj.status === "effective") {
    return { ok: false, error: "已生效的调价不能撤回，只能新建一笔调价" };
  }
  if (adj.status === "withdrawn") return { ok: false, error: "该调价已撤回" };
  if (isBatchFrozen(prev, adj.batchNo)) return { ok: false, error: "批次已冻结，不能撤回" };

  // 释放全部派发项：调价整体置为 withdrawn，其确认项对“同终端同批次唯一”约束不再占位
  const now = new Date().toISOString();
  const adjustments = prev.adjustments.map((a) =>
    a.id === adjustmentId
      ? {
          ...a,
          status: "withdrawn" as const,
          withdrawnAt: now,
          withdrawReason: reason.trim() || "未填写撤回原因",
        }
      : a,
  );
  return { ok: true, data: { state: { ...prev, adjustments } } };
}

// ---------- 规则：终端上下线（模拟现场离线场景） ----------

export function setTerminalOnline(
  prev: PriceState,
  terminalId: string,
  online: boolean,
): PriceState {
  const isNozzle = prev.stations.some((s) => s.nozzles.some((n) => n.id === terminalId));
  if (!isNozzle) {
    return { ...prev, boardOnline: { ...prev.boardOnline, [terminalId]: online } };
  }
  return {
    ...prev,
    stations: prev.stations.map((station) => ({
      ...station,
      nozzles: station.nozzles.map((n) => (n.id === terminalId ? { ...n, online } : n)),
    })),
  };
}

// ---------- 辅助 ----------

export function isTerminalOnline(state: PriceState, terminalId: string): boolean {
  const nozzle = state.stations.flatMap((s) => s.nozzles).find((n) => n.id === terminalId);
  if (nozzle) return nozzle.online;
  return state.boardOnline[terminalId] ?? true;
}

export function statusLabel(status: Adjustment["status"]): string {
  return status === "dispatching" ? "下发中" : status === "effective" ? "已生效" : "已撤回";
}
