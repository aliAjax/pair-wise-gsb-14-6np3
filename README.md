# 油品价格维护

- 行业：石油
- 技术栈：Vue3、Vite、TypeScript、Pinia
- 启动：`npm install && npm run dev`
- 构建：`npm run build`

价格牌下发确认闭环：每笔调价选定站点、油品、目标价并生成批次；价格牌与每把油枪各建一条确认项（同一终端同一批次只一条）。终端离线或重复回报均不生效，页面保留部分确认进度；全部终端回报后才更新挂牌价并冻结批次。撤回仅限未生效批次并释放全部派发项；已生效批次只能新建调价，旧价与确认人可在价格历史中追溯。

## 分层

- `src/domain/pricing.ts`：规则层。批次创建、确认项派发、回报校验（离线/重复/冻结）、生效冻结、撤回释放，均为纯函数，不碰存储与页面。
- `src/storage/pricingStorage.ts`：存储层。localStorage 读写与种子数据，键 `dfwlfront-9-pricing`。
- `src/stores/pricing.ts`：Pinia store，规则与存储的接线，任何变更深度监听后整体落库，刷新后批次、进度与价格历史一致。
- `src/App.vue`：页面层，只负责展示与交互。
