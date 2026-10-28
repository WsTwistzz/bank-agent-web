import { useState, type CSSProperties } from "react";
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Download, FileText, Receipt, Search, Sparkles } from "lucide-react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import type { Transaction } from "../../api/bank";
import { T } from "../theme";
import { useFeatureData } from "./featureData";
import { EmptyState, FeatureShell, FeatureSheet, FeatureTabs, GlassCard, Pill, PrimaryButton, Stat } from "./FeatureUI";
import { transactionMonth as monthKey, signedTransactionCents as signedCents, isConsumptionTransaction as isSpend, isTransferTransaction as isTransfer, summarizeTransactions as summarize } from "./featureAccounting";

const colors = [T.teal, T.navy, "#75a5b6", "#a7bdcb", "#b7c8be", "#b5aca1", "#d3dce2"];
const plainButton: CSSProperties = { border: 0, background: "transparent", padding: 0, color: "inherit", cursor: "pointer", textAlign: "left" };
const money = (cents: number) => `¥${(Math.abs(cents) / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthLabel = (key: string) => `${key.slice(0, 4)} 年 ${Number(key.slice(5))} 月`;
const merchantName = (tx: Transaction) => tx.merchant || tx.counterparty || tx.category || "账户交易";
const categoryName = (tx: Transaction) => tx.category || "未分类";

export default function BillsPage() {
  const { transactions, account, isDemo, loading } = useFeatureData();
  const months = [...new Set(transactions.map(monthKey).filter(Boolean))].sort().reverse().slice(0, 3);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [tab, setTab] = useState("消费概览");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部分类");
  const [detail, setDetail] = useState<Transaction | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const month = months.includes(selectedMonth) ? selectedMonth : months[0] || "";
  const rows = transactions.filter(tx => monthKey(tx) === month).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const totals = summarize(rows);
  const previousDate = month ? new Date(`${month}-01T00:00:00Z`) : null;
  previousDate?.setUTCMonth(previousDate.getUTCMonth() - 1);
  const previousMonth = previousDate?.toISOString().slice(0, 7) || "";
  const previousRows = transactions.filter(tx => monthKey(tx) === previousMonth);
  const previous = summarize(previousRows);
  const comparison = !previousRows.length ? "暂无上月已加载流水" : !previous.spending ? "上月消费为 0，暂无环比基准" : `较上月${totals.spending > previous.spending ? "增加" : totals.spending < previous.spending ? "减少" : "持平"}${totals.spending === previous.spending ? "" : ` ${Math.abs((totals.spending - previous.spending) / previous.spending * 100).toFixed(1)}%`}`;
  const spendingRows = rows.filter(isSpend);
  const categories = [...new Set(spendingRows.map(categoryName))].map(name => ({ name, value: spendingRows.filter(tx => categoryName(tx) === name).reduce((sum, tx) => sum + Math.abs(signedCents(tx)), 0) })).sort((a, b) => b.value - a.value);
  const allCategories = [...new Set(rows.map(categoryName))];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = rows.filter(tx => (category === "全部分类" || categoryName(tx) === category) && `${merchantName(tx)} ${tx.note || ""}`.toLocaleLowerCase().includes(normalizedQuery));
  const trend = months.slice().reverse().map(key => ({ month: `${Number(key.slice(5))}月`, amount: summarize(transactions.filter(tx => monthKey(tx) === key)).spending / 100, key }));
  const largeSpends = spendingRows.filter(tx => Math.abs(signedCents(tx)) >= 100000);
  const digital = spendingRows.filter(tx => categoryName(tx) === "数码").reduce((sum, tx) => sum + Math.abs(signedCents(tx)), 0);
  const previousDigital = previousRows.filter(tx => isSpend(tx) && categoryName(tx) === "数码").reduce((sum, tx) => sum + Math.abs(signedCents(tx)), 0);
  const scope = isDemo ? "基于示例流水生成，仅供功能体验。" : `已加载流水统计：当前共 ${transactions.length} 笔，仅覆盖接口返回记录，不代表完整月账单。`;
  const report = [
    `BankSense · ${month ? monthLabel(month) : "暂无月份"}账单分析`, `账户：${account?.name || "—"} / ${account?.id || "—"}`,
    scope, `本月已加载流水：${rows.length} 笔`, `消费：${money(totals.spending)}（银行卡消费与代扣支出）`,
    `收入：${money(totals.income)}（不含转入）`, `转入：${money(totals.transferIn)}`, `转出：${money(totals.transferOut)}`,
    `消费环比：${comparison}；仅比较已加载流水。`, "消费分类：", ...categories.map(item => `${item.name}：${money(item.value)} / ${(item.value / totals.spending * 100).toFixed(1)}%`),
    "统计时区：Asia/Shanghai。转账按交易类型单列，未计入消费。报告为本地规则汇总，不包含 AI 推断。",
  ].join("\n");
  function changeMonth(value: string) {
    setSelectedMonth(value); setCategory("全部分类"); setQuery(""); setDetail(null);
  }
  function downloadReport() {
    const url = URL.createObjectURL(new Blob(["\uFEFF", report], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `BankSense-${month}-账单分析.txt`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function openCategory(value: string) { setCategory(value); setQuery(""); setTab("交易明细"); }
  function transactionRow(tx: Transaction) {
    const incoming = signedCents(tx) > 0;
    return <button key={tx.id} type="button" onClick={() => { setEvidenceOpen(false); setDetail(tx); }} style={{ ...plainButton, width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "13px 0", borderBottom: "1px solid rgba(16,24,40,.05)" }}>
      <span className="feature-icon" style={{ width: 33, height: 33, color: incoming ? "#067647" : T.teal, background: incoming ? "rgba(18,183,106,.07)" : T.tealSoft }}>{incoming ? <ArrowDownLeft size={15} /> : <Receipt size={15} />}</span>
      <span style={{ flex: 1, minWidth: 0 }}><strong style={{ display: "block", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{merchantName(tx)}</strong><span style={{ display: "block", marginTop: 5, fontSize: 9, color: T.faint }}>{new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit" }).format(new Date(tx.created_at))} · {categoryName(tx)}</span></span>
      <strong style={{ fontSize: 12, fontWeight: 600, color: incoming ? "#067647" : T.ink, fontVariantNumeric: "tabular-nums" }}>{incoming ? "+" : signedCents(tx) < 0 ? "−" : ""}{money(signedCents(tx))}</strong><ChevronRight size={11} color={T.faint} />
    </button>;
  }

  return <FeatureShell title="账单分析" subtitle="SPENDING & INSIGHTS">
    <GlassCard style={{ background: "linear-gradient(145deg,rgba(255,255,255,.7),rgba(215,233,241,.45))" }}>
      <div className="feature-row"><p className="feature-label">{isDemo ? "本月消费" : "已加载消费支出"}</p><select aria-label="选择账单月份" value={month} onChange={event => changeMonth(event.target.value)} disabled={!months.length} className="feature-secondary" style={{ minHeight: 29, fontSize: 10 }}>{months.length ? months.map(key => <option key={key} value={key}>{monthLabel(key)}</option>) : <option value="">暂无月份</option>}</select></div>
      <p className="feature-number" style={{ color: T.navy, marginTop: 12 }}>{money(totals.spending)}</p>
      <div className="feature-row"><Pill tone={previous.spending && totals.spending < previous.spending ? "green" : "neutral"}>{comparison}</Pill><span style={{ fontSize: 9, color: T.faint }}>{spendingRows.length} 笔消费</span></div>
      <hr className="feature-divider" />
      <div className="feature-stat-grid"><Stat label="收入 · 不含转入" value={money(totals.income)} positive /><Stat label="转账支出" value={money(totals.transferOut)} note={`转入 ${money(totals.transferIn)}`} /></div>
      <p className="feature-caption" style={{ marginTop: 13 }}>消费仅统计银行卡消费与代扣。{!isDemo && "已加载流水统计，可能不覆盖整月。"}</p>
    </GlassCard>

    <FeatureTabs items={["消费概览", "交易明细"]} value={tab} onChange={setTab} />
    {tab === "消费概览" ? <>
      <GlassCard>
        <div className="feature-row"><h2>钱花在哪里</h2><span style={{ color: T.faint, fontSize: 9 }}>消费分类</span></div>
        {categories.length ? <>
          <div style={{ position: "relative", height: 163, margin: "5px 0 8px" }} role="img" aria-label={`消费分类：${categories.map(item => `${item.name} ${(item.value / totals.spending * 100).toFixed(1)}%`).join("，")}`}>
            <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categories} dataKey="value" nameKey="name" innerRadius={51} outerRadius={71} paddingAngle={4} stroke="none" isAnimationActive={false}>{categories.map((item, index) => <Cell key={item.name} fill={colors[index % colors.length]} />)}</Pie></PieChart></ResponsiveContainer>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", pointerEvents: "none" }}><span style={{ fontSize: 9, color: T.faint }}>共计</span><strong style={{ fontSize: 20, marginTop: 3, color: T.navy }}>{categories.length}<small style={{ fontSize: 9, fontWeight: 400, marginLeft: 3 }}>类消费</small></strong></div>
          </div>
          {categories.map((item, index) => <button key={item.name} type="button" onClick={() => openCategory(item.name)} style={{ ...plainButton, width: "100%", display: "flex", gap: 8, alignItems: "center", marginTop: 11 }} aria-label={`查看${item.name}交易`}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: colors[index % colors.length] }} /><span style={{ fontSize: 10, flex: 1 }}>{item.name}</span><span style={{ fontSize: 9, color: T.faint }}>{(item.value / totals.spending * 100).toFixed(1)}%</span><strong style={{ minWidth: 77, textAlign: "right", fontSize: 11, fontWeight: 600 }}>{money(item.value)}</strong><ChevronRight size={11} color={T.faint} />
          </button>)}
        </> : <EmptyState title="本月暂无消费记录" body="已加载流水中没有银行卡消费或代扣支出。" />}
      </GlassCard>

      <GlassCard>
        <div className="feature-row"><h2>消费趋势</h2><Pill tone="neutral">{trend.length} 个月已加载数据</Pill></div>
        {trend.length ? <div style={{ height: 142, marginTop: 12 }} role="img" aria-label={trend.map(item => `${item.month}消费${money(Math.round(item.amount * 100))}`).join("，")}><ResponsiveContainer width="100%" height="100%"><BarChart data={trend} margin={{ top: 12, right: 12, left: 12, bottom: 0 }}><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: T.faint, fontSize: 10 }} /><Tooltip cursor={{ fill: "rgba(26,127,158,.04)" }} formatter={value => [money(Math.round(Number(value) * 100)), "消费"]} contentStyle={{ borderRadius: 12, border: "1px solid white", fontSize: 11 }} /><Bar dataKey="amount" barSize={30} radius={[7, 7, 3, 3]} isAnimationActive={false}>{trend.map(item => <Cell key={item.key} fill={item.key === month ? T.teal : "#b9cdd7"} />)}</Bar></BarChart></ResponsiveContainer></div> : <EmptyState title="暂无趋势数据" body="流水同步后将在这里展示消费变化。" />}
        <p className="feature-caption">{isDemo ? "示例数据中的最近三个月" : "接口已返回流水的最近三个月"}，按人民币统计。</p>
      </GlassCard>

      {isDemo && largeSpends.length > 0 && <GlassCard style={{ background: "rgba(255,249,238,.65)" }}>
        <button type="button" onClick={() => setEvidenceOpen(true)} style={{ ...plainButton, width: "100%" }}>
          <div className="feature-row"><div className="feature-row-start" style={{ gap: 6 }}><Sparkles size={14} color={T.amber} /><h2>大额消费提醒</h2></div><Pill tone="amber">演示规则</Pill></div>
          <p style={{ fontSize: 11, margin: "12px 0 6px", color: T.navy }}>{largeSpends.length} 笔消费达到 {money(100000)}</p>
          <p className="feature-caption">{digital > 0 ? previousDigital > 0 ? `数码支出${money(digital)}，${digital > previousDigital ? "较上月增加" : "较上月未增加"}。` : `数码支出 ${money(digital)}；上月基准为 0，暂无比较依据。` : "按单笔金额筛选，仅用于展示提醒功能。"}</p>
          <span className="feature-link" style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 10 }}>查看对应流水 <ArrowUpRight size={12} /></span>
        </button>
      </GlassCard>}
      <GlassCard><div className="feature-row"><h2>最近交易</h2><button type="button" className="feature-link" onClick={() => { setTab("交易明细"); setCategory("全部分类"); setQuery(""); }}>查看全部 {rows.length} 笔</button></div>{rows.length ? rows.slice(0, 4).map(transactionRow) : <EmptyState title={loading ? "正在同步流水" : "本月暂无流水"} body="可切换月份查看其他已加载记录。" />}</GlassCard>
    </> : <>
      <label className="feature-search"><Search size={15} /><input aria-label="搜索商户或备注" placeholder="搜索商户、对方名称或备注" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className="feature-row"><select aria-label="筛选交易分类" value={category} className="feature-secondary" onChange={event => setCategory(event.target.value)}><option>全部分类</option>{allCategories.map(name => <option key={name}>{name}</option>)}</select><span style={{ fontSize: 10, color: T.faint }}>{filtered.length} 笔记录</span></div>
      <GlassCard>{filtered.length ? filtered.map(transactionRow) : <EmptyState title="没有匹配的交易" body={rows.length ? "请调整搜索关键词或分类条件。" : "当前月份还没有已加载流水。"} />}</GlassCard>
    </>}

    <PrimaryButton disabled={!month || loading} onClick={() => setReportOpen(true)}><FileText size={14} />生成本月分析报告</PrimaryButton>
    <p className="feature-caption" style={{ textAlign: "center", margin: 0 }}>{scope}</p>

    {detail && <FeatureSheet title="交易详情" onClose={() => setDetail(null)}>
      <div style={{ textAlign: "center", paddingBottom: 8 }}><span className="feature-label">{merchantName(detail)}</span><p className="feature-number" style={{ fontSize: 28, color: signedCents(detail) > 0 ? "#067647" : T.navy }}>{signedCents(detail) > 0 ? "+" : signedCents(detail) < 0 ? "−" : ""}{money(signedCents(detail))}</p><Pill tone={isTransfer(detail) ? "neutral" : "teal"}>{isTransfer(detail) ? "转账" : isSpend(detail) ? "消费支出" : detail.direction === "in" ? "收入" : "其他支出"}</Pill></div>
      <dl className="feature-definition">{[
        ["交易编号", String(detail.id)], ["交易时间", new Date(detail.created_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })],
        ["交易类型", detail.kind], ["分类", categoryName(detail)], ["收支方向", detail.direction === "in" ? "收入" : "支出"],
        ["商户", detail.merchant || "—"], ["交易对方", detail.counterparty || "—"], ["备注", detail.note || "—"], ["原始金额", detail.amount],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd style={{ maxWidth: "70%", overflowWrap: "anywhere" }}>{value}</dd></div>)}</dl>
      <p className="feature-note">{isDemo ? "此记录来自演示数据。" : "此记录来自当前已加载流水。"}金额方向以流水的收支方向字段为准；时间为北京时间。</p>
    </FeatureSheet>}

    {evidenceOpen && <FeatureSheet title="大额消费提醒 · 演示" onClose={() => setEvidenceOpen(false)}>
      <p className="feature-note">演示阈值为单笔消费 ≥ ¥1,000.00，仅按金额筛选，未作风险或异常认定。</p>
      {largeSpends.map(tx => <div key={tx.id}>{transactionRow(tx)}</div>)}
      {digital > 0 && <p className="feature-caption">数码支出本月 {money(digital)}，上月 {money(previousDigital)}。{previousDigital === 0 ? "上月基准为 0，暂无环比比较依据。" : `按已加载流水计算，${digital > previousDigital ? "增加" : "减少或持平"} ${money(digital - previousDigital)}。`}</p>}
    </FeatureSheet>}

    {reportOpen && <FeatureSheet title={`${monthLabel(month)}分析报告`} onClose={() => setReportOpen(false)} footer={<PrimaryButton onClick={downloadReport}><Download size={14} />下载文本报告</PrimaryButton>}>
      <Pill tone={isDemo ? "amber" : "neutral"}>{isDemo ? "示例报告" : "已加载流水统计"}</Pill>
      <p className="feature-caption" style={{ marginTop: 10 }}>{scope}</p>
      <div className="feature-stat-grid" style={{ margin: "18px 0" }}><Stat label="本月消费" value={money(totals.spending)} /><Stat label="本月收入 · 不含转入" value={money(totals.income)} positive /></div>
      <p className="feature-note">{rows.length} 笔流水，其中消费 {spendingRows.length} 笔。{comparison}。转出 {money(totals.transferOut)}，转入 {money(totals.transferIn)}，均未计入消费。</p>
      <h3>消费分类</h3>
      {categories.length ? <dl className="feature-definition">{categories.map(item => <div key={item.name}><dt>{item.name} · {(item.value / totals.spending * 100).toFixed(1)}%</dt><dd>{money(item.value)}</dd></div>)}</dl> : <p className="feature-caption">当前月份暂无已加载消费。</p>}
      <p className="feature-caption">报告按本地规则汇总已加载记录；消费口径为 CARD_SPEND、MANDATE 的支出。环比仅比较已加载流水，不包含 AI 推断。</p>
    </FeatureSheet>}
  </FeatureShell>;
}
