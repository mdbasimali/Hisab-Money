import { Customer, DueTransaction, Payment } from '../models/index.js';
import { calculateCustomerBalances } from '../utils/balance.js';

/**
 * Get dashboard summary for authenticated user
 * GET /api/dashboard/summary
 */
export async function getDashboardSummary(req, res, next) {
  try {
    const ownerUserId = req.userId;

    // Fetch active customers
    const customers = await Customer.find({ ownerUserId, isArchived: { $ne: true } }).lean();
    const customerIds = customers.map((c) => c._id);

    // Sum all opening balances
    const totalOpeningPaise = customers.reduce((sum, c) => sum + (c.openingBalancePaise || 0), 0);

    // Aggregate dues
    const duesAgg = await DueTransaction.aggregate([
      { $match: { ownerUserId, customerId: { $in: customerIds } } },
      { $group: { _id: null, total: { $sum: '$amountPaise' } } },
    ]);
    const totalNewDuesPaise = duesAgg.length > 0 ? duesAgg[0].total : 0;

    // Aggregate total payments
    const paymentsAgg = await Payment.aggregate([
      { $match: { ownerUserId, customerId: { $in: customerIds } } },
      { $group: { _id: null, total: { $sum: '$amountPaise' } } },
    ]);
    const totalCollectedPaise = paymentsAgg.length > 0 ? paymentsAgg[0].total : 0;

    // Aggregate collected today (since start of current UTC/local day)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const todayAgg = await Payment.aggregate([
      {
        $match: {
          ownerUserId,
          customerId: { $in: customerIds },
          paymentDate: { $gte: startOfToday },
        },
      },
      { $group: { _id: null, total: { $sum: '$amountPaise' } } },
    ]);
    const totalCollectedTodayPaise = todayAgg.length > 0 ? todayAgg[0].total : 0;

    // Per-customer balance aggregation to count customers with positive balance
    const perCustomerDues = await DueTransaction.aggregate([
      { $match: { ownerUserId, customerId: { $in: customerIds } } },
      { $group: { _id: '$customerId', total: { $sum: '$amountPaise' } } },
    ]);
    const perCustomerPayments = await Payment.aggregate([
      { $match: { ownerUserId, customerId: { $in: customerIds } } },
      { $group: { _id: '$customerId', total: { $sum: '$amountPaise' } } },
    ]);

    const duesMap = new Map(perCustomerDues.map((d) => [d._id.toString(), d.total]));
    const paymentsMap = new Map(perCustomerPayments.map((p) => [p._id.toString(), p.total]));

    let customersWithBalance = 0;
    let totalOutstandingPaise = 0;

    customers.forEach((c) => {
      const cIdStr = c._id.toString();
      const dues = duesMap.get(cIdStr) || 0;
      const paid = paymentsMap.get(cIdStr) || 0;
      const balances = calculateCustomerBalances(c.openingBalancePaise || 0, dues, paid);

      if (balances.balancePaise > 0) {
        customersWithBalance++;
        totalOutstandingPaise += balances.balancePaise;
      }
    });

    res.json({
      success: true,
      data: {
        totalCustomers: customers.length,
        customersWithBalance,
        totalOutstandingPaise,
        totalOutstanding: Number((totalOutstandingPaise / 100).toFixed(2)),
        totalCollectedPaise,
        totalCollected: Number((totalCollectedPaise / 100).toFixed(2)),
        totalCollectedTodayPaise,
        totalCollectedToday: Number((totalCollectedTodayPaise / 100).toFixed(2)),
      },
    });
  } catch (err) {
    next(err);
  }
}
