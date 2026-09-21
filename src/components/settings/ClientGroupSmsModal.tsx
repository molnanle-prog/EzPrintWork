import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Battery, Check, Copy, FolderPlus, Mail, MessageSquare, Search, Send, Wifi, X, Loader2 } from 'lucide-react';
import { Client } from '../../types';
import { db } from '../../services/dataService';
import { collectMobileRecipients } from '../../utils/clientSms';
import { sendPlainSms } from '../../services/smsService';
import { toast } from 'sonner';

function getByteLength(s: string) {
  let b = 0;
  for (let i = 0; i < s.length; i++) {
    b += s.charCodeAt(i) >> 7 ? 2 : 1;
  }
  return b;
}

const DEFAULT_TEMPLATES = [
  { label: '안내', content: '[안내] 안녕하세요. {회사명}입니다.' },
  { label: '완료', content: '[완료] {회사명}입니다. 작업이 완료되었습니다. 방문/퀵 수령 가능합니다.' },
  { label: '계좌 안내', content: '[계좌] {계좌정보} 입금 부탁드립니다.' },
];

type SmsClientGroup = {
  id: string;
  name: string;
  clientIds: string[];
};

function groupsKey() {
  return `ezpw_sms_client_groups_${db.getTenantId() || 'local'}`;
}

function loadGroups(): SmsClientGroup[] {
  try {
    const raw = localStorage.getItem(groupsKey());
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((g) => g && typeof g.name === 'string' && Array.isArray(g.clientIds))
      .map((g) => ({
        id: String(g.id || `${Date.now()}`),
        name: String(g.name).trim() || '이름 없는 그룹',
        clientIds: g.clientIds.map((id: unknown) => String(id)),
      }));
  } catch {
    return [];
  }
}

function saveGroups(groups: SmsClientGroup[]) {
  localStorage.setItem(groupsKey(), JSON.stringify(groups));
}

function fillTemplate(content: string) {
  const companyInfo = db.getCompanyInfo();
  return content
    .replace(/{고객명}/g, '고객')
    .replace(/{거래처}/g, '거래처')
    .replace(/{작업명}/g, '')
    .replace(/{주문명}/g, '')
    .replace(/{금액}/g, '')
    .replace(/{회사명}/g, companyInfo.name || 'EzPrintWork')
    .replace(/{연락처}/g, '')
    .replace(/{계좌정보}/g, companyInfo.bankAccount || '계좌번호 미등록')
    .replace(/{계좌번호}/g, companyInfo.bankAccount || '계좌번호 미등록');
}

interface ClientGroupSmsModalProps {
  clients: Client[];
  onClose: () => void;
}

export const ClientGroupSmsModal: React.FC<ClientGroupSmsModalProps> = ({ clients, onClose }) => {
  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [clients]
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState('');
  const [prefix, setPrefix] = useState(() => {
    const saved = localStorage.getItem('pm_msg_prefix');
    if (saved) return saved;
    const companyName = db.getCompanyInfo().name;
    return companyName ? `[${companyName}]` : '[EzPrintWork]';
  });
  const templates = useMemo(() => {
    const saved = localStorage.getItem('pm_msg_templates');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length) return parsed as { label: string; content: string }[];
      } catch {
        /* fallback */
      }
    }
    const billing = db.getSmsConfig()?.billingMessageTemplate;
    if (billing) {
      return DEFAULT_TEMPLATES.map((t) => (t.label === '계좌 안내' ? { ...t, content: billing } : t));
    }
    return DEFAULT_TEMPLATES;
  }, []);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [body, setBody] = useState(fillTemplate(templates[0]?.content || DEFAULT_TEMPLATES[0].content));
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [groups, setGroups] = useState<SmsClientGroup[]>(() => loadGroups());
  const [activeGroupId, setActiveGroupId] = useState('');
  const [groupName, setGroupName] = useState('');
  const [currentTime, setCurrentTime] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const groupNameRef = useRef<HTMLInputElement>(null);

  const filteredClients = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedClients;
    return sortedClients.filter((client) => {
      if (client.name.toLowerCase().includes(q)) return true;
      if (client.contactPerson?.toLowerCase().includes(q)) return true;
      if (client.phone?.includes(q)) return true;
      if (client.contacts?.some((c) => c.name?.toLowerCase().includes(q) || c.phone?.includes(q))) return true;
      return false;
    });
  }, [sortedClients, query]);

  const selectedClients = useMemo(
    () => sortedClients.filter((c) => selectedIds.has(c.id)),
    [sortedClients, selectedIds]
  );
  const recipients = useMemo(() => collectMobileRecipients(selectedClients), [selectedClients]);
  const fullMessage = `${prefix} ${body}`.trim();
  const bytes = getByteLength(fullMessage);
  const isLms = bytes > 90;
  const allOn = sortedClients.length > 0 && sortedClients.every((c) => selectedIds.has(c.id));

  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [body, prefix]);

  const toggleClient = (id: string) => {
    setActiveGroupId('');
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setActiveGroupId('');
    if (allOn) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(sortedClients.map((c) => c.id)));
  };

  const applyGroup = (groupId: string) => {
    setActiveGroupId(groupId);
    const group = groups.find((g) => g.id === groupId);
    if (!group) {
      setSelectedIds(new Set());
      return;
    }
    const allowed = new Set(sortedClients.map((c) => c.id));
    setSelectedIds(new Set(group.clientIds.filter((id) => allowed.has(id))));
  };

  const createGroup = () => {
    const name = groupName.trim();
    if (selectedIds.size === 0) {
      toast.error('그룹으로 묶을 거래처를 먼저 선택해 주세요.');
      return;
    }
    if (!name) {
      toast.error('그룹 이름을 입력해 주세요.');
      groupNameRef.current?.focus();
      return;
    }
    const existing = groups.find((g) => g.name === name);
    const next: SmsClientGroup = {
      id: existing?.id || `g-${Date.now()}`,
      name,
      clientIds: [...selectedIds],
    };
    const updated = [...groups.filter((g) => g.name !== name), next];
    setGroups(updated);
    saveGroups(updated);
    setActiveGroupId(next.id);
    setGroupName('');
    toast.success(`「${name}」 그룹을 만들었습니다. (${selectedIds.size}곳)`);
  };

  const deleteGroup = (groupId: string) => {
    const target = groups.find((g) => g.id === groupId);
    const updated = groups.filter((g) => g.id !== groupId);
    setGroups(updated);
    saveGroups(updated);
    if (activeGroupId === groupId) setActiveGroupId('');
    toast.success(`「${target?.name || '그룹'}」을 지웠습니다.`);
  };

  const applySelectedTemplate = (index: number) => {
    setSelectedIdx(index);
    setBody(fillTemplate(templates[index]?.content || ''));
  };

  const handleCopyForKakao = async () => {
    if (!fullMessage) {
      toast.error('문자 내용을 입력해 주세요.');
      return;
    }
    try {
      await navigator.clipboard.writeText(fullMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('메시지가 복사되었습니다. 카카오톡에 붙여넣기 하세요.');
    } catch {
      toast.error('복사에 실패했습니다.');
    }
  };

  const handleEmail = () => {
    const subject = encodeURIComponent('[안내] 단체 안내입니다.');
    const bodyText = encodeURIComponent(fullMessage);
    window.location.href = `mailto:?subject=${subject}&body=${bodyText}`;
  };

  const handleSend = async () => {
    if (selectedIds.size === 0) {
      toast.error('거래처를 먼저 선택해 주세요.');
      return;
    }
    if (recipients.length === 0) {
      toast.error('선택한 거래처에 휴대폰 번호가 있는 담당자가 없습니다.');
      return;
    }
    if (!fullMessage) {
      toast.error('문자 내용을 입력해 주세요.');
      return;
    }
    const config = db.getSmsConfig();
    if (config.mode === 'api' && (!config.apiKey || !config.senderNumber)) {
      toast.error('문자 API 키 또는 발신번호가 없습니다. [설정 > 문자 설정]을 확인해 주세요.');
      return;
    }

    setSending(true);
    let ok = 0;
    let fail = 0;
    try {
      if (config.mode !== 'api' && recipients.length > 1) {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(fullMessage);
        }
        const joined = recipients.map((r) => r.digits).join(',');
        window.open(`sms:${joined}?body=${encodeURIComponent(fullMessage)}`, '_blank');
        toast.success(`${recipients.length}명 문자창을 열었습니다. 휴대폰에서 보내기를 눌러 주세요.`);
        onClose();
        return;
      }

      for (const row of recipients) {
        const res = await sendPlainSms(row.digits, fullMessage, config);
        if (res.success) ok += 1;
        else fail += 1;
      }
      if (fail === 0) {
        toast.success(`${ok}명에게 문자를 보냈습니다.`);
        onClose();
      } else {
        toast.error(`${ok}명 성공, ${fail}명 실패했습니다.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '문자 발송에 실패했습니다.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/65 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex items-stretch gap-4 w-full max-w-[1080px] h-[min(780px,92vh)]"
        onClick={(e) => e.stopPropagation()}
      >
        <aside className="flex-1 min-w-[280px] max-w-[520px] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
          <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">보낼 거래처</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {selectedIds.size}곳 선택 · 휴대폰 {recipients.length}명
            </p>
          </div>

          <div className="p-3 shrink-0 space-y-2 border-b border-slate-100 dark:border-slate-700">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="거래처·담당자·번호 찾기"
                className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={toggleAll}
                className={`h-8 px-3 rounded-lg text-xs font-bold border ${
                  allOn
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200'
                }`}
              >
                전체
              </button>
              <input
                ref={groupNameRef}
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    createGroup();
                  }
                }}
                placeholder="그룹 이름"
                className="flex-1 h-8 px-2 rounded-lg text-xs border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 outline-none"
              />
              <button
                type="button"
                onClick={createGroup}
                className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700"
                title="지금 고른 거래처로 그룹 만들기"
              >
                <FolderPlus size={13} />
                그룹 만들기
              </button>
            </div>

            <div className="min-h-[36px] max-h-[72px] overflow-y-auto flex flex-wrap gap-1.5 content-start">
              {groups.length === 0 ? (
                <p className="text-[11px] text-slate-400 leading-snug">
                  거래처를 고른 뒤 이름을 넣고 <b>그룹 만들기</b>를 누르면 여기에 생깁니다.
                </p>
              ) : (
                groups.map((g) => (
                  <span
                    key={g.id}
                    className={`inline-flex items-center gap-1 h-7 pl-2 pr-1 rounded-full text-[11px] font-bold border ${
                      activeGroupId === g.id
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <button type="button" onClick={() => applyGroup(g.id)} className="max-w-[140px] truncate">
                      {g.name} ({g.clientIds.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteGroup(g.id)}
                      className="w-5 h-5 rounded-full inline-flex items-center justify-center hover:bg-black/10"
                      title={`${g.name} 지우기`}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredClients.length === 0 ? (
              <p className="text-xs text-slate-400 px-3 py-8 text-center">맞는 거래처가 없습니다.</p>
            ) : (
              filteredClients.map((client) => {
                const on = selectedIds.has(client.id);
                const mobiles = collectMobileRecipients([client]).length;
                return (
                  <label
                    key={client.id}
                    className={`flex items-center gap-2 h-9 px-3 cursor-pointer border-b border-slate-100 dark:border-slate-700/80 ${
                      on ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleClient(client.id)}
                      className="w-4 h-4 shrink-0 accent-emerald-600"
                    />
                    <span className="min-w-0 flex-1 text-sm font-bold text-slate-800 dark:text-slate-100 truncate leading-none">
                      {client.name}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-400 tabular-nums">{mobiles}명</span>
                  </label>
                );
              })
            )}
          </div>
        </aside>

        <div className="bg-slate-900 rounded-[50px] shadow-2xl w-full max-w-[390px] flex flex-col h-full border-[12px] border-slate-800 relative overflow-hidden shrink-0">
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-32 h-6 bg-slate-800 rounded-full z-30 flex items-center justify-center pointer-events-none">
            <div className="w-12 h-1 bg-slate-700 rounded-full mr-2"></div>
            <div className="w-2.5 h-2.5 bg-slate-950 rounded-full border border-slate-800"></div>
          </div>

          <div className="bg-white dark:bg-slate-900 pt-9 pb-2 px-6 flex justify-between items-center text-[10px] font-black text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800 select-none shrink-0 z-20">
            <span>{currentTime}</span>
            <div className="flex items-center gap-1.5">
              <Wifi size={10} />
              <span className="text-[9px] font-extrabold tracking-tighter">LTE</span>
              <Battery size={13} />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 py-3 px-4 flex items-center justify-between border-b border-slate-200/80 dark:border-slate-700 shadow-sm shrink-0 z-20">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-400 to-orange-500 flex items-center justify-center text-white font-black text-sm shadow-md shrink-0">
                단
              </div>
              <div className="min-w-0">
                <h4 className="font-extrabold text-xs text-slate-800 dark:text-slate-100 truncate">단체 문자</h4>
                <p className="text-[9px] text-slate-400 font-mono font-bold mt-0.5 truncate">
                  {recipients.length > 0
                    ? `${recipients[0].phone}${recipients.length > 1 ? ` 외 ${recipients.length - 1}명` : ''}`
                    : '받을 사람 없음'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-700 hover:bg-red-50 dark:hover:bg-red-950/30 text-slate-400 hover:text-red-500 flex items-center justify-center transition-all border border-slate-200/50 dark:border-slate-600 shadow-sm"
            >
              <X size={14} />
            </button>
          </div>

          <div className="bg-slate-100/90 dark:bg-slate-800/90 backdrop-blur-md px-3 py-2 border-b border-slate-200/50 dark:border-slate-700 flex gap-2 items-center shrink-0 z-10 shadow-xs">
            <div className="w-1/4">
              <input
                type="text"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                className="w-full px-1.5 py-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-[10px] font-black text-center text-slate-700 dark:text-slate-200 focus:outline-none"
                placeholder="접두사"
              />
            </div>
            <div className="flex-1">
              <select
                value={selectedIdx}
                onChange={(e) => applySelectedTemplate(Number(e.target.value))}
                className="w-full px-2 py-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-[10px] font-black text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
              >
                {templates.map((tpl, idx) => (
                  <option key={idx} value={idx}>
                    {tpl.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex-1 bg-[#BACEE0] dark:bg-slate-900 overflow-y-auto p-4 space-y-4 flex flex-col min-h-0 relative">
            <div className="flex flex-col space-y-4 flex-1 justify-end min-h-0">
              <div className="flex justify-start items-start gap-2">
                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white shrink-0 shadow-sm border border-slate-600">
                  <MessageSquare size={14} />
                </div>
                <div className="flex flex-col items-start max-w-[70%]">
                  <span className="text-[9px] font-black text-slate-600 dark:text-slate-400 ml-1 mb-0.5">알림 서비스</span>
                  <div className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 p-2.5 rounded-2xl rounded-tl-none text-[11px] leading-relaxed shadow-sm font-medium">
                    왼쪽에서 거래처를 고른 뒤 안내를 보내 주세요.
                    {recipients.length > 0 ? (
                      <>
                        <br />
                        지금은 {recipients.length}명에게 발송됩니다.
                      </>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="text-center py-2 select-none border-t border-dashed border-slate-400/30 mt-2">
                <span className="bg-slate-500/20 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 font-black text-[9px] px-3 py-1 rounded-full">
                  전송 대기중인 메시지 미리보기
                </span>
              </div>

              <div className="flex justify-end items-end gap-1.5">
                <div className="flex flex-col items-end text-[9px] font-bold text-slate-500/90 dark:text-slate-400 select-none mr-0.5">
                  <span className={isLms ? 'text-orange-600 font-extrabold' : 'text-slate-600'}>
                    {isLms ? 'LMS 장문' : 'SMS 단문'}
                  </span>
                  <span>
                    {bytes} / 90 Byte
                  </span>
                </div>
                <div className="flex flex-col items-end max-w-[75%] relative">
                  <div className="bg-[#FEE500] text-slate-900 p-3 rounded-2xl rounded-tr-none text-[11px] leading-relaxed shadow-md break-all whitespace-pre-wrap font-sans font-medium text-left border border-[#e0ca00]">
                    {fullMessage || '보낼 내용을 입력하세요.'}
                  </div>
                  <span className="text-[8px] font-bold text-slate-500/80 mt-1 select-none mr-1">{currentTime}</span>
                </div>
              </div>
              <div ref={chatEndRef} />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 border-t border-slate-200/80 dark:border-slate-700 shrink-0 pb-6">
            <div className="p-3 flex items-end gap-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="보낼 문구 직접 입력 및 편집..."
                rows={2}
                className="flex-1 border border-slate-200 dark:border-slate-600 rounded-xl p-2.5 text-xs outline-none focus:ring-2 focus:ring-amber-500 dark:focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 resize-none leading-normal font-sans shadow-inner max-h-24"
              />
            </div>
            <div className="p-3 bg-white dark:bg-slate-800 flex flex-col gap-2">
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => void handleSend()}
                  className="flex flex-col items-center justify-center gap-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow transition-all active:scale-95 border border-slate-950 disabled:opacity-60"
                >
                  {sending ? <Loader2 size={15} className="text-emerald-400 animate-spin" /> : <Send size={15} className="text-emerald-400" />}
                  <span className="text-[10px] font-black tracking-tight">문자 전송</span>
                </button>
                <button
                  type="button"
                  onClick={handleEmail}
                  className="flex flex-col items-center justify-center gap-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl shadow-sm transition-all active:scale-95 border border-slate-200 dark:border-slate-600"
                >
                  <Mail size={15} className="text-blue-500 dark:text-blue-400" />
                  <span className="text-[10px] font-black tracking-tight">이메일</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyForKakao()}
                  className="flex flex-col items-center justify-center gap-1 py-2.5 bg-[#FEE500] hover:bg-[#FADA0A] text-[#3c1e1e] rounded-xl shadow transition-all active:scale-95 border border-[#e2cc00]"
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  <span className="text-[10px] font-black tracking-tight">{copied ? '복사완료' : '카톡 복사'}</span>
                </button>
              </div>
              <p className="text-[9px] font-bold text-slate-400 text-center select-none mt-1">
                카톡으로 보내려면 [카톡 복사] 후 PC 카톡 대화창에 붙여넣기(Ctrl+V) 하세요.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
