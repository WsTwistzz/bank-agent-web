import type React from "react";
import { useEffect, useRef } from "react";
import { animate, motion } from "framer-motion";

// ---------- 磨砂玻璃设计系统 Token ----------
export const T = {
  bg: "linear-gradient(160deg,#f5f7fa 0%,#eef1f5 40%,#e8ecf1 100%)",
  card: "rgba(255,255,255,0.65)",
  cardSolid: "#ffffff",
  ink: "#101828",
  sub: "#667085",
  faint: "#98a2b3",
  line: "rgba(16,24,40,0.08)",
  navy: "#14344f",
  black: "#101828",
  teal: "#1a7f9e",
  tealSoft: "rgba(26,127,158,0.1)",
  green: "#12b76a",
  greenSoft: "rgba(18,183,106,0.12)",
  amber: "#b54708",
  amberSoft: "rgba(181,71,8,0.1)",
  red: "#b42318",
  redSoft: "rgba(180,35,24,0.1)",
} as const;

// ---------- 玻璃效果 ----------
export const glass = {
  panel: {
    background: "rgba(255,255,255,0.3)",
    backdropFilter: "blur(32px) saturate(1.6)",
    WebkitBackdropFilter: "blur(32px) saturate(1.6)",
    border: "1px solid rgba(255,255,255,0.55)",
    boxShadow: "0 8px 32px rgba(16,24,40,0.06), inset 0 1px 0 rgba(255,255,255,0.6)",
  } as React.CSSProperties,

  card: {
    background: "rgba(255,255,255,0.38)",
    backdropFilter: "blur(28px) saturate(1.6)",
    WebkitBackdropFilter: "blur(28px) saturate(1.6)",
    border: "1.5px solid rgba(255,255,255,0.6)",
    boxShadow: "0 8px 32px rgba(16,24,40,0.06), inset 0 1px 0 rgba(255,255,255,0.7)",
  } as React.CSSProperties,

  pill: {
    background: "rgba(255,255,255,0.35)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    border: "1px solid rgba(255,255,255,0.5)",
  } as React.CSSProperties,

  nav: {
    background: "rgba(255,255,255,0.45)",
    backdropFilter: "blur(32px) saturate(1.6)",
    WebkitBackdropFilter: "blur(32px) saturate(1.6)",
    borderTop: "1px solid rgba(255,255,255,0.55)",
  } as React.CSSProperties,

  overlay: {
    background: "rgba(255,255,255,0.5)",
    backdropFilter: "blur(40px) saturate(1.6)",
    WebkitBackdropFilter: "blur(40px) saturate(1.6)",
    border: "1px solid rgba(255,255,255,0.65)",
  } as React.CSSProperties,
};

// ---------- 圆角规范 ----------
export const R = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  card: 22,
  sheet: 28,
} as const;

// ---------- 阴影 ----------
export const SHADOW = {
  card: "0 4px 24px rgba(16,24,40,0.05), inset 0 1px 0 rgba(255,255,255,0.7)",
  cardHover: "0 8px 32px rgba(16,24,40,0.08), inset 0 1px 0 rgba(255,255,255,0.8)",
  float: "0 12px 40px rgba(16,24,40,0.1), inset 0 1px 0 rgba(255,255,255,0.8)",
} as const;

// ---------- 通用弹簧 ----------
export const spring = { type: "spring", stiffness: 400, damping: 30 } as const;

// ---------- 数字滚动 ----------
export function CountUp({
  value,
  decimals = 2,
  prefix = "¥",
  className,
  style,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const controls = animate(0, value, {
      duration: 1.2,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        if (ref.current)
          ref.current.textContent =
            prefix +
            v.toLocaleString("zh-CN", {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            });
      },
    });
    return () => controls.stop();
  }, [value, decimals, prefix]);
  return (
    <span ref={ref} className={className} style={style}>
      {prefix}0
    </span>
  );
}

// ---------- 卡片进场 ----------
export const cardIn = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: 0.08 * i,
      type: "spring" as const,
      stiffness: 260,
      damping: 26,
    },
  }),
};

// ---------- 按压回弹 ----------
export function Pressable({
  children,
  className,
  style,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      transition={spring}
      className={className}
      style={style}
      onClick={onClick}
    >
      {children}
    </motion.button>
  );
}
