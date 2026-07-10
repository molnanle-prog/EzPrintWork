import { Job } from '../types';

export function isJobBoardHidden(job: Job): boolean {
  return !!job.boardHiddenAt;
}

export function isJobHiddenForManagementCard(job: Job): boolean {
  return job.boardHiddenReason === 'management_card';
}

export function isLongProjectJob(job: Job): boolean {
  const created = new Date(job.createdAt).getTime();
  const due = new Date(job.dueDate).getTime();
  const longByDuration = Number.isFinite(created) && Number.isFinite(due) && due - created >= 1000 * 60 * 60 * 24 * 7;
  if (longByDuration) return true;

  const text = `${job.title || ''} ${job.description || ''} ${job.type || ''}`.toLowerCase();
  return text.includes('장기') || text.includes('프로젝트') || text.includes('project');
}
