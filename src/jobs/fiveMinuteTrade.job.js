import axios from "axios";
import cron from "node-cron";
import env from "#configs/env";
import User from "#models/user";
import Asset from "#models/asset";
import Broker from "#models/broker";
import BrokerKey from "#models/brokerKey";
import sequelize from "#configs/database";
import DailyLevel from "#models/dailyLevel";
import DailyAsset from "#models/dailyAsset";
import {
  getOpeningBalance,
  getTodaysPnL,
  placeIntradayOrder,
} from "#services/kite";
import OptionBuffer from "#models/optionBuffer";
import { getCandles, getMarketData } from "#services/angelone";
import { computeSignal } from "#services/signal";
import OptionTradeLog from "#models/optionTradeLog";
import { getAngelOption } from "#utils/angelInstrument";
import { getZerodhaOption } from "#utils/zerodhaInstrument";
import { logInfo, logWarn, logError } from "#utils/logger";

let keys = [];
let dailyAsset = null;
let buffer = null;
let dailyLevels = null;
let adminKeys = null;

try {
  await sequelize.authenticate();
  console.log("Connected to database");
} catch (e) {
  console.log("Failed to connect to db", e);
  process.exit(1);
}

const dayMap = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
};

// ----- helpers -----
function pad2(n) {
  return String(n).padStart(2, "0"); // zero-pad per spec [22]
}

function lastCompleted5mBoundary(istNow) {
  const d = new Date(istNow.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() - (d.getMinutes() % 5)); // floor to 5-min [20][21]
  return d;
}

function formatYMDHM(d) {
  // "YYYY-MM-DD HH:mm" as expected by SmartAPI historical REST [4][5]
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const HH = pad2(d.getHours());
  const MM = pad2(d.getMinutes());
  return `${yyyy}-${mm}-${dd} ${HH}:${MM}`;
}

async function exitOpenTrades(keys) {
  const data = await keys.map(async (key) => {
    await exitTrade(key);
    key.status = false;
    await key.save();
  });

  await Promise.allSettled(data);
}

async function exitTrade(key) {
  const trade = key.OptionTradeLogs[0];
  if (!trade) return;

  let name = dailyAsset.Asset.name;
  if (trade.baseAssetId !== dailyAsset.Asset.id) {
    name = await Asset.findDocById(trade.baseAssetId);
  }

  const symbol = await getZerodhaOption(
    name,
    trade.strikePrice,
    trade.direction,
  );

  const exitOrderData = {
    exchange: symbol.exchange,
    transaction_type: "SELL",
    tradingsymbol: symbol.tradingsymbol,
    quantity: trade.quantity,
    exchange: symbol.exchange,
    apiKey: key.apiKey,
    token: key.token,
  };

  await placeIntradayOrder(exitOrderData);
  console.log("Exited open trade", exitOrderData);
  trade.type = "exit";
  await trade.save();
}

async function runTradingLogic() {
  // Build IST Date using toLocaleString with Asia/Kolkata [6][14]
  const istNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
  );

  const istHour = istNow.getHours();
  const istMinute = istNow.getMinutes();
  const second = istNow.getSeconds();

  const preRange =
    (istHour === 8 && istMinute >= 30) ||
    (istHour > 8 && istHour < 15) ||
    (istHour === 15 && istMinute <= 30);

  const isInMarketRange =
    (istHour === 9 && istMinute >= 30) ||
    (istHour > 9 && istHour < 15) ||
    (istHour === 15 && istMinute <= 15);

  // if (!preRange || !isInMarketRange) return;

  // Reuse existing yyyy/mm/dd construction [4][14]
  const yyyy = istNow.getFullYear();
  const mm = String(istNow.getMonth() + 1).padStart(2, "0"); // 01-12 [4]
  const dd = String(istNow.getDate()).padStart(2, "0"); // 01-31 [4]

  if (preRange) {
    if (!dailyLevels) {
      dailyLevels = await DailyLevel.findDoc({
        forDay: `${yyyy}-${mm}-${dd}T00:00:00.000Z`,
      });
      logInfo("Loaded dailyLevels", { present: !!dailyLevels });
    }
    if (!dailyAsset) {
      const day = dayMap[istNow.getDay()];
      dailyAsset = await DailyAsset.findDoc(
        { day },
        {
          include: [
            {
              model: Asset,
            },
          ],
        },
      );
      logInfo("Loaded dailyAsset", {
        name: dailyAsset?.name,
        token: dailyAsset?.zerodhaToken,
      });
    }
    if (!keys || !adminKeys || (istMinute % 1 === 0 && second % 40 === 0)) {
      const responseKeys = await BrokerKey.findAll({
        include: [
          {
            model: Broker,
            where: { name: env.BROKER },
          },
          {
            model: User,
          },
          {
            model: OptionTradeLog,
            where: {
              type: "entry",
            },
            required: false,
            limit: 1,
            order: [["createdAt", "DESC"]],
          },
        ],
        where: {
          status: true,
        },
      });

      buffer = await OptionBuffer.findOne();

      adminKeys = await BrokerKey.findDoc(
        {},
        {
          include: [
            {
              model: Broker,
              where: { name: "Angel One" },
            },
            {
              model: User,
              where: {
                role: "admin",
              },
            },
          ],
        },
      );

      keys = responseKeys;
      logInfo("Refreshed keys/adminKeys", {
        keysCount: Array.isArray(keys) ? keys.length : 0,
        hasAdmin: !!adminKeys,
      });
    }
  }

  // Hard exit at 15:15
  if (istHour === 15 && istMinute === 15) {
    logInfo("Hard exit time — exiting open trades");
    return await exitOpenTrades(keys || []);
  }

  // Only act on 5m boundaries if desired
  // if (second !== 0 || istMinute % 5 !== 0) return;

  // Build a one-candle window: (boundary - 5m, boundary]
  const boundary = lastCompleted5mBoundary(istNow); // e.g., 10:37 -> 10:35 [20]
  const from = new Date(boundary.getTime() - 5 * 60 * 1000);
  const fromdate = formatYMDHM(from);
  const todate = formatYMDHM(boundary);

  if (second % 10 !== 0) return;

  // Call SmartAPI historical REST via your getCandles service; format per docs [4][5]
  const data = await getCandles({
    exchange: "NSE",
    symboltoken: dailyAsset.Asset.angeloneToken,
    interval: "FIVE_MINUTE",
    fromdate,
    todate,
    adminKeys,
  });

  const [_, o, h, l, c] = data.data[data.data.length - 1];
  const candle = { o, h, l, c };

  let { signal, assetPrice, direction } = computeSignal({
    candle,
    levels: dailyLevels,
  });

  let symbol, tradingSymbol, ltp;

  if (direction) {
    if (buffer) {
      if (direction === "CE") assetPrice += buffer.value;
      if (direction === "PE") assetPrice -= buffer.value;
    }

    symbol = getAngelOption(dailyAsset.Asset.name, assetPrice, direction);

    tradingSymbol = getZerodhaOption(
      dailyAsset.Asset.name,
      assetPrice,
      direction,
    );

    const exchangeTokens = {
      [symbol.exch_seg]: [symbol.token],
    };

    ltp = await getMarketData({ mode: "LTP", exchangeTokens, adminKeys });
    ltp = ltp.data.fetched[0]?.ltp ?? 1000000;
  }

  console.log(signal, assetPrice, direction, candle);

  const response = await Promise.allSettled(
    keys.map(async (key, index) => {
      try {
        key.balance = Number(key.balance);

        const lastTrade = key.OptionTradeLogs[0];

        const pnl = await getTodaysPnL({
          apiKey: key.apiKey,
          token: key.token,
        });
        console.log(key.balance, pnl);

        if (pnl <= -(key.balance * key.lossLimit) / 100) {
          await exitTrade(key);
          key.status = false;
          await key.save();
          return;
        } else if (pnl >= (key.balance * key.profitLimit) / 100) {
          await exitTrade(key);
          key.status = false;
          await key.save();
          return;
        }

        if (second >= 10) return;
        if (istMinute % 5 !== 0) return;
        if (signal === "No Action") return;

        if (signal === "Exit" || signal === "PE Exit" || signal === "CE Exit") {
          if (!lastTrade) return;

          if (lastTrade.direction === "PE" && signal === "PE Exit") {
            await exitTrade(key);
            key.status = false;
            await key.save();
            return;
          }

          if (lastTrade.direction === "CE" && signal === "CE Exit") {
            await exitTrade(key);
            key.status = false;
            await key.save();
            return;
          }

          if (signal === "Exit") {
            await exitTrade(key);
            return;
          }
        }

        if (lastTrade) {
          if (lastTrade.direction === direction) return;
          await exitTrade(key);
        }

        const newOrderData = {
          exchange: tradingSymbol.exchange,
          tradingsymbol: tradingSymbol.tradingsymbol,
          quantity: Math.floor(
            (key.balance * key.usableFund) /
              100 /
              (tradingSymbol.lot_size * ltp),
          ),
          apiKey: key.apiKey,
          token: key.token,
        };

        if (newOrderData.quantity === 0) {
          console.log(`Insufficient balance for in key, Skipping`);
          return;
        }

        newOrderData.quantity *= tradingSymbol.lot_size;

        await placeIntradayOrder(newOrderData);

        console.log("New Trade Entry", newOrderData, key.toJSON(), index);

        await OptionTradeLog.create({
          brokerKeyId: key.id,
          direction,
          strikePrice: assetPrice,
          quantity: newOrderData.quantity,
          type: "entry",
          baseAssetId: dailyAsset.Asset.id,
        });
      } catch (e) {
        console.log(e);
      }
    }),
  );
}

cron.schedule("* * * * * *", runTradingLogic);

export default {};
