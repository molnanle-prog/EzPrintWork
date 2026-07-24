import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LogOut, ShieldCheck, User, Loader2 } from 'lucide-react';

interface UserProfileProps {
  compact?: boolean;
}

export const UserProfile: React.FC<UserProfileProps> = ({ compact = false }) => {
  const { currentUser, firebaseUser, logout } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!currentUser && !firebaseUser) return null;

  const photoURL = firebaseUser?.photoURL || currentUser?.photoURL;
  const displayName =
    currentUser?.displayName || currentUser?.name || firebaseUser?.email || currentUser?.email || '사용자';
  const role = currentUser?.role;

  const handleLogout = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await logout();
    } finally {
      setBusy(false);
    }
  };

  if (compact) {
    return (
      <button 
        onClick={handleLogout}
        disabled={busy}
        className="w-10 h-10 rounded-full border border-slate-700 overflow-hidden relative active:scale-95 transition-transform bg-slate-800 flex items-center justify-center disabled:opacity-50"
        title="로그아웃"
      >
        {busy ? (
          <Loader2 size={18} className="animate-spin text-slate-300" />
        ) : photoURL ? (
          <img src={photoURL} alt={displayName} className="w-full h-full object-cover" />
        ) : (
          <User size={20} className="text-slate-400" />
        )}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl border border-slate-700/50 shadow-inner">
      <div className="relative">
        {photoURL ? (
          <img 
            src={photoURL} 
            alt={displayName} 
            className="w-12 h-12 rounded-full border border-slate-600"
          />
        ) : (
          <div className="w-12 h-12 rounded-full border border-slate-600 bg-slate-700 flex items-center justify-center">
            <User size={24} className="text-slate-400" />
          </div>
        )}
        {role === 'admin' && (
          <div className="absolute -bottom-1 -right-1 bg-yellow-500 rounded-full p-0.5 border border-slate-800">
            <ShieldCheck size={12} className="text-slate-900" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold text-white truncate">{displayName}</p>
        <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">
          {role === 'admin' ? '관리자' : (role === 'staff' ? '직원' : role || '계정')}
        </p>
      </div>
      <button 
        onClick={handleLogout}
        disabled={busy}
        className="p-2.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
        title="로그아웃"
      >
        {busy ? <Loader2 size={22} className="animate-spin" /> : <LogOut size={22} />}
      </button>
    </div>
  );
};
