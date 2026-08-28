import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export type LeadershipPermission =
  | 'view_team'
  | 'manage_team'
  | 'view_time_records'
  | 'manage_time_records'
  | 'approve_requests'
  | 'view_reports'
  | 'manage_biometrics';

export class DepartmentLeaderAssignment extends Model {
  declare id: number;
  declare company_id: number;
  declare department_id: number;
  declare level_id: number;
  declare user_id: number;
  declare permissions: LeadershipPermission[] | string;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

DepartmentLeaderAssignment.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    department_id: { type: DataTypes.INTEGER, allowNull: false },
    level_id: { type: DataTypes.INTEGER, allowNull: false },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    permissions: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: ['view_team', 'view_time_records', 'approve_requests', 'view_reports'],
    },
  },
  {
    sequelize,
    tableName: 'department_leader_assignments',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { name: 'department_leader_assignments_user_level', unique: true, fields: ['company_id', 'department_id', 'level_id', 'user_id'] },
    ],
  }
);
