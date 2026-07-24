
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MessageCircle, X, Send, User, Bell, Users, Volume2, VolumeX, ArrowLeft, Moon, Sun, MessageSquare, AlertTriangle, Palette, Trello } from 'lucide-react';
import { db } from '../../services/dataService';
import { ChatMessage, Staff } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import {
  findStaffByAnyId,
  findStaffForUser,
  isSameLoggedInUser,
  staffIdsEqual,
} from '../../utils/staffMatch';

function notifyDesktopChat(msg: ChatMessage, senderName: string) {
  if (typeof window === 'undefined' || !window.electron?.chatNotify) return;
  // 이미 포커스된 전면 창이면 앱 내 팝업으로 충분 (OS 토스트 생략)
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  const preview = (msg.content || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  void window.electron.chatNotify({
    title: `${senderName || '새 메시지'}`,
    body: preview || '(내용 없음)',
    messageId: msg.id,
    senderId: msg.senderId,
    receiverId: msg.receiverId ?? null,
  });
}

function clearDesktopChatAttention() {
  if (typeof window === 'undefined' || !window.electron?.chatNotifyClear) return;
  window.electron.chatNotifyClear();
}

export const ChatWidget: React.FC = () => {
  const [historyReady, setHistoryReady] = useState(() => db.isChatHistoryReady());
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  /** 핫 윈도우보다 오래된 대화 (스크롤 상단 로드) — 폴링에 의해 잘리지 않음 */
  const [olderMessages, setOlderMessages] = useState<ChatMessage[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [staff, setStaff] = useState<Staff[]>([]);
  const [activeChannel, setActiveChannel] = useState<string | null>(null); // null = Global, 'id' = DM
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  // Notification States
  const [hasUnread, setHasUnread] = useState(false);
  const [unreadSenders, setUnreadSenders] = useState<Set<string>>(new Set()); // New: Track which senders have unread messages
  const [notificationPopup, setNotificationPopup] = useState<ChatMessage | null>(null);
  
  const mountTime = useRef(Date.now());
  const { currentUser } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [isTvMode, setIsTvMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ezprint_tv_mode') === 'true';
    }
    return false;
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const staffRef = useRef<Staff[]>([]);
  const isOpenRef = useRef(isOpen);
  const activeChannelRef = useRef(activeChannel);
  const soundEnabledRef = useRef(soundEnabled);
  const isTvModeRef = useRef(isTvMode);
  const lastSyncedReadIdRef = useRef<string | null>(null);
  const lastStaffPollAtRef = useRef(0);
  const myStaff = useMemo(() => findStaffForUser(staff, currentUser), [staff, currentUser]);

  useEffect(() => {
    staffRef.current = staff;
  }, [staff]);
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);
  useEffect(() => {
    activeChannelRef.current = activeChannel;
  }, [activeChannel]);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);
  useEffect(() => {
    isTvModeRef.current = isTvMode;
  }, [isTvMode]);

  useEffect(() => {
    const handleTvModeChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      setIsTvMode(customEvent.detail.isTvMode);
    };
    window.addEventListener('ezprint-tv-mode-change', handleTvModeChange);
    return () => window.removeEventListener('ezprint-tv-mode-change', handleTvModeChange);
  }, []);

  // 모니터링 모드: 사내 채팅·알림 완전 숨김
  useEffect(() => {
    if (!isTvMode) return;
    setIsOpen(false);
    setNotificationPopup(null);
    setHasUnread(false);
    clearDesktopChatAttention();
  }, [isTvMode]);

  useEffect(() => {
    // Create Audio Element
    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
  }, []);

  // OS 토스트 클릭 → 창 복원 후 해당 채팅 열기
  useEffect(() => {
    if (!window.electron?.onChatNotificationClicked) return;
    return window.electron.onChatNotificationClicked((payload) => {
      const staffNow = staffRef.current;
      if (payload?.receiverId && payload.senderId) {
        const senderStaff = findStaffByAnyId(staffNow, payload.senderId);
        setActiveChannel(senderStaff?.id || payload.senderId);
      } else {
        setActiveChannel(null);
      }
      setIsOpen(true);
      setNotificationPopup(null);
      setHasUnread(false);
      clearDesktopChatAttention();
    });
  }, []);



  useEffect(() => {
    db.setChatRealtimeBoost(isOpen);
    return () => {
      db.setChatRealtimeBoost(false);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!currentUser) return;

    let cancelled = false;
    // 시작 시 히스토리 1회 로드 (시간 걸려도 OK) → 이후 실시간
    void db.ensureMessagesSync().then(() => {
      if (cancelled) return;
      setHistoryReady(true);
      setStaff(db.getStaff());
      setMessages(db.getMessages());
    });

    const unsub = db.subscribe(() => {
      if (db.isChatHistoryReady()) setHistoryReady(true);
    });

    // 마운트/로그인 시에만 — 직원(채널) 선택마다 전체 재로드하지 않음
    setStaff(db.getStaff());
    setMessages(db.getMessages());
    setHistoryReady(db.isChatHistoryReady());

    // Check if there are any unread messages from history upon mount
    const initialMsgs = db.getMessages();
    if (initialMsgs.length > 0) {
      const staffNow = db.getStaff();
      const myReceivedMsgs = initialMsgs.filter(
        (m) =>
          !isSameLoggedInUser(currentUser, m.senderId, staffNow) &&
          (!m.receiverId || isSameLoggedInUser(currentUser, m.receiverId, staffNow))
      );
      if (myReceivedMsgs.length > 0) {
        const lastMsg = myReceivedMsgs[myReceivedMsgs.length - 1];
        const currentStaff = findStaffForUser(staffNow, currentUser);
        const dbLastReadId = currentStaff?.lastReadMsgId;
        const lastConfirmedId = localStorage.getItem(`ezpw_last_confirmed_msg_id_${currentUser.id}`);
        
        if (lastMsg.id !== lastConfirmedId && lastMsg.id !== dbLastReadId) {
          if (localStorage.getItem('ezprint_tv_mode') === 'true') {
            // skip
          } else {
          setHasUnread(true);
          setNotificationPopup(lastMsg);
          const sender = findStaffByAnyId(staffNow, lastMsg.senderId);
          notifyDesktopChat(lastMsg, sender?.name || lastMsg.senderName || '새 메시지');
          
          setTimeout(() => {
            audioRef.current?.play().catch(e => console.log('Initial audio play bypassed by browser policy', e));
          }, 1000);
          }
        }
      }
    }

    // 메모리 반영은 빠르게 (NAS 폴링은 dataService 채팅 전용 타이머)
    const interval = setInterval(() => {
      const latestMsgs = db.getMessages();
      const isOpenNow = isOpenRef.current;
      const activeChannelNow = activeChannelRef.current;
      const isTvModeNow = isTvModeRef.current;
      const soundEnabledNow = soundEnabledRef.current;

      // staff는 2초에 한 번만 (매 tick setStaff → 리렌더 폭주 방지)
      if (Date.now() - lastStaffPollAtRef.current > 2000) {
        lastStaffPollAtRef.current = Date.now();
        setStaff(db.getStaff());
      }

      setMessages(prev => {
        const prevIds = new Set(prev.map(m => m.id));
        const newMsgs = latestMsgs.filter(msg => !prevIds.has(msg.id));
        
        if (newMsgs.length > 0) {
          const staffNow = db.getStaff();
          const myNewReceivedMsgs = newMsgs.filter(
            (m) =>
              !isSameLoggedInUser(currentUser, m.senderId, staffNow) &&
              (!m.receiverId || isSameLoggedInUser(currentUser, m.receiverId, staffNow))
          );
          
          if (myNewReceivedMsgs.length > 0) {
            const lastMsg = myNewReceivedMsgs[myNewReceivedMsgs.length - 1];
            const currentStaff = findStaffForUser(staffNow, currentUser);
            const dbLastReadId = currentStaff?.lastReadMsgId;
            const localLastReadId = localStorage.getItem(`ezpw_last_confirmed_msg_id_${currentUser.id}`);
            const isAlreadyRead = (lastMsg.id === dbLastReadId) || (lastMsg.id === localLastReadId);

            if (!isAlreadyRead) {
                if (isTvModeNow) {
                  // skip
                } else {
                const isRelevantChannelOpen = isOpenNow && (
                    (activeChannelNow === null && !lastMsg.receiverId) || 
                    (activeChannelNow !== null && staffIdsEqual(activeChannelNow, lastMsg.senderId, staffNow))
                );

                if (!isRelevantChannelOpen) {
                     setHasUnread(true);
                     setNotificationPopup(lastMsg);
                     const senderStaff = lastMsg.senderId
                       ? findStaffByAnyId(staffNow, lastMsg.senderId)
                       : undefined;
                     notifyDesktopChat(
                       lastMsg,
                       senderStaff?.name || lastMsg.senderName || '새 메시지'
                     );
                     
                     if (lastMsg.senderId) {
                          setUnreadSenders(prevSet => new Set(prevSet).add(senderStaff?.id || lastMsg.senderId));
                     }
                }
                
                if (soundEnabledNow) {
                   audioRef.current?.play().catch(e => console.log('Audio play failed', e));
                }
                }
            }
          }
        }
        if (
          prev.length === latestMsgs.length &&
          (prev.length === 0 || prev[prev.length - 1]?.id === latestMsgs[latestMsgs.length - 1]?.id)
        ) {
          return prev;
        }
        return latestMsgs;
      });
    }, 250);

    return () => {
      cancelled = true;
      unsub();
      clearInterval(interval);
    };
  }, [currentUser]);

  // When changing channel, remove that user from unread set
  useEffect(() => {
      if (activeChannel) {
          setUnreadSenders(prev => {
              const newSet = new Set(prev);
              newSet.delete(activeChannel);
              return newSet;
          });
      }
  }, [activeChannel]);

  useEffect(() => {
    if (isOpen && currentUser && messages.length > 0) {
      const myReceivedMsgs = messages.filter(
        (m) =>
          !isSameLoggedInUser(currentUser, m.senderId, staff) &&
          (!m.receiverId || isSameLoggedInUser(currentUser, m.receiverId, staff))
      );
      if (myReceivedMsgs.length > 0) {
        const lastMsg = myReceivedMsgs[myReceivedMsgs.length - 1];
        // 같은 메시지에 대해 Firestore lastRead 반복 쓰기 방지
        if (lastSyncedReadIdRef.current === lastMsg.id) {
          setHasUnread(false);
          setNotificationPopup(null);
          clearDesktopChatAttention();
          return;
        }
        lastSyncedReadIdRef.current = lastMsg.id;
        localStorage.setItem(`ezpw_last_confirmed_msg_id_${currentUser.id}`, lastMsg.id);
        
        const staffDocId = findStaffForUser(staff, currentUser)?.id;
        if (staffDocId) {
          db.updateStaffLastReadMsgId(staffDocId, lastMsg.id).catch(e => {
              console.error("Failed to sync lastReadMsgId to Firestore:", e);
          });
        }
      }
      setHasUnread(false);
      setNotificationPopup(null);
      clearDesktopChatAttention();
    }
  }, [isOpen, messages, currentUser, staff]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, activeChannel, isOpen]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = (isCall: boolean = false) => {
    if ((!newMessage.trim() && !isCall) || !currentUser) return;

    const content = isCall ? "🚨 긴급 호출하였습니다! 확인 부탁드립니다." : newMessage;
    const senderName =
      myStaff?.name || currentUser.name || currentUser.displayName || '';
    
    const msg: ChatMessage = {
      id: Date.now().toString(),
      senderId: currentUser.id,
      senderName: senderName || undefined,
      receiverId: activeChannel || undefined, // undefined for global
      content: content,
      timestamp: new Date().toISOString(),
      type: isCall ? 'call' : 'text'
    };

    db.addMessage(msg);
    setMessages(prev => [...prev, msg]); // Optimistic update
    if (!isCall) setNewMessage('');
    scrollToBottom();
  };

  const getSenderInfo = (senderId: string, fallbackName?: string) => {
    const found = findStaffByAnyId(staff, senderId);
    if (found) {
      return { name: found.name, avatarUrl: found.avatarUrl || '' };
    }
    if (isSameLoggedInUser(currentUser, senderId, staff)) {
      return {
        name: currentUser?.name || currentUser?.displayName || fallbackName || '나',
        avatarUrl: currentUser?.avatarUrl || currentUser?.photoURL || '',
      };
    }
    if (fallbackName?.trim()) {
      return { name: fallbackName.trim(), avatarUrl: '' };
    }
    return { name: '알수없음', avatarUrl: '' };
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  };

  const isSameDay = (d1Str: string, d2Str: string) => {
    const d1 = new Date(d1Str);
    const d2 = new Date(d2Str);
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  };

  const formatDateHeader = (isoString: string) => {
    const date = new Date(isoString);
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
    return date.toLocaleDateString('ko-KR', options);
  };

  // 특정 메시지의 안 읽은 인원 수(unread count) 계산 함수
  const getUnreadCount = (msg: ChatMessage) => {
    if (!isSameLoggedInUser(currentUser, msg.senderId, staff)) return 0;
    
    const msgTime = new Date(msg.timestamp).getTime();
    const allForRead = [...olderMessages, ...messages];

    if (msg.receiverId) {
      // 1:1 DM 방인 경우: 상대방 한 명이 읽었는지 판별
      const otherStaff = findStaffByAnyId(staff, msg.receiverId);
      if (!otherStaff) return 0;
      
      if (!otherStaff.lastReadMsgId) return 1; // 한 번도 대화방을 켜지 않음 -> 안읽음(1)
      
      const otherLastReadMsg = allForRead.find(m => m.id === otherStaff.lastReadMsgId);
      if (!otherLastReadMsg) return 1;
      
      const otherLastReadTime = new Date(otherLastReadMsg.timestamp).getTime();
      return msgTime > otherLastReadTime ? 1 : 0;
    } else {
      // 전체 공지방인 경우: 나를 제외한 전체 사원 중에서 안 읽은 인원수 카운트 (카톡 단톡방 숫자 스타일)
      const activeStaffMembers = staff.filter(
        (s) => s.active && !s.isDeleted && !isSameLoggedInUser(currentUser, s.id, staff)
      );
      let unreadCount = 0;
      
      activeStaffMembers.forEach(s => {
        if (!s.lastReadMsgId) {
          unreadCount++;
          return;
        }
        const staffLastReadMsg = allForRead.find(m => m.id === s.lastReadMsgId);
        if (!staffLastReadMsg) {
          unreadCount++;
          return;
        }
        const staffLastReadTime = new Date(staffLastReadMsg.timestamp).getTime();
        if (msgTime > staffLastReadTime) {
          unreadCount++;
        }
      });
      
      return unreadCount;
    }
  };

  const currentMessages = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const m of olderMessages) {
      if (m?.id) map.set(m.id, m);
    }
    for (const m of messages) {
      if (m?.id) map.set(m.id, m);
    }
    const merged = Array.from(map.values()).sort(
      (a, b) => Date.parse(a.timestamp || '') - Date.parse(b.timestamp || '')
    );
    return merged.filter((msg) => {
      if (!activeChannel) {
        return !msg.receiverId;
      }
      const iSent =
        isSameLoggedInUser(currentUser, msg.senderId, staff) &&
        staffIdsEqual(msg.receiverId, activeChannel, staff);
      const theySent =
        staffIdsEqual(msg.senderId, activeChannel, staff) &&
        isSameLoggedInUser(currentUser, msg.receiverId, staff);
      return iSent || theySent;
    });
  }, [olderMessages, messages, activeChannel, currentUser, staff]);

  const handleLoadOlder = async () => {
    if (loadingOlder || !hasMoreOlder) return;
    const oldest = currentMessages[0] || messages[0] || olderMessages[0];
    if (!oldest?.timestamp) {
      setHasMoreOlder(false);
      return;
    }
    setLoadingOlder(true);
    const scrollEl = messagesScrollRef.current;
    const prevHeight = scrollEl?.scrollHeight ?? 0;
    try {
      const result = await db.loadOlderChatMessages({
        beforeTimestamp: oldest.timestamp,
        excludeIds: [...olderMessages, ...messages].map((m) => m.id).filter(Boolean),
      });
      setHasMoreOlder(result.hasMore);
      if (result.messages.length > 0) {
        setOlderMessages((prev) => {
          const map = new Map<string, ChatMessage>();
          for (const m of result.messages) {
            if (m?.id) map.set(m.id, m);
          }
          for (const m of prev) {
            if (m?.id) map.set(m.id, m);
          }
          return Array.from(map.values()).sort(
            (a, b) => Date.parse(a.timestamp || '') - Date.parse(b.timestamp || '')
          );
        });
        requestAnimationFrame(() => {
          if (scrollEl) {
            scrollEl.scrollTop = scrollEl.scrollHeight - prevHeight;
          }
        });
      }
    } catch (e) {
      console.warn('[ChatWidget] load older failed:', e);
    } finally {
      setLoadingOlder(false);
    }
  };

  const handlePopupClick = () => {
      if (notificationPopup) {
          if (notificationPopup.receiverId) {
              const senderStaff = findStaffByAnyId(staff, notificationPopup.senderId);
              setActiveChannel(senderStaff?.id || notificationPopup.senderId);
          } else {
              setActiveChannel(null); 
          }
          
          setIsOpen(true);
          if (currentUser) {
              localStorage.setItem(`ezpw_last_confirmed_msg_id_${currentUser.id}`, notificationPopup.id);
              // 파이어베이스에도 실시간 동기화 업데이트! (staff 문서 id)
              const staffDocId = findStaffForUser(staff, currentUser)?.id;
              if (staffDocId) {
                db.updateStaffLastReadMsgId(staffDocId, notificationPopup.id).catch(e => {
                    console.error("Failed to sync lastReadMsgId to Firestore on popup click:", e);
                });
              }
          }
          setNotificationPopup(null);
          setHasUnread(false);
          clearDesktopChatAttention();
      }
  };

  if (!currentUser) return null;
  // 모니터링(TV) 모드에서는 사내 채팅·팝업·플로팅 버튼 전부 숨김
  if (isTvMode) return null;

  // notificationPopup이 떠 있을 때는 화면 전체를 덮어야 하므로 z-index를 최고 수준(z-[9999])으로 높이고, 
  // 평소에는 z-50을 유지합니다.
  const containerZIndex = notificationPopup ? 'z-[9999]' : 'z-50';

  return (
    // Adjusted position for mobile (higher bottom to clear nav)
    <div className={`fixed bottom-20 lg:bottom-6 right-4 lg:right-6 ${containerZIndex} flex flex-col items-end gap-4 pointer-events-none`}>
      
      {/* CRITICAL ALERT MODAL — 크게·눈에 띄게 */}
      {notificationPopup && !isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 pointer-events-auto animate-in fade-in duration-300">
              <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden border-4 border-blue-500 animate-in zoom-in-95 duration-300 relative ring-8 ring-blue-500/40">
                  <div className="absolute inset-0 border-4 border-blue-300/40 animate-pulse rounded-3xl pointer-events-none"></div>
                  
                  <div className="bg-blue-600 p-5 sm:p-6 text-white flex items-center justify-center gap-3">
                      <Bell size={32} className="animate-[bounce_1s_infinite] shrink-0" />
                      <h3 className="text-2xl sm:text-3xl font-black tracking-tight">새 메시지 도착!</h3>
                  </div>

                  <div className="p-8 sm:p-10 flex flex-col items-center text-center">
                      <div className="relative mb-5">
                          <img 
                            src={getSenderInfo(notificationPopup.senderId, notificationPopup.senderName).avatarUrl} 
                            className="w-28 h-28 sm:w-32 sm:h-32 rounded-full border-4 border-blue-200 dark:border-blue-800 shadow-lg object-cover" 
                            alt=""
                          />
                          <div className="absolute bottom-0 right-0 bg-blue-600 text-white p-2 rounded-full border-2 border-white dark:border-slate-800 shadow">
                              <MessageSquare size={20} />
                          </div>
                      </div>
                      
                      <h4 className="text-3xl font-black text-slate-800 dark:text-slate-100 mb-1">
                          {getSenderInfo(notificationPopup.senderId, notificationPopup.senderName).name}
                      </h4>
                      <p className="text-base text-blue-600 dark:text-blue-400 font-bold mb-5">
                          {notificationPopup.receiverId ? '1:1 메시지' : '전체 공지 메시지'}
                      </p>

                      <div className="bg-slate-100 dark:bg-slate-700/50 p-5 sm:p-6 rounded-2xl w-full mb-7 relative border border-slate-200 dark:border-slate-600">
                          <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-slate-100 dark:bg-slate-700/50 rotate-45 border-l border-t border-slate-200 dark:border-slate-600"></div>
                          <p className="text-slate-800 dark:text-slate-100 text-xl sm:text-2xl font-semibold break-words leading-relaxed">
                              "{notificationPopup.content}"
                          </p>
                          <p className="text-sm text-slate-400 mt-3 text-right">
                              {formatTime(notificationPopup.timestamp)}
                          </p>
                      </div>

                      <button 
                          onClick={handlePopupClick}
                          className="w-full py-5 bg-blue-600 hover:bg-blue-700 text-white text-xl font-black rounded-2xl shadow-xl transition-all hover:scale-[1.02] flex items-center justify-center gap-2"
                      >
                          <MessageCircle size={24} />
                          확인하고 답장하기
                      </button>
                      <p className="text-sm text-slate-400 mt-4 animate-pulse font-medium">
                          * 메시지를 확인할 때까지 다른 작업이 제한됩니다.
                      </p>
                  </div>
              </div>
          </div>
      )}

      {/* Chat Window */}
      {isOpen && !isTvMode && (
        <div className="pointer-events-auto bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-[calc(100vw-2rem)] sm:w-[550px] h-[60vh] sm:h-[600px] flex overflow-hidden animate-in slide-in-from-bottom-5 duration-300 flex-col text-slate-800 dark:text-slate-100">
          {!historyReady && (
            <div className="shrink-0 px-3 py-1.5 text-[11px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-b border-amber-200/60 dark:border-amber-800/50">
              최근 대화를 불러오는 중… 불러온 뒤부터 실시간으로 주고받습니다.
            </div>
          )}
          <div className="flex-1 min-h-0 flex flex-col sm:flex-row overflow-hidden">
          
          {/* Sidebar (Staff List) */}
          <div className={`
             ${activeChannel && window.innerWidth < 640 ? 'hidden' : 'flex'} 
             w-full sm:w-48 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 flex-col sm:flex
          `}>
            <div className="p-4 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-200 flex justify-between items-center shrink-0">
               <span>대화 상대</span>
               <button 
                 onClick={() => setSoundEnabled(!soundEnabled)} 
                 className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                 title={soundEnabled ? "알림음 끄기" : "알림음 켜기"}
               >
                 {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
               </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              <button 
                onClick={() => setActiveChannel(null)}
                className={`w-full p-2 rounded-lg flex items-center gap-2 text-sm transition-colors
                  ${activeChannel === null ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200' : 'hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'}
                `}
                title="전체 공지방으로 이동"
              >
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white shrink-0">
                  <Users size={16} />
                </div>
                <div className="flex-1 text-left font-bold truncate">전체 공지방</div>
              </button>

              <div className="text-xs font-bold text-slate-400 px-2 mt-4 mb-2">직원 목록</div>
              
              {staff.filter(s => !s.isDeleted && s.active && !isSameLoggedInUser(currentUser, s.id, staff)).map(s => {
                  const hasMessage = unreadSenders.has(s.id) || (s.uid ? unreadSenders.has(s.uid) : false);
                  return (
                      <button 
                        key={s.id}
                        onClick={() => setActiveChannel(s.id)}
                        className={`w-full p-2 rounded-lg flex items-center gap-2 text-sm transition-all relative
                          ${activeChannel === s.id ? 'bg-white dark:bg-slate-700 shadow-sm ring-1 ring-blue-200 dark:ring-slate-600 text-blue-700 dark:text-blue-300' : 'hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'}
                          ${hasMessage ? 'bg-blue-50 dark:bg-blue-900/30 animate-pulse ring-2 ring-red-400 dark:ring-red-500' : ''}
                        `}
                        title={`${s.name}님과 1:1 대화하기`}
                      >
                        <div className="relative shrink-0">
                          <img src={s.avatarUrl} alt={s.name} className={`w-8 h-8 rounded-full border ${s.active ? 'border-emerald-400' : 'border-slate-300 grayscale'}`} />
                          {s.active && <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white"></div>}
                          {hasMessage && <div className="absolute -top-1 -left-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-bounce"></div>}
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <div className={`font-medium truncate ${hasMessage ? 'text-blue-700 dark:text-blue-300 font-bold' : ''}`}>{s.name}</div>
                          <div className="text-[10px] text-slate-400 truncate">{s.role}</div>
                        </div>
                      </button>
                  );
              })}
            </div>
          </div>

          {/* Main Chat Area */}
          <div className={`
            ${!activeChannel && window.innerWidth < 640 ? 'hidden' : 'flex'}
            flex-1 flex-col bg-white dark:bg-slate-800 w-full
          `}>
            {/* Chat Header */}
            <div className="h-14 bg-slate-800 dark:bg-slate-950 text-white flex justify-between items-center px-4 shrink-0 shadow-md">
              <div className="flex items-center gap-3 min-w-0">
                <button 
                  onClick={() => setActiveChannel(null)}
                  className="sm:hidden text-slate-300 hover:text-white mr-1"
                  title="목록으로 돌아가기"
                >
                  <ArrowLeft size={20} />
                </button>

                {activeChannel ? (
                   <>
                     <img src={getSenderInfo(activeChannel).avatarUrl} className="w-8 h-8 rounded-full border-2 border-slate-600 shrink-0" />
                     <div className="min-w-0">
                       <div className="font-bold text-sm leading-tight truncate">{getSenderInfo(activeChannel).name}</div>
                       <div className="text-[10px] text-slate-400 leading-tight truncate">1:1 메시지</div>
                     </div>
                   </>
                ) : (
                   <>
                     <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white border-2 border-slate-600 shrink-0">
                        <Users size={16} />
                     </div>
                     <div className="min-w-0">
                       <div className="font-bold text-sm leading-tight truncate">전체 공지방</div>
                       <div className="text-[10px] text-slate-400 leading-tight truncate">팀 전체 공유</div>
                     </div>
                   </>
                )}
              </div>
              
              <div className="flex items-center gap-2 shrink-0">
                 {activeChannel && (
                   <button 
                     onClick={() => handleSend(true)}
                     className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 transition-colors"
                     title="상대방에게 긴급 호출 알림을 보냅니다"
                   >
                     <Bell size={12} />
                     <span className="hidden sm:inline">호출</span>
                   </button>
                 )}
                 <button 
                   onClick={() => setIsOpen(false)} 
                   className="text-slate-400 hover:text-white p-1 transition-colors"
                   title="대화창 닫기"
                 >
                   <X size={20} />
                 </button>
              </div>
            </div>

            {/* Messages */}
            <div
              ref={messagesScrollRef}
              className="flex-1 overflow-y-auto p-4 bg-slate-100 dark:bg-slate-800 space-y-4 custom-scrollbar"
            >
              {historyReady && hasMoreOlder && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => void handleLoadOlder()}
                    disabled={loadingOlder}
                    className="text-[11px] font-semibold px-3 py-1.5 rounded-full bg-white/90 dark:bg-slate-700/90 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-60 shadow-sm"
                  >
                    {loadingOlder ? '이전 대화 불러오는 중…' : '이전 대화 불러오기'}
                  </button>
                </div>
              )}
              {currentMessages.length === 0 && (
                <div className="text-center text-slate-400 text-sm mt-10">
                  대화 내용이 없습니다. <br/>메시지를 보내보세요!
                </div>
              )}
              {currentMessages.map((msg, idx) => {
                const isMe = isSameLoggedInUser(currentUser, msg.senderId, staff);
                const sender = getSenderInfo(msg.senderId, msg.senderName);
                const isCall = msg.type === 'call';
                
                // 날짜 구분선 출력 조건 판단 (첫 번째 메시지이거나, 이전 메시지와 날짜가 다를 때)
                const showDateHeader = idx === 0 || !isSameDay(currentMessages[idx - 1].timestamp, msg.timestamp);

                return (
                  <React.Fragment key={msg.id}>
                    {/* 날짜 구분선 헤더 */}
                    {showDateHeader && (
                      <div className="flex justify-center my-4">
                        <div className="bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-black px-3 py-1 rounded-full shadow-sm">
                          {formatDateHeader(msg.timestamp)}
                        </div>
                      </div>
                    )}

                    <div className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''} ${isCall ? 'justify-center' : ''}`}>
                      {isCall ? (
                        <div className="bg-red-100 border border-red-200 text-red-700 px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 my-2 shadow-sm">
                          <Bell size={14} className="animate-pulse" />
                          {sender.name}님이 호출!
                          <span className="text-[9px] opacity-70 font-normal">{formatTime(msg.timestamp)}</span>
                        </div>
                      ) : (
                        <>
                          {!isMe && (
                            <div className="w-8 h-8 shrink-0 flex flex-col items-center">
                              <img src={sender.avatarUrl} className="w-8 h-8 rounded-full border border-slate-300 bg-white" />
                            </div>
                          )}

                          <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[75%]`}>
                            {!isMe && (
                              <span className="text-xs text-slate-500 mb-1 ml-1">{sender.name}</span>
                            )}
                            
                            {/* 말풍선과 시간의 가로 배치 (카톡/문자 스타일 + 실시간 안읽은 수 라벨) */}
                            <div className="flex items-end gap-1.5">
                              {/* 나인 경우 읽음 여부(숫자)와 시간은 말풍선 왼쪽에 세로로 배치 */}
                              {isMe && (
                                <div className="flex flex-col items-end select-none">
                                  {getUnreadCount(msg) > 0 && (
                                    <span className="text-[10px] text-yellow-500 font-extrabold leading-none mb-1 animate-pulse">
                                      {getUnreadCount(msg)}
                                    </span>
                                  )}
                                  <span className="text-[9px] text-slate-400/90 font-bold whitespace-nowrap mb-0.5" title={new Date(msg.timestamp).toLocaleString()}>
                                    {formatTime(msg.timestamp)}
                                  </span>
                                </div>
                              )}

                              <div 
                                className={`px-3 py-2 rounded-2xl text-sm shadow-sm break-words max-w-full
                                  ${isMe 
                                    ? 'bg-blue-600 text-white rounded-tr-none' 
                                    : 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-600 rounded-tl-none'
                                  }
                                `}
                              >
                                {msg.content}
                              </div>

                              {/* 상대방인 경우 시간은 말풍선 오른쪽에 */}
                              {!isMe && (
                                <span className="text-[9px] text-slate-400/90 font-bold whitespace-nowrap mb-0.5 select-none" title={new Date(msg.timestamp).toLocaleString()}>
                                  {formatTime(msg.timestamp)}
                                </span>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 flex gap-2 shrink-0">
              <input 
                type="text" 
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend(false)}
                placeholder="메시지 입력..."
                className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white transition-all min-w-0 placeholder-slate-400"
              />
              <button 
                onClick={() => handleSend(false)}
                disabled={!newMessage.trim()}
                className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-transform active:scale-95 shrink-0"
                title="메시지 전송"
              >
                <Send size={18} className="translate-x-0.5" />
              </button>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* Floating Action Buttons */}
      {!isTvMode && (
        <div className="flex items-center gap-3 pointer-events-auto">
            <button 
              onClick={toggleTheme}
              className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95 border
                ${theme === 'dark' 
                  ? 'bg-slate-800 border-slate-700 text-yellow-400 hover:bg-slate-700' 
                  : theme === 'trello'
                    ? 'bg-[#0079bf] border-[#0067a3] text-white hover:bg-[#0067a3]'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }
              `}
              title={
                theme === 'light' 
                  ? "다크 모드로 전환" 
                  : theme === 'dark' 
                    ? "트렐로 모드로 전환" 
                    : "라이트 모드로 전환"
              }
            >
              {theme === 'light' ? <Moon size={20} /> : theme === 'dark' ? <Trello size={20} /> : <Sun size={20} />}
            </button>

            <button 
              onClick={() => setIsOpen(!isOpen)}
              className={`w-[4.5rem] h-[4.5rem] rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 relative
                ${isOpen ? 'bg-slate-700 text-slate-300' : 'bg-blue-600 text-white hover:bg-blue-700'}
                ${!isOpen && hasUnread ? 'animate-[bounce_0.7s_infinite] ring-4 ring-red-400/80 ring-offset-2 ring-offset-transparent' : ''}
              `}
              title={isOpen ? "메신저 닫기" : "사내 메신저 열기"}
            >
              {isOpen ? <X size={34} /> : <MessageCircle size={34} />}
              
              {/* Unread Badge */}
              {!isOpen && hasUnread && (
                <span className="absolute -top-1 -right-1 min-w-[1.5rem] h-6 px-1.5 bg-red-500 text-white text-xs font-black rounded-full border-2 border-white flex items-center justify-center animate-pulse shadow-lg">
                  N
                </span>
              )}
            </button>
        </div>
      )}
    </div>
  );
};
