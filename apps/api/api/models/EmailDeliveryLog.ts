import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';
import { TimeRecord } from './TimeRecord.js';
import { User } from './User.js';

export class EmailDeliveryLog extends Model {
  declare id: number;
  declare company_id: number;
  declare record_id: number;
  declare user_id: number;
  declare recipient: string;
  declare status: 'sent' | 'failed';
  declare smtp_code: string | null;
  declare message_id: string | null;
  declare smtp_response: string | null;
  declare error_message: string | null;
  declare attempted_at: Date;
  declare readonly created_at: Date;
}

EmailDeliveryLog.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  record_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: TimeRecord, key: 'id' } },
  user_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: User, key: 'id' } },
  recipient: { type: DataTypes.STRING(255), allowNull: false },
  status: { type: DataTypes.ENUM('sent', 'failed'), allowNull: false },
  smtp_code: { type: DataTypes.STRING(80), allowNull: true },
  message_id: { type: DataTypes.STRING(255), allowNull: true },
  smtp_response: { type: DataTypes.TEXT, allowNull: true },
  error_message: { type: DataTypes.TEXT, allowNull: true },
  attempted_at: { type: DataTypes.DATE, allowNull: false },
}, {
  sequelize, tableName: 'email_delivery_logs', timestamps: true, createdAt: 'created_at', updatedAt: false,
  indexes: [{ fields: ['record_id'] }, { fields: ['user_id'] }, { fields: ['status'] }, { fields: ['attempted_at'] }],
});

EmailDeliveryLog.belongsTo(TimeRecord, { foreignKey: 'record_id', as: 'record' });
EmailDeliveryLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
TimeRecord.hasMany(EmailDeliveryLog, { foreignKey: 'record_id', as: 'email_delivery_logs' });
User.hasMany(EmailDeliveryLog, { foreignKey: 'user_id', as: 'email_delivery_logs' });
