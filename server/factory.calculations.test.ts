import { describe, expect, it } from "vitest";
import {
  calculateAchievement,
  calculateGoodQuantity,
  calculateRemaining,
  validateSizeBreakdown,
} from "../shared/factory";

describe("factory calculations", () => {
  it("calculates good quantity after rejects", () => {
    expect(calculateGoodQuantity(76, 4)).toBe(72);
  });

  it("calculates achievement percentage and handles zero target", () => {
    expect(calculateAchievement(54, 80)).toBe(68);
    expect(calculateAchievement(54, 0)).toBe(0);
  });

  it("never returns a negative remaining quantity", () => {
    expect(calculateRemaining(240, 183)).toBe(57);
    expect(calculateRemaining(100, 110)).toBe(0);
  });

  it("rejects an over-allocated size breakdown", () => {
    expect(validateSizeBreakdown(100, [20, 30, 50])).toBe(100);
    expect(() => validateSizeBreakdown(100, [60, 50])).toThrow(/cannot exceed/);
  });

  it("rejects invalid production quantities", () => {
    expect(() => calculateGoodQuantity(10, 11)).toThrow(/cannot exceed/);
    expect(() => calculateGoodQuantity(-1, 0)).toThrow(/cannot be negative/);
  });
});
