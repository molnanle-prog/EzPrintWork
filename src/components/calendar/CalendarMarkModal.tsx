import React, { useState } from 'react';
import { CalendarMark, CalendarMarkCalendar, CalendarMarkIcon, CalendarMarkRepeat } from '../../types';
import { solarKeyToLunar } from '../../utils/lunarSolar';
import { CALENDAR_MARK_ICON_LABELS, CalendarMarkArt } from './CalendarMarkArt';

interface CalendarMarkModalProps {
    mark: CalendarMark;
    onClose: () => void;
    onSave: (mark: CalendarMark) => Promise<void>;
    onDelete?: (id: string) => Promise<void>;
}

const REPEATS: { id: CalendarMarkRepeat; label: string }[] = [
    { id: 'once', label: '한 번' },
    { id: 'yearly', label: '매년' },
    { id: 'monthly', label: '매월' },
    { id: 'weekly', label: '매주' },
];

export const CalendarMarkModal: React.FC<CalendarMarkModalProps> = ({ mark, onClose, onSave, onDelete }) => {
    const [text, setText] = useState(mark.text);
    const [icon, setIcon] = useState<CalendarMarkIcon>(mark.icon);
    const [repeat, setRepeat] = useState<CalendarMarkRepeat>(mark.repeat);
    const [calendar, setCalendar] = useState<CalendarMarkCalendar>(mark.calendar);
    const [date, setDate] = useState(mark.date);
    const [lunarLeap, setLunarLeap] = useState(!!mark.lunarLeap);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [mode, setMode] = useState<'view' | 'edit'>(mark.text.trim() ? 'view' : 'edit');

    const lunarAllowed = repeat === 'once' || repeat === 'yearly';
    const lunar = lunarAllowed && calendar === 'lunar' ? solarKeyToLunar(date) : null;

    const handleSave = async () => {
        const trimmed = text.trim();
        if (!trimmed) {
            setError('표시할 글을 입력해 주세요.');
            return;
        }
        if (!date) {
            setError('날짜를 골라 주세요.');
            return;
        }
        let next: CalendarMark = {
            ...mark,
            text: trimmed,
            icon,
            repeat,
            calendar: lunarAllowed ? calendar : 'solar',
            date,
            lunarMonth: undefined,
            lunarDay: undefined,
            lunarLeap: undefined,
        };
        if (next.calendar === 'lunar') {
            const converted = solarKeyToLunar(date);
            if (!converted) {
                setError('이 날짜는 음력으로 바꾸지 못했습니다.');
                return;
            }
            if (lunarLeap && converted.isLeap === false) {
                setError('고른 날은 윤달이 아닙니다. 윤달인 날을 고르거나 윤달 체크를 빼 주세요.');
                return;
            }
            next = {
                ...next,
                lunarMonth: converted.month,
                lunarDay: converted.day,
                lunarLeap: lunarLeap && converted.isLeap,
            };
        }
        setSaving(true);
        setError('');
        try {
            await onSave(next);
        } catch (e) {
            setError(e instanceof Error ? e.message : '저장하지 못했습니다.');
            setSaving(false);
        }
    };

    const repeatLabel = REPEATS.find((item) => item.id === mark.repeat)?.label || '한 번';
    const iconLabel = CALENDAR_MARK_ICON_LABELS.find((item) => item.id === mark.icon)?.label || '표시';
    const savedLunar = mark.calendar === 'lunar' && mark.lunarMonth && mark.lunarDay;
    const calendarLabel = savedLunar
        ? `음력 ${mark.lunarLeap ? '윤' : ''}${mark.lunarMonth}월 ${mark.lunarDay}일`
        : `양력 ${mark.date}`;

    if (mode === 'view') {
        return (
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
                <div
                    className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl p-4"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center gap-2 mb-3">
                        <CalendarMarkArt icon={mark.icon} size={28} />
                        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{iconLabel}</h3>
                    </div>
                    <p className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap break-words mb-3">{mark.text}</p>
                    <p className="text-xs text-slate-500 mb-1">반복: {repeatLabel}</p>
                    <p className="text-xs text-slate-500 mb-4">기준: {calendarLabel}</p>
                    <div className="flex justify-between gap-2">
                        {onDelete ? (
                            <button
                                type="button"
                                className="text-xs font-bold text-red-500 px-2"
                                onClick={() => void onDelete(mark.id)}
                            >
                                삭제
                            </button>
                        ) : <span />}
                        <div className="flex gap-2">
                            <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs font-bold rounded-lg border">
                                닫기
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode('edit')}
                                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-600 text-white"
                            >
                                수정
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div
                className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl p-4"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-3">달력 표시</h3>
                <label className="block text-xs font-bold text-slate-500 mb-1">글</label>
                <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="예: 김과장 생일, 회식"
                    className="w-full mb-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
                <p className="text-xs font-bold text-slate-500 mb-1">그림</p>
                <div className="grid grid-cols-3 gap-2 mb-3">
                    {CALENDAR_MARK_ICON_LABELS.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => setIcon(item.id)}
                            className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs font-bold ${
                                icon === item.id
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
                                    : 'border-slate-200 dark:border-slate-600'
                            }`}
                        >
                            <CalendarMarkArt icon={item.id} />
                            {item.label}
                        </button>
                    ))}
                </div>
                <label className="block text-xs font-bold text-slate-500 mb-1">날짜</label>
                <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full mb-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
                <p className="text-xs font-bold text-slate-500 mb-1">반복</p>
                <div className="flex flex-wrap gap-1 mb-3">
                    {REPEATS.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => setRepeat(item.id)}
                            className={`px-2 py-1 rounded-lg text-xs font-bold border ${
                                repeat === item.id
                                    ? 'bg-slate-800 text-white border-slate-800'
                                    : 'border-slate-200 dark:border-slate-600'
                            }`}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-3 mb-2">
                    <label className="flex items-center gap-1 text-xs font-bold">
                        <input
                            type="radio"
                            checked={!lunarAllowed || calendar === 'solar'}
                            onChange={() => setCalendar('solar')}
                        />
                        양력
                    </label>
                    <label className={`flex items-center gap-1 text-xs font-bold ${lunarAllowed ? '' : 'opacity-40'}`}>
                        <input
                            type="radio"
                            disabled={!lunarAllowed}
                            checked={lunarAllowed && calendar === 'lunar'}
                            onChange={() => setCalendar('lunar')}
                        />
                        음력
                    </label>
                    {lunarAllowed && calendar === 'lunar' && (
                        <label className="flex items-center gap-1 text-xs font-bold">
                            <input type="checkbox" checked={lunarLeap} onChange={(e) => setLunarLeap(e.target.checked)} />
                            윤달
                        </label>
                    )}
                </div>
                {lunar && (
                    <p className="text-[11px] text-slate-500 mb-3">
                        고른 날의 음력은 {lunar.year}년 {lunar.isLeap ? '윤' : ''}{lunar.month}월 {lunar.day}일입니다.
                        {repeat === 'yearly' ? ' 매년 그 음력 날에 표시합니다.' : ''}
                    </p>
                )}
                {!lunarAllowed && (
                    <p className="text-[11px] text-slate-500 mb-3">매월·매주는 양력으로 반복합니다.</p>
                )}
                {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
                <div className="flex justify-between gap-2">
                    {onDelete ? (
                        <button
                            type="button"
                            className="text-xs font-bold text-red-500 px-2"
                            onClick={() => void onDelete(mark.id)}
                        >
                            삭제
                        </button>
                    ) : <span />}
                    <div className="flex gap-2">
                        <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs font-bold rounded-lg border">
                            닫기
                        </button>
                        <button
                            type="button"
                            disabled={saving}
                            onClick={() => void handleSave()}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-600 text-white disabled:opacity-50"
                        >
                            저장
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
