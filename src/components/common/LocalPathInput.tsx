import React, { useState } from 'react';
import { FolderOpen, Search, Copy, Check } from 'lucide-react';
import { useDialog } from '../../contexts/DialogContext';
import { triggerDesktopSetupDownload } from '../../utils/desktopDownload';

interface LocalPathInputProps {
  value: string;
  onChange: (path: string) => void;
  placeholder?: string;
  label?: string;
}

const promptDesktopAppDownload = () => {
  if (!confirm("⚠️ 이 기능은 EzPrintWork 데스크톱 앱이 설치·실행 중이어야 사용할 수 있습니다.\n\nPC 전용 설치 프로그램(EzPrintWork-Setup.exe)을 다운로드하시겠습니까?")) {
    return;
  }
  triggerDesktopSetupDownload();
};

export const LocalPathInput: React.FC<LocalPathInputProps> = ({ 
  value, 
  onChange, 
  placeholder = "\\\\NAS\\Data\\...",
  label = "대상 파일 경로"
}) => {
  const [pathCopied, setPathCopied] = useState(false);
  const { showAlert } = useDialog();

  const handleOpenPath = async () => {
    const targetPath = (value || '').trim();
    if (!targetPath) {
      showAlert("열 수 있는 경로가 없습니다.");
      return;
    }

    const isElectron = typeof window !== 'undefined' && !!window.electron;
    
    const isMobileOrTablet = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobileOrTablet) {
        let smbPath = targetPath.replace(/\\/g, '/');
        if (smbPath.startsWith('//')) {
            smbPath = 'smb:' + smbPath;
        } else if (/^[A-Za-z]:/.test(smbPath)) {
            showAlert("태블릿에서는 PC 로컬 드라이브(C:, D:)에 직접 접근할 수 없습니다. NAS 네트워크 경로(\\NAS\\...)를 사용해 주세요.");
            return;
        } else {
            smbPath = 'smb://' + smbPath;
        }

        window.location.href = smbPath;
        return;
    }

    if (isElectron && typeof window.electron.openPath === 'function') {
        window.electron.openPath(targetPath);
    } else {
        window.location.href = `ezpw://open?path=${encodeURIComponent(targetPath)}`;
        setTimeout(() => {
            promptDesktopAppDownload();
        }, 2000);
    }
  };

  const handleSelectPath = async () => {
    const isElectron = typeof window !== 'undefined' && !!window.electron;
    if (isElectron && typeof window.electron.selectFileOrFolder === 'function') {
        const path = await window.electron.selectFileOrFolder();
        if (path) {
            onChange(path);
        }
    } else {
        promptDesktopAppDownload();
    }
  };

  const handleCopyPath = async () => {
    if (value) {
      navigator.clipboard.writeText(value);
      setPathCopied(true);
      setTimeout(() => setPathCopied(false), 2000);
    } else {
      await showAlert("대상 파일 경로가 입력되지 않았습니다.");
    }
  };

  return (
    <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm flex-none">
      {label && (
        <label className="text-[11px] font-bold text-slate-500 mb-0.5 block flex items-center gap-2">
          <FolderOpen size={12} /> {label}
        </label>
      )}
      <div className="flex gap-1">
        <input 
          type="text" 
          value={value || ''} 
          onChange={(e) => onChange(e.target.value)} 
          className="flex-1 p-1.5 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600 focus:ring-1 focus:ring-blue-500 truncate" 
          placeholder={placeholder} 
          title={value} 
        />
        <button 
          onClick={handleOpenPath} 
          className="p-1.5 rounded border bg-slate-100 border-slate-200 text-slate-600 hover:bg-blue-50 hover:text-blue-600" 
          title="연결된 경로 열기"
        >
          <Search size={14} />
        </button>
        <button 
          onClick={handleSelectPath} 
          className="p-1.5 rounded border bg-blue-600 border-blue-600 text-white hover:bg-blue-700 transition-colors" 
          title="경로 찾기 (탐색기에서 선택)"
        >
          <FolderOpen size={14} />
        </button>
        <button 
          onClick={handleCopyPath} 
          className={`p-1.5 rounded border transition-colors shrink-0 ${pathCopied ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300'}`}
          title="경로 복사"
        >
          {pathCopied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
};
