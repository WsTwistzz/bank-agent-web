/**
 * 静态演示数据。
 *
 * GitHub Pages 等纯静态部署没有后端（Mock Bank / Agent 桥接），
 * 构建时置 `VITE_DEMO_MODE=true` 即可直接用这份快照渲染完整界面。
 * 数据与 `src/app/features/featureData.ts` 中的演示快照同源。
 */
import type { BankSnapshot } from "./useBankData";

export const demoSnapshot: BankSnapshot = {
  account: { id: "A1001", name: "张三", balance: "12000.00", status: "active" },
  cards: [
    { id: "6222088888668821", account_id: "A1001", card_type: "debit", status: "active", limit: "5000.00" },
    { id: "6222088888113906", account_id: "A1002", card_type: "debit", status: "active", limit: "3000.00" },
  ],
  payees: [
    { id: "demo_pye_1", owner_user_id: "U1", name: "王五", phone: "13800138005", account_id: "A2001", alias: "朋友" },
    { id: "demo_pye_2", owner_user_id: "U1", name: "赵六", phone: "13800138006", account_id: "A2002", alias: "同事" },
    { id: "demo_pye_3", owner_user_id: "U1", name: "李四", phone: "13800138004", account_id: "A2003", alias: "家人" },
  ],
  debits: [
    { id: "sub_video", account_id: "A1001", merchant: "云映视频", status: "active", amount: "30.00", frequency: "monthly", next_charge_at: "2026-11-02T06:00:00+08:00", created_at: "2026-02-02T06:00:00+08:00" },
    { id: "sub_music", account_id: "A1001", merchant: "声屿音乐", status: "active", amount: "15.00", frequency: "monthly", next_charge_at: "2026-11-05T06:00:00+08:00", created_at: "2026-03-05T06:00:00+08:00" },
    { id: "sub_gym", account_id: "A1001", merchant: "城市健身", status: "active", amount: "199.00", frequency: "monthly", next_charge_at: "2026-11-12T06:00:00+08:00", created_at: "2026-01-12T06:00:00+08:00" },
    { id: "sub_cloud", account_id: "A1001", merchant: "轻云空间", status: "active", amount: "12.00", frequency: "monthly", next_charge_at: "2026-11-18T06:00:00+08:00", created_at: "2026-04-18T06:00:00+08:00" },
  ],
  products: [
    { id: "fund_money", name: "安心货币", product_type: "货币基金", risk_level: "LOW", expected_return_min: "0.018", expected_return_max: "0.0235", minimum_amount: "1.00", lock_days: 0, liquidity: "灵活申赎", fee_rate: "0", issuer: "BankSense 理财" },
    { id: "fund_bond", name: "稳盈短债", product_type: "债券基金", risk_level: "LOW", expected_return_min: "0.026", expected_return_max: "0.035", minimum_amount: "100.00", lock_days: 7, liquidity: "赎回 T+1 到账", fee_rate: "0.001", issuer: "BankSense 理财" },
    { id: "fund_balanced", name: "稳健增利", product_type: "混合基金", risk_level: "MEDIUM", expected_return_min: "0.035", expected_return_max: "0.048", minimum_amount: "1000.00", lock_days: 30, liquidity: "赎回 T+2 到账", fee_rate: "0.003", issuer: "BankSense 理财" },
    { id: "fund_growth", name: "成长精选", product_type: "股票基金", risk_level: "HIGH", expected_return_min: "0.045", expected_return_max: "0.078", minimum_amount: "1000.00", lock_days: 90, liquidity: "赎回 T+3 到账", fee_rate: "0.005", issuer: "BankSense 理财" },
  ],
  transactions: [
    { id: 1, kind: "CARD_SPEND", amount: "-126.00", counterparty: null, note: "午间聚餐", created_at: "2026-10-28T12:30:00+08:00", direction: "out", category: "餐饮", merchant: "小满食堂" },
    { id: 2, kind: "CARD_SPEND", amount: "-299.00", counterparty: null, note: "生活用品", created_at: "2026-10-27T18:20:00+08:00", direction: "out", category: "购物", merchant: "生活集市" },
    { id: 3, kind: "CARD_SPEND", amount: "-28.00", counterparty: null, note: "地铁出行", created_at: "2026-10-26T08:30:00+08:00", direction: "out", category: "交通", merchant: "城市交通" },
    { id: 4, kind: "MANDATE", amount: "-199.00", counterparty: null, note: "月度会员", created_at: "2026-10-25T06:00:00+08:00", direction: "out", category: "健身", merchant: "城市健身" },
    { id: 5, kind: "CARD_SPEND", amount: "-1280.00", counterparty: null, note: "数码配件", created_at: "2026-10-23T21:15:00+08:00", direction: "out", category: "数码", merchant: "极物数码" },
    { id: 6, kind: "MANDATE", amount: "-30.00", counterparty: null, note: "月度会员", created_at: "2026-10-22T06:00:00+08:00", direction: "out", category: "娱乐", merchant: "云映视频" },
    { id: 7, kind: "CARD_SPEND", amount: "-368.00", counterparty: null, note: "周末晚餐", created_at: "2026-10-20T19:00:00+08:00", direction: "out", category: "餐饮", merchant: "山间餐厅" },
    { id: 8, kind: "CARD_SPEND", amount: "-68.00", counterparty: null, note: "打车", created_at: "2026-10-18T22:30:00+08:00", direction: "out", category: "交通", merchant: "顺路出行" },
    { id: 9, kind: "EXTERNAL_CREDIT", amount: "12000.00", counterparty: "工资入账", note: "10 月工资", created_at: "2026-10-15T09:00:00+08:00", direction: "in", category: "工资", merchant: null },
    { id: 10, kind: "P2P_EXTERNAL", amount: "-800.00", counterparty: "王五", note: "朋友转账", created_at: "2026-10-14T10:00:00+08:00", direction: "out", category: "转账", merchant: null },
    { id: 11, kind: "MANDATE", amount: "-15.00", counterparty: null, note: "月度会员", created_at: "2026-10-05T06:00:00+08:00", direction: "out", category: "娱乐", merchant: "声屿音乐" },
    { id: 12, kind: "MANDATE", amount: "-12.00", counterparty: null, note: "云空间", created_at: "2026-10-03T06:00:00+08:00", direction: "out", category: "生活服务", merchant: "轻云空间" },
    { id: 13, kind: "CARD_SPEND", amount: "-560.00", counterparty: null, note: "月度餐饮", created_at: "2026-09-25T19:00:00+08:00", direction: "out", category: "餐饮", merchant: "小满食堂" },
    { id: 14, kind: "CARD_SPEND", amount: "-880.00", counterparty: null, note: "购物", created_at: "2026-09-20T14:00:00+08:00", direction: "out", category: "购物", merchant: "生活集市" },
    { id: 15, kind: "CARD_SPEND", amount: "-320.00", counterparty: null, note: "日常出行", created_at: "2026-09-18T08:00:00+08:00", direction: "out", category: "交通", merchant: "城市交通" },
    { id: 16, kind: "MANDATE", amount: "-199.00", counterparty: null, note: "会员扣费", created_at: "2026-09-12T06:00:00+08:00", direction: "out", category: "健身", merchant: "城市健身" },
    { id: 17, kind: "EXTERNAL_CREDIT", amount: "12000.00", counterparty: "工资入账", note: "9 月工资", created_at: "2026-09-15T09:00:00+08:00", direction: "in", category: "工资", merchant: null },
    { id: 18, kind: "CARD_SPEND", amount: "-680.00", counterparty: null, note: "生活采购", created_at: "2026-08-25T15:00:00+08:00", direction: "out", category: "购物", merchant: "生活集市" },
    { id: 19, kind: "CARD_SPEND", amount: "-420.00", counterparty: null, note: "月度餐饮", created_at: "2026-08-20T12:00:00+08:00", direction: "out", category: "餐饮", merchant: "小满食堂" },
  ],
};
