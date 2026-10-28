import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck, Smartphone } from "lucide-react";
import { useState, type FormEvent } from "react";
import Brand from "./Brand";
import { asset } from "./asset";
import "./entry.css";

export default function LoginPage({ register = false }: { register?: boolean }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^1\d{10}$/.test(phone.trim())) {
      setError("请输入 11 位手机号码");
      return;
    }
    if (password.length < 6) {
      setError("请输入至少 6 位密码");
      return;
    }
    // This screen is a frontend demo. Credentials are neither sent nor saved.
    window.location.hash = "/home";
  }

  return (
    <section className="entry-page login-page" aria-label={register ? "BankSense 注册页" : "BankSense 登录页"}>
      <header className="login-header">
        <a href="#/welcome" className="entry-back" aria-label="返回欢迎页"><ArrowLeft size={19} /></a>
        <Brand compact />
        <span className="login-header-spacer" />
      </header>

      <div className="login-body">
        <div className="login-app-icon"><img src={asset("banksense-icon.png")} alt="BankSense App 图标" /></div>
        <span className="login-eyebrow">YOUR MONEY. MORE SENSE.</span>
        <h1>{register ? <>A fresh start.<br />A smarter you.</> : <>Welcome back.<br />Good to see you.</>}</h1>
        <p className="login-intro">{register ? "从这里开启你的智慧金融生活。" : "让每一笔财富，都更有方向。"}</p>

        <form onSubmit={submit} className="login-form" noValidate>
          <label htmlFor="banksense-phone">手机号码</label>
          <div className="entry-input-wrap">
            <Smartphone size={18} aria-hidden="true" />
            <span className="phone-prefix">+86</span>
            <input id="banksense-phone" type="tel" autoComplete="tel-national" inputMode="numeric" maxLength={11} placeholder="请输入手机号码" value={phone} onChange={(e) => { setPhone(e.target.value); setError(""); }} aria-invalid={!!error} aria-describedby={error ? "login-error" : undefined} />
          </div>
          <label htmlFor="banksense-password">{register ? "设置密码" : "密码"}</label>
          <div className="entry-input-wrap">
            <LockKeyhole size={18} aria-hidden="true" />
            <input id="banksense-password" type={visible ? "text" : "password"} autoComplete={register ? "new-password" : "current-password"} placeholder={register ? "设置至少 6 位密码" : "请输入密码"} value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} aria-invalid={!!error} aria-describedby={error ? "login-error" : undefined} />
            <button type="button" className="password-visibility" onClick={() => setVisible(!visible)} aria-label={visible ? "隐藏密码" : "显示密码"} aria-pressed={visible}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button>
          </div>
          <p className={`login-form-message${error ? " is-error" : ""}`} id="login-error" role={error ? "alert" : undefined}>{error || "当前为比赛演示，信息仅用于界面体验"}</p>
          <button className="entry-glass-button login-submit" type="submit">{register ? "注册并体验" : "登录 BankSense"}<ArrowRight size={18} /></button>
        </form>

        <p className="login-switch">{register ? "已经有账户？" : "还没有账户？"}<a href={register ? "#/login" : "#/register"}>{register ? "直接登录" : "立即注册"}</a></p>
      </div>

      <footer className="login-footer">
        <a href="#/home" className="demo-entry">先体验一下<ArrowRight size={13} /></a>
        <span><ShieldCheck size={13} />感知财富，安心每一步</span>
      </footer>
    </section>
  );
}
