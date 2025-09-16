export function computeSignal({ candle, levels, bufferKey = "buffer" }) {
  const { bc, tc, r1, r2, r3, r4, s1, s2, s3, s4 } = levels || {};
  const BUFFER = (levels && levels[bufferKey]) ?? 0;
  let signal = "No Action";
  let direction;
  let assetPrice;
  let { c: price } = candle;

  // round price to nearest 100
  if (price % 100 > 50) {
    assetPrice = parseInt(price / 100) * 100 + 100;
  } else {
    assetPrice = parseInt(price / 100) * 100;
  }

  // no trades between tc and bc
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

  // Levels in correct order: r4 > r3 > r2 > r1 > tc > bc > s1 > s2 > s3 > s4
  const orderedLevels = [r4, r3, r2, r1, tc, bc, s1, s2, s3, s4].filter(
    (l) => l != null,
  );

  for (let i = 0; i < orderedLevels.length; i++) {
    const level = orderedLevels[i];

    // --- Call trade check (above level within buffer) ---
    if (price > level && price <= level + BUFFER) {
      let gapOk = true;

      // check next higher level
      if (i > 0) {
        const nextHigher = orderedLevels[i - 1]; // since array is top→bottom
        if (nextHigher != null && nextHigher - level < 0) {
          gapOk = false;
        }
      }

      if (gapOk) {
        signal = "Buy";
        direction = "CE";
      }
    }

    // --- Put trade check (below level within buffer) ---
    else if (price < level && price >= level - BUFFER) {
      let gapOk = true;

      // check next lower level
      if (i < orderedLevels.length - 1) {
        const nextLower = orderedLevels[i + 1];
        if (nextLower != null && level - nextLower < 0) {
          gapOk = false;
        }
      }

      if (gapOk) {
        signal = "Sell";
        direction = "PE";
      }
    }
  }

  // Exit check if still No Action
  const innerLevelMap = { r1, r2, r3, r4, s1, s2, s3, s4, tc, bc };
  const { o, c } = candle;
  Object.entries(innerLevelMap).find(([_, level]) => {
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
