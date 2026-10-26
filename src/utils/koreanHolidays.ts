const CACHE_KEY = 'ezpw_kr_holidays_v1';
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

type HolidayCache = {
  fetchedAt: number;
  byDate: Record<string, string>;
};

let memory: HolidayCache | null = null;
let inflight: Promise<boolean> | null = null;

function readCache(): HolidayCache | null {
  if (memory && memory.byDate) return memory;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HolidayCache;
    if (!parsed || typeof parsed.fetchedAt !== 'number' || !parsed.byDate) return null;
    memory = parsed;
    return memory;
  } catch {
    return null;
  }
}

export function unfoldIcs(ics: string): string {
  return ics.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

const OBSERVANCES = new Set([
  '국군의날',
  '크리스마스 이브',
  '스승의날',
  '식목일',
  '어버이날',
  '제헌절',
]);

const DESIGNATED = new Set([
  '새해첫날',
  '신정',
  '섣달 그믐날',
  '설날',
  '설날 연휴',
  '삼일절',
  '어린이날',
  '부처님오신날',
  '석가탄신일',
  '현충일',
  '광복절',
  '개천절',
  '추석',
  '추석 연휴',
  '한글날',
  '크리스마스',
  '노동절',
]);

/** 구글 달력에 이름이 있어도, 법령으로 쉬는 날만 남긴다. */
export function isDesignatedHolidayName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || OBSERVANCES.has(trimmed)) return false;
  if (trimmed.startsWith('쉬는 날 ')) {
    const rest = trimmed.slice('쉬는 날 '.length).trim();
    return rest !== '제헌절' && rest !== '노동절';
  }
  if (trimmed.includes('대체공휴일') || trimmed.includes('선거')) return true;
  return DESIGNATED.has(trimmed);
}

function keepDesignatedNames(name: string): string {
  return name
    .split(' · ')
    .map((part) => part.trim())
    .filter(isDesignatedHolidayName)
    .join(' · ');
}

export function parseKoreanHolidayIcs(ics: string): Record<string, string> {
  const byDate: Record<string, string> = {};
  const unfolded = unfoldIcs(ics);
  for (const block of unfolded.split('BEGIN:VEVENT').slice(1)) {
    const start = block.match(/DTSTART(?:;VALUE=DATE)?:(\d{8})/);
    const summary = block.match(/^SUMMARY:(.*)$/m);
    if (!start || !summary) continue;
    const ymd = start[1];
    const key = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
    const name = keepDesignatedNames(summary[1].trim());
    if (!name) continue;
    byDate[key] = byDate[key] ? `${byDate[key]} · ${name}` : name;
  }
  return byDate;
}

export function getHolidayName(date: Date): string | null {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const cache = readCache();
  if (!cache) return null;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const key = `${date.getFullYear()}-${month}-${day}`;
  return keepDesignatedNames(cache.byDate[key] || '') || null;
}

export function ensureKoreanHolidays(): Promise<boolean> {
  const cache = readCache();
  const fresh = !!cache && Date.now() - cache.fetchedAt < REFRESH_MS && Object.keys(cache.byDate).length > 0;
  if (fresh) return Promise.resolve(false);
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const fetchIcs = window.electron?.fetchKoreanHolidays;
      if (!fetchIcs) return false;
      const result = await fetchIcs();
      if (!result?.ok || !result.ics) return false;
      const byDate = parseKoreanHolidayIcs(result.ics);
      if (Object.keys(byDate).length < 20) return false;
      memory = { fetchedAt: Date.now(), byDate };
      localStorage.setItem(CACHE_KEY, JSON.stringify(memory));
      return true;
    } catch {
      return false;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
