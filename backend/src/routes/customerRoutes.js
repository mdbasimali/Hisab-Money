import { Router } from 'express';
import {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
} from '../controllers/customerController.js';
import {
  createDue,
  updateDue,
  createPayment,
  getCustomerTransactions,
} from '../controllers/transactionController.js';
import {
  validate,
  createCustomerSchema,
  updateCustomerSchema,
  createDueSchema,
  updateDueSchema,
  createPaymentSchema,
  customerIdParamSchema,
} from '../middleware/validate.js';

const router = Router();

// Customer CRUD
router.get('/', getCustomers);
router.post('/', validate(createCustomerSchema), createCustomer);
router.get('/:id', validate(customerIdParamSchema), getCustomerById);
router.patch('/:id', validate(updateCustomerSchema), updateCustomer);

// Transactions linked to a customer
router.post('/:id/dues', validate(createDueSchema), createDue);
router.patch('/:id/dues/:dueId', validate(updateDueSchema), updateDue);
router.post('/:id/payments', validate(createPaymentSchema), createPayment);
router.get('/:id/transactions', validate(customerIdParamSchema), getCustomerTransactions);

export default router;
