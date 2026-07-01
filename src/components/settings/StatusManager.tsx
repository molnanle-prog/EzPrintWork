
import React, { useState, useEffect } from 'react';
import { db, getErrorMessage } from '../../services/dataService';
import { JobStatusDefinition, KanbanLayoutConfig, KanbanSplitPair } from '../../types';
import { ListChecks, Save, Trash2, Plus, Eye, EyeOff, LayoutGrid, Rows3, Unlink } from 'lucide-react';
import { useDialog } from '../../contexts/DialogContext';
import {
  clampSplitTopPercent,
  findPairForKey,
  normalizeKanbanLayoutConfig,
  normalizeStatusDefinition,
  orderedPairKeysFromSelection,
  upsertSplitPair,
} from '../../utils/kanbanLayout';

export const StatusManager: React.FC = () => {
  const [statuses, setStatuses] = useState<JobStatusDefinition[]>([]);
  const [kanbanLayout, setKanbanLayout] = useState<KanbanLayoutConfig>(() => normalizeKanbanLayoutConfig());
  const [newStatusName, setNewStatusName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
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

  const handleLabelChange = (key: string, newLabel: string) => {
    setStatuses((prev) => prev.map((s) => (s.key === key ? { ...s, label: newLabel } : s)));
  };

  const handleToggleVisibility = (key: string) => {
    const visibleCount = statuses.filter((s) => s.isVisible !== false && s.key !== 'QUOTE').length;
    const current = statuses.find((s) => s.key === key);

    if (current?.isVisible !== false && visibleCount <= 2) {
      showAlert('최소 2개의 단계가 칸반 보드에 표시되어야 합니다.');
      return;
    }

    setStatuses((prev) => prev.map((s) => (s.key === key ? { ...s, isVisible: !s.isVisible } : s)));
  };

  const toggleSelectKey = (key: string) => {
    setSelectedKeys((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= 2) return [prev[1], key];
      return [...prev, key];
    });
  };

  const applySplitPairFromSelection = (
    keys: string[],
    baseLayout: KanbanLayoutConfig
  ): KanbanLayoutConfig | null => {
    const ordered = orderedPairKeysFromSelection(statuses, keys);
    if (!ordered) return null;
    return upsertSplitPair(baseLayout, ordered[0], ordered[1]);
  };

  const handleApplySplitPair = async () => {
    if (selectedKeys.length !== 2) {
      await showAlert('상·하로 배치할 단계 2개를 체크해 주세요.\n(목록 위쪽 단계가 상단, 아래쪽이 하단)');
      return;
    }

    const nextLayout = applySplitPairFromSelection(selectedKeys, kanbanLayout);
    if (!nextLayout) return;

    const [topKey, bottomKey] = orderedPairKeysFromSelection(statuses, selectedKeys)!;
    const topLabel = statuses.find((s) => s.key === topKey)?.label || topKey;
    const bottomLabel = statuses.find((s) => s.key === bottomKey)?.label || bottomKey;

    setKanbanLayout(nextLayout);
    setSelectedKeys([]);
    await showAlert(`'${topLabel}'(상단) + '${bottomLabel}'(하단)이 한 칸 안에서 상·하로 배치됩니다.\n저장 버튼을 눌러 적용해 주세요.`);
  };

  const handleRemovePair = (pair: KanbanSplitPair) => {
    setKanbanLayout({
      splitPairs: kanbanLayout.splitPairs.filter(
        (p) => !(p.topKey === pair.topKey && p.bottomKey === pair.bottomKey)
      ),
    });
  };

  const handleToggleBottomCompact = (pair: KanbanSplitPair) => {
    setKanbanLayout({
      splitPairs: kanbanLayout.splitPairs.map((p) =>
        p.topKey === pair.topKey && p.bottomKey === pair.bottomKey
          ? { ...p, bottomCompact: !p.bottomCompact }
          : p
      ),
    });
  };

  const handlePairSplitPercent = (pair: KanbanSplitPair, percent: number) => {
    setKanbanLayout({
      splitPairs: kanbanLayout.splitPairs.map((p) =>
        p.topKey === pair.topKey && p.bottomKey === pair.bottomKey
          ? { ...p, splitTopPercent: clampSplitTopPercent(percent) }
          : p
      ),
    });
  };

  const handleAddStatus = async () => {
    if (!newStatusName.trim()) return;

    const visibleCount = statuses.filter((s) => s.isVisible !== false && s.key !== 'QUOTE').length;
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

    try {
      if (jobsInStatus > 0) {
        await db.migrateJobsFromStatus(key, fallback.key);
      }
      await db.saveStatusDefinitions(updated);
      await db.saveKanbanLayoutConfig(nextLayout);
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
      let layout = normalizeKanbanLayoutConfig(kanbanLayout);

      if (selectedKeys.length === 2) {
        const next = applySplitPairFromSelection(selectedKeys, layout);
        if (next) layout = normalizeKanbanLayoutConfig(next);
      }

      await db.saveStatusDefinitionsAndKanbanLayout(statuses, layout);
      setKanbanLayout(layout);
      setSelectedKeys([]);

      let msg = '작업 단계 및 칸반 레이아웃이 저장되었습니다.';
      if (selectedKeys.length === 2) {
        const ordered = orderedPairKeysFromSelection(statuses, selectedKeys);
        if (ordered) {
          msg += `\n\n상·하 배치: ${labelFor(ordered[0])}(상) + ${labelFor(ordered[1])}(하)`;
        }
      }
      msg += '\n\n※ 체크박스는 배치 선택용입니다. 저장 후에는 아래 「현재 상·하 배치」와 각 단계 옆 표시로 확인하세요.';
      await showAlert(msg);
    } catch (error) {
      await showAlert('저장 실패: ' + getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const labelFor = (key: string) => statuses.find((s) => s.key === key)?.label || key;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 max-w-3xl transition-colors">
      <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-2">
        <ListChecks className="text-blue-600 dark:text-blue-400" />
        작업 단계(칸반) 관리
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        가로 칸 수는 그대로 두고, <strong>선택한 한 칸만</strong> 위·아래 두 단계로 나눌 수 있습니다.
        (예: 접수+견적, 납품+완료)
      </p>

      <div className="mb-6 p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/20 space-y-3">
        <h4 className="text-sm font-bold text-indigo-800 dark:text-indigo-200 flex items-center gap-2">
          <LayoutGrid size={16} />
          한 칸 상·하 배치
        </h4>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          단계 <strong>2개를 체크</strong>한 뒤 <strong>저장</strong>하면 자동으로 한 칸 안 상·하 배치됩니다.
          (목록에서 위쪽 = 상단, 아래쪽 = 하단) 나머지 단계는 기존처럼 전체 높이 칸을 씁니다.
        </p>
        <button
          type="button"
          onClick={() => void handleApplySplitPair()}
          disabled={selectedKeys.length !== 2}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-bold"
        >
          <Rows3 size={16} />
          선택 2개 상·하 배치 ({selectedKeys.length}/2)
        </button>

        {kanbanLayout.splitPairs.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-indigo-200/60 dark:border-indigo-800/60">
            <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300">현재 상·하 배치</p>
            {kanbanLayout.splitPairs.map((pair) => (
              <div
                key={`${pair.topKey}-${pair.bottomKey}`}
                className="p-3 rounded-lg bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    {labelFor(pair.topKey)} ↑ / {labelFor(pair.bottomKey)} ↓
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleToggleBottomCompact(pair)}
                      className={`px-2 py-1 rounded text-[10px] font-bold border ${
                        pair.bottomCompact !== false
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white dark:bg-slate-800 text-slate-600 border-slate-300'
                      }`}
                    >
                      하단 컴팩트 {pair.bottomCompact !== false ? '✓' : ''}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemovePair(pair)}
                      className="px-2 py-1 rounded text-[10px] font-bold text-rose-600 border border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-1"
                    >
                      <Unlink size={12} /> 분리
                    </button>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
                    <span>상단 비율</span>
                    <span>{pair.splitTopPercent ?? 65}%</span>
                  </div>
                  <input
                    type="range"
                    min={35}
                    max={85}
                    value={pair.splitTopPercent ?? 65}
                    onChange={(e) => handlePairSplitPercent(pair, Number(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4 mb-8">
        {statuses.map((status, index) => {
          const pair = findPairForKey(kanbanLayout, status.key);
          const isSelected = selectedKeys.includes(status.key);
          return (
            <div
              key={status.key}
              className={`flex flex-col gap-2 p-3 border rounded-lg transition-all ${
                status.isVisible !== false
                  ? 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                  : 'bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-slate-800 opacity-60'
              } ${isSelected ? 'ring-2 ring-indigo-400' : ''}`}
            >
              <div className="flex items-center gap-3">
                {status.key !== 'QUOTE' && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelectKey(status.key)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                    title="상·하 배치할 단계 선택 (2개)"
                  />
                )}
                <span className="font-bold text-blue-600 dark:text-blue-400 w-6 text-center shrink-0">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={status.label}
                    onChange={(e) => handleLabelChange(status.key, e.target.value)}
                    className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
                    placeholder="단계 이름"
                  />
                  <p className="text-[10px] text-slate-400 mt-1 ml-1 flex flex-wrap items-center gap-2">
                    고유키: {status.key}
                    {pair && (
                      <span className="text-indigo-500 font-bold">
                        {pair.topKey === status.key ? '↑ 상단' : '↓ 하단'} (
                        {labelFor(pair.topKey)} / {labelFor(pair.bottomKey)})
                      </span>
                    )}
                    {status.isVisible === false && (
                      <span className="text-orange-500 font-bold">(칸반 숨김)</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleVisibility(status.key)}
                    className={`p-2 rounded-md transition-colors ${
                      status.isVisible !== false
                        ? 'text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30'
                        : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {status.isVisible !== false ? <Eye size={18} /> : <EyeOff size={18} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteStatus(status.key)}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md"
                    disabled={statuses.length <= 2 || status.key === 'QUOTE'}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 mb-8 p-4 bg-slate-100 dark:bg-slate-700/50 rounded-lg border border-dashed border-slate-300 dark:border-slate-600">
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
