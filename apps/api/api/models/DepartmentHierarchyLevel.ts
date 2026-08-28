import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class DepartmentHierarchyLevel extends Model {
  declare id: number;
  declare company_id: number;
  declare department_id: number;
  declare name: string;
  declare position: number;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

DepartmentHierarchyLevel.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    department_id: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING(80), allowNull: false },
    // 1 is the highest level. Larger values are closer to the employee.
    position: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    sequelize,
    tableName: 'department_hierarchy_levels',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { name: 'department_hierarchy_levels_department_position', unique: true, fields: ['company_id', 'department_id', 'position'] },
      { name: 'department_hierarchy_levels_department_name', unique: true, fields: ['company_id', 'department_id', 'name'] },
    ],
  }
);
