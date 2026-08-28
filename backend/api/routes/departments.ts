import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';
import { listDepartments, createDepartment, updateDepartment, deleteDepartment, updateDepartmentHierarchy } from '../controllers/departmentController.js';

const router = Router();

router.get('/', authenticate, authorize(['admin', 'manager']), listDepartments);
router.post('/', authenticate, authorize(['admin']), createDepartment);
router.put('/:id', authenticate, authorize(['admin']), updateDepartment);
router.put('/:id/hierarchy', authenticate, authorize(['admin']), updateDepartmentHierarchy);
router.delete('/:id', authenticate, authorize(['admin']), deleteDepartment);

export default router;
