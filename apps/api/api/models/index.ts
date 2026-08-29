import { sequelize } from '../config/database.js';
import { configureTenantModel } from '../tenancy/configureTenantModel.js';
import { guardTenantReference } from '../tenancy/tenantReferenceGuard.js';
import { AttendanceSummary } from './AttendanceSummary.js';
import { Account } from './Account.js';
import { AuditLog } from './AuditLog.js';
import { BiometricEvent } from './BiometricEvent.js';
import { BiometricSample } from './BiometricSample.js';
import { Company } from './Company.js';
import { CompanyMembership } from './CompanyMembership.js';
import { CompanyProfile } from './CompanyProfile.js';
import { Department } from './Department.js';
import { DepartmentHierarchyLevel } from './DepartmentHierarchyLevel.js';
import { DepartmentLeaderAssignment } from './DepartmentLeaderAssignment.js';
import { EmailDeliveryFailure } from './EmailDeliveryFailure.js';
import { EmailDeliveryLog } from './EmailDeliveryLog.js';
import { EmployeeRequest } from './EmployeeRequest.js';
import { Holiday } from './Holiday.js';
import { KioskControl } from './KioskControl.js';
import { MonthlyClosing } from './MonthlyClosing.js';
import { PlatformAuditLog } from './PlatformAuditLog.js';
import { PlatformUser } from './PlatformUser.js';
import { RemotePhotoEvidence } from './RemotePhotoEvidence.js';
import { TimeRecord } from './TimeRecord.js';
import { TenantTransferLog } from './TenantTransferLog.js';
import { User } from './User.js';
import { WorkSchedule } from './WorkSchedule.js';

configureTenantModel(Department);
configureTenantModel(BiometricEvent);
configureTenantModel(BiometricSample);
configureTenantModel(KioskControl, [], true);
configureTenantModel(WorkSchedule);
configureTenantModel(User, ['cpf', 'registration_number', 'email']);
configureTenantModel(TimeRecord);
configureTenantModel(CompanyProfile, [], true);
configureTenantModel(Holiday, ['holiday_date']);
configureTenantModel(EmployeeRequest);
configureTenantModel(MonthlyClosing, ['period_month']);
configureTenantModel(AttendanceSummary);
configureTenantModel(AuditLog);
configureTenantModel(EmailDeliveryFailure);
configureTenantModel(EmailDeliveryLog);
configureTenantModel(RemotePhotoEvidence);
configureTenantModel(DepartmentHierarchyLevel);
configureTenantModel(DepartmentLeaderAssignment);

guardTenantReference(User, 'department_id', Department);
guardTenantReference(User, 'manager_id', User);
guardTenantReference(User, 'schedule_id', WorkSchedule);
guardTenantReference(TimeRecord, 'user_id', User);
guardTenantReference(TimeRecord, 'reviewed_by', User);
guardTenantReference(AttendanceSummary, 'user_id', User);
guardTenantReference(BiometricSample, 'user_id', User);
guardTenantReference(BiometricSample, 'captured_by', User);
guardTenantReference(BiometricEvent, 'user_id', User);
guardTenantReference(BiometricEvent, 'triggered_by', User);
guardTenantReference(EmployeeRequest, 'user_id', User);
guardTenantReference(EmployeeRequest, 'reviewed_by', User);
guardTenantReference(EmployeeRequest, 'target_manager_id', User);
guardTenantReference(EmployeeRequest, 'target_department_id', Department);
guardTenantReference(MonthlyClosing, 'closed_by', User);
guardTenantReference(MonthlyClosing, 'reopened_by', User);
guardTenantReference(AuditLog, 'user_id', User);
guardTenantReference(EmailDeliveryFailure, 'record_id', TimeRecord);
guardTenantReference(EmailDeliveryFailure, 'user_id', User);
guardTenantReference(EmailDeliveryLog, 'record_id', TimeRecord);
guardTenantReference(EmailDeliveryLog, 'user_id', User);
guardTenantReference(RemotePhotoEvidence, 'record_id', TimeRecord);
guardTenantReference(DepartmentHierarchyLevel, 'department_id', Department);
guardTenantReference(DepartmentLeaderAssignment, 'department_id', Department);
guardTenantReference(DepartmentLeaderAssignment, 'level_id', DepartmentHierarchyLevel);
guardTenantReference(DepartmentLeaderAssignment, 'user_id', User);

Company.hasMany(User, { foreignKey: 'company_id', as: 'users' });
User.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
Company.hasOne(CompanyProfile, { foreignKey: 'company_id', as: 'profile' });
CompanyProfile.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });

Department.hasMany(User, { foreignKey: 'department_id', as: 'users' });
User.belongsTo(Department, { foreignKey: 'department_id', as: 'department' });
Department.hasMany(DepartmentHierarchyLevel, { foreignKey: 'department_id', as: 'hierarchy_levels' });
DepartmentHierarchyLevel.belongsTo(Department, { foreignKey: 'department_id', as: 'department' });
DepartmentHierarchyLevel.hasMany(DepartmentLeaderAssignment, { foreignKey: 'level_id', as: 'leaders' });
DepartmentLeaderAssignment.belongsTo(DepartmentHierarchyLevel, { foreignKey: 'level_id', as: 'level' });
DepartmentLeaderAssignment.belongsTo(Department, { foreignKey: 'department_id', as: 'department' });
DepartmentLeaderAssignment.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(AttendanceSummary, { foreignKey: 'user_id', as: 'attendance_summaries' });
AttendanceSummary.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

export const connectDatabase = async () => {
  try {
    await sequelize.authenticate();
    console.log('Connection to MySQL has been established successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    throw error;
  }
};

export {
  Account,
  AttendanceSummary,
  AuditLog,
  BiometricEvent,
  BiometricSample,
  Company,
  CompanyMembership,
  CompanyProfile,
  Department,
  DepartmentHierarchyLevel,
  DepartmentLeaderAssignment,
  EmailDeliveryFailure,
  EmailDeliveryLog,
  EmployeeRequest,
  Holiday,
  KioskControl,
  MonthlyClosing,
  PlatformAuditLog,
  PlatformUser,
  RemotePhotoEvidence,
  TimeRecord,
  TenantTransferLog,
  User,
  WorkSchedule,
};
