import {
  boolean,
  decimal,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["owner", "manager", "factory_staff", "user", "admin"]).default("factory_staff").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const customers = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  customerName: varchar("customerName", { length: 180 }).notNull(),
  companyName: varchar("companyName", { length: 180 }),
  phone: varchar("phone", { length: 40 }),
  whatsapp: varchar("whatsapp", { length: 40 }),
  email: varchar("email", { length: 320 }),
  country: varchar("country", { length: 80 }),
  customerType: mysqlEnum("customerType", ["LOCAL", "INTERNATIONAL", "BUYER", "BRAND", "RESELLER", "OTHER"]).default("LOCAL").notNull(),
  notes: text("notes"),
  isDemo: boolean("isDemo").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  nameIdx: index("customers_name_idx").on(table.customerName),
  typeIdx: index("customers_type_idx").on(table.customerType),
}));

export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  orderCode: varchar("orderCode", { length: 40 }).notNull(),
  customerId: int("customerId").notNull().references(() => customers.id),
  orderDate: timestamp("orderDate").notNull(),
  deliveryDate: timestamp("deliveryDate").notNull(),
  product: varchar("product", { length: 180 }).notNull(),
  productType: varchar("productType", { length: 100 }),
  styleSku: varchar("styleSku", { length: 100 }),
  totalQuantity: int("totalQuantity").notNull(),
  orderValue: decimal("orderValue", { precision: 14, scale: 2 }).default("0").notNull(),
  estimatedCost: decimal("estimatedCost", { precision: 14, scale: 2 }),
  sewingCharge: decimal("sewingCharge", { precision: 12, scale: 2 }).default("0").notNull(),
  printingCharge: decimal("printingCharge", { precision: 12, scale: 2 }).default("0").notNull(),
  otherCharge: decimal("otherCharge", { precision: 12, scale: 2 }).default("0").notNull(),
  advance: decimal("advance", { precision: 12, scale: 2 }).default("0").notNull(),
  printingRequired: boolean("printingRequired").default(false).notNull(),
  notes: text("notes"),
  status: mysqlEnum("status", ["DRAFT", "CONFIRMED", "IN PRODUCTION", "PRODUCTION COMPLETED", "QC", "READY", "DELIVERED", "CANCELLED"]).default("DRAFT").notNull(),
  isDemo: boolean("isDemo").default(false).notNull(),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  codeIdx: uniqueIndex("orders_code_unique").on(table.orderCode),
  customerIdx: index("orders_customer_idx").on(table.customerId),
  deliveryIdx: index("orders_delivery_idx").on(table.deliveryDate),
  statusIdx: index("orders_status_idx").on(table.status),
}));

export const orderSizes = mysqlTable("order_sizes", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().references(() => orders.id, { onDelete: "cascade" }),
  size: varchar("size", { length: 20 }).notNull(),
  quantity: int("quantity").notNull(),
}, table => ({
  orderSizeUnique: uniqueIndex("order_sizes_order_size_unique").on(table.orderId, table.size),
  orderIdx: index("order_sizes_order_idx").on(table.orderId),
}));

export const productionEntries = mysqlTable("production_entries", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().references(() => orders.id),
  productionDate: timestamp("productionDate").notNull(),
  productionTarget: int("productionTarget").notNull(),
  actualProduction: int("actualProduction").notNull(),
  rejectedQuantity: int("rejectedQuantity").notNull(),
  operatorId: int("operatorId").notNull().references(() => users.id),
  remarks: text("remarks"),
  isDemo: boolean("isDemo").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  dateIdx: index("production_date_idx").on(table.productionDate),
  orderIdx: index("production_order_idx").on(table.orderId),
  operatorIdx: index("production_operator_idx").on(table.operatorId),
}));

export const dailyReports = mysqlTable("daily_reports", {
  id: int("id").autoincrement().primaryKey(),
  reportDate: timestamp("reportDate").notNull(),
  reportType: mysqlEnum("reportType", ["MORNING", "CLOSING"]).notNull(),
  managerId: int("managerId").notNull().references(() => users.id),
  presentWorkers: int("presentWorkers").default(0).notNull(),
  absentWorkers: int("absentWorkers").default(0).notNull(),
  lateWorkers: int("lateWorkers").default(0).notNull(),
  todaysProductionTarget: int("todaysProductionTarget").default(0).notNull(),
  pendingProduction: int("pendingProduction").default(0).notNull(),
  importantIssues: text("importantIssues"),
  actualProduction: int("actualProduction").default(0).notNull(),
  goodProduction: int("goodProduction").default(0).notNull(),
  rejectedProduction: int("rejectedProduction").default(0).notNull(),
  ordersCompleted: int("ordersCompleted").default(0).notNull(),
  issues: text("issues"),
  deliveryRequirement: text("deliveryRequirement"),
  managerRemarks: text("managerRemarks"),
  isDemo: boolean("isDemo").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  reportDateIdx: index("daily_reports_date_idx").on(table.reportDate),
  reportUnique: uniqueIndex("daily_reports_date_type_unique").on(table.reportDate, table.reportType),
}));

export const attendance = mysqlTable("attendance", {
  id: int("id").autoincrement().primaryKey(),
  attendanceDate: timestamp("attendanceDate").notNull(),
  employeeId: int("employeeId").notNull().references(() => users.id),
  employeeRole: varchar("employeeRole", { length: 80 }).notNull(),
  status: mysqlEnum("status", ["PRESENT", "ABSENT", "LATE", "LEAVE"]).notNull(),
  checkInTime: timestamp("checkInTime"),
  remarks: text("remarks"),
  isDemo: boolean("isDemo").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  dateIdx: index("attendance_date_idx").on(table.attendanceDate),
  employeeIdx: index("attendance_employee_idx").on(table.employeeId),
  dateEmployeeUnique: uniqueIndex("attendance_date_employee_unique").on(table.attendanceDate, table.employeeId),
}));

export const cuttingEntries = mysqlTable("cutting_entries", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().references(() => orders.id),
  cuttingTarget: int("cuttingTarget").notNull(),
  cutQuantity: int("cutQuantity").notNull(),
  cuttingDate: timestamp("cuttingDate").notNull(),
  cuttingStaffId: int("cuttingStaffId").notNull().references(() => users.id),
  fabricReceivedQuantity: int("fabricReceivedQuantity").default(0).notNull(),
  fabricIssuedQuantity: int("fabricIssuedQuantity").default(0).notNull(),
  status: mysqlEnum("status", ["PENDING", "IN PROGRESS", "COMPLETED"]).default("PENDING").notNull(),
  remarks: text("remarks"),
  isDemo: boolean("isDemo").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  orderIdx: index("cutting_order_idx").on(table.orderId),
  dateIdx: index("cutting_date_idx").on(table.cuttingDate),
}));

export const printingEntries = mysqlTable("printing_entries", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().references(() => orders.id),
  printType: varchar("printType", { length: 100 }),
  designReference: varchar("designReference", { length: 180 }),
  printingTarget: int("printingTarget").default(0).notNull(),
  printedQuantity: int("printedQuantity").default(0).notNull(),
  rejectedQuantity: int("rejectedQuantity").default(0).notNull(),
  printingDate: timestamp("printingDate").notNull(),
  printingStaffId: int("printingStaffId").notNull().references(() => users.id),
  status: mysqlEnum("status", ["NOT REQUIRED", "PENDING", "IN PROGRESS", "COMPLETED"]).default("PENDING").notNull(),
  remarks: text("remarks"),
  isDemo: boolean("isDemo").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  orderIdx: index("printing_order_idx").on(table.orderId),
  dateIdx: index("printing_date_idx").on(table.printingDate),
}));

export const qcEntries = mysqlTable("qc_entries", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().references(() => orders.id),
  qcDate: timestamp("qcDate").notNull(),
  checkedQuantity: int("checkedQuantity").notNull(),
  passedQuantity: int("passedQuantity").notNull(),
  failedQuantity: int("failedQuantity").notNull(),
  reworkQuantity: int("reworkQuantity").notNull(),
  qcStaffId: int("qcStaffId").notNull().references(() => users.id),
  defectType: varchar("defectType", { length: 120 }),
  status: mysqlEnum("status", ["PENDING", "IN PROGRESS", "PASSED", "REWORK REQUIRED", "FAILED"]).default("PENDING").notNull(),
  remarks: text("remarks"),
  isDemo: boolean("isDemo").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  orderIdx: index("qc_order_idx").on(table.orderId),
  dateIdx: index("qc_date_idx").on(table.qcDate),
}));

export const packingEntries = mysqlTable("packing_entries", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().references(() => orders.id),
  packingTarget: int("packingTarget").notNull(),
  packedQuantity: int("packedQuantity").notNull(),
  packingDate: timestamp("packingDate").notNull(),
  packingStaffId: int("packingStaffId").notNull().references(() => users.id),
  status: mysqlEnum("status", ["PENDING", "IN PROGRESS", "COMPLETED"]).default("PENDING").notNull(),
  remarks: text("remarks"),
  isDemo: boolean("isDemo").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  orderIdx: index("packing_order_idx").on(table.orderId),
  dateIdx: index("packing_date_idx").on(table.packingDate),
}));

export const deliveryEntries = mysqlTable("delivery_entries", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().references(() => orders.id),
  deliveryDate: timestamp("deliveryDate").notNull(),
  deliveredQuantity: int("deliveredQuantity").notNull(),
  deliveryStatus: mysqlEnum("deliveryStatus", ["READY", "PARTIALLY DELIVERED", "DELIVERED"]).default("READY").notNull(),
  receiverCustomer: varchar("receiverCustomer", { length: 180 }),
  deliveryNote: varchar("deliveryNote", { length: 180 }),
  remarks: text("remarks"),
  isDemo: boolean("isDemo").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  orderIdx: index("delivery_order_idx").on(table.orderId),
  dateIdx: index("delivery_date_idx").on(table.deliveryDate),
}));

export const employees = mysqlTable("employees", {
  id: int("id").autoincrement().primaryKey(),
  employeeCode: varchar("employeeCode", { length: 40 }).notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  phone: varchar("phone", { length: 40 }),
  role: mysqlEnum("role", ["Operator", "Head Operator", "Cutting Master", "Helper", "QC Staff", "Printing Staff", "Packing Staff", "Manager", "Other"]).default("Operator").notNull(),
  department: varchar("department", { length: 100 }),
  joiningDate: timestamp("joiningDate"),
  status: mysqlEnum("status", ["ACTIVE", "INACTIVE"]).default("ACTIVE").notNull(),
  notes: text("notes"),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  employeeCodeUnique: uniqueIndex("employees_code_unique").on(table.employeeCode),
  statusIdx: index("employees_status_idx").on(table.status),
}));

export const machines = mysqlTable("machines", {
  id: int("id").autoincrement().primaryKey(),
  machineCode: varchar("machineCode", { length: 40 }).notNull(),
  machineType: varchar("machineType", { length: 100 }).notNull(),
  brandModel: varchar("brandModel", { length: 160 }),
  assignedEmployeeId: int("assignedEmployeeId").references(() => employees.id),
  status: mysqlEnum("status", ["ACTIVE", "MAINTENANCE", "INACTIVE"]).default("ACTIVE").notNull(),
  location: varchar("location", { length: 120 }),
  notes: text("notes"),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  machineCodeUnique: uniqueIndex("machines_code_unique").on(table.machineCode),
  statusIdx: index("machines_status_idx").on(table.status),
  employeeIdx: index("machines_employee_idx").on(table.assignedEmployeeId),
}));

export const payments = mysqlTable("payments", {
  id: int("id").autoincrement().primaryKey(),
  paymentCode: varchar("paymentCode", { length: 40 }).notNull(),
  orderId: int("orderId").notNull().references(() => orders.id),
  customerId: int("customerId").notNull().references(() => customers.id),
  paymentDate: timestamp("paymentDate").notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  paymentMethod: mysqlEnum("paymentMethod", ["CASH", "BANK", "MOBILE BANKING", "OTHER"]).notNull(),
  reference: varchar("reference", { length: 160 }),
  receivedBy: int("receivedBy").notNull().references(() => users.id),
  notes: text("notes"),
  isDemo: boolean("isDemo").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  paymentCodeUnique: uniqueIndex("payments_code_unique").on(table.paymentCode),
  orderIdx: index("payments_order_idx").on(table.orderId),
  customerIdx: index("payments_customer_idx").on(table.customerId),
  dateIdx: index("payments_date_idx").on(table.paymentDate),
}));

export const expenses = mysqlTable("expenses", {
  id: int("id").autoincrement().primaryKey(),
  expenseDate: timestamp("expenseDate").notNull(),
  category: mysqlEnum("category", ["FACTORY", "TRANSPORT", "ELECTRICITY", "MAINTENANCE", "PRINTING", "MATERIALS", "PACKAGING", "MARKETING", "OFFICE", "OTHER"]).notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  paymentMethod: mysqlEnum("paymentMethod", ["CASH", "BANK", "MOBILE BANKING", "OTHER"]).notNull(),
  description: varchar("description", { length: 240 }).notNull(),
  recordedBy: int("recordedBy").notNull().references(() => users.id),
  notes: text("notes"),
  isDemo: boolean("isDemo").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  dateIdx: index("expenses_date_idx").on(table.expenseDate),
  categoryIdx: index("expenses_category_idx").on(table.category),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Customer = typeof customers.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderSize = typeof orderSizes.$inferSelect;
export type ProductionEntry = typeof productionEntries.$inferSelect;
export type DailyReport = typeof dailyReports.$inferSelect;
export type Attendance = typeof attendance.$inferSelect;
export type CuttingEntry = typeof cuttingEntries.$inferSelect;
export type PrintingEntry = typeof printingEntries.$inferSelect;
export type QcEntry = typeof qcEntries.$inferSelect;
export type PackingEntry = typeof packingEntries.$inferSelect;
export type DeliveryEntry = typeof deliveryEntries.$inferSelect;
export type Employee = typeof employees.$inferSelect;
export type Machine = typeof machines.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Expense = typeof expenses.$inferSelect;

export const CUSTOMER_TYPES = ["LOCAL", "INTERNATIONAL", "BUYER", "BRAND", "RESELLER", "OTHER"] as const;
export const ORDER_STATUSES = ["DRAFT", "CONFIRMED", "IN PRODUCTION", "PRODUCTION COMPLETED", "QC", "READY", "DELIVERED", "CANCELLED"] as const;
export const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "Other"] as const;
export const REPORT_TYPES = ["MORNING", "CLOSING"] as const;
export const APP_ROLES = ["owner", "manager", "factory_staff"] as const;
export type AppRole = typeof APP_ROLES[number];

export function normalizeRole(role: User["role"] | undefined | null): AppRole {
  if (role === "owner" || role === "admin") return "owner";
  if (role === "manager") return "manager";
  return "factory_staff";
}
