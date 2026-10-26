/** 겹치는 용지명을 품목 체크 목록용 이름으로 펼친다. */
const PAPER_NAME_EXPANSIONS: Record<string, readonly string[]> = {
    모조: ['모조지(미색)', '모조지(백색)'],
    모조지: ['모조지(미색)', '모조지(백색)'],
    '스노우지(일반)': ['스노우지'],
    줄레자: ['레자크지(줄)'],
    '레자크(줄)': ['레자크지(줄)'],
    체크레자: ['레자크지(체크)'],
    '레자크(체크)': ['레자크지(체크)'],
    특수레자: ['레자크지(특수)'],
    '레자크(특수)': ['레자크지(특수)'],
    '표지용 레자크지': ['레자크지(표지)'],
    레자크: ['레자크지(줄)', '레자크지(체크)'],
    레자크지: ['레자크지(줄)', '레자크지(체크)'],
};

export function normalizePaperTypeList(names: string[] | undefined): string[] {
    const out: string[] = [];
    for (const raw of names || []) {
        const trimmed = raw.trim();
        if (!trimmed) continue;
        const nextNames = PAPER_NAME_EXPANSIONS[trimmed] || [trimmed];
        for (const next of nextNames) {
            if (!out.includes(next)) out.push(next);
        }
    }
    return out;
}
