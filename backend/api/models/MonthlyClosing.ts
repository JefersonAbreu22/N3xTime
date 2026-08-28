import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';
import { User } from './User.js';

export class MonthlyClosing extends Model {
  declare id: number;
  declare period_month: string;
  declare period_start: string;
  declare period_end: string;
  declare status: 'open' | 'closed';
  declare snapshot: Record<string, unknown> | null;
  declare notes: string | null;
  declare reopen_reason: string | null;
  declare closed_by: number | null;
  declare closed_at: Date | null;
  declare reopened_by: number | null;
  declare reopened_at: Date | null;
  declare readonly created_at: Date;
}

MonthlyClosing.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    period_month: {
      type: DataTypes.STRING(7),
      allowNull: false,
      unique: true,
    },
    period_start: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    period_end: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('open', 'closed'),
      allowNull: false,
      defaultValue: 'open',
    },
    snapshot: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    reopen_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    closed_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: User,
        key: 'id',
      },
    },
    closed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    reopened_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: User,
        key: 'id',
      },
    },
    reopened_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'monthly_closings',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  }
);

MonthlyClosing.belongsTo(User, { foreignKey: 'closed_by', as: 'closedByUser' });
MonthlyClosing.belongsTo(User, { foreignKey: 'reopened_by', as: 'reopenedByUser' });
