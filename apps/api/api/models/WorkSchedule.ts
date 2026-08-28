import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

const parseJsonColumn = <T>(value: unknown): T | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value as T;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

export class WorkSchedule extends Model {
  declare id: number;
  declare name: string;
  declare type: 'fixed' | '12x36' | 'rotative' | 'custom';
  declare entry_time: string;
  declare exit_time: string;
  declare lunch_duration: number;
  declare flexible_lunch: boolean;
  declare work_days: number[] | null;
  declare custom_workload: Record<number, number> | null;
  declare readonly created_at: Date;
}

WorkSchedule.init(
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
    type: {
      type: DataTypes.ENUM('fixed', '12x36', 'rotative', 'custom'),
      allowNull: false,
    },
    entry_time: {
      type: DataTypes.TIME,
      allowNull: true,
    },
    exit_time: {
      type: DataTypes.TIME,
      allowNull: true,
    },
    lunch_duration: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Duration in minutes',
    },
    flexible_lunch: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    work_days: {
      type: DataTypes.JSON,
      allowNull: true,
      get() {
        return parseJsonColumn<number[]>(this.getDataValue('work_days'));
      },
    },
    custom_workload: {
      type: DataTypes.JSON,
      allowNull: true,
      get() {
        return parseJsonColumn<Record<number, number>>(this.getDataValue('custom_workload'));
      },
    },
  },
  {
    sequelize,
    tableName: 'work_schedules',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  }
);
