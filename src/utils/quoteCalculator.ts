export const VAT_RATE = 0.1;

export type QuoteTotals = {
  supplyAmount: number;
  vatAmount: number;
  totalAmount: number;
};

/** 품목별 공급가 합계 + 부가세 포함 여부로 최종 금액 계산 */
export function calcQuoteTotals(supplySum: number, vatIncluded: boolean): QuoteTotals {
  const supply = Math.max(0, Math.round(supplySum));
  if (vatIncluded) {
    const vatAmount = Math.round(supply * VAT_RATE);
    return {
      supplyAmount: supply,
      vatAmount,
      totalAmount: supply + vatAmount,
    };
  }
  return {
    supplyAmount: supply,
    vatAmount: 0,
    totalAmount: supply,
  };
}
