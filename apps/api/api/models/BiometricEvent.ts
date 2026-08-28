import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';
import { User } from './User.js';

export class BiometricEvent extends Model {
  declare id: number;
  declare user_id: number | null;
  declare event_type: 'enrollment' | 'verification_success' | 'verification_failure' | 'pin_fallback' | 'reset';
  declare method: 'facial' | 'pin' | 'manual' | 'web';
  declare success: boolean;
  declare match_score: number | null;
  declare threshold: number | null;
  declare reason: string | null;
  declare triggered_by: number | null;
  declare device_info: string | null;
  declare metadata: string | null;
  declare readonly created_at: Date;
}

BiometricEvent.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: User,
        key: 'id',
      },
    },
    event_type: {
      type: DataTypes.ENUM('enrollment', 'verification_success', 'verification_failure', 'pin_fallback', 'reset'),
      allowNull: false,
    },
    method: {
      type: DataTypes.ENUM('facial', 'pin', 'manual', 'web'),
      allowNull: false,
    },
    success: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    match_score: {
      type: DataTypes.DECIMAL(8, 4),
      allowNull: true,
    },
    threshold: {
      type: DataTypes.DECIMAL(8, 4),
      allowNull: true,
    },
    reason: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    triggered_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    device_info: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'biometric_events',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        fields: ['user_id'],
      },
      {
        fields: ['event_type'],
      },
    ],
  }
);

BiometricEvent.belongsTo(User, { foreignKey: 'user_id' });
User.hasMany(BiometricEvent, { foreignKey: 'user_id' });
BiometricEvent.belongsTo(User, { foreignKey: 'triggered_by', as: 'triggeredByUser' });
User.hasMany(BiometricEvent, { foreignKey: 'triggered_by', as: 'triggeredBiometricEvents' });
