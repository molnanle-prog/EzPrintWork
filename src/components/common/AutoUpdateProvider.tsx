import React from 'react';
import { useAutoUpdate } from '../../hooks/useAutoUpdate';
import { useElectronUpdater } from '../../hooks/useElectronUpdater';

/** 웹 version.json + GitHub Release 데스크톱 업데이트 */
export const AutoUpdateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    useAutoUpdate();
    useElectronUpdater();
    return <>{children}</>;
};