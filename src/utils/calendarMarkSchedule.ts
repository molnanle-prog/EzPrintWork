import { CalendarMark } from '../types';
import { lunarToSolarKey } from './lunarSolar';

function parseKey(dateKey: string): { year: number; month: number; day: number; weekday: number } | null {
    const [y, m, d] = dateKey.split('-').map(Number);
    if (!y || !m || !d) return null;
    const date = new Date(y, m - 1, d);
    if (Number.isNaN(date.getTime())) return null;
    return { year: y, month: m, day: d, weekday: date.getDay() };
}

function daysInMonth(year: number, month: number): number {
    return new Date(year, month, 0).getDate();
}

function solarYearlyHit(mark: CalendarMark, parts: { month: number; day: number; year: number }): boolean {
    const anchor = parseKey(mark.date);
    if (!anchor) return false;
    const day = Math.min(anchor.day, daysInMonth(parts.year, anchor.month));
    return parts.month === anchor.month && parts.day === day;
}

function lunarHit(mark: CalendarMark, dateKey: string): boolean {
    const month = mark.lunarMonth;
    const day = mark.lunarDay;
    if (!month || !day) return false;
    const parts = parseKey(dateKey);
    if (!parts) return false;
    const years = mark.repeat === 'once' ? [parts.year - 1, parts.year] : [parts.year - 1, parts.year];
    return years.some((year) => {
        const solar = lunarToSolarKey({
            year,
            month,
            day,
            isLeap: !!mark.lunarLeap,
        });
        return solar === dateKey;
    });
}

export function calendarMarkOccursOn(mark: CalendarMark, dateKey: string): boolean {
    const parts = parseKey(dateKey);
    const anchor = parseKey(mark.date);
    if (!parts || !anchor || !mark.text?.trim()) return false;
    const useLunar = mark.calendar === 'lunar' && (mark.repeat === 'once' || mark.repeat === 'yearly');

    if (mark.repeat === 'once') {
        if (useLunar) return lunarHit(mark, dateKey);
        return mark.date === dateKey;
    }
    if (mark.repeat === 'weekly') {
        return parts.weekday === anchor.weekday;
    }
    if (mark.repeat === 'monthly') {
        const day = Math.min(anchor.day, daysInMonth(parts.year, parts.month));
        return parts.day === day;
    }
    if (useLunar) return lunarHit(mark, dateKey);
    return solarYearlyHit(mark, parts);
}
