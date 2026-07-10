
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db, formatPhoneNumber, formatBusinessNumber, getErrorMessage } from '../../services/dataService';
import { Client, ClientContact, PrepaidLedgerEntry } from '../../types';
import { Plus, Trash2, Building2, Phone, User, Edit2, X, Save, ScanLine, Loader2, Camera, Briefcase, Mail, Hash, Smartphone, Search, GitMerge, ArrowRight, CheckCircle2, Wallet, History } from 'lucide-react';
import { createWorker } from 'tesseract.js';
import { useDialog } from '../../contexts/DialogContext';
import {
  getPreferredSmsNumber,
  inferSmsReceiveMode,
  resolveClientSmsNumber,
  resolveSmsNumberForMode,
  type SmsReceiveMode,
} from '../../utils/clientSms';
import { getClientMergePreview, mergeClients } from '../../utils/clientMerge';
import { normalizePrepaidBalance, canDeletePrepaidLedgerEntry } from '../../utils/prepaidBalance';
import { useAuth } from '../../contexts/AuthContext';

function prepaidLedgerTypeLabel(type: PrepaidLedgerEntry['type']): string {
  switch (type) {
    case 'deposit':
      return '입금';
    case 'deduction':
      return '차감';
    case 'restore':
      return '복구';
    default:
      return '조정';
  }
}

function prepaidLedgerSummary(row: PrepaidLedgerEntry): string {
  const detail = row.jobTitle || row.note || '';
  return detail ? `${prepaidLedgerTypeLabel(row.type)} · ${detail}` : prepaidLedgerTypeLabel(row.type);
}

function formatPrepaidLedgerTime(timestamp: string): string {
  return new Date(timestamp).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const ClientManager: React.FC = () => {
  const { canManageClientMaster, currentUser } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [mergePickIds, setMergePickIds] = useState<string[]>([]);
  const [mergePrimaryId, setMergePrimaryId] = useState<string | null>(null);
  const [mergeSearchQuery, setMergeSearchQuery] = useState('');
  const [isMerging, setIsMerging] = useState(false);
  const { showConfirm, showAlert } = useDialog();
  
  // OCR State
  const [isScanning, setIsScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [smsReceiveMode, setSmsReceiveMode] = useState<SmsReceiveMode>('mobile');
  const [prepaidDepositInput, setPrepaidDepositInput] = useState('');
  const [isAddingPrepaid, setIsAddingPrepaid] = useState(false);
  const [showPrepaidHistoryModal, setShowPrepaidHistoryModal] = useState(false);
  const [deletingPrepaidEntryId, setDeletingPrepaidEntryId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Client>>({
      name: '', 
      businessRegistrationNumber: '',
      contactPerson: '', 
      phone: '',
      email: '',
      address: '',
      note: '',
      contacts: [],
      sendSmsOnComplete: true,
      customSmsNumber: '',
      prepaidBalance: 0,
  });

  const loadClients = () => {
      setClients(db.getClients());
  };

  useEffect(() => {
    loadClients();
    const unsubscribe = db.subscribe(loadClients);
    return () => unsubscribe();
  }, []);

  const filteredClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return clients;

    return clients.filter((client) => {
      if (client.name.toLowerCase().includes(q)) return true;
      if (client.contactPerson?.toLowerCase().includes(q)) return true;
      if (client.phone?.includes(q)) return true;
      if (client.businessRegistrationNumber?.includes(q)) return true;
      if (client.address?.toLowerCase().includes(q)) return true;
      if (client.note?.toLowerCase().includes(q)) return true;
      if (client.customSmsNumber?.includes(q)) return true;
      if (client.contacts?.some((contact) =>
        contact.name?.toLowerCase().includes(q) ||
        contact.phone?.includes(q) ||
        contact.email?.toLowerCase().includes(q) ||
        contact.department?.toLowerCase().includes(q)
      )) return true;
      return false;
    });
  }, [clients, searchQuery]);

  const mergeFilteredClients = useMemo(() => {
    const q = mergeSearchQuery.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((client) => {
      if (client.name.toLowerCase().includes(q)) return true;
      if (client.contactPerson?.toLowerCase().includes(q)) return true;
      if (client.phone?.includes(q)) return true;
      if (client.businessRegistrationNumber?.includes(q)) return true;
      return false;
    });
  }, [clients, mergeSearchQuery]);

  const mergeSelectedClients = useMemo(() => {
    return mergePickIds
      .map((id) => clients.find((c) => c.id === id))
      .filter((c): c is Client => !!c);
  }, [clients, mergePickIds]);

  const mergePreview = useMemo(() => {
    if (mergeSelectedClients.length !== 2 || !mergePrimaryId) return null;
    const primary = mergeSelectedClients.find((c) => c.id === mergePrimaryId);
    const secondary = mergeSelectedClients.find((c) => c.id !== mergePrimaryId);
    if (!primary || !secondary) return null;
    return getClientMergePreview(primary, secondary);
  }, [mergeSelectedClients, mergePrimaryId]);

  const openMergeModal = () => {
    setMergePickIds([]);
    setMergePrimaryId(null);
    setMergeSearchQuery('');
    setIsMergeModalOpen(true);
  };

  const toggleMergePick = (clientId: string) => {
    setMergePickIds((prev) => {
      if (prev.includes(clientId)) {
        const next = prev.filter((id) => id !== clientId);
        if (mergePrimaryId === clientId) {
          setMergePrimaryId(next[0] || null);
        }
        return next;
      }
      if (prev.length >= 2) {
        const next = [prev[1], clientId];
        setMergePrimaryId((current) => (current && next.includes(current) ? current : next[0]));
        return next;
      }
      const next = [...prev, clientId];
      if (next.length === 1) setMergePrimaryId(clientId);
      if (next.length === 2 && !mergePrimaryId) setMergePrimaryId(next[0]);
      return next;
    });
  };

  const handleMergeClients = async () => {
    if (mergeSelectedClients.length !== 2 || !mergePrimaryId) {
      await showAlert('합칠 거래처 2개와 유지할 거래처명을 선택해 주세요.');
      return;
    }

    const primary = mergeSelectedClients.find((c) => c.id === mergePrimaryId);
    const secondary = mergeSelectedClients.find((c) => c.id !== mergePrimaryId);
    if (!primary || !secondary) return;

    const preview = getClientMergePreview(primary, secondary);
    const confirmed = await showConfirm(
      `[거래처 합치기]\n\n` +
      `유지: '${primary.name}'\n` +
      `흡수: '${secondary.name}' (삭제됨)\n\n` +
      `• 작업 ${preview.totalJobs}건 → '${primary.name}'으로 통합\n` +
      `• 견적 ${preview.totalQuotes}건 → '${primary.name}'으로 통합\n` +
      `• 담당자/연락처 정보 병합\n\n` +
      `이 작업은 되돌릴 수 없습니다. 진행하시겠습니까?`
    );
    if (!confirmed) return;

    setIsMerging(true);
    try {
      const result = await mergeClients(primary.id, secondary.id);
      await showAlert(
        `거래처 합치기가 완료되었습니다.\n\n` +
        `• 유지 거래처: ${result.primaryName}\n` +
        `• 작업 ${result.totalJobs}건 통합\n` +
        `• 견적 ${result.totalQuotes}건 통합\n` +
        `• 담당자 ${result.contactsMerged > 0 ? `${result.contactsMerged}명 추가 병합` : '정보 병합 완료'}`
      );
      setIsMergeModalOpen(false);
      setMergePickIds([]);
      setMergePrimaryId(null);
      loadClients();
    } catch (error) {
      await showAlert(getErrorMessage(error));
    } finally {
      setIsMerging(false);
    }
  };

  // --- Data Handlers ---

  const handleEdit = (client: Client) => {
      const contacts = client.contacts || [{ name: client.contactPerson, phone: client.phone }];
      const mode = inferSmsReceiveMode({ ...client, contacts }, client.customSmsNumber);
      setSmsReceiveMode(mode);
      setEditingId(client.id);
      setFormData({
          ...client,
          contacts,
          sendSmsOnComplete: client.sendSmsOnComplete !== false,
          customSmsNumber: resolveSmsNumberForMode({ ...client, contacts }, mode),
      });
      setIsModalOpen(true);
  };

  const handleAddNew = () => {
      setEditingId(null);
      setSmsReceiveMode('mobile');
      setFormData({
          name: '',
          businessRegistrationNumber: '',
          contactPerson: '',
          phone: '',
          email: '',
          address: '',
          note: '',
          contacts: [{ name: '', phone: '', department: '담당자' }],
          sendSmsOnComplete: true,
          customSmsNumber: '',
          prepaidBalance: 0,
      });
      setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
        await showAlert("상호명을 입력해주세요.");
        return;
    }

    // Ensure main contact is synced with the first contact in list (Backwards Compatibility)
    const primaryContact = formData.contacts && formData.contacts.length > 0 
        ? formData.contacts[0] 
        : { name: '', phone: '', email: '' };

    const clientToSave: Partial<Client> = {
        name: formData.name,
        businessRegistrationNumber: formData.businessRegistrationNumber,
        contactPerson: primaryContact.name, // Sync Primary
        phone: primaryContact.phone,        // Sync Primary
        email: primaryContact.email,        // Sync Primary
        address: formData.address || '',
        note: formData.note || '',
        contacts: formData.contacts || [],
        sendSmsOnComplete: formData.sendSmsOnComplete !== false,
        customSmsNumber: formData.sendSmsOnComplete !== false
            ? resolveSmsNumberForMode(formData, smsReceiveMode)
            : '',
    };

    if (editingId) {
        const existing = clients.find((c) => c.id === editingId);
        clientToSave.prepaidBalance = normalizePrepaidBalance(existing?.prepaidBalance);
        clientToSave.prepaidLedger = existing?.prepaidLedger;
    } else {
        clientToSave.prepaidBalance = 0;
    }

    try {
        if (editingId) {
            await db.updateClient({ ...clientToSave, id: editingId } as Client);
        } else {
            await db.addClient(clientToSave as Client);
        }
        setIsModalOpen(false);
        setShowPrepaidHistoryModal(false);
    } catch (error) {
        showAlert(getErrorMessage(error));
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if(await showConfirm(`'${name}' 거래처를 삭제하시겠습니까?`)) {
        try {
            await db.deleteClient(id);
        } catch (error) {
            showAlert(getErrorMessage(error));
        }
    }
  };

  // --- Contacts Management Handlers ---

  const handleAddContactRow = () => {
      setFormData({
          ...formData,
          contacts: [...(formData.contacts || []), { name: '', phone: '', department: '' }]
      });
  };

  const handleRemoveContactRow = (index: number) => {
      if ((formData.contacts || []).length <= 1) return; // Keep at least one
      const updated = [...(formData.contacts || [])];
      updated.splice(index, 1);
      setFormData({ ...formData, contacts: updated });
  };

  const handleContactChange = (index: number, field: keyof ClientContact, value: string) => {
      const updated = [...(formData.contacts || [])];
      let finalValue = value;
      if (field === 'phone') {
          finalValue = formatPhoneNumber(value);
      }
      updated[index] = { ...updated[index], [field]: finalValue };
      const nextForm = { ...formData, contacts: updated };
      if (smsReceiveMode === 'mobile' && (field === 'phone' || field === 'department')) {
          nextForm.customSmsNumber = getPreferredSmsNumber(nextForm);
      } else if (smsReceiveMode === 'primary' && index === 0 && field === 'phone') {
          nextForm.customSmsNumber = finalValue;
      }
      setFormData(nextForm);
  };

  const handleSmsReceiveModeChange = (mode: SmsReceiveMode) => {
      setSmsReceiveMode(mode);
      setFormData((prev) => ({
          ...prev,
          customSmsNumber: resolveSmsNumberForMode(prev, mode),
      }));
  };

  const handleAddressSearch = () => {
      const scriptId = 'daum-postcode-script';
      const existingScript = document.getElementById(scriptId);

      const openPostcode = () => {
          new (window as any).daum.Postcode({
              oncomplete: (data: { address: string; addressType: string; bname: string; buildingName: string }) => {
                  let fullAddress = data.address;
                  let extraAddress = '';

                  if (data.addressType === 'R') {
                      if (data.bname !== '') {
                          extraAddress += data.bname;
                      }
                      if (data.buildingName !== '') {
                          extraAddress += extraAddress !== '' ? `, ${data.buildingName}` : data.buildingName;
                      }
                      fullAddress += extraAddress !== '' ? ` (${extraAddress})` : '';
                  }

                  setFormData((prev) => ({ ...prev, address: fullAddress }));
              },
          }).open();
      };

      if (!existingScript) {
          const script = document.createElement('script');
          script.id = scriptId;
          script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
          script.onload = openPostcode;
          script.onerror = () => {
              void showAlert('주소 검색 서비스를 불러오는 데 실패했습니다. 네트워크 연결을 확인해 주세요.');
          };
          document.body.appendChild(script);
      } else {
          openPostcode();
      }
  };

  // --- OCR Handlers ---

  const handleOCRFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          processOCR(file);
      }
      // Reset input
      if (e.target) e.target.value = '';
  };

  const processOCR = async (file: File) => {
      setIsScanning(true);
      try {
          const worker = await createWorker('kor');
          const ret = await worker.recognize(file);
          const text = ret.data.text;
          await worker.terminate();
          
          parseOCRText(text);
          await showAlert("텍스트 인식 완료! 내용을 확인하고 저장해주세요.");
      } catch (err) {
          console.error(err);
          await showAlert("이미지 인식 중 오류가 발생했습니다.");
      } finally {
          setIsScanning(false);
      }
  };

  const parseOCRText = (text: string) => {
      // Simple Regex Heuristics
      const lines = text.split('\n');
      let extractedData: Partial<Client> = { ...formData };
      const contacts = [...(formData.contacts || [])];
      let primaryContact = contacts[0] || { name: '', phone: '', department: '' };

      // 1. Phone (010-XXXX-XXXX or 02-XXX-XXXX)
      const phoneRegex = /(010|0\d{1,2})[-.\s]?\d{3,4}[-.\s]?\d{4}/;
      const phoneMatch = text.match(phoneRegex);
      if (phoneMatch) primaryContact.phone = formatPhoneNumber(phoneMatch[0]);

      // 2. Email
      const emailRegex = /[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}/;
      const emailMatch = text.match(emailRegex);
      if (emailMatch) primaryContact.email = emailMatch[0];

      // 3. Business Registration Number (XXX-XX-XXXXX)
      const bizNumRegex = /\d{3}[-\s]?\d{2}[-\s]?\d{5}/;
      const bizMatch = text.match(bizNumRegex);
      if (bizMatch) extractedData.businessRegistrationNumber = formatBusinessNumber(bizMatch[0]);

      // 4. Try to find name (Very hard without NLP, assume first non-empty line or near "대표")
      // This is a naive implementation
      const nameKeywords = ['대표', '팀장', '과장', '대리', '사원'];
      for (const line of lines) {
          if (nameKeywords.some(keyword => line.includes(keyword))) {
             // Try to extract name near title
             const parts = line.split(/\s+/);
             const namePart = parts.find(p => p.length > 1 && p.length < 5 && !nameKeywords.includes(p));
             if (namePart) primaryContact.name = namePart;
          }
      }

      contacts[0] = primaryContact;
      setFormData({ ...extractedData, contacts });
  };

  const inputClass = "w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400";
  const smallInputClass = "w-full p-2 border border-slate-300 dark:border-slate-600 rounded text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400";

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
      <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Building2 className="text-blue-600 dark:text-blue-400" />
            거래처 관리
          </h3>
          <div className="flex flex-wrap gap-2">
          {canManageClientMaster && (
          <button 
            onClick={openMergeModal}
            disabled={clients.length < 2}
            title="비슷한 이름으로 중복 등록된 거래처를 하나로 합칩니다"
            className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 shadow-sm flex items-center gap-2 font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
             <GitMerge size={18} /> 거래처 합치기
          </button>
          )}
          <button 
            onClick={handleAddNew}
            title="새로운 거래처를 등록합니다"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 shadow-sm flex items-center gap-2 font-bold transition-colors"
          >
             <Plus size={18} /> 거래처 등록
          </button>
          </div>
      </div>

      <div className="mb-5 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="상호명, 담당자, 연락처, 사업자번호 검색..."
                  className="w-full pl-10 pr-10 py-2.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  autoComplete="off"
              />
              {searchQuery && (
                  <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 rounded-lg transition-colors"
                      title="검색어 지우기"
                  >
                      <X size={16} />
                  </button>
              )}
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400 font-medium shrink-0 px-1">
              {searchQuery.trim()
                  ? `검색 결과 ${filteredClients.length.toLocaleString()}건 / 전체 ${clients.length.toLocaleString()}건`
                  : `전체 ${clients.length.toLocaleString()}건`}
          </div>
      </div>

      {clients.length === 0 ? (
          <div className="text-center py-16 text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-600 rounded-xl">
              <Building2 size={40} className="mx-auto mb-3 opacity-40" />
              <p className="font-bold">등록된 거래처가 없습니다.</p>
              <p className="text-sm mt-1">우측 상단 「거래처 등록」으로 추가해 주세요.</p>
          </div>
      ) : filteredClients.length === 0 ? (
          <div className="text-center py-16 text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-600 rounded-xl">
              <Search size={40} className="mx-auto mb-3 opacity-40" />
              <p className="font-bold">「{searchQuery}」 검색 결과가 없습니다.</p>
              <p className="text-sm mt-1">다른 검색어를 입력하거나 검색어를 지워 전체 목록을 확인해 주세요.</p>
          </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredClients.map(client => (
              <div key={client.id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-5 hover:shadow-md transition-all relative group bg-white dark:bg-slate-700">
                  <div className="flex justify-between items-start mb-3">
                      <div>
                          <h4 className="font-bold text-slate-800 dark:text-slate-100 text-lg flex items-center gap-2 flex-wrap">
                             {client.name}
                             <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold select-none border transition-colors ${
                                 client.sendSmsOnComplete !== false
                                     ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50'
                                     : 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/50'
                             }`}>
                                 {client.sendSmsOnComplete !== false ? '알림 ON' : '알림 OFF'}
                             </span>
                          </h4>
                          <div className="flex flex-wrap gap-1 mt-1">
                              {client.businessRegistrationNumber && (
                                  <span className="text-[10px] bg-slate-100 dark:bg-slate-600 text-slate-500 dark:text-slate-300 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-500 font-mono">
                                      {client.businessRegistrationNumber}
                                  </span>
                              )}
                              {client.sendSmsOnComplete !== false && (
                                  <span className="text-[10px] bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-900/50 font-medium" title="알림 수신 번호">
                                      수신: {resolveClientSmsNumber(client) || '번호 없음'}
                                  </span>
                              )}
                              {normalizePrepaidBalance(client.prepaidBalance) > 0 && (
                                  <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-200 dark:border-indigo-900/50 font-bold" title="선불 잔액">
                                      선불 {normalizePrepaidBalance(client.prepaidBalance).toLocaleString()}원
                                  </span>
                              )}
                          </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                            onClick={() => handleEdit(client)}
                            className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-slate-600 rounded transition-colors"
                            title="정보 수정"
                        >
                            <Edit2 size={16} />
                        </button>
                        {canManageClientMaster && (
                        <button 
                            onClick={() => handleDelete(client.id, client.name)}
                            className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                            title="삭제"
                        >
                            <Trash2 size={16} />
                        </button>
                        )}
                      </div>
                  </div>
                  
                  {/* Contacts List */}
                  <div className="space-y-2 mt-2 border-t border-slate-100 dark:border-slate-600 pt-3">
                      {client.contacts && client.contacts.length > 0 ? (
                          client.contacts.slice(0, 2).map((contact, idx) => (
                              <div key={idx} className="flex flex-col text-sm">
                                  <div className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
                                      <User size={14} className="text-slate-400" />
                                      {contact.name} 
                                      {contact.department && <span className="text-xs text-slate-400">({contact.department})</span>}
                                  </div>
                                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 pl-6 text-xs">
                                      {contact.phone}
                                  </div>
                              </div>
                          ))
                      ) : (
                          // Fallback for legacy data
                          <div className="flex flex-col text-sm">
                              <div className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
                                  <User size={14} className="text-slate-400" />
                                  {client.contactPerson}
                              </div>
                              <div className="text-slate-500 dark:text-slate-400 pl-6 text-xs">{client.phone}</div>
                          </div>
                      )}
                      
                      {client.contacts && client.contacts.length > 2 && (
                          <div className="text-xs text-slate-400 pl-6 italic">
                              + 외 {client.contacts.length - 2}명
                          </div>
                      )}
                  </div>
              </div>
          ))}
      </div>
      )}

      {/* --- Add/Edit Modal --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] transition-colors">
                <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900 sticky top-0 z-10">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <Building2 className="text-blue-600 dark:text-blue-400" />
                        {editingId ? '거래처 정보 수정' : '신규 거래처 등록'}
                    </h2>
                    <button onClick={() => { setIsModalOpen(false); setShowPrepaidHistoryModal(false); }} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                        <X size={24} className="text-slate-500 dark:text-slate-400" />
                    </button>
                </div>

                <form onSubmit={handleSave} className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    {/* OCR Action Bar */}
                    <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800 flex items-center justify-between">
                        <div>
                            <h4 className="text-sm font-bold text-blue-800 dark:text-blue-300 flex items-center gap-2">
                                <ScanLine size={16} /> 스마트 정보 입력 (OCR)
                            </h4>
                            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                명함이나 사업자등록증 이미지를 스캔하여 정보를 자동 입력합니다.
                            </p>
                        </div>
                        <button 
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isScanning}
                            className="bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-slate-600 px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-100 dark:hover:bg-slate-600 shadow-sm flex items-center gap-2 transition-all"
                            title="이미지에서 텍스트 자동 추출"
                        >
                            {isScanning ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                            {isScanning ? '분석중...' : '이미지 스캔'}
                        </button>
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleOCRFileSelect} 
                            accept="image/*" 
                            className="hidden" 
                        />
                    </div>

                    {/* Basic Info */}
                    <div className="space-y-4 mb-8">
                        <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 border-b dark:border-slate-700 pb-2 mb-4">기본 정보</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400">상호명 <span className="text-red-500">*</span></label>
                                <input 
                                    value={formData.name}
                                    onChange={e => setFormData({...formData, name: e.target.value})}
                                    className={inputClass}
                                    placeholder="(주)인쇄마스터"
                                    required
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400">사업자등록번호</label>
                                <div className="flex items-center gap-2">
                                    <Hash size={16} className="text-slate-400" />
                                    <input 
                                        value={formData.businessRegistrationNumber || ''}
                                        onChange={e => setFormData({...formData, businessRegistrationNumber: formatBusinessNumber(e.target.value)})}
                                        className={`${inputClass} font-mono`}
                                        placeholder="000-00-00000"
                                    />
                                </div>
                            </div>
                            <div className="md:col-span-2 space-y-1">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400">주소</label>
                                <div className="flex gap-2">
                                    <input 
                                        value={formData.address || ''}
                                        onChange={e => setFormData({...formData, address: e.target.value})}
                                        className={inputClass}
                                        placeholder="도로명 주소 검색 또는 상세 주소 입력"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleAddressSearch}
                                        className="px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs transition-all flex items-center gap-1.5 active:scale-95 shrink-0 shadow-sm"
                                    >
                                        <Search size={14} />
                                        주소 검색
                                    </button>
                                </div>
                            </div>
                            <div className="md:col-span-2 space-y-1">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                    <Wallet size={14} className="text-indigo-500" /> 선불(예치) 잔액
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-[minmax(10rem,14rem)_minmax(8rem,10rem)_auto] gap-2 items-center">
                                    <div className="px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/20 text-right font-mono">
                                        <span className="font-bold text-indigo-700 dark:text-indigo-300 tabular-nums">
                                            {normalizePrepaidBalance(
                                                editingId
                                                    ? clients.find((c) => c.id === editingId)?.prepaidBalance
                                                    : 0
                                            ).toLocaleString()}
                                        </span>
                                        <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1">
                                            원
                                        </span>
                                    </div>
                                    {editingId ? (
                                        <>
                                            <input
                                                type="number"
                                                min={0}
                                                step={1000}
                                                value={prepaidDepositInput}
                                                onChange={(e) => setPrepaidDepositInput(e.target.value)}
                                                className="number-spin-gap w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:focus:border-indigo-400 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-mono text-right placeholder:text-left caret-indigo-600 dark:caret-indigo-200"
                                                placeholder="추가 금액"
                                            />
                                            <div className="flex rounded-lg overflow-hidden border border-indigo-600 dark:border-indigo-500 shrink-0 self-stretch sm:self-auto">
                                                <button
                                                    type="button"
                                                    disabled={isAddingPrepaid || !prepaidDepositInput}
                                                    onClick={async () => {
                                                        const amount = Number(prepaidDepositInput);
                                                        if (!amount || amount <= 0) {
                                                            await showAlert('추가할 금액을 입력해 주세요.');
                                                            return;
                                                        }
                                                        setIsAddingPrepaid(true);
                                                        try {
                                                            await db.addClientPrepaidDeposit(
                                                                editingId,
                                                                amount,
                                                                currentUser?.id,
                                                                '거래처 관리에서 선불 추가'
                                                            );
                                                            setPrepaidDepositInput('');
                                                            loadClients();
                                                            const updated = db.getClients().find((c) => c.id === editingId);
                                                            if (updated) {
                                                                setFormData((prev) => ({
                                                                    ...prev,
                                                                    prepaidBalance: updated.prepaidBalance,
                                                                    prepaidLedger: updated.prepaidLedger,
                                                                }));
                                                            }
                                                        } catch (error) {
                                                            showAlert(getErrorMessage(error));
                                                        } finally {
                                                            setIsAddingPrepaid(false);
                                                        }
                                                    }}
                                                    className="flex-1 min-w-[4.5rem] px-3 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-50 border-r border-indigo-500/80"
                                                >
                                                    {isAddingPrepaid ? '추가…' : '선불 추가'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPrepaidHistoryModal(true)}
                                                    className="flex-1 min-w-[4.5rem] px-3 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold flex items-center justify-center gap-1"
                                                >
                                                    <History size={13} />
                                                    이력
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <p className="sm:col-span-2 text-[11px] text-slate-400 dark:text-slate-500">
                                            신규 거래처는 저장한 뒤 선불을 추가할 수 있습니다.
                                        </p>
                                    )}
                                </div>
                                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                    잔액은 직접 수정하지 않습니다. 추가 입금은 옆 입력란을 사용하고, 이력은 「이력」 버튼에서 확인하세요.
                                </p>
                            </div>
                            <div className="md:col-span-2 space-y-1">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400">메모/특이사항</label>
                                <input 
                                    value={formData.note || ''}
                                    onChange={e => setFormData({...formData, note: e.target.value})}
                                    className={inputClass}
                                    placeholder="결제일, 배송 주의사항 등"
                                />
                            </div>
                        </div>
                    </div>

                    {/* SMS / Notification Settings */}
                    <div className="space-y-4 mb-8 bg-slate-50 dark:bg-slate-900/10 p-4 rounded-xl border border-slate-200 dark:border-slate-700 transition-all">
                        <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 border-b dark:border-slate-700 pb-2 mb-3 flex items-center gap-2">
                            <Smartphone className="text-blue-500" size={16} /> 알림 및 문자 발송 설정
                        </h4>
                        
                        <div className="flex items-center justify-between">
                            <div>
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">완료 알림 문자 수신 여부</span>
                                <span className="text-[11px] text-slate-400 dark:text-slate-500">작업 완료 시 이 거래처에 알림 문자를 발송합니다.</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={formData.sendSmsOnComplete !== false} 
                                    onChange={(e) => setFormData(prev => ({ ...prev, sendSmsOnComplete: e.target.checked }))}
                                    className="sr-only peer" 
                                />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
                            </label>
                        </div>

                        {formData.sendSmsOnComplete !== false && (
                            <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-700 animate-in fade-in duration-200">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">알림 수신 번호 설정</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-400">수신처 분류</label>
                                        <select 
                                            value={smsReceiveMode}
                                            onChange={(e) => handleSmsReceiveModeChange(e.target.value as SmsReceiveMode)}
                                            className={smallInputClass}
                                        >
                                            <option value="mobile">휴대폰 우선 (권장)</option>
                                            <option value="primary">첫 번째 담당자 번호</option>
                                            {formData.contacts && formData.contacts.length > 0 && (
                                                <option value="contact">등록된 담당자 중 선택</option>
                                            )}
                                            <option value="custom">별도 연락처 직접 입력</option>
                                        </select>
                                    </div>

                                    {smsReceiveMode === 'mobile' && (
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400">자동 선택된 휴대폰</label>
                                            <div className={`${smallInputClass} bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300`}>
                                                {getPreferredSmsNumber(formData) || '휴대폰 번호를 담당자 연락처에 입력해 주세요.'}
                                            </div>
                                        </div>
                                    )}

                                    {/* 담당자 중 선택하는 경우 */}
                                    {smsReceiveMode === 'contact' && formData.contacts && formData.contacts.length > 0 && (
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400">수신할 담당자 선택</label>
                                            <select 
                                                value={formData.customSmsNumber}
                                                onChange={(e) => setFormData(prev => ({ ...prev, customSmsNumber: e.target.value }))}
                                                className={smallInputClass}
                                            >
                                                {formData.contacts.map((c, i) => (
                                                    <option key={i} value={c.phone} disabled={!c.phone}>
                                                        {c.name || `담당자 ${i+1}`} ({c.phone || '번호 없음'}) {c.department ? ` - ${c.department}` : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {/* 직접 입력하는 경우 */}
                                    {smsReceiveMode === 'custom' && (
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400">수신 번호 입력</label>
                                            <input 
                                                type="text" 
                                                value={formData.customSmsNumber} 
                                                onChange={(e) => setFormData(prev => ({ ...prev, customSmsNumber: formatPhoneNumber(e.target.value) }))}
                                                placeholder="010-XXXX-XXXX"
                                                className={smallInputClass}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Contact Persons */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center border-b dark:border-slate-700 pb-2 mb-4">
                            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">담당자 연락처 관리</h4>
                            <button 
                                type="button"
                                onClick={handleAddContactRow}
                                className="text-xs bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 px-2 py-1 rounded flex items-center gap-1 font-bold transition-colors"
                                title="연락처 추가"
                            >
                                <Plus size={14} /> 담당자 추가
                            </button>
                        </div>

                        <div className="space-y-3">
                            {formData.contacts?.map((contact, idx) => (
                                <div key={idx} className="flex flex-wrap md:flex-nowrap gap-2 items-center bg-slate-50 dark:bg-slate-700/50 p-2 rounded-lg border border-slate-200 dark:border-slate-600">
                                    <div className="w-8 h-8 rounded-full bg-white dark:bg-slate-600 flex items-center justify-center text-slate-400 dark:text-slate-300 font-bold border border-slate-200 dark:border-slate-500 text-xs shrink-0">
                                        {idx + 1}
                                    </div>
                                    <div className="flex-1 min-w-[100px]">
                                        <input 
                                            placeholder="부서/직책"
                                            value={contact.department || ''}
                                            onChange={e => handleContactChange(idx, 'department', e.target.value)}
                                            className={smallInputClass}
                                        />
                                    </div>
                                    <div className="flex-[2] min-w-[120px]">
                                        <div className="relative">
                                            <User size={14} className="absolute left-2 top-2.5 text-slate-400" />
                                            <input 
                                                placeholder="이름"
                                                value={contact.name}
                                                onChange={e => handleContactChange(idx, 'name', e.target.value)}
                                                className={`${smallInputClass} pl-7 font-bold`}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex-[2] min-w-[140px]">
                                        <div className="relative">
                                            <Phone size={14} className="absolute left-2 top-2.5 text-slate-400" />
                                            <input 
                                                placeholder="연락처"
                                                value={contact.phone}
                                                onChange={e => handleContactChange(idx, 'phone', e.target.value)}
                                                className={`${smallInputClass} pl-7`}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex-[2] min-w-[140px] hidden md:block">
                                        <div className="relative">
                                            <Mail size={14} className="absolute left-2 top-2.5 text-slate-400" />
                                            <input 
                                                placeholder="이메일"
                                                value={contact.email || ''}
                                                onChange={e => handleContactChange(idx, 'email', e.target.value)}
                                                className={`${smallInputClass} pl-7`}
                                            />
                                        </div>
                                    </div>
                                    <button 
                                        type="button"
                                        onClick={() => handleRemoveContactRow(idx)}
                                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                                        disabled={formData.contacts && formData.contacts.length <= 1}
                                        title="이 담당자 삭제"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </form>

                <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-end gap-3 sticky bottom-0 z-10">
                    <button 
                        onClick={() => { setIsModalOpen(false); setShowPrepaidHistoryModal(false); }}
                        className="px-5 py-2.5 text-slate-600 dark:text-slate-300 font-bold bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 rounded-lg transition-colors"
                    >
                        취소
                    </button>
                    <button 
                        onClick={handleSave}
                        className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-md transition-colors flex items-center gap-2"
                    >
                        <Save size={18} /> 저장하기
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* --- Merge Clients Modal --- */}
      {isMergeModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] transition-colors">
                <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900 sticky top-0 z-10">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            <GitMerge className="text-amber-600 dark:text-amber-400" />
                            거래처 합치기
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            중복 등록된 거래처 2개를 선택하고, 유지할 상호명을 정한 뒤 작업·견적 내역을 함께 합칩니다.
                        </p>
                    </div>
                    <button onClick={() => setIsMergeModalOpen(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                        <X size={24} className="text-slate-500 dark:text-slate-400" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">1. 합칠 거래처 2개 선택</h4>
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                                {mergePickIds.length}/2 선택
                            </span>
                        </div>

                        {mergeSelectedClients.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-3">
                                {mergeSelectedClients.map((client) => (
                                    <span
                                        key={client.id}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800"
                                    >
                                        <CheckCircle2 size={14} />
                                        {client.name}
                                        <button
                                            type="button"
                                            onClick={() => toggleMergePick(client.id)}
                                            className="ml-1 p-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded-full"
                                            title="선택 해제"
                                        >
                                            <X size={12} />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}

                        <div className="relative mb-3">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input
                                type="search"
                                value={mergeSearchQuery}
                                onChange={(e) => setMergeSearchQuery(e.target.value)}
                                placeholder="합칠 거래처 검색..."
                                className="w-full pl-9 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-amber-500 outline-none"
                            />
                        </div>

                        <div className="max-h-52 overflow-y-auto custom-scrollbar border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-700">
                            {mergeFilteredClients.length === 0 ? (
                                <div className="p-6 text-center text-sm text-slate-400">검색 결과가 없습니다.</div>
                            ) : (
                                mergeFilteredClients.map((client) => {
                                    const isSelected = mergePickIds.includes(client.id);
                                    const jobCount = db.getJobsByClient(client.name).length;
                                    return (
                                        <button
                                            key={client.id}
                                            type="button"
                                            onClick={() => toggleMergePick(client.id)}
                                            className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 transition-colors ${
                                                isSelected
                                                    ? 'bg-amber-50 dark:bg-amber-950/20'
                                                    : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                                            }`}
                                        >
                                            <div className="min-w-0">
                                                <div className="font-bold text-slate-800 dark:text-slate-100 truncate">{client.name}</div>
                                                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                                    {client.contactPerson || '담당자 없음'} · {client.phone || '연락처 없음'}
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">작업 {jobCount}건</div>
                                                {isSelected && (
                                                    <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400 mt-0.5">선택됨</div>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {mergeSelectedClients.length === 2 && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">2. 유지할 거래처명 선택</h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                선택한 상호명이 최종 거래처명이 되며, 다른 거래처의 작업·견적·담당자 정보가 이쪽으로 합쳐집니다.
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {mergeSelectedClients.map((client) => {
                                    const isPrimary = mergePrimaryId === client.id;
                                    const other = mergeSelectedClients.find((c) => c.id !== client.id);
                                    const preview = other ? getClientMergePreview(
                                        isPrimary ? client : other,
                                        isPrimary ? other : client
                                    ) : null;
                                    const ownJobs = preview
                                        ? (isPrimary ? preview.primaryJobs : preview.secondaryJobs)
                                        : db.getJobsByClient(client.name).length;

                                    return (
                                        <label
                                            key={client.id}
                                            className={`relative flex flex-col p-4 rounded-xl border-2 cursor-pointer transition-all ${
                                                isPrimary
                                                    ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 shadow-sm'
                                                    : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 hover:border-slate-300 dark:hover:border-slate-500'
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="mergePrimary"
                                                checked={isPrimary}
                                                onChange={() => setMergePrimaryId(client.id)}
                                                className="sr-only"
                                            />
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                <span className="font-bold text-slate-800 dark:text-slate-100 text-base leading-snug">{client.name}</span>
                                                {isPrimary && (
                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white shrink-0">유지</span>
                                                )}
                                            </div>
                                            <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                                                <div>작업 {ownJobs}건</div>
                                                {client.businessRegistrationNumber && (
                                                    <div className="font-mono">사업자 {client.businessRegistrationNumber}</div>
                                                )}
                                                <div className="truncate">{client.contactPerson || '-'} · {client.phone || '-'}</div>
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>

                            {mergePreview && mergePrimaryId && (
                                <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/20 p-4">
                                    <div className="text-sm font-bold text-blue-800 dark:text-blue-200 mb-2 flex items-center gap-2 flex-wrap">
                                        <span>{mergePreview.secondaryName}</span>
                                        <ArrowRight size={16} />
                                        <span>{mergePreview.primaryName}</span>
                                        <span className="text-xs font-normal text-blue-600 dark:text-blue-300">(최종 거래처명)</span>
                                    </div>
                                    <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                                        <li>• 작업 {mergePreview.totalJobs}건 통합 ({mergePreview.primaryJobs}건 + {mergePreview.secondaryJobs}건)</li>
                                        <li>• 견적 {mergePreview.totalQuotes}건 통합 ({mergePreview.primaryQuotes}건 + {mergePreview.secondaryQuotes}건)</li>
                                        <li>• 담당자·연락처·주소 등 빈 정보는 서로 보완, 중복 연락처는 제거</li>
                                        <li>• '{mergePreview.secondaryName}' 거래처는 삭제됩니다</li>
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-end gap-3 sticky bottom-0 z-10">
                    <button
                        onClick={() => setIsMergeModalOpen(false)}
                        disabled={isMerging}
                        className="px-5 py-2.5 text-slate-600 dark:text-slate-300 font-bold bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50"
                    >
                        취소
                    </button>
                    <button
                        onClick={handleMergeClients}
                        disabled={isMerging || mergeSelectedClients.length !== 2 || !mergePrimaryId}
                        className="px-6 py-2.5 bg-amber-600 text-white font-bold rounded-lg hover:bg-amber-700 shadow-md transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isMerging ? <Loader2 size={18} className="animate-spin" /> : <GitMerge size={18} />}
                        {isMerging ? '합치는 중...' : '거래처 합치기 실행'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {showPrepaidHistoryModal && editingId && (() => {
        const client = clients.find((c) => c.id === editingId);
        const clientName = client?.name || formData.name || '거래처';
        const balance = normalizePrepaidBalance(client?.prepaidBalance);
        const ledger = [...(client?.prepaidLedger || formData.prepaidLedger || [])].reverse();

        const handleDeletePrepaidEntry = async (row: PrepaidLedgerEntry) => {
          if (!canDeletePrepaidLedgerEntry(row)) {
            await showAlert('작업 연동 차감·복구 내역은 삭제할 수 없습니다. 작업 결제 상태에서 조정해 주세요.');
            return;
          }
          const amountLabel = `${row.amount >= 0 ? '+' : ''}${row.amount.toLocaleString()}원`;
          const confirmed = await showConfirm(
            `이 선불 이력을 삭제하시겠습니까?\n\n` +
              `${formatPrepaidLedgerTime(row.timestamp)} · ${prepaidLedgerSummary(row)}\n` +
              `금액 ${amountLabel}\n\n` +
              `삭제 후 잔액이 자동으로 다시 계산됩니다.`
          );
          if (!confirmed) return;

          setDeletingPrepaidEntryId(row.id);
          try {
            await db.deleteClientPrepaidLedgerEntry(editingId, row.id);
            loadClients();
            const updated = db.getClients().find((c) => c.id === editingId);
            if (updated) {
              setFormData((prev) => ({
                ...prev,
                prepaidBalance: updated.prepaidBalance,
                prepaidLedger: updated.prepaidLedger,
              }));
            }
          } catch (error) {
            await showAlert(getErrorMessage(error));
          } finally {
            setDeletingPrepaidEntryId(null);
          }
        };

        return (
          <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-5xl max-h-[88vh] flex flex-col border border-slate-200 dark:border-slate-700">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <History size={20} className="text-indigo-500" />
                    선불 이력
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">
                    {clientName} · 잔액{' '}
                    <span className="font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                      {balance.toLocaleString()}원
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPrepaidHistoryModal(false)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"
                >
                  <X size={22} className="text-slate-500" />
                </button>
              </div>
              <div className="flex-1 overflow-auto">
                {ledger.length === 0 ? (
                  <p className="text-center text-slate-500 py-16 text-sm">선불 이력이 없습니다.</p>
                ) : (
                  <table className="w-full text-sm table-fixed">
                    <thead className="sticky top-0 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 z-10">
                      <tr>
                        <th className="w-[11rem] px-4 py-3 text-left text-xs font-bold text-slate-500">일시</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500">내역</th>
                        <th className="w-[7.5rem] px-4 py-3 text-right text-xs font-bold text-slate-500">금액</th>
                        <th className="w-[7.5rem] px-4 py-3 text-right text-xs font-bold text-slate-500">잔액</th>
                        <th className="w-[4rem] px-3 py-3 text-center text-xs font-bold text-slate-500">삭제</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.map((row) => {
                        const deletable = canDeletePrepaidLedgerEntry(row);
                        const isDeleting = deletingPrepaidEntryId === row.id;
                        return (
                          <tr
                            key={row.id}
                            className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-900/40"
                          >
                            <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300 tabular-nums">
                              {formatPrepaidLedgerTime(row.timestamp)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap overflow-hidden text-ellipsis text-slate-700 dark:text-slate-200" title={prepaidLedgerSummary(row)}>
                              {prepaidLedgerSummary(row)}
                            </td>
                            <td
                              className={`px-4 py-3 text-right font-mono whitespace-nowrap tabular-nums font-semibold ${
                                row.amount >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {row.amount >= 0 ? '+' : ''}
                              {row.amount.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right font-mono whitespace-nowrap tabular-nums text-slate-700 dark:text-slate-200">
                              {row.balanceAfter.toLocaleString()}
                            </td>
                            <td className="px-3 py-3 text-center">
                              {deletable ? (
                                <button
                                  type="button"
                                  disabled={isDeleting}
                                  onClick={() => void handleDeletePrepaidEntry(row)}
                                  className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-40 transition-colors"
                                  title="이력 삭제 (잔액 재계산)"
                                >
                                  {isDeleting ? (
                                    <Loader2 size={16} className="animate-spin mx-auto" />
                                  ) : (
                                    <Trash2 size={16} className="mx-auto" />
                                  )}
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-300 dark:text-slate-600" title="작업 연동 내역">
                                  —
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-between gap-4">
                <p className="text-xs text-slate-400">
                  입금·조정 내역만 삭제 가능합니다. 작업 차감·복구는 작업 결제에서 조정해 주세요.
                </p>
                <button
                  type="button"
                  onClick={() => setShowPrepaidHistoryModal(false)}
                  className="px-5 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-600 shrink-0"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
