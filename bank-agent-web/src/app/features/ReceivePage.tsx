import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ArrowDownLeft, ArrowUpRight, Check, ChevronRight, Copy, Download, Info, Plus, QrCode, ScanLine, ShieldCheck, Users, Wallet } from "lucide-react";
import { T } from "../theme";
import { EmptyState, FeatureShell, FeatureSheet, FeatureTabs, GlassCard, Pill, PrimaryButton, Stat } from "./FeatureUI";
import { useFeatureData } from "./featureData";
import { usePaymentData, type DemoSplitRequest } from "./paymentData";
import { allocateSplit, parsePaymentAmount } from "./paymentMath";

const money = (cents: number) => `¥${(cents / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
type Sheet = "amount" | "account" | "create" | "detail" | null;

export default function ReceivePage() {
  const { account, isDemo, loading } = useFeatureData();
  const { splitRequests, createDemoSplit, markDemoSplitPaid } = usePaymentData();
  const [tab, setTab] = useState("收款码");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [qr, setQr] = useState<{ payload: string; url: string; error: string } | null>(null);
  const [title, setTitle] = useState("");
  const [totalInput, setTotalInput] = useState("");
  const [namesInput, setNamesInput] = useState("");
  const [includeSelf, setIncludeSelf] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [liveDrafts, setLiveDrafts] = useState<DemoSplitRequest[]>([]);

  const maskedAccount = account.id.length > 4 ? `•••• ${account.id.slice(-4)}` : `•• ${account.id.slice(-2)}`;
  const params = new URLSearchParams({ account: account.id });
  if (amountCents !== null) params.set("amount_cents", String(amountCents));
  const payload = isDemo && !loading ? `banksense-demo://receive?${params.toString()}` : "";
  const currentQr = qr?.payload === payload && payload ? qr : null;

  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    QRCode.toDataURL(payload, { width: 640, margin: 3, errorCorrectionLevel: "M", color: { dark: "#14344f", light: "#ffffff" } })
      .then(url => { if (!cancelled) setQr({ payload, url, error: "" }); })
      .catch(() => { if (!cancelled) setQr({ payload, url: "", error: "信息码生成失败，请调整金额后重试。" }); });
    return () => { cancelled = true; };
  }, [payload]);

  const names = namesInput.split(/[,，\n]/).map(name => name.trim()).filter(Boolean);
  const totalCents = parsePaymentAmount(totalInput);
  const headCount = names.length + (includeSelf ? 1 : 0);
  const validNames = names.length >= 1 && names.length <= 12 && names.every(name => name.length <= 20) && new Set(names).size === names.length;
  const allocation = totalCents !== null && validNames && totalCents >= headCount ? allocateSplit(totalCents, names.length, includeSelf) : null;
  const requests = isDemo ? splitRequests : liveDrafts;
  const selected = requests.find(request => request.id === selectedId);
  const activeRequests = requests.filter(request => request.participants.some(participant => !participant.paid)).length;
  const outstanding = requests.reduce((sum, request) => sum + request.participants.reduce((part, participant) => part + (participant.paid ? 0 : participant.amountCents), 0), 0);

  function open(next: Sheet) {
    setError("");
    setNotice("");
    if (next === "amount") setAmountInput(amountCents === null ? "" : (amountCents / 100).toFixed(2));
    setSheet(next);
  }

  function close() { setSheet(null); setError(""); }

  async function copy(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      setError("");
      setNotice(message);
    } catch {
      setNotice("");
      setError("复制未成功，请在账户详情中手动选取信息。");
    }
  }

  function saveAmount() {
    if (loading) return;
    const value = amountInput.trim() ? parsePaymentAmount(amountInput) : null;
    if (amountInput.trim() && value === null) { setError("请输入大于 0、最多两位小数的金额。"); return; }
    setAmountCents(value);
    close();
  }

  function saveQr() {
    if (!isDemo || loading || !currentQr?.url) return;
    const link = document.createElement("a");
    link.href = currentQr.url;
    link.download = `BankSense-demo-receive-${amountCents ?? "open"}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setNotice("已发起保存演示信息码，请查看浏览器下载。");
  }

  function createRequest() {
    if (loading) return;
    if (!title.trim()) { setError("给这次 AA 收款起个名字。"); return; }
    if (title.trim().length > 30) { setError("收款主题请控制在 30 个字以内。"); return; }
    if (totalCents === null) { setError("请输入大于 0、最多两位小数的总金额。"); return; }
    if (names.length < 1 || names.length > 12) { setError("请输入 1–12 位参与者的姓名，不含你自己。"); return; }
    if (names.some(name => name.length > 20)) { setError("每位参与者的姓名请控制在 20 个字以内。"); return; }
    if (new Set(names).size !== names.length) { setError("参与者姓名重复，请添加称呼以区分。"); return; }
    if (!allocation) { setError(`金额不足以分摊给 ${headCount} 人，每人至少需 0.01 元。`); return; }
    const input = { title: title.trim(), totalCents, participantNames: names, includeSelf };
    const request = isDemo ? createDemoSplit(input) : {
      id: `draft-${crypto.randomUUID()}`, title: input.title, totalCents, selfCents: allocation.selfCents, includeSelf,
      createdAt: new Date().toISOString(),
      participants: names.map((name, index) => ({ id: `draft-person-${index}`, name, amountCents: allocation.participantCents[index], paid: false })),
    };
    if (!request) { setError("暂时无法创建演示收款，请稍后重试。"); return; }
    if (!isDemo) setLiveDrafts(current => [request, ...current]);
    setSelectedId(request.id);
    setSheet("detail");
    setError("");
    setNotice(isDemo ? "演示 AA 已创建，可以模拟参与者到账。" : "AA 草稿已保留在本页；尚未提交银行或通知参与者。");
    setTitle(""); setTotalInput(""); setNamesInput(""); setIncludeSelf(true);
  }

  const accountInfo = `BankSense${isDemo ? " 演示账户" : " Mock Bank 账户"}\n收款人：${account.name}\n账户：${account.id}${amountCents === null ? "" : `\n金额：${money(amountCents)}`}\n${isDemo ? "仅用于演示，不是支付指令。" : "请核对账户信息；当前未接入收款服务。"}`;

  return <FeatureShell title="收款" subtitle="RECEIVE & CONNECT">
    <FeatureTabs items={["收款码", "AA收款"]} value={tab} onChange={value => { setTab(value); setError(""); setNotice(""); }} />
    {notice && <div className="feature-note" role="status">{notice}</div>}
    {error && !sheet && <p className="feature-error" role="alert">{error}</p>}

    {tab === "收款码" ? <>
      <GlassCard style={{ padding: "23px 20px 17px", textAlign: "center", background: "linear-gradient(145deg,rgba(255,255,255,.75),rgba(232,242,246,.55))" }}>
        <div className="flex items-center justify-center gap-1.5 text-[10px] font-semibold tracking-wide text-[#14344f]"><ArrowDownLeft size={13} />{isDemo ? "向我发送演示收款信息" : "我的收款账户"}</div>
        <p className="mb-0 mt-3 text-[11px] text-[#7c8796]">{amountCents === null ? "未指定金额" : "指定收款金额"}</p>
        <p className="mb-4 mt-1 text-[30px] font-semibold tracking-[-1px] text-[#14344f]" style={{ fontVariantNumeric: "tabular-nums" }}>{amountCents === null ? "随心收款" : money(amountCents)}</p>
        <div className="relative mx-auto grid h-[208px] w-[208px] place-items-center rounded-[22px] border border-white bg-white shadow-[0_8px_32px_rgba(20,52,79,.06)]">
          {loading ? <div className="px-6 text-[11px] leading-6 text-[#98a2b3]" role="status">正在同步账户…</div> : isDemo ? currentQr?.url ? <img src={currentQr.url} width={208} height={208} alt={"BankSense 演示收款信息码，账户" + maskedAccount + (amountCents === null ? "，未指定金额" : "，金额" + money(amountCents))} className="h-full w-full rounded-[21px]" /> : <div className="px-6 text-[11px] leading-6 text-[#98a2b3]" role={currentQr?.error ? "alert" : "status"}><QrCode size={28} strokeWidth={1.3} className="mx-auto mb-3" />{currentQr?.error || "正在生成信息码…"}</div> : <div className="px-6 text-[11px] leading-6 text-[#7c8796]"><ScanLine size={34} strokeWidth={1.2} className="mx-auto mb-3 text-[#98a2b3]" /><strong className="block font-medium text-[#344054]">收款码待接入</strong>银行签名收款服务接入后开放</div>}
        </div>
        <div className="mt-4"><Pill tone={isDemo ? "teal" : "neutral"}>{isDemo ? "演示收款信息码 · 非支付码" : "待接入银行收款服务"}</Pill></div>
        <p className="mb-0 mt-3 text-[12px] font-semibold text-[#344054]">{account.name}<span className="ml-2 text-[10px] font-normal text-[#98a2b3]">{maskedAccount}</span></p>
        <p className="feature-caption">{isDemo ? "扫码可读取演示信息，不能发起实际付款" : "当前可查看、复制账户信息"}</p>
        <hr className="feature-divider" />
        <div className="feature-row"><button type="button" className="feature-link" disabled={loading} onClick={() => open("amount")}>{amountCents === null ? "设置金额" : "修改金额"}<ArrowUpRight size={12} /></button>{amountCents !== null && <button type="button" className="feature-link" disabled={loading} onClick={() => setAmountCents(null)}>清除金额</button>}<button type="button" className="feature-link" onClick={() => open("account")}>账户详情<ChevronRight size={12} /></button></div>
      </GlassCard>

      <div className="grid grid-cols-2 gap-3"><button type="button" className="feature-secondary h-11 disabled:opacity-40" onClick={saveQr} disabled={!isDemo || loading || !currentQr?.url}><Download size={14} />保存信息码</button><button type="button" className="feature-secondary h-11 disabled:opacity-40" disabled={loading} onClick={() => void copy(accountInfo, "收款账户信息已复制。") }><Copy size={14} />复制收款信息</button></div>
      <div className="flex items-start gap-2 px-1 text-[9px] leading-[1.8] text-[#98a2b3]"><ShieldCheck size={13} className="mt-0.5 shrink-0" /><p className="m-0">{isDemo ? "信息码仅供 BankSense 演示使用，不支持银行、微信或支付宝付款。实际到账以银行账单为准。" : "请与付款方核对户名和账户。当前页面不会生成或执行真实收款指令。"}</p></div>
    </> : <>
      <GlassCard style={{ background: "linear-gradient(125deg,rgba(20,52,79,.94),rgba(44,80,97,.91))", color: "white", padding: 20 }}>
        <div className="feature-row"><span className="text-[10px] text-white/60">一起花，也轻松算</span><Users size={19} strokeWidth={1.4} className="text-white/60" /></div>
        <h2 className="mt-3! text-[19px]! tracking-tight">每一份，都算得清楚。</h2>
        <p className="mb-4 mt-2 text-[10px] leading-5 text-white/55">聚餐、旅行、日常小聚，把账单轻轻分好。</p>
        <button type="button" disabled={loading} onClick={() => open("create")} className="flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-4 py-2.5 text-[10px] font-medium text-white disabled:opacity-40"><Plus size={13} />{isDemo ? "发起演示 AA" : "创建 AA 草稿"}</button>
      </GlassCard>
      <div className="grid grid-cols-2 gap-3 px-2 py-1"><Stat label={isDemo ? "进行中的演示 AA" : "本页待提交草稿"} value={`${activeRequests} 笔`} /><Stat label={isDemo ? "尚待模拟收取" : "草稿待收金额"} value={money(outstanding)} /></div>
      <div className="feature-section-title"><h2>{isDemo ? "我的 AA 收款" : "我的 AA 草稿"}</h2><span>{requests.length} 笔</span></div>
      {requests.length === 0 ? <GlassCard><div className="mx-auto mt-3 grid h-14 w-14 place-items-center rounded-full bg-[#1a7f9e]/5 text-[#1a7f9e]"><Users size={25} strokeWidth={1.3} /></div><EmptyState title="把好时光，一起分担" body="还没有 AA 收款，记下第一笔共同开销吧。" /><PrimaryButton disabled={loading} onClick={() => open("create")}><Plus size={14} />{isDemo ? "创建第一笔演示 AA" : "创建第一笔 AA 草稿"}</PrimaryButton></GlassCard> : requests.map(request => {
        const target = request.participants.reduce((sum, participant) => sum + participant.amountCents, 0);
        const paid = request.participants.reduce((sum, participant) => sum + (participant.paid ? participant.amountCents : 0), 0);
        const paidCount = request.participants.filter(participant => participant.paid).length;
        return <GlassCard key={request.id}><button type="button" className="w-full text-left" onClick={() => { setSelectedId(request.id); open("detail"); }} aria-label={`查看${request.title}收款详情`}>
          <div className="feature-row"><div className="feature-row-start"><span className="feature-icon"><Users size={17} strokeWidth={1.5} /></span><div className="min-w-0"><h3 className="break-all">{request.title}</h3><p className="feature-caption">{request.participants.length + (request.includeSelf ? 1 : 0)} 人分摊 · 总额 {money(request.totalCents)}</p></div></div><ChevronRight size={15} color={T.faint} className="shrink-0" /></div>
          <div className="feature-row mt-4"><span className="text-[10px] text-[#667085]">{isDemo ? `模拟已收 ${money(paid)}` : "尚未提交"}</span><Pill tone={isDemo && paidCount === request.participants.length ? "green" : "neutral"}>{isDemo ? `${paidCount}/${request.participants.length} 人模拟到账` : "本地草稿"}</Pill></div>
          <div role="progressbar" aria-label={`${request.title}模拟收款进度`} aria-valuemin={0} aria-valuemax={target} aria-valuenow={paid} className="my-3 h-1 overflow-hidden rounded-full bg-[#14344f]/5"><div className="h-full rounded-full bg-[#1a7f9e] transition-all" style={{ width: `${paid / target * 100}%` }} /></div>
          <div className="feature-row text-[9px] text-[#98a2b3]"><span>向参与者待收 {money(target - paid)}</span><span>{request.includeSelf ? `自己分摊 ${money(request.selfCents)}` : "自己不参与分摊"}</span></div>
        </button></GlassCard>;
      })}
      <p className="feature-caption flex items-start gap-1.5 px-1"><Info size={12} className="mt-0.5 shrink-0" />{isDemo ? "模拟到账会更新演示余额与 AA 进度，不涉及真实资金。" : "草稿仅保留在当前页面，收款请求服务接入后才可正式发起。"}</p>
    </>}

    {sheet === "amount" && <FeatureSheet title="设置收款金额" onClose={close} footer={<PrimaryButton disabled={loading} onClick={saveAmount}>确认金额</PrimaryButton>}>
      <p className="feature-caption">填写金额，让对方一眼看清。留空则不指定金额。</p><form onSubmit={event => { event.preventDefault(); saveAmount(); }}><label htmlFor="receive-amount">收款金额（元）</label><div className="relative"><span className="absolute left-3 top-3 text-[#98a2b3]">¥</span><input id="receive-amount" autoComplete="off" inputMode="decimal" className="feature-input pl-8!" placeholder="0.00" value={amountInput} onChange={event => { setAmountInput(event.target.value); setError(""); }} /></div><button type="submit" hidden>确认金额</button></form>{error && <p className="feature-error" role="alert">{error}</p>}<p className="feature-note mt-4">{isDemo ? "金额只写入演示信息码，不会向任何人扣款。" : "金额仅用于整理收款信息，当前未接入银行收款码。"}</p>
    </FeatureSheet>}

    {sheet === "account" && <FeatureSheet title="收款账户信息" onClose={close} footer={<PrimaryButton disabled={loading} onClick={() => void copy(accountInfo, "收款账户信息已复制。") }><Copy size={14} />复制收款信息</PrimaryButton>}>
      <div className="feature-row"><span className="feature-icon"><Wallet size={18} /></span><Pill tone="neutral">{isDemo ? "演示账户" : "Mock Bank"}</Pill></div><dl className="feature-definition"><div><dt>收款人</dt><dd className="select-text">{account.name}</dd></div><div><dt>账户</dt><dd className="select-text break-all">{account.id}</dd></div><div><dt>指定金额</dt><dd>{amountCents === null ? "未指定" : money(amountCents)}</dd></div></dl><p className="feature-note">{isDemo ? "此账户与收款信息码仅用于产品演示，不支持真实资金交易。" : "收款服务尚未接入，请核对信息后通过银行确认收款。"}</p>{notice && <p className="feature-success" role="status">{notice}</p>}{error && <p className="feature-error" role="alert">{error}</p>}
    </FeatureSheet>}

    {sheet === "create" && <FeatureSheet title={isDemo ? "发起演示 AA 收款" : "创建 AA 收款草稿"} onClose={close} footer={<PrimaryButton disabled={loading} onClick={createRequest}>{isDemo ? "创建演示 AA" : "保存本页草稿"}<ArrowUpRight size={14} /></PrimaryButton>}>
      <form onSubmit={event => { event.preventDefault(); createRequest(); }}><label htmlFor="split-title">收款主题</label><input id="split-title" className="feature-input mb-4" placeholder="例如：周末的小聚" maxLength={30} value={title} onChange={event => { setTitle(event.target.value); setError(""); }} /><label htmlFor="split-total">账单总金额（元）</label><input id="split-total" className="feature-input mb-4" inputMode="decimal" placeholder="0.00" value={totalInput} onChange={event => { setTotalInput(event.target.value); setError(""); }} /><label htmlFor="split-names">参与者（不含自己，1–12 人）</label><textarea id="split-names" className="feature-input min-h-[65px] resize-none" placeholder="输入姓名，用逗号或换行分隔" rows={2} value={namesInput} onChange={event => { setNamesInput(event.target.value); setError(""); }} /><div className="feature-row my-4"><div><h3 className="m-0">我也参与分摊</h3><p className="feature-caption">{includeSelf ? "已计入总人数，尾差由自己承担" : "全部金额由参与者分摊"}</p></div><button type="button" role="switch" aria-label="我也参与分摊" aria-checked={includeSelf} className="feature-toggle" onClick={() => { setIncludeSelf(!includeSelf); setError(""); }}><span /></button></div><button type="submit" hidden>创建 AA</button></form>
      <div className="rounded-[17px] border border-white/80 bg-white/50 p-3"><div className="feature-row"><h3 className="m-0">分摊预览</h3><span className="text-[10px] text-[#98a2b3]">{validNames ? `${headCount} 人` : "等待参与者"}</span></div>{allocation && totalCents !== null ? <><div className="mt-3 max-h-[150px] space-y-2 overflow-y-auto text-[11px]">{includeSelf && <div className="feature-row"><span className="text-[#667085]">我自己</span><strong className="font-medium text-[#1a7f9e]">{money(allocation.selfCents)}</strong></div>}{names.map((name, index) => <div className="feature-row" key={`${name}-${index}`}><span className="break-all text-[#667085]">{name}</span><span className="shrink-0 text-[#344054]">{money(allocation.participantCents[index])}</span></div>)}</div><p className="feature-caption mt-3!">均分基数 {money(Math.floor(totalCents / headCount))}，尾差 {money(totalCents % headCount)}{includeSelf ? "计入自己份额" : `计入 ${names[0]} 的份额`}。</p><div className="feature-row mt-3 border-t border-[#14344f]/5 pt-3 text-[11px]"><span className="text-[#667085]">向参与者收取</span><strong className="font-semibold text-[#14344f]">{money(totalCents - allocation.selfCents)}</strong></div></> : <p className="feature-caption mt-3!">填写总金额和参与者后，逐人展示精确到分的金额，每人至少分摊 0.01 元。</p>}</div>
      {error && <p className="feature-error" role="alert">{error}</p>}<p className="feature-caption mt-3!">{isDemo ? "创建后仅可模拟到账，不会向参与者发送通知。" : "草稿不会提交银行或发给参与者，离开页面后不保留。"}</p>
    </FeatureSheet>}

    {sheet === "detail" && selected && <FeatureSheet title="AA 收款详情" onClose={close} footer={<PrimaryButton onClick={close}>完成</PrimaryButton>}>
      <div className="feature-row"><h3 className="m-0 break-all">{selected.title}</h3><Pill tone="neutral">{isDemo ? "演示 AA" : "待提交草稿"}</Pill></div><p className="feature-number text-[#14344f]">{money(selected.totalCents)}</p><p className="feature-caption">{selected.participants.length + (selected.includeSelf ? 1 : 0)} 人分摊 · {isDemo ? `已模拟收取 ${money(selected.participants.reduce((sum, participant) => sum + (participant.paid ? participant.amountCents : 0), 0))}` : "尚未提交收款请求"}</p>
      {notice && <p className="feature-note" role="status">{notice}</p>}
      <div className="my-4 space-y-4">{selected.includeSelf && <div className="feature-row"><div className="feature-row-start"><span className="feature-icon"><Wallet size={15} /></span><div><h3 className="m-0">我自己</h3><p className="feature-caption">含尾差 · 无需收取</p></div></div><strong className="text-[12px] font-medium">{money(selected.selfCents)}</strong></div>}{selected.participants.map(participant => <div className="feature-row" key={participant.id}><div className="feature-row-start min-w-0"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white bg-[#1a7f9e]/5 text-[11px] text-[#1a7f9e]">{participant.name.slice(0, 1)}</span><div className="min-w-0"><h3 className="m-0 break-all">{participant.name}</h3><p className="feature-caption">{money(participant.amountCents)}</p></div></div>{isDemo ? participant.paid ? <Pill tone="green"><Check size={10} />模拟已到账</Pill> : <button type="button" disabled={loading} className="feature-secondary shrink-0 disabled:opacity-40" aria-label={`模拟${participant.name}到账${money(participant.amountCents)}`} onClick={() => { if (isDemo && !loading) markDemoSplitPaid(selected.id, participant.id); }}>模拟到账</button> : <Pill tone="neutral">待提交</Pill>}</div>)}</div>
      <div className="feature-note">{selected.includeSelf ? "尾差已计入自己的份额，参与者按列表金额分摊。" : `尾差计入第一位参与者 ${selected.participants[0]?.name} 的份额。`}{isDemo ? "模拟到账会更新演示余额与 AA 进度，不产生真实入账。" : "这是当前页面的本地草稿，尚未向银行提交，也未通知参与者。"}</div>
    </FeatureSheet>}
  </FeatureShell>;
}
