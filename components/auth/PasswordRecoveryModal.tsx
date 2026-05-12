
import React, { useState, useEffect } from 'react';
import { X, ShieldAlert, Folder, Copy, Check, Info, Monitor, Trash2 } from 'lucide-react';

interface PasswordRecoveryModalProps {
    onClose: () => void;
}

export const PasswordRecoveryModal: React.FC<PasswordRecoveryModalProps> = ({ onClose }) => {
    const [isElectron, setIsElectron] = useState(false);
    const [dataPath, setDataPath] = useState('');
    const [pathCopied, setPathCopied] = useState(false);

    useEffect(() => {
        if (window.electron) {
            setIsElectron(true);
            window.electron.getUserDataPath().then(path => {
                setDataPath(path);
            });
        }
    }, []);

    const handleCopyPath = () => {
        if (dataPath) {
            navigator.clipboard.writeText(dataPath);
            setPathCopied(true);
            setTimeout(() => setPathCopied(false), 2000);
        }
    };

    const fileName = "pm_auth_v1.json";

    return (
        <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <ShieldAlert size={20} className="text-orange-500" />
                        관리자 비밀번호 초기화 안내
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
                        <X size={20} className="text-slate-500" />
                    </button>
                </div>

                <div className="p-6 space-y-4 text-sm text-slate-700">
                    <div className="p-3 bg-orange-50 border border-orange-100 rounded-lg text-orange-800">
                        <p>보안을 위해 비밀번호는 암호화되어 저장되므로 찾아드릴 수 없습니다. 대신, 아래 안내에 따라 인증 파일을 삭제하여 비밀번호를 초기화할 수 있습니다.</p>
                    </div>

                    {isElectron ? (
                        // Electron (Desktop App) Instructions
                        <div className="space-y-4">
                            <h4 className="font-bold text-lg">초기화 절차 (데스크탑 앱)</h4>
                            <ol className="list-decimal list-inside space-y-2 bg-slate-50 p-4 rounded-lg border border-slate-200">
                                <li>프로그램을 완전히 종료합니다.</li>
                                <li>아래 '경로 복사' 버튼을 누른 후, 윈도우 탐색기 주소창에 붙여넣기하여 폴더를 엽니다.</li>
                                <li>해당 폴더에서 <strong className="text-red-600">{fileName}</strong> 파일을 찾아 삭제합니다.</li>
                                <li>프로그램을 다시 시작하면, 새 비밀번호를 설정할 수 있습니다.</li>
                            </ol>

                            <div>
                                <label className="text-xs font-bold text-slate-500">인증 파일 경로</label>
                                <div className="flex gap-2 mt-1">
                                    <div className="flex-1 p-2 bg-slate-100 border border-slate-200 rounded-md font-mono text-xs truncate">
                                        {dataPath ? dataPath : '경로를 불러오는 중...'}
                                    </div>
                                    <button 
                                        onClick={handleCopyPath}
                                        className={`w-24 px-3 py-2 text-xs font-bold rounded-md transition-colors flex items-center justify-center gap-1 shadow-sm ${pathCopied ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-white hover:bg-slate-800'}`}
                                    >
                                        {pathCopied ? <><Check size={14}/> 복사됨</> : <><Copy size={14}/> 경로 복사</>}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        // Web Browser Instructions
                        <div className="space-y-4">
                            <h4 className="font-bold text-lg">초기화 절차 (웹 브라우저)</h4>
                            <ol className="list-decimal list-inside space-y-2 bg-slate-50 p-4 rounded-lg border border-slate-200">
                                <li>현재 탭에서 키보드의 <strong className="text-blue-600">F12</strong> 키를 눌러 개발자 도구를 엽니다.</li>
                                <li>상단 탭에서 <strong className="text-blue-600">Application</strong> (또는 '애플리케이션')을 클릭합니다.</li>
                                <li>왼쪽 메뉴의 Storage &gt; <strong className="text-blue-600">Local Storage</strong> 아래의 주소를 클릭합니다.</li>
                                <li>오른쪽 목록에서 <strong className="text-red-600">pm_auth_v1</strong> 항목을 찾아 마우스 오른쪽 클릭 후 'Delete'를 선택하여 삭제합니다.</li>
                                <li>페이지를 새로고침하면 새 비밀번호를 설정할 수 있습니다.</li>
                            </ol>
                            <div className="flex items-center gap-2 text-xs text-slate-500 p-2 bg-slate-100 rounded-md">
                               <Monitor size={16} /> 웹 환경에서는 브라우저 저장소(Local Storage)에 데이터가 저장됩니다.
                            </div>
                        </div>
                    )}

                    <div className="pt-4 border-t border-slate-100 text-center">
                        <button onClick={onClose} className="bg-blue-600 text-white font-bold px-8 py-2.5 rounded-lg hover:bg-blue-700 transition-colors">
                            확인했습니다
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
