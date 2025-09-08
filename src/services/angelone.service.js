import axios from "axios";

export async function getCandles({
  exchange,
  symboltoken,
  interval,
  fromdate,
  todate,
  adminKeys,
}) {
  const url =
    "https://apiconnect.angelbroking.com/rest/secure/angelbroking/historical/v1/getCandleData";
  const headers = {
    Authorization: `Bearer ${adminKeys.token}`,
    "X-PrivateKey": adminKeys.apiKey,
    "X-UserType": "USER",
    "X-SourceID": "WEB",
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-ClientLocalIP": adminKeys.localIP || "127.0.0.1",
    "X-ClientPublicIP": adminKeys.publicIP || "127.0.0.1",
    "X-MACAddress": adminKeys.mac || "00-00-00-00-00-00",
  };

  const body = { exchange, symboltoken, interval, fromdate, todate };
  const { data } = await axios.post(url, body, { headers });
  return data; // { status, message, data: { candles: [...] } } typically
}
