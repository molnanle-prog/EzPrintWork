const DIGITS = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'] as const;
const UNITS = ['', '십', '백', '천'] as const;
const BIG_UNITS = ['', '만', '억', '조', '경'] as const;

/** 1~9999 구간을 한글 금액 표기로 변환 */
function convertUnder10000(n: number): string {
  if (n <= 0) return '';
  let result = '';
  const s = String(n).padStart(4, '0');
  for (let i = 0; i < 4; i++) {
    const digit = parseInt(s[i], 10);
    if (digit === 0) continue;
    const unitIdx = 3 - i;
    if (digit === 1 && unitIdx > 0) {
      result += UNITS[unitIdx];
    } else {
      result += DIGITS[digit] + UNITS[unitIdx];
    }
  }
  return result;
}

/** 숫자 금액을 견적서용 한글 금액으로 변환 (예: 1234567 → 일백이십삼만사천오백육십칠) */
export function numberToKoreanAmount(amount: number): string {
  const n = Math.floor(Math.abs(amount));
  if (n === 0) return '영';

  let result = '';
  let num = n;
  let bigIdx = 0;

  while (num > 0 && bigIdx < BIG_UNITS.length) {
    const chunk = num % 10000;
    if (chunk > 0) {
      result = convertUnder10000(chunk) + BIG_UNITS[bigIdx] + result;
    }
    num = Math.floor(num / 10000);
    bigIdx++;
  }

  return result;
}

/** 견적서 합계금액 한글 표기 (예: 일금 일백이십삼만사천오백육십칠 원) */
export function formatKoreanWonAmount(amount: number): string {
  return `일금 ${numberToKoreanAmount(amount)} 원`;
}
