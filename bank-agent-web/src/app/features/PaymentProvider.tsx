import { useState, type ReactNode } from "react";
import { useFeatureData } from "./featureData";
import { decimalCents } from "./featureAccounting";
import { allocateSplit } from "./paymentMath";
import { PaymentContext, type DemoTransfer, type DemoSplitRequest, type NewSplitRequest } from "./paymentData";

export function PaymentProvider({ children }: { children: ReactNode }) {
  const { account, isDemo, loading } = useFeatureData();
  const [transfers, setTransfers] = useState<DemoTransfer[]>([]);
  const [splitRequests, setSplitRequests] = useState<DemoSplitRequest[]>([]);
  const spent = transfers.filter(t => t.status === "completed").reduce((sum, t) => sum + t.amountCents, 0);
  const received = splitRequests.reduce((sum, request) => sum + request.participants.filter(p => p.paid).reduce((total, p) => total + p.amountCents, 0), 0);
  const availableCents = Math.max(0, decimalCents(account.balance) + (isDemo ? received - spent : 0));

  function addDemoTransfer(draft: Omit<DemoTransfer, "id" | "createdAt" | "status">): DemoTransfer | null {
    if (!isDemo || loading || !Number.isSafeInteger(draft.amountCents) || draft.amountCents <= 0 || draft.amountCents > availableCents) return null;
    const record: DemoTransfer = { ...draft, id: `demo_trf_${crypto.randomUUID()}`, createdAt: new Date().toISOString(), status: draft.scheduledDate ? "scheduled" : "completed" };
    setTransfers(items => [record, ...items]);
    return record;
  }

  function createDemoSplit(input: NewSplitRequest): DemoSplitRequest | null {
    if (!isDemo || loading || !input.title.trim() || input.participantNames.some(name => !name.trim())) return null;
    const allocated = allocateSplit(input.totalCents, input.participantNames.length, input.includeSelf);
    const request: DemoSplitRequest = {
      id: `demo_spl_${crypto.randomUUID()}`, title: input.title.trim(), totalCents: input.totalCents, selfCents: allocated.selfCents, includeSelf: input.includeSelf, createdAt: new Date().toISOString(),
      participants: input.participantNames.map((name, i) => ({ id: crypto.randomUUID(), name: name.trim(), amountCents: allocated.participantCents[i], paid: false })),
    };
    setSplitRequests(items => [request, ...items]);
    return request;
  }

  function markDemoSplitPaid(requestId: string, participantId: string) {
    if (!isDemo || loading) return;
    setSplitRequests(items => items.map(request => request.id !== requestId ? request : { ...request, participants: request.participants.map(p => p.id === participantId ? { ...p, paid: true } : p) }));
  }

  return <PaymentContext.Provider value={{ transfers: isDemo ? transfers : [], splitRequests: isDemo ? splitRequests : [], availableCents, addDemoTransfer, createDemoSplit, markDemoSplitPaid }}>{children}</PaymentContext.Provider>;
}
