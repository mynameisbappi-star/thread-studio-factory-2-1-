import { and, asc, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  attendance,
  cuttingEntries,
  customers,
  dailyReports,
  deliveryEntries,
  employees,
  InsertUser,
  machines,
  orderSizes,
  orders,
  packingEntries,
  printingEntries,
  productionEntries,
  qcEntries,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { calculateRemaining } from "../shared/factory";
import { calculateGoodPrinted, calculatePassRate, calculatePipelineStage } from "../shared/phase2";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.lastSignedIn = values.lastSignedIn;
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "owner";
    updateSet.role = "owner";
  }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function listUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(asc(users.name));
}

export async function listCustomers(search?: string, type?: string) {
  const db = await getDb();
  if (!db) return [];
  const filters = [];
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    filters.push(or(
      sql`${customers.customerName} like ${term}`,
      sql`${customers.companyName} like ${term}`,
      sql`${customers.phone} like ${term}`,
      sql`${customers.email} like ${term}`,
    ));
  }
  if (type && type !== "ALL") filters.push(eq(customers.customerType, type as typeof customers.customerType.enumValues[number]));
  return db.select().from(customers).where(filters.length ? and(...filters) : undefined).orderBy(desc(customers.createdAt));
}

export async function listOrders() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({
    order: orders,
    customerName: customers.customerName,
    companyName: customers.companyName,
  }).from(orders).leftJoin(customers, eq(orders.customerId, customers.id)).orderBy(desc(orders.deliveryDate));
  return rows;
}

export function stripOrderCommercial<T extends Record<string, unknown>>(order: T) {
  return { ...order, orderValue: undefined, estimatedCost: undefined, sewingCharge: undefined, printingCharge: undefined, otherCharge: undefined, advance: undefined };
}

export async function getOrder(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select({
    order: orders,
    customerName: customers.customerName,
    companyName: customers.companyName,
  }).from(orders).leftJoin(customers, eq(orders.customerId, customers.id)).where(eq(orders.id, id)).limit(1);
  if (!result[0]) return undefined;
  const sizes = await db.select().from(orderSizes).where(eq(orderSizes.orderId, id)).orderBy(asc(orderSizes.id));
  const [production] = await db.select({
    totalGood: sql<number>`coalesce(sum(${productionEntries.actualProduction} - ${productionEntries.rejectedQuantity}), 0)`,
    totalActual: sql<number>`coalesce(sum(${productionEntries.actualProduction}), 0)`,
    totalRejected: sql<number>`coalesce(sum(${productionEntries.rejectedQuantity}), 0)`,
    totalTarget: sql<number>`coalesce(sum(${productionEntries.productionTarget}), 0)`,
  }).from(productionEntries).where(eq(productionEntries.orderId, id));
  return { ...result[0], sizes, production };
}

export async function listProduction(filters?: { orderId?: number; operatorId?: number; from?: Date; to?: Date }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.orderId) conditions.push(eq(productionEntries.orderId, filters.orderId));
  if (filters?.operatorId) conditions.push(eq(productionEntries.operatorId, filters.operatorId));
  if (filters?.from) conditions.push(gte(productionEntries.productionDate, filters.from));
  if (filters?.to) conditions.push(lte(productionEntries.productionDate, filters.to));
  return db.select({
    entry: productionEntries,
    orderCode: orders.orderCode,
    product: orders.product,
    operatorName: users.name,
  }).from(productionEntries)
    .leftJoin(orders, eq(productionEntries.orderId, orders.id))
    .leftJoin(users, eq(productionEntries.operatorId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(productionEntries.productionDate), desc(productionEntries.id));
}

export async function listDailyReports(type?: "MORNING" | "CLOSING") {
  const db = await getDb();
  if (!db) return [];
  return db.select({ report: dailyReports, managerName: users.name })
    .from(dailyReports).leftJoin(users, eq(dailyReports.managerId, users.id))
    .where(type ? eq(dailyReports.reportType, type) : undefined)
    .orderBy(desc(dailyReports.reportDate), desc(dailyReports.id));
}

export async function dashboardData(todayStart: Date, tomorrowStart: Date, redactCommercial = false) {
  const db = await getDb();
  if (!db) return null;
  const activeStatuses = ["CONFIRMED", "IN PRODUCTION", "PRODUCTION COMPLETED", "QC", "READY"] as const;
  const [orderRows, productionToday, productionAll, morningReport] = await Promise.all([
    db.select({ order: orders, customerName: customers.customerName })
      .from(orders).leftJoin(customers, eq(orders.customerId, customers.id))
      .where(or(...activeStatuses.map(status => eq(orders.status, status))))
      .orderBy(asc(orders.deliveryDate)),
    db.select({
      target: sql<number>`coalesce(sum(${productionEntries.productionTarget}), 0)`,
      actual: sql<number>`coalesce(sum(${productionEntries.actualProduction}), 0)`,
      good: sql<number>`coalesce(sum(${productionEntries.actualProduction} - ${productionEntries.rejectedQuantity}), 0)`,
    }).from(productionEntries).where(and(gte(productionEntries.productionDate, todayStart), lte(productionEntries.productionDate, tomorrowStart))),
    db.select({
      orderId: productionEntries.orderId,
      good: sql<number>`coalesce(sum(${productionEntries.actualProduction} - ${productionEntries.rejectedQuantity}), 0)`,
    }).from(productionEntries).groupBy(productionEntries.orderId),
    db.select().from(dailyReports).where(and(eq(dailyReports.reportType, "MORNING"), gte(dailyReports.reportDate, todayStart), lte(dailyReports.reportDate, tomorrowStart))).limit(1),
  ]);
  const goodByOrder = new Map(productionAll.map(item => [item.orderId, Number(item.good) || 0]));
  const ordersWithProgress = orderRows.map(({ order, customerName }) => ({
    ...order,
    customerName: customerName ?? "Unassigned",
    produced: goodByOrder.get(order.id) ?? 0,
    remaining: calculateRemaining(order.totalQuantity, goodByOrder.get(order.id) ?? 0),
  }));
  const target = Number(productionToday[0]?.target ?? 0) || Number(morningReport[0]?.todaysProductionTarget ?? 0) || 0;
  const actual = Number(productionToday[0]?.actual ?? 0);
  const pending = ordersWithProgress.reduce((sum, order) => sum + order.remaining, 0);
  return {
    metrics: {
      target,
      actual,
      good: Number(productionToday[0]?.good ?? 0),
      achievement: target ? Math.round((actual / target) * 100) : 0,
      pending,
      activeOrders: ordersWithProgress.length,
      dueSoon: ordersWithProgress.filter(order => {
        const days = (new Date(order.deliveryDate).getTime() - todayStart.getTime()) / 86_400_000;
        return days >= 0 && days <= 3;
      }).length,
      delayed: ordersWithProgress.filter(order => new Date(order.deliveryDate) < todayStart && order.remaining > 0).length,
      workersPresent: morningReport[0]?.presentWorkers ?? 0,
    },
    orders: redactCommercial ? ordersWithProgress.map(order => stripOrderCommercial(order)) : ordersWithProgress,
  };
}

export async function listAttendance(date?: Date) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ attendance, employeeName: users.name, employeeEmail: users.email })
    .from(attendance).leftJoin(users, eq(attendance.employeeId, users.id))
    .where(date ? and(gte(attendance.attendanceDate, date), lte(attendance.attendanceDate, new Date(date.getTime() + 86_399_999))) : undefined)
    .orderBy(asc(users.name));
}

export async function attendanceSummary(date: Date) {
  const rows = await listAttendance(date);
  return {
    present: rows.filter(row => row.attendance.status === "PRESENT").length,
    absent: rows.filter(row => row.attendance.status === "ABSENT").length,
    late: rows.filter(row => row.attendance.status === "LATE").length,
    leave: rows.filter(row => row.attendance.status === "LEAVE").length,
    total: rows.length,
  };
}

export async function listCutting() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ entry: cuttingEntries, orderCode: orders.orderCode, product: orders.product, staffName: users.name, orderQuantity: orders.totalQuantity })
    .from(cuttingEntries).leftJoin(orders, eq(cuttingEntries.orderId, orders.id)).leftJoin(users, eq(cuttingEntries.cuttingStaffId, users.id))
    .orderBy(desc(cuttingEntries.cuttingDate), desc(cuttingEntries.id));
}

export async function listPrinting() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ entry: printingEntries, orderCode: orders.orderCode, product: orders.product, staffName: users.name, orderQuantity: orders.totalQuantity })
    .from(printingEntries).leftJoin(orders, eq(printingEntries.orderId, orders.id)).leftJoin(users, eq(printingEntries.printingStaffId, users.id))
    .orderBy(desc(printingEntries.printingDate), desc(printingEntries.id));
}

export async function listQc() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ entry: qcEntries, orderCode: orders.orderCode, product: orders.product, staffName: users.name, orderQuantity: orders.totalQuantity })
    .from(qcEntries).leftJoin(orders, eq(qcEntries.orderId, orders.id)).leftJoin(users, eq(qcEntries.qcStaffId, users.id))
    .orderBy(desc(qcEntries.qcDate), desc(qcEntries.id));
}

export async function listPacking() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ entry: packingEntries, orderCode: orders.orderCode, product: orders.product, staffName: users.name, orderQuantity: orders.totalQuantity })
    .from(packingEntries).leftJoin(orders, eq(packingEntries.orderId, orders.id)).leftJoin(users, eq(packingEntries.packingStaffId, users.id))
    .orderBy(desc(packingEntries.packingDate), desc(packingEntries.id));
}

export async function listDelivery() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ entry: deliveryEntries, orderCode: orders.orderCode, product: orders.product, customerId: orders.customerId, orderQuantity: orders.totalQuantity })
    .from(deliveryEntries).leftJoin(orders, eq(deliveryEntries.orderId, orders.id))
    .orderBy(desc(deliveryEntries.deliveryDate), desc(deliveryEntries.id));
}

export async function phase2Pipeline(includeDelivered = false, range?: { from: Date; to: Date }) {
  const db = await getDb();
  if (!db) return [];
  const activeStatuses = includeDelivered ? ["CONFIRMED", "IN PRODUCTION", "PRODUCTION COMPLETED", "QC", "READY", "DELIVERED"] as const : ["CONFIRMED", "IN PRODUCTION", "PRODUCTION COMPLETED", "QC", "READY"] as const;
  const rows = await db.select({ order: orders, customerName: customers.customerName }).from(orders).leftJoin(customers, eq(orders.customerId, customers.id)).where(or(...activeStatuses.map(status => eq(orders.status, status)))).orderBy(asc(orders.deliveryDate));
  const [cut, sew, print, qc, pack, delivery] = await Promise.all([
    db.select({ orderId: cuttingEntries.orderId, total: sql<number>`coalesce(sum(${cuttingEntries.cutQuantity}),0)`, target: sql<number>`coalesce(sum(${cuttingEntries.cuttingTarget}),0)` }).from(cuttingEntries).where(range ? and(gte(cuttingEntries.cuttingDate, range.from), lte(cuttingEntries.cuttingDate, range.to)) : undefined).groupBy(cuttingEntries.orderId),
    db.select({ orderId: productionEntries.orderId, target: sql<number>`coalesce(sum(${productionEntries.productionTarget}),0)`, actual: sql<number>`coalesce(sum(${productionEntries.actualProduction}),0)`, rejected: sql<number>`coalesce(sum(${productionEntries.rejectedQuantity}),0)` }).from(productionEntries).where(range ? and(gte(productionEntries.productionDate, range.from), lte(productionEntries.productionDate, range.to)) : undefined).groupBy(productionEntries.orderId),
    db.select({ orderId: printingEntries.orderId, target: sql<number>`coalesce(sum(${printingEntries.printingTarget}),0)`, printed: sql<number>`coalesce(sum(${printingEntries.printedQuantity}),0)`, rejected: sql<number>`coalesce(sum(${printingEntries.rejectedQuantity}),0)` }).from(printingEntries).where(range ? and(gte(printingEntries.printingDate, range.from), lte(printingEntries.printingDate, range.to)) : undefined).groupBy(printingEntries.orderId),
    db.select({ orderId: qcEntries.orderId, checked: sql<number>`coalesce(sum(${qcEntries.checkedQuantity}),0)`, passed: sql<number>`coalesce(sum(${qcEntries.passedQuantity}),0)`, failed: sql<number>`coalesce(sum(${qcEntries.failedQuantity}),0)`, rework: sql<number>`coalesce(sum(${qcEntries.reworkQuantity}),0)` }).from(qcEntries).where(range ? and(gte(qcEntries.qcDate, range.from), lte(qcEntries.qcDate, range.to)) : undefined).groupBy(qcEntries.orderId),
    db.select({ orderId: packingEntries.orderId, packed: sql<number>`coalesce(sum(${packingEntries.packedQuantity}),0)` }).from(packingEntries).where(range ? and(gte(packingEntries.packingDate, range.from), lte(packingEntries.packingDate, range.to)) : undefined).groupBy(packingEntries.orderId),
    db.select({ orderId: deliveryEntries.orderId, delivered: sql<number>`coalesce(sum(${deliveryEntries.deliveredQuantity}),0)` }).from(deliveryEntries).where(range ? and(gte(deliveryEntries.deliveryDate, range.from), lte(deliveryEntries.deliveryDate, range.to)) : undefined).groupBy(deliveryEntries.orderId),
  ]);
  const map = <T extends { orderId: number }>(rows: T[]) => new Map(rows.map(row => [row.orderId, row]));
  const cuts = map(cut); const sews = map(sew); const prints = map(print); const qcs = map(qc); const packs = map(pack); const deliveries = map(delivery);
  return rows.map(({ order, customerName }) => {
    const cutQuantity = Number(cuts.get(order.id)?.total ?? 0);
    const actualSewn = Number(sews.get(order.id)?.actual ?? 0);
    const rejectedSewn = Number(sews.get(order.id)?.rejected ?? 0);
    const goodSewn = Math.max(0, actualSewn - rejectedSewn);
    const printed = Number(prints.get(order.id)?.printed ?? 0);
    const rejectedPrinted = Number(prints.get(order.id)?.rejected ?? 0);
    const goodPrinted = calculateGoodPrinted(printed, rejectedPrinted);
    const passedQc = Number(qcs.get(order.id)?.passed ?? 0);
    const packed = Number(packs.get(order.id)?.packed ?? 0);
    const delivered = Number(deliveries.get(order.id)?.delivered ?? 0);
    const currentStage = calculatePipelineStage({ orderQuantity: order.totalQuantity, cutQuantity, goodSewn, printingRequired: order.printingRequired, goodPrinted, passedQc, packedQuantity: packed, deliveredQuantity: delivered });
    return { ...order, customerName: customerName ?? "Unassigned", cutQuantity, cutTarget: Number(cuts.get(order.id)?.target ?? 0), actualSewn, sewingTarget: Number(sews.get(order.id)?.target ?? 0), rejectedSewn, goodSewn, printed, printingTarget: Number(prints.get(order.id)?.target ?? 0), rejectedPrinted, goodPrinted, checkedQc: Number(qcs.get(order.id)?.checked ?? 0), passedQc, failedQc: Number(qcs.get(order.id)?.failed ?? 0), reworkQc: Number(qcs.get(order.id)?.rework ?? 0), packed, delivered, currentStage, remaining: calculateRemaining(order.totalQuantity, delivered), progress: Math.min(100, Math.round((delivered / order.totalQuantity) * 100)) };
  });
}

export async function phase2Dashboard(todayStart: Date) {
  const [pipeline, manpower, qcIssues] = await Promise.all([
    phase2Pipeline(),
    attendanceSummary(todayStart),
    (async () => { const rows = await listQc(); return rows.filter(row => ["FAILED", "REWORK REQUIRED"].includes(row.entry.status)); })(),
  ]);
  const stageCounts = pipeline.reduce<Record<string, number>>((counts, order) => {
    counts[order.currentStage] = (counts[order.currentStage] ?? 0) + 1;
    return counts;
  }, {});
  const delayed = pipeline.filter(order => new Date(order.deliveryDate) < todayStart && order.remaining > 0);
  return {
    pipeline,
    manpower,
    qcIssues,
    stageCounts,
    attention: {
      cuttingBehind: pipeline.filter(order => order.currentStage === "CUTTING"),
      sewingBehind: pipeline.filter(order => order.currentStage === "SEWING"),
      dtfPending: pipeline.filter(order => order.currentStage === "DTF"),
      qcIssues,
      packingPending: pipeline.filter(order => order.currentStage === "PACKING"),
      deliveryPending: pipeline.filter(order => order.currentStage === "DELIVERY"),
      delayed,
    },
  };
}
