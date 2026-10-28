import { ChevronLeft, ChevronRight, Cpu, Globe2, Landmark, LockKeyhole, Nfc, ShieldAlert, ShieldCheck, SlidersHorizontal, Snowflake, Smartphone, UnlockKeyhole } from "lucide-react";
import { useState } from "react";
import { formatMoney, toNumber, type BankCard } from "../../api/bank";
import { useFeatureData, type CardSettings } from "./featureData";
import { EmptyState, FeatureSheet, FeatureShell, GlassCard, Pill, PrimaryButton, Stat } from "./FeatureUI";

type Sheet = "limits" | "channels" | "freeze" | "lost" | "details" | null;
const channelItems = [
  { key: "online", label: "线上支付", note: "网购、App 内付款", icon: Smartphone },
  { key: "overseas", label: "境外交易", note: "境外商户及跨境支付", icon: Globe2 },
  { key: "atm", label: "ATM 取现", note: "自助设备现金提取", icon: Landmark },
  { key: "quickpass", label: "小额免密", note: "小额交易无需输入密码", icon: Nfc },
] as const;

function settingsFor(card: BankCard): CardSettings {
  return { singleLimit: Math.round(toNumber(card.limit) * 100), dailyLimit: 2000000, online: true, overseas: false, atm: false, quickpass: false };
}

function normalizedStatus(card: BankCard) {
  const status = card.status.toLowerCase();
  return status === "reported_lost" || status === "lost" ? "lost" : status === "frozen" ? "frozen" : "active";
}

export default function CardsPage() {
  const { cards, isDemo, updateDemoCard, cardSettings, updateDemoCardSettings } = useFeatureData();
  const [index, setIndex] = useState(0);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [single, setSingle] = useState("");
  const [daily, setDaily] = useState("");
  const [draft, setDraft] = useState<CardSettings | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [events, setEvents] = useState<{ id: number; text: string; last4: string }[]>([]);
  const card = cards[Math.min(index, cards.length - 1)];
  if (!card) return <FeatureShell title="银行卡管理" subtitle="CARDS & CONTROL"><GlassCard><EmptyState title="暂无银行卡" body="账户关联的银行卡将在这里显示。" /></GlassCard></FeatureShell>;
  const settings = cardSettings[card.id] ?? settingsFor(card);
  const status = normalizedStatus(card);
  const last4 = card.id.slice(-4);
  const statusText = status === "lost" ? "已挂失" : status === "frozen" ? "已冻结" : "使用中";
  const isLost = status === "lost";
  const protectedChannels = channelItems.filter(item => !settings[item.key]).length;

  function open(value: Sheet) {
    setError("");
    setDraft({ ...settings });
    setSingle((settings.singleLimit / 100).toFixed(2));
    setDaily((settings.dailyLimit / 100).toFixed(2));
    setSheet(value);
  }

  function record(text: string) {
    setNotice(`${text}，仅更新本次演示状态。`);
    setEvents(old => [{ id: Date.now(), text, last4 }, ...old]);
    setSheet(null);
  }

  function liveDraft() {
    setNotice("操作草稿已查看。当前接口尚未提供安全审批，本次未修改银行卡。");
    setSheet(null);
  }

  function changeStatus(next: "active" | "frozen" | "reported_lost") {
    if (!isDemo) { liveDraft(); return; }
    updateDemoCard({ ...card, status: next });
    record(next === "frozen" ? "演示卡已冻结" : next === "active" ? "演示卡已解冻" : "演示卡已挂失");
  }

  function saveLimits() {
    if (!/^\d+(\.\d{1,2})?$/.test(single) || !/^\d+(\.\d{1,2})?$/.test(daily)) { setError("请输入大于零、最多两位小数的金额"); return; }
    const singleCents = Math.round(Number(single) * 100), dailyCents = Math.round(Number(daily) * 100);
    if (!Number.isSafeInteger(singleCents) || !Number.isSafeInteger(dailyCents) || singleCents <= 0 || dailyCents < singleCents) { setError("单笔限额须大于零，且不能超过日累计限额"); return; }
    if (!isDemo) { liveDraft(); return; }
    updateDemoCardSettings(card.id, { ...settings, singleLimit: singleCents, dailyLimit: dailyCents });
    updateDemoCard({ ...card, limit: (singleCents / 100).toFixed(2) });
    record("演示限额已更新");
  }

  function saveChannels() {
    if (!draft) return;
    if (!isDemo) { liveDraft(); return; }
    updateDemoCardSettings(card.id, draft);
    record("演示渠道设置已更新");
  }

  return <FeatureShell title="银行卡管理" subtitle="CARDS & CONTROL">
    <div className="feature-row"><span className="feature-label">我的银行卡 · {cards.length} 张</span><Pill tone={isLost ? "red" : status === "frozen" ? "amber" : "green"}>{statusText}</Pill></div>
    <button type="button" aria-label={`查看尾号 ${last4} 银行卡详情`} onClick={() => open("details")} className="relative w-full overflow-hidden rounded-[25px] border border-white/50 p-5 text-left text-white shadow-lg" style={{ background: index % 2 ? "linear-gradient(125deg,#758782,#4e6869)" : "linear-gradient(125deg,#294b63,#142d43)", boxShadow: "0 14px 28px rgba(20,52,79,.17)" }}>
      <div className="feature-row"><span className="text-[14px] font-bold tracking-tight">BankSense</span><span className="text-[9px] text-white/65">{card.card_type === "credit" ? "信用卡" : "储蓄卡"} · {isDemo ? "演示" : "Mock Bank"}</span></div>
      <div className="mt-6 flex items-center gap-3 text-white/65"><Cpu size={29} strokeWidth={1} /><Nfc size={19} strokeWidth={1.2} /></div>
      <p className="mb-4 mt-3 text-[21px] tracking-[.15em] text-white/95">••••　••••　{last4}</p>
      <div className="feature-row text-[9px] text-white/65"><span>关联账户 {card.account_id}</span><span className="flex items-center gap-1"><ShieldCheck size={11} />{statusText}</span></div>
    </button>

    {cards.length > 1 && <div className="feature-row px-1"><button type="button" className="feature-secondary" aria-label="上一张银行卡" onClick={() => setIndex((index + cards.length - 1) % cards.length)}><ChevronLeft size={13} /></button><div className="flex gap-2">{cards.map((c, i) => <button key={c.id} type="button" aria-label={`选择尾号 ${c.id.slice(-4)}`} aria-pressed={i === index} onClick={() => setIndex(i)} className="h-1.5 rounded-full transition-all" style={{ width: i === index ? 18 : 6, background: i === index ? "#14344f" : "#cbd1d8" }} />)}</div><button type="button" className="feature-secondary" aria-label="下一张银行卡" onClick={() => setIndex((index + 1) % cards.length)}><ChevronRight size={13} /></button></div>}

    {notice && <div className="feature-note" role="status">{notice}</div>}

    <GlassCard><div className="feature-row"><h2>支付限额</h2><button type="button" className="feature-link" disabled={isLost} onClick={() => open("limits")}>管理限额<ChevronRight className="inline" size={11} /></button></div><hr className="feature-divider" /><div className="feature-stat-grid"><Stat label="单笔限额" value={formatMoney(settings.singleLimit / 100)} /><Stat label={isDemo ? "日累计限额 · 示例" : "日累计限额"} value={isDemo ? formatMoney(settings.dailyLimit / 100) : "待同步"} /></div><p className="feature-caption">限额同时约束刷卡及绑定账户的对外转账。</p></GlassCard>

    <GlassCard>
      <div className="feature-row"><h2>卡片服务</h2><Pill tone="neutral">安全管理</Pill></div>
      <div className="mt-4 grid grid-cols-3 gap-3">{[
        { key: "freeze" as const, label: status === "frozen" ? "解除冻结" : "临时冻结", icon: status === "frozen" ? UnlockKeyhole : Snowflake, color: "#1a7f9e", bg: "rgba(26,127,158,.08)" },
        { key: "channels" as const, label: "渠道开关", icon: SlidersHorizontal, color: "#8d6caa", bg: "rgba(141,108,170,.08)" },
        { key: "lost" as const, label: "挂失卡片", icon: ShieldAlert, color: "#b27659", bg: "rgba(178,118,89,.08)" },
      ].map(action => <button key={action.key} type="button" disabled={isLost} onClick={() => open(action.key)} className="flex flex-col items-center gap-2 rounded-xl py-1 text-[10px] text-[#667085] transition-transform active:scale-95 disabled:opacity-35"><span className="grid h-11 w-11 place-items-center rounded-full border border-white/70" style={{ color: action.color, background: action.bg }}><action.icon size={19} strokeWidth={1.6} /></span>{action.label}</button>)}</div>
      {isLost && <p className="feature-caption">挂失不可撤销，该卡已停止使用。</p>}
    </GlassCard>

    <GlassCard><div className="feature-row"><div className="feature-row-start"><span className="feature-icon"><ShieldCheck size={18} /></span><div><h2>支付安全守护</h2><p className="feature-caption">{isDemo ? `${protectedChannels} 个非必要渠道已关闭` : "按需管理卡片的支付渠道"}</p></div></div><button type="button" className="feature-link" onClick={() => open("details")}>查看</button></div><p className="feature-note mt-4">{status === "frozen" ? "卡片冻结期间，刷卡及绑定账户的对外转账不可用；本人账户互转和已授权代扣不受影响。" : "不使用境外交易、ATM 或小额免密时，可保持关闭，让每一次支付都在你的掌控中。"}</p></GlassCard>

    <div className="feature-section-title"><h2>管理记录</h2><span>{events.length} 条演示操作</span></div>
    <GlassCard>{events.length ? <div className="space-y-4">{events.map(e => <div key={e.id} className="feature-row-start"><span className="feature-icon"><LockKeyhole size={15} /></span><div><h3>{e.text}</h3><p className="feature-caption">尾号 {e.last4} · 本次体验</p></div></div>)}</div> : <p className="feature-caption py-2 text-center">暂无管理记录，卡片设置变更后会显示在这里。</p>}</GlassCard>

    {sheet === "details" && <FeatureSheet title="银行卡详情" onClose={() => setSheet(null)} footer={<PrimaryButton onClick={() => setSheet(null)}>知道了</PrimaryButton>}><dl className="feature-definition"><div><dt>卡片</dt><dd>BankSense · 尾号 {last4}</dd></div><div><dt>卡类型</dt><dd>{card.card_type === "credit" ? "信用卡" : "借记卡"}</dd></div><div><dt>关联账户</dt><dd>{card.account_id}</dd></div><div><dt>状态</dt><dd>{statusText}</dd></div><div><dt>单笔限额</dt><dd>{formatMoney(settings.singleLimit / 100)}</dd></div><div><dt>日累计限额</dt><dd>{isDemo ? `${formatMoney(settings.dailyLimit / 100)}（示例）` : "当前接口未提供"}</dd></div></dl><p className="feature-note">冻结与挂失会限制绑定账户对外转账。实际操作以安全网关的预演与审批结果为准。</p></FeatureSheet>}

    {sheet === "limits" && <FeatureSheet title="管理支付限额" onClose={() => setSheet(null)} footer={<PrimaryButton onClick={saveLimits}>{isDemo ? "保存演示限额" : "查看操作草稿"}</PrimaryButton>}><p className="feature-caption">尾号 {last4} · 调高限额属于高风险操作，实际办理需要额外验证。</p><label htmlFor="card-single-limit">单笔限额（元）</label><input className="feature-input mb-4" id="card-single-limit" inputMode="decimal" value={single} onChange={e => { setSingle(e.target.value); setError(""); }} /><label htmlFor="card-daily-limit">日累计限额（元）</label><input className="feature-input" id="card-daily-limit" inputMode="decimal" value={daily} onChange={e => { setDaily(e.target.value); setError(""); }} />{error && <p className="feature-error" role="alert">{error}</p>}<p className="feature-note mt-4">{isDemo ? "本次仅预览并保存演示设置，不修改真实账户。" : "日累计限额尚未由当前接口提供；草稿不会提交执行。"}</p></FeatureSheet>}

    {sheet === "channels" && draft && <FeatureSheet title="支付渠道管理" onClose={() => setSheet(null)} footer={<PrimaryButton onClick={saveChannels}>{isDemo ? "保存演示设置" : "查看操作草稿"}</PrimaryButton>}><p className="feature-caption">尾号 {last4} · {isDemo ? "以下为演示渠道设置" : "以下开关仅为草稿，不代表银行当前状态"}</p><div className="space-y-6 py-3">{channelItems.map(item => <div key={item.key} className="feature-row"><div className="feature-row-start"><span className="feature-icon"><item.icon size={17} /></span><div><h3>{item.label}</h3><p className="feature-caption">{item.note}</p></div></div><button type="button" role="switch" aria-label={item.label} aria-checked={draft[item.key]} className="feature-toggle" onClick={() => setDraft({ ...draft, [item.key]: !draft[item.key] })}><span /></button></div>)}</div><p className="feature-note mt-4">开启任一渠道需更高等级验证；关闭渠道可以减少非必要支付入口。</p></FeatureSheet>}

    {sheet === "freeze" && <FeatureSheet title={status === "frozen" ? "解除卡片冻结" : "临时冻结卡片"} onClose={() => setSheet(null)} footer={<PrimaryButton onClick={() => changeStatus(status === "frozen" ? "active" : "frozen")}>{isDemo ? status === "frozen" ? "预览解冻结果" : "预览冻结结果" : "查看操作草稿"}</PrimaryButton>}><div className="feature-row mb-4"><h3>BankSense · 尾号 {last4}</h3><Pill tone={status === "frozen" ? "red" : "teal"}>{status === "frozen" ? "高风险操作" : "保护性操作"}</Pill></div><p className="feature-note">{status === "frozen" ? "解冻后将恢复刷卡和绑定账户对外转账能力。实际办理需要短信验证。" : "冻结后将暂停该卡刷卡及绑定账户对外转账。本人账户互转与已授权代扣不受影响，之后可申请解冻。"}</p><p className="feature-caption mt-4">{isDemo ? "当前仅更新演示卡状态，不会提交银行业务。" : "当前将展示操作草稿，不会直接修改卡片状态。"}</p></FeatureSheet>}

    {sheet === "lost" && <FeatureSheet title="挂失银行卡" onClose={() => setSheet(null)} footer={<PrimaryButton onClick={() => changeStatus("reported_lost")}>{isDemo ? "确认演示挂失" : "查看操作草稿"}</PrimaryButton>}><div className="feature-row mb-4"><span className="feature-icon" style={{ color: "#b42318", background: "rgba(180,35,24,.06)" }}><ShieldAlert size={21} /></span><Pill tone="red">不可撤销</Pill></div><h3>确定挂失尾号 {last4} 的银行卡？</h3><p className="feature-note mt-4">挂失后该卡将永久停止使用，不能通过解冻恢复。实际挂失需确认并完成短信验证。</p><p className="feature-caption mt-4">{isDemo ? "此操作只影响演示卡，本次体验中无法撤销。" : "当前接口未接入挂失审批，不会执行真实挂失。"}</p></FeatureSheet>}
  </FeatureShell>;
}
