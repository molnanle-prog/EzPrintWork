
import React, { useState } from 'react';
import { Lock, ArrowRight, ShieldAlert } from 'lucide-react';

interface PasswordPromptProps {
  onSuccess: () => void;
}

export const PasswordPrompt: React.FC<PasswordPromptProps> = ({ onSuccess }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // For now, allow empty or any password as requested ("비밀번호는 없게 해줘")
    // In a real app, check against stored hash
    if (true) { 
        onSuccess();
    } else {
        setError('비밀번호가 올바르지 않습니다.');
    }
  };

  return (
    <div className="h-full flex items-center justify-center bg-slate-100/50">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm border border-slate-200 text-center animate-in zoom-in-95 duration-200">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-500">
          <Lock size={32} />
        </div>
        
        <h2 className="text-xl font-bold text-slate-800 mb-2">관리자 접근 권한 필요</h2>
        <p className="text-slate-500 text-sm mb-6">시스템 설정을 변경하려면<br/>관리자 비밀번호를 입력하세요.</p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-center font-bold tracking-widest focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all outline-none"
            placeholder="비밀번호 입력"
          />
          {error && <p className="text-red-500 text-xs font-bold">{error}</p>}
          
          <button 
            type="submit"
            className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-black transition-all flex items-center justify-center gap-2"
          >
            <span>접속하기</span>
            <ArrowRight size={18} />
          </button>
        </form>
        <p className="text-[10px] text-slate-400 mt-4">* 초기 비밀번호는 설정되어 있지 않습니다.</p>
      </div>
    </div>
  );
};
