import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export const TZ = "Asia/Tokyo";

/** 入力 (Date | 数値 | 文字列 | undefined) を JST の dayjs オブジェクトに変換 */
export function jst(input) {
  return (input === undefined ? dayjs() : dayjs(input)).tz(TZ);
}

/** 現在の JST を "YYYY-MM-DD HH:mm" で返す */
export function formatJstNow() {
  return jst().format("YYYY-MM-DD HH:mm");
}

/** 任意の入力を JST で "YYYY-MM-DD HH:mm" 形式に整形 */
export function formatJst(input) {
  return jst(input).format("YYYY-MM-DD HH:mm");
}

export { dayjs };
