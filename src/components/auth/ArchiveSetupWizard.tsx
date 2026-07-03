import React, { useState } from 'react';
import { HardDrive, X, ArrowRight, CheckCircle2 } from 'lucide-react';
import { ArchiveStorageSettings } from '../settings/ArchiveStorageSettings';
import { markArchiveSetupDone, setArchiveRootPath } from '../../utils/archiveStorage';

interface ArchiveSetupWizardProps {
    onComplete: () => void;
}

export const ArchiveSetupWizard: React.FC<ArchiveSetupWizardProps> = ({ onComplete }) => {
    const [step, setStep] = useState<1 | 2>(1);

    const handleSkipDefault = () => {
        setArchiveRootPath(null, true);
        markArchiveSetupDone();
        onComplete();
    };

    return (
        <div className="fixed inset-0 z-[200] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden">
                <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
                    <div>
                        <div className="inline-flex p-2 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 mb-3">
                            <HardDrive className="w-6 h-6" />
                        </div>
                        <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">
                            이력 보관 폴더 설정
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            업무 데이터는 Firestore(클라우드)에서 관리자·직원 모두 동일하게 봅니다. 이 설정은 1년 초과 이력의 <strong>회사 백업 사본</strong> 경로입니다.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleSkipDefault}
                        className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        title="지금은 설정을 건너뛰고 내 문서 기본 아카이브 경로를 사용합니다."
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {step === 1 && (
                        <div className="space-y-4">
                            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                                <p className="font-bold mb-2">데이터는 어디에 있나요?</p>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li><strong>Firestore(클라우드)</strong> — 직원·관리자·PC·태블릿 모두 <strong>같은 데이터</strong> (기본 정보 + 최근 1년 작업).</li>
                                    <li><strong>PC/NAS 폴더</strong> — 1년이 지난 이력의 <strong>회사 소유 백업 사본</strong> (비용 절감용, 조회 원본 아님).</li>
                                    <li>과거 작업 검색도 클라우드 공통 복사본으로 제공 — <strong>누가 로그인해도 동일</strong>하게 보입니다.</li>
                                    <li>예전처럼 NAS마다 다른 화면이 나오지 <strong>않습니다</strong>.</li>
                                </ul>
                            </div>
                            <button
                                type="button"
                                onClick={() => setStep(2)}
                                title="아카이브 보관 사본을 저장할 PC/NAS 폴더를 선택합니다."
                                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2"
                            >
                                폴더 선택하기
                                <ArrowRight className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={handleSkipDefault}
                                title="별도 선택 없이 기본 경로로 시작하고, 설정에서 언제든 변경할 수 있습니다."
                                className="w-full text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 py-2"
                            >
                                나중에 · 내 문서 기본 폴더 사용
                            </button>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-4">
                            <ArchiveStorageSettings
                                compact
                                onConfigured={() => {
                                    markArchiveSetupDone();
                                    onComplete();
                                }}
                            />
                            <button
                                type="button"
                                onClick={handleSkipDefault}
                                title="내 문서 기본 경로를 즉시 적용하고 마법사를 종료합니다."
                                className="w-full text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 py-2 flex items-center justify-center gap-1"
                            >
                                <CheckCircle2 className="w-4 h-4" />
                                내 문서 기본값으로 건너뛰기
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
