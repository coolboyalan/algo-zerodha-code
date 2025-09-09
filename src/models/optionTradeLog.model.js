import User from "#models/user";
import Asset from "#models/asset";
import Broker from "#models/broker";
import BaseModel from "#models/base";
import { DataTypes } from "sequelize";
import BrokerKey from "#models/brokerKey";

class OptionTradeLog extends BaseModel {}

OptionTradeLog.initialize({
  brokerKeyId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: BrokerKey,
      key: BrokerKey.primaryKeyAttribute,
    },
  },
  baseAssetId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Asset,
      key: Asset.primaryKeyAttribute,
    },
  },
  direction: {
    type: DataTypes.ENUM("CE", "PE"),
    allowNull: false,
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  type: {
    type: DataTypes.ENUM("entry", "exit"),
    allowNull: false,
  },
  strikePrice: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
});

BrokerKey.hasMany(OptionTradeLog, {
  foreignKey: "brokerKeyId",
});

export default OptionTradeLog;
