import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class Company extends Model {
  declare id: number;
  declare legal_name: string;
  declare trade_name: string | null;
  declare slug: string;
  declare cnpj: string | null;
  declare status: 'active' | 'inactive' | 'suspended';
  declare kiosk_access_key_hash: string | null;
  declare kiosk_access_key_fingerprint: string | null;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

Company.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    legal_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    trade_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    slug: {
      type: DataTypes.STRING(80),
      allowNull: false,
      unique: true,
    },
    cnpj: {
      type: DataTypes.STRING(18),
      allowNull: true,
      unique: true,
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'suspended'),
      allowNull: false,
      defaultValue: 'active',
    },
    kiosk_access_key_hash: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    kiosk_access_key_fingerprint: {
      type: DataTypes.STRING(64),
      allowNull: true,
      unique: true,
    },
  },
  {
    sequelize,
    tableName: 'companies',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);
