import React from 'react';
import { HardDrive } from 'lucide-react';
import { ArchiveStorageSettings } from '../settings/ArchiveStorageSettings';

interface SetupBriefingProps {
    onDone: () => void;
}

/** 저장 폴더 지정 한 번. 연결 테스트가 통과해야 끝나고, 끝난 뒤에는 다시 나오지 않는다. */
export const SetupBriefing: React.FC<SetupBriefingProps> = ({ onDone }) => {
    const isElectron = typeof window !== 'undefined' && !!window.electron;
    const closeApp = () => {
        if (typeof window !== 'undefined' && window.electron?.close) {
            window.electron.close();
        }
    };

    return (
        <div className="w-full max-w-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-slate-900 p-8 rounded-3xl border border-slate-800 space-y-6">
                <div className="space-y-2 text-center pb-2 border-b border-slate-800">
                    <div className="inline-flex p-2 rounded-xl bg-blue-600/20 text-blue-400">
                        <HardDrive className="w-5 h-5" />
                    </div>
                    <h3 className="text-xl font-black">저장 폴더를 지금 지정합니다</h3>
                    <p className="text-xs text-slate-400 font-medium leading-relaxed">
                        NAS 공유 폴더 또는 매장 PC 공유 폴더(\\컴퓨터이름\\공유이름) 중 하나를 고릅니다.
                        연결 테스트가 통과하면 저장이 완료되고, 이 단계는 다시 나오지 않습니다.
                    </p>
                </div>
                <div className="rounded-2xl overflow-hidden">
                    <ArchiveStorageSettings
                        compact
                        firstRun
                        previewMode={!isElectron}
                        onConfigured={onDone}
                    />
                    {isElectron && (
                        <button
                            type="button"
                            onClick={closeApp}
                            className="mt-3 w-full rounded-xl border border-slate-700 py-3 text-sm font-bold text-slate-300 hover:bg-slate-800"
                        >
                            닫기
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
