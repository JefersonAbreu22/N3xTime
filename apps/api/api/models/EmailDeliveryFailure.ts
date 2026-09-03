import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';
import { TimeRecord } from './TimeRecord.js';
import { User } from './User.js';

export class EmailDeliveryFailure extends Model {
  declare id: number;
  declare company_id: number;
  declare record_id: number;
  declare user_id: number;
  declare recipient: string;
  declare error_message: string;
  declare smtp_code: string | null;
  declare attempted_at: Date;
  declare readonly created_at: Date;
}

EmailDeliveryFailure.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    record_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: TimeRecord, key: 'id' },
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: User, key: 'id' },
    },
    recipient: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    smtp_code: {
      type: DataTypes.STRING(80),
      allowNull: true,
    },
    attempted_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'email_delivery_failures',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      { fields: ['record_id'] },
      { fields: ['user_id'] },
      { fields: ['attempted_at'] },
    ],
  }
);

EmailDeliveryFailure.belongsTo(TimeRecord, { foreignKey: 'record_id', as: 'record' });
EmailDeliveryFailure.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
TimeRecord.hasMany(EmailDeliveryFailure, { foreignKey: 'record_id', as: 'email_delivery_failures' });
User.hasMany(EmailDeliveryFailure, { foreignKey: 'user_id', as: 'email_delivery_failures' });
