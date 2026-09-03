import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';
import { Department } from './Department.js';
import { WorkSchedule } from './WorkSchedule.js';

export type AccessRestrictionType =
  | 'temporary_suspension'
  | 'inss_leave'
  | 'occupational_leave'
  | 'parental_leave'
  | 'unpaid_leave'
  | 'permanent_disability_retirement'
  | 'military_service'
  | 'union_or_elective_mandate'
  | 'family_care_leave'
  | 'protective_measure'
  | 'judicial_detention'
  | 'other_leave'
  | 'termination';

export class User extends Model {
  declare id: number;
  declare company_id: number;
  declare name: string;
  declare cpf: string;
  declare registration_number: string;
  declare email: string;
  declare password_hash: string;
  declare role: 'admin' | 'manager' | 'employee';
  declare work_type: 'presential' | 'hybrid' | 'remote';
  declare department_id: number | null;
  declare manager_id: number | null;
  declare schedule_id: number | null;
  declare pin_code: string | null;
  declare facial_descriptor: string | null;
  declare status: 'active' | 'suspended' | 'inactive';
  declare suspended_at: Date | null;
  declare suspended_by: number | null;
  declare suspension_reason: string | null;
  declare suspension_type: AccessRestrictionType | null;
  declare suspension_start_date: string | null;
  declare suspension_end_at: Date | null;
  declare hire_date: string | null;
  declare remote_clock_in_enabled: boolean;
  declare remote_clock_in_justification: string | null;
  declare must_change_password: boolean;
  declare requires_time_tracking: boolean;
  declare readonly created_at: Date;
  declare schedule?: WorkSchedule | null;
}

User.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    cpf: {
      type: DataTypes.STRING(14),
      unique: true,
      allowNull: false,
    },
    registration_number: {
      type: DataTypes.STRING(50),
      unique: true,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      unique: true,
      allowNull: false,
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    role: {
      type: DataTypes.ENUM('admin', 'manager', 'employee'),
      allowNull: false,
    },
    work_type: {
      type: DataTypes.ENUM('presential', 'hybrid', 'remote'),
      allowNull: false,
    },
    department_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: Department,
        key: 'id',
      },
    },
    manager_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    schedule_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: WorkSchedule,
        key: 'id',
      },
    },
    pin_code: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    facial_descriptor: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      comment: 'JSON string of facial embedding',
    },
    status: {
      type: DataTypes.ENUM('active', 'suspended', 'inactive'),
      defaultValue: 'active',
    },
    suspended_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    suspended_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    suspension_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    suspension_type: {
      type: DataTypes.ENUM('temporary_suspension', 'inss_leave', 'occupational_leave', 'parental_leave', 'unpaid_leave', 'permanent_disability_retirement', 'military_service', 'union_or_elective_mandate', 'family_care_leave', 'protective_measure', 'judicial_detention', 'other_leave', 'termination'),
      allowNull: true,
    },
    suspension_start_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    suspension_end_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    hire_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    remote_clock_in_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    remote_clock_in_justification: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    must_change_password: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    requires_time_tracking: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  }
);

// Self-referencing association for manager
User.belongsTo(User, { as: 'manager', foreignKey: 'manager_id' });
User.belongsTo(Department, { foreignKey: 'department_id' });
User.belongsTo(WorkSchedule, { foreignKey: 'schedule_id', as: 'schedule' });
