export function computeSignal({ candle, levels, bufferKey = "buffer" }) {
  const { bc, tc, r1, r2, r3, r4, s1, s2, s3, s4 } = levels || {};
  const BUFFER = (levels && levels[bufferKey]) ?? 0;
  let signal = "No Action";
  let direction;
  let assetPrice;
  const { c: price } = candle;

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
      signal = "Exit"; // no trades between tc and bc
    }
  }

  const levelsMap = { r1, r2, r3, r4, s1, s2, s3, s4 };
  const resistances = [r1, r2, r3, r4].filter((l) => l != null);
  const supports = [s1, s2, s3, s4].filter((l) => l != null);

  for (const level of Object.values(levelsMap)) {
    if (level == null) continue;

    // --- Call trade check ---
    if (price > level && price <= level + BUFFER) {
      let gapOk = true;

      // extra condition for r2 and above
      const idx = resistances.indexOf(level);
      if (idx >= 1 && idx < resistances.length - 1) {
        const nextHigher = resistances[idx + 1];
        if (nextHigher != null && nextHigher - level < 50) {
          gapOk = false;
        }
      }

      if (gapOk) {
        signal = "Buy";
        direction = "CE";
      }
    }

    // --- Put trade check ---
    else if (price < level && price >= level - BUFFER) {
      let gapOk = true;

      // extra condition for s2 and below
      const idx = supports.indexOf(level);
      if (idx >= 1 && idx < supports.length - 1) {
        const nextLower = supports[idx + 1];
        if (nextLower != null && level - nextLower < 50) {
          gapOk = false;
        }
      }

      if (gapOk) {
        signal = "Sell";
        direction = "PE";
      }
    }
  }

  const innerLevelMap = { r1, r2, r3, r4, s1, s2, s3, s4, tc, bc };
  const { o, c } = candle;
  Object.entries(innerLevelMap).find(([levelName, level]) => {
    if (signal === "No Action") {
      if (c > level && o < level) {
        signal = "PE Exit";
        return true;
      }
      if (c < level && o > level) {
        signal = "CE Exit";
        return true;
      }
    }
    return false;
  });

  return { signal, direction, assetPrice };
}
