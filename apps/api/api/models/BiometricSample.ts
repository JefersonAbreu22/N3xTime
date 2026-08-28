import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';
import { User } from './User.js';

export class BiometricSample extends Model {
  declare id: number;
  declare user_id: number;
  declare descriptor: string;
  declare quality_score: number | null;
  declare sample_index: number;
  declare captured_by: number | null;
  declare readonly created_at: Date;
}

BiometricSample.init(
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
    descriptor: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
    },
    quality_score: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
    sample_index: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    captured_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'biometric_samples',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        fields: ['user_id'],
      },
    ],
  }
);

BiometricSample.belongsTo(User, { foreignKey: 'user_id' });
User.hasMany(BiometricSample, { foreignKey: 'user_id' });
