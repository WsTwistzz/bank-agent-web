import { createContext, useContext } from "react";

export interface DemoTransfer {
  id: string;
  recipientName: string;
  recipientAccount: string;
  recipientBank: string;
  amountCents: number;
  memo: string;
  scheduledDate: string | null;
  createdAt: string;
  status: "completed" | "scheduled";
}

export interface DemoSplitRequest {
  id: string;
  title: string;
  totalCents: number;
  selfCents: number;
  includeSelf: boolean;
  createdAt: string;
  participants: { id: string; name: string; amountCents: number; paid: boolean }[];
}

export interface NewSplitRequest {
  title: string;
  totalCents: number;
  participantNames: string[];
  includeSelf: boolean;
}

export interface PaymentContextValue {
  transfers: DemoTransfer[];
  splitRequests: DemoSplitRequest[];
  availableCents: number;
  addDemoTransfer: (draft: Omit<DemoTransfer, "id" | "createdAt" | "status">) => DemoTransfer | null;
  createDemoSplit: (input: NewSplitRequest) => DemoSplitRequest | null;
  markDemoSplitPaid: (requestId: string, participantId: string) => void;
}

export const PaymentContext = createContext<PaymentContextValue | null>(null);
export function usePaymentData() {
  const value = useContext(PaymentContext);
  if (!value) throw new Error("PaymentProvider is required");
  return value;
}
