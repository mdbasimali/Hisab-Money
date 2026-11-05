import { z } from 'zod';
import mongoose from 'mongoose';

/**
 * Zod helper to validate MongoDB ObjectId string
 */
export const objectIdSchema = z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
  message: 'Invalid ObjectId format',
});

/**
 * Validate customer creation
 */
export const createCustomerSchema = z.object({
  body: z.object({
    localId: z.string().optional(),
    name: z.string().min(1, 'Name is required').max(100),
    phone: z.string().max(20).optional().default(''),
    address: z.string().max(250).optional().default(''),
    notes: z.string().max(1000).optional().default(''),
    openingBalancePaise: z
      .number({ invalid_type_error: 'openingBalancePaise must be an integer' })
      .int('openingBalancePaise must be an integer')
      .min(0, 'openingBalancePaise cannot be negative')
      .default(0),
    // If openingBalancePaise > 0, an initial due reason can optionally be recorded
    initialDueReason: z.string().max(200).optional(),
    initialDueDate: z.string().optional(),
  }),
});

/**
 * Validate customer update
 */
export const updateCustomerSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
  body: z.object({
    name: z.string().min(1, 'Name is required').max(100).optional(),
    phone: z.string().max(20).optional(),
    address: z.string().max(250).optional(),
    notes: z.string().max(1000).optional(),
    isArchived: z.boolean().optional(),
  }),
});

/**
 * Validate due transaction creation
 */
export const createDueSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
  body: z.object({
    clientTransactionId: z.string().max(100).optional(),
    amountPaise: z
      .number({ invalid_type_error: 'amountPaise must be an integer' })
      .int('amountPaise must be an integer')
      .min(1, 'amountPaise must be greater than zero'),
    reason: z.string().min(1, 'Reason is required').max(200),
    transactionDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional(),
    notes: z.string().max(1000).optional().default(''),
  }),
});

/**
 * Validate due transaction update
 */
export const updateDueSchema = z.object({
  params: z.object({
    id: objectIdSchema,
    dueId: objectIdSchema,
  }),
  body: z.object({
    amountPaise: z
      .number({ invalid_type_error: 'amountPaise must be an integer' })
      .int('amountPaise must be an integer')
      .min(1, 'amountPaise must be greater than zero')
      .optional(),
    reason: z.string().max(200).optional(),
    notes: z.string().max(1000).optional(),
  }),
});

/**
 * Validate payment recording
 */
export const createPaymentSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
  body: z.object({
    clientTransactionId: z.string().max(100).optional(),
    amountPaise: z
      .number({ invalid_type_error: 'amountPaise must be an integer' })
      .int('amountPaise must be an integer')
      .min(1, 'amountPaise must be greater than zero'),
    paymentMethod: z.enum(['cash', 'upi', 'bank_transfer', 'neft', 'rtgs', 'imps', 'cheque', 'other'], {
      errorMap: () => ({ message: 'paymentMethod must be cash, upi, bank_transfer, neft, rtgs, imps, cheque, or other' }),
    }).default('cash'),
    paymentDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional(),
    notes: z.string().max(1000).optional().default(''),
  }),
});

/**
 * Validate customer ID in route params
 */
export const customerIdParamSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});

/**
 * Express middleware generator that validates request using Zod schema
 */
export function validate(schema) {
  return async (req, res, next) => {
    try {
      const parsed = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      // Assign parsed/sanitized data back to request
      if (parsed.body !== undefined) req.body = parsed.body;
      if (parsed.query !== undefined) req.query = parsed.query;
      if (parsed.params !== undefined) req.params = parsed.params;
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: err.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      next(err);
    }
  };
}
