import React from 'react';
import { Archive, ShieldCheck } from 'lucide-react';
import { ArchiveStorageSettings } from './ArchiveStorageSettings';

export const ArchiveManager: React.FC = () => {
    return (
        <div className="space-y-6 max-w-4xl">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-sm">
                <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-2">
                    <Archive className="w-6 h-6 text-indigo-600" />
                    이력 아카이브 (자동 운영)
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                    기본 정보와 최근 1년 작업은 Firestore에서 전 직원이 동일하게 사용합니다.
                    1년이 지난 완료/취소 이력은 자동 아카이브되어 비용 증가를 억제합니다.
                </p>

                <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-950/20 p-4 mb-6 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                    <p className="font-bold mb-2 flex items-center gap-1 text-indigo-800 dark:text-indigo-300">
                        <ShieldCheck className="w-4 h-4" />
                        운영 원칙
                    </p>
                    <ul className="list-disc pl-5 space-y-1">
                        <li>업무 원본: Firestore(공통) + 아카이브 미러(Storage)</li>
                        <li>PC/NAS 폴더: 회사 보관 사본(백업 성격)</li>
                        <li>직원/관리자/기기와 무관하게 같은 작업 데이터를 조회</li>
                    </ul>
                </div>

                <ArchiveStorageSettings />
            </div>
        </div>
    );
};
