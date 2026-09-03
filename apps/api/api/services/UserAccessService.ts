import { Op } from 'sequelize';
import { User } from '../models/User.js';
import { runWithTenant, runWithoutTenant } from '../tenancy/tenantContext.js';
import { AuditService } from './AuditService.js';

export const accessRestrictionSnapshot = (user: User) => ({
  status: user.status,
  suspended_at: user.suspended_at,
  suspended_by: user.suspended_by,
  suspension_reason: user.suspension_reason,
  suspension_type: user.suspension_type,
  suspension_start_date: user.suspension_start_date,
  suspension_end_at: user.suspension_end_at,
});

export const releaseExpiredRestriction = async (user: User) => {
  if (user.status !== 'suspended' || !user.suspension_end_at || user.suspension_end_at.getTime() > Date.now()) {
    return false;
  }

  const oldValue = accessRestrictionSnapshot(user);
  user.status = 'active';
  user.suspended_at = null;
  user.suspended_by = null;
  user.suspension_reason = null;
  user.suspension_type = null;
  user.suspension_start_date = null;
  user.suspension_end_at = null;
  await user.save();
  await AuditService.log({
    action: 'AUTO_REACTIVATE_USER',
    entity_name: 'users',
    entity_id: user.id,
    old_value: oldValue,
    new_value: accessRestrictionSnapshot(user),
  });
  return true;
};

export const releaseAllExpiredRestrictions = async () => {
  const expiredUsers = await runWithoutTenant(() => User.findAll({
    where: {
      status: 'suspended',
      suspension_end_at: { [Op.lte]: new Date() },
    },
  }));

  await Promise.all(expiredUsers.map((user) =>
    runWithTenant(user.company_id, () => releaseExpiredRestriction(user))
  ));
  return expiredUsers.length;
};
