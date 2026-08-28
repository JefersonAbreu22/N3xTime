import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

export class AttendanceSummary extends Model {
  declare id: number;
  declare user_id: number;
  declare date: string;
  declare worked_minutes: number;
  declare required_minutes: number;
  declare late_minutes: number;
  declare overtime_minutes: number;
  declare deficit_minutes: number;
  declare bank_balance_minutes: number;
  declare night_minutes: number;
  declare holiday_worked_minutes: number;
  declare status: 'absent' | 'in_progress' | 'complete' | 'holiday' | 'day_off' | 'justified';
  declare has_complete_journey: boolean;
  declare is_holiday: boolean;
  declare is_justified_absence: boolean;
  declare record_count: number;
  declare first_record_time: string | null;
  declare last_record_time: string | null;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

AttendanceSummary.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    worked_minutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    required_minutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    late_minutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    overtime_minutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    deficit_minutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    bank_balance_minutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    night_minutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    holiday_worked_minutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    status: {
      type: DataTypes.ENUM('absent', 'in_progress', 'complete', 'holiday', 'day_off', 'justified'),
      allowNull: false,
      defaultValue: 'absent',
    },
    has_complete_journey: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    is_holiday: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    is_justified_absence: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    record_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    first_record_time: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    last_record_time: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'attendance_summaries',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['user_id', 'date'],
      },
    ],
  }
);
