import { AnimatePresence, motion } from "framer-motion";
import { Home, Sparkles, User } from "lucide-react";
import { useState } from "react";
import AgentPage from "./AgentPage";
import HomePage from "./HomePage";
import ProfilePage from "./ProfilePage";
import { glass } from "./theme";

function StatusBar() {
  return (
    <div className="flex items-center justify-between px-8 pt-[14px] text-[12px] font-semibold" style={{ color: "#344054" }}>
      <span>9:41</span>
      <div className="flex items-center gap-1.5">
        <span className="flex items-end gap-[2px]">
          {[3, 5, 7, 9].map((h) => (
            <span key={h} className="w-[3px] rounded-sm" style={{ height: h, background: "#344054" }} />
          ))}
        </span>
        <svg width="14" height="11" viewBox="0 0 16 12" fill="#344054">
          <path d="M8 9.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM8 5.5c-1.8 0-3.4.7-4.6 1.9l1.4 1.4A4.5 4.5 0 0 1 8 7.5c1.2 0 2.3.5 3.2 1.3l1.4-1.4A6.4 6.4 0 0 0 8 5.5zM8 1C5 1 2.2 2.1 0 4l1.4 1.4A9.9 9.9 0 0 1 8 3c2.5 0 4.8 1 6.6 2.5L16 4C13.8 2.1 11 1 8 1z" transform="translate(0,-1)" />
        </svg>
        <span className="ml-0.5 h-[11px] w-[22px] rounded-[4px] border p-[2px]" style={{ borderColor: "#344054" }}>
          <span className="block h-full w-3/4 rounded-[2px]" style={{ background: "#344054" }} />
        </span>
      </div>
    </div>
  );
}

const TABS = [
  { key: "home", icon: Home, label: "首页" },
  { key: "agent", icon: Sparkles, label: "Agent" },
  { key: "me", icon: User, label: "我的" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function BankApp() {
  const [tab, setTab] = useState<TabKey>("home");

  return (
    <div
      className="relative flex h-full items-center justify-center overflow-clip"
      style={{ background: "linear-gradient(145deg,#e2e8f0 0%,#d4dde6 50%,#c8d4de 100%)" }}
    >
      {/* 背景光晕装饰 */}
      <div
        className="pointer-events-none absolute left-[-20%] top-[-10%] h-[70%] w-[80%] rounded-full opacity-30 blur-[100px]"
        style={{ background: "linear-gradient(135deg,#f0f4f8,#e8eef4)" }}
      />
      <div
        className="pointer-events-none absolute bottom-[-10%] right-[-20%] h-[60%] w-[70%] rounded-full opacity-25 blur-[100px]"
        style={{ background: "linear-gradient(135deg,#e2e8f0,#d8e0ea)" }}
      />

      {/* 手机壳 */}
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 26 }}
        id="phone-frame"
        className="relative overflow-clip rounded-[48px]"
        style={{
          height: "min(844px, 94vh)",
          width: "min(390px, 94vw)",
          background: "linear-gradient(155deg,#f7f5f3 0%,#efedea 35%,#e9e7e4 100%)",
          boxShadow:
            "0 40px 90px -20px rgba(16,24,40,0.35), inset 0 0 0 2px rgba(255,255,255,0.6)",
          border: "1px solid rgba(255,255,255,0.4)",
        }}
      >
        {/* ===== 柔光氛围层：斜向光束 + 暖雾 ===== */}
        <div className="pointer-events-none absolute inset-0">
          {/* 主光束：左上斜照进来的宽幅柔光 */}
          <div
            className="absolute -left-[40%] -top-[25%] h-[75%] w-[160%]"
            style={{
              background:
                "linear-gradient(100deg, transparent 15%, rgba(255,255,255,0.95) 42%, rgba(219,234,254,0.55) 52%, rgba(255,255,255,0.7) 60%, transparent 80%)",
              filter: "blur(36px)",
              transform: "rotate(-18deg)",
            }}
          />
          {/* 顶部冷蓝反光 */}
          <div
            className="absolute -top-[10%] right-[-20%] h-[40%] w-[70%] rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(186,209,235,0.5) 0%, rgba(186,209,235,0) 70%)",
              filter: "blur(45px)",
            }}
          />
          {/* 中部偏右暖米光 */}
          <div
            className="absolute right-[-15%] top-[35%] h-[40%] w-[65%] rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(240,232,220,0.65) 0%, rgba(240,232,220,0) 70%)",
              filter: "blur(50px)",
            }}
          />
          {/* 底部淡青反光 */}
          <div
            className="absolute bottom-[-12%] left-[-10%] h-[38%] w-[75%] rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(203,226,232,0.45) 0%, rgba(203,226,232,0) 70%)",
              filter: "blur(50px)",
            }}
          />
          {/* 缓慢漂浮的呼吸光 */}
          <motion.div
            className="absolute left-[15%] top-[25%] h-[30%] w-[50%] rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 70%)",
              filter: "blur(40px)",
            }}
            animate={{ x: [0, 24, 0], y: [0, -16, 0], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        {/* 刘海 */}
        <div className="absolute left-1/2 top-2.5 z-40 h-[24px] w-[104px] -translate-x-1/2 rounded-full bg-black" />

        <div className="relative flex h-full flex-col">
          <StatusBar />

          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="relative flex min-h-0 flex-1 flex-col"
            >
              {tab === "home" && <HomePage />}
              {tab === "agent" && <AgentPage />}
              {tab === "me" && <ProfilePage />}
            </motion.div>
          </AnimatePresence>

          {/* Tab Bar（玻璃底栏） */}
          <div className="relative z-30 flex items-center justify-around px-8 pb-6 pt-2.5" style={glass.nav}>
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <motion.button
                  key={t.key}
                  whileTap={{ scale: 0.88 }}
                  onClick={() => setTab(t.key)}
                  className="relative flex flex-col items-center gap-1 px-3 py-1"
                >
                  {active && (
                    <motion.span
                      layoutId="tab-pill"
                      transition={{ type: "spring", stiffness: 420, damping: 32 }}
                      className="absolute -inset-x-1 inset-y-0 rounded-full"
                      style={{ background: "rgba(20,52,79,0.06)" }}
                    />
                  )}
                  <motion.span
                    className="relative z-10"
                    animate={{ scale: active ? 1.12 : 1, y: active ? -1 : 0 }}
                    transition={{ type: "spring", stiffness: 420, damping: 26 }}
                  >
                    <t.icon
                      size={20}
                      strokeWidth={active ? 2.2 : 1.5}
                      style={{ color: active ? "#14344f" : "#98a2b3" }}
                    />
                  </motion.span>
                  <span
                    className="relative z-10 text-[9.5px] font-semibold"
                    style={{ color: active ? "#14344f" : "#98a2b3" }}
                  >
                    {t.label}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
