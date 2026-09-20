// 存储层：只管 PriceState 的持久化与读取，不包含任何业务判断
// 刷新后批次、确认进度、价格历史与终端在线状态全部从 localStorage 恢复。

import { buildDemoState } from "./demo";
import { PriceState } from "./types";

const STORAGE_KEY = "dfwlfront-9-price-board-loop";
const STORAGE_VERSION = 1;

interface PersistShape {
  version: number;
  state: PriceState;
}

export function loadState(): PriceState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const demo = buildDemoState();
    saveState(demo);
    return demo;
  }
  try {
    const parsed = JSON.parse(raw) as PersistShape;
    if (parsed.version !== STORAGE_VERSION || !parsed.state) {
      const demo = buildDemoState();
      saveState(demo);
      return demo;
    }
    return normalize(parsed.state);
  } catch {
    return buildDemoState();
  }
}

export function saveState(state: PriceState): void {
  const payload: PersistShape = { version: STORAGE_VERSION, state };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function resetState(): PriceState {
  const demo = buildDemoState();
  saveState(demo);
  return demo;
}

export function clearState(): PriceState {
  const empty: PriceState = {
    stations: loadState().stations,
    adjustments: [],
    batches: [],
    history: [],
    rejected: [],
    boardOnline: {},
  };
  saveState(empty);
  return empty;
}

/** 容错：旧数据缺字段时补齐，避免页面读取崩溃 */
function normalize(state: PriceState): PriceState {
  return {
    stations: state.stations ?? [],
    adjustments: state.adjustments ?? [],
    batches: state.batches ?? [],
    history: state.history ?? [],
    rejected: state.rejected ?? [],
    boardOnline: state.boardOnline ?? {},
  };
}
