import { useState } from "react";
import { ArrowDownUp, ArrowUpRight, Check, ChevronRight, Clock3, Leaf, ShieldCheck, Sparkles } from "lucide-react";
import { formatMoney, toNumber, type InvestmentProduct } from "../../api/bank";
import { T } from "../theme";
import { useFeatureData } from "./featureData";
import { EmptyState, FeatureShell, FeatureSheet, FeatureTabs, GlassCard, Pill, PrimaryButton, Stat } from "./FeatureUI";

type Sheet = "detail" | "compare" | "risk" | "purchase" | "redeem" | null;
type Holding = { productId: string; amount: number; earnings: number };
type DemoOrder = { id: number; productId: string; amount: number; status: "pending" | "confirmed" };
const riskInfo = {
  LOW: { label: "低风险", rating: 1, tone: "green" },
  MEDIUM: { label: "中风险", rating: 3, tone: "amber" },
  HIGH: { label: "高风险", rating: 5, tone: "red" },
} as const;
const questions = [
  { title: "您的投资经验是？", answers: ["尚无经验", "接触过存款和货币基金", "投资过债券或混合基金", "熟悉股票等波动产品"] },
  { title: "您计划投资多久？", answers: ["3 个月以内", "3–12 个月", "1–3 年", "3 年以上"] },
  { title: "这笔资金占可投资资产的比例？", answers: ["超过 75%", "50%–75%", "25%–50%", "低于 25%"] },
  { title: "您能接受的阶段性亏损？", answers: ["不能接受亏损", "5% 以内", "5%–15%", "超过 15%"] },
  { title: "您的流动性需求是？", answers: ["随时可能全部用到", "半年内可能使用", "一年内无需使用", "三年以上无需使用"] },
  { title: "面对市场下跌，您更倾向于？", answers: ["立即退出", "减仓观望", "继续持有", "结合判断追加投资"] },
];
const profileNames = ["保守型", "稳健型", "平衡型", "成长型", "进取型"];
const rate = (product: InvestmentProduct) => `${(toNumber(product.expected_return_min) * 100).toFixed(2)}–${(toNumber(product.expected_return_max) * 100).toFixed(2)}%`;
const money = (amount: number) => formatMoney(amount);
const compactMoney = (amount: string) => toNumber(amount).toLocaleString("zh-CN");
const cellStyle = { padding: "12px 8px", borderBottom: `1px solid ${T.line}`, verticalAlign: "top", fontSize: 10 } as const;

export default function WealthPage() {
  const { account, products, isDemo, loading } = useFeatureData();
  const [tab, setTab] = useState("精选产品");
  const [filter, setFilter] = useState("全部");
  const [selected, setSelected] = useState<string[]>([]);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [active, setActive] = useState<InvestmentProduct | null>(null);
  const [answers, setAnswers] = useState<number[]>(Array(6).fill(0));
  const [profile, setProfile] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [message, setMessage] = useState("");
  const [holdings, setHoldings] = useState<Holding[]>([
    { productId: "fund_money", amount: 18000, earnings: 106.32 },
    { productId: "fund_bond", amount: 10560, earnings: 84.16 },
  ]);
  const [orders, setOrders] = useState<DemoOrder[]>([{ id: 1, productId: "fund_money", amount: 200, status: "pending" }]);
  const demoHoldings = isDemo ? holdings.filter(h => products.some(p => p.id === h.productId)) : [];
  const demoOrders = isDemo ? orders : [];
  const frozen = demoOrders.filter(o => o.status === "pending").reduce((sum, o) => sum + o.amount, 0);
  const demoSpent = demoOrders.reduce((sum, order) => sum + order.amount, 0);
  const available = Math.max(0, toNumber(account.balance) - demoSpent);
  const total = demoHoldings.reduce((sum, holding) => sum + holding.amount, 0);
  const shown = products.filter(p => filter === "全部" || riskInfo[p.risk_level].label === filter);
  const compared = products.filter(p => selected.includes(p.id));
  const numericAmount = Number(amount);
  const amountValid = /^\d+(\.\d{1,2})?$/.test(amount) && Number.isFinite(numericAmount) && numericAmount > 0;
  const unsuitable = active !== null && profile !== null && profile < riskInfo[active.risk_level].rating;
  const holding = demoHoldings.find(h => h.productId === active?.id);
  const purchaseError = !amount ? "" : !amountValid ? "请输入有效金额，最多保留两位小数" : active && numericAmount < toNumber(active.minimum_amount) ? `最低申购 ${money(toNumber(active.minimum_amount))}` : numericAmount > available ? "金额超过账户可用余额" : "";
  const redeemValid = /^\d+(\.\d{1,4})?$/.test(amount) && Number.isFinite(numericAmount) && numericAmount > 0 && numericAmount <= (holding?.amount ?? 0);

  function open(next: Sheet, product?: InvestmentProduct) {
    if (product) setActive(product);
    setAmount(""); setAccepted(false); setMessage(""); setSheet(next);
  }
  function toggleCompare(id: string) {
    setSelected(ids => ids.includes(id) ? ids.filter(value => value !== id) : ids.length < 2 ? [...ids, id] : ids);
  }
  function purchase() {
    if (!active || !amountValid || purchaseError || !accepted || profile === null || unsuitable) return;
    if (isDemo) {
      setOrders(list => [...list, { id: Date.now(), productId: active.id, amount: numericAmount, status: "pending" }]);
      setMessage(`已生成 ${money(numericAmount)} 的演示申购单，金额在本页模拟冻结。未扣除真实资金，未向银行提交。`);
    } else setMessage(`已生成 ${active.name} · ${money(numericAmount)} 的本页草稿。需接入安全网关并完成授权后方可提交，目前没有执行申购。`);
  }
  function confirmDemoOrder(order: DemoOrder) {
    if (!isDemo || order.status !== "pending") return;
    setOrders(list => list.map(item => item.id === order.id ? { ...item, status: "confirmed" } : item));
    setHoldings(list => list.some(item => item.productId === order.productId)
      ? list.map(item => item.productId === order.productId ? { ...item, amount: item.amount + order.amount } : item)
      : [...list, { productId: order.productId, amount: order.amount, earnings: 0 }]);
  }

  return <FeatureShell title="理财" subtitle="WEALTH & GROWTH">
    <GlassCard style={{ background: "linear-gradient(135deg,rgba(255,255,255,.65),rgba(215,235,236,.42))", position: "relative", overflow: "hidden" }}>
      <div className="feature-row"><p className="feature-label">{isDemo ? "理财总资产 · 演示" : "理财总资产"}</p><span className="feature-icon"><Leaf size={18} /></span></div>
      <p className="feature-number">{isDemo ? money(total) : "— —"}</p>
      <div className="feature-stat-grid" style={{ marginTop: 17 }}>
        <Stat label="昨日收益" value={isDemo ? "+2.36" : "—"} note={isDemo ? "示意金额 / 元" : "待接入持仓接口"} positive={isDemo} />
        <Stat label="累计收益" value={isDemo ? `+${demoHoldings.reduce((sum, h) => sum + h.earnings, 0).toFixed(2)}` : "—"} note={isDemo ? "演示持仓 / 元" : "暂无可用数据"} positive={isDemo} />
      </div>
      <p className="feature-caption">{isDemo ? "让每一份积累，慢慢生长。以下资产与收益为示例。" : "产品信息已同步；持仓和收益尚未接入，暂不展示金额。"}</p>
    </GlassCard>

    <GlassCard style={{ padding: "13px 16px" }}>
      <div className="feature-row"><div className="feature-row-start"><span className="feature-icon"><ShieldCheck size={18} /></span><div><h3>{profile === null ? "了解您的投资偏好" : `R${profile} · ${profileNames[profile - 1]}`}</h3><p className="feature-caption">{profile === null ? "6 个问题，探索合适的风险范围" : "本页测评示例 · 未提交至银行"}</p></div></div><button className="feature-link" onClick={() => open("risk")}>{profile === null ? "去测评" : "重新测评"}<ChevronRight size={12} style={{ verticalAlign: "middle" }} /></button></div>
    </GlassCard>

    <FeatureTabs items={["精选产品", "我的持仓"]} value={tab} onChange={setTab} />
    {tab === "精选产品" ? <>
      <FeatureTabs items={["全部", "低风险", "中风险", "高风险"]} value={filter} onChange={setFilter} />
      <div className="feature-section-title"><h2>为成长多一种选择</h2><span>{shown.length} 款产品</span></div>
      {shown.length === 0 && <GlassCard><EmptyState title={loading ? "正在同步产品" : "暂无符合条件的产品"} body="试试其他风险分类。" /><button className="feature-link" onClick={() => setFilter("全部")}>查看全部产品</button></GlassCard>}
      {shown.map(product => <GlassCard key={product.id}>
        <div className="feature-row"><div className="feature-row-start"><span className="feature-icon"><Sparkles size={16} /></span><div><h3>{product.name}</h3><p className="feature-caption">{product.product_type} · {product.issuer}</p></div></div><Pill tone={riskInfo[product.risk_level].tone}>{riskInfo[product.risk_level].label}</Pill></div>
        <p style={{ color: T.teal, fontSize: 27, fontWeight: 650, letterSpacing: -1, margin: "18px 0 3px" }}>{rate(product)}</p>
        <p className="feature-caption">参考年化区间 · 不代表收益承诺</p>
        <div className="feature-row" style={{ marginTop: 13, color: T.sub, fontSize: 10 }}><span>{compactMoney(product.minimum_amount)} 元起购</span><span>{product.lock_days ? `${product.lock_days} 天锁定` : "无锁定期"}</span><span>{product.liquidity}</span></div>
        <hr className="feature-divider" />
        <div className="feature-row"><label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: T.sub }}><input type="checkbox" checked={selected.includes(product.id)} disabled={selected.length === 2 && !selected.includes(product.id)} onChange={() => toggleCompare(product.id)} style={{ accentColor: T.teal }} />加入对比</label><button className="feature-link" onClick={() => open("detail", product)}>产品详情 <ArrowUpRight size={12} style={{ verticalAlign: "middle" }} /></button></div>
      </GlassCard>)}
      <button className="feature-secondary" disabled={selected.length !== 2} onClick={() => open("compare")} style={{ opacity: selected.length === 2 ? 1 : .5 }}><ArrowDownUp size={13} />对比产品（{selected.length}/2）</button>
      <p className="feature-caption" style={{ textAlign: "center", marginTop: -4 }}>理财有风险，投资需谨慎；历史表现不预示未来收益。</p>
    </> : <>
      {!isDemo ? <GlassCard><EmptyState title="持仓数据暂未接入" body="当前仅支持读取理财产品。真实持仓、份额及订单需接入对应接口。" /><PrimaryButton onClick={() => setTab("精选产品")}>浏览产品</PrimaryButton></GlassCard> : <>
        <div className="feature-section-title"><h2>我的持仓</h2><Pill tone="neutral">演示资产</Pill></div>
        {demoHoldings.map(item => {
          const product = products.find(p => p.id === item.productId)!;
          return <GlassCard key={item.productId}><div className="feature-row"><h3>{product.name}</h3><Pill tone={riskInfo[product.risk_level].tone}>{riskInfo[product.risk_level].label}</Pill></div><p className="feature-number" style={{ fontSize: 24 }}>{money(item.amount)}</p><p className="feature-caption">演示份额 {item.amount.toFixed(2)} 份 · 示例单位净值 1.0000</p><div className="feature-row" style={{ marginTop: 12 }}><span style={{ color: T.teal, fontSize: 10 }}>累计示例收益 +{item.earnings.toFixed(2)}</span><button className="feature-secondary" onClick={() => open("redeem", product)}>赎回草稿</button></div></GlassCard>;
        })}
        <GlassCard><div className="feature-row"><h2>订单与在途资金</h2><Clock3 size={15} color={T.teal} /></div><p className="feature-caption">模拟冻结 {money(frozen)} · 以下均为演示订单</p>{demoOrders.map(order => <div key={order.id} style={{ borderTop: `1px solid ${T.line}`, paddingTop: 12, marginTop: 12 }}><div className="feature-row"><strong style={{ fontSize: 11 }}>{products.find(p => p.id === order.productId)?.name ?? order.productId}</strong><Pill tone={order.status === "pending" ? "amber" : "green"}>{order.status === "pending" ? "演示待确认" : "演示已确认"}</Pill></div><p className="feature-caption">申购 {money(order.amount)} · {order.status === "pending" ? "确认时间仅模拟：下一工作日" : "已加入本页演示持仓"}</p>{order.status === "pending" && <button className="feature-link" onClick={() => confirmDemoOrder(order)}>模拟份额确认</button>}</div>)}</GlassCard>
      </>}
    </>}

    {sheet === "detail" && active && <FeatureSheet title="产品详情" onClose={() => setSheet(null)} footer={<PrimaryButton onClick={() => open("purchase", active)}>{isDemo ? "体验申购" : "填写申购草稿"}</PrimaryButton>}>
      <Pill tone={riskInfo[active.risk_level].tone}>{riskInfo[active.risk_level].label}</Pill><h3>{active.name}</h3><p style={{ color: T.teal, fontSize: 30, fontWeight: 650, margin: "12px 0 3px" }}>{rate(active)}</p><p className="feature-caption">参考年化区间，不构成收益保证</p>
      <dl className="feature-definition">{[["产品类型", active.product_type], ["发行机构", active.issuer], ["起购金额", money(toNumber(active.minimum_amount))], ["锁定期", `${active.lock_days} 天`], ["流动性", active.liquidity], ["费率", `${(toNumber(active.fee_rate) * 100).toFixed(2)}%`]].map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl><div className="feature-note">本金可能发生损失，产品存在市场及流动性风险。锁定期内通常无法赎回，具体以正式产品协议与交易确认为准。</div>
    </FeatureSheet>}

    {sheet === "compare" && <FeatureSheet title="产品对比" onClose={() => setSheet(null)}><p className="feature-caption">按您选择的两款产品展示，参考收益并非承诺。</p><table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}><thead><tr><th style={{ ...cellStyle, width: "23%" }}>对比项</th>{compared.map(p => <th key={p.id} style={cellStyle}>{p.name}</th>)}</tr></thead><tbody>{["类型", "风险", "参考年化", "最低申购", "锁定天数", "流动性", "费率", "发行机构"].map((label, index) => <tr key={label}><th style={{ ...cellStyle, color: T.sub, fontWeight: 400 }}>{label}</th>{compared.map(p => <td key={p.id} style={cellStyle}>{[p.product_type, riskInfo[p.risk_level].label, rate(p), money(toNumber(p.minimum_amount)), `${p.lock_days} 天`, p.liquidity, `${(toNumber(p.fee_rate) * 100).toFixed(2)}%`, p.issuer][index]}</td>)}</tr>)}</tbody></table></FeatureSheet>}

    {sheet === "risk" && <FeatureSheet title="投资风险测评" onClose={() => setSheet(null)} footer={<PrimaryButton disabled={answers.some(value => value === 0)} onClick={() => { const score = answers.reduce((sum, value) => sum + value, 0); const level = score <= 9 ? 1 : score <= 13 ? 2 : score <= 17 ? 3 : score <= 21 ? 4 : 5; setProfile(level); setMessage(`您的示例结果：R${level} ${profileNames[level - 1]}，${score} / 24 分。结果仅在本页有效，未提交银行。`); }}>查看测评结果</PrimaryButton>}>
      <div className="feature-note">本地问卷演示，用于体验适当性提示；正式交易仍需银行的有效风险测评。每题 1–4 分，总分 6–24 分。</div>
      {questions.map((question, index) => <fieldset key={question.title} style={{ border: 0, borderBottom: `1px solid ${T.line}`, margin: "16px 0", padding: "0 0 8px" }}><legend style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>{index + 1}. {question.title}</legend>{question.answers.map((answer, choice) => <label key={answer} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}><input type="radio" name={`risk-${index}`} value={choice + 1} checked={answers[index] === choice + 1} onChange={() => { setAnswers(list => list.map((value, i) => i === index ? choice + 1 : value)); setMessage(""); }} style={{ accentColor: T.teal }} />{answer}</label>)}</fieldset>)}
      <p className="feature-caption">分数区间：R1 6–9；R2 10–13；R3 14–17；R4 18–21；R5 22–24。</p>{message && <p role="status" className="feature-success">{message}</p>}
    </FeatureSheet>}

    {sheet === "purchase" && active && <FeatureSheet title={isDemo ? "演示申购" : "申购草稿"} onClose={() => setSheet(null)} footer={!message && <PrimaryButton disabled={!amountValid || !!purchaseError || !accepted || profile === null || unsuitable || loading} onClick={purchase}>{isDemo ? "生成演示订单" : "保存本页草稿"}</PrimaryButton>}>
      <div className="feature-row"><h3>{active.name}</h3><Pill tone={riskInfo[active.risk_level].tone}>{riskInfo[active.risk_level].label}</Pill></div><p className="feature-caption">{isDemo ? "演示可用余额" : "账户可用余额"} {money(available)}</p>
      {message ? <><p className="feature-success" role="status"><Check size={14} style={{ verticalAlign: "middle", marginRight: 5 }} />{message}</p><button className="feature-secondary" onClick={() => { setSheet(null); setTab("我的持仓"); }}>查看{isDemo ? "演示订单" : "持仓说明"}</button></> : <>
        <label htmlFor="wealth-buy-amount">申购金额 / 元</label><input id="wealth-buy-amount" className="feature-input" inputMode="decimal" placeholder={`${compactMoney(active.minimum_amount)} 元起购`} value={amount} onChange={event => setAmount(event.target.value)} aria-invalid={!!purchaseError} />{purchaseError && <p role="alert" className="feature-error">{purchaseError}</p>}
        <dl className="feature-definition"><div><dt>锁定及流动性</dt><dd>{active.lock_days} 天 · {active.liquidity}</dd></div><div><dt>参考费率</dt><dd>{(toNumber(active.fee_rate) * 100).toFixed(2)}%</dd></div><div><dt>风险适当性</dt><dd>{profile === null ? "尚未完成测评" : `本地示例 R${profile}`}</dd></div></dl>
        {profile === null && <div className="feature-note">请先完成本地风险测评，再体验申购。<button className="feature-link" onClick={() => open("risk")}>开始测评</button></div>}
        {unsuitable && <p className="feature-error" role="alert">该产品超出您的示例风险承受范围，本页已阻止申购。可返回选择更低风险产品。</p>}
        <div className="feature-note">参考收益不构成保证，本金可能亏损。{isDemo ? "确认只创建本页演示订单并模拟冻结金额，不会调用交易接口。" : "此入口仅保存本页草稿；真实申购需安全网关授权及正式风险测评。"}</div>
        <label style={{ display: "flex", gap: 8, alignItems: "start", marginTop: 14, lineHeight: 1.8 }}><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} style={{ marginTop: 4, accentColor: T.teal }} />我已阅读风险提示，理解此操作为{isDemo ? "演示订单" : "本页草稿"}。</label>
      </>}
    </FeatureSheet>}

    {sheet === "redeem" && active && isDemo && <FeatureSheet title="演示赎回草稿" onClose={() => setSheet(null)} footer={!message && <PrimaryButton disabled={!redeemValid} onClick={() => setMessage(`已生成 ${active.name} · ${numericAmount.toFixed(4)} 份的本页赎回草稿。演示持仓未变动，未提交订单或返还资金。`)}>生成赎回草稿</PrimaryButton>}>
      <h3>{active.name}</h3><p className="feature-caption">演示持仓 {(holding?.amount ?? 0).toFixed(4)} 份 · 单位净值示例 1.0000</p>{message ? <p className="feature-success" role="status">{message}</p> : <><label htmlFor="wealth-redeem-amount">赎回份额 / 份</label><input id="wealth-redeem-amount" className="feature-input" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="输入赎回份额" />{amount && !redeemValid && <p className="feature-error">请输入不超过演示持仓的有效份额，最多四位小数。</p>}<p className="feature-note">锁定期 {active.lock_days} 天；{active.liquidity}。实际可赎份额及到账日期需由银行核验。本页仅生成草稿，不执行赎回。</p></>}
    </FeatureSheet>}
  </FeatureShell>;
}
