
import React, { useState, useEffect } from 'react';
import { db, getErrorMessage } from '../../services/dataService';
import { JobStatusDefinition, KanbanLayoutConfig, KanbanSplitPair } from '../../types';
import { ListChecks, Save, Trash2, Plus, Eye, EyeOff, LayoutGrid, Unlink, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { useDialog } from '../../contexts/DialogContext';
import {
  clampSplitTopPercent,
  findPairForKey,
  normalizeKanbanLayoutConfig,
  normalizeStatusDefinition,
  swapSplitPair,
  upsertSplitPair,
} from '../../utils/kanbanLayout';

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
    if (selectedKeys.length >= 3) {
      void showAlert('한 번에 최대 3개까지 고를 수 있습니다.\n위·아래에 넣을 두 단계와, 이 칸에서 빼고 싶은 단계를 고르세요.');
      return;
    }
    commitSelection([...selectedKeys, key], draftTop, draftBottom);
  };

  const moveDraftToTop = (key: string) => {
    if (!selectedKeys.includes(key) || draftTop === key) return;
    if (draftBottom === key) commitSelection(selectedKeys, key, draftTop);
    else commitSelection(selectedKeys, key, draftBottom);
  };

  const moveDraftToBottom = (key: string) => {
    if (!selectedKeys.includes(key) || draftBottom === key) return;
    if (draftTop === key) commitSelection(selectedKeys, draftBottom, key);
    else commitSelection(selectedKeys, draftTop, key);
  };

  const swapDraftSlots = () => {
    if (!draftTop || !draftBottom) return;
    commitSelection(selectedKeys, draftBottom, draftTop);
  };

  const handleApplySplitPair = async () => {
    if (!draftTop || !draftBottom || draftTop === draftBottom) {
      await showAlert('아래 목록에서 단계 2개를 고른 뒤, 미리보기에서 위·아래를 정하세요.');
      return;
    }

    const nextLayout = upsertSplitPair(kanbanLayout, draftTop, draftBottom);
    setKanbanLayout(nextLayout);
    setSelectedKeys([]);
    setDraftTop(null);
    setDraftBottom(null);
  };

  const handleSwapSavedPair = (pair: KanbanSplitPair) => {
    setKanbanLayout(swapSplitPair(kanbanLayout, pair));
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
      let layout = normalizeKanbanLayoutConfig(kanbanLayout);
      const appliedTop = draftTop;
      const appliedBottom = draftBottom;

      if (appliedTop && appliedBottom && appliedTop !== appliedBottom) {
        layout = normalizeKanbanLayoutConfig(upsertSplitPair(layout, appliedTop, appliedBottom));
      }

      await db.saveStatusDefinitionsAndKanbanLayout(statuses, layout, db.getStatusDefinitionRemovedKeys());
      setKanbanLayout(layout);
      setSelectedKeys([]);
      setDraftTop(null);
      setDraftBottom(null);

      let msg = '작업 단계 및 칸반 레이아웃이 저장되었습니다.';
      if (appliedTop && appliedBottom && appliedTop !== appliedBottom) {
        msg += `\n\n상·하 배치: ${labelFor(appliedTop)}(위) + ${labelFor(appliedBottom)}(아래)`;
      }
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
        처음 설치 기본은 <strong>접수 아래 견적</strong>, <strong>납품 아래 완료</strong>입니다.
        한 칸으로 풀거나 다른 조합으로 바꾸려면 아래에서 단계를 <strong>2개 또는 3개</strong> 고른 뒤
        <strong>위로 / 아래로</strong>를 정하고 저장하세요.
      </p>

      <div className="mb-6 p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/20 space-y-4">
        <h4 className="text-sm font-bold text-indigo-800 dark:text-indigo-200 flex items-center gap-2">
          <LayoutGrid size={16} />
          현재 상·하 배치
        </h4>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          한 칸에는 위·아래 <strong>두 단계</strong>만 들어갑니다. 3개를 고르면 나머지 하나는 보드에서 따로 한 칸이 됩니다.
        </p>

        {selectedKeys.length >= 2 && draftTop && draftBottom && (
          <div className="rounded-xl border-2 border-indigo-400 bg-white dark:bg-slate-900 p-3 space-y-3">
            <p className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300">지금 고른 배치 (저장 전)</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="w-full sm:w-44 shrink-0 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-600 shadow-sm">
                <div className="w-full text-left px-3 py-3 bg-indigo-600 text-white">
                  <p className="text-[10px] font-bold text-indigo-100 mb-0.5">위</p>
                  <p className="text-sm font-bold truncate">{labelFor(draftTop)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => swapDraftSlots()}
                  className="w-full py-1 bg-slate-200 dark:bg-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-200 flex items-center justify-center gap-1 hover:bg-slate-300 dark:hover:bg-slate-600"
                  title="위·아래 맞바꾸기"
                >
                  <ArrowUpDown size={12} /> 맞바꾸기
                </button>
                <div className="px-3 py-3 bg-slate-700 text-white">
                  <p className="text-[10px] font-bold text-slate-300 mb-0.5">아래</p>
                  <p className="text-sm font-bold truncate">{labelFor(draftBottom)}</p>
                </div>
              </div>
              <div className="flex-1 space-y-1.5 min-w-0">
                {selectedKeys.map((key) => {
                  const place = key === draftTop ? '위' : key === draftBottom ? '아래' : '이 칸에 안 넣음';
                  return (
                    <div
                      key={key}
                      className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
                        key === draftTop
                          ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40'
                          : key === draftBottom
                            ? 'border-slate-400 bg-slate-100 dark:bg-slate-800'
                            : 'border-dashed border-slate-300 dark:border-slate-600 bg-transparent'
                      }`}
                    >
                      <span className="flex-1 text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                        {labelFor(key)}
                        <span className="ml-1.5 text-[10px] font-medium text-slate-500">{place}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => moveDraftToTop(key)}
                        disabled={draftTop === key}
                        className="inline-flex items-center gap-0.5 px-2 py-1 rounded text-[10px] font-bold bg-indigo-600 text-white disabled:opacity-30"
                      >
                        <ArrowUp size={11} /> 위로
                      </button>
                      <button
                        type="button"
                        onClick={() => moveDraftToBottom(key)}
                        disabled={draftBottom === key}
                        className="inline-flex items-center gap-0.5 px-2 py-1 rounded text-[10px] font-bold bg-slate-600 text-white disabled:opacity-30"
                      >
                        <ArrowDown size={11} /> 아래로
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => void handleApplySplitPair()}
                  className="w-full mt-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
                >
                  이 배치를 칸에 넣기
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedKeys.length === 1 && (
          <p className="text-[11px] text-indigo-700 dark:text-indigo-300 bg-indigo-100/80 dark:bg-indigo-900/30 rounded-lg px-3 py-2">
            한 개 더 고르면 위·아래 미리보기가 나옵니다. (최대 3개)
          </p>
        )}

        {kanbanLayout.splitPairs.length > 0 && (
          <div className="space-y-2">
            {!(selectedKeys.length >= 2 && draftTop && draftBottom) && (
              <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300">저장된 상·하 칸</p>
            )}
            {kanbanLayout.splitPairs.map((pair) => (
              <div
                key={`${pair.topKey}-${pair.bottomKey}`}
                className="p-3 rounded-lg bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 space-y-2"
              >
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="w-full sm:w-36 shrink-0 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-600">
                    <div className="px-2.5 py-2 bg-indigo-600 text-white">
                      <p className="text-[9px] font-bold text-indigo-100">위</p>
                      <p className="text-xs font-bold truncate">{labelFor(pair.topKey)}</p>
                    </div>
                    <div className="px-2.5 py-2 bg-slate-700 text-white">
                      <p className="text-[9px] font-bold text-slate-300">아래</p>
                      <p className="text-xs font-bold truncate">{labelFor(pair.bottomKey)}</p>
                    </div>
                  </div>
                  <div className="flex-1 space-y-2 min-w-0">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => handleSwapSavedPair(pair)}
                        className="px-2 py-1 rounded text-[10px] font-bold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1"
                      >
                        <ArrowUpDown size={12} /> 위·아래 맞바꾸기
                      </button>
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
                    <div>
                      <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
                        <span>위쪽 칸 높이</span>
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4 mb-8">
        <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
          작업 단계 목록 — 체크하면 위 미리보기에 바로 반영됩니다
        </p>
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
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelectKey(status.key)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                  title="상·하 칸에 넣을 단계 선택 (2~3개)"
                />
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
