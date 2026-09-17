export type PaymentStatus = "UNPAID" | "PARTIALLY PAID" | "PAID" | "OVERPAID";

export function calculatePaymentSummary(orderValue: number, totalPaid: number) {
  if (!Number.isFinite(orderValue) || !Number.isFinite(totalPaid) || orderValue < 0 || totalPaid < 0) {
    throw new Error("Order value and payments cannot be negative.");
  }
  const dueAmount = Number((orderValue - totalPaid).toFixed(2));
  const paymentStatus: PaymentStatus = totalPaid <= 0 ? "UNPAID" : totalPaid < orderValue ? "PARTIALLY PAID" : totalPaid === orderValue ? "PAID" : "OVERPAID";
  return { dueAmount, paymentStatus };
}

export function calculateEstimatedProfit(orderValue: number, estimatedCost: number | null | undefined) {
  if (estimatedCost === null || estimatedCost === undefined) return null;
  if (!Number.isFinite(orderValue) || !Number.isFinite(estimatedCost) || orderValue < 0 || estimatedCost < 0) {
    throw new Error("Order value and estimated cost cannot be negative.");
  }
  return Number((orderValue - estimatedCost).toFixed(2));
}

export function calculateNetCashMovement(paymentsReceived: number, expenses: number) {
  if (!Number.isFinite(paymentsReceived) || !Number.isFinite(expenses) || paymentsReceived < 0 || expenses < 0) {
    throw new Error("Payments and expenses cannot be negative.");
  }
  return Number((paymentsReceived - expenses).toFixed(2));
}
