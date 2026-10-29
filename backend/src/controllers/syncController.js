import { Customer, DueTransaction, Payment } from '../models/index.js';
import mongoose from 'mongoose';

/**
 * Get sync status and counts for the authenticated user
 * GET /api/sync/status
 */
export async function getSyncStatus(req, res, next) {
  try {
    const ownerUserId = req.userId;

    const [customersCount, duesCount, paymentsCount] = await Promise.all([
      Customer.countDocuments({ ownerUserId }),
      DueTransaction.countDocuments({ ownerUserId }),
      Payment.countDocuments({ ownerUserId }),
    ]);

    res.json({
      success: true,
      data: {
        serverTime: new Date().toISOString(),
        ownerUserId: ownerUserId.toString(),
        records: {
          customers: customersCount,
          dueTransactions: duesCount,
          payments: paymentsCount,
        },
        syncProtocolVersion: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Batch synchronization endpoint for offline client queue
 * POST /api/sync/batch
 *
 * Processes local SQLite items (customers, dues, payments) atomically or item-by-item,
 * returning mapped backend IDs and statuses.
 */
export async function syncBatch(req, res, next) {
  try {
    const ownerUserId = req.userId;
    const { items = [] } = req.body;

    const results = [];

    for (const item of items) {
      const { localId, entityType, operation, payload } = item;

      try {
        if (entityType === 'customer') {
          if (operation === 'CREATE') {
            // Find existing by localId or create
            let customer = await Customer.findOne({ ownerUserId, localId });
            if (!customer) {
              customer = await Customer.create({
                ownerUserId,
                localId,
                name: payload.name,
                phone: payload.phone || '',
                address: payload.address || '',
                notes: payload.notes || '',
                openingBalancePaise: Math.round(payload.openingBalancePaise || 0),
                isArchived: false,
              });
            }
            results.push({
              localId,
              entityType,
              status: 'SUCCESS',
              backendId: customer._id.toString(),
            });
          } else if (operation === 'UPDATE') {
            const customer = await Customer.findOneAndUpdate(
              { ownerUserId, $or: [{ localId }, { _id: payload.backendId }] },
              {
                $set: {
                  name: payload.name,
                  phone: payload.phone || '',
                  address: payload.address || '',
                  notes: payload.notes || '',
                  ...(payload.isArchived !== undefined ? { isArchived: payload.isArchived } : {}),
                },
              },
              { new: true }
            );
            results.push({
              localId,
              entityType,
              status: customer ? 'SUCCESS' : 'NOT_FOUND',
              backendId: customer?._id?.toString(),
            });
          }
        } else if (entityType === 'due') {
          // Resolve customer backend ID
          let customerId = payload.customerId;
          if (!mongoose.Types.ObjectId.isValid(customerId)) {
            // Find customer by localId
            const cust = await Customer.findOne({ ownerUserId, localId: customerId });
            if (cust) customerId = cust._id;
          }

          if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
            results.push({
              localId,
              entityType,
              status: 'FAILED',
              error: 'Referenced customer does not exist on server',
            });
            continue;
          }

          // Idempotent upsert via clientTransactionId
          const clientTxId = payload.clientTransactionId || localId;
          let due = await DueTransaction.findOne({ ownerUserId, clientTransactionId: clientTxId });
          if (!due) {
            due = await DueTransaction.create({
              ownerUserId,
              customerId,
              clientTransactionId: clientTxId,
              amountPaise: Math.round(payload.amountPaise),
              reason: payload.reason,
              transactionDate: payload.transactionDate ? new Date(payload.transactionDate) : new Date(),
              notes: payload.notes || '',
            });
          }

          results.push({
            localId,
            entityType,
            status: 'SUCCESS',
            backendId: due._id.toString(),
          });
        } else if (entityType === 'payment') {
          let customerId = payload.customerId;
          if (!mongoose.Types.ObjectId.isValid(customerId)) {
            const cust = await Customer.findOne({ ownerUserId, localId: customerId });
            if (cust) customerId = cust._id;
          }

          if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
            results.push({
              localId,
              entityType,
              status: 'FAILED',
              error: 'Referenced customer does not exist on server',
            });
            continue;
          }

          const clientTxId = payload.clientTransactionId || localId;
          let paymentMethod = (payload.paymentMethod || 'cash').toLowerCase().trim();
          if (!['cash', 'upi', 'bank_transfer', 'neft', 'rtgs', 'imps', 'cheque', 'other'].includes(paymentMethod)) {
            paymentMethod = 'other';
          }

          let payment = await Payment.findOne({ ownerUserId, clientTransactionId: clientTxId });
          if (!payment) {
            payment = await Payment.create({
              ownerUserId,
              customerId,
              clientTransactionId: clientTxId,
              amountPaise: Math.round(payload.amountPaise),
              paymentMethod,
              paymentDate: payload.paymentDate ? new Date(payload.paymentDate) : new Date(),
              notes: payload.notes || '',
            });
          }

          results.push({
            localId,
            entityType,
            status: 'SUCCESS',
            backendId: payment._id.toString(),
          });
        }
      } catch (itemErr) {
        results.push({
          localId,
          entityType,
          status: 'ERROR',
          error: itemErr.message,
        });
      }
    }

    res.json({
      success: true,
      processed: results.length,
      data: results,
    });
  } catch (err) {
    next(err);
  }
}
