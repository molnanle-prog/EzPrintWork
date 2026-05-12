import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LogOut, ShieldCheck, User } from 'lucide-react';

interface UserProfileProps {
  compact?: boolean;
}

export const UserProfile: React.FC<UserProfileProps> = ({ compact = false }) => {
  const { currentUser, firebaseUser, logout } = useAuth();

  if (!firebaseUser || !currentUser) return null;

  const photoURL = firebaseUser.photoURL || currentUser.photoURL;

  if (compact) {
    return (
      <button 
        onClick={logout}
        className="w-10 h-10 rounded-full border border-slate-700 overflow-hidden relative active:scale-95 transition-transform bg-slate-800 flex items-center justify-center"
      >
        {photoURL ? (
          <img src={photoURL} alt={currentUser.displayName} className="w-full h-full object-cover" />
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
            alt={currentUser.displayName} 
            className="w-12 h-12 rounded-full border border-slate-600"
          />
        ) : (
          <div className="w-12 h-12 rounded-full border border-slate-600 bg-slate-700 flex items-center justify-center">
            <User size={24} className="text-slate-400" />
          </div>
        )}
        {currentUser.role === 'admin' && (
          <div className="absolute -bottom-1 -right-1 bg-yellow-500 rounded-full p-0.5 border border-slate-800">
            <ShieldCheck size={12} className="text-slate-900" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold text-white truncate">{currentUser.displayName || firebaseUser.email}</p>
        <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">{currentUser.role}</p>
      </div>
      <button 
        onClick={logout}
        className="p-2.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
        title="로그아웃"
      >
        <LogOut size={22} />
      </button>
    </div>
  );
};
