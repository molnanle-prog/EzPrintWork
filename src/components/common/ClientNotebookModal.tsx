import React, { useState } from 'react';
import { JobNotebook, JobNotebookAttachment } from '../../types';
import {
    appendNotebookSaveStamp,
    attachNotebookFilesFromPaths,
    emptyNotebook,
    isImageAttachment,
    notebookTextHasBody,
    normalizeNotebook,
    openNotebookAttachment,
} from '../../utils/jobNotebook';
import { openClientNotebookFolder, persistClientNotebookText } from '../../utils/clientNotebook';
import { Eraser, FileText, Paperclip, Plus, Trash2, X, Image as ImageIcon, ExternalLink, NotebookPen, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';

interface ClientNotebookModalProps {
    clientId: string;
    clientName: string;
    initial: JobNotebook | undefined;
    onSave: (notebook: JobNotebook) => void;
    onClose: () => void;
}

export const ClientNotebookModal: React.FC<ClientNotebookModalProps> = ({
    clientId,
    clientName,
    initial,
    onSave,
    onClose,
}) => {
    const [draft, setDraft] = useState(() => normalizeNotebook(initial));
    const [busy, setBusy] = useState(false);
    const isElectron = typeof window !== 'undefined' && !!window.electron;

    const handleAddFiles = async () => {
        if (!isElectron || !window.electron?.selectFiles) {
            toast.error('첨부는 PC 앱에서만 가능합니다.');
            return;
        }
        setBusy(true);
        try {
            const paths = await window.electron.selectFiles({
                defaultPath: 'C:\\',
                openSelectedFolderAfter: true,
            });
            if (!paths?.length) return;
            const attachments = attachNotebookFilesFromPaths(paths);
            if (attachments.length) {
                setDraft((prev) => ({
                    ...prev,
                    attachments: [...(prev.attachments || []), ...attachments],
                }));
                toast.success(`첨부 ${attachments.length}개 위치 저장됨`);
            }
        } catch (e: any) {
            toast.error(e?.message || '첨부 실패');
        } finally {
            setBusy(false);
        }
    };

    const removeAttachment = (id: string) => {
        setDraft((prev) => ({
            ...prev,
            attachments: (prev.attachments || []).filter((a) => a.id !== id),
        }));
    };

    const openAttachment = async (att: JobNotebookAttachment) => {
        const ok = await openNotebookAttachment(att);
        if (!ok) toast.error('파일을 열 수 없습니다. 경로를 확인해 주세요.');
    };

    const handleOpenMemoFolder = async () => {
        const ok = await openClientNotebookFolder(clientId);
        if (!ok) toast.error('memo 폴더를 열 수 없습니다. NAS 연결을 확인해 주세요.');
    };

    const handleSave = async () => {
        const hasBody = notebookTextHasBody(draft.text || '');
        // 내용이 있으면 작성일·점선 추가, 비어 있으면 진짜 빈 메모(스탬프 없음)
        const stamped = hasBody ? appendNotebookSaveStamp(draft.text || '') : '';
        setBusy(true);
        try {
            if (isElectron) {
                const persisted = await persistClientNotebookText(clientId, stamped);
                if (!persisted.ok) {
                    toast.error(persisted.error || 'NAS 저장 실패');
                    return;
                }
            }
            const attachments = draft.attachments || [];
            const next: JobNotebook = {
                text: stamped,
                attachments,
            };
            setDraft(normalizeNotebook(next));
            onSave(next);
            toast.success(
                !hasBody && attachments.length === 0
                    ? '메모장을 비웠습니다.'
                    : isElectron
                      ? '거래처 메모장이 저장되었습니다.'
                      : '거래처 메모장이 반영되었습니다.'
            );
            onClose();
        } finally {
            setBusy(false);
        }
    };

    const handleClearAll = async () => {
        if (!window.confirm('메모 내용과 첨부를 모두 비울까요?')) return;
        setBusy(true);
        try {
            if (isElectron) {
                const persisted = await persistClientNotebookText(clientId, '');
                if (!persisted.ok) {
                    toast.error(persisted.error || 'NAS 저장 실패');
                    return;
                }
            }
            const next = emptyNotebook();
            setDraft(normalizeNotebook(next));
            onSave(next);
            toast.success('메모장을 비웠습니다.');
            onClose();
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[90] bg-black/55 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 w-full max-w-2xl max-h-[90vh] rounded-xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700">
                <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 flex items-start justify-between gap-3 bg-slate-50 dark:bg-slate-900">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            <NotebookPen className="text-teal-600" size={20} />
                            거래처 메모장
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            거래처: <strong className="text-slate-700 dark:text-slate-200">{clientName}</strong>
                            {' · '}저장 시 내용이 있으면 <strong>작성일 + 점선</strong> 추가
                            {' · '}비우면 메모 없음
                            {' · '}첨부는 원본 위치만 저장
                        </p>
                    </div>
                    <div className="flex items-center gap-1">
                        {isElectron && (
                            <button
                                type="button"
                                onClick={handleOpenMemoFolder}
                                className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500"
                                title="NAS memo/clients 폴더 열기"
                            >
                                <FolderOpen size={18} />
                            </button>
                        )}
                        <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700">
                            <X size={20} className="text-slate-500" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
                    <div>
                        <label className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1 mb-1.5">
                            <FileText size={13} /> 내용
                        </label>
                        <textarea
                            value={draft.text || ''}
                            onChange={(e) => setDraft((prev) => ({ ...prev, text: e.target.value }))}
                            rows={12}
                            placeholder={
                                '거래처 특이사항, 공지, 배송 주의사항 등을 적으세요.\n\n저장을 누르면 아래에 자동으로 붙습니다:\n작성일: 2026-07-24 16:12\n--------------------\n\n다음에 이어서 쓰면 기록이 구분됩니다.'
                            }
                            className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none focus:ring-2 focus:ring-teal-500 resize-y min-h-[200px] font-mono leading-relaxed"
                        />
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1">
                                <Paperclip size={13} /> 첨부 (이미지·PDF 등)
                            </label>
                            <button
                                type="button"
                                onClick={handleAddFiles}
                                disabled={busy || !isElectron}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                            >
                                <Plus size={12} />
                                {busy ? '처리 중...' : '파일 추가'}
                            </button>
                        </div>
                        {!isElectron && (
                            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 mb-2">
                                웹에서는 글만 저장됩니다. 첨부·NAS 저장은 PC 앱에서 해 주세요.
                            </p>
                        )}
                        <p className="text-[10px] text-slate-400 mb-2">
                            파일은 복사하지 않고 위치(경로)만 저장합니다.
                        </p>
                        {(draft.attachments || []).length === 0 ? (
                            <div className="text-xs text-slate-400 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg px-3 py-6 text-center">
                                공지 이미지, PDF 등을 첨부할 수 있습니다.
                            </div>
                        ) : (
                            <ul className="space-y-1.5">
                                {(draft.attachments || []).map((att) => (
                                    <li
                                        key={att.id}
                                        className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/60"
                                    >
                                        {isImageAttachment(att.fileName) ? (
                                            <ImageIcon size={14} className="text-emerald-600 shrink-0" />
                                        ) : (
                                            <Paperclip size={14} className="text-teal-600 shrink-0" />
                                        )}
                                        <span
                                            className="flex-1 text-xs font-medium text-slate-700 dark:text-slate-200 truncate"
                                            title={att.filePath || att.relativePath || att.fileName}
                                        >
                                            {att.fileName}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => openAttachment(att)}
                                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500"
                                            title="저장된 위치 열기"
                                        >
                                            <ExternalLink size={14} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => removeAttachment(att.id)}
                                            className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
                                            title="목록에서 제거"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 flex justify-between gap-2 bg-slate-50 dark:bg-slate-900">
                    <button
                        type="button"
                        onClick={handleClearAll}
                        disabled={busy}
                        className="px-3 py-2 text-sm font-bold rounded-lg border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-50 flex items-center gap-1.5"
                    >
                        <Eraser size={14} />
                        비우기
                    </button>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-bold rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300"
                            disabled={busy}
                        >
                            취소
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={busy}
                            className="px-5 py-2 text-sm font-bold rounded-lg bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
                        >
                            {busy ? '저장 중...' : '저장'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
