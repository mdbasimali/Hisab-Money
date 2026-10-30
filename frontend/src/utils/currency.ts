/**
 * Currency and financial conversion utilities.
 * All monetary values in database are stored in Indian paise (integers)
 * to avoid floating-point math rounding issues.
 */

/**
 * Convert Rupees to Paise (e.g. 150.50 -> 15050, 100 -> 10000)
 */
export function rupeesToPaise(rupees: number | string): number {
  if (typeof rupees === 'string') {
    const cleaned = rupees.trim().replace(/,/g, '');
    const parsed = parseFloat(cleaned);
    if (isNaN(parsed)) return 0;
    return Math.round(parsed * 100);
  }
  if (typeof rupees !== 'number' || isNaN(rupees)) return 0;
  return Math.round(rupees * 100);
}

/**
 * Convert Paise to Rupees (e.g. 15050 -> 150.5, 10000 -> 100)
 */
export function paiseToRupees(paise: number): number {
  if (typeof paise !== 'number' || isNaN(paise)) return 0;
  return paise / 100;
}

/**
 * Calculate Customer balances strictly based on paise rules:
 * - Total due = opening_balance_paise + total_new_dues_paise
 * - Total paid = sum of valid recorded payments
 * - Remaining balance = opening_balance_paise + total_new_dues_paise - total_paid_paise
 */
export function calculateBalances(
  openingBalancePaise: number,
  totalPaidPaise: number,
  totalNewDuesPaise: number = 0
): {
  openingBalancePaise: number;
  totalNewDuesPaise: number;
  totalDuePaise: number;
  totalPaidPaise: number;
  remainingBalancePaise: number;
  remainingBalanceRupees: number;
  totalDueRupees: number;
  totalNewDuesRupees: number;
  totalPaidRupees: number;
  openingBalanceRupees: number;
} {
  const safeOpening = Math.max(0, Math.round(openingBalancePaise || 0));
  const safeNewDues = Math.max(0, Math.round(totalNewDuesPaise || 0));
  const safePaid = Math.max(0, Math.round(totalPaidPaise || 0));
  
  const totalDuePaise = safeOpening + safeNewDues;
  const remainingPaise = Math.max(0, totalDuePaise - safePaid);

  return {
    openingBalancePaise: safeOpening,
    totalNewDuesPaise: safeNewDues,
    totalDuePaise: totalDuePaise,
    totalPaidPaise: safePaid,
    remainingBalancePaise: remainingPaise,
    remainingBalanceRupees: paiseToRupees(remainingPaise),
    totalDueRupees: paiseToRupees(totalDuePaise),
    totalNewDuesRupees: paiseToRupees(safeNewDues),
    totalPaidRupees: paiseToRupees(safePaid),
    openingBalanceRupees: paiseToRupees(safeOpening),
  };
}
