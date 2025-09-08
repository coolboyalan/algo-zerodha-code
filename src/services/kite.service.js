import qs from 'qs';
import axios from 'axios';

export async function getOpeningBalance({ apiKey, token }) {
  const res = await axios.get('https://api.kite.trade/user/margins', {
    headers: { 'X-Kite-Version': '3', Authorization: `token ${apiKey}:${token}` },
  });
  return res.data.data.equity.available.opening_balance;
}

export async function getTodaysPnL({ apiKey, token }) {
  const res = await axios.get('https://api.kite.trade/portfolio/positions', {
    headers: { 'X-Kite-Version': '3', Authorization: `token ${apiKey}:${token}` },
  });
  const dayPositions = res.data.data.day || [];
  return dayPositions.reduce((sum, pos) => sum + pos.pnl, 0);
}

export async function placeIntradayOrder({ apiKey, token, exchange = 'NSE', tradingsymbol, transaction_type = 'BUY', quantity = 1 }) {
  const data = qs.stringify({
    tradingsymbol, exchange, transaction_type, order_type: 'MARKET', quantity, product: 'MIS', validity: 'DAY',
  });
  const headers = {
    'X-Kite-Version': '3',
    Authorization: `token ${apiKey}:${token}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  const response = await axios.post('https://api.kite.trade/orders/regular', data, { headers });
  return response.data;
}
