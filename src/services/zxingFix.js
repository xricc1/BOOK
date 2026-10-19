// Runtime fix for a bug in ZXing-js (bundled inside html5-qrcode 2.3.8).
//
// AbstractUPCEANReader.findGuardPattern shifts its run-length window wrongly:
// after a failed match it should move counters[2] to counters[0]
// (System.arraycopy(counters, 2, counters, 0, counterPosition - 1) in the Java
// original), but the JS port copies from an empty slice and writes 0 instead.
// The result: the EAN start guard is only found when it is the very first dark
// thing in the scanned row. Any text, picture or dark cover colour to the left
// of a book barcode makes the read fail, which is why scanning books took so
// long or never worked.

import * as ZXing from 'html5-qrcode/third_party/zxing-js.umd.js';

let applied = false;

export function applyZxingFix() {
  if (applied) return true;
  try {
    // Bundlers may expose the UMD exports directly or under `default`
    const Z = ZXing.EAN13Reader ? ZXing : ZXing.default;
    if (!Z?.EAN13Reader) return false;
    const UPCEANReader = Object.getPrototypeOf(Z.EAN13Reader);
    const AbstractUPCEANReader = Object.getPrototypeOf(UPCEANReader);
    const OneDReader = Z.OneDReader;
    if (
      typeof AbstractUPCEANReader?.findGuardPattern !== 'function' ||
      typeof OneDReader?.patternMatchVariance !== 'function'
    ) {
      return false;
    }

    AbstractUPCEANReader.findGuardPattern = function findGuardPattern(
      row, rowOffset, whiteFirst, pattern, counters
    ) {
      const width = row.getSize();
      rowOffset = whiteFirst ? row.getNextUnset(rowOffset) : row.getNextSet(rowOffset);
      let counterPosition = 0;
      let patternStart = rowOffset;
      const patternLength = pattern.length;
      let isWhite = whiteFirst;
      for (let x = rowOffset; x < width; x++) {
        if (row.get(x) !== isWhite) {
          counters[counterPosition]++;
        } else {
          if (counterPosition === patternLength - 1) {
            if (
              OneDReader.patternMatchVariance(
                counters, pattern, AbstractUPCEANReader.MAX_INDIVIDUAL_VARIANCE
              ) < AbstractUPCEANReader.MAX_AVG_VARIANCE
            ) {
              return Int32Array.from([patternStart, x]);
            }
            patternStart += counters[0] + counters[1];
            // Correct shift: drop the first two runs, keep the rest
            counters.copyWithin(0, 2, 2 + counterPosition - 1);
            counters[counterPosition - 1] = 0;
            counters[counterPosition] = 0;
            counterPosition--;
          } else {
            counterPosition++;
          }
          counters[counterPosition] = 1;
          isWhite = !isWhite;
        }
      }
      throw new Z.NotFoundException();
    };

    applied = true;
    return true;
  } catch (err) {
    console.warn('ZXing fix not applied:', err);
    return false;
  }
}

applyZxingFix();
