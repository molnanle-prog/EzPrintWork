import React from 'react';
import { HardDrive } from 'lucide-react';
import { ArchiveStorageSettings } from '../settings/ArchiveStorageSettings';
import { markArchiveSetupDone } from '../../utils/archiveStorage';

interface ArchiveSetupWizardProps {
    onComplete: () => void;
}

/** 관리자 PC 앱 첫 실행. 닫기는 앱을 종료하고, 폴더 저장 전에는 완료로 보지 않는다. */
export const ArchiveSetupWizard: React.FC<ArchiveSetupWizardProps> = ({ onComplete }) => {
    const closeApp = () => {
        if (typeof window !== 'undefined' && window.electron?.close) {
            window.electron.close();
        }
    };

    return (
        <div className="fixed inset-0 z-[200] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto bg-slate-900 text-white rounded-3xl border border-slate-800 shadow-2xl">
                <div className="p-6 border-b border-slate-800">
                    <div className="inline-flex p-2 rounded-xl bg-blue-600/20 text-blue-400 mb-3">
                        <HardDrive className="w-6 h-6" />
                    </div>
                    <h2 className="text-xl font-black text-white">
                        저장 폴더를 먼저 지정해 주세요
                    </h2>
                    <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                        NAS 공유 폴더 또는 매장 PC 공유 폴더(\\컴퓨터이름\\공유이름) 중 하나를 고릅니다.
                        연결 테스트가 통과해야 이 화면을 지나갈 수 있습니다.
                    </p>
                </div>
                <div className="p-6">
                    <ArchiveStorageSettings
                        compact
                        firstRun
                        onConfigured={() => {
                            markArchiveSetupDone();
                            onComplete();
                        }}
                    />
                    <button
                        type="button"
                        onClick={closeApp}
                        className="mt-3 w-full rounded-xl border border-slate-700 py-3 text-sm font-bold text-slate-300 hover:bg-slate-800"
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
};
