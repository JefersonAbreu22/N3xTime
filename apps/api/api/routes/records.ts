import { Router } from 'express';
import { registerRecord, getMyRecords, getRecentRecords, registerRecordByPin, logBiometricFailure, updateRecordStatus, registerRemoteRecord, getEmailDeliveryFailures, getEmailDeliveryLogs } from '../controllers/recordController.js';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';
import { remotePhotoUpload } from '../middlewares/remotePhotoUpload.js';

const router = Router();

router.post('/', authenticate, registerRecord);
router.post('/remote', authenticate, remotePhotoUpload.single('foto'), registerRemoteRecord);
router.post('/pin', authenticate, authorize(['kiosk']), registerRecordByPin);
router.post('/biometric-failure', authenticate, authorize(['kiosk']), logBiometricFailure);
router.get('/email-failures', authenticate, authorize(['admin']), getEmailDeliveryFailures);
router.get('/email-logs', authenticate, authorize(['admin']), getEmailDeliveryLogs);
router.patch('/:id/status', authenticate, authorize(['admin', 'manager']), updateRecordStatus);

router.get('/me', authenticate, getMyRecords);
router.get('/recent', authenticate, getRecentRecords);

export default router;
