import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';
import { User } from './User.js';

export class TimeRecord extends Model {
  declare id: number;
  declare company_id: number;
  declare user_id: number;
  declare record_time: Date;
  declare record_type: 'entry' | 'lunch_start' | 'lunch_end' | 'exit' | 'auto';
  declare method: 'facial' | 'pin' | 'manual' | 'web';
  declare latitude: number | null;
  declare longitude: number | null;
  declare location_distance: number | null;
  declare location_status: 'approved' | 'out_of_area' | null;
  declare photo_url: string | null;
  declare ip_address: string | null;
  declare device_info: string | null;
  declare gps_accuracy: number | null;
  declare trust_level: 'high' | 'medium' | 'low';
  declare status: 'valid' | 'pending_approval' | 'rejected' | 'adjusted';
  declare reviewed_by: number | null;
  declare review_reason: string | null;
  declare reviewed_at: Date | null;
  declare readonly created_at: Date;
}

TimeRecord.init(
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
    record_time: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    record_type: {
      type: DataTypes.ENUM('entry', 'lunch_start', 'lunch_end', 'exit', 'auto'),
      allowNull: false,
    },
    method: {
      type: DataTypes.ENUM('facial', 'pin', 'manual', 'web'),
      allowNull: false,
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: true,
    },
    longitude: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: true,
    },
    location_distance: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    location_status: {
      type: DataTypes.ENUM('approved', 'out_of_area'),
      allowNull: true,
    },
    photo_url: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: true,
    },
    device_info: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    gps_accuracy: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    trust_level: {
      type: DataTypes.ENUM('high', 'medium', 'low'),
      allowNull: false,
      defaultValue: 'medium',
    },
    status: {
      type: DataTypes.ENUM('valid', 'pending_approval', 'rejected', 'adjusted'),
      defaultValue: 'valid',
    },
    reviewed_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: User,
        key: 'id',
      },
    },
    review_reason: {
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
    tableName: 'time_records',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  }
);

TimeRecord.belongsTo(User, { foreignKey: 'user_id' });
TimeRecord.belongsTo(User, { foreignKey: 'reviewed_by', as: 'reviewer' });
User.hasMany(TimeRecord, { foreignKey: 'user_id' });
User.hasMany(TimeRecord, { foreignKey: 'reviewed_by', as: 'reviewedRecords' });
