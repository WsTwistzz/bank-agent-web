import { useEffect, useState } from "react";
import AppPreview from "./app/AppPreview";
import BankApp from "./app/BankApp";
import { ChatPanel } from "./components/ChatPanel";
import { PendingActionModal } from "./components/PendingActionModal";
import { Sidebar } from "./components/Sidebar";
import { useAgentEngine } from "./useAgentEngine";
import { FeatureDataProvider } from "./app/features/FeatureDataProvider";
import { PaymentProvider } from "./app/features/PaymentProvider";

export default function App() {
  const { messages, pending, busy, send, confirmPending, cancelPending } =
    useAgentEngine();
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Crypto Vault 黑金风 App（保留）
  if (hash === "#/vault") return <AppPreview />;

  // Web 桌面版（保留）
  if (hash === "#/web") {
    return (
      <div className="relative flex h-full">
        <div className="aurora-bg" />
        <div className="aurora-grid" />
        <Sidebar />
        <main className="relative z-10 flex min-w-0 flex-1">
          <ChatPanel
            messages={messages}
            busy={busy}
            pending={pending}
            onSend={send}
          />
        </main>
        <PendingActionModal
          pending={pending}
          onConfirm={confirmPending}
          onCancel={cancelPending}
        />
      </div>
    );
  }

  // 默认：浅色资金管理 App（仿参考视频）
  return <FeatureDataProvider><PaymentProvider><BankApp route={hash} /></PaymentProvider></FeatureDataProvider>;
}
