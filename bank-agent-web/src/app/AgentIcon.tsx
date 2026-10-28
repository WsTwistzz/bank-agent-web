import { asset } from "./asset";

export default function AgentIcon({ size = 24, className = "" }: { size?: number; className?: string }) {
  return <img src={asset("banksense-agent-96.png")} alt="" aria-hidden="true" width={size} height={size} className={className} style={{ width: size, height: size, objectFit: "contain", flexShrink: 0 }} />;
}
