
import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, User, Bell, Users, Volume2, VolumeX, ArrowLeft, Moon, Sun, MessageSquare, AlertTriangle } from 'lucide-react';
import { db } from '../../services/dataService';
import { ChatMessage, Staff } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';

export const ChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [staff, setStaff] = useState<Staff[]>([]);
  const [activeChannel, setActiveChannel] = useState<string | null>(null); // null = Global, 'id' = DM
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  // Notification States
  const [hasUnread, setHasUnread] = useState(false);
  const [unreadSenders, setUnreadSenders] = useState<Set<string>>(new Set()); // New: Track which senders have unread messages
  const [notificationPopup, setNotificationPopup] = useState<ChatMessage | null>(null);
  
  const { currentUser } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Create Audio Element
    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
  }, []);

  useEffect(() => {
    // Initial Load
    setStaff(db.getStaff());
    const initialMsgs = db.getMessages();
    setMessages(initialMsgs);

    // Polling for new messages (simulate real-time)
    const interval = setInterval(() => {
      const latestMsgs = db.getMessages();
      setMessages(prev => {
        // Check for new messages
        if (latestMsgs.length > prev.length) {
          const lastMsg = latestMsgs[latestMsgs.length - 1];
          // If message is NOT from me
          if (lastMsg.senderId !== currentUser?.id) {
            // Determine if the relevant channel is currently open
            // Global open & Global msg OR DM open & DM msg from sender
            const isRelevantChannelOpen = isOpen && (
                (activeChannel === null && !lastMsg.receiverId) || 
                (activeChannel === lastMsg.senderId)
            );

            if (!isRelevantChannelOpen) {
                setHasUnread(true);
                // Trigger Blocking Popup for ALL messages (DM & Global)
                setNotificationPopup(lastMsg);
                
                // Add to Unread Senders Set to blink the list item
                if (lastMsg.senderId) {
                    setUnreadSenders(prev => new Set(prev).add(lastMsg.senderId));
                }
            }
            
            if (soundEnabled) {
               audioRef.current?.play().catch(e => console.log('Audio play failed', e));
            }
          }
        }
        return latestMsgs;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [isOpen, activeChannel, currentUser, soundEnabled]);

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
    if (isOpen && !notificationPopup) {
      setHasUnread(false);
    }
  }, [isOpen, notificationPopup]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, activeChannel, isOpen]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = (isCall: boolean = false) => {
    if ((!newMessage.trim() && !isCall) || !currentUser) return;

    const content = isCall ? "🚨 긴급 호출하였습니다! 확인 부탁드립니다." : newMessage;
    
    const msg: ChatMessage = {
      id: Date.now().toString(),
      senderId: currentUser.id,
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

  const getSenderInfo = (senderId: string) => {
    return staff.find(s => s.id === senderId) || { name: '알수없음', avatarUrl: '' };
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  };

  const currentMessages = messages.filter(msg => {
    if (!activeChannel) {
      return !msg.receiverId;
    } else {
      return (msg.senderId === currentUser?.id && msg.receiverId === activeChannel) ||
             (msg.senderId === activeChannel && msg.receiverId === currentUser?.id);
    }
  });

  const handlePopupClick = () => {
      if (notificationPopup) {
          if (notificationPopup.receiverId) {
              setActiveChannel(notificationPopup.senderId);
          } else {
              setActiveChannel(null); 
          }
          
          setIsOpen(true);
          setNotificationPopup(null);
          setHasUnread(false);
      }
  };

  if (!currentUser) return null;

  return (
    // Adjusted position for mobile (higher bottom to clear nav)
    <div className="fixed bottom-20 lg:bottom-6 right-4 lg:right-6 z-50 flex flex-col items-end gap-4 pointer-events-none">
      
      {/* CRITICAL ALERT MODAL */}
      {notificationPopup && !isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 pointer-events-auto animate-in fade-in duration-300">
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border-2 border-blue-500 animate-in zoom-in-95 duration-300 relative">
                  <div className="absolute inset-0 border-4 border-blue-400/30 animate-pulse rounded-2xl pointer-events-none"></div>
                  
                  <div className="bg-blue-600 p-4 text-white flex items-center justify-center gap-2">
                      <Bell size={24} className="animate-[bounce_1s_infinite]" />
                      <h3 className="text-xl font-bold">새 메시지 도착!</h3>
                  </div>

                  <div className="p-8 flex flex-col items-center text-center">
                      <div className="relative mb-4">
                          <img 
                            src={getSenderInfo(notificationPopup.senderId).avatarUrl} 
                            className="w-24 h-24 rounded-full border-4 border-slate-100 dark:border-slate-700 shadow-md object-cover" 
                            alt=""
                          />
                          <div className="absolute bottom-0 right-0 bg-blue-600 text-white p-1.5 rounded-full border-2 border-white dark:border-slate-800">
                              <MessageSquare size={16} />
                          </div>
                      </div>
                      
                      <h4 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-1">
                          {getSenderInfo(notificationPopup.senderId).name}
                      </h4>
                      <p className="text-sm text-blue-600 dark:text-blue-400 font-bold mb-4">
                          {notificationPopup.receiverId ? '1:1 메시지' : '전체 공지 메시지'}
                      </p>

                      <div className="bg-slate-100 dark:bg-slate-700/50 p-4 rounded-xl w-full mb-6 relative">
                          <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-slate-100 dark:bg-slate-700/50 rotate-45"></div>
                          <p className="text-slate-700 dark:text-slate-200 text-lg font-medium break-words leading-relaxed">
                              "{notificationPopup.content}"
                          </p>
                          <p className="text-xs text-slate-400 mt-2 text-right">
                              {formatTime(notificationPopup.timestamp)}
                          </p>
                      </div>

                      <button 
                          onClick={handlePopupClick}
                          className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white text-lg font-bold rounded-xl shadow-lg transition-all hover:scale-[1.02] flex items-center justify-center gap-2"
                      >
                          <MessageCircle size={20} />
                          확인하고 답장하기
                      </button>
                      <p className="text-xs text-slate-400 mt-3 animate-pulse">
                          * 메시지를 확인할 때까지 다른 작업이 제한됩니다.
                      </p>
                  </div>
              </div>
          </div>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="pointer-events-auto bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-[calc(100vw-2rem)] sm:w-[550px] h-[60vh] sm:h-[600px] flex overflow-hidden animate-in slide-in-from-bottom-5 duration-300 flex-col sm:flex-row text-slate-800 dark:text-slate-100">
          
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
              
              {staff.filter(s => s.id !== currentUser.id).map(s => {
                  const hasMessage = unreadSenders.has(s.id);
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
            <div className="flex-1 overflow-y-auto p-4 bg-slate-100 dark:bg-slate-800 space-y-4 custom-scrollbar">
              {currentMessages.length === 0 && (
                <div className="text-center text-slate-400 text-sm mt-10">
                  대화 내용이 없습니다. <br/>메시지를 보내보세요!
                </div>
              )}
              {currentMessages.map((msg, idx) => {
                const isMe = msg.senderId === currentUser.id;
                const sender = getSenderInfo(msg.senderId);
                const isCall = msg.type === 'call';

                return (
                  <div key={msg.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''} ${isCall ? 'justify-center' : ''}`}>
                    {isCall ? (
                      <div className="bg-red-100 border border-red-200 text-red-700 px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 my-2 shadow-sm">
                        <Bell size={14} className="animate-pulse" />
                        {sender.name}님이 호출!
                        <span className="text-[10px] opacity-70 font-normal">{formatTime(msg.timestamp)}</span>
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
                          <div 
                            className={`px-3 py-2 rounded-2xl text-sm shadow-sm break-words
                              ${isMe 
                                ? 'bg-blue-600 text-white rounded-tr-none' 
                                : 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-600 rounded-tl-none'
                              }
                            `}
                          >
                            {msg.content}
                          </div>
                          <span className="text-[10px] text-slate-400 mt-1 px-1">
                            {formatTime(msg.timestamp)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
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
      )}

      {/* Floating Action Buttons */}
      <div className="flex items-center gap-3 pointer-events-auto">
          <button 
            onClick={toggleTheme}
            className={`w-10 h-10 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95 border
              ${isDarkMode 
                ? 'bg-slate-800 border-slate-600 text-yellow-400 hover:bg-slate-700' 
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }
            `}
            title={isDarkMode ? "라이트 모드로 전환" : "다크 모드로 전환"}
          >
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <button 
            onClick={() => setIsOpen(!isOpen)}
            className={`w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 relative
              ${isOpen ? 'bg-slate-700 text-slate-300' : 'bg-blue-600 text-white hover:bg-blue-700'}
              ${!isOpen && hasUnread ? 'animate-[bounce_1s_infinite]' : ''}
            `}
            title={isOpen ? "메신저 닫기" : "사내 메신저 열기"}
          >
            {isOpen ? <X size={28} /> : <MessageCircle size={28} />}
            
            {/* Unread Badge */}
            {!isOpen && hasUnread && (
              <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
            )}
          </button>
      </div>
    </div>
  );
};
