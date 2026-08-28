import { Router } from 'express';
import {
  closeMonthlyClosing,
  getAttendanceReport,
  getDailySheetReport,
  getHrSummary,
  getCumulativeBankHours,
  getMonthlyClosings,
  reopenMonthlyClosing,
  getRemoteRecords,
} from '../controllers/reportController.js';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/hr-summary', authenticate, getHrSummary);
router.get('/cumulative-bank-hours', authenticate, authorize(['admin', 'manager', 'employee']), getCumulativeBankHours);
router.get('/attendance', authenticate, getAttendanceReport);
router.get('/remote-records', authenticate, authorize(['admin', 'manager']), getRemoteRecords);
router.get('/daily-sheet', authenticate, getDailySheetReport);
router.get('/monthly-closures', authenticate, authorize(['admin', 'manager']), getMonthlyClosings);
router.post('/monthly-closures/close', authenticate, authorize(['admin']), closeMonthlyClosing);
router.post('/monthly-closures/reopen', authenticate, authorize(['admin']), reopenMonthlyClosing);

export default router;
