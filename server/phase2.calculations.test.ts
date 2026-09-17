import { describe, expect, it } from "vitest";
import { calculateGoodPrinted, calculatePassRate, calculatePipelineStage, validateFullDelivery, validatePrintedAgainstTarget, validateQcQuantities } from "../shared/phase2";

describe("phase 2 factory calculations", () => {
  it("calculates good printed output and rejects invalid reject counts", () => {
    expect(calculateGoodPrinted(880, 10)).toBe(870);
    expect(() => calculateGoodPrinted(10, 11)).toThrow(/cannot exceed/);
    expect(() => calculateGoodPrinted(-1, 0)).toThrow(/cannot be negative/);
    expect(() => validatePrintedAgainstTarget(501, 500)).toThrow(/printing target/);
  });

  it("calculates QC pass rates and enforces checked quantity boundaries", () => {
    expect(calculatePassRate(850, 870)).toBe(98);
    expect(calculatePassRate(0, 0)).toBe(0);
    expect(() => validateQcQuantities(100, 90, 11, 0)).toThrow(/cannot exceed/);
    expect(() => validateQcQuantities(100, 90, 10, 11)).toThrow(/Rework quantity/);
  });

  it("selects the first incomplete production stage", () => {
    expect(calculatePipelineStage({ orderQuantity: 1000, cutQuantity: 500, goodSewn: 0, printingRequired: false, goodPrinted: 0, passedQc: 0, packedQuantity: 0, deliveredQuantity: 0 })).toBe("CUTTING");
    expect(calculatePipelineStage({ orderQuantity: 1000, cutQuantity: 1000, goodSewn: 880, printingRequired: false, goodPrinted: 0, passedQc: 0, packedQuantity: 0, deliveredQuantity: 0 })).toBe("SEWING");
    expect(calculatePipelineStage({ orderQuantity: 1000, cutQuantity: 1000, goodSewn: 1000, printingRequired: true, goodPrinted: 870, passedQc: 0, packedQuantity: 0, deliveredQuantity: 0 })).toBe("DTF");
    expect(calculatePipelineStage({ orderQuantity: 1000, cutQuantity: 1000, goodSewn: 1000, printingRequired: false, goodPrinted: 0, passedQc: 1000, packedQuantity: 850, deliveredQuantity: 0 })).toBe("PACKING");
    expect(calculatePipelineStage({ orderQuantity: 1000, cutQuantity: 1000, goodSewn: 1000, printingRequired: false, goodPrinted: 0, passedQc: 1000, packedQuantity: 1000, deliveredQuantity: 500 })).toBe("DELIVERY");
    expect(calculatePipelineStage({ orderQuantity: 1000, cutQuantity: 1000, goodSewn: 1000, printingRequired: false, goodPrinted: 0, passedQc: 1000, packedQuantity: 1000, deliveredQuantity: 1000 })).toBe("DELIVERED");
  });

  it("requires full quantity for full delivery status", () => {
    expect(() => validateFullDelivery(999, 1000, "DELIVERED")).toThrow(/full order quantity/);
    expect(() => validateFullDelivery(1001, 1000, "PARTIALLY DELIVERED")).toThrow(/cannot exceed/);
    expect(validateFullDelivery(500, 1000, "PARTIALLY DELIVERED")).toBeUndefined();
  });
});
