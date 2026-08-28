import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';
import { TimeRecord } from './TimeRecord.js';

export class RemotePhotoEvidence extends Model {
  declare id: number;
  declare company_id: number;
  declare record_id: number;
  declare photo_data: Buffer | null;
  declare mime_type: string;
  declare expires_at: Date;
  declare deleted_at: Date | null;
  declare readonly created_at: Date;
  declare record?: TimeRecord | null;
}

RemotePhotoEvidence.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  record_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: { model: TimeRecord, key: 'id' },
  },
  photo_data: { type: DataTypes.BLOB('long'), allowNull: true },
  mime_type: { type: DataTypes.STRING(80), allowNull: false },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  deleted_at: { type: DataTypes.DATE, allowNull: true },
}, {
  sequelize,
  tableName: 'remote_photo_evidences',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [{ fields: ['expires_at'] }, { fields: ['deleted_at'] }],
  defaultScope: { attributes: { exclude: ['photo_data'] } },
  scopes: { withPhotoData: { attributes: { include: ['photo_data'] } } },
});

RemotePhotoEvidence.belongsTo(TimeRecord, { foreignKey: 'record_id', as: 'record' });
TimeRecord.hasOne(RemotePhotoEvidence, { foreignKey: 'record_id', as: 'remotePhotoEvidence' });
