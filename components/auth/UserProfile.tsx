import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LogOut } from 'lucide-react';

interface UserProfileProps {
  compact?: boolean;
}

export const UserProfile: React.FC<UserProfileProps> = ({ compact = false }) => {
  const { currentUser, logout } = useAuth();

  if (!currentUser) return null;

  if (compact) {
    return (
      <button 
        onClick={logout}
        className="w-8 h-8 rounded-full border border-slate-300 overflow-hidden relative active:scale-95 transition-transform"
      >
        <img src={currentUser.avatarUrl} alt={currentUser.name} className="w-full h-full object-cover" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 bg-slate-800 rounded-xl border border-slate-700">
      <img 
        src={currentUser.avatarUrl} 
        alt={currentUser.name} 
        className="w-10 h-10 rounded-full border-2 border-slate-600"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white truncate">{currentUser.name}</p>
        <p className="text-xs text-slate-400 truncate">{currentUser.role}</p>
      </div>
      <button 
        onClick={logout}
        className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
        title="로그아웃"
      >
        <LogOut size={18} />
      </button>
    </div>
  );
};