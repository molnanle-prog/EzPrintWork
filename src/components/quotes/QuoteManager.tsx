import React, { useState, useEffect } from 'react';
import { db } from '../../services/dataService';
import { Quote } from '../../types';
import { FileText, Plus, Check, X, Printer, Search, User, Calendar, DollarSign } from 'lucide-react';
import { QuoteDetailModal } from './QuoteDetailModal';
import { useDialog } from '../../contexts/DialogContext';

export const QuoteManager: React.FC = () => {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const { showConfirm } = useDialog();

  const loadQuotes = () => {
      setQuotes(db.getQuotes());
  };

  useEffect(() => {
    loadQuotes();
    const unsubscribe = db.subscribe(loadQuotes);
    return () => unsubscribe();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case '승인': return 'bg-emerald-100 text-emerald-700';
      case '거절': return 'bg-red-100 text-red-700';
      default: return 'bg-orange-100 text-orange-700';
    }
  };

  const handleCreateQuote = () => {
    const newQuote: Quote = {
      id: Date.now().toString(),
      clientName: '신규 고객',
      items: '내용을 입력하세요',
      totalAmount: 0,
      date: new Date().toISOString(),
      status: '대기'
    };
    setSelectedQuote(newQuote);
  };

  const handleUpdateQuote = (updated: Quote) => {
    const exists = quotes.find(q => q.id === updated.id);
    let newQuotes;
    if (exists) {
      newQuotes = quotes.map(q => q.id === updated.id ? updated : q);
    } else {
      newQuotes = [updated, ...quotes];
    }
    db.saveQuotes(newQuotes);
    setSelectedQuote(null);
  };

  const handleDeleteQuote = (id: string) => {
    db.deleteQuote(id);
    setSelectedQuote(null);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full">
      <div className="p-4 md:p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 flex-none">
        <div>
          <h2 className="text-lg md:text-xl font-bold text-slate-800">견적서 관리</h2>
          <p className="hidden md:block text-sm text-slate-500 mt-1">발행된 견적서를 관리하고 상태를 변경합니다.</p>
        </div>
        <button 
          onClick={handleCreateQuote}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 md:px-4 md:py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm text-sm md:text-base font-bold"
        >
          <Plus size={18} />
          <span>새 견적</span>
        </button>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto flex-1 custom-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
            <tr>
              <th className="p-4 font-semibold text-slate-600 text-sm">고객명</th>
              <th className="p-4 font-semibold text-slate-600 text-sm">내용</th>
              <th className="p-4 font-semibold text-slate-600 text-sm">금액</th>
              <th className="p-4 font-semibold text-slate-600 text-sm">발행일</th>
              <th className="p-4 font-semibold text-slate-600 text-sm">상태</th>
              <th className="p-4 font-semibold text-slate-600 text-sm text-right">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {quotes.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-400">등록된 견적서가 없습니다.</td>
              </tr>
            )}
            {quotes.map((quote) => (
              <tr 
                key={quote.id} 
                onClick={() => setSelectedQuote(quote)}
                className="hover:bg-blue-50/50 transition-colors group cursor-pointer"
              >
                <td className="p-4 font-medium text-slate-800">{quote.clientName}</td>
                <td className="p-4 text-slate-600 max-w-xs truncate">{quote.items}</td>
                <td className="p-4 font-bold text-slate-800">{quote.totalAmount.toLocaleString()}원</td>
                <td className="p-4 text-slate-500 text-sm">{new Date(quote.date).toLocaleDateString()}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${getStatusColor(quote.status)}`}>
                    {quote.status}
                  </span>
                </td>
                <td className="p-4 text-right">
                  <div className="flex justify-end gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => { e.stopPropagation(); /* Print Logic */ }}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded" 
                      title="인쇄"
                    >
                      <Printer size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {quotes.length === 0 && (
           <div className="text-center text-slate-400 py-10">등록된 견적서가 없습니다.</div>
        )}
        {quotes.map((quote) => (
          <div 
            key={quote.id}
            onClick={() => setSelectedQuote(quote)}
            className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm active:scale-[0.98] transition-transform"
          >
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <User size={16} className="text-slate-400" />
                {quote.clientName}
              </h3>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getStatusColor(quote.status)}`}>
                {quote.status}
              </span>
            </div>
            
            <div className="text-sm text-slate-600 mb-3 bg-slate-50 p-2 rounded line-clamp-2 min-h-[3rem]">
              {quote.items}
            </div>

            <div className="flex justify-between items-center border-t border-slate-100 pt-3 text-sm">
              <div className="flex items-center gap-1.5 text-slate-500">
                <Calendar size={14} />
                <span>{new Date(quote.date).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center gap-1 font-bold text-blue-600">
                <DollarSign size={14} />
                <span>{quote.totalAmount.toLocaleString()}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedQuote && (
        <QuoteDetailModal 
          quote={selectedQuote} 
          onClose={() => setSelectedQuote(null)}
          onUpdate={handleUpdateQuote}
          onDelete={handleDeleteQuote}
        />
      )}
    </div>
  );
};