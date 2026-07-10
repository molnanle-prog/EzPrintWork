import { useEffect, useState } from 'react';
import { fetchInstalledAppVersion, getCachedInstalledAppVersion } from '../utils/appVersion';

/** UI 표시용 — Electron이면 설치본 버전, 브라우저면 웹 번들 버전 */
export function useInstalledAppVersion(): string {
    const [version, setVersion] = useState(() => getCachedInstalledAppVersion());

    useEffect(() => {
        void fetchInstalledAppVersion().then(setVersion);
    }, []);

    return version;
}
