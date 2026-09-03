import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';
import { changeUserStatus, createEmployee, listTeam, listManagers, updateUser, deleteUser } from '../controllers/userController.js';

const router = Router();

router.get('/team', authenticate, authorize(['admin', 'manager']), listTeam);
router.get('/managers', authenticate, authorize(['admin']), listManagers);
router.post('/', authenticate, authorize(['admin', 'manager']), createEmployee);
router.put('/:id', authenticate, authorize(['admin', 'manager']), updateUser);
router.patch('/:id/status', authenticate, authorize(['admin', 'manager']), changeUserStatus);
router.delete('/:id', authenticate, authorize(['admin']), deleteUser);

export default router;
