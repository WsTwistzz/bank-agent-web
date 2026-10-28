import { useState, type ReactNode } from "react";
import { useBankData } from "../../api/useBankData";
import type { BankCard } from "../../api/bank";
import { demoSnapshot, FeatureContext, type CardSettings } from "./featureData";

export function FeatureDataProvider({ children }: { children: ReactNode }) {
  const { snapshot, source } = useBankData();
  const [cancelledIds, setCancelledIds] = useState<string[]>([]);
  const [cardOverrides, setCardOverrides] = useState<Record<string, BankCard>>({});
  const [cardSettings, setCardSettings] = useState<Record<string, CardSettings>>({});
  const isDemo = source !== "live";
  const data = isDemo ? demoSnapshot : snapshot;
  return <FeatureContext.Provider value={{
    ...data,
    cards: data.cards.map(c => isDemo ? cardOverrides[c.id] ?? c : c),
    isDemo,
    loading: source === "loading",
    cancelledIds: isDemo ? cancelledIds : [],
    cancelDemoSubscription: id => { if (isDemo) setCancelledIds(ids => ids.includes(id) ? ids : [...ids, id]); },
    updateDemoCard: card => { if (isDemo) setCardOverrides(cards => ({ ...cards, [card.id]: card })); },
    cardSettings: isDemo ? cardSettings : {},
    updateDemoCardSettings: (id, value) => { if (isDemo) setCardSettings(settings => ({ ...settings, [id]: value })); },
  }}>{children}</FeatureContext.Provider>;
}
