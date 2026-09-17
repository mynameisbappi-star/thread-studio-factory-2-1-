export type PipelineStage = "CUTTING" | "SEWING" | "DTF" | "QC" | "PACKING" | "DELIVERY" | "DELIVERED";

export function calculateGoodPrinted(printedQuantity: number, rejectedQuantity: number) {
  if (printedQuantity < 0 || rejectedQuantity < 0) throw new Error("Printing quantities cannot be negative.");
  if (rejectedQuantity > printedQuantity) throw new Error("Rejected quantity cannot exceed printed quantity.");
  return printedQuantity - rejectedQuantity;
}

export function validatePrintedAgainstTarget(printedQuantity: number, printingTarget: number) {
  if (printedQuantity < 0 || printingTarget < 0) throw new Error("Printing quantities cannot be negative.");
  if (printingTarget > 0 && printedQuantity > printingTarget) throw new Error("Printed quantity cannot exceed the printing target.");
}

export function calculatePassRate(passedQuantity: number, checkedQuantity: number) {
  if (passedQuantity < 0 || checkedQuantity < 0) throw new Error("QC quantities cannot be negative.");
  return checkedQuantity > 0 ? Math.round((passedQuantity / checkedQuantity) * 100) : 0;
}

export function validateQcQuantities(checkedQuantity: number, passedQuantity: number, failedQuantity: number, reworkQuantity: number) {
  if ([checkedQuantity, passedQuantity, failedQuantity, reworkQuantity].some(value => value < 0)) throw new Error("QC quantities cannot be negative.");
  if (passedQuantity + failedQuantity > checkedQuantity) throw new Error("Passed plus failed quantity cannot exceed checked quantity.");
  if (reworkQuantity > failedQuantity) throw new Error("Rework quantity cannot exceed failed quantity.");
}

export function calculatePipelineStage(input: {
  orderQuantity: number;
  cutQuantity: number;
  goodSewn: number;
  printingRequired: boolean;
  goodPrinted: number;
  passedQc: number;
  packedQuantity: number;
  deliveredQuantity: number;
}): PipelineStage {
  if (input.deliveredQuantity >= input.orderQuantity) return "DELIVERED";
  if (input.packedQuantity >= input.orderQuantity) return "DELIVERY";
  if (input.passedQc >= input.orderQuantity) return "PACKING";
  if (input.cutQuantity < input.orderQuantity) return "CUTTING";
  if (input.goodSewn < input.orderQuantity) return "SEWING";
  if (input.printingRequired && input.goodPrinted < input.orderQuantity) return "DTF";
  return "QC";
}

export function validateFullDelivery(deliveredQuantity: number, orderQuantity: number, status: string) {
  if (deliveredQuantity < 0) throw new Error("Delivered quantity cannot be negative.");
  if (deliveredQuantity > orderQuantity) throw new Error("Delivered quantity cannot exceed order quantity.");
  if (status === "DELIVERED" && deliveredQuantity < orderQuantity) throw new Error("Full delivery status requires the full order quantity.");
}
