import { sequelize } from '../config/database.js';
import { Department } from './Department.js';
import { BiometricEvent } from './BiometricEvent.js';
import { BiometricSample } from './BiometricSample.js';
import { KioskControl } from './KioskControl.js';
import { WorkSchedule } from './WorkSchedule.js';
import { User } from './User.js';
import { TimeRecord } from './TimeRecord.js';
import { CompanyProfile } from './CompanyProfile.js';
import { Holiday } from './Holiday.js';
import { EmployeeRequest } from './EmployeeRequest.js';
import { MonthlyClosing } from './MonthlyClosing.js';
import { AttendanceSummary } from './AttendanceSummary.js';
import { AuditLog } from './AuditLog.js';
import { EmailDeliveryFailure } from './EmailDeliveryFailure.js';
import { EmailDeliveryLog } from './EmailDeliveryLog.js';
import { DataTypes } from 'sequelize';
import { Company } from './Company.js';
import { configureTenantModel } from '../tenancy/configureTenantModel.js';
import { guardTenantReference } from '../tenancy/tenantReferenceGuard.js';
import { PlatformUser } from './PlatformUser.js';
import { PlatformAuditLog } from './PlatformAuditLog.js';
import { RemotePhotoEvidence } from './RemotePhotoEvidence.js';
import { DepartmentHierarchyLevel } from './DepartmentHierarchyLevel.js';
import { DepartmentLeaderAssignment } from './DepartmentLeaderAssignment.js';

configureTenantModel(Department);
configureTenantModel(BiometricEvent);
configureTenantModel(BiometricSample);
configureTenantModel(KioskControl, [], true);
configureTenantModel(WorkSchedule);
configureTenantModel(User, ['cpf', 'registration_number']);
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

// Definir associações extras aqui, se não estiverem no próprio arquivo da model
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

export const syncDatabase = async () => {
  try {
    await sequelize.authenticate();
    console.log('Connection to MySQL has been established successfully.');
    // Avoid global alter here because MySQL + Sequelize may duplicate unique indexes over time.
    await sequelize.sync();

    const queryInterface = sequelize.getQueryInterface();
    const tables = await queryInterface.showAllTables();
    const normalizedTables = tables.map((table) => {
      if (typeof table === 'string') return table;
      return String(table);
    });

    if (normalizedTables.includes('companies')) {
      const companyRegistryColumns = await queryInterface.describeTable('companies');
      if (!companyRegistryColumns.cnpj) {
        await queryInterface.addColumn('companies', 'cnpj', {
          type: DataTypes.STRING(18),
          allowNull: true,
          unique: true,
        });
      }
      if (!companyRegistryColumns.kiosk_access_key_fingerprint) {
        await queryInterface.addColumn('companies', 'kiosk_access_key_fingerprint', {
          type: DataTypes.STRING(64),
          allowNull: true,
          unique: true,
        });
      }
    }

    if (normalizedTables.includes('company_profiles')) {
      const companyRows = 1;
      if (!companyRows) {
        await CompanyProfile.create({
          legal_name: 'Empresa não configurada',
          night_shift_start: '22:00',
          night_shift_end: '05:00',
          late_tolerance_minutes: 5,
          lunch_tolerance_minutes: 10,
        });
      }

      const companyColumns = await queryInterface.describeTable('company_profiles');

      if (!companyColumns.late_tolerance_minutes) {
        await queryInterface.addColumn('company_profiles', 'late_tolerance_minutes', {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 5,
        });
      }

      if (!companyColumns.lunch_tolerance_minutes) {
        await queryInterface.addColumn('company_profiles', 'lunch_tolerance_minutes', {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 10,
        });
      }

      if (!companyColumns.latitude) {
        await queryInterface.addColumn('company_profiles', 'latitude', {
          type: DataTypes.DECIMAL(10, 8),
          allowNull: true,
        });
      }

      if (!companyColumns.longitude) {
        await queryInterface.addColumn('company_profiles', 'longitude', {
          type: DataTypes.DECIMAL(11, 8),
          allowNull: true,
        });
      }

      if (!companyColumns.allowed_radius) {
        await queryInterface.addColumn('company_profiles', 'allowed_radius', {
          type: DataTypes.INTEGER,
          allowNull: true,
          defaultValue: 200,
        });
      }

      if (!companyColumns.block_outside_area) {
        await queryInterface.addColumn('company_profiles', 'block_outside_area', {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        });
      }
    }

    if (normalizedTables.includes('work_schedules')) {
      const scheduleColumns = await queryInterface.describeTable('work_schedules');
      if (!scheduleColumns.custom_workload) {
        await queryInterface.addColumn('work_schedules', 'custom_workload', {
          type: DataTypes.JSON,
          allowNull: true,
        });
      }
    }

    if (normalizedTables.includes('users')) {
      const userColumns = await queryInterface.describeTable('users');
      const userIndexes = await queryInterface.showIndex('users') as Array<{
        name: string;
        unique: boolean;
        fields: Array<{ attribute?: string; name?: string }>;
      }>;
      const indexFields = (index: typeof userIndexes[number]) =>
        index.fields.map((field) => field.attribute || field.name).filter(Boolean);
      const globalEmailIndex = userIndexes.find((index) =>
        index.unique && indexFields(index).length === 1 && indexFields(index)[0] === 'email'
      );
      if (!globalEmailIndex) {
        const [duplicateEmails] = await sequelize.query(
          'SELECT LOWER(email) AS email FROM users GROUP BY LOWER(email) HAVING COUNT(*) > 1 LIMIT 1'
        );
        if ((duplicateEmails as unknown[]).length) {
          throw new Error('Existem e-mails repetidos entre empresas. Resolva-os antes de habilitar o login direto.');
        }
        await queryInterface.addIndex('users', ['email'], { unique: true, name: 'users_email_unique' });
      }
      const tenantEmailIndex = userIndexes.find((index) => {
        const fields = indexFields(index);
        return index.unique && fields.includes('company_id') && fields.includes('email');
      });
      if (tenantEmailIndex) await queryInterface.removeIndex('users', tenantEmailIndex.name);
      const pinColumn = userColumns.pin_code;
      const pinType = String(pinColumn?.type || '').toLowerCase();

      if (!pinType.includes('varchar(255)')) {
        await queryInterface.changeColumn('users', 'pin_code', {
          type: DataTypes.STRING(255),
          allowNull: true,
        });
      }

      if (!userColumns.remote_clock_in_enabled) {
        await queryInterface.addColumn('users', 'remote_clock_in_enabled', {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        });
      }

      if (!userColumns.remote_clock_in_justification) {
        await queryInterface.addColumn('users', 'remote_clock_in_justification', {
          type: DataTypes.TEXT,
          allowNull: true,
        });
      }

      if (!userColumns.must_change_password) {
        await queryInterface.addColumn('users', 'must_change_password', {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        });
      }

      if (!userColumns.requires_time_tracking) {
        await queryInterface.addColumn('users', 'requires_time_tracking', {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        });
      }
    }

    if (normalizedTables.includes('employee_requests')) {
      const requestColumns = await queryInterface.describeTable('employee_requests');

      if (!requestColumns.reviewed_by) {
        await queryInterface.addColumn('employee_requests', 'reviewed_by', {
          type: DataTypes.INTEGER,
          allowNull: true,
        });
      }

      if (!requestColumns.target_manager_id) {
        await queryInterface.addColumn('employee_requests', 'target_manager_id', {
          type: DataTypes.INTEGER,
          allowNull: true,
        });
      }

      if (!requestColumns.target_department_id) {
        await queryInterface.addColumn('employee_requests', 'target_department_id', {
          type: DataTypes.INTEGER,
          allowNull: true,
        });
      }

      if (!requestColumns.attachment_name) {
        await queryInterface.addColumn('employee_requests', 'attachment_name', {
          type: DataTypes.STRING(255),
          allowNull: true,
        });
      }

      if (!requestColumns.attachment_url) {
        await queryInterface.addColumn('employee_requests', 'attachment_url', {
          type: DataTypes.TEXT,
          allowNull: true,
        });
      }

      if (!requestColumns.requested_lunch_start) {
        await queryInterface.addColumn('employee_requests', 'requested_lunch_start', {
          type: DataTypes.STRING(5),
          allowNull: true,
        });
      }

      if (!requestColumns.requested_lunch_end) {
        await queryInterface.addColumn('employee_requests', 'requested_lunch_end', {
          type: DataTypes.STRING(5),
          allowNull: true,
        });
      }

      if (!requestColumns.absence_start_time) {
        await queryInterface.addColumn('employee_requests', 'absence_start_time', {
          type: DataTypes.STRING(5),
          allowNull: true,
        });
      }

      if (!requestColumns.absence_end_time) {
        await queryInterface.addColumn('employee_requests', 'absence_end_time', {
          type: DataTypes.STRING(5),
          allowNull: true,
        });
      }
    }

    if (normalizedTables.includes('kiosk_controls')) {
      const kioskColumns = await queryInterface.describeTable('kiosk_controls');

      if (!kioskColumns.terminal_enabled) {
        await queryInterface.addColumn('kiosk_controls', 'terminal_enabled', {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        });
      }

      if (!kioskColumns.released_at) {
        await queryInterface.addColumn('kiosk_controls', 'released_at', {
          type: DataTypes.DATE,
          allowNull: true,
        });
      }
    }

    if (normalizedTables.includes('work_schedules')) {
      const workScheduleColumns = await queryInterface.describeTable('work_schedules');

      if (!workScheduleColumns.flexible_lunch) {
        await queryInterface.addColumn('work_schedules', 'flexible_lunch', {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        });
      }

      if (!workScheduleColumns.work_days) {
        await queryInterface.addColumn('work_schedules', 'work_days', {
          type: DataTypes.JSON,
          allowNull: true,
        });
      }
    }

    if (normalizedTables.includes('time_records')) {
      const timeRecordColumns = await queryInterface.describeTable('time_records');

      if (!timeRecordColumns.reviewed_by) {
        await queryInterface.addColumn('time_records', 'reviewed_by', {
          type: DataTypes.INTEGER,
          allowNull: true,
        });
      }

      if (!timeRecordColumns.review_reason) {
        await queryInterface.addColumn('time_records', 'review_reason', {
          type: DataTypes.TEXT,
          allowNull: true,
        });
      }

      if (!timeRecordColumns.reviewed_at) {
        await queryInterface.addColumn('time_records', 'reviewed_at', {
          type: DataTypes.DATE,
          allowNull: true,
        });
      }

      if (!timeRecordColumns.location_distance) {
        await queryInterface.addColumn('time_records', 'location_distance', {
          type: DataTypes.INTEGER,
          allowNull: true,
        });
      }

      if (!timeRecordColumns.location_status) {
        await queryInterface.addColumn('time_records', 'location_status', {
          type: DataTypes.ENUM('approved', 'out_of_area'),
          allowNull: true,
        });
      }

      if (!timeRecordColumns.photo_url) {
        await queryInterface.addColumn('time_records', 'photo_url', {
          type: DataTypes.STRING(255),
          allowNull: true,
        });
      }

      if (!timeRecordColumns.gps_accuracy) {
        await queryInterface.addColumn('time_records', 'gps_accuracy', {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: true,
        });
      }

      if (!timeRecordColumns.trust_level) {
        await queryInterface.addColumn('time_records', 'trust_level', {
          type: DataTypes.ENUM('high', 'medium', 'low'),
          allowNull: false,
          defaultValue: 'medium',
        });
      }
    }

    if (normalizedTables.includes('employee_requests')) {
      const requestColumns = await queryInterface.describeTable('employee_requests');

      if (!requestColumns.reviewed_by) {
        await queryInterface.addColumn('employee_requests', 'reviewed_by', {
          type: DataTypes.INTEGER,
          allowNull: true,
        });
      }

      if (!requestColumns.attachment_name) {
        await queryInterface.addColumn('employee_requests', 'attachment_name', {
          type: DataTypes.STRING(255),
          allowNull: true,
        });
      }

      if (!requestColumns.attachment_url) {
        await queryInterface.addColumn('employee_requests', 'attachment_url', {
          type: DataTypes.TEXT,
          allowNull: true,
        });
      }

      if (!requestColumns.admin_comment) {
        await queryInterface.addColumn('employee_requests', 'admin_comment', {
          type: DataTypes.TEXT,
          allowNull: true,
        });
      }

      if (!requestColumns.reviewed_at) {
        await queryInterface.addColumn('employee_requests', 'reviewed_at', {
          type: DataTypes.DATE,
          allowNull: true,
        });
      }
    }

    console.log('Database synced successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    throw error;
  }
};

export { BiometricEvent, BiometricSample, Company, CompanyProfile, Department, DepartmentHierarchyLevel, DepartmentLeaderAssignment, EmailDeliveryFailure, EmailDeliveryLog, EmployeeRequest, Holiday, KioskControl, MonthlyClosing, PlatformAuditLog, PlatformUser, RemotePhotoEvidence, WorkSchedule, User, TimeRecord, AttendanceSummary, AuditLog };
