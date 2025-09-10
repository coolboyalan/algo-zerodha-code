import BaseModel from "#models/base";
import { DataTypes } from "sequelize";

class OptionBuffer extends BaseModel {}

OptionBuffer.initialize(
  {
    value: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true, // fixed typo "unqiue"
      validate: {
        min: 0,
        max: 2000,
        isDivisibleBy100(value) {
          if (value % 100 !== 0) {
            throw new Error("Value must be divisible by 100");
          }
        },
      },
    },
  },
  {
    hooks: {
      async beforeCreate(instance) {
        const count = await OptionBuffer.count();
        if (count > 0) {
          throw new Error("Only one entry allowed");
        }
      },
      async beforeSave(instance) {
        if (instance.name % 100 !== 0) {
          throw new Error("Value must be divisible by 100");
        }
      },
    },
  },
);

export default OptionBuffer;
