import { createContext, useContext } from "react";
import type { BankSnapshot } from "../../api/useBankData";
import type { BankCard } from "../../api/bank";

/** 演示快照统一放在 api/demoData.ts，静态部署与本地兜底共用同一份数据。 */
export { demoSnapshot } from "../../api/demoData";

export interface CardSettings {
  /** Integer cents, not decimal yuan. */
  singleLimit: number;
  dailyLimit: number;
  online: boolean;
  overseas: boolean;
  atm: boolean;
  quickpass: boolean;
}

export interface FeatureContextValue extends BankSnapshot {
  isDemo: boolean;
  loading: boolean;
  cancelledIds: string[];
  cancelDemoSubscription: (id: string) => void;
  updateDemoCard: (card: BankCard) => void;
  cardSettings: Record<string, CardSettings>;
  updateDemoCardSettings: (id: string, value: CardSettings) => void;
}

export const FeatureContext = createContext<FeatureContextValue | null>(null);

export function useFeatureData() {
  const value = useContext(FeatureContext);
  if (!value) throw new Error("FeatureDataProvider is required");
  return value;
}
