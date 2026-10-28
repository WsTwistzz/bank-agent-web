import { asset } from "./asset";

export default function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`banksense-brand${compact ? " banksense-brand--compact" : ""}`}>
      <img src={asset("banksense-icon-192.png")} alt="" width="36" height="36" />
      <span>BankSense</span>
    </span>
  );
}
