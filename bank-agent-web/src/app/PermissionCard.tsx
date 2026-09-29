import { AnimatePresence, motion } from "framer-motion";
import { Check, Delete, Lock, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { glass, Pressable, spring, T } from "./theme";

export type RiskLevel = "GREEN" | "YELLOW" | "RED";

export type ActionStatus =
  | "WAITING_CONFIRMATION"
  | "WAITING_STRONG_AUTH"
  | "SUCCEEDED"
  | "REJECTED"
  | "FAILED"
  | "EXPIRED"
  | "BLOCKED";

export type PermissionRequest = {
  tool: string;
  capability: string;
  summary: string;
  detail: { label: string; value: string }[];
  level: RiskLevel;
  requiresPassword: boolean;
  requiresTotp: boolean;
};

/** 用户在权限卡上的操作，由 AgentPage 转成一轮真实对话发给后端 Agent。 */
export type PermissionAction =
  | { kind: "confirm" }
  | { kind: "reject" }
  | { kind: "request-code" }
  | { kind: "verify"; code: string };

export const LEVEL: Record<
  RiskLevel,
  { text: string; soft: string; border: string; label: string; Icon: typeof Lock }
> = {
  GREEN: { text: "#067647", soft: "#dcfae6", border: "#75e0a7", label: "绿 · 自动执行", Icon: ShieldCheck },
  YELLOW: { text: "#b54708", soft: "#fef0c7", border: "#fec84b", label: "黄 · 需你确认", Icon: ShieldAlert },
  RED: { text: "#b42318", soft: "#fee4e2", border: "#fda29b", label: "红 · 强验证", Icon: Lock },
};

const STATUS_TEXT: Record<ActionStatus, string> = {
  WAITING_CONFIRMATION: "等待确认",
  WAITING_STRONG_AUTH: "等待强验证",
  SUCCEEDED: "已执行",
  REJECTED: "已取消",
  FAILED: "执行失败",
  EXPIRED: "已失效",
  BLOCKED: "被风控拦截",
};

// ---------- 6 位 OTP 分段输入 ----------
function OtpInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const setAt = (i: number, ch: string) => {
    const next = [...value];
    next[i] = ch;
    onChange(next);
  };

  return (
    <div className="flex justify-center gap-2">
      {value.map((c, i) => (
        <motion.div
          key={i}
          animate={{ scale: c ? 1.04 : 1 }}
          transition={spring}
          className="flex h-12 w-10 items-center justify-center rounded-[12px] text-[19px] font-bold"
          style={{
            color: T.navy,
            background: "rgba(255,255,255,0.7)",
            border: `1.5px solid ${c ? T.teal : "rgba(16,24,40,0.1)"}`,
            boxShadow: c ? `0 2px 10px ${T.tealSoft}` : "none",
          }}
        >
          <input
            id={`otp-${i}`}
            value={c}
            inputMode="numeric"
            maxLength={1}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "");
              if (!v) return setAt(i, "");
              setAt(i, v.slice(-1));
              if (i < 5) document.getElementById(`otp-${i + 1}`)?.focus();
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !value[i] && i > 0) {
                document.getElementById(`otp-${i - 1}`)?.focus();
              }
            }}
            onPaste={(e) => {
              const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
              if (!digits) return;
              e.preventDefault();
              const next = ["", "", "", "", "", ""];
              digits.split("").forEach((d, k) => (next[k] = d));
              onChange(next);
            }}
            className="h-full w-full bg-transparent text-center outline-none"
            style={{ color: T.navy }}
          />
        </motion.div>
      ))}
    </div>
  );
}

// ---------- 强验证弹层 ----------
function AuthSheet({
  req,
  live,
  demoOtp,
  onCancel,
  onRequestCode,
  onDone,
}: {
  req: PermissionRequest;
  live: boolean;
  demoOtp?: string | null;
  onCancel: () => void;
  onRequestCode?: () => void;
  onDone: (s: ActionStatus, code: string) => void;
}) {
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [pwd, setPwd] = useState("");
  const [phase, setPhase] = useState<"input" | "verifying" | "expired">("input");
  const [left, setLeft] = useState(60);
  const requested = useRef(false);

  // 真实后端用 OTPVerifier 只校验 6 位验证码；密码仅在本地演示流程中出现
  const needsPassword = req.requiresPassword && !live;
  const filled = code.every((c) => c) && (!needsPassword || pwd.length > 0);

  // 打开强验证弹层即向后端申请验证码（等价于对 Agent 说"发送验证码"）
  useEffect(() => {
    if (live && !demoOtp && !requested.current) {
      requested.current = true;
      onRequestCode?.();
    }
  }, [live, demoOtp, onRequestCode]);

  useEffect(() => {
    if (phase !== "input") return;
    const t = setInterval(() => {
      setLeft((v) => {
        if (v <= 1) {
          clearInterval(t);
          setPhase("expired");
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  function submit() {
    if (!filled || phase !== "input") return;
    if (live) {
      // 提交真实验证码后，状态由后端返回的"操作状态"驱动
      onDone("WAITING_STRONG_AUTH", code.join(""));
      return;
    }
    setPhase("verifying");
    setTimeout(() => onDone("SUCCEEDED", code.join("")), 1200);
  }

  useEffect(() => {
    if (filled && phase === "input") submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, pwd]);

  return (
    <motion.div
      className="absolute inset-0 z-50 flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-[#101828]/30 backdrop-blur-[4px]" onClick={onCancel} />

      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
        className="relative w-full rounded-t-[28px] px-5 pb-7 pt-5"
        style={{ ...glass.overlay, borderRadius: "28px 28px 0 0" }}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full" style={{ background: "rgba(16,24,40,0.15)" }} />

        <div className="flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full"
            style={{ background: LEVEL.RED.soft }}
          >
            <Lock size={16} style={{ color: LEVEL.RED.text }} />
          </span>
          <div className="flex-1">
            <p className="text-[14px] font-bold" style={{ color: T.ink }}>
              安全验证
            </p>
            <p className="text-[10.5px]" style={{ color: T.sub }}>
              {req.tool} · {req.capability}
            </p>
          </div>
          <Pressable
            className="flex h-7 w-7 items-center justify-center rounded-full"
            style={glass.pill}
            onClick={onCancel}
          >
            <X size={14} style={{ color: T.sub }} />
          </Pressable>
        </div>

        <p className="mt-3 rounded-[12px] px-3 py-2 text-[11px] leading-relaxed" style={{ ...glass.card, color: T.sub }}>
          {req.summary}
        </p>

        <AnimatePresence mode="wait">
          {phase === "expired" ? (
            <motion.div
              key="expired"
              initial={{ opacity: 0, x: 0 }}
              animate={{ opacity: 1, x: [0, -6, 6, -3, 0] }}
              exit={{ opacity: 0 }}
              className="mt-6 rounded-[14px] px-4 py-5 text-center"
              style={{ background: LEVEL.RED.soft }}
            >
              <p className="text-[13px] font-bold" style={{ color: LEVEL.RED.text }}>
                验证已超时失效
              </p>
              <p className="mt-1 text-[11px]" style={{ color: LEVEL.RED.text }}>
                为保护资金安全，请重新发起该操作
              </p>
            </motion.div>
          ) : phase === "verifying" ? (
            <motion.div key="verifying" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8 flex flex-col items-center gap-3">
              <motion.span
                className="h-9 w-9 rounded-full border-[3px]"
                style={{ borderColor: T.tealSoft, borderTopColor: T.teal }}
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
              />
              <p className="text-[11.5px]" style={{ color: T.sub }}>
                正在校验动态口令…
              </p>
            </motion.div>
          ) : (
            <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {needsPassword && (
                <>
                  <p className="mb-2 mt-4 text-[11px] font-semibold" style={{ color: T.sub }}>
                    登录密码
                  </p>
                  <input
                    type="password"
                    value={pwd}
                    onChange={(e) => setPwd(e.target.value)}
                    placeholder="请输入登录密码"
                    className="w-full rounded-[12px] px-3.5 py-3 text-[12.5px] outline-none"
                    style={{
                      background: "rgba(255,255,255,0.6)",
                      color: T.ink,
                      border: "1.5px solid rgba(16,24,40,0.1)",
                    }}
                  />
                </>
              )}

              <div className="mb-2 mt-4 flex items-baseline justify-between">
                <p className="text-[11px] font-semibold" style={{ color: T.sub }}>
                  {live ? "动态口令（演示环境）" : "动态口令（Google Authenticator）"}
                </p>
                <p className="text-[11px] font-semibold tabular-nums" style={{ color: left <= 10 ? LEVEL.RED.text : T.faint }}>
                  00:{String(left).padStart(2, "0")}
                </p>
              </div>
              <OtpInput value={code} onChange={setCode} />

              {live && (
                <div className="mt-2.5 flex items-center justify-center gap-1.5">
                  {demoOtp ? (
                    <>
                      <span className="text-[10px]" style={{ color: T.faint }}>
                        演示验证码
                      </span>
                      <span
                        className="rounded-full px-2.5 py-0.5 font-mono text-[11.5px] font-bold tracking-[0.25em]"
                        style={{ background: T.tealSoft, color: T.teal }}
                      >
                        {demoOtp}
                      </span>
                    </>
                  ) : (
                    <span className="flex items-center gap-1.5 text-[10px]" style={{ color: T.faint }}>
                      <motion.span
                        className="h-2.5 w-2.5 rounded-full border-[2px]"
                        style={{ borderColor: "rgba(16,24,40,0.12)", borderTopColor: T.teal }}
                        animate={{ rotate: 360 }}
                        transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                      />
                      正在向后端申请验证码…
                    </span>
                  )}
                </div>
              )}

              <div className="mt-4 flex items-center gap-3">
                <Pressable
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full py-3 text-[12.5px] font-semibold"
                  style={{ ...glass.card, color: T.sub }}
                  onClick={() => onDone("REJECTED", "")}
                >
                  <Delete size={14} />
                  取消操作
                </Pressable>
                <motion.div
                  className="flex-1"
                  animate={{ scale: filled ? 1 : 0.97, opacity: filled ? 1 : 0.45 }}
                  transition={spring}
                >
                  <Pressable
                    className="flex w-full items-center justify-center rounded-full py-3 text-[12.5px] font-semibold"
                    style={{ background: T.navy, color: "#fff" }}
                    onClick={submit}
                  >
                    验证并执行
                  </Pressable>
                </motion.div>
              </div>

              <p
                className="mt-3 text-center text-[10px]"
                style={{ color: !filled && needsPassword && !pwd ? LEVEL.RED.text : T.faint }}
              >
                {filled
                  ? "验证通过后自动提交 · 该操作将写入审计日志并上链存证"
                  : needsPassword && !pwd
                    ? "需先填写登录密码，再输入 6 位动态口令"
                    : "请输入完整的 6 位动态口令"}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

// ---------- 权限卡 ----------
export function PermissionCard({
  req,
  onAction,
  demoOtp,
  statusOverride,
}: {
  req: PermissionRequest;
  /** 传入后进入"真实后端"模式：按钮会转成一轮对话发给 Agent */
  onAction?: (action: PermissionAction) => void;
  /** 演示环境验证码（来自后端 otp_sender 回调） */
  demoOtp?: string | null;
  /** Agent 返回的"操作状态"驱动的最终状态，优先级高于本地乐观状态 */
  statusOverride?: ActionStatus;
}) {
  const live = Boolean(onAction);
  const [local, setLocal] = useState<ActionStatus>(
    req.level === "GREEN" ? "SUCCEEDED" : req.level === "RED" ? "WAITING_STRONG_AUTH" : "WAITING_CONFIRMATION",
  );
  const [sheet, setSheet] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.getElementById("phone-frame"));
  }, []);

  const status = statusOverride ?? local;
  const lv = LEVEL[req.level];
  const settled = status !== "WAITING_CONFIRMATION" && status !== "WAITING_STRONG_AUTH";
  const failed = status === "REJECTED" || status === "FAILED" || status === "EXPIRED" || status === "BLOCKED";

  function reject() {
    onAction?.({ kind: "reject" });
    setLocal("REJECTED");
  }

  function confirm() {
    onAction?.({ kind: "confirm" });
    setLocal("SUCCEEDED");
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        className="relative overflow-hidden rounded-[20px]"
        style={{
          ...glass.card,
          border: `1.5px solid ${settled ? (failed ? "rgba(16,24,40,0.1)" : lv.border) : lv.border}`,
          boxShadow: "0 4px 16px rgba(16,24,40,0.06)",
        }}
      >
        {/* 左侧权限色条 */}
        <motion.span
          className="absolute left-0 top-0 w-[3px]"
          style={{ background: failed ? T.faint : lv.text }}
          initial={{ height: 0 }}
          animate={{ height: "100%" }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        />

        <div className="p-3 pl-4">
          {/* 头部 */}
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: failed ? "rgba(16,24,40,0.06)" : lv.soft }}>
              <lv.Icon size={12} style={{ color: failed ? T.sub : lv.text }} />
            </span>
            <span className="text-[11px] font-bold" style={{ color: failed ? T.sub : lv.text }}>
              {lv.label}
            </span>
            <motion.span
              className="ml-auto max-w-[52%] truncate font-mono text-[9px]"
              style={{ color: T.faint }}
              animate={{ opacity: settled ? 0 : 1 }}
              transition={{ duration: 0.2 }}
            >
              {req.capability}
            </motion.span>
          </div>

          <p className="mt-2 text-[11.5px] leading-relaxed" style={{ color: T.ink }}>
            {req.summary}
          </p>

          {/* 明细 */}
          {req.detail.length > 0 && (
            <div className="mt-2.5 rounded-[12px] px-3 py-2" style={{ background: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.4)" }}>
              {req.detail.map((d, i) => (
                <motion.div
                  key={d.label}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.12 + i * 0.06 }}
                  className="flex items-baseline justify-between py-1"
                >
                  <span className="text-[10.5px]" style={{ color: T.sub }}>
                    {d.label}
                  </span>
                  <span className="text-[11px] font-semibold" style={{ color: T.ink }}>
                    {d.value}
                  </span>
                </motion.div>
              ))}
            </div>
          )}

          {/* 操作区 */}
          <div className="mt-2.5">
            <AnimatePresence mode="wait">
              {settled ? (
                <motion.div
                  key="settled"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-1.5"
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: failed ? T.faint : T.green }} />
                  <span className="text-[10.5px] font-semibold" style={{ color: failed ? T.sub : "#067647" }}>
                    {STATUS_TEXT[status]}
                  </span>
                  <span className="text-[10px]" style={{ color: T.faint }}>
                    · 已写入审计日志
                  </span>
                </motion.div>
              ) : (
                <motion.div key="actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex gap-2">
                  <Pressable
                    className="flex-1 rounded-full py-2 text-[11.5px] font-semibold"
                    style={{ background: "rgba(255,255,255,0.5)", color: T.sub, border: "1px solid rgba(16,24,40,0.08)" }}
                    onClick={reject}
                  >
                    取消
                  </Pressable>
                  <Pressable
                    className="flex flex-[1.4] items-center justify-center gap-1.5 rounded-full py-2 text-[11.5px] font-semibold"
                    style={{ background: req.level === "RED" ? lv.text : T.navy, color: "#fff" }}
                    onClick={() => (req.level === "RED" ? setSheet(true) : confirm())}
                  >
                    {req.level === "RED" && <Lock size={12} />}
                    {req.level === "RED" ? "验证并执行" : "确认执行"}
                  </Pressable>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* 盖章成功态 */}
        <AnimatePresence>
          {status === "SUCCEEDED" && req.level !== "GREEN" && (
            <motion.span
              initial={{ scale: 2.4, opacity: 0, rotate: -22 }}
              animate={{ scale: 1, opacity: 1, rotate: -8 }}
              transition={{ type: "spring", stiffness: 460, damping: 16 }}
              className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full"
              style={{ background: T.greenSoft, border: `1.5px solid ${T.green}` }}
            >
              <Check size={18} strokeWidth={3} style={{ color: T.green }} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>

      {host &&
        createPortal(
          <AnimatePresence>
            {sheet && (
              <AuthSheet
                key="auth"
                req={req}
                live={live}
                demoOtp={demoOtp}
                onCancel={() => setSheet(false)}
                onRequestCode={() => onAction?.({ kind: "request-code" })}
                onDone={(s, code) => {
                  setSheet(false);
                  if (!live) {
                    if (s === "SUCCEEDED") setTimeout(() => setLocal("SUCCEEDED"), 120);
                    else setLocal(s);
                    return;
                  }
                  if (s === "REJECTED") reject();
                  else if (code) onAction?.({ kind: "verify", code });
                }}
              />
            )}
          </AnimatePresence>,
          host,
        )}
    </>
  );
}
