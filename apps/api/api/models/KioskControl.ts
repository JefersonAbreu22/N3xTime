import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class KioskControl extends Model {
  declare id: number;
  declare session_version: number;
  declare terminal_enabled: boolean;
  declare last_revoked_at: Date | null;
  declare released_at: Date | null;
  declare readonly created_at: Date;
}

KioskControl.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    session_version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    terminal_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    last_revoked_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    released_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'kiosk_controls',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  }
);
