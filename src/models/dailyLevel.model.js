import { DataTypes } from "sequelize";
import BaseModel from "#models/base";

class DailyLevel extends BaseModel {}

DailyLevel.initialize(
  {
    date: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    forDay: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    bc: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    tc: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    r1: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    r2: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    r3: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    r4: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    s1: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    s2: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    s3: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    s4: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    buffer: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
  },
  {
    indexes: [
      {
        unique: true,
        fields: ["date", "forDay"],
      },
    ],
  },
);

export default DailyLevel;
