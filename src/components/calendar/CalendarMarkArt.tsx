import React from 'react';
import { CalendarMarkIcon } from '../../types';

export function CalendarMarkArt({ icon, size = 14 }: { icon: CalendarMarkIcon; size?: number }) {
    const props = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true as const };
    if (icon === 'cake') {
        return (
            <svg {...props}>
                <path fill="#fb7185" d="M4 14h16v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6z" />
                <path fill="#fda4af" d="M4 14c1.2-1.4 2.4-1.4 3.6 0s2.4 1.4 3.6 0 2.4-1.4 3.6 0 2.4 1.4 3.6 0 1.6-1 1.6-1H4s.4-.4 0 1z" />
                <rect x="11" y="3" width="2" height="4" rx="1" fill="#f59e0b" />
                <circle cx="12" cy="3" r="1.2" fill="#f97316" />
            </svg>
        );
    }
    if (icon === 'meal') {
        return (
            <svg {...props}>
                <path fill="#fb923c" d="M5 10h14l-1.2 8H6.2L5 10z" />
                <path fill="#fdba74" d="M7 10c.8 2 1.6 2 2.4 0S11 8 12 10s1.6 2 2.4 0 1.6-2 2.4 0" />
                <path stroke="#9a3412" strokeWidth="1.4" fill="none" d="M4 10h16" />
            </svg>
        );
    }
    if (icon === 'balloon') {
        return (
            <svg {...props}>
                <ellipse cx="12" cy="9" rx="5.2" ry="6.2" fill="#38bdf8" />
                <path d="M12 15.2c.4 1.4-.2 2.4-1.2 3.6" stroke="#0284c7" strokeWidth="1.2" fill="none" />
                <path d="M10.2 19.2h2.4l-.6 1.6h-1.2z" fill="#0284c7" />
            </svg>
        );
    }
    if (icon === 'star') {
        return (
            <svg {...props}>
                <path fill="#fbbf24" d="M12 3.2l2.2 4.6 5 .7-3.6 3.5.9 5.1L12 14.8 7.5 17.1l.9-5.1L4.8 8.5l5-.7z" />
            </svg>
        );
    }
    if (icon === 'heart') {
        return (
            <svg {...props}>
                <path fill="#f43f5e" d="M12 19s-6.2-3.8-8.2-7.2C2.2 9.4 3.2 6.4 6.2 6.2c1.8-.1 3.1.8 3.8 2  .7-1.2 2-2.1 3.8-2 3 .2 4 3.2 2.4 5.6C18.2 15.2 12 19 12 19z" />
            </svg>
        );
    }
    return (
        <svg {...props}>
            <path fill="#34d399" d="M6 4h2v16H6z" />
            <path fill="#10b981" d="M8 4h10l-2 3.2L18 10.4H8z" />
        </svg>
    );
}

export const CALENDAR_MARK_ICON_LABELS: { id: CalendarMarkIcon; label: string }[] = [
    { id: 'cake', label: '생일' },
    { id: 'meal', label: '회식' },
    { id: 'balloon', label: '행사' },
    { id: 'star', label: '중요' },
    { id: 'heart', label: '기념' },
    { id: 'flag', label: '표시' },
];
