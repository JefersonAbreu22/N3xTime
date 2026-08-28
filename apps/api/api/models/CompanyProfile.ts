import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class CompanyProfile extends Model {
  declare id: number;
  declare legal_name: string;
  declare trade_name: string | null;
  declare cnpj: string | null;
  declare email: string | null;
  declare phone: string | null;
  declare address_line: string | null;
  declare city: string | null;
  declare state: string | null;
  declare zip_code: string | null;
  declare night_shift_start: string;
  declare night_shift_end: string;
  declare late_tolerance_minutes: number;
  declare lunch_tolerance_minutes: number;
  declare latitude: number | null;
  declare longitude: number | null;
  declare allowed_radius: number | null;
  declare block_outside_area: boolean;
  declare readonly created_at: Date;
}

CompanyProfile.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    legal_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: 'Empresa não configurada',
    },
    trade_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    cnpj: {
      type: DataTypes.STRING(18),
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    address_line: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    city: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    state: {
      type: DataTypes.STRING(80),
      allowNull: true,
    },
    zip_code: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    night_shift_start: {
      type: DataTypes.STRING(5),
      allowNull: false,
      defaultValue: '22:00',
    },
    night_shift_end: {
      type: DataTypes.STRING(5),
      allowNull: false,
      defaultValue: '05:00',
    },
    late_tolerance_minutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5,
    },
    lunch_tolerance_minutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10,
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: true,
    },
    longitude: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: true,
    },
    allowed_radius: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 200,
    },
    block_outside_area: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'company_profiles',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  }
);
