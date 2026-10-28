import { useState } from "react";
import { Bell, BellOff, CalendarDays, Check, ChevronRight, Cloud, Dumbbell, Music2, Play, Repeat2, Search, Sparkles } from "lucide-react";
import type { Debit } from "../../api/bank";
import { formatMoney, toNumber } from "../../api/bank";
import { T } from "../theme";
import { EmptyState, FeatureShell, FeatureSheet, FeatureTabs, GlassCard, Pill, PrimaryButton, Stat } from "./FeatureUI";
import { useFeatureData } from "./featureData";
import { calendarDayValue as dayValue, subscriptionCostsCents } from "./featureAccounting";

const tabs = ["全部", "即将扣费", "已取消"] as const;
const dayMs = 86_400_000;
const dateLabel = (date: string) => {
  const value = dayValue(date);
  return Number.isFinite(value) ? new Date(value).toLocaleDateString("zh-CN", { month: "long", day: "numeric", timeZone: "UTC" }) : "日期待同步";
};
const annualCost = (debit: Debit) => subscriptionCostsCents(debit.amount, debit.frequency).annual / 100;
const periodLabel = (debit: Debit) => debit.frequency === "weekly" ? "周" : debit.frequency === "monthly" ? "月" : "期";
const serviceStyle = (debit: Debit) => {
  if (/视频|video/i.test(debit.merchant)) return { Icon: Play, color: "#b54762", background: "rgba(181,71,98,.09)", category: "影音娱乐" };
  if (/音乐|music/i.test(debit.merchant)) return { Icon: Music2, color: "#7a5da8", background: "rgba(122,93,168,.09)", category: "音乐会员" };
  if (/健身|gym/i.test(debit.merchant)) return { Icon: Dumbbell, color: T.amber, background: T.amberSoft, category: "运动健康" };
  if (/云|cloud/i.test(debit.merchant)) return { Icon: Cloud, color: T.teal, background: T.tealSoft, category: "云端服务" };
  return { Icon: Repeat2, color: T.teal, background: T.tealSoft, category: "自动扣款" };
};

export default function SubscriptionsPage() {
  const { debits, account, isDemo, loading, cancelledIds, cancelDemoSubscription } = useFeatureData();
  const [tab, setTab] = useState<string>("全部");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [reminders, setReminders] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const today = isDemo ? "2026-10-29" : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const todayValue = dayValue(today);
  const isCancelled = (debit: Debit) => cancelledIds.includes(debit.id) || /^(cancelled|canceled)$/i.test(debit.status);
  const active = debits.filter(debit => !isCancelled(debit) && debit.status === "active");
  const totalYearly = active.reduce((sum, debit) => sum + annualCost(debit), 0);
  const totalMonthly = active.reduce((sum, debit) => sum + subscriptionCostsCents(debit.amount, debit.frequency).monthly, 0) / 100;
  const upcoming = active.filter(debit => {
    const days = (dayValue(debit.next_charge_at) - todayValue) / dayMs;
    return days >= 1 && days <= 7;
  }).sort((a, b) => dayValue(a.next_charge_at) - dayValue(b.next_charge_at));
  const cancelled = debits.filter(isCancelled);
  const source = tab === "即将扣费" ? upcoming : tab === "已取消" ? cancelled : debits.filter(debit => !isCancelled(debit));
  const visible = source.filter(debit => debit.merchant.toLowerCase().includes(query.trim().toLowerCase()));
  const selected = debits.find(debit => debit.id === selectedId);
  const idle = isDemo ? active.find(debit => debit.id === "sub_gym") : undefined;
  const closeSheet = () => { setSelectedId(null); setConfirming(false); setDraftReady(false); };
  const openDetails = (debit: Debit, cancel = false) => { setSelectedId(debit.id); setConfirming(cancel); setDraftReady(false); };
  const toggleReminder = (debit: Debit) => {
    const enabled = reminders.includes(debit.id);
    setReminders(ids => enabled ? ids.filter(id => id !== debit.id) : [...ids, debit.id]);
    setNotice(enabled ? "已关闭应用内演示提醒" : "已开启应用内演示提醒，仅在当前页面展示，不发送通知。");
  };
  const confirmCancel = () => {
    if (!selected) return;
    if (!isDemo) { setDraftReady(true); return; }
    cancelDemoSubscription(selected.id);
    setReminders(ids => ids.filter(id => id !== selected.id));
    setNotice(`${selected.merchant}已演示取消，演示中后续不再自动扣费。`);
    closeSheet();
  };
  const accountLabel = (debit: Debit) => `${account?.id === debit.account_id ? "主账户" : "账户"} · ${debit.account_id}`;

  return <FeatureShell title="订阅管理" subtitle="RECURRING & ROUTINE">
    <GlassCard style={{ position: "relative", overflow: "hidden", padding: 21 }}>
      <div aria-hidden="true" style={{ position: "absolute", right: -25, top: -35, width: 150, height: 150, borderRadius: "50%", border: "22px solid rgba(26,127,158,.04)" }} />
      <div className="feature-row">
        <p className="feature-label">每月订阅支出</p>
        <Pill><Repeat2 size={9} /> 自动续费概览</Pill>
      </div>
      <p className="feature-number" style={{ margin: "12px 0 5px", fontSize: 36 }}>{formatMoney(totalMonthly)}<span style={{ fontSize: 10, color: T.faint, letterSpacing: 0, marginLeft: 6 }}>/ 月</span></p>
      <p className="feature-caption">把每一笔固定支出，安排得明明白白。</p>
      <hr className="feature-divider" />
      <div className="feature-stat-grid">
        <Stat label="年度费用预估" value={formatMoney(totalYearly)} note="按现有订阅周期折算" />
        <Stat label="正在订阅" value={<>{active.length}<span style={{ fontSize: 10, color: T.faint, marginLeft: 4 }}>项服务</span></>} note={`${upcoming.length} 项将在 7 天内扣费`} />
      </div>
      {active.some(debit => !["weekly", "monthly"].includes(debit.frequency)) && <p className="feature-caption">未知周期的订阅未计入费用预估。</p>}
    </GlassCard>

    {idle && <GlassCard style={{ background: "rgba(255,250,240,.45)", padding: 15 }}>
      <div className="feature-row-start" style={{ alignItems: "flex-start" }}>
        <span className="feature-icon" style={{ background: T.amberSoft, color: T.amber, width: 31, height: 31 }}><Sparkles size={15} /></span>
        <div style={{ flex: 1 }}>
          <div className="feature-row"><h2>给闲置订阅松松绑</h2><Pill tone="amber">演示洞察</Pill></div>
          <p className="feature-caption">城市健身在示例中被设为低频使用。若已不需要，每月可省 {formatMoney(toNumber(idle.amount))}。</p>
          <button className="feature-link" type="button" onClick={() => openDetails(idle)}>查看这项订阅 <ChevronRight size={10} style={{ verticalAlign: "middle" }} /></button>
        </div>
      </div>
    </GlassCard>}

    <div className="feature-section-title"><h2>扣费日历</h2><span>{isDemo ? "演示基准日 10 月 29 日" : `截至 ${dateLabel(today)}`}</span></div>
    <GlassCard style={{ padding: 14 }}>
      <div className="feature-row" style={{ marginBottom: 12 }}><span className="feature-row-start" style={{ gap: 6, fontSize: 11, fontWeight: 600 }}><CalendarDays size={13} color={T.teal} />未来 7 天</span><span style={{ fontSize: 10, color: T.sub }}>{formatMoney(upcoming.reduce((sum, debit) => sum + toNumber(debit.amount), 0))}</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 5 }}>
        {Array.from({ length: 7 }, (_, index) => {
          const value = todayValue + (index + 1) * dayMs;
          const date = new Date(value);
          const hasCharge = upcoming.some(debit => dayValue(debit.next_charge_at) === value);
          return <div key={value} style={{ textAlign: "center", padding: "7px 0", borderRadius: 12, background: hasCharge ? T.tealSoft : "rgba(255,255,255,.3)", color: hasCharge ? T.teal : T.sub }}>
            <div style={{ fontSize: 8, opacity: .75 }}>{date.toLocaleDateString("zh-CN", { weekday: "short", timeZone: "UTC" }).replace("周", "")}</div>
            <div style={{ fontSize: 12, fontWeight: 650, marginTop: 4 }}>{date.getUTCDate()}</div>
            <span style={{ display: "block", width: 3, height: 3, margin: "4px auto 0", borderRadius: "50%", background: hasCharge ? T.teal : "transparent" }} />
          </div>;
        })}
      </div>
      <p className="feature-caption">{upcoming[0] ? `下一笔：${dateLabel(upcoming[0].next_charge_at)} · ${upcoming[0].merchant}` : "这 7 天暂无计划扣费，安心安排日常。"}</p>
      {upcoming.length > 0 && <button type="button" className="feature-link" onClick={() => { setTab("即将扣费"); setQuery(""); }}>查看即将扣费的 {upcoming.length} 项服务 <ChevronRight size={10} style={{ verticalAlign: "middle" }} /></button>}
    </GlassCard>

    <div className="feature-section-title"><h2>我的订阅</h2><span>{debits.length} 项记录</span></div>
    <FeatureTabs items={tabs} value={tab} onChange={setTab} />
    <label className="feature-search"><Search size={14} /><input aria-label="搜索订阅服务" placeholder="搜索服务名称" value={query} onChange={event => setQuery(event.target.value)} /></label>
    {notice && <div className="feature-success" role="status" style={{ padding: "10px 13px" }}><Check size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />{notice}</div>}
    {visible.map(debit => {
      const { Icon, color, background, category } = serviceStyle(debit);
      const cancelled = isCancelled(debit);
      const reminder = reminders.includes(debit.id);
      return <GlassCard key={debit.id} style={{ padding: 15 }}>
        <div className="feature-row" style={{ alignItems: "flex-start" }}>
          <div className="feature-row-start">
            <span className="feature-icon" style={{ color, background, borderRadius: 14, width: 40, height: 40 }}><Icon size={19} /></span>
            <div><h3>{debit.merchant}</h3><p className="feature-caption" style={{ marginTop: 3 }}>{category} · {debit.frequency === "weekly" ? "每周续费" : debit.frequency === "monthly" ? "每月续费" : debit.frequency}</p></div>
          </div>
          <div style={{ textAlign: "right" }}><strong style={{ fontSize: 16, letterSpacing: -.4 }}>{formatMoney(toNumber(debit.amount))}</strong><span style={{ fontSize: 9, color: T.faint }}> /{periodLabel(debit)}</span><div style={{ marginTop: 5 }}><Pill tone={cancelled ? "neutral" : debit.id === "sub_gym" && isDemo ? "amber" : debit.status === "active" ? "green" : "neutral"}>{cancelled ? cancelledIds.includes(debit.id) ? "演示取消" : "已取消" : debit.id === "sub_gym" && isDemo ? "低频 · 演示" : debit.status === "active" ? "订阅中" : debit.status}</Pill></div></div>
        </div>
        <hr className="feature-divider" style={{ margin: "12px 0 10px" }} />
        <div className="feature-row">
          <span style={{ color: T.faint, fontSize: 9 }}>{cancelled ? "后续不再自动扣费" : `${dateLabel(debit.next_charge_at)} 下次扣费`}</span>
          <div className="feature-row-start" style={{ gap: 10 }}>
            {!cancelled && debit.status === "active" && <button type="button" className="feature-link" aria-label={`${debit.merchant}${reminder ? "关闭" : "开启"}演示提醒`} aria-pressed={reminder} onClick={() => toggleReminder(debit)}>{reminder ? <Bell size={13} /> : <BellOff size={13} />}</button>}
            <button type="button" className="feature-link" onClick={() => openDetails(debit)}>详情</button>
            {!cancelled && debit.status === "active" && <button type="button" className="feature-link" style={{ color: T.sub }} onClick={() => openDetails(debit, true)}>取消</button>}
          </div>
        </div>
      </GlassCard>;
    })}
    {!visible.length && <GlassCard><EmptyState title={loading ? "正在同步订阅" : query.trim() ? "没有找到这项服务" : tab === "已取消" ? "暂无已取消订阅" : "暂无订阅记录"} body={query.trim() ? "试试其他服务名称，或清空搜索内容。" : "订阅记录会在这里展示，你可以随时查看费用与扣费日期。"} /></GlassCard>}
    <p className="feature-caption" style={{ textAlign: "center", margin: 0 }}>月费按年费 ÷ 12 折算；周订阅按每年 52 周估算。<br />铃铛仅用于应用内演示提醒，不会发送系统通知。</p>

    {selected && <FeatureSheet title={confirming ? draftReady ? "取消操作草稿" : "确认取消订阅" : "订阅详情"} onClose={closeSheet} footer={draftReady ? <PrimaryButton onClick={closeSheet}>知道了</PrimaryButton> : confirming ? <div style={{ display: "grid", gap: 9 }}><PrimaryButton onClick={confirmCancel}>{isDemo ? "确认演示取消" : "生成取消操作草稿"}</PrimaryButton><button type="button" className="feature-secondary" onClick={() => setConfirming(false)}>保留订阅</button></div> : !isCancelled(selected) && selected.status === "active" ? <PrimaryButton onClick={() => setConfirming(true)}>取消这项订阅</PrimaryButton> : undefined}>
      <div className="feature-row-start" style={{ marginBottom: 17 }}>{(() => { const { Icon, color, background } = serviceStyle(selected); return <span className="feature-icon" style={{ color, background }}><Icon size={18} /></span>; })()}<div><h3 style={{ margin: 0 }}>{selected.merchant}</h3><p className="feature-caption">{formatMoney(toNumber(selected.amount))} / {periodLabel(selected)}</p></div></div>
      <dl className="feature-definition">
        <div><dt>扣费周期</dt><dd>{selected.frequency === "weekly" ? "每周" : selected.frequency === "monthly" ? "每月" : selected.frequency}</dd></div>
        <div><dt>扣费账户</dt><dd>{accountLabel(selected)}</dd></div>
        <div><dt>下次扣费</dt><dd>{isCancelled(selected) ? "已取消后续扣费" : dateLabel(selected.next_charge_at)}</dd></div>
        <div><dt>年度费用预估</dt><dd>{["weekly", "monthly"].includes(selected.frequency) ? formatMoney(annualCost(selected)) : "周期待确认"}</dd></div>
        <div><dt>当前状态</dt><dd>{isCancelled(selected) ? cancelledIds.includes(selected.id) ? "演示取消" : "已取消" : selected.status === "active" ? "订阅中" : selected.status}</dd></div>
      </dl>
      {confirming ? <div className={draftReady ? "feature-success" : "feature-note"}>
        {draftReady ? <>已生成当前页面的操作草稿：取消「{selected.merchant}」的自动扣费。<br />需要安全网关授权并确认执行，当前订阅仍然有效，尚未修改真实账户。</> : isDemo ? <>确认后，此服务将在演示中取消，后续不再自动扣费；已发生的费用不会退回。<br />此操作仅更新示例状态，不修改真实账户或服务商会员。</> : <>取消后预计停止后续自动扣费，已扣款项与会员权益需以服务商规则为准。<br />当前页面尚未接入取消执行接口，可先生成操作草稿，等待安全网关授权。</>}
      </div> : !isCancelled(selected) && selected.status === "active" ? <div className="feature-note"><div className="feature-row"><span>应用内演示提醒</span><button type="button" role="switch" aria-label={`${selected.merchant}应用内演示提醒`} aria-checked={reminders.includes(selected.id)} className="feature-toggle" onClick={() => toggleReminder(selected)}><span /></button></div><p className="feature-caption">仅当前页面演示，不发送推送或短信。</p>{reminders.includes(selected.id) && <span style={{ color: T.teal }}>已开启应用内演示提醒</span>}</div> : <div className="feature-note">这项订阅已从后续费用预估中移除。</div>}
    </FeatureSheet>}
  </FeatureShell>;
}
