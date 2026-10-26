import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardList, History, ChevronDown } from 'lucide-react';
import { Job, Staff } from '../../types';
import { db, formatJobNumber } from '../../services/dataService';
import { JobOrderDocument } from './JobOrderDocument';
import { DocumentPreviewShell, printDocumentSimplex } from './DocumentPreviewShell';
import { exportA4DocumentPdf } from '../../utils/printA4';
import {
  cacheJobForPreview,
  formatJobOrderPrintDateTime,
  getJobOrderPrintCount,
  getJobOrderPrintLogs,
  resolveJobOrderPaymentSummary,
} from '../../utils/jobOrderPreviewStorage';
import { useAuth } from '../../contexts/AuthContext';
import {
  findStaffForUser,
  getStaffIdForUser,
  isPlaceholderStaffName,
  resolveHistoryActorName,
} from '../../utils/staffMatch';

interface JobOrderPreviewPanelProps {
  job: Job;
  onClose: () => void;
}

export const JobOrderPreviewPanel: React.FC<JobOrderPreviewPanelProps> = ({ job, onClose }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentJob, setCurrentJob] = useState<Job>(job);
  const [staffList, setStaffList] = useState<Staff[]>(() => db.getStaff());
  const [showHistoryPopover, setShowHistoryPopover] = useState(false);
  const { currentUser } = useAuth();

  useEffect(() => {
    setCurrentJob(job);
  }, [job]);

  useEffect(() => {
    setStaffList(db.getStaff());
    return db.subscribe(() => {
      setStaffList(db.getStaff());
    });
  }, []);

  const paymentSummary = useMemo(() => resolveJobOrderPaymentSummary(currentJob), [currentJob]);
  const printLogs = useMemo(() => getJobOrderPrintLogs(currentJob, staffList), [currentJob, staffList]);
  const printCount = useMemo(() => getJobOrderPrintCount(currentJob, staffList), [currentJob, staffList]);
  const latestLog = printLogs[0] ?? null;

  const handleDirectPrint = async () => {
    const printed = await printDocumentSimplex();
    if (!printed) return;

    const matchedStaff = findStaffForUser(staffList, currentUser);
    const staffId =
      getStaffIdForUser(staffList, currentUser) || currentUser?.uid || currentUser?.id || 'system';
    const staffName =
      (matchedStaff?.name && !isPlaceholderStaffName(matchedStaff.name)
        ? matchedStaff.name.trim()
        : '') ||
      (currentUser?.name && !isPlaceholderStaffName(currentUser.name)
        ? currentUser.name.trim()
        : '') ||
      matchedStaff?.loginId?.trim() ||
      resolveHistoryActorName(staffList, staffId, '직원');

    const updated = await db.recordJobOrderPrint(
      currentJob.id,
      { staffId, staffName },
      currentJob
    );
    if (updated) {
      setCurrentJob(updated);
      cacheJobForPreview(updated, paymentSummary);
    }
  };

  const handleOpenPDF = async () => {
    setIsProcessing(true);
    try {
      const fileName = `작업지시서_${formatJobNumber(currentJob).replace(/[^\w\-]/g, '_')}.pdf`;
      await exportA4DocumentPdf(fileName);
    } catch (err) {
      console.error('PDF 생성 중 오류:', err);
      alert('PDF 생성 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  const printHistoryHeader = (
    <div className="relative flex items-center">
      {printCount > 0 && latestLog ? (
        <button
          type="button"
          onClick={() => setShowHistoryPopover((v) => !v)}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-amber-500/20 border border-amber-400/50 text-amber-200 hover:bg-amber-500/30 transition-colors text-xs sm:text-sm font-semibold"
          title="클릭하여 최근 작업지시서 출력 이력 보기"
        >
          <History size={15} className="text-amber-300 shrink-0" />
          <span>
            최근 출력: <strong className="text-white font-bold">{latestLog.staffName}</strong> (
            {formatJobOrderPrintDateTime(latestLog.printedAt)} 출력)
          </span>
          <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-amber-400 text-slate-900 text-xs font-extrabold">
            {printCount}
          </span>
          {printLogs.length > 1 && <ChevronDown size={14} className="text-amber-300" />}
        </button>
      ) : (
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-slate-700/80 border border-slate-600 text-slate-300 text-xs sm:text-sm font-medium">
          <History size={15} className="text-slate-400 shrink-0" />
          <span>이전 출력 이력 없음 (미출력)</span>
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-slate-600 text-slate-200 text-xs font-bold">
            0
          </span>
        </div>
      )}

      {showHistoryPopover && printLogs.length > 0 && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-3 z-50 text-left">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700">
            <span className="text-xs font-bold text-slate-300">
              최근 작업지시서 출력 이력 (총 {printCount}회)
            </span>
            <button
              type="button"
              onClick={() => setShowHistoryPopover(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              닫기
            </button>
          </div>
          <ul className="space-y-1.5 max-h-52 overflow-y-auto custom-scrollbar">
            {printLogs.slice(0, 10).map((log, idx) => (
              <li
                key={`${log.printedAt}-${idx}`}
                className={`flex items-center justify-between text-xs px-2 py-1.5 rounded ${
                  idx === 0 ? 'bg-amber-500/20 text-amber-200 font-bold' : 'text-slate-300'
                }`}
              >
                <span className="truncate mr-2">
                  {printLogs.length - idx}회차 · {log.staffName}
                </span>
                <span className="text-[11px] text-slate-400 shrink-0">
                  {formatJobOrderPrintDateTime(log.printedAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  return (
    <DocumentPreviewShell
      title="작업 지시서 미리보기"
      titleIcon={<ClipboardList className="text-blue-400" />}
      toolbarExtra={printHistoryHeader}
      onClose={onClose}
      onPrint={handleDirectPrint}
      onPdf={handleOpenPDF}
      isProcessing={isProcessing}
      contentRef={contentRef}
    >
      <JobOrderDocument job={currentJob} paymentSummary={paymentSummary} />
    </DocumentPreviewShell>
  );
};
