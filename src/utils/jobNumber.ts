/** 작업 상세·견적서·미수금 등에서 공통으로 쓰는 작업번호 표기 */
export const formatJobNumber = (job: { id: string; createdAt: string }) => {
  if (!job) return '';
  let d = new Date(job.createdAt);
  if (isNaN(d.getTime())) {
    const numId = parseInt(job.id);
    d = isNaN(numId) ? new Date() : new Date(numId);
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');

  let suffix = '001';
  if (job.id) {
    const digits = job.id.replace(/[^0-9]/g, '');
    if (digits.length >= 3) {
      suffix = digits.slice(-3);
    } else {
      let hash = 0;
      for (let i = 0; i < job.id.length; i++) {
        hash = job.id.charCodeAt(i) + ((hash << 5) - hash);
      }
      suffix = String(Math.abs(hash) % 1000).padStart(3, '0');
    }
  }
  return `${yyyy}${mm}${dd}${hh}${min}-${suffix}`;
};
