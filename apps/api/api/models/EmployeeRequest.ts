import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';
import { User } from './User.js';

export class EmployeeRequest extends Model {
  declare id: number;
  declare user_id: number;
  declare reviewed_by: number | null;
  declare target_manager_id: number | null;
  declare target_department_id: number | null;
  declare request_type: 'time_adjustment' | 'medical_certificate' | 'declaration' | 'vacation' | 'day_off' | 'external_work';
  declare status: 'pending' | 'approved' | 'rejected';
  declare target_date: string;
  declare requested_entry_time: string | null;
  declare requested_lunch_start: string | null;
  declare requested_lunch_end: string | null;
  declare requested_exit_time: string | null;
  declare absence_start_time: string | null;
  declare absence_end_time: string | null;
  declare reason: string;
  declare attachment_name: string | null;
  declare attachment_url: string | null;
  declare admin_comment: string | null;
  declare reviewed_at: Date | null;
  declare readonly created_at: Date;
}

EmployeeRequest.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: User,
        key: 'id',
      },
    },
    reviewed_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: User,
        key: 'id',
      },
    },
    target_manager_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: User,
        key: 'id',
      },
    },
    target_department_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    request_type: {
      type: DataTypes.ENUM('time_adjustment', 'medical_certificate', 'declaration', 'vacation', 'day_off', 'external_work'),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected'),
      allowNull: false,
      defaultValue: 'pending',
    },
    target_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    requested_entry_time: {
      type: DataTypes.STRING(5),
      allowNull: true,
    },
    requested_lunch_start: {
      type: DataTypes.STRING(5),
      allowNull: true,
    },
    requested_lunch_end: {
      type: DataTypes.STRING(5),
      allowNull: true,
    },
    requested_exit_time: {
      type: DataTypes.STRING(5),
      allowNull: true,
    },
    absence_start_time: {
      type: DataTypes.STRING(5),
      allowNull: true,
    },
    absence_end_time: {
      type: DataTypes.STRING(5),
      allowNull: true,
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    attachment_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    attachment_url: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    admin_comment: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    reviewed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'employee_requests',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  }
);

EmployeeRequest.belongsTo(User, { foreignKey: 'user_id', as: 'requester' });
EmployeeRequest.belongsTo(User, { foreignKey: 'reviewed_by', as: 'reviewer' });
User.hasMany(EmployeeRequest, { foreignKey: 'user_id', as: 'requests' });
User.hasMany(EmployeeRequest, { foreignKey: 'reviewed_by', as: 'reviewedRequests' });
