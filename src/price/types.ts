// 价格牌下发确认闭环 —— 领域类型定义（规则层）

export type FuelType = "92号汽油" | "95号汽油" | "98号汽油" | "柴油";

export const FUEL_TYPES: readonly FuelType[] = ["92号汽油", "95号汽油", "98号汽油", "柴油"];

/** 终端种类：价格牌 或 油枪 */
export type TerminalKind = "board" | "nozzle";

export interface Terminal {
  /** 终端唯一标识，同一终端同一批次只能有一条确认项 */
  id: string;
  kind: TerminalKind;
  /** 油枪编号，如 1 号枪；价格牌为空 */
  nozzleNo?: number;
  fuel: FuelType;
  online: boolean;
}

export interface Station {
  id: string;
  name: string;
  /** 油枪清单，决定每笔调价要生成哪些确认项 */
  nozzles: Terminal[];
}

/** 单个确认项：价格牌一把、每把同油品油枪各一把 */
export interface ConfirmItem {
  /** 终端ID + 批次唯一（规则保证），同时便于离线/重复回报幂等判断 */
  key: string;
  terminalId: string;
  kind: TerminalKind;
  label: string;
  status: "pending" | "confirmed";
  confirmer?: string;
  confirmedAt?: string;
}

export type AdjustStatus = "dispatching" | "effective" | "withdrawn";

/** 一笔调价（一个站点 + 一种油品 + 一个批次） */
export interface Adjustment {
  id: string;
  stationId: string;
  fuel: FuelType;
  /** 创建时的旧挂牌价，生效后仍保留用于追溯 */
  oldPrice: number;
  targetPrice: number;
  batchNo: string;
  operator: string;
  notes: string;
  status: AdjustStatus;
  createdAt: string;
  items: ConfirmItem[];
  effectiveAt?: string;
  withdrawnAt?: string;
  withdrawReason?: string;
}

export interface Batch {
  batchNo: string;
  createdAt: string;
  frozen: boolean;
  frozenAt?: string;
}

/** 生效后的价格历史，挂牌价表也由此推导 */
export interface PriceHistoryEntry {
  id: string;
  stationId: string;
  fuel: FuelType;
  oldPrice: number;
  newPrice: number;
  batchNo: string;
  operator: string;
  /** 确认人清单（价格牌 + 每把油枪） */
  confirmers: string[];
  effectiveAt: string;
  adjustmentId: string;
}

/** 被规则拒绝的回报尝试，便于现场排查“为什么没生效” */
export interface RejectedReport {
  id: string;
  batchNo: string;
  stationId: string;
  fuel: FuelType;
  terminalId: string;
  terminalLabel: string;
  reason: string;
  at: string;
}

/** 持久化的完整状态 */
export interface PriceState {
  stations: Station[];
  adjustments: Adjustment[];
  batches: Batch[];
  history: PriceHistoryEntry[];
  rejected: RejectedReport[];
  /** 价格牌终端在线状态（油枪在线状态挂在 Terminal 上；缺省视为在线） */
  boardOnline: Record<string, boolean>;
}

export interface CreateAdjustmentInput {
  stationId: string;
  fuel: FuelType;
  targetPrice: number;
  batchNo: string;
  operator: string;
  notes: string;
  /** 新建批次，还是挂到已有未冻结批次 */
  mode: "new" | "existing";
}

export interface ReportInput {
  adjustmentId: string;
  terminalId: string;
  confirmer: string;
}

export type RuleResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string };

export function priceKey(stationId: string, fuel: FuelType): string {
  return `${stationId}__${fuel}`;
}
