import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppUser, JobStatusDefinition, Staff } from '../types';
import { uiPrefsService } from '../services/uiPrefsService';
import {
  getBoardPrefUserKey,
  getFilterableBoardStatuses,
  loadHiddenBoardStatusKeys,
  pruneHiddenBoardStatusKeys,
  saveHiddenBoardStatusKeys,
} from './boardStatusFilter';

export function useBoardStatusFilter(
  tenantId: string | null | undefined,
  user: AppUser | null | undefined,
  staff: Staff[],
  statusDefinitions: JobStatusDefinition[]
) {
  const userKey = useMemo(() => getBoardPrefUserKey(user, staff), [user, staff]);
  const [hiddenStatusKeys, setHiddenStatusKeys] = useState<string[]>(() =>
    loadHiddenBoardStatusKeys(tenantId, userKey)
  );
  const hydratedRef = useRef(false);
  const skipNextSaveRef = useRef(true);

  const boardStatusDefs = useMemo(
    () => getFilterableBoardStatuses(statusDefinitions),
    [statusDefinitions]
  );

  useEffect(() => {
    hydratedRef.current = false;
    skipNextSaveRef.current = true;
    setHiddenStatusKeys(loadHiddenBoardStatusKeys(tenantId, userKey));
  }, [tenantId, userKey]);

  useEffect(() => {
    if (!tenantId || !userKey) {
      hydratedRef.current = true;
      return;
    }

    let cancelled = false;
    void (async () => {
      const remote = await uiPrefsService.readHiddenBoardStatusKeys(tenantId, userKey);
      if (cancelled) return;
      if (remote) {
        skipNextSaveRef.current = true;
        setHiddenStatusKeys(remote);
        saveHiddenBoardStatusKeys(tenantId, userKey, remote);
      } else {
        const local = loadHiddenBoardStatusKeys(tenantId, userKey);
        void uiPrefsService.saveHiddenBoardStatusKeys(tenantId, userKey, local);
      }
      hydratedRef.current = true;
    })();

    return () => {
      cancelled = true;
    };
  }, [tenantId, userKey]);

  useEffect(() => {
    if (boardStatusDefs.length === 0) return;
    const next = pruneHiddenBoardStatusKeys(hiddenStatusKeys, statusDefinitions);
    if (next.length !== hiddenStatusKeys.length) {
      skipNextSaveRef.current = true;
      setHiddenStatusKeys(next);
    }
  }, [boardStatusDefs, hiddenStatusKeys, statusDefinitions]);

  useEffect(() => {
    if (!tenantId || !userKey) return;
    saveHiddenBoardStatusKeys(tenantId, userKey, hiddenStatusKeys);
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    if (!hydratedRef.current) return;
    const timer = window.setTimeout(() => {
      void uiPrefsService.saveHiddenBoardStatusKeys(tenantId, userKey, hiddenStatusKeys);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [tenantId, userKey, hiddenStatusKeys]);

  const toggleBoardStatus = useCallback((statusKey: string) => {
    setHiddenStatusKeys((prev) =>
      prev.includes(statusKey) ? prev.filter((key) => key !== statusKey) : [...prev, statusKey]
    );
  }, []);

  return { hiddenStatusKeys, boardStatusDefs, toggleBoardStatus };
}
