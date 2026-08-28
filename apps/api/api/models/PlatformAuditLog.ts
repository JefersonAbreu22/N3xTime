import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';
import { PlatformUser } from './PlatformUser.js';
import { Company } from './Company.js';

export class PlatformAuditLog extends Model {
  declare id: number;
  declare platform_user_id: number;
  declare company_id: number | null;
  declare action: string;
  declare metadata: Record<string, unknown> | null;
  declare ip_address: string | null;
  declare readonly created_at: Date;
}

PlatformAuditLog.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    platform_user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: PlatformUser, key: 'id' },
    },
    company_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: Company, key: 'id' },
    },
    action: { type: DataTypes.STRING(100), allowNull: false },
    metadata: { type: DataTypes.JSON, allowNull: true },
    ip_address: { type: DataTypes.STRING(64), allowNull: true },
  },
  {
    sequelize,
    tableName: 'platform_audit_logs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      { fields: ['platform_user_id', 'created_at'] },
      { fields: ['company_id', 'created_at'] },
    ],
  }
);

PlatformAuditLog.belongsTo(PlatformUser, { foreignKey: 'platform_user_id', as: 'platformUser' });
PlatformAuditLog.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
