import { Customer, DueTransaction, Payment } from '../models/index.js';
import { calculateCustomerBalances } from '../utils/balance.js';

/**
 * Add a new due transaction for a customer
 * POST /api/customers/:id/dues
 */
export async function createDue(req, res, next) {
  try {
    const { id } = req.params;
    const ownerUserId = req.userId;
    const { clientTransactionId, amountPaise, reason, transactionDate, notes } = req.body;

    // Verify customer exists and belongs to this user
    const customer = await Customer.findOne({ _id: id, ownerUserId });
    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'CUSTOMER_NOT_FOUND',
        message: 'Customer not found or not accessible',
      });
    }

    // Check for idempotent duplicate by clientTransactionId
    if (clientTransactionId) {
      const existing = await DueTransaction.findOne({
        ownerUserId,
        clientTransactionId,
      }).lean();

      if (existing) {
        return res.status(200).json({
          success: true,
          message: 'Due transaction already exists (idempotent duplicate)',
          data: existing,
        });
      }
    }

    const due = await DueTransaction.create({
      ownerUserId,
      customerId: customer._id,
      clientTransactionId: clientTransactionId || undefined,
      amountPaise: Math.round(amountPaise),
      reason,
      transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
      notes: notes || '',
    });

    // Touch customer updated_at
    customer.updatedAt = new Date();
    await customer.save();

    res.status(201).json({
      success: true,
      data: due,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Record a payment for a customer
 * POST /api/customers/:id/payments
 */
export async function createPayment(req, res, next) {
  try {
    const { id } = req.params;
    const ownerUserId = req.userId;
    const { clientTransactionId, amountPaise, paymentMethod = 'cash', paymentDate, notes } = req.body;

    // Verify customer exists and belongs to this user
    const customer = await Customer.findOne({ _id: id, ownerUserId });
    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'CUSTOMER_NOT_FOUND',
        message: 'Customer not found or not accessible',
      });
    }

    // Prevent duplicate payment creation using clientTransactionId
    if (clientTransactionId) {
      const existing = await Payment.findOne({
        ownerUserId,
        clientTransactionId,
      }).lean();

      if (existing) {
        return res.status(200).json({
          success: true,
          message: 'Payment already exists (idempotent duplicate)',
          data: existing,
        });
      }
    }

    const payment = await Payment.create({
      ownerUserId,
      customerId: customer._id,
      clientTransactionId: clientTransactionId || undefined,
      amountPaise: Math.round(amountPaise),
      paymentMethod,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      notes: notes || '',
    });

    // Touch customer updated_at
    customer.updatedAt = new Date();
    await customer.save();

    res.status(201).json({
      success: true,
      data: payment,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get unified transaction history for a customer (chronological)
 * GET /api/customers/:id/transactions
 */
export async function getCustomerTransactions(req, res, next) {
  try {
    const { id } = req.params;
    const ownerUserId = req.userId;

    const customer = await Customer.findOne({ _id: id, ownerUserId }).lean();
    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'CUSTOMER_NOT_FOUND',
        message: 'Customer not found or not accessible',
      });
    }

    const [dues, payments] = await Promise.all([
      DueTransaction.find({ ownerUserId, customerId: customer._id }).lean(),
      Payment.find({ ownerUserId, customerId: customer._id }).lean(),
    ]);

    const transactions = [];

    // Opening balance entry if > 0
    if ((customer.openingBalancePaise || 0) > 0) {
      transactions.push({
        id: `opening-${customer._id}`,
        customerId: customer._id.toString(),
        customerName: customer.name,
        type: 'credit',
        subType: 'opening',
        amountPaise: customer.openingBalancePaise,
        amount: Number((customer.openingBalancePaise / 100).toFixed(2)),
        reason: 'Opening Balance',
        notes: customer.notes || '',
        createdAt: customer.createdAt.toISOString(),
      });
    }

    // New due entries
    dues.forEach((d) => {
      transactions.push({
        id: d._id.toString(),
        clientTransactionId: d.clientTransactionId,
        customerId: customer._id.toString(),
        customerName: customer.name,
        type: 'credit',
        subType: 'new_due',
        amountPaise: d.amountPaise,
        amount: Number((d.amountPaise / 100).toFixed(2)),
        reason: d.reason,
        notes: d.notes || '',
        createdAt: (d.transactionDate || d.createdAt).toISOString(),
      });
    });

    // Payment entries
    payments.forEach((p) => {
      transactions.push({
        id: p._id.toString(),
        clientTransactionId: p.clientTransactionId,
        customerId: customer._id.toString(),
        customerName: customer.name,
        type: 'payment',
        subType: 'payment',
        amountPaise: p.amountPaise,
        amount: Number((p.amountPaise / 100).toFixed(2)),
        paymentMethod: p.paymentMethod,
        notes: p.notes || '',
        createdAt: (p.paymentDate || p.createdAt).toISOString(),
      });
    });

    // Sort ascending to compute running balances accurately
    transactions.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    let runningBalancePaise = 0;
    const computed = transactions.map((tx) => {
      if (tx.type === 'credit') {
        runningBalancePaise += tx.amountPaise;
      } else {
        runningBalancePaise = Math.max(0, runningBalancePaise - tx.amountPaise);
      }

      return {
        ...tx,
        balanceAfterPaise: runningBalancePaise,
        balanceAfter: Number((runningBalancePaise / 100).toFixed(2)),
      };
    });

    // Return chronological descending (newest first) for UI presentation
    computed.reverse();

    res.json({
      success: true,
      count: computed.length,
      data: computed,
    });
  } catch (err) {
    next(err);
  }
}
