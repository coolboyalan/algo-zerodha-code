import cron from "node-cron";
import env from "#configs/env";
import Asset from "#models/asset";
import Broker from "#models/broker";
import TradeLog from "#models/tradeLog";
import BrokerKey from "#models/brokerKey";
import sequelize from "#configs/database";
import DailyLevel from "#models/dailyLevel";
import DailyAsset from "#models/dailyAsset";
import { getCandles } from "#services/angelone";
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

  if (!preRange && !isInMarketRange) return;

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
        include: [{ model: Broker, where: { name: env.BROKER } }],
        where: { status: true },
      });
      const [admin] = await sequelize.query(
        `SELECT * FROM "BrokerKeys"
       INNER JOIN "Users" ON "BrokerKeys"."userId" = "Users"."id"
       INNER JOIN "Brokers" ON "BrokerKeys"."brokerId" = "Brokers"."id"
       WHERE "Users"."role" = 'admin' AND "Brokers"."name" = 'Angel One'`,
      );
      adminKeys = admin[0];
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


  if(second % 10 !== 0) return;

  // Call SmartAPI historical REST via your getCandles service; format per docs [4][5]
  const data = await getCandles({
    exchange: "NSE",
    symboltoken: dailyAsset.Asset.angeloneToken,
    interval: "FIVE_MINUTE",
    fromdate,
    todate,
    adminKeys,
  })

  const [_,open,high,low,close]= data.data[data.data.length-1] 
  console.log({open,high,low,close})
}
	
cron.schedule("* * * * * *", runTradingLogic);

export default {};
