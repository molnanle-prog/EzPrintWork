
import React, { useState, useEffect, useRef } from 'react';
import { db, formatPhoneNumber, formatBusinessNumber, getErrorMessage } from '../../services/dataService';
import { Client, ClientContact } from '../../types';
import { Plus, Trash2, Building2, Phone, User, Edit2, X, Save, ScanLine, Loader2, Camera, Briefcase, Mail, Hash, Smartphone } from 'lucide-react';
import { createWorker } from 'tesseract.js';
import { useDialog } from '../../contexts/DialogContext';

export const ClientManager: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { showConfirm, showAlert } = useDialog();
  
  // OCR State
  const [isScanning, setIsScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
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
      customSmsNumber: ''
  });

  const loadClients = () => {
      setClients(db.getClients());
  };

  useEffect(() => {
    loadClients();
    const unsubscribe = db.subscribe(loadClients);
    return () => unsubscribe();
  }, []);

  // --- Data Handlers ---

  const handleEdit = (client: Client) => {
      setEditingId(client.id);
      setFormData({
          ...client,
          contacts: client.contacts || [{ name: client.contactPerson, phone: client.phone }],
          sendSmsOnComplete: client.sendSmsOnComplete !== false,
          customSmsNumber: client.customSmsNumber || ''
      });
      setIsModalOpen(true);
  };

  const handleAddNew = () => {
      setEditingId(null);
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
          customSmsNumber: ''
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
        customSmsNumber: formData.customSmsNumber || ''
    };

    try {
        if (editingId) {
            await db.updateClient({ ...clientToSave, id: editingId } as Client);
        } else {
            await db.addClient(clientToSave as Client);
        }
        setIsModalOpen(false);
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
      setFormData({ ...formData, contacts: updated });
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
          <button 
            onClick={handleAddNew}
            title="새로운 거래처를 등록합니다"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 shadow-sm flex items-center gap-2 font-bold transition-colors"
          >
             <Plus size={18} /> 거래처 등록
          </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map(client => (
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
                              {client.sendSmsOnComplete !== false && client.customSmsNumber && (
                                  <span className="text-[10px] bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-900/50 font-medium" title="알림 수신 전용 연락처">
                                      수신: {client.customSmsNumber}
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
                        <button 
                            onClick={() => handleDelete(client.id, client.name)}
                            className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                            title="삭제"
                        >
                            <Trash2 size={16} />
                        </button>
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

      {/* --- Add/Edit Modal --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] transition-colors">
                <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900 sticky top-0 z-10">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <Building2 className="text-blue-600 dark:text-blue-400" />
                        {editingId ? '거래처 정보 수정' : '신규 거래처 등록'}
                    </h2>
                    <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
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
                                <input 
                                    value={formData.address || ''}
                                    onChange={e => setFormData({...formData, address: e.target.value})}
                                    className={inputClass}
                                    placeholder="서울시 강남구..."
                                />
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
                                            value={
                                                !formData.customSmsNumber 
                                                    ? 'primary' 
                                                    : formData.contacts?.some(c => c.phone === formData.customSmsNumber) 
                                                        ? 'contact' 
                                                        : 'custom'
                                            }
                                            onChange={(e) => {
                                                const type = e.target.value;
                                                if (type === 'primary') {
                                                    setFormData(prev => ({ ...prev, customSmsNumber: '' }));
                                                } else if (type === 'contact') {
                                                    const firstWithPhone = formData.contacts?.find(c => c.phone) || { phone: '' };
                                                    setFormData(prev => ({ ...prev, customSmsNumber: firstWithPhone.phone }));
                                                } else {
                                                    setFormData(prev => ({ ...prev, customSmsNumber: '010-' }));
                                                }
                                            }}
                                            className={smallInputClass}
                                        >
                                            <option value="primary">기본 대표 번호 (첫 번째 담당자)</option>
                                            {formData.contacts && formData.contacts.length > 0 && (
                                                <option value="contact">등록된 담당자 중 선택</option>
                                            )}
                                            <option value="custom">별도 연락처 직접 입력</option>
                                        </select>
                                    </div>

                                    {/* 담당자 중 선택하는 경우 */}
                                    {(formData.sendSmsOnComplete as boolean | undefined) !== false && formData.contacts && formData.contacts.length > 0 && 
                                     formData.customSmsNumber && 
                                     formData.contacts.some(c => c.phone === formData.customSmsNumber) && (
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
                                    {(formData.sendSmsOnComplete as boolean | undefined) !== false && 
                                     formData.customSmsNumber !== undefined && 
                                     formData.customSmsNumber !== '' && 
                                     (!formData.contacts || !formData.contacts.some(c => c.phone === formData.customSmsNumber)) && (
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
                        onClick={() => setIsModalOpen(false)}
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
    </div>
  );
};
