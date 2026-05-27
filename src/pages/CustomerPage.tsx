import React, { useState, useEffect } from 'react';
import { db } from '../services/dataService';
import { Users, User, Search, Plus, Filter, MoreHorizontal, Mail, Phone, Building, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';

export const CustomerPage: React.FC = () => {
    const [customers, setCustomers] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        setCustomers(db.getClients());
    }, []);

    const filteredCustomers = customers.filter(c => 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.contactPerson?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone?.includes(searchTerm)
    );

    const handleExport = async () => {
        const res = await db.exportCustomersToCsv();
        if (res.success && res.data) {
            const blob = new Blob([res.data], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `customers_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            toast.success('고객 명단이 내보내기 되었습니다.');
        }
    };

    return (
        <div className="h-full flex flex-col space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-black text-white tracking-tighter flex items-center gap-3">
                        <Users className="text-blue-500" size={32} />
                        고객 <span className="text-blue-500">데이터베이스</span>
                    </h2>
                    <p className="text-slate-400 font-medium">거래처 정보와 연락처를 한곳에서 관리하세요.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={handleExport} className="flex items-center gap-2 bg-slate-900 border border-slate-800 text-slate-300 px-4 py-2.5 rounded-xl hover:bg-slate-800 transition-all font-bold text-sm">
                        <Download size={18} /> 내보내기
                    </button>
                    <button className="flex items-center gap-2 bg-slate-900 border border-slate-800 text-slate-300 px-4 py-2.5 rounded-xl hover:bg-slate-800 transition-all font-bold text-sm">
                        <Upload size={18} /> 가져오기
                    </button>
                    <button className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2">
                        <Plus size={20} /> 새 고객 등록
                    </button>
                </div>
            </div>

            {/* Filters & Search */}
            <div className="bg-slate-900/50 border border-slate-800/50 p-4 rounded-2xl flex flex-col md:flex-row gap-4 items-center">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                    <input 
                        type="text" 
                        placeholder="회사명, 담당자명, 전화번호 검색..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-12 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                </div>
                <button className="flex items-center gap-2 bg-slate-900 border border-slate-800 text-slate-400 px-5 py-3 rounded-xl hover:text-white transition-all">
                    <Filter size={18} /> 필터 상세
                </button>
            </div>

            {/* Customer Table */}
            <div className="flex-1 bg-slate-900/30 rounded-[2.5rem] border border-slate-800/50 overflow-hidden flex flex-col shadow-2xl">
                <div className="overflow-x-auto overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-900/50 border-b border-slate-800">
                                <th className="px-8 py-5 text-xs font-black text-slate-500 uppercase tracking-widest">상호/이름</th>
                                <th className="px-8 py-5 text-xs font-black text-slate-500 uppercase tracking-widest">담당자</th>
                                <th className="px-8 py-5 text-xs font-black text-slate-500 uppercase tracking-widest">연락처</th>
                                <th className="px-8 py-5 text-xs font-black text-slate-500 uppercase tracking-widest">최근 주문</th>
                                <th className="px-8 py-5 text-xs font-black text-slate-500 uppercase tracking-widest text-right">관리</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {filteredCustomers.length > 0 ? (
                                filteredCustomers.map((customer, i) => (
                                    <tr key={i} className="hover:bg-blue-600/5 transition-colors group">
                                        <td className="px-8 py-5">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-blue-500 group-hover:bg-blue-600 group-hover:text-white transition-all">
                                                    <Building size={20} />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-white text-lg">{customer.name}</p>
                                                    <p className="text-slate-500 text-xs">{customer.email || '이메일 없음'}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-5 text-slate-300 font-medium">
                                            <div className="flex items-center gap-2">
                                                <User size={14} className="text-slate-500" />
                                                {customer.contactPerson || '-'}
                                            </div>
                                        </td>
                                        <td className="px-8 py-5 text-slate-300 font-medium">
                                            <div className="flex items-center gap-2">
                                                <Phone size={14} className="text-slate-500" />
                                                {customer.phone || '-'}
                                            </div>
                                        </td>
                                        <td className="px-8 py-5">
                                            <span className="bg-slate-800 text-slate-400 text-[10px] font-black px-2.5 py-1 rounded-md uppercase">
                                                No Orders yet
                                            </span>
                                        </td>
                                        <td className="px-8 py-5 text-right">
                                            <button className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-white transition-all">
                                                <MoreHorizontal size={20} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={5} className="px-8 py-20 text-center text-slate-500 font-medium italic">
                                        등록된 고객이 없거나 검색 결과가 없습니다.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
