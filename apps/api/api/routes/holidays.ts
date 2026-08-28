import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';
import { createHoliday, deleteHoliday, listHolidays } from '../controllers/holidayController.js';

const router = Router();

router.get('/', authenticate, authorize(['admin', 'manager']), listHolidays);
router.post('/', authenticate, authorize(['admin']), createHoliday);
router.delete('/:id', authenticate, authorize(['admin']), deleteHoliday);

export default router;
