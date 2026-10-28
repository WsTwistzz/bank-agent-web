import { motion } from "framer-motion";
import { Home, UserRound } from "lucide-react";
import AgentIcon from "./AgentIcon";
import "./capsule-nav.css";

type NavigationKey = "home" | "agent" | "me";
const items = [
  { key: "home", label: "首页", route: "/home", icon: Home },
  { key: "agent", label: "Agent", route: "/agent", icon: null },
  { key: "me", label: "我的", route: "/profile", icon: UserRound },
] as const;

export default function CapsuleNav({ active }: { active: NavigationKey }) {
  return <div className="banksense-nav-dock">
    <nav className="banksense-capsule-nav" aria-label="主导航">
      {items.map(item => {
        const selected = active === item.key;
        return <motion.button key={item.key} type="button" aria-label={item.label} aria-current={selected ? "page" : undefined}
          onClick={() => { window.location.hash = item.route; }} whileTap={{ scale: .94 }}
          className={`banksense-nav-item${selected ? " is-active" : ""}`}>
          {selected && <motion.span layoutId="banksense-capsule-active" className="banksense-nav-selection" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
          <span className="banksense-nav-item-content">
            {item.icon ? <item.icon size={19} strokeWidth={selected ? 2 : 1.65} /> : <AgentIcon size={25} className="banksense-nav-agent" />}
            {selected && <motion.span initial={{ opacity: 0, x: -3 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: .17 }} className="banksense-nav-label">{item.label}</motion.span>}
          </span>
        </motion.button>;
      })}
    </nav>
    <div className="banksense-home-indicator" aria-hidden="true" />
  </div>;
}
