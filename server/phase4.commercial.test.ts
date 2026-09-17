import { describe, expect, it } from "vitest";
import { calculateEstimatedProfit, calculateNetCashMovement, calculatePaymentSummary } from "../shared/commercial";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type Role = "owner" | "manager" | "factory_staff";
function createContext(role: Role): TrpcContext {
  return {
    user: { id: role === "owner" ? 1 : role === "manager" ? 2 : 3, openId: `phase4-${role}`, email: `${role}@example.com`, name: `Phase 4 ${role}`, loginMethod: "test", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Phase 4A commercial calculations", () => {
  it("calculates partial, paid, and overpaid balances", () => {
    expect(calculatePaymentSummary(100000, 30000)).toEqual({ dueAmount: 70000, paymentStatus: "PARTIALLY PAID" });
    expect(calculatePaymentSummary(100000, 100000)).toEqual({ dueAmount: 0, paymentStatus: "PAID" });
    expect(calculatePaymentSummary(100000, 105000)).toEqual({ dueAmount: -5000, paymentStatus: "OVERPAID" });
    expect(calculatePaymentSummary(100000, 0)).toEqual({ dueAmount: 100000, paymentStatus: "UNPAID" });
  });

  it("does not invent estimated profit when cost is missing and calculates cash movement", () => {
    expect(calculateEstimatedProfit(100000, null)).toBeNull();
    expect(calculateEstimatedProfit(100000, 65000)).toBe(35000);
    expect(calculateNetCashMovement(70000, 10000)).toBe(60000);
    expect(() => calculateEstimatedProfit(100000, -1)).toThrow();
  });
});

describe("Phase 4A finance permissions and validation", () => {
  it("blocks factory staff from sensitive finance procedures", async () => {
    const caller = appRouter.createCaller(createContext("factory_staff"));
    await expect(caller.commercial.dashboard({ period: "TODAY" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.commercial.payments.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.commercial.expenses.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows managers to read commercial reports but rejects invalid payment and expense inputs", async () => {
    const caller = appRouter.createCaller(createContext("manager"));
    const dashboard = await caller.commercial.dashboard({ period: "TODAY" });
    expect(dashboard).toHaveProperty("paymentsReceived");
    expect(dashboard).toHaveProperty("netCashMovement");
    await expect(caller.commercial.payments.create({ orderId: 999999, customerId: 999999, paymentDate: "2026-09-10", amount: 100, paymentMethod: "CASH", reference: null, notes: null })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.commercial.payments.create({ orderId: 999999, customerId: 999999, paymentDate: "2026-09-10", amount: -1, paymentMethod: "CASH", reference: null, notes: null })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.commercial.expenses.create({ expenseDate: "2026-09-10", category: "FACTORY", amount: 0, paymentMethod: "CASH", description: "Invalid test expense", notes: null })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects impossible custom report dates and keeps the existing order routes readable", async () => {
    const caller = appRouter.createCaller(createContext("owner"));
    await expect(caller.commercial.dashboard({ period: "CUSTOM", from: "2026-02-30", to: "2026-03-01" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const orders = await caller.orders.list();
    expect(Array.isArray(orders)).toBe(true);
  });
});
