import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { AlertTriangle, Info, Check, X } from 'lucide-react';

interface DialogContextType {
  showConfirm: (message: string) => Promise<boolean>;
  showAlert: (message: string) => Promise<void>;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<'confirm' | 'alert'>('alert');
  const [message, setMessage] = useState('');
  
  // Store the resolve function of the current promise
  const resolveRef = useRef<((value: any) => void) | null>(null);

  const showConfirm = useCallback((msg: string) => {
    return new Promise<boolean>((resolve) => {
      setMessage(msg);
      setType('confirm');
      setIsOpen(true);
      resolveRef.current = resolve;
    });
  }, []);

  const showAlert = useCallback((msg: string) => {
    return new Promise<void>((resolve) => {
      setMessage(msg);
      setType('alert');
      setIsOpen(true);
      resolveRef.current = resolve;
    });
  }, []);

  const handleAction = (result: boolean) => {
    setIsOpen(false);
    if (resolveRef.current) {
      resolveRef.current(result);
      resolveRef.current = null;
    }
  };

  return (
    <DialogContext.Provider value={{ showConfirm, showAlert }}>
      {children}
      
      {/* Global Dialog Overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
            <div className="p-6">
              <div className="flex flex-col items-center text-center gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${type === 'confirm' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                  {type === 'confirm' ? <AlertTriangle size={24} /> : <Info size={24} />}
                </div>
                <h3 className="text-lg font-bold text-slate-800 whitespace-pre-line">
                  {message}
                </h3>
              </div>
            </div>
            
            <div className="flex border-t border-slate-100">
              {type === 'confirm' ? (
                <>
                  <button 
                    onClick={() => handleAction(false)}
                    className="flex-1 py-3.5 text-slate-600 font-bold hover:bg-slate-50 transition-colors border-r border-slate-100"
                  >
                    취소
                  </button>
                  <button 
                    onClick={() => handleAction(true)}
                    className="flex-1 py-3.5 text-red-600 font-bold hover:bg-red-50 transition-colors"
                  >
                    확인 (삭제)
                  </button>
                </>
              ) : (
                <button 
                  onClick={() => handleAction(true)}
                  className="flex-1 py-3.5 text-blue-600 font-bold hover:bg-blue-50 transition-colors"
                >
                  확인
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
};

export const useDialog = () => {
  const context = useContext(DialogContext);
  if (context === undefined) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
};