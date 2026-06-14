import type { PlanCode } from "@/lib/quota";

export type CheckoutRequest = {
  userId: string;
  orderType: "subscription" | "credits";
  planCode?: PlanCode;
  creditUnits?: number;
};

export type CheckoutResult = {
  provider: string;
  orderId: string;
  checkoutUrl: string | null;
};

export type PaymentProvider = {
  name: string;
  createCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
  handleWebhook(request: Request): Promise<{ ok: true }>;
  syncSubscription(userId: string): Promise<{ ok: true }>;
  grantCredits(userId: string, amount: number, reason: string): Promise<{ ok: true }>;
};

export const manualPaymentProvider: PaymentProvider = {
  name: "manual",
  async createCheckout(request) {
    return {
      provider: "manual",
      orderId: `manual-${request.userId}-${Date.now()}`,
      checkoutUrl: null
    };
  },
  async handleWebhook() {
    return { ok: true };
  },
  async syncSubscription() {
    return { ok: true };
  },
  async grantCredits() {
    return { ok: true };
  }
};
