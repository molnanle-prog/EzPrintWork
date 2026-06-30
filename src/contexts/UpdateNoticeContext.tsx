import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type WebUpdateNotice = {
  kind: 'web';
  version: string;
  buildId: string;
};

export type DesktopUpdateNotice = {
  kind: 'desktop';
  phase: 'available' | 'downloading' | 'downloaded' | 'installing' | 'error';
  version?: string;
  percent?: number;
  message?: string;
};

export type UpdateNotice = WebUpdateNotice | DesktopUpdateNotice;

type UpdateNoticeContextValue = {
  notice: UpdateNotice | null;
  setWebNotice: (notice: WebUpdateNotice | null) => void;
  setDesktopNotice: (notice: DesktopUpdateNotice | null) => void;
  clearWebNotice: () => void;
  clearDesktopNotice: () => void;
};

const UpdateNoticeContext = createContext<UpdateNoticeContextValue | null>(null);

export const UpdateNoticeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [webNotice, setWebNoticeState] = useState<WebUpdateNotice | null>(null);
  const [desktopNotice, setDesktopNoticeState] = useState<DesktopUpdateNotice | null>(null);

  const setWebNotice = useCallback((notice: WebUpdateNotice | null) => {
    setWebNoticeState(notice);
  }, []);

  const setDesktopNotice = useCallback((notice: DesktopUpdateNotice | null) => {
    setDesktopNoticeState(notice);
  }, []);

  const clearWebNotice = useCallback(() => setWebNoticeState(null), []);
  const clearDesktopNotice = useCallback(() => setDesktopNoticeState(null), []);

  const notice = desktopNotice ?? webNotice;

  const value = useMemo(
    () => ({
      notice,
      setWebNotice,
      setDesktopNotice,
      clearWebNotice,
      clearDesktopNotice,
    }),
    [notice, setWebNotice, setDesktopNotice, clearWebNotice, clearDesktopNotice]
  );

  return <UpdateNoticeContext.Provider value={value}>{children}</UpdateNoticeContext.Provider>;
};

export function useUpdateNotice() {
  const ctx = useContext(UpdateNoticeContext);
  if (!ctx) {
    throw new Error('useUpdateNotice must be used within UpdateNoticeProvider');
  }
  return ctx;
}
