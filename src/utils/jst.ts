import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export const TZ = "Asia/Tokyo";

/** 入力を JST の dayjs オブジェクトに変換 (引数なしで現在時刻) */
export function jst(input?: dayjs.ConfigType) {
  return (input === undefined ? dayjs() : dayjs(input)).tz(TZ);
}

export { dayjs };
