import { ArrowRight, ArrowUpRight, CalendarClock, Check, CheckCircle2, ChevronRight, Clock3, History, Search, ShieldCheck, UserRound, Wallet } from "lucide-react";
import { useState, type FormEvent } from "react";
import { formatMoney, type Payee } from "../../api/bank";
import { useFeatureData } from "./featureData";
import { decimalCents, shanghaiDay } from "./featureAccounting";
import { usePaymentData, type DemoTransfer } from "./paymentData";
import { parsePaymentAmount, paymentAmountError } from "./paymentMath";
import { EmptyState, FeatureShell, FeatureSheet, FeatureTabs, GlassCard, Pill, PrimaryButton } from "./FeatureUI";
import "./payments.css";

type Sheet = "payees" | "review" | "result" | "history" | "record" | null;
type TransferDraft = Omit<DemoTransfer, "id" | "createdAt" | "status">;
const money = (cents: number) => formatMoney(cents / 100);

export default function TransferPage() {
  const { account, payees, cards, cardSettings, isDemo, loading } = useFeatureData();
  const { availableCents, transfers, addDemoTransfer } = usePaymentData();
  const [recipient, setRecipient] = useState<Payee | null>(null);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [bank, setBank] = useState("Mock Bank");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [timing, setTiming] = useState("立即转账");
  const [date, setDate] = useState("");
  const [wallToday] = useState(() => shanghaiDay(new Date().toISOString()));
  const today = isDemo ? "2026-10-29" : wallToday;
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [draft, setDraft] = useState<TransferDraft | null>(null);
  const [receipt, setReceipt] = useState<DemoTransfer | null>(null);
  const [copied, setCopied] = useState("");
  const card = cards.find(c => c.account_id === account.id);
  const singleLimit = card ? cardSettings[card.id]?.singleLimit ?? decimalCents(card.limit) : undefined;
  const blocked = card && ["frozen", "lost", "reported_lost"].includes(card.status.toLowerCase());
  const cents = parsePaymentAmount(amount);
  const amountError = amount || submitted ? paymentAmountError(amount, availableCents, singleLimit) : "";
  const foundPayees = payees.filter(p => `${p.name} ${p.alias ?? ""} ${p.phone}`.toLowerCase().includes(query.trim().toLowerCase()));

  function choosePayee(payee: Payee) {
    setRecipient(payee); setName(payee.name); setTarget(payee.account_id); setBank("Mock Bank"); setError(""); setSheet(null);
  }

  function review(event: FormEvent<HTMLFormElement>) {
    const selectedDate = String(new FormData(event.currentTarget).get("scheduled_date") ?? "");
    event.preventDefault(); setSubmitted(true); setError(""); setCopied("");
    if (!name.trim()) { setError("请填写收款人姓名，或选择常用收款人"); return; }
    if (!recipient && !/^\d{12,24}$/.test(target.replace(/\s/g, ""))) { setError("请输入 12–24 位银行卡号，或选择常用收款人"); return; }
    if (recipient?.account_id === account.id) { setError("收款账户不能与付款账户相同"); return; }
    if (amountError || cents === null) return;
    if (blocked) { setError("付款账户关联卡片已冻结或挂失，请先前往银行卡管理查看"); return; }
    if (timing === "预约转账" && (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate) || selectedDate < tomorrow)) { setError("请选择从明天起的有效预约日期"); return; }
    if (timing === "预约转账") setDate(selectedDate);
    setDraft({ recipientName: name.trim(), recipientAccount: target.replace(/\s/g, ""), recipientBank: bank, amountCents: cents, memo: memo.trim(), scheduledDate: timing === "预约转账" ? selectedDate : null });
    setSheet("review");
  }

  function confirm() {
    if (!draft || loading) return;
    if (isDemo) {
      const record = addDemoTransfer(draft);
      if (!record) { setError("余额或页面状态已变化，请返回重新核对"); setSheet(null); return; }
      setReceipt(record);
    } else setReceipt(null);
    setSheet("result");
  }

  async function copyReceipt() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(`BankSense ${isDemo ? "演示" : "草稿"}转账\n收款人：${draft.recipientName}\n账户：${draft.recipientAccount}\n金额：${money(draft.amountCents)}\n备注：${draft.memo || "无"}\n${receipt ? `记录：${receipt.id}` : "尚未提交银行"}`);
      setCopied("转账信息已复制");
    } catch { setCopied("未能复制，请手动选取转账信息"); }
  }

  function resetForm() { setSheet(null); setAmount(""); setMemo(""); setSubmitted(false); setError(""); setDraft(null); setReceipt(null); }

  return <FeatureShell title="转账" subtitle="SEND WITH CONFIDENCE">
    <GlassCard><div className="payment-balance"><div><p className="feature-label">{isDemo ? "可用余额 · 演示账户" : "账户余额"}</p><strong>{money(availableCents)}</strong><p className="feature-caption">{account.name} · {account.id}</p></div><span className="payment-balance-icon"><Wallet size={22} strokeWidth={1.5} /></span></div><hr className="feature-divider" /><div className="feature-row"><span className="feature-caption" style={{ margin: 0 }}>{singleLimit === undefined ? "限额待银行核验" : `单笔限额 ${money(singleLimit)}`}</span><button type="button" className="feature-link" onClick={() => setSheet("history")}><History size={12} />转账记录</button></div></GlassCard>

    {payees.length > 0 && <div><div className="feature-section-title"><h2>常用收款人</h2><button className="feature-link" type="button" onClick={() => { setQuery(""); setSheet("payees"); }}>全部<ChevronRight size={11} /></button></div><div className="payment-contacts">{payees.slice(0, 3).map(p => <button key={p.id} type="button" className={`payment-contact${recipient?.id === p.id ? " is-selected" : ""}`} onClick={() => choosePayee(p)} aria-label={`转给${p.name}`}><span className="payment-avatar">{p.name.slice(0, 1)}</span><span>{p.name}</span><span style={{ fontSize: 8, color: "#98a2b3" }}>{p.alias || "收款人"}</span></button>)}</div></div>}

    <form onSubmit={review} noValidate className="flex flex-col gap-[13px]">
      <GlassCard><div className="feature-row"><h2>收款账户</h2><button type="button" className="feature-link" onClick={() => { setQuery(""); setSheet("payees"); }}><UserRound size={12} />选择收款人</button></div>
        {recipient ? <>
          <button type="button" className="payment-record" onClick={() => { setQuery(""); setSheet("payees"); }} aria-label="更换收款人"><span className="payment-avatar">{recipient.name.slice(0, 1)}</span><span style={{ flex: 1 }}><strong className="text-[13px]">{recipient.name}</strong><span className="feature-caption block">BankSense · 本行账户 {recipient.account_id}</span></span><ChevronRight size={14} color="#98a2b3" /></button>
          <button type="button" className="feature-link mt-2" onClick={() => { setRecipient(null); setName(""); setTarget(""); }}>手动输入其他账户</button>
        </> : <>
        <div className="payment-field"><label htmlFor="transfer-recipient">收款人姓名</label><input id="transfer-recipient" className="feature-input" value={name} placeholder="请输入收款人姓名" autoComplete="off" maxLength={30} onChange={e => { setName(e.target.value); setRecipient(null); setError(""); }} /></div>
        <div className="payment-field"><label htmlFor="transfer-account">{recipient ? "收款账户 · 本行账户" : "收款银行卡号"}</label><input id="transfer-account" className="feature-input" value={target} placeholder="请输入银行卡号" inputMode={recipient ? "text" : "numeric"} autoComplete="off" maxLength={30} onChange={e => { setTarget(e.target.value); setRecipient(null); setError(""); }} /></div>
        <div className="payment-field"><label htmlFor="transfer-bank">收款银行</label><select id="transfer-bank" className="feature-input" value={bank} onChange={e => { setBank(e.target.value); setRecipient(null); }}><option value="Mock Bank">BankSense · Mock Bank</option><option value="其他银行">其他银行{isDemo ? "（演示）" : ""}</option></select></div>
        </>}
      </GlassCard>

      <GlassCard><h2>转账金额</h2><div className="payment-amount"><span>¥</span><input aria-label="转账金额" value={amount} onChange={e => { setAmount(e.target.value); setError(""); }} inputMode="decimal" placeholder="0.00" autoComplete="off" maxLength={16} aria-invalid={!!amountError} aria-describedby={amountError ? "transfer-amount-error" : undefined} /></div>
        <div className="payment-quick-amounts">{[100, 500, 1000].map(value => <button key={value} type="button" className={amount === String(value) ? "is-selected" : ""} onClick={() => setAmount(String(value))}>¥{value}</button>)}</div>
        {amountError ? <p id="transfer-amount-error" className="feature-error" role="alert">{amountError}</p> : <p className="feature-caption">{cents ? `转账后${isDemo ? "演示" : "参考"}余额 ${money(Math.max(0, availableCents - cents))}` : "支持精确到分，下一步核对收款信息"}</p>}
        <hr className="feature-divider" />
        <div className="payment-field" style={{ marginTop: 0 }}><label htmlFor="transfer-memo">转账备注 <span style={{ float: "right" }}>{memo.length}/50</span></label><input id="transfer-memo" className="feature-input" placeholder="填写备注（选填）" maxLength={50} value={memo} onChange={e => setMemo(e.target.value)} /></div>
      </GlassCard>

      <GlassCard><div className="feature-row mb-3"><h2>到账安排</h2><Pill tone="neutral"><Clock3 size={9} />自主安排</Pill></div><FeatureTabs items={["立即转账", "预约转账"]} value={timing} onChange={setTiming} />
        {timing === "预约转账" ? <div className="payment-field"><label htmlFor="transfer-date">预约执行日期</label><input id="transfer-date" name="scheduled_date" type="date" min={tomorrow} className="feature-input" value={date} onChange={e => { setDate(e.target.value); setError(""); }} onInput={e => setDate(e.currentTarget.value)} /><p className="feature-caption">创建后不立即扣款，到期执行时仍需通过资金与安全检查。</p></div> : <p className="feature-caption">{isDemo ? "确认后展示演示转账结果，不涉及真实资金。" : "真实到账时间与费用以银行执行结果为准。"}</p>}
      </GlassCard>
      {blocked && <div className="feature-note">付款卡片当前不可用于对外转账。<a href="#/cards" className="feature-link ml-1">查看银行卡管理<ChevronRight size={11} /></a></div>}
      {error && <p className="feature-error px-1" role="alert">{error}</p>}
      <PrimaryButton type="submit" disabled={loading}>下一步<ArrowRight size={14} /></PrimaryButton>
    </form>
    <p className="payment-security"><ShieldCheck size={13} />核对收款人姓名与账户后再确认，所有正式转账均须安全网关授权。</p>

    {sheet === "payees" && <FeatureSheet title="选择收款人" onClose={() => setSheet(null)}><label className="feature-search mb-3"><Search size={14} /><input aria-label="搜索收款人" value={query} placeholder="搜索姓名、别名或手机号" onChange={e => setQuery(e.target.value)} /></label>{foundPayees.map(p => <button key={p.id} type="button" className="payment-record" onClick={() => choosePayee(p)}><span className="payment-avatar">{p.name.slice(0, 1)}</span><span style={{ flex: 1 }}><strong className="text-[12px]">{p.name}</strong><span className="feature-caption block">{p.alias || "本行收款人"} · {p.account_id}</span></span>{recipient?.id === p.id ? <Check size={16} color="#1a7f9e" /> : <ChevronRight size={13} color="#98a2b3" />}</button>)}{!foundPayees.length && <EmptyState title="暂无匹配的收款人" body="试试其他姓名，或手动输入银行卡信息。" />}<button type="button" className="feature-secondary mt-4 w-full" onClick={() => { setRecipient(null); setName(""); setTarget(""); setSheet(null); }}>手动输入银行卡信息</button></FeatureSheet>}

    {sheet === "review" && draft && <FeatureSheet title="核对转账信息" onClose={() => setSheet(null)} footer={<PrimaryButton disabled={loading} onClick={confirm}>{isDemo ? draft.scheduledDate ? "确认演示预约" : "确认演示转账" : "保存本页草稿"}<ArrowRight size={14} /></PrimaryButton>}>
      <div className="payment-recipient-summary"><span className="payment-avatar"><UserRound size={18} /></span><strong>{draft.recipientName}</strong><Pill tone="neutral">{draft.recipientBank}</Pill></div><p className="payment-review-amount">{money(draft.amountCents)}</p>
      <dl className="feature-definition"><div><dt>收款姓名</dt><dd>{draft.recipientName}</dd></div><div><dt>收款账户</dt><dd>{draft.recipientAccount}</dd></div><div><dt>付款账户</dt><dd>{account.name} · {account.id}</dd></div><div><dt>执行时间</dt><dd>{draft.scheduledDate ? `${draft.scheduledDate} · 预约` : "确认后执行"}</dd></div><div><dt>备注</dt><dd>{draft.memo || "无"}</dd></div><div><dt>费用</dt><dd>{isDemo ? "¥0.00（演示）" : "待银行核验"}</dd></div><div><dt>{draft.scheduledDate ? "当前可用余额" : "转后参考余额"}</dt><dd>{money(draft.scheduledDate ? availableCents : availableCents - draft.amountCents)}</dd></div></dl>
      <div className="feature-note">{isDemo ? "本次只更新演示余额与记录，不会调用真实转账接口。" : "本次仅生成转账草稿；实际预演、风险分级与审批由安全网关提供，当前不会提交执行。"}</div>
    </FeatureSheet>}

    {sheet === "result" && draft && <FeatureSheet title={isDemo ? receipt?.scheduledDate ? "预约演示已创建" : "转账演示已完成" : "转账草稿已生成"} onClose={() => setSheet(null)} footer={<div className="payment-sheet-options"><PrimaryButton onClick={resetForm}>再转一笔</PrimaryButton><a href="#/home" className="feature-secondary w-full">返回首页</a></div>}>
      <span className="payment-receipt-mark">{receipt?.scheduledDate ? <CalendarClock size={31} strokeWidth={1.4} /> : isDemo ? <CheckCircle2 size={32} strokeWidth={1.4} /> : <ShieldCheck size={31} strokeWidth={1.4} />}</span>
      <p className="payment-review-amount">{money(draft.amountCents)}</p><p className="feature-caption text-center">{isDemo ? receipt?.scheduledDate ? "未立即扣款，预约记录仅用于演示" : "仅更新演示状态，真实账户未发生扣款" : "尚未提交银行，需完成网关授权后执行"}</p>
      <dl className="feature-definition"><div><dt>收款人</dt><dd>{draft.recipientName}</dd></div><div><dt>收款账户</dt><dd>{draft.recipientAccount}</dd></div><div><dt>备注</dt><dd>{draft.memo || "无"}</dd></div>{draft.scheduledDate && <div><dt>预约日期</dt><dd>{draft.scheduledDate}</dd></div>}{receipt && <div><dt>演示记录</dt><dd className="payment-result-id">{receipt.id}</dd></div>}</dl><button type="button" className="feature-secondary w-full" onClick={copyReceipt}>复制转账信息</button>{copied && <p className="feature-caption" role="status">{copied}</p>}
    </FeatureSheet>}

    {sheet === "history" && <FeatureSheet title="本次转账记录" onClose={() => setSheet(null)}>{transfers.length ? transfers.map(record => <button key={record.id} className="payment-record" type="button" onClick={() => { setReceipt(record); setSheet("record"); }}><span className="feature-icon">{record.scheduledDate ? <CalendarClock size={17} /> : <ArrowUpRight size={17} />}</span><span style={{ flex: 1 }}><strong className="text-[12px]">{record.recipientName}</strong><span className="feature-caption block">{record.scheduledDate ? `${record.scheduledDate} 预约 · 演示` : "演示已完成"}</span></span><strong className="text-[12px]">−{money(record.amountCents)}</strong><ChevronRight size={12} /></button>) : <EmptyState title="暂无本次转账记录" body={isDemo ? "体验一笔转账或预约，演示记录会出现在这里。" : "真实转账记录需要接入计划与流水接口。"} />}</FeatureSheet>}
    {sheet === "record" && receipt && <FeatureSheet title="转账记录详情" onClose={() => setSheet("history")}><p className="payment-review-amount">{money(receipt.amountCents)}</p><div className="text-center"><Pill tone={receipt.status === "scheduled" ? "amber" : "green"}>{receipt.status === "scheduled" ? "演示待到期" : "演示已完成"}</Pill></div><dl className="feature-definition"><div><dt>收款人</dt><dd>{receipt.recipientName}</dd></div><div><dt>账户</dt><dd>{receipt.recipientAccount}</dd></div><div><dt>银行</dt><dd>{receipt.recipientBank}</dd></div><div><dt>备注</dt><dd>{receipt.memo || "无"}</dd></div>{receipt.scheduledDate && <div><dt>预约日期</dt><dd>{receipt.scheduledDate}</dd></div>}<div><dt>记录编号</dt><dd className="payment-result-id">{receipt.id}</dd></div></dl><div className="feature-note">本条是本次体验中的演示记录，不代表真实银行交易。</div></FeatureSheet>}
  </FeatureShell>;
}
