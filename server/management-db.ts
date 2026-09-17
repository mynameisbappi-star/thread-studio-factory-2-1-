import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { employees, machines } from "../drizzle/schema";
import { getDb, listAttendance, listQc, listProduction, phase2Pipeline } from "./db";

export async function listEmployees() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(employees).orderBy(asc(employees.status), asc(employees.name));
}

export async function listMachines() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ machine: machines, assignedEmployeeName: employees.name, assignedEmployeeCode: employees.employeeCode })
    .from(machines)
    .leftJoin(employees, eq(machines.assignedEmployeeId, employees.id))
    .orderBy(asc(machines.status), asc(machines.machineCode));
}

export type ReportRange = { from: Date; to: Date };

function dhakaDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(value);
}

export async function managementReports(range: ReportRange) {
  const [production, qc, pipeline] = await Promise.all([
    listProduction({ from: range.from, to: range.to }),
    listQc(),
    phase2Pipeline(true, range),
  ]);
  const rangedQc = qc.filter(row => row.entry.qcDate >= range.from && row.entry.qcDate <= range.to);
  const dailyMap = new Map<string, { date: string; target: number; actual: number; good: number; rejected: number }>();
  const operatorMap = new Map<string, { operator: string; date: string; target: number; actual: number; good: number; rejected: number }>();
  for (const row of production) {
    const date = dhakaDate(row.entry.productionDate);
    const daily = dailyMap.get(date) ?? { date, target: 0, actual: 0, good: 0, rejected: 0 };
    daily.target += row.entry.productionTarget;
    daily.actual += row.entry.actualProduction;
    daily.good += Math.max(0, row.entry.actualProduction - row.entry.rejectedQuantity);
    daily.rejected += row.entry.rejectedQuantity;
    dailyMap.set(date, daily);
    const operator = row.operatorName ?? "Unassigned";
    const key = `${operator}|${date}`;
    const operatorRow = operatorMap.get(key) ?? { operator, date, target: 0, actual: 0, good: 0, rejected: 0 };
    operatorRow.target += row.entry.productionTarget;
    operatorRow.actual += row.entry.actualProduction;
    operatorRow.good += Math.max(0, row.entry.actualProduction - row.entry.rejectedQuantity);
    operatorRow.rejected += row.entry.rejectedQuantity;
    operatorMap.set(key, operatorRow);
  }
  const checked = rangedQc.reduce((sum, row) => sum + row.entry.checkedQuantity, 0);
  const passed = rangedQc.reduce((sum, row) => sum + row.entry.passedQuantity, 0);
  const failed = rangedQc.reduce((sum, row) => sum + row.entry.failedQuantity, 0);
  const rework = rangedQc.reduce((sum, row) => sum + row.entry.reworkQuantity, 0);
  const totalTarget = production.reduce((sum, row) => sum + row.entry.productionTarget, 0);
  const totalActual = production.reduce((sum, row) => sum + row.entry.actualProduction, 0);
  const totalGood = production.reduce((sum, row) => sum + Math.max(0, row.entry.actualProduction - row.entry.rejectedQuantity), 0);
  const totalRejected = production.reduce((sum, row) => sum + row.entry.rejectedQuantity, 0);
  const packed = pipeline.reduce((sum, row) => sum + row.packed, 0);
  const delivered = pipeline.reduce((sum, row) => sum + row.delivered, 0);
  const pending = pipeline.reduce((sum, row) => sum + row.remaining, 0);
  return {
    range,
    daily: Array.from(dailyMap.values()).sort((a, b) => b.date.localeCompare(a.date)).map(row => ({ ...row, achievement: row.target ? Math.round((row.actual / row.target) * 100) : 0 })),
    orderWise: pipeline.map(row => ({ orderId: row.id, order: row.orderCode, customer: row.customerName, quantity: row.totalQuantity, cutting: row.cutQuantity, sewing: row.goodSewn, dtf: row.printingRequired ? row.goodPrinted : null, qc: row.passedQc, packing: row.packed, delivered: row.delivered, remaining: row.remaining, stage: row.currentStage })),
    operatorWise: Array.from(operatorMap.values()).sort((a, b) => b.date.localeCompare(a.date) || a.operator.localeCompare(b.operator)).map(row => ({ ...row, achievement: row.target ? Math.round((row.actual / row.target) * 100) : 0 })),
    qc: { checked, passed, failed, rework, passRate: checked ? Math.round((passed / checked) * 100) : 0 },
    delivery: {
      ready: pipeline.filter(row => row.currentStage === "DELIVERY").length,
      partiallyDelivered: pipeline.filter(row => row.delivered > 0 && row.remaining > 0).length,
      delivered: pipeline.filter(row => row.currentStage === "DELIVERED").length,
      delayed: pipeline.filter(row => new Date(row.deliveryDate) < range.to && row.remaining > 0).length,
    },
    summary: { activeOrders: pipeline.filter(row => row.currentStage !== "DELIVERED").length, target: totalTarget, actual: totalActual, good: totalGood, rejected: totalRejected, qcPassRate: checked ? Math.round((passed / checked) * 100) : 0, packed, delivered, pending },
  };
}

export async function managementAlerts(todayStart: Date, todayEnd: Date) {
  const [pipeline, production] = await Promise.all([
    phase2Pipeline(),
    listProduction({ from: todayStart, to: todayEnd }),
  ]);
  const alerts: Array<{ id: string; severity: "HIGH" | "MEDIUM" | "LOW"; orderId?: number; order?: string; problem: string; currentStage: string; requiredAction: string }> = [];
  const add = (id: string, severity: "HIGH" | "MEDIUM" | "LOW", order: typeof pipeline[number] | undefined, problem: string, currentStage: string, requiredAction: string) => alerts.push({ id, severity, orderId: order?.id, order: order?.orderCode, problem, currentStage, requiredAction });
  for (const order of pipeline) {
    const overdue = new Date(order.deliveryDate) < todayStart && order.remaining > 0;
    const dueSoon = !overdue && (new Date(order.deliveryDate).getTime() - todayStart.getTime()) <= 3 * 86_400_000 && order.remaining > 0;
    if (overdue) add(`overdue-${order.id}`, "HIGH", order, "Order overdue", order.currentStage, "Escalate the order and confirm the recovery plan.");
    else if (dueSoon) add(`due-${order.id}`, "MEDIUM", order, "Order due soon", order.currentStage, "Review remaining quantity and prioritize the next stage.");
    if (order.currentStage === "CUTTING" && order.cutTarget > 0 && order.cutQuantity < order.cutTarget) add(`cut-${order.id}`, "MEDIUM", order, "Cutting behind target", "CUTTING", "Complete cutting before releasing more work to sewing.");
    if (order.currentStage === "SEWING" && order.sewingTarget > 0 && order.actualSewn < order.sewingTarget) add(`sew-${order.id}`, "MEDIUM", order, "Sewing behind target", "SEWING", "Assign operator capacity and close the target gap.");
    if (order.currentStage === "DTF") add(`dtf-${order.id}`, "MEDIUM", order, "DTF pending", "DTF", "Schedule printing or confirm that DTF is not required.");
    if (order.failedQc > 0) add(`qc-fail-${order.id}`, "HIGH", order, "QC failed quantity recorded", "QC", "Review defects and decide whether to rework or reject.");
    if (order.reworkQc > 0) add(`qc-rework-${order.id}`, "HIGH", order, "Rework required", "QC", "Route failed pieces back to sewing and recheck them.");
    if (order.currentStage === "PACKING") add(`pack-${order.id}`, "LOW", order, "Packing pending", "PACKING", "Pack passed pieces and update the packed quantity.");
    if (order.currentStage === "DELIVERY") add(`delivery-${order.id}`, "MEDIUM", order, "Delivery pending", "DELIVERY", "Confirm receiver and dispatch the ready quantity.");
    if (order.actualSewn > 0 && order.rejectedSewn / order.actualSewn >= 0.1) add(`reject-${order.id}`, "HIGH", order, "High sewing rejection", "SEWING", "Inspect the line and address the dominant defect.");
  }
  const target = production.reduce((sum, row) => sum + row.entry.productionTarget, 0);
  const actual = production.reduce((sum, row) => sum + row.entry.actualProduction, 0);
  if (target > 0 && actual < target) add("production-below-target", "MEDIUM", undefined, "Production below target", "SEWING", "Review staffing, machine capacity, and the remaining shift plan.");
  const severityRank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]).slice(0, 10);
}

export async function managementDashboard(todayStart: Date, todayEnd: Date) {
  const [pipeline, attendance, reports, alerts] = await Promise.all([
    phase2Pipeline(true),
    listAttendance(todayStart),
    managementReports({ from: todayStart, to: todayEnd }),
    managementAlerts(todayStart, todayEnd),
  ]);
  const stageCounts = pipeline.reduce<Record<string, number>>((counts, order) => {
    counts[order.currentStage] = (counts[order.currentStage] ?? 0) + 1;
    return counts;
  }, {});
  return {
    today: { workersPresent: attendance.filter(row => row.attendance.status === "PRESENT").length, workersAbsent: attendance.filter(row => row.attendance.status === "ABSENT").length, workersLate: attendance.filter(row => row.attendance.status === "LATE").length, sewingTarget: reports.summary.target, sewingActual: reports.summary.actual, achievement: reports.summary.target ? Math.round((reports.summary.actual / reports.summary.target) * 100) : 0, rejected: reports.summary.rejected, qcPassRate: reports.summary.qcPassRate, packed: reports.summary.packed, delivered: reports.summary.delivered },
    orderControl: { activeOrders: pipeline.filter(row => row.currentStage !== "DELIVERED").length, dueToday: pipeline.filter(row => dhakaDate(new Date(row.deliveryDate)) === dhakaDate(todayStart) && row.remaining > 0).length, dueSoon: pipeline.filter(row => new Date(row.deliveryDate) >= todayStart && new Date(row.deliveryDate).getTime() <= todayStart.getTime() + 3 * 86_400_000 && row.remaining > 0).length, overdue: pipeline.filter(row => new Date(row.deliveryDate) < todayStart && row.remaining > 0).length, productionCompleted: pipeline.filter(row => row.currentStage === "QC" || row.currentStage === "PACKING" || row.currentStage === "DELIVERY" || row.currentStage === "DELIVERED").length, qcPending: stageCounts.QC ?? 0, packingPending: stageCounts.PACKING ?? 0, deliveryPending: stageCounts.DELIVERY ?? 0 },
    pipeline: stageCounts,
    attention: alerts,
  };
}

export { employees, machines };
