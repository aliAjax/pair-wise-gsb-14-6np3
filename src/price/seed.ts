// 演示种子数据 + 初始挂牌价（存储层使用）

import { FuelType, PriceState, priceKey } from "./types";

export interface StationSeed {
  id: string;
  name: string;
  /** 油品 -> 油枪数量 */
  nozzlePlan: Partial<Record<FuelType, number[]>>;
  /** 初始挂牌价（生效历史出现后由历史推导覆盖） */
  basePrices: Partial<Record<FuelType, number>>;
}

export const STATION_SEEDS: StationSeed[] = [
  {
    id: "st-east",
    name: "城东加油站",
    nozzlePlan: {
      "92号汽油": [1, 2, 3],
      "95号汽油": [4, 5],
      "98号汽油": [6],
      柴油: [7, 8],
    },
    basePrices: { "92号汽油": 7.62, "95号汽油": 8.11, "98号汽油": 9.05, 柴油: 7.18 },
  },
  {
    id: "st-south",
    name: "城南加油站",
    nozzlePlan: {
      "92号汽油": [1, 2],
      "95号汽油": [3],
      柴油: [4, 5],
    },
    basePrices: { "92号汽油": 7.58, "95号汽油": 8.06, 柴油: 7.12 },
  },
];

/** 全量初始价映射，规则层 currentPrice 以此为基准 */
export const BASE_PRICES: Record<string, number> = Object.fromEntries(
  STATION_SEEDS.flatMap((s) =>
    (Object.entries(s.basePrices) as [FuelType, number][]).map(([fuel, price]) => [
      priceKey(s.id, fuel),
      price,
    ]),
  ),
);

export function buildSeedState(): PriceState {
  const stations = STATION_SEEDS.map((seed) => ({
    id: seed.id,
    name: seed.name,
    nozzles: Object.entries(seed.nozzlePlan).flatMap(([fuel, nos]) =>
      (nos as number[]).map((no) => ({
        id: `${seed.id}-nz-${no}`,
        kind: "nozzle" as const,
        nozzleNo: no,
        fuel: fuel as FuelType,
        online: true,
      })),
    ),
  }));

  return {
    stations,
    adjustments: [],
    batches: [],
    history: [],
    rejected: [],
    boardOnline: {},
  };
}
