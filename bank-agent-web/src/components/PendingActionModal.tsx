import { AnimatePresence, motion } from "framer-motion";
import { ShieldAlert, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PendingAction } from "../types";

interface Props {
  pending: PendingAction | null;
  onConfirm: (otp?: string) => void;
  onCancel: () => void;
}

const OTP_LEN = 6;
const DEMO_HINT = "240816";

export function PendingActionModal({ pending, onConfirm, onCancel }: Props) {
  const [digits, setDigits] = useState<string[]>(Array(OTP_LEN).fill(""));
  const [shake, setShake] = useState(false);
  const [error, setError] = useState("");
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const isRed = pending?.risk === "red";

  useEffect(() => {
    if (pending) {
      setDigits(Array(OTP_LEN).fill(""));
      setError("");
      if (pending.requiresOtp) {
        setTimeout(() => inputsRef.current[0]?.focus(), 250);
      }
    }
  }, [pending?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDigit = (i: number, v: string) => {
    if (!/^\d?$/.test(v)) return;
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    setError("");
    if (v && i < OTP_LEN - 1) inputsRef.current[i + 1]?.focus();
    if (v && i === OTP_LEN - 1) {
      const code = next.join("");
      if (code.length === OTP_LEN) submitOtp(code);
    }
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputsRef.current[i - 1]?.focus();
    }
  };

  const submitOtp = (code: string) => {
    if (code === DEMO_HINT) {
      onConfirm(code);
    } else {
      setError("验证码错误，已记录本次失败（连续失败将触发安全锁定）");
      setShake(true);
      setDigits(Array(OTP_LEN).fill(""));
      setTimeout(() => {
        setShake(false);
        inputsRef.current[0]?.focus();
      }, 500);
    }
  };

  return (
    <AnimatePresence>
      {pending && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* 遮罩 */}
          <motion.div
            className="absolute inset-0 bg-ink-950/70 backdrop-blur-md"
            onClick={onCancel}
          />

          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            className="glass relative w-full max-w-md overflow-hidden rounded-3xl p-6"
          >
            {/* 顶部风险色带 */}
            <div
              className={`absolute inset-x-0 top-0 h-1 ${
                isRed
                  ? "bg-gradient-to-r from-risk-500 via-risk-400 to-risk-500"
                  : "bg-gradient-to-r from-warn-500 via-warn-400 to-warn-500"
              }`}
            />

            <button
              onClick={onCancel}
              className="absolute right-4 top-4 rounded-full p-1.5 text-slate-500 transition hover:bg-white/5 hover:text-slate-300"
            >
              <X size={16} />
            </button>

            <div className="mb-5 flex items-center gap-3">
              <motion.span
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                  isRed ? "bg-risk-500/15 text-risk-400" : "bg-warn-500/15 text-warn-400"
                }`}
              >
                {isRed ? <ShieldAlert size={22} /> : <ShieldCheck size={22} />}
              </motion.span>
              <div>
                <h3 className="text-base font-semibold text-slate-100">{pending.title}</h3>
                <p className="text-xs text-slate-500">{pending.description}</p>
              </div>
            </div>

            {/* 操作明细 */}
            <div className="mb-5 space-y-2.5 rounded-2xl border border-white/8 bg-ink-900/60 p-4">
              {pending.detail.map((d) => (
                <div key={d.label} className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">{d.label}</span>
                  <span className={`font-medium ${d.label.includes("金额") ? "text-aurora font-semibold" : "text-slate-200"}`}>
                    {d.value}
                  </span>
                </div>
              ))}
            </div>

            {/* 红色：OTP 输入 */}
            {isRed && (
              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs text-slate-400">
                    请输入发送至 138****5678 的验证码
                  </p>
                  <p className="font-mono text-[10px] text-slate-600">
                    演示模式：{DEMO_HINT}
                  </p>
                </div>
                <motion.div
                  animate={shake ? { x: [-8, 8, -6, 6, -3, 3, 0] } : {}}
                  transition={{ duration: 0.45 }}
                  className="flex justify-between gap-2"
                >
                  {digits.map((d, i) => (
                    <input
                      key={i}
                      ref={(el) => {
                        inputsRef.current[i] = el;
                      }}
                      value={d}
                      inputMode="numeric"
                      maxLength={1}
                      onChange={(e) => handleDigit(i, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(i, e)}
                      className={`h-12 w-11 rounded-xl border bg-ink-900/70 text-center font-mono text-lg font-semibold text-slate-100 outline-none transition-all ${
                        d
                          ? "border-risk-400/60 shadow-[0_0_16px_-4px_rgba(244,63,94,0.5)]"
                          : "border-white/10"
                      } focus:border-risk-400 focus:shadow-[0_0_20px_-4px_rgba(244,63,94,0.6)]`}
                    />
                  ))}
                </motion.div>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 text-[11px] text-risk-400"
                  >
                    {error}
                  </motion.p>
                )}
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] py-3 text-sm font-medium text-slate-300 transition hover:bg-white/[0.07]"
              >
                取消
              </button>
              {!isRed && (
                <button
                  onClick={() => onConfirm()}
                  className="flex-1 rounded-xl bg-gradient-to-r from-warn-500 to-gold-500 py-3 text-sm font-semibold text-ink-950 transition hover:brightness-110 active:scale-[0.98]"
                >
                  确认转账
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
