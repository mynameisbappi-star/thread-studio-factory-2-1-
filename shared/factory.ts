export function calculateGoodQuantity(actualProduction: number, rejectedQuantity: number) {
  if (!Number.isFinite(actualProduction) || !Number.isFinite(rejectedQuantity)) throw new Error("Production values must be finite numbers.");
  if (actualProduction < 0 || rejectedQuantity < 0) throw new Error("Production values cannot be negative.");
  if (rejectedQuantity > actualProduction) throw new Error("Rejected quantity cannot exceed actual production.");
  return actualProduction - rejectedQuantity;
}

export function calculateAchievement(actualProduction: number, productionTarget: number) {
  if (productionTarget < 0 || actualProduction < 0) throw new Error("Production values cannot be negative.");
  return productionTarget > 0 ? Math.round((actualProduction / productionTarget) * 100) : 0;
}

export function calculateRemaining(orderQuantity: number, totalGoodProduction: number) {
  if (orderQuantity < 0 || totalGoodProduction < 0) throw new Error("Quantity values cannot be negative.");
  return Math.max(0, orderQuantity - totalGoodProduction);
}

export function validateSizeBreakdown(totalQuantity: number, sizeQuantities: number[]) {
  if (totalQuantity <= 0) throw new Error("Total quantity must be greater than zero.");
  if (sizeQuantities.some(quantity => quantity < 0)) throw new Error("Size quantities cannot be negative.");
  const allocated = sizeQuantities.reduce((sum, quantity) => sum + quantity, 0);
  if (allocated > totalQuantity) throw new Error(`Size quantities (${allocated}) cannot exceed total quantity (${totalQuantity}).`);
  return allocated;
}
