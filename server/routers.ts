import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  APP_ROLES,
  attendance,
  CUSTOMER_TYPES,
  cuttingEntries,
  dailyReports,
  customers,
  deliveryEntries,
  expenses,
  employees,
  orderSizes,
  orders,
  ORDER_STATUSES,
  packingEntries,
  machines,
  payments,
  printingEntries,
  productionEntries,
  qcEntries,
  REPORT_TYPES,
  SIZES,
  users,
  normalizeRole,
} from "../drizzle/schema";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { calculateAchievement, calculateGoodQuantity, validateSizeBreakdown } from "../shared/factory";
import {
  dashboardData,
  getDb,
  getOrder,
  getUserById,
  listCustomers,
  listAttendance,
  attendanceSummary,
  listCutting,
  listDelivery,
  listDailyReports,
  listOrders,
  listPacking,
  listPrinting,
  listProduction,
  listQc,
  listUsers,
  phase2Dashboard,
  phase2Pipeline,
  stripOrderCommercial,
  upsertUser,
} from "./db";
import { calculateGoodPrinted, calculatePassRate, validateFullDelivery, validatePrintedAgainstTarget, validateQcQuantities } from "../shared/phase2";
import { listEmployees, listMachines, managementAlerts, managementDashboard, managementReports } from "./management-db";
import { commercialDashboard, commercialOrderSummary, listExpenses, listPayments } from "./commercial-db";
import { calculateEstimatedProfit, calculateNetCashMovement, calculatePaymentSummary } from "../shared/commercial";
import { nanoid } from "nanoid";

const roleValues = z.enum(APP_ROLES);
const customerTypeValues = z.enum(CUSTOMER_TYPES);
const orderStatusValues = z.enum(ORDER_STATUSES);
const reportTypeValues = z.enum(REPORT_TYPES);
const sizeValues = z.enum(SIZES);
const positiveInt = z.number().int().min(0);
function isValidCalendarDate(value: string) {
  const parsed = new Date(`${value}T00:00:00+06:00`);
  return !Number.isNaN(parsed.getTime()) && new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(parsed) === value;
}
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isValidCalendarDate, "Invalid calendar date.");
const attendanceStatusValues = z.enum(["PRESENT", "ABSENT", "LATE", "LEAVE"]);
const cuttingStatusValues = z.enum(["PENDING", "IN PROGRESS", "COMPLETED"]);
const printingStatusValues = z.enum(["NOT REQUIRED", "PENDING", "IN PROGRESS", "COMPLETED"]);
const qcStatusValues = z.enum(["PENDING", "IN PROGRESS", "PASSED", "REWORK REQUIRED", "FAILED"]);
const packingStatusValues = z.enum(["PENDING", "IN PROGRESS", "COMPLETED"]);
const deliveryStatusValues = z.enum(["READY", "PARTIALLY DELIVERED", "DELIVERED"]);
const employeeRoleValues = z.enum(["Operator", "Head Operator", "Cutting Master", "Helper", "QC Staff", "Printing Staff", "Packing Staff", "Manager", "Other"]);
const employeeStatusValues = z.enum(["ACTIVE", "INACTIVE"]);
const machineStatusValues = z.enum(["ACTIVE", "MAINTENANCE", "INACTIVE"]);
const reportPeriodValues = z.enum(["TODAY", "YESTERDAY", "THIS_WEEK", "THIS_MONTH", "CUSTOM"]);
const paymentMethodValues = z.enum(["CASH", "BANK", "MOBILE BANKING", "OTHER"]);
const expenseCategoryValues = z.enum(["FACTORY", "TRANSPORT", "ELECTRICITY", "MAINTENANCE", "PRINTING", "MATERIALS", "PACKAGING", "MARKETING", "OFFICE", "OTHER"]);

function parseDate(value: string) {
  return new Date(`${value}T00:00:00+06:00`);
}

function getDhakaDayBounds(date = new Date()) {
  const dhaka = new Date(date.getTime() + 6 * 60 * 60 * 1000);
  const key = dhaka.toISOString().slice(0, 10);
  return { start: parseDate(key), end: new Date(parseDate(key).getTime() + 86_399_999) };
}

function getReportBounds(input?: { period?: "TODAY" | "YESTERDAY" | "THIS_WEEK" | "THIS_MONTH" | "CUSTOM"; from?: string; to?: string }) {
  const today = getDhakaDayBounds();
  const period = input?.period ?? "TODAY";
  if (period === "TODAY") return today;
  if (period === "YESTERDAY") return { start: new Date(today.start.getTime() - 86_400_000), end: new Date(today.end.getTime() - 86_400_000) };
  if (period === "THIS_WEEK") {
    const mondayOffset = (today.start.getDay() + 6) % 7;
    return { start: new Date(today.start.getTime() - mondayOffset * 86_400_000), end: today.end };
  }
  if (period === "THIS_MONTH") {
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(today.start);
    return { start: parseDate(`${key.slice(0, 7)}-01`), end: today.end };
  }
  if (!input?.from || !input.to) throw new TRPCError({ code: "BAD_REQUEST", message: "Custom reports require both a start and end date." });
  const start = parseDate(input.from);
  const end = new Date(parseDate(input.to).getTime() + 86_399_999);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid custom report date range." });
  return { start, end };
}

function isManagerOrOwner(role: string) {
  return role === "owner" || role === "manager";
}

function isOwner(role: string) {
  return role === "owner";
}

const authenticated = protectedProcedure;
const managementProcedure = authenticated.use(({ ctx, next }) => {
  if (!isManagerOrOwner(normalizeRole(ctx.user.role))) throw new TRPCError({ code: "FORBIDDEN", message: "Manager or owner access required." });
  return next();
});
const financeProcedure = managementProcedure;
const ownerProcedure = authenticated.use(({ ctx, next }) => {
  if (!isOwner(normalizeRole(ctx.user.role))) throw new TRPCError({ code: "FORBIDDEN", message: "Owner access required." });
  return next();
});

const customerInput = z.object({
  customerName: z.string().trim().min(1).max(180),
  companyName: z.string().trim().max(180).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  whatsapp: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().email().max(320).optional().or(z.literal("")),
  country: z.string().trim().max(80).optional().nullable(),
  customerType: customerTypeValues,
  notes: z.string().trim().max(2000).optional().nullable(),
});

const sizeBreakdown = z.array(z.object({ size: sizeValues, quantity: positiveInt })).max(8);
const orderInput = z.object({
  customerId: z.number().int().positive(),
  orderDate: dateString,
  deliveryDate: dateString,
  product: z.string().trim().min(1).max(180),
  productType: z.string().trim().max(100).optional().nullable(),
  styleSku: z.string().trim().max(100).optional().nullable(),
  totalQuantity: z.number().int().positive(),
  sizes: sizeBreakdown,
  orderValue: z.number().min(0).default(0),
  estimatedCost: z.number().min(0).optional().nullable(),
  sewingCharge: z.number().min(0).default(0),
  printingCharge: z.number().min(0).default(0),
  otherCharge: z.number().min(0).default(0),
  advance: z.number().min(0).default(0),
  printingRequired: z.boolean().default(false),
  notes: z.string().trim().max(2000).optional().nullable(),
  status: orderStatusValues.default("DRAFT"),
});

function validateSizes(totalQuantity: number, sizes: { quantity: number }[]) {
  try {
    validateSizeBreakdown(totalQuantity, sizes.map(row => row.quantity));
  } catch (error) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid size breakdown." });
  }
}

function phase2Error(error: unknown) {
  return new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid factory-control values." });
}

async function seedPhase2DemoData() {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select({ id: cuttingEntries.id }).from(cuttingEntries).where(eq(cuttingEntries.isDemo, true)).limit(1);
  if (existing.length) return;
  const demoOrders = await db.select().from(orders).where(eq(orders.isDemo, true)).orderBy(orders.id);
  const demoUsers = await db.select().from(users).where(sql`${users.openId} in ('thread-studio-demo-manager', 'thread-studio-demo-staff')`);
  const managerId = demoUsers.find(user => user.openId.endsWith("manager"))?.id;
  const staffId = demoUsers.find(user => user.openId.endsWith("staff"))?.id;
  if (!managerId || !staffId || !demoOrders[0]) return;
  const today = getDhakaDayBounds().start;
  await db.insert(cuttingEntries).values({ orderId: demoOrders[0].id, cuttingTarget: demoOrders[0].totalQuantity, cutQuantity: demoOrders[0].totalQuantity, cuttingDate: today, cuttingStaffId: staffId, fabricReceivedQuantity: demoOrders[0].totalQuantity + 30, fabricIssuedQuantity: demoOrders[0].totalQuantity, status: "COMPLETED", remarks: "Demo Phase 2A cutting record.", isDemo: true });
  await db.insert(attendance).values([
    { attendanceDate: today, employeeId: managerId, employeeRole: "Manager", status: "PRESENT", checkInTime: new Date(today.getTime() + 8 * 60 * 60 * 1000), remarks: "Demo attendance.", isDemo: true },
    { attendanceDate: today, employeeId: staffId, employeeRole: "Factory Staff", status: "PRESENT", checkInTime: new Date(today.getTime() + 8 * 60 * 60 * 1000 + 15 * 60 * 1000), remarks: "Demo attendance.", isDemo: true },
  ]);
}

async function seedDemoData() {
  const db = await getDb();
  if (!db) return;
  const demoCustomer = await db.select({ id: customers.id }).from(customers).where(eq(customers.isDemo, true)).limit(1);
  if (demoCustomer.length) return;
  await upsertUser({ openId: "thread-studio-demo-owner", name: "Demo Owner", email: "owner@threadstudio.demo", role: "owner", loginMethod: "demo" });
  await upsertUser({ openId: "thread-studio-demo-manager", name: "Demo Manager", email: "manager@threadstudio.demo", role: "manager", loginMethod: "demo" });
  await upsertUser({ openId: "thread-studio-demo-staff", name: "Demo Factory Staff", email: "staff@threadstudio.demo", role: "factory_staff", loginMethod: "demo" });
  const demoUsers = await db.select().from(users).where(sql`${users.openId} in ('thread-studio-demo-owner', 'thread-studio-demo-manager', 'thread-studio-demo-staff')`);
  const ownerId = demoUsers.find(user => user.openId.endsWith("owner"))?.id;
  const managerId = demoUsers.find(user => user.openId.endsWith("manager"))?.id;
  const staffId = demoUsers.find(user => user.openId.endsWith("staff"))?.id;
  if (!ownerId || !managerId || !staffId) return;
  const [customerA] = await db.insert(customers).values({ customerName: "Aisha Rahman", companyName: "Northline Apparel", phone: "+880 1711 000001", whatsapp: "+880 1711 000001", email: "aisha@northline.example", country: "Bangladesh", customerType: "BRAND", notes: "Demo customer — replace with real customer data.", isDemo: true }).$returningId();
  const [customerB] = await db.insert(customers).values({ customerName: "Daniel Wong", companyName: "Pacific Streetwear", phone: "+65 6000 0002", whatsapp: "+65 6000 0002", email: "daniel@pacific.example", country: "Singapore", customerType: "INTERNATIONAL", notes: "Demo customer — replace with real customer data.", isDemo: true }).$returningId();
  const today = getDhakaDayBounds().start;
  const orderRows = await db.insert(orders).values([
    { orderCode: "TS-DEMO-001", customerId: customerA.id, orderDate: new Date(today.getTime() - 8 * 86_400_000), deliveryDate: new Date(today.getTime() + 3 * 86_400_000), product: "Heavyweight Pullover Hoodie", productType: "Knit Garment", styleSku: "TS-HDY-001", totalQuantity: 240, sewingCharge: "72000", printingCharge: "18000", otherCharge: "2500", advance: "30000", notes: "Demo order — replace with real order data.", status: "IN PRODUCTION", isDemo: true, createdBy: ownerId },
    { orderCode: "TS-DEMO-002", customerId: customerB.id, orderDate: new Date(today.getTime() - 15 * 86_400_000), deliveryDate: new Date(today.getTime() - 1 * 86_400_000), product: "Oversized Graphic T-Shirt", productType: "Knit Garment + DTF", styleSku: "TS-TEE-014", totalQuantity: 180, sewingCharge: "36000", printingCharge: "22500", otherCharge: "1500", advance: "20000", notes: "Demo order — overdue example.", status: "IN PRODUCTION", isDemo: true, createdBy: managerId },
  ]).$returningId();
  const orderA = orderRows[0]?.id;
  const orderB = orderRows[1]?.id;
  if (!orderA || !orderB) return;
  await db.insert(orderSizes).values([
    { orderId: orderA, size: "S", quantity: 40 }, { orderId: orderA, size: "M", quantity: 80 }, { orderId: orderA, size: "L", quantity: 80 }, { orderId: orderA, size: "XL", quantity: 40 },
    { orderId: orderB, size: "S", quantity: 30 }, { orderId: orderB, size: "M", quantity: 60 }, { orderId: orderB, size: "L", quantity: 60 }, { orderId: orderB, size: "XL", quantity: 30 },
  ]);
  await db.insert(productionEntries).values([
    { orderId: orderA, productionDate: new Date(today.getTime() - 2 * 86_400_000), productionTarget: 70, actualProduction: 62, rejectedQuantity: 3, operatorId: staffId, remarks: "Demo entry — line 1.", isDemo: true },
    { orderId: orderA, productionDate: new Date(today.getTime() - 1 * 86_400_000), productionTarget: 70, actualProduction: 76, rejectedQuantity: 4, operatorId: staffId, remarks: "Demo entry — line 1.", isDemo: true },
    { orderId: orderA, productionDate: today, productionTarget: 80, actualProduction: 54, rejectedQuantity: 2, operatorId: staffId, remarks: "Demo entry — morning run.", isDemo: true },
    { orderId: orderB, productionDate: new Date(today.getTime() - 2 * 86_400_000), productionTarget: 60, actualProduction: 48, rejectedQuantity: 5, operatorId: staffId, remarks: "Demo entry — DTF delay.", isDemo: true },
    { orderId: orderB, productionDate: new Date(today.getTime() - 1 * 86_400_000), productionTarget: 60, actualProduction: 55, rejectedQuantity: 4, operatorId: staffId, remarks: "Demo entry — DTF delay.", isDemo: true },
  ]);
  await db.insert(dailyReports).values([
    { reportDate: today, reportType: "MORNING", managerId, presentWorkers: 24, absentWorkers: 3, lateWorkers: 2, todaysProductionTarget: 140, pendingProduction: 244, importantIssues: "One DTF printer needs cleaning before the second shift.", managerRemarks: "Demo report — replace with today’s factory report.", isDemo: true },
    { reportDate: new Date(today.getTime() - 86_400_000), reportType: "CLOSING", managerId, presentWorkers: 25, actualProduction: 131, goodProduction: 124, rejectedProduction: 7, pendingProduction: 244, ordersCompleted: 0, issues: "Packing line waiting on labels.", deliveryRequirement: "Prioritize TS-DEMO-002 tomorrow morning.", managerRemarks: "Demo report — replace with real closing report.", isDemo: true },
  ]);
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(async opts => {
      await seedDemoData();
      await seedPhase2DemoData();
      return opts.ctx.user;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  dashboard: router({
    overview: authenticated.query(async ({ ctx }) => {
      const { start, end } = getDhakaDayBounds();
      return dashboardData(start, end, !isManagerOrOwner(normalizeRole(ctx.user.role)));
    }),
  }),
  customers: router({
    list: authenticated.input(z.object({ search: z.string().optional(), type: z.string().optional() }).optional()).query(({ input }) => listCustomers(input?.search, input?.type)),
    create: managementProcedure.input(customerInput).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const [created] = await db.insert(customers).values({ ...input, email: input.email || null, isDemo: false }).$returningId();
      return created;
    }),
    update: managementProcedure.input(z.object({ id: z.number().int().positive(), data: customerInput })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      await db.update(customers).set({ ...input.data, email: input.data.email || null }).where(eq(customers.id, input.id));
      return { success: true };
    }),
    remove: ownerProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      await db.delete(customers).where(eq(customers.id, input.id));
      return { success: true };
    }),
  }),
  orders: router({
    list: authenticated.query(async ({ ctx }) => { const rows = await listOrders(); return isManagerOrOwner(normalizeRole(ctx.user.role)) ? rows : rows.map(row => ({ ...row, order: stripOrderCommercial(row.order) })); }),
    get: authenticated.input(z.object({ id: z.number().int().positive() })).query(async ({ input, ctx }) => { const row = await getOrder(input.id); if (!row || isManagerOrOwner(normalizeRole(ctx.user.role))) return row; return { ...row, order: stripOrderCommercial(row.order) }; }),
    create: managementProcedure.input(orderInput).mutation(async ({ input, ctx }) => {
      validateSizes(input.totalQuantity, input.sizes);
      if (parseDate(input.deliveryDate) < parseDate(input.orderDate)) throw new TRPCError({ code: "BAD_REQUEST", message: "Delivery date cannot be before order date." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const [created] = await db.insert(orders).values({ orderCode: `TS-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`, customerId: input.customerId, orderDate: parseDate(input.orderDate), deliveryDate: parseDate(input.deliveryDate), product: input.product, productType: input.productType || null, styleSku: input.styleSku || null, totalQuantity: input.totalQuantity, orderValue: input.orderValue.toFixed(2), estimatedCost: input.estimatedCost === null || input.estimatedCost === undefined ? null : input.estimatedCost.toFixed(2), sewingCharge: input.sewingCharge.toFixed(2), printingCharge: input.printingCharge.toFixed(2), otherCharge: input.otherCharge.toFixed(2), advance: input.advance.toFixed(2), printingRequired: input.printingRequired, notes: input.notes || null, status: input.status, createdBy: ctx.user.id, isDemo: false }).$returningId();
      if (!created?.id) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Order could not be created." });
      if (input.sizes.length) await db.insert(orderSizes).values(input.sizes.map(row => ({ orderId: created.id, size: row.size, quantity: row.quantity })));
      return { id: created.id };
    }),
    updateStatus: managementProcedure.input(z.object({ id: z.number().int().positive(), status: orderStatusValues })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      await db.update(orders).set({ status: input.status }).where(eq(orders.id, input.id));
      return { success: true };
    }),
    setPrintingRequired: managementProcedure.input(z.object({ id: z.number().int().positive(), printingRequired: z.boolean() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      await db.update(orders).set({ printingRequired: input.printingRequired }).where(eq(orders.id, input.id));
      return { success: true };
    }),
    setCommercial: financeProcedure.input(z.object({ id: z.number().int().positive(), orderValue: z.number().min(0), estimatedCost: z.number().min(0).optional().nullable() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const existing = await db.select({ id: orders.id }).from(orders).where(eq(orders.id, input.id)).limit(1);
      if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
      await db.update(orders).set({ orderValue: input.orderValue.toFixed(2), estimatedCost: input.estimatedCost === null || input.estimatedCost === undefined ? null : input.estimatedCost.toFixed(2) }).where(eq(orders.id, input.id));
      return { success: true, estimatedProfit: calculateEstimatedProfit(input.orderValue, input.estimatedCost) };
    }),
    remove: ownerProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      await db.delete(orders).where(eq(orders.id, input.id));
      return { success: true };
    }),
  }),
  production: router({
    list: authenticated.input(z.object({ orderId: z.number().int().positive().optional(), operatorId: z.number().int().positive().optional(), from: dateString.optional(), to: dateString.optional() }).optional()).query(({ input }) => listProduction(input ? { ...input, from: input.from ? parseDate(input.from) : undefined, to: input.to ? new Date(parseDate(input.to).getTime() + 86_399_999) : undefined } : undefined)),
    create: authenticated.input(z.object({ orderId: z.number().int().positive(), productionDate: dateString, productionTarget: positiveInt, actualProduction: positiveInt, rejectedQuantity: positiveInt, operatorId: z.number().int().positive().optional(), remarks: z.string().trim().max(2000).optional().nullable() })).mutation(async ({ input, ctx }) => {
      if (input.rejectedQuantity > input.actualProduction) throw new TRPCError({ code: "BAD_REQUEST", message: "Rejected quantity cannot exceed actual production." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const order = await getOrder(input.orderId);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
      const good = calculateGoodQuantity(input.actualProduction, input.rejectedQuantity);
      const existingGood = Number(order.production?.totalGood ?? 0);
      if (existingGood + good > order.order.totalQuantity) throw new TRPCError({ code: "BAD_REQUEST", message: `Good production would exceed order quantity by ${existingGood + good - order.order.totalQuantity}.` });
      await db.insert(productionEntries).values({ orderId: input.orderId, productionDate: parseDate(input.productionDate), productionTarget: input.productionTarget, actualProduction: input.actualProduction, rejectedQuantity: input.rejectedQuantity, operatorId: input.operatorId ?? ctx.user.id, remarks: input.remarks || null, isDemo: false });
      if (existingGood + good >= order.order.totalQuantity) await db.update(orders).set({ status: "PRODUCTION COMPLETED" }).where(eq(orders.id, input.orderId));
      else if (order.order.status === "CONFIRMED" || order.order.status === "DRAFT") await db.update(orders).set({ status: "IN PRODUCTION" }).where(eq(orders.id, input.orderId));
      return { goodQuantity: good, achievement: calculateAchievement(input.actualProduction, input.productionTarget) };
    }),
  }),
  phase2: router({
    staff: authenticated.query(() => listUsers()),
    pipeline: authenticated.query(async ({ ctx }) => { const rows = await phase2Pipeline(); return isManagerOrOwner(normalizeRole(ctx.user.role)) ? rows : rows.map(row => stripOrderCommercial(row)); }),
    dashboard: authenticated.query(async ({ ctx }) => { const result = await phase2Dashboard(getDhakaDayBounds().start); if (isManagerOrOwner(normalizeRole(ctx.user.role))) return result; return { ...result, pipeline: result.pipeline.map(row => stripOrderCommercial(row)), attention: { ...result.attention, cuttingBehind: result.attention.cuttingBehind.map(row => stripOrderCommercial(row)), sewingBehind: result.attention.sewingBehind.map(row => stripOrderCommercial(row)), dtfPending: result.attention.dtfPending.map(row => stripOrderCommercial(row)), packingPending: result.attention.packingPending.map(row => stripOrderCommercial(row)), deliveryPending: result.attention.deliveryPending.map(row => stripOrderCommercial(row)), delayed: result.attention.delayed.map(row => stripOrderCommercial(row)) } }; }),
    attendance: router({
      list: authenticated.input(z.object({ date: dateString.optional() }).optional()).query(({ input }) => listAttendance(input?.date ? parseDate(input.date) : getDhakaDayBounds().start)),
      summary: authenticated.input(z.object({ date: dateString.optional() }).optional()).query(({ input }) => attendanceSummary(input?.date ? parseDate(input.date) : getDhakaDayBounds().start)),
      save: managementProcedure.input(z.object({ employeeId: z.number().int().positive(), employeeRole: z.string().trim().min(1).max(80), attendanceDate: dateString, status: attendanceStatusValues, checkInTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(), remarks: z.string().trim().max(2000).optional().nullable() })).mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        const day = parseDate(input.attendanceDate);
        const checkInTime = input.checkInTime ? new Date(`${input.attendanceDate}T${input.checkInTime}:00+06:00`) : null;
        const existing = await db.select({ id: attendance.id }).from(attendance).where(and(eq(attendance.attendanceDate, day), eq(attendance.employeeId, input.employeeId))).limit(1);
        const data = { attendanceDate: day, employeeId: input.employeeId, employeeRole: input.employeeRole, status: input.status, checkInTime, remarks: input.remarks || null, isDemo: false };
        if (existing[0]) await db.update(attendance).set(data).where(eq(attendance.id, existing[0].id)); else await db.insert(attendance).values(data);
        return { success: true };
      }),
    }),
    cutting: router({
      list: authenticated.query(() => listCutting()),
      create: authenticated.input(z.object({ orderId: z.number().int().positive(), cuttingTarget: positiveInt, cutQuantity: positiveInt, cuttingDate: dateString, cuttingStaffId: z.number().int().positive().optional(), fabricReceivedQuantity: positiveInt.optional(), fabricIssuedQuantity: positiveInt.optional(), status: cuttingStatusValues, remarks: z.string().trim().max(2000).optional().nullable() })).mutation(async ({ input, ctx }) => {
        const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        const pipeline = await phase2Pipeline(); const order = pipeline.find(row => row.id === input.orderId); if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
        if (order.cutQuantity + input.cutQuantity > order.totalQuantity) throw new TRPCError({ code: "BAD_REQUEST", message: `Cut quantity would exceed order quantity by ${order.cutQuantity + input.cutQuantity - order.totalQuantity}.` });
        await db.insert(cuttingEntries).values({ orderId: input.orderId, cuttingTarget: input.cuttingTarget, cutQuantity: input.cutQuantity, cuttingDate: parseDate(input.cuttingDate), cuttingStaffId: input.cuttingStaffId ?? ctx.user.id, fabricReceivedQuantity: input.fabricReceivedQuantity ?? 0, fabricIssuedQuantity: input.fabricIssuedQuantity ?? 0, status: input.status, remarks: input.remarks || null, isDemo: false });
        return { success: true, remaining: order.totalQuantity - order.cutQuantity - input.cutQuantity };
      }),
    }),
    printing: router({
      list: authenticated.query(() => listPrinting()),
      create: authenticated.input(z.object({ orderId: z.number().int().positive(), printType: z.string().trim().max(100).optional().nullable(), designReference: z.string().trim().max(180).optional().nullable(), printingTarget: positiveInt, printedQuantity: positiveInt, rejectedQuantity: positiveInt, printingDate: dateString, printingStaffId: z.number().int().positive().optional(), status: printingStatusValues, remarks: z.string().trim().max(2000).optional().nullable() })).mutation(async ({ input, ctx }) => {
        if (input.rejectedQuantity > input.printedQuantity) throw phase2Error(new Error("Rejected quantity cannot exceed printed quantity."));
        try { validatePrintedAgainstTarget(input.printedQuantity, input.printingTarget); } catch (error) { throw phase2Error(error); }
        const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        const pipeline = await phase2Pipeline(); const order = pipeline.find(row => row.id === input.orderId); if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
        if (!order.printingRequired && input.status !== "NOT REQUIRED") throw new TRPCError({ code: "BAD_REQUEST", message: "This order is not marked as requiring DTF printing." });
        if (order.goodPrinted + input.printedQuantity - input.rejectedQuantity > order.totalQuantity) throw new TRPCError({ code: "BAD_REQUEST", message: "Good printed quantity cannot exceed order quantity." });
        await db.insert(printingEntries).values({ orderId: input.orderId, printType: input.printType || null, designReference: input.designReference || null, printingTarget: input.printingTarget, printedQuantity: input.printedQuantity, rejectedQuantity: input.rejectedQuantity, printingDate: parseDate(input.printingDate), printingStaffId: input.printingStaffId ?? ctx.user.id, status: input.status, remarks: input.remarks || null, isDemo: false });
        return { success: true, goodQuantity: calculateGoodPrinted(input.printedQuantity, input.rejectedQuantity) };
      }),
    }),
    qc: router({
      list: authenticated.query(() => listQc()),
      create: authenticated.input(z.object({ orderId: z.number().int().positive(), qcDate: dateString, checkedQuantity: positiveInt, passedQuantity: positiveInt, failedQuantity: positiveInt, reworkQuantity: positiveInt, qcStaffId: z.number().int().positive().optional(), defectType: z.string().trim().max(120).optional().nullable(), status: qcStatusValues, remarks: z.string().trim().max(2000).optional().nullable() })).mutation(async ({ input, ctx }) => {
        try { validateQcQuantities(input.checkedQuantity, input.passedQuantity, input.failedQuantity, input.reworkQuantity); } catch (error) { throw phase2Error(error); }
        const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        const pipeline = await phase2Pipeline(); const order = pipeline.find(row => row.id === input.orderId); if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
        if (order.checkedQc + input.checkedQuantity > order.totalQuantity) throw new TRPCError({ code: "BAD_REQUEST", message: "Checked quantity cannot exceed order quantity." });
        await db.insert(qcEntries).values({ orderId: input.orderId, qcDate: parseDate(input.qcDate), checkedQuantity: input.checkedQuantity, passedQuantity: input.passedQuantity, failedQuantity: input.failedQuantity, reworkQuantity: input.reworkQuantity, qcStaffId: input.qcStaffId ?? ctx.user.id, defectType: input.defectType || null, status: input.status, remarks: input.remarks || null, isDemo: false });
        return { success: true, passRate: calculatePassRate(input.passedQuantity, input.checkedQuantity) };
      }),
    }),
    packing: router({
      list: authenticated.query(() => listPacking()),
      create: authenticated.input(z.object({ orderId: z.number().int().positive(), packingTarget: positiveInt, packedQuantity: positiveInt, packingDate: dateString, packingStaffId: z.number().int().positive().optional(), status: packingStatusValues, remarks: z.string().trim().max(2000).optional().nullable() })).mutation(async ({ input, ctx }) => {
        const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        const pipeline = await phase2Pipeline(); const order = pipeline.find(row => row.id === input.orderId); if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
        if (order.packed + input.packedQuantity > order.totalQuantity) throw new TRPCError({ code: "BAD_REQUEST", message: "Packed quantity cannot exceed order quantity." });
        await db.insert(packingEntries).values({ orderId: input.orderId, packingTarget: input.packingTarget, packedQuantity: input.packedQuantity, packingDate: parseDate(input.packingDate), packingStaffId: input.packingStaffId ?? ctx.user.id, status: input.status, remarks: input.remarks || null, isDemo: false });
        return { success: true, remaining: order.totalQuantity - order.packed - input.packedQuantity };
      }),
    }),
    delivery: router({
      list: authenticated.query(() => listDelivery()),
      create: authenticated.input(z.object({ orderId: z.number().int().positive(), deliveryDate: dateString, deliveredQuantity: positiveInt, deliveryStatus: deliveryStatusValues, receiverCustomer: z.string().trim().max(180).optional().nullable(), deliveryNote: z.string().trim().max(180).optional().nullable(), remarks: z.string().trim().max(2000).optional().nullable() })).mutation(async ({ input }) => {
        const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        const pipeline = await phase2Pipeline(); const order = pipeline.find(row => row.id === input.orderId); if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
        const totalDelivered = order.delivered + input.deliveredQuantity;
        try { validateFullDelivery(totalDelivered, order.totalQuantity, input.deliveryStatus); } catch (error) { throw phase2Error(error); }
        if (input.deliveryStatus === "PARTIALLY DELIVERED" && totalDelivered >= order.totalQuantity) throw new TRPCError({ code: "BAD_REQUEST", message: "Use DELIVERED when the full quantity has been delivered." });
        await db.insert(deliveryEntries).values({ orderId: input.orderId, deliveryDate: parseDate(input.deliveryDate), deliveredQuantity: input.deliveredQuantity, deliveryStatus: input.deliveryStatus, receiverCustomer: input.receiverCustomer || null, deliveryNote: input.deliveryNote || null, remarks: input.remarks || null, isDemo: false });
        if (totalDelivered === order.totalQuantity) await db.update(orders).set({ status: "DELIVERED" }).where(eq(orders.id, input.orderId));
        return { success: true, remaining: order.totalQuantity - totalDelivered };
      }),
    }),
  }),
  management: router({
    overview: authenticated.query(async () => {
      const { start, end } = getDhakaDayBounds();
      return managementDashboard(start, end);
    }),
    alerts: authenticated.query(async () => {
      const { start, end } = getDhakaDayBounds();
      return managementAlerts(start, end);
    }),
    reports: authenticated.input(z.object({ period: reportPeriodValues.default("TODAY"), from: dateString.optional(), to: dateString.optional() }).optional()).query(({ input }) => {
      const bounds = getReportBounds(input);
      return managementReports({ from: bounds.start, to: bounds.end });
    }),
    employees: router({
      list: authenticated.query(() => listEmployees()),
      create: managementProcedure.input(z.object({ employeeCode: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(180), phone: z.string().trim().max(40).optional().nullable(), role: employeeRoleValues, department: z.string().trim().max(100).optional().nullable(), joiningDate: dateString.optional().nullable(), status: employeeStatusValues.default("ACTIVE"), notes: z.string().trim().max(2000).optional().nullable() })).mutation(async ({ input, ctx }) => {
        const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        const existing = await db.select({ id: employees.id }).from(employees).where(eq(employees.employeeCode, input.employeeCode)).limit(1);
        if (existing[0]) throw new TRPCError({ code: "CONFLICT", message: "Employee ID already exists." });
        const [created] = await db.insert(employees).values({ ...input, joiningDate: input.joiningDate ? parseDate(input.joiningDate) : null, createdBy: ctx.user.id, status: input.status, phone: input.phone || null, department: input.department || null, notes: input.notes || null }).$returningId();
        return created;
      }),
      update: managementProcedure.input(z.object({ id: z.number().int().positive(), data: z.object({ employeeCode: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(180), phone: z.string().trim().max(40).optional().nullable(), role: employeeRoleValues, department: z.string().trim().max(100).optional().nullable(), joiningDate: dateString.optional().nullable(), status: employeeStatusValues, notes: z.string().trim().max(2000).optional().nullable() }) })).mutation(async ({ input, ctx }) => {
        if (input.data.status === "INACTIVE" && !isOwner(normalizeRole(ctx.user.role))) throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can deactivate employees." });
        const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        await db.update(employees).set({ ...input.data, joiningDate: input.data.joiningDate ? parseDate(input.data.joiningDate) : null, phone: input.data.phone || null, department: input.data.department || null, notes: input.data.notes || null }).where(eq(employees.id, input.id));
        return { success: true };
      }),
      deactivate: ownerProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
        const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        await db.update(employees).set({ status: "INACTIVE" }).where(eq(employees.id, input.id));
        return { success: true };
      }),
    }),
    machines: router({
      list: authenticated.query(() => listMachines()),
      create: managementProcedure.input(z.object({ machineCode: z.string().trim().min(1).max(40), machineType: z.string().trim().min(1).max(100), brandModel: z.string().trim().max(160).optional().nullable(), assignedEmployeeId: z.number().int().positive().optional().nullable(), status: machineStatusValues.default("ACTIVE"), location: z.string().trim().max(120).optional().nullable(), notes: z.string().trim().max(2000).optional().nullable() })).mutation(async ({ input, ctx }) => {
        const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        if (input.assignedEmployeeId) { const assigned = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, input.assignedEmployeeId), eq(employees.status, "ACTIVE"))).limit(1); if (!assigned[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Machines can only be assigned to active employees." }); }
        const existing = await db.select({ id: machines.id }).from(machines).where(eq(machines.machineCode, input.machineCode)).limit(1);
        if (existing[0]) throw new TRPCError({ code: "CONFLICT", message: "Machine ID already exists." });
        const [created] = await db.insert(machines).values({ ...input, createdBy: ctx.user.id, brandModel: input.brandModel || null, location: input.location || null, notes: input.notes || null, assignedEmployeeId: input.assignedEmployeeId || null, status: input.status }).$returningId();
        return created;
      }),
      update: managementProcedure.input(z.object({ id: z.number().int().positive(), data: z.object({ machineCode: z.string().trim().min(1).max(40), machineType: z.string().trim().min(1).max(100), brandModel: z.string().trim().max(160).optional().nullable(), assignedEmployeeId: z.number().int().positive().optional().nullable(), status: machineStatusValues, location: z.string().trim().max(120).optional().nullable(), notes: z.string().trim().max(2000).optional().nullable() }) })).mutation(async ({ input }) => {
        const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        if (input.data.assignedEmployeeId) { const assigned = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, input.data.assignedEmployeeId), eq(employees.status, "ACTIVE"))).limit(1); if (!assigned[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Machines can only be assigned to active employees." }); }
        await db.update(machines).set({ ...input.data, brandModel: input.data.brandModel || null, location: input.data.location || null, notes: input.data.notes || null, assignedEmployeeId: input.data.assignedEmployeeId || null }).where(eq(machines.id, input.id));
        return { success: true };
      }),
    }),
  }),
  commercial: router({
    dashboard: financeProcedure.input(z.object({ period: reportPeriodValues.default("TODAY"), from: dateString.optional(), to: dateString.optional() }).optional()).query(({ input }) => {
      const bounds = getReportBounds(input);
      return commercialDashboard({ from: bounds.start, to: bounds.end });
    }),
    orderSummary: financeProcedure.input(z.object({ orderId: z.number().int().positive() })).query(({ input }) => commercialOrderSummary(input.orderId)),
    payments: router({
      list: financeProcedure.query(() => listPayments()),
      create: financeProcedure.input(z.object({ orderId: z.number().int().positive(), customerId: z.number().int().positive(), paymentDate: dateString, amount: z.number().min(0), paymentMethod: paymentMethodValues, reference: z.string().trim().max(160).optional().nullable(), notes: z.string().trim().max(2000).optional().nullable() })).mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        const order = await db.select({ id: orders.id, customerId: orders.customerId }).from(orders).where(eq(orders.id, input.orderId)).limit(1);
        if (!order[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
        if (order[0].customerId !== input.customerId) throw new TRPCError({ code: "BAD_REQUEST", message: "Payment customer must match the order customer." });
        const customer = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, input.customerId)).limit(1);
        if (!customer[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found." });
        const [created] = await db.insert(payments).values({ paymentCode: `PAY-${Date.now()}-${nanoid(5)}`, orderId: input.orderId, customerId: input.customerId, paymentDate: parseDate(input.paymentDate), amount: input.amount.toFixed(2), paymentMethod: input.paymentMethod, reference: input.reference || null, receivedBy: ctx.user.id, notes: input.notes || null, isDemo: false }).$returningId();
        return { ...created, summary: await commercialOrderSummary(input.orderId) };
      }),
      update: ownerProcedure.input(z.object({ id: z.number().int().positive(), orderId: z.number().int().positive(), customerId: z.number().int().positive(), paymentDate: dateString, amount: z.number().min(0), paymentMethod: paymentMethodValues, reference: z.string().trim().max(160).optional().nullable(), notes: z.string().trim().max(2000).optional().nullable() })).mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        const order = await db.select({ customerId: orders.customerId }).from(orders).where(eq(orders.id, input.orderId)).limit(1);
        if (!order[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
        if (order[0].customerId !== input.customerId) throw new TRPCError({ code: "BAD_REQUEST", message: "Payment customer must match the order customer." });
        await db.update(payments).set({ orderId: input.orderId, customerId: input.customerId, paymentDate: parseDate(input.paymentDate), amount: input.amount.toFixed(2), paymentMethod: input.paymentMethod, reference: input.reference || null, notes: input.notes || null }).where(eq(payments.id, input.id));
        return { success: true };
      }),
      remove: ownerProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        await db.delete(payments).where(eq(payments.id, input.id));
        return { success: true };
      }),
    }),
    expenses: router({
      list: financeProcedure.query(() => listExpenses()),
      create: financeProcedure.input(z.object({ expenseDate: dateString, category: expenseCategoryValues, amount: z.number().positive(), paymentMethod: paymentMethodValues, description: z.string().trim().min(1).max(240), notes: z.string().trim().max(2000).optional().nullable() })).mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        const [created] = await db.insert(expenses).values({ expenseDate: parseDate(input.expenseDate), category: input.category, amount: input.amount.toFixed(2), paymentMethod: input.paymentMethod, description: input.description, recordedBy: ctx.user.id, notes: input.notes || null, isDemo: false }).$returningId();
        return created;
      }),
      update: ownerProcedure.input(z.object({ id: z.number().int().positive(), expenseDate: dateString, category: expenseCategoryValues, amount: z.number().positive(), paymentMethod: paymentMethodValues, description: z.string().trim().min(1).max(240), notes: z.string().trim().max(2000).optional().nullable() })).mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        await db.update(expenses).set({ expenseDate: parseDate(input.expenseDate), category: input.category, amount: input.amount.toFixed(2), paymentMethod: input.paymentMethod, description: input.description, notes: input.notes || null }).where(eq(expenses.id, input.id));
        return { success: true };
      }),
      remove: ownerProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
        await db.delete(expenses).where(eq(expenses.id, input.id));
        return { success: true };
      }),
    }),
    reports: router({
      payments: financeProcedure.input(z.object({ period: reportPeriodValues.default("TODAY"), from: dateString.optional(), to: dateString.optional() }).optional()).query(({ input }) => { const bounds = getReportBounds(input); return listPayments({ from: bounds.start, to: bounds.end }); }),
      expenses: financeProcedure.input(z.object({ period: reportPeriodValues.default("TODAY"), from: dateString.optional(), to: dateString.optional() }).optional()).query(({ input }) => { const bounds = getReportBounds(input); return listExpenses({ from: bounds.start, to: bounds.end }); }),
      outstanding: financeProcedure.query(async () => {
        const summary = await commercialDashboard({ from: new Date(0), to: new Date() });
        return summary?.outstandingRows ?? [];
      }),
    }),
  }),
  reports: router({
    list: authenticated.input(z.object({ type: reportTypeValues.optional() }).optional()).query(({ input }) => listDailyReports(input?.type)),
    save: authenticated.input(z.object({
      reportDate: dateString,
      reportType: reportTypeValues,
      presentWorkers: positiveInt,
      absentWorkers: positiveInt.optional(),
      lateWorkers: positiveInt.optional(),
      todaysProductionTarget: positiveInt.optional(),
      pendingProduction: positiveInt.optional(),
      importantIssues: z.string().trim().max(3000).optional().nullable(),
      actualProduction: positiveInt.optional(),
      goodProduction: positiveInt.optional(),
      rejectedProduction: positiveInt.optional(),
      ordersCompleted: positiveInt.optional(),
      issues: z.string().trim().max(3000).optional().nullable(),
      deliveryRequirement: z.string().trim().max(2000).optional().nullable(),
      managerRemarks: z.string().trim().max(3000).optional().nullable(),
    })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const { start } = getDhakaDayBounds(parseDate(input.reportDate));
      const data = { reportDate: start, reportType: input.reportType, managerId: ctx.user.id, presentWorkers: input.presentWorkers, absentWorkers: input.absentWorkers ?? 0, lateWorkers: input.lateWorkers ?? 0, todaysProductionTarget: input.todaysProductionTarget ?? 0, pendingProduction: input.pendingProduction ?? 0, importantIssues: input.importantIssues || null, actualProduction: input.actualProduction ?? 0, goodProduction: input.goodProduction ?? 0, rejectedProduction: input.rejectedProduction ?? 0, ordersCompleted: input.ordersCompleted ?? 0, issues: input.issues || null, deliveryRequirement: input.deliveryRequirement || null, managerRemarks: input.managerRemarks || null, isDemo: false };
      const existing = await db.select({ id: dailyReports.id }).from(dailyReports).where(and(eq(dailyReports.reportDate, start), eq(dailyReports.reportType, input.reportType))).limit(1);
      if (existing[0]) await db.update(dailyReports).set(data).where(eq(dailyReports.id, existing[0].id));
      else await db.insert(dailyReports).values(data);
      return { success: true };
    }),
  }),
  users: router({
    list: ownerProcedure.query(() => listUsers()),
    updateRole: ownerProcedure.input(z.object({ id: z.number().int().positive(), role: roleValues })).mutation(async ({ input, ctx }) => {
      if (input.id === ctx.user.id && input.role !== "owner") throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot remove your own owner access." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const user = await getUserById(input.id);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      await db.update(users).set({ role: input.role }).where(eq(users.id, input.id));
      return { success: true };
    }),
  }),
});

export type AppRouter = typeof appRouter;
