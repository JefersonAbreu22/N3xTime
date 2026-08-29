import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class TenantTransferLog extends Model {
  declare id: number;
  declare company_id: number;
  declare platform_user_id: number;
  declare operation: 'import' | 'backup';
  declare filename: string;
  declare status: 'running' | 'success' | 'failed';
  declare rows_processed: number;
  declare details: string | null;
  declare error_message: string | null;
  declare readonly created_at: Date;
  declare finished_at: Date | null;
}

TenantTransferLog.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  company_id: { type: DataTypes.INTEGER, allowNull: false },
  platform_user_id: { type: DataTypes.INTEGER, allowNull: false },
  operation: { type: DataTypes.ENUM('import', 'backup'), allowNull: false },
  filename: { type: DataTypes.STRING(255), allowNull: false },
  status: { type: DataTypes.ENUM('running', 'success', 'failed'), allowNull: false, defaultValue: 'running' },
  rows_processed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  details: { type: DataTypes.TEXT('long'), allowNull: true },
  error_message: { type: DataTypes.TEXT, allowNull: true },
  finished_at: { type: DataTypes.DATE, allowNull: true },
}, {
  sequelize,
  tableName: 'tenant_transfer_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
});
