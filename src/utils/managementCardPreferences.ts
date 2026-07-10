export type ManagementCardViewMode = 'cards' | 'byClient';

const STORAGE_KEY = 'ezprint_management_card_view_prefs';

function readAll(): Record<string, ManagementCardViewMode> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ManagementCardViewMode>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(prefs: Record<string, ManagementCardViewMode>): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function loadManagementCardViewMode(userId?: string | null): ManagementCardViewMode {
  if (!userId) return 'cards';
  const mode = readAll()[userId];
  return mode === 'byClient' ? 'byClient' : 'cards';
}

export function saveManagementCardViewMode(
  userId: string | undefined | null,
  mode: ManagementCardViewMode
): void {
  if (!userId) return;
  const prefs = readAll();
  prefs[userId] = mode;
  writeAll(prefs);
}
