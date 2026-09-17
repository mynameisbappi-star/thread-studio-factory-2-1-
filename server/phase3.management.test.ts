import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { employees, machines } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { getDb } from "./db";

type Role = "owner" | "manager" | "factory_staff";

function createContext(role: Role): TrpcContext {
  return {
    user: {
      id: role === "owner" ? 1 : role === "manager" ? 2 : 3,
      openId: `phase3-${role}`,
      email: `${role}@example.com`,
      name: `Phase 3 ${role}`,
      loginMethod: "test",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Phase 3 management permissions", () => {
  it("allows factory staff to read alerts and reports but blocks employee creation", async () => {
    const caller = appRouter.createCaller(createContext("factory_staff"));
    const alerts = await caller.management.alerts();
    const reports = await caller.management.reports({ period: "TODAY" });
    expect(Array.isArray(alerts)).toBe(true);
    expect(reports.summary).toHaveProperty("activeOrders");
    await expect(caller.management.employees.create({
      employeeCode: "TEST-001",
      name: "Should Not Create",
      role: "Operator",
      department: "Production",
      joiningDate: "2026-09-10",
      status: "ACTIVE",
      notes: null,
      phone: null,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows managers to read employee and machine registers but blocks employee deactivation", async () => {
    const caller = appRouter.createCaller(createContext("manager"));
    const employees = await caller.management.employees.list();
    const machines = await caller.management.machines.list();
    expect(Array.isArray(employees)).toBe(true);
    expect(Array.isArray(machines)).toBe(true);
    await expect(caller.management.employees.deactivate({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows owner management access and rejects incomplete custom report filters", async () => {
    const caller = appRouter.createCaller(createContext("owner"));
    const overview = await caller.management.overview();
    expect(overview).toHaveProperty("today");
    expect(overview).toHaveProperty("attention");
    await expect(caller.management.reports({ period: "CUSTOM" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("covers employee and machine CRUD without touching production records", async () => {
    const caller = appRouter.createCaller(createContext("owner"));
    const suffix = Date.now().toString();
    let employeeId: number | undefined;
    let machineId: number | undefined;
    try {
      const employee = await caller.management.employees.create({ employeeCode: `P3-${suffix}`, name: "Phase 3 Test Operator", phone: null, role: "Operator", department: "Testing", joiningDate: "2026-09-10", status: "ACTIVE", notes: "Automated test record." });
      employeeId = employee.id;
      expect(employeeId).toBeTypeOf("number");
      await caller.management.employees.update({ id: employeeId, data: { employeeCode: `P3-${suffix}`, name: "Phase 3 Updated Operator", phone: "+8801000000000", role: "Head Operator", department: "Testing", joiningDate: "2026-09-10", status: "ACTIVE", notes: "Updated test record." } });
      const machine = await caller.management.machines.create({ machineCode: `M-P3-${suffix}`, machineType: "Test machine", brandModel: "Test model", assignedEmployeeId: employeeId, status: "ACTIVE", location: "Test floor", notes: "Automated test record." });
      machineId = machine.id;
      expect(machineId).toBeTypeOf("number");
      await caller.management.machines.update({ id: machineId, data: { machineCode: `M-P3-${suffix}`, machineType: "Test machine", brandModel: "Test model", assignedEmployeeId: employeeId, status: "MAINTENANCE", location: "Test floor", notes: "Maintenance test." } });
      const machinesAfterUpdate = await caller.management.machines.list();
      expect(machinesAfterUpdate.find(row => row.machine.id === machineId)?.machine.status).toBe("MAINTENANCE");
    } finally {
      const db = await getDb();
      if (db && machineId) await db.delete(machines).where(eq(machines.id, machineId));
      if (db && employeeId) await db.delete(employees).where(eq(employees.id, employeeId));
    }
  });
});
