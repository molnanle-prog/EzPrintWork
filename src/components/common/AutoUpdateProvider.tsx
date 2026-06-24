import React from 'react';
import { useAutoUpdate } from '../../hooks/useAutoUpdate';
import { useElectronUpdater } from '../../hooks/useElectronUpdater';
import { UpdateNoticeProvider } from '../../contexts/UpdateNoticeContext';
import { PersistentUpdateNotice } from './PersistentUpdateNotice';

/** 웹 version.json + GitHub Release 데스크톱 업데이트 — 업데이트 완료까지 고정 알림 */
export const AutoUpdateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <UpdateNoticeProvider>
            <AutoUpdateInner>{children}</AutoUpdateInner>
        </UpdateNoticeProvider>
    );
};

const AutoUpdateInner: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    useAutoUpdate();
    useElectronUpdater();
    return (
        <>
            {children}
            <PersistentUpdateNotice />
        </>
    );
};
