import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';
import { createEmployeeRequest, listMyRequests, listReviewRequests, reviewEmployeeRequest, assignAbsence, deleteEmployeeRequest } from '../controllers/requestController.js';
import { requestAttachmentUpload } from '../middlewares/requestAttachmentUpload.js';

const router = Router();

router.get('/my', authenticate, authorize(['employee']), listMyRequests);
router.post('/', authenticate, authorize(['employee']), requestAttachmentUpload.single('attachment'), createEmployeeRequest);
router.get('/review', authenticate, authorize(['admin', 'manager']), listReviewRequests);
router.patch('/:id/review', authenticate, authorize(['admin', 'manager']), reviewEmployeeRequest);
router.delete('/:id', authenticate, authorize(['admin', 'manager']), deleteEmployeeRequest);
router.post('/assign-absence', authenticate, authorize(['admin', 'manager']), requestAttachmentUpload.single('attachment'), assignAbsence);

export default router;
