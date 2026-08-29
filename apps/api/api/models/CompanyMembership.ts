import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class CompanyMembership extends Model {
  declare id: number;
  declare account_id: number;
  declare company_id: number;
  declare user_id: number;
  declare status: 'active' | 'inactive';
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

CompanyMembership.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  account_id: { type: DataTypes.INTEGER, allowNull: false },
  company_id: { type: DataTypes.INTEGER, allowNull: false },
  user_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' },
}, {
  sequelize,
  tableName: 'company_memberships',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [{ unique: true, fields: ['account_id', 'company_id'], name: 'company_memberships_account_company' }],
});
