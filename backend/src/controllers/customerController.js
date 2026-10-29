import { Customer, DueTransaction, Payment } from '../models/index.js';
import { calculateCustomerBalances } from '../utils/balance.js';

/**
 * List all customers belonging to the authenticated owner with dynamic balances
 * GET /api/customers
 */
export async function getCustomers(req, res, next) {
  try {
    const ownerUserId = req.userId;
    const includeArchived = req.query.includeArchived === 'true';

    const matchQuery = { ownerUserId };
    if (!includeArchived) {
      matchQuery.isArchived = { $ne: true };
    }

    // Fetch customers
    const customers = await Customer.find(matchQuery).sort({ updatedAt: -1 }).lean();

    if (customers.length === 0) {
      return res.json({ success: true, count: 0, data: [] });
    }

    const customerIds = customers.map((c) => c._id);

    // Aggregate dues per customer
    const duesAgg = await DueTransaction.aggregate([
      { $match: { ownerUserId, customerId: { $in: customerIds } } },
      { $group: { _id: '$customerId', totalNewDuesPaise: { $sum: '$amountPaise' } } },
    ]);
    const duesMap = new Map(duesAgg.map((d) => [d._id.toString(), d.totalNewDuesPaise]));

    // Aggregate payments per customer
    const paymentsAgg = await Payment.aggregate([
      { $match: { ownerUserId, customerId: { $in: customerIds } } },
      { $group: { _id: '$customerId', totalPaidPaise: { $sum: '$amountPaise' } } },
    ]);
    const paymentsMap = new Map(paymentsAgg.map((p) => [p._id.toString(), p.totalPaidPaise]));

    const enriched = customers.map((c) => {
      const cIdStr = c._id.toString();
      const dues = duesMap.get(cIdStr) || 0;
      const paid = paymentsMap.get(cIdStr) || 0;
      const balances = calculateCustomerBalances(c.openingBalancePaise || 0, dues, paid);

      return {
        ...c,
        ...balances,
      };
    });

    res.json({
      success: true,
      count: enriched.length,
      data: enriched,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get a single customer by ID
 * GET /api/customers/:id
 */
export async function getCustomerById(req, res, next) {
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

    // Aggregate dues
    const duesAgg = await DueTransaction.aggregate([
      { $match: { ownerUserId, customerId: customer._id } },
      { $group: { _id: null, total: { $sum: '$amountPaise' } } },
    ]);
    const totalNewDuesPaise = duesAgg.length > 0 ? duesAgg[0].total : 0;

    // Aggregate payments
    const paymentsAgg = await Payment.aggregate([
      { $match: { ownerUserId, customerId: customer._id } },
      { $group: { _id: null, total: { $sum: '$amountPaise' } } },
    ]);
    const totalPaidPaise = paymentsAgg.length > 0 ? paymentsAgg[0].total : 0;

    const balances = calculateCustomerBalances(
      customer.openingBalancePaise || 0,
      totalNewDuesPaise,
      totalPaidPaise
    );

    res.json({
      success: true,
      data: {
        ...customer,
        ...balances,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Create a new customer
 * POST /api/customers
 */
export async function createCustomer(req, res, next) {
  try {
    const ownerUserId = req.userId;
    const {
      localId,
      name,
      phone,
      address,
      notes,
      openingBalancePaise = 0,
      initialDueReason,
      initialDueDate,
    } = req.body;

    // If localId is provided, check if already exists for this owner (idempotent sync)
    if (localId) {
      const existing = await Customer.findOne({ ownerUserId, localId }).lean();
      if (existing) {
        const balances = calculateCustomerBalances(existing.openingBalancePaise || 0, 0, 0);
        return res.status(200).json({
          success: true,
          message: 'Customer already exists for this localId',
          data: { ...existing, ...balances },
        });
      }
    }

    const customer = await Customer.create({
      ownerUserId,
      localId: localId || undefined,
      name,
      phone: phone || '',
      address: address || '',
      notes: notes || '',
      openingBalancePaise: Math.round(openingBalancePaise),
      isArchived: false,
    });

    // Compute balances
    const balances = calculateCustomerBalances(customer.openingBalancePaise, 0, 0);

    res.status(201).json({
      success: true,
      data: {
        ...customer.toObject(),
        ...balances,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update an existing customer
 * PATCH /api/customers/:id
 */
export async function updateCustomer(req, res, next) {
  try {
    const { id } = req.params;
    const ownerUserId = req.userId;
    const { name, phone, address, notes, isArchived } = req.body;

    const updateFields = {};
    if (name !== undefined) updateFields.name = name;
    if (phone !== undefined) updateFields.phone = phone;
    if (address !== undefined) updateFields.address = address;
    if (notes !== undefined) updateFields.notes = notes;
    if (isArchived !== undefined) updateFields.isArchived = isArchived;

    const customer = await Customer.findOneAndUpdate(
      { _id: id, ownerUserId },
      { $set: updateFields },
      { new: true, runValidators: true }
    ).lean();

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'CUSTOMER_NOT_FOUND',
        message: 'Customer not found or not accessible',
      });
    }

    // Re-fetch balances
    const duesAgg = await DueTransaction.aggregate([
      { $match: { ownerUserId, customerId: customer._id } },
      { $group: { _id: null, total: { $sum: '$amountPaise' } } },
    ]);
    const totalNewDuesPaise = duesAgg.length > 0 ? duesAgg[0].total : 0;

    const paymentsAgg = await Payment.aggregate([
      { $match: { ownerUserId, customerId: customer._id } },
      { $group: { _id: null, total: { $sum: '$amountPaise' } } },
    ]);
    const totalPaidPaise = paymentsAgg.length > 0 ? paymentsAgg[0].total : 0;

    const balances = calculateCustomerBalances(
      customer.openingBalancePaise || 0,
      totalNewDuesPaise,
      totalPaidPaise
    );

    res.json({
      success: true,
      data: {
        ...customer,
        ...balances,
      },
    });
  } catch (err) {
    next(err);
  }
}
