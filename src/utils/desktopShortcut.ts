const APP_URL = 'https://ez-hub.kr/ezpw/';
const ICON_URL = 'https://ez-hub.kr/ezpw/icon.ico';

const WINDOWS_BAT_SCRIPT = `@echo off
chcp 65001 >nul
title EzPrintWork 바탕화면 바로가기
powershell -NoProfile -ExecutionPolicy Bypass -Command "& {$ErrorActionPreference='Stop'; $desktop=[Environment]::GetFolderPath('Desktop'); $iconPath=Join-Path $desktop 'EzPrintWork.ico'; $lnkPath=Join-Path $desktop 'EzPrintWork.lnk'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '${ICON_URL}' -OutFile $iconPath -UseBasicParsing; $shell=New-Object -ComObject WScript.Shell; $shortcut=$shell.CreateShortcut($lnkPath); $shortcut.TargetPath=Join-Path $env:windir 'system32\\rundll32.exe'; $shortcut.Arguments='url.dll,FileProtocolHandler ${APP_URL}'; $shortcut.IconLocation=($iconPath + ',0'); $shortcut.Description='EzPrintWork - 인쇄소 업무 관리'; $shortcut.Save(); $shell.Popup('바탕화면에 EzPrintWork 바로가기가 생성되었습니다.', 5, 'EzPrintWork', 64)}"
if errorlevel 1 (
  echo 바로가기 생성에 실패했습니다. 인터넷 연결을 확인한 뒤 다시 실행해 주세요.
  pause
)
`;

function downloadTextFile(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
}

export async function createDesktopShortcut(): Promise<{ ok: boolean; message: string }> {
    if (typeof window !== 'undefined' && window.electron?.createDesktopShortcut) {
        const result = await window.electron.createDesktopShortcut();
        if (result.ok) {
            return { ok: true, message: '바탕화면에 EzPrintWork 바로가기가 생성되었습니다.' };
        }
        return { ok: false, message: result.error || '바로가기 생성에 실패했습니다.' };
    }

    downloadTextFile(WINDOWS_BAT_SCRIPT, 'EzPrintWork-바탕화면-만들기.bat', 'application/octet-stream');
    return {
        ok: true,
        message:
            '설치 파일이 다운로드되었습니다. 다운로드 폴더에서 "EzPrintWork-바탕화면-만들기.bat"을 더블클릭하면 바탕화면에 아이콘이 생성됩니다.',
    };
}
