import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class Department extends Model {
  declare id: number;
  declare name: string;
  declare readonly created_at: Date;
}

Department.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'departments',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  }
);
