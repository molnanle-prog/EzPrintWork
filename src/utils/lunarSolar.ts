/**
 * 음력↔양력. 1900-01-31(음력 1900-01-01) 기준 월력 표.
 * 외부 조회 없이 달력 칸 날짜만 계산한다.
 */
const LUNAR_INFO = [
    0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
    0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
    0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
    0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
    0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
    0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0,
    0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
    0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
    0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
    0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
    0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
    0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
    0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
    0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
    0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
    0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,
    0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,
    0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,
    0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160,
    0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252,
    0x0d520,
];

const BASE_YEAR = 1900;
const LAST_YEAR = 1900 + LUNAR_INFO.length - 1;

export interface LunarDate {
    year: number;
    month: number;
    day: number;
    isLeap: boolean;
}

function info(year: number): number {
    return LUNAR_INFO[year - BASE_YEAR] || 0;
}

export function lunarLeapMonth(year: number): number {
    if (year < BASE_YEAR || year > LAST_YEAR) return 0;
    return info(year) & 0xf;
}

export function lunarLeapDays(year: number): number {
    if (!lunarLeapMonth(year)) return 0;
    return info(year) & 0x10000 ? 30 : 29;
}

export function lunarMonthDays(year: number, month: number): number {
    if (year < BASE_YEAR || year > LAST_YEAR || month < 1 || month > 12) return 0;
    return info(year) & (0x10000 >> month) ? 30 : 29;
}

export function lunarYearDays(year: number): number {
    if (year < BASE_YEAR || year > LAST_YEAR) return 0;
    let sum = 348;
    for (let mask = 0x8000; mask > 0x8; mask >>= 1) {
        if (info(year) & mask) sum += 1;
    }
    return sum + lunarLeapDays(year);
}

function dateKeyFromDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function parseDateKey(dateKey: string): Date {
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
}

function addDays(base: Date, days: number): Date {
    return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
}

function dayDiff(later: Date, earlier: Date): number {
    const a = Date.UTC(later.getFullYear(), later.getMonth(), later.getDate());
    const b = Date.UTC(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
    return Math.round((a - b) / 86400000);
}

/** 음력 날짜를 양력 YYYY-MM-DD 로. 윤달이 아닌 해에 윤달을 요구하면 null */
export function lunarToSolarKey(lunar: LunarDate): string | null {
    const { year, month, day, isLeap } = lunar;
    if (year < BASE_YEAR || year > LAST_YEAR || month < 1 || month > 12 || day < 1) return null;
    const leap = lunarLeapMonth(year);
    if (isLeap && leap !== month) return null;
    const monthLen = isLeap ? lunarLeapDays(year) : lunarMonthDays(year, month);
    if (day > monthLen) return null;

    let offset = 0;
    for (let y = BASE_YEAR; y < year; y++) offset += lunarYearDays(y);
    for (let m = 1; m < month; m++) {
        offset += lunarMonthDays(year, m);
        if (m === leap) offset += lunarLeapDays(year);
    }
    if (isLeap) offset += lunarMonthDays(year, month);
    offset += day - 1;
    return dateKeyFromDate(addDays(new Date(1900, 0, 31), offset));
}

export function solarKeyToLunar(dateKey: string): LunarDate | null {
    const solar = parseDateKey(dateKey);
    if (Number.isNaN(solar.getTime())) return null;
    let offset = dayDiff(solar, new Date(1900, 0, 31));
    if (offset < 0) return null;
    let year = BASE_YEAR;
    while (year <= LAST_YEAR) {
        const yearDays = lunarYearDays(year);
        if (offset < yearDays) break;
        offset -= yearDays;
        year += 1;
    }
    if (year > LAST_YEAR) return null;
    const leap = lunarLeapMonth(year);
    let month = 1;
    let isLeap = false;
    while (month <= 12) {
        const len = lunarMonthDays(year, month);
        if (offset < len) break;
        offset -= len;
        if (leap === month) {
            const leapLen = lunarLeapDays(year);
            if (offset < leapLen) {
                isLeap = true;
                break;
            }
            offset -= leapLen;
        }
        month += 1;
    }
    if (month > 12) return null;
    return { year, month, day: offset + 1, isLeap };
}
