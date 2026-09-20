// 价格牌下发确认闭环的领域规则。
// 本层只依赖传入的 PricingState，不碰 localStorage，也不依赖页面组件。

export type TerminalKind = "sign" | "gun";
export type BatchStatus = "dispatching" | "effective" | "withdrawn";
export type ConfirmStatus = "pending" | "confirmed" | "released";

export const FUELS = ["92号汽油", "95号汽油", "98号汽油", "柴油"] as const;

export const BATCH_STATUS_TEXT: Record<BatchStatus, string> = {
  dispatching: "下发中",
  effective: "已生效",
  withdrawn: "已撤回"
};

export const CONFIRM_STATUS_TEXT: Record<ConfirmStatus, string> = {
  pending: "待回报",
  confirmed: "已确认",
  released: "已释放"
};

export interface Terminal {
  id: string;
  kind: TerminalKind;
  label: string;
  online: boolean;
}

export interface Station {
  id: string;
  name: string;
  terminals: Terminal[];
}

export interface PriceBatch {
  id: string;
  batchNo: string;
  stationId: string;
  fuel: string;
  targetPrice: number;
  oldPrice: number | null;
  operator: string;
  note: string;
  status: BatchStatus;
  createdAt: string;
  effectiveAt: string | null;
  withdrawnAt: string | null;
}

export interface ConfirmItem {
  id: string;
  batchId: string;
  terminalId: string;
  terminalKind: TerminalKind;
  terminalLabel: string;
  status: ConfirmStatus;
  confirmer: string | null;
  confirmedAt: string | null;
}

export interface PriceHistoryEntry {
  id: string;
  stationId: string;
  fuel: string;
  oldPrice: number | null;
  price: number;
  batchId: string;
  batchNo: string;
  operator: string;
  effectiveAt: string;
}

export interface PricingState {
  stations: Station[];
  batches: PriceBatch[];
  items: ConfirmItem[];
  history: PriceHistoryEntry[];
  batchSeq: number;
}

export interface CreateBatchInput {
  stationId: string;
  fuel: string;
  targetPrice: number;
  operator: string;
  note?: string;
}

export interface ReportInput {
  batchId: string;
  terminalId: string;
  confirmer: string;
}

export interface RuleResult<T = unknown> {
  ok: boolean;
  message: string;
  data?: T;
}

function ok<T>(message: string, data?: T): RuleResult<T> {
  return { ok: true, message, data };
}

function fail(message: string): RuleResult<never> {
  return { ok: false, message };
}

export function nextBatchNo(seq: number, now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `PC${y}${m}${d}-${String(seq + 1).padStart(3, "0")}`;
}

export function findStation(state: PricingState, stationId: string): Station | undefined {
  return state.stations.find((station) => station.id === stationId);
}

export function itemsOfBatch(state: PricingState, batchId: string): ConfirmItem[] {
  return state.items.filter((item) => item.batchId === batchId);
}

export function batchProgress(state: PricingState, batchId: string): { total: number; confirmed: number } {
  const items = itemsOfBatch(state, batchId);
  return { total: items.length, confirmed: items.filter((item) => item.status === "confirmed").length };
}

export function currentPrice(state: PricingState, stationId: string, fuel: string): number | null {
  const entries = state.history.filter((entry) => entry.stationId === stationId && entry.fuel === fuel);
  return entries.length ? entries[entries.length - 1].price : null;
}

export function confirmersOfBatch(
  state: PricingState,
  batchId: string
): { terminalLabel: string; confirmer: string; confirmedAt: string }[] {
  return itemsOfBatch(state, batchId)
    .filter((item) => item.status === "confirmed" && item.confirmer && item.confirmedAt)
    .map((item) => ({
      terminalLabel: item.terminalLabel,
      confirmer: item.confirmer as string,
      confirmedAt: item.confirmedAt as string
    }));
}

// 创建调价批次：选站点、油品、目标价，生成批次号并下发确认项。
// 价格牌与每把油枪各建一条；同一终端同一批次只建一条。
export function createBatch(state: PricingState, input: CreateBatchInput): RuleResult<PriceBatch> {
  const station = findStation(state, input.stationId);
  if (!station) return fail("站点不存在，无法下发");
  if (!(FUELS as readonly string[]).includes(input.fuel)) return fail("请选择油品");
  const price = Math.round(Number(input.targetPrice) * 100) / 100;
  if (!Number.isFinite(price) || price <= 0) return fail("目标价必须大于 0");
  const operator = input.operator.trim();
  if (!operator) return fail("请填写操作员");

  const batch: PriceBatch = {
    id: crypto.randomUUID(),
    batchNo: nextBatchNo(state.batchSeq),
    stationId: station.id,
    fuel: input.fuel,
    targetPrice: price,
    oldPrice: currentPrice(state, station.id, input.fuel),
    operator,
    note: (input.note ?? "").trim(),
    status: "dispatching",
    createdAt: new Date().toISOString(),
    effectiveAt: null,
    withdrawnAt: null
  };
  state.batchSeq += 1;
  state.batches.unshift(batch);

  const dispatched = new Set<string>();
  for (const terminal of station.terminals) {
    if (dispatched.has(terminal.id)) continue;
    dispatched.add(terminal.id);
    state.items.push({
      id: crypto.randomUUID(),
      batchId: batch.id,
      terminalId: terminal.id,
      terminalKind: terminal.kind,
      terminalLabel: terminal.label,
      status: "pending",
      confirmer: null,
      confirmedAt: null
    });
  }
  return ok(`批次 ${batch.batchNo} 已创建，向价格牌与油枪共 ${dispatched.size} 个终端下发确认项`, batch);
}

// 终端回报确认。终端离线、批次已冻结/已撤回、重复回报一律不生效；
// 全部回报后才更新挂牌价（写价格历史）并冻结批次。
export function reportConfirmation(state: PricingState, input: ReportInput): RuleResult<ConfirmItem> {
  const batch = state.batches.find((entry) => entry.id === input.batchId);
  if (!batch) return fail("批次不存在");
  if (batch.status === "effective") return fail("批次已生效并冻结，回报不再生效");
  if (batch.status === "withdrawn") return fail("批次已撤回，回报不再生效");

  const station = findStation(state, batch.stationId);
  const terminal = station?.terminals.find((entry) => entry.id === input.terminalId);
  if (!terminal) return fail("终端不存在");
  if (!terminal.online) return fail(`终端「${terminal.label}」离线，回报不生效`);

  const item = state.items.find((entry) => entry.batchId === batch.id && entry.terminalId === terminal.id);
  if (!item) return fail("该终端不在本批次派发范围内");
  if (item.status === "confirmed") return fail(`终端「${terminal.label}」已回报，重复回报不生效`);
  if (item.status === "released") return fail("派发项已释放，回报不生效");

  const confirmer = input.confirmer.trim();
  if (!confirmer) return fail("请填写确认人");

  item.status = "confirmed";
  item.confirmer = confirmer;
  item.confirmedAt = new Date().toISOString();

  const items = itemsOfBatch(state, batch.id);
  const confirmed = items.filter((entry) => entry.status === "confirmed").length;
  if (confirmed === items.length) {
    batch.status = "effective";
    batch.effectiveAt = new Date().toISOString();
    state.history.push({
      id: crypto.randomUUID(),
      stationId: batch.stationId,
      fuel: batch.fuel,
      oldPrice: batch.oldPrice,
      price: batch.targetPrice,
      batchId: batch.id,
      batchNo: batch.batchNo,
      operator: batch.operator,
      effectiveAt: batch.effectiveAt
    });
    return ok(`全部 ${items.length} 个终端已回报，批次 ${batch.batchNo} 生效并冻结`, item);
  }
  return ok(`「${terminal.label}」已确认（${confirmed}/${items.length}），等待其余终端回报`, item);
}

// 撤回仅限未生效批次，并释放全部派发项；已生效只能新建调价。
export function withdrawBatch(state: PricingState, batchId: string): RuleResult<PriceBatch> {
  const batch = state.batches.find((entry) => entry.id === batchId);
  if (!batch) return fail("批次不存在");
  if (batch.status === "effective") return fail("批次已生效，不能撤回，只能新建调价");
  if (batch.status === "withdrawn") return fail("批次已撤回，请勿重复操作");

  batch.status = "withdrawn";
  batch.withdrawnAt = new Date().toISOString();
  let released = 0;
  for (const item of itemsOfBatch(state, batch.id)) {
    if (item.status !== "released") {
      item.status = "released";
      released += 1;
    }
  }
  return ok(`批次 ${batch.batchNo} 已撤回，释放 ${released} 条派发项`, batch);
}

// 模拟终端链路状态（离线终端的回报将被规则层拒绝）。
export function setTerminalOnline(state: PricingState, stationId: string, terminalId: string, online: boolean): void {
  const terminal = findStation(state, stationId)?.terminals.find((entry) => entry.id === terminalId);
  if (terminal) terminal.online = online;
}
