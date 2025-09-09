export function computeSignal({ candle, levels, bufferKey = "buffer" }) {
  const { bc, tc, r1, r2, r3, r4, s1, s2, s3, s4 } = levels || {};
  const BUFFER = (levels && levels[bufferKey]) ?? 0;
  let signal = "No Action";
  let direction;
  let assetPrice;

  if (price % 100 > 50) {
    assetPrice = parseInt(price / 100) * 100 + 100;
  } else {
    assetPrice = parseInt(price / 100) * 100;
  }

  if (tc != null && bc != null) {
    if (price >= tc && price <= tc + BUFFER) {
      direction = "CE";
      signal = "Buy";
    } else if (price <= bc && price >= bc - BUFFER) {
      direction = "PE";
      signal = "Sell";
    } else if (price < tc && price > bc) {
      signal = "Exit";
    }
  }
  const levelsMap = { r1, r2, r3, r4, s1, s2, s3, s4 };
  for (const level of Object.values(levelsMap)) {
    if (level == null) continue;
    if (price > level && price <= level + BUFFER) {
      signal = "Buy";
      direction = "CE";
    } else if (price < level && price >= level - BUFFER) {
      signal = "Sell";
      direction = "PE";
    }
  }

  const innerLevelMap = { r1, r2, r3, r4, s1, s2, s3, s4, tc, bc };
  const { o, c } = candle;
  Object.entries(innerLevelMap).find(([levelName, level]) => {
    if (signal === "No Action") {
      if (c > level && o < level) {
        signal = "PE Exit";
        reason = `Price crossed the level ${levelName}`;
        return true;
      }
      if (c < level && o > level) {
        signal = "CE Exit";
        reason = `Price crossed the level ${levelName}`;
        return true;
      }
    }
    return false;
  });

  if (direction === "CE") {
    assetPrice += 600;
  } else if (direction === "PE") {
    assetPrice -= 600;
  }

  return { signal, direction, assetPrice };
}
