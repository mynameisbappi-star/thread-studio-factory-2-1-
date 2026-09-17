import { and, asc, desc, eq, gte, lte, ne } from "drizzle-orm";
import { customers, expenses, orders, payments, users } from "../drizzle/schema";
import { calculateEstimatedProfit, calculateNetCashMovement, calculatePaymentSummary } from "../shared/commercial";
import { getDb, getOrder, phase2Pipeline } from "./db";

export type CommercialRange = { from: Date; to: Date };

export async function listPayments(range?: CommercialRange) {
  const db = await getDb();
  if (!db) return [];
  const where = range ? and(gte(payments.paymentDate, range.from), lte(payments.paymentDate, range.to)) : undefined;
  return db.select({ payment: payments, orderCode: orders.orderCode, customerName: customers.customerName, receivedByName: users.name })
    .from(payments)
    .leftJoin(orders, eq(payments.orderId, orders.id))
    .leftJoin(customers, eq(payments.customerId, customers.id))
    .leftJoin(users, eq(payments.receivedBy, users.id))
    .where(where)
    .orderBy(desc(payments.paymentDate), desc(payments.id));
}

export async function listExpenses(range?: CommercialRange) {
  const db = await getDb();
  if (!db) return [];
  const where = range ? and(gte(expenses.expenseDate, range.from), lte(expenses.expenseDate, range.to)) : undefined;
  return db.select({ expense: expenses, recordedByName: users.name })
    .from(expenses)
    .leftJoin(users, eq(expenses.recordedBy, users.id))
    .where(where)
    .orderBy(desc(expenses.expenseDate), desc(expenses.id));
}

export async function commercialOrderSummary(orderId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const order = await getOrder(orderId);
  if (!order) return undefined;
  const paymentRows = await listPayments();
  const orderPayments = paymentRows.filter(row => row.payment.orderId === orderId);
  const totalPaid = orderPayments.reduce((sum, row) => sum + Number(row.payment.amount), 0);
  const paymentSummary = calculatePaymentSummary(Number(order.order.orderValue), totalPaid);
  const pipeline = (await phase2Pipeline(true)).find(row => row.id === orderId);
  return {
    order: order.order,
    customerName: order.customerName,
    totalPaid: Number(totalPaid.toFixed(2)),
    dueAmount: paymentSummary.dueAmount,
    paymentStatus: paymentSummary.paymentStatus,
    lastPaymentDate: orderPayments[0]?.payment.paymentDate ?? null,
    estimatedProfit: calculateEstimatedProfit(Number(order.order.orderValue), order.order.estimatedCost === null ? null : Number(order.order.estimatedCost)),
    payments: orderPayments,
    pipeline: pipeline ? {
      currentStage: pipeline.currentStage,
      cutting: pipeline.cutQuantity,
      sewing: pipeline.goodSewn,
      dtf: pipeline.printingRequired ? pipeline.goodPrinted : null,
      qc: pipeline.passedQc,
      packing: pipeline.packed,
      delivery: pipeline.delivered,
      remaining: pipeline.remaining,
    } : null,
  };
}

export async function commercialDashboard(range: CommercialRange) {
  const db = await getDb();
  if (!db) return null;
  const [rangedOrders, allOrders, rangedPayments, rangedExpenses, allPayments] = await Promise.all([
    db.select({ id: orders.id, orderValue: orders.orderValue }).from(orders).where(and(gte(orders.orderDate, range.from), lte(orders.orderDate, range.to), ne(orders.status, "CANCELLED"))),
    db.select({ order: orders, customerName: customers.customerName }).from(orders).leftJoin(customers, eq(orders.customerId, customers.id)).where(ne(orders.status, "CANCELLED")),
    db.select().from(payments).where(and(gte(payments.paymentDate, range.from), lte(payments.paymentDate, range.to))),
    db.select().from(expenses).where(and(gte(expenses.expenseDate, range.from), lte(expenses.expenseDate, range.to))),
    db.select().from(payments),
  ]);
  const paymentsByOrder = new Map<number, number>();
  for (const payment of allPayments) paymentsByOrder.set(payment.orderId, (paymentsByOrder.get(payment.orderId) ?? 0) + Number(payment.amount));
  const totalOrderValue = rangedOrders.reduce((sum, row) => sum + Number(row.orderValue), 0);
  const paymentsReceived = rangedPayments.reduce((sum, row) => sum + Number(row.amount), 0);
  const totalExpenses = rangedExpenses.reduce((sum, row) => sum + Number(row.amount), 0);
  const outstandingRows = allOrders.map(({ order, customerName }) => {
    const totalPaid = paymentsByOrder.get(order.id) ?? 0;
    const summary = calculatePaymentSummary(Number(order.orderValue), totalPaid);
    return { orderId: order.id, order: order.orderCode, customer: customerName ?? "Unassigned", orderValue: Number(order.orderValue), paid: Number(totalPaid.toFixed(2)), due: summary.dueAmount, paymentStatus: summary.paymentStatus };
  });
  const attention = outstandingRows.filter(row => (row.paymentStatus === "UNPAID" && row.orderValue > 0) || row.paymentStatus === "OVERPAID" || row.due >= 50000).sort((a, b) => Math.abs(b.due) - Math.abs(a.due)).slice(0, 8);
  return {
    range,
    totalOrderValue: Number(totalOrderValue.toFixed(2)),
    paymentsReceived: Number(paymentsReceived.toFixed(2)),
    outstanding: Number(outstandingRows.reduce((sum, row) => sum + row.due, 0).toFixed(2)),
    expenses: Number(totalExpenses.toFixed(2)),
    netCashMovement: calculateNetCashMovement(paymentsReceived, totalExpenses),
    outstandingRows: outstandingRows.filter(row => row.due !== 0).sort((a, b) => Math.abs(b.due) - Math.abs(a.due)),
    attention,
  };
}
