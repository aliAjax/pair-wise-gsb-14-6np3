// 演示引导：用规则层函数构造一份“规则上自洽”的初始状态
// （一个已冻结的历史批次 + 一个部分回报中的批次 + 一条离线拒绝记录）

import { createAdjustment, reportConfirmation, setTerminalOnline } from "./rules";
import { BASE_PRICES, buildSeedState } from "./seed";
import { Adjustment, FuelType, PriceState } from "./types";

function add(
  s: PriceState,
  payload: {
    stationId: string;
    fuel: FuelType;
    targetPrice: number;
    batchNo: string;
    mode: "new" | "existing";
    operator: string;
    notes: string;
  },
): { state: PriceState; adjustment: Adjustment } {
  const created = createAdjustment(s, payload, BASE_PRICES);
  if (!created.ok) throw new Error(created.error);
  return created.data;
}

function confirm(s: PriceState, adj: Adjustment, reports: [string, string][]): PriceState {
  let next = s;
  for (const [terminalId, confirmer] of reports) {
    const res = reportConfirmation(next, { adjustmentId: adj.id, terminalId, confirmer });
    if (!res.ok) throw new Error(res.error);
    next = res.data.state;
  }
  return next;
}

export function buildDemoState(): PriceState {
  // —— 历史批次：城东 92# 与柴油，同一批次两笔全部回报、挂牌价已更新、批次冻结 ——
  let state = buildSeedState();
  let r = add(state, {
    stationId: "st-east",
    fuel: "92号汽油",
    targetPrice: 7.69,
    batchNo: "B2026091801",
    mode: "new",
    operator: "钱站长",
    notes: "本周统一调价",
  });
  state = r.state;
  const hist92 = r.adjustment;
  r = add(state, {
    stationId: "st-east",
    fuel: "柴油",
    targetPrice: 7.22,
    batchNo: "B2026091801",
    mode: "existing",
    operator: "钱站长",
    notes: "本周统一调价",
  });
  state = r.state;
  const histDiesel = r.adjustment;

  state = confirm(state, hist92, [
    ["st-east-board-92号汽油", "王芳"],
    ["st-east-nz-1", "李强"],
    ["st-east-nz-2", "李强"],
    ["st-east-nz-3", "赵军"],
  ]);
  state = confirm(state, histDiesel, [
    ["st-east-board-柴油", "王芳"],
    ["st-east-nz-7", "赵军"],
    ["st-east-nz-8", "赵军"],
  ]);

  // —— 当前批次 B2026092002：两笔调价均只回报一部分，刷新后进度保留 ——
  r = add(state, {
    stationId: "st-east",
    fuel: "95号汽油",
    targetPrice: 8.15,
    batchNo: "B2026092002",
    mode: "new",
    operator: "钱站长",
    notes: "晚间挂牌价调整",
  });
  state = r.state;
  const east95 = r.adjustment;

  r = add(state, {
    stationId: "st-south",
    fuel: "92号汽油",
    targetPrice: 7.65,
    batchNo: "B2026092002",
    mode: "existing",
    operator: "孙经理",
    notes: "跟随城区统一价",
  });
  state = r.state;
  const south92 = r.adjustment;

  // 5 号枪离线：模拟一次离线回报被拒绝（不影响已确认进度）
  state = setTerminalOnline(state, "st-east-nz-5", false);
  const rejected = reportConfirmation(state, {
    adjustmentId: east95.id,
    terminalId: "st-east-nz-5",
    confirmer: "赵军",
  });
  state = rejected.ok ? rejected.data.state : state;

  // 价格牌与 4 号枪已确认，进度 2/3
  state = confirm(state, east95, [
    ["st-east-board-95号汽油", "王芳"],
    ["st-east-nz-4", "李强"],
  ]);

  // 城南 92# 仅价格牌确认，1/3
  state = confirm(state, south92, [["st-south-board-92号汽油", "周敏"]]);

  return state;
}
