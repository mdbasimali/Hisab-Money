/**
 * Helper to calculate outstanding balance and Rupee equivalents
 * from integer paise amounts.
 *
 * Rules:
 *  totalCreditPaise = openingBalancePaise + totalNewDuesPaise
 *  balancePaise = max(0, totalCreditPaise - totalPaidPaise)
 */
export function calculateCustomerBalances(openingBalancePaise = 0, totalNewDuesPaise = 0, totalPaidPaise = 0) {
  const ob = Math.max(0, Math.round(openingBalancePaise));
  const dues = Math.max(0, Math.round(totalNewDuesPaise));
  const paid = Math.max(0, Math.round(totalPaidPaise));

  const totalCreditPaise = ob + dues;
  const balancePaise = Math.max(0, totalCreditPaise - paid);

  return {
    openingBalancePaise: ob,
    openingBalanceRupees: Number((ob / 100).toFixed(2)),
    totalNewDuesPaise: dues,
    totalNewDuesRupees: Number((dues / 100).toFixed(2)),
    totalCreditPaise,
    totalCreditRupees: Number((totalCreditPaise / 100).toFixed(2)),
    totalPaidPaise: paid,
    totalPaidRupees: Number((paid / 100).toFixed(2)),
    balancePaise,
    balanceRupees: Number((balancePaise / 100).toFixed(2)),
  };
}
