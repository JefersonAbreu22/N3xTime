import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class Holiday extends Model {
  declare id: number;
  declare name: string;
  declare holiday_date: Date;
  declare is_paid: boolean;
  declare readonly created_at: Date;
}

Holiday.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    holiday_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      unique: true,
    },
    is_paid: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: 'holidays',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  }
);
