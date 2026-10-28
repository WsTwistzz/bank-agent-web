import { ChartNoAxesCombined } from "lucide-react";
import Brand from "./Brand";
import "./entry.css";

export default function WelcomePage() {
  return (
    <section className="entry-page welcome-page" aria-label="BankSense 欢迎页">
      <header className="entry-brand"><Brand /></header>
      <div className="welcome-art" aria-hidden="true">
        <img src="/banksense-welcome-art.png" alt="" fetchPriority="high" />
      </div>
      <div className="welcome-copy">
        <span className="investment-pill"><ChartNoAxesCombined size={15} strokeWidth={2.7} />Your Investment Space</span>
        <h1>Clear Insights For<br />Smarter Decisions</h1>
      </div>
      <nav className="welcome-actions" aria-label="开始使用">
        <a className="entry-glass-button" href="#/login">直接登录</a>
        <a className="entry-glass-button" href="#/register">注册</a>
      </nav>
    </section>
  );
}
