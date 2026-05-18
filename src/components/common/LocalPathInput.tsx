import React, { useState } from 'react';
import { FolderOpen, Search, Copy, Check } from 'lucide-react';
import { useDialog } from '../../contexts/DialogContext';

interface LocalPathInputProps {
  value: string;
  onChange: (path: string) => void;
  placeholder?: string;
  label?: string;
}

export const LocalPathInput: React.FC<LocalPathInputProps> = ({ 
  value, 
  onChange, 
  placeholder = "\\\\NAS\\Data\\...",
  label = "대상 파일 경로"
}) => {
  const [pathCopied, setPathCopied] = useState(false);
  const { showAlert } = useDialog();

  const tryLocalHelper = async (action: 'select' | 'open', path?: string): Promise<{ success: boolean; data?: any }> => {
    try {
      const url = action === 'select' 
        ? 'http://127.0.0.1:23230/select'
        : `http://127.0.0.1:23230/open?path=${encodeURIComponent(path || '')}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2초 타임아웃
      
      const response = await fetch(url, { 
        method: 'GET', 
        signal: controller.signal 
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        return { success: true, data };
      }
      return { success: false };
    } catch (error) {
      return { success: false };
    }
  };

  const handleOpenPath = async () => {
    if (!value) {
      showAlert("열 수 있는 경로가 없습니다.");
      return;
    }

    const isElectron = typeof window !== 'undefined' && !!window.electron;
    
    // 1. 태블릿 및 모바일 기기 (아이패드, 갤럭시탭 등) 대응
    const isMobileOrTablet = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobileOrTablet) {
        // Windows 경로(\\NAS\Data\...)를 태블릿용 SMB 경로(smb://NAS/Data/...)로 변환
        let smbPath = value.replace(/\\/g, '/'); // 모든 역슬래시(\)를 슬래시(/)로 변경
        if (smbPath.startsWith('//')) {
            smbPath = 'smb:' + smbPath; // smb://NAS/... 형태로 완성
        } else if (/^[A-Za-z]:/.test(smbPath)) {
            // 로컬 드라이브(C:/, D:/ 등)인 경우 알림
            showAlert("태블릿에서는 PC 로컬 드라이브(C:, D:)에 직접 접근할 수 없습니다. NAS 네트워크 경로(\\NAS\...)를 사용해 주세요.");
            return;
        } else {
            smbPath = 'smb://' + smbPath;
        }

        // 태블릿의 기본 '파일' 앱 또는 NAS 뷰어 앱 실행
        window.location.href = smbPath;
        return;
    }

    // 2. PC 데스크톱 앱 환경
    if (isElectron && typeof window.electron.openPath === 'function') {
        // 데스크톱 앱: 즉시 탐색기 실행
        window.electron.openPath(value);
    } 
    // 3. PC 웹 브라우저 환경 (크롬/엣지)
    else {
        // 1차로 로컬 백그라운드 헬퍼(Electron) 연동 시도
        const helperResult = await tryLocalHelper('open', value);
        if (helperResult.success) {
            return;
        }

        // 2차: 등록된 프로토콜(ezpw://) 호출 (설치되어 있으면 자동으로 앱을 부팅하고 폴더를 열어줌)
        window.location.href = `ezpw://open?path=${encodeURIComponent(value)}`;
        
        setTimeout(() => {
            if (confirm("⚠️ 폴더가 열리지 않나요?\n\n이 기능은 'EzPrintWork 데스크톱 전용 앱'이 설치되어 있어야 작동합니다. 지금 데스크톱 전용 앱을 설치하시겠습니까?")) {
                window.open('/ezpw/downloads/EzPrintWork_Setup.exe', '_blank');
            }
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
        // 웹 브라우저: 로컬 백그라운드 헬퍼(Electron)에 연동 시도
        const helperResult = await tryLocalHelper('select');
        if (helperResult.success && helperResult.data?.path) {
            onChange(helperResult.data.path);
            return;
        }

        // 데스크톱 앱이 실행 중이 아니거나 미설치 상태일 때 명확한 기능 구분 설명 및 다운로드 안내
        if (confirm("⚠️ '파일 탐색기(돋보기) 연동' 기능은 데스크톱 전용 앱에서만 사용 가능합니다.\n\n데스크톱 전용 앱을 설치하시면 바탕화면에 아이콘이 생성되며, 모든 로컬 탐색기 연동 기능을 제약 없이 즉시 사용하실 수 있습니다.\n\n지금 데스크톱 전용 앱을 다운로드하여 설치하시겠습니까?")) {
            // 실제 다운로드 링크 (홈페이지 루트의 downloads 폴더 또는 배포 경로로 연결)
            window.open('/ezpw/downloads/EzPrintWork_Setup.exe', '_blank');
        }
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
          onClick={handleSelectPath} 
          className="p-1.5 rounded border bg-slate-100 border-slate-200 text-slate-600 hover:bg-blue-50 hover:text-blue-600" 
          title="찾기 (탐색기 열기)"
        >
          <Search size={14} />
        </button>
        <button 
          onClick={handleOpenPath} 
          className="p-1.5 rounded border bg-blue-600 border-blue-600 text-white hover:bg-blue-700 transition-colors" 
          title="열기 (폴더로 이동)"
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
