import React, { useState, useEffect } from 'react';
import { db, getErrorMessage } from '../../services/dataService';
import { JobStatusDefinition, KanbanBottomStyle, KanbanLayoutConfig, KanbanSplitPair } from '../../types';
import { ListChecks, Save, Plus, ArrowUpDown, Link2 } from 'lucide-react';
import { useDialog } from '../../contexts/DialogContext';
import {
  clampSplitTopPercent,
  normalizeKanbanLayoutConfig,
  normalizeStatusDefinition,
  swapSplitPair,
  upsertSplitPair,
} from '../../utils/kanbanLayout';
import { StatusKanbanPreview } from './StatusKanbanPreview';

export const StatusManager: React.FC = () => {
  const [statuses, setStatuses] = useState<JobStatusDefinition[]>([]);
  const [kanbanLayout, setKanbanLayout] = useState<KanbanLayoutConfig>(() => normalizeKanbanLayoutConfig());
  const [newStatusName, setNewStatusName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [draftTop, setDraftTop] = useState<string | null>(null);
  const [draftBottom, setDraftBottom] = useState<string | null>(null);
  const { showConfirm, showAlert } = useDialog();

  useEffect(() => {
    loadStatuses();
    const unsubscribe = db.subscribe(loadStatuses);
    return () => unsubscribe();
  }, []);

  const loadStatuses = () => {
    setStatuses(db.getStatusDefinitions().map((s) => normalizeStatusDefinition(s)));
    setKanbanLayout(normalizeKanbanLayoutConfig(db.getKanbanLayoutConfig()));
  };

  const persistLayout = async (layout: KanbanLayoutConfig) => {
    const next = normalizeKanbanLayoutConfig(layout);
    setKanbanLayout(next);
    try {
      await db.saveKanbanLayoutConfig(next);
    } catch (error) {
      await showAlert('칸 연결 저장 실패: ' + getErrorMessage(error));
    }
  };

  const handleLabelChange = (key: string, newLabel: string) => {
    setStatuses((prev) => prev.map((s) => (s.key === key ? { ...s, label: newLabel } : s)));
  };

  const handleToggleVisibility = (key: string) => {
    const visibleCount = statuses.filter((s) => s.isVisible !== false).length;
    const current = statuses.find((s) => s.key === key);

    if (current?.isVisible !== false && visibleCount <= 2) {
      showAlert('최소 2개의 단계가 칸반 보드에 표시되어야 합니다.');
      return;
    }

    setStatuses((prev) => prev.map((s) => (s.key === key ? { ...s, isVisible: !s.isVisible } : s)));
  };

  const commitSelection = (nextKeys: string[], top: string | null, bottom: string | null) => {
    const nextTop = top && nextKeys.includes(top) ? top : null;
    const nextBottom = bottom && nextKeys.includes(bottom) && bottom !== nextTop ? bottom : null;
    const unused = nextKeys.filter((k) => k !== nextTop && k !== nextBottom);
    const filledTop = nextTop || unused[0] || null;
    const filledBottom = nextBottom || unused.find((k) => k !== filledTop) || null;
    setSelectedKeys(nextKeys);
    setDraftTop(filledTop);
    setDraftBottom(filledBottom);
  };

  const toggleSelectKey = (key: string) => {
    if (selectedKeys.includes(key)) {
      commitSelection(
        selectedKeys.filter((k) => k !== key),
        draftTop,
        draftBottom
      );
      return;
    }
    if (selectedKeys.length >= 2) {
      void showAlert('한 번에 단계 2개만 고르세요. 이웃이 아니어도 한 칸으로 연결할 수 있습니다.');
      return;
    }
    commitSelection([...selectedKeys, key], draftTop, draftBottom);
  };

  const swapDraftSlots = () => {
    if (!draftTop || !draftBottom) return;
    commitSelection(selectedKeys, draftBottom, draftTop);
  };

  const handleApplySplitPair = async () => {
    if (!draftTop || !draftBottom || draftTop === draftBottom) {
      await showAlert('목록에서 단계 2개를 고른 뒤, 위·아래만 정하면 됩니다.');
      return;
    }

    const nextLayout = upsertSplitPair(kanbanLayout, draftTop, draftBottom, 'line');
    setSelectedKeys([]);
    setDraftTop(null);
    setDraftBottom(null);
    await persistLayout(nextLayout);
  };

  const handleSwapSavedPair = async (pair: KanbanSplitPair) => {
    await persistLayout(swapSplitPair(kanbanLayout, pair));
  };

  const handleRemovePair = async (pair: KanbanSplitPair) => {
    await persistLayout({
      splitPairs: kanbanLayout.splitPairs.filter(
        (p) => !(p.topKey === pair.topKey && p.bottomKey === pair.bottomKey)
      ),
    });
  };

  const handleSetBottomStyle = async (pair: KanbanSplitPair, bottomStyle: KanbanBottomStyle) => {
    await persistLayout({
      splitPairs: kanbanLayout.splitPairs.map((p) =>
        p.topKey === pair.topKey && p.bottomKey === pair.bottomKey
          ? { ...p, bottomStyle }
          : p
      ),
    });
  };

  const handlePairSplitPercent = (pair: KanbanSplitPair, percent: number) => {
    setKanbanLayout((prev) => ({
      splitPairs: prev.splitPairs.map((p) =>
        p.topKey === pair.topKey && p.bottomKey === pair.bottomKey
          ? { ...p, splitTopPercent: clampSplitTopPercent(percent) }
          : p
      ),
    }));
  };

  const handlePairSplitPercentCommit = async (pair: KanbanSplitPair, percent: number) => {
    const nextPercent = clampSplitTopPercent(percent);
    const current = kanbanLayout.splitPairs;
    await persistLayout({
      splitPairs: current.map((p) =>
        p.topKey === pair.topKey && p.bottomKey === pair.bottomKey
          ? { ...p, splitTopPercent: nextPercent }
          : p
      ),
    });
  };

  const handleReorderStatuses = async (next: JobStatusDefinition[]) => {
    setStatuses(next);
    try {
      await db.saveStatusDefinitions(next);
    } catch (error) {
      await showAlert('칸 순서 저장 실패: ' + getErrorMessage(error));
      loadStatuses();
    }
  };

  const handleAddStatus = async () => {
    if (!newStatusName.trim()) return;

    const visibleCount = statuses.filter((s) => s.isVisible !== false).length;
    if (visibleCount >= 7) {
      showAlert('칸반 보드는 가독성을 위해 최대 7개까지만 표시할 수 있습니다.\n기존 단계 중 하나를 숨긴 후 추가해 주세요.');
      return;
    }

    const key = newStatusName.trim().toUpperCase().replace(/\s+/g, '_');
    if (statuses.some((s) => s.key === key)) {
      showAlert('이미 존재하는 단계 이름입니다. 다른 이름을 사용해주세요.');
      return;
    }

    const newStatus: JobStatusDefinition = {
      key,
      label: newStatusName.trim(),
      isVisible: true,
    };
    const updated = [...statuses, newStatus];

    try {
      await db.saveStatusDefinitions(updated);
      setStatuses(updated);
      setNewStatusName('');
      await showAlert(`'${newStatus.label}' 단계가 추가되었습니다.`);
    } catch (error) {
      await showAlert('단계 추가 실패: ' + getErrorMessage(error));
    }
  };

  const handleDeleteStatus = async (key: string) => {
    if (statuses.length <= 2) {
      await showAlert('작업 단계는 최소 2개 이상이어야 합니다.');
      return;
    }

    const target = statuses.find((s) => s.key === key);
    if (!target) return;

    const idx = statuses.findIndex((s) => s.key === key);
    const fallback = statuses[idx > 0 ? idx - 1 : idx + 1];
    if (!fallback) {
      await showAlert('삭제할 수 없습니다. 단계가 부족합니다.');
      return;
    }

    const jobsInStatus = db.getAllJobs().filter((j) => j.status === key).length;
    const confirmed = await showConfirm(
      `[칸반 단계 삭제]\n\n` +
        `'${target.label}' 단계를 삭제하시겠습니까?\n\n` +
        (jobsInStatus > 0 ? `• 이 단계의 작업 ${jobsInStatus}건 → '${fallback.label}' 단계로 이동\n` : '') +
        `• 삭제 후 되돌릴 수 없습니다.\n\n` +
        `확인(삭제)을 누르면 즉시 저장됩니다.`
    );
    if (!confirmed) return;

    const updated = statuses.filter((s) => s.key !== key);
    const nextLayout = {
      splitPairs: kanbanLayout.splitPairs.filter((p) => p.topKey !== key && p.bottomKey !== key),
    };
    const removedKeys = [...new Set([...db.getStatusDefinitionRemovedKeys(), key])];

    try {
      if (jobsInStatus > 0) {
        await db.migrateJobsFromStatus(key, fallback.key);
      }
      await db.saveStatusDefinitionsAndKanbanLayout(updated, nextLayout, removedKeys);
      setStatuses(updated);
      setKanbanLayout(nextLayout);
      await showAlert(
        `'${target.label}' 단계가 삭제되었습니다.` +
          (jobsInStatus > 0 ? `\n작업 ${jobsInStatus}건을 '${fallback.label}' 단계로 옮겼습니다.` : '')
      );
    } catch (error) {
      await showAlert('단계 삭제 실패: ' + getErrorMessage(error));
    }
  };

  const handleSave = async () => {
    if (statuses.some((s) => !s.label.trim())) {
      await showAlert('단계 이름은 비워둘 수 없습니다.');
      return;
    }

    setIsSaving(true);
    try {
      const layout = normalizeKanbanLayoutConfig(kanbanLayout);
      await db.saveStatusDefinitionsAndKanbanLayout(statuses, layout, db.getStatusDefinitionRemovedKeys());
      setKanbanLayout(layout);
      await showAlert('작업 단계가 저장되었습니다. 칸 연결은 합치기·분리 시 바로 저장됩니다.');
    } catch (error) {
      await showAlert('저장 실패: ' + getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const labelFor = (key: string) => statuses.find((s) => s.key === key)?.label || key;

  const compactBtn =
    'px-1.5 py-0.5 rounded text-[10px] font-bold border inline-flex items-center gap-0.5 shrink-0';

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 w-full transition-colors">
      <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-2">
        <ListChecks className="text-blue-600 dark:text-blue-400" />
        작업 단계(칸반) 관리
      </h3>
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
        아래는 실제 칸반과 같은 가로·상하 미리보기입니다. 칸을 잡아 옆으로 옮기면 보드 순서가 바로 바뀝니다.
      </p>

      <StatusKanbanPreview
        statuses={statuses}
        kanbanLayout={kanbanLayout}
        selectedKeys={selectedKeys}
        onToggleSelect={toggleSelectKey}
        onLabelChange={handleLabelChange}
        onToggleVisibility={handleToggleVisibility}
        onDelete={(key) => void handleDeleteStatus(key)}
        onSwapPair={(pair) => void handleSwapSavedPair(pair)}
        onRemovePair={(pair) => void handleRemovePair(pair)}
        onSetBottomStyle={(pair, style) => void handleSetBottomStyle(pair, style)}
        onSplitPercentChange={handlePairSplitPercent}
        onSplitPercentCommit={(pair, percent) => void handlePairSplitPercentCommit(pair, percent)}
        onReorderStatuses={(next) => void handleReorderStatuses(next)}
      />

      <div className="flex gap-2 mb-4 p-4 bg-slate-100 dark:bg-slate-700/50 rounded-lg border border-dashed border-slate-300 dark:border-slate-600">
        <input
          placeholder="새 단계 이름 (예: 시안확인)"
          value={newStatusName}
          onChange={(e) => setNewStatusName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void handleAddStatus()}
          className="flex-1 p-2 border border-slate-300 dark:border-slate-600 rounded text-sm min-w-[120px] bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
        />
        <button
          type="button"
          onClick={() => void handleAddStatus()}
          className="bg-slate-700 dark:bg-slate-600 text-white p-2 rounded hover:bg-slate-800 flex items-center gap-1 px-4 text-sm font-bold"
        >
          <Plus size={16} /> 추가
        </button>
      </div>

      <div className="mb-8 min-h-[8.5rem]">
        {selectedKeys.length >= 2 && draftTop && draftBottom && (
          <div className="rounded-xl border-2 border-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/20 p-3">
            <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300 mb-1 inline-flex items-center gap-1">
              <Link2 size={15} /> 합치기 — {labelFor(draftTop)} 위 + {labelFor(draftBottom)} 아래
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-2 leading-relaxed">
              선택한 두 단계를 한 칸의 위·아래로 묶습니다. 저장 후 아래 칸에서 견적형·한줄형을 고를 수 있습니다.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" onClick={() => swapDraftSlots()} className={`${compactBtn} border-slate-300 dark:border-slate-600`}>
                <ArrowUpDown size={11} /> 위아래
              </button>
              <button
                type="button"
                onClick={() => void handleApplySplitPair()}
                className="px-3 py-1.5 rounded text-sm font-bold bg-indigo-600 text-white"
              >
                합치기
              </button>
            </div>
          </div>
        )}
        {selectedKeys.length === 1 && (
          <p className="text-sm text-indigo-700 dark:text-indigo-300 bg-indigo-100/80 dark:bg-indigo-900/30 rounded-lg px-3 py-2 leading-relaxed">
            합치기: 칸을 한 개 더 고르면 한 칸의 위·아래로 묶을 수 있습니다. 한 칸 건너뛴 단계끼리도 됩니다.
          </p>
        )}
      </div>

      <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-end">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving}
          className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-blue-700 flex items-center gap-2 shadow-md disabled:opacity-50"
        >
          <Save size={18} />
          {isSaving ? '저장 중...' : '변경사항 저장'}
        </button>
      </div>
    </div>
  );
};
