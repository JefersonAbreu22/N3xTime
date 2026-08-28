import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

export class AuditLog extends Model {
  declare id: number;
  declare user_id: number | null;
  declare action: string;
  declare entity_name: string;
  declare entity_id: number | null;
  declare old_value: string | null;
  declare new_value: string | null;
  declare ip_address: string | null;
  declare device_info: string | null;
  declare readonly created_at: Date;
}

AuditLog.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    action: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    entity_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    entity_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    old_value: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    new_value: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    ip_address: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    device_info: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'audit_logs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  }
);
