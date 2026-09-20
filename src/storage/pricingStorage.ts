// 存储层：负责 PricingState 的落库与读取，不含任何业务规则。
import { FUELS, type PriceHistoryEntry, type PricingState, type Station } from "../domain/pricing";

export const STORAGE_KEY = "dfwlfront-9-pricing";

const BASE_PRICES: Record<string, number> = {
  "92号汽油": 7.62,
  "95号汽油": 8.1,
  "98号汽油": 8.95,
  "柴油": 7.18
};

function seedStations(): Station[] {
  return [
    {
      id: "ST-01",
      name: "城东旗舰店",
      terminals: [
        { id: "ST-01-SIGN", kind: "sign", label: "价格牌", online: true },
        { id: "ST-01-G1", kind: "gun", label: "1号油枪", online: true },
        { id: "ST-01-G2", kind: "gun", label: "2号油枪", online: true },
        { id: "ST-01-G3", kind: "gun", label: "3号油枪", online: true },
        { id: "ST-01-G4", kind: "gun", label: "4号油枪", online: true }
      ]
    },
    {
      id: "ST-02",
      name: "城西快保站",
      terminals: [
        { id: "ST-02-SIGN", kind: "sign", label: "价格牌", online: true },
        { id: "ST-02-G1", kind: "gun", label: "1号油枪", online: true },
        { id: "ST-02-G2", kind: "gun", label: "2号油枪", online: true },
        { id: "ST-02-G3", kind: "gun", label: "3号油枪", online: false }
      ]
    }
  ];
}

export function seedState(): PricingState {
  const stations = seedStations();
  const now = new Date().toISOString();
  const history: PriceHistoryEntry[] = stations.flatMap((station) =>
    FUELS.map((fuel) => ({
      id: crypto.randomUUID(),
      stationId: station.id,
      fuel,
      oldPrice: null,
      price: BASE_PRICES[fuel],
      batchId: "INIT",
      batchNo: "INIT",
      operator: "系统初始化",
      effectiveAt: now
    }))
  );
  return { stations, batches: [], items: [], history, batchSeq: 0 };
}

export function loadPricingState(): PricingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw) as Partial<PricingState> | null;
    if (
      !parsed ||
      !Array.isArray(parsed.stations) ||
      !Array.isArray(parsed.batches) ||
      !Array.isArray(parsed.items) ||
      !Array.isArray(parsed.history) ||
      typeof parsed.batchSeq !== "number"
    ) {
      return seedState();
    }
    return parsed as PricingState;
  } catch {
    return seedState();
  }
}

export function savePricingState(state: PricingState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
