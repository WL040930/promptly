import React, { useState, useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { BotIcon, UserIcon, SendIcon, PlusIcon, MessageSquareIcon } from './Icons';
import { getChatSessions, getChatSession, sendChatMessage, updateChatSession, deleteChatSession } from '../../api/backend.js';
import { useToast } from '../../components/ToastContext.jsx';

const ChatTab = () => {
    const [messages, setMessages] = useState([
        {
            sender: 'bot',
            text: `Hi there! I am your friendly Prompty Assistant. I am here to help you automate your tasks without writing a single line of code!\n\nType a question to get started.`
        }
    ]);
    const [pastChats, setPastChats] = useState([]);
    const [inputText, setInputText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [sidebarSearch, setSidebarSearch] = useState('');
    const [activeChatId, setActiveChatId] = useState(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [editingChatId, setEditingChatId] = useState(null);
    const [editingTitle, setEditingTitle] = useState('');
    const [chatToDelete, setChatToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const toast = useToast();
    const messagesEndRef = useRef(null);
    const container = useRef(null);

    useGSAP(() => {
        gsap.from(container.current, { opacity: 0, y: 15, duration: 0.3, ease: 'power2.out' });
    }, { scope: container });

    const fetchSessions = async () => {
        try {
            const data = await getChatSessions();
            setPastChats(data || []);
        } catch (error) {
            console.error('Failed to fetch chat sessions:', error);
        }
    };

    useEffect(() => {
        fetchSessions();
    }, []);

    const filteredChats = sidebarSearch
        ? pastChats.filter(c => c.title?.toLowerCase().includes(sidebarSearch.toLowerCase()))
        : pastChats;

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]);

    const handleSendMessage = async (text) => {
        if (!text.trim()) return;

        setMessages(prev => [...prev, { sender: 'user', text }]);
        setInputText('');
        setIsTyping(true);

        try {
            const res = await sendChatMessage(activeChatId, text);
            if (res?.reply) {
                setMessages(prev => [...prev, res.reply]);
            }
            if (res?.sessionId && activeChatId !== res.sessionId) {
                setActiveChatId(res.sessionId);
                fetchSessions(); // refresh the list to show the new chat
            }
        } catch (error) {
            console.error('Failed to send message:', error);
            setMessages(prev => [...prev, { sender: 'bot', text: 'Sorry, I encountered an error. Please try again.' }]);
        } finally {
            setIsTyping(false);
        }
    };

    const handleNewChat = () => {
        setActiveChatId(null);
        setIsSidebarOpen(false);
        setMessages([
            {
                sender: 'bot',
                text: `Started a new session! What would you like to automate next?`
            }
        ]);
    };

    useEffect(() => {
        window.addEventListener('create-chat', handleNewChat);
        return () => window.removeEventListener('create-chat', handleNewChat);
    }, []);

    const loadPastChat = async (id, title) => {
        if (editingChatId === id) return; // Don't navigate while editing
        setActiveChatId(id);
        setIsSidebarOpen(false);
        setIsTyping(true);
        setMessages([]); // clear current
        
        try {
            const sessionData = await getChatSession(id);
            setMessages(sessionData?.messages || []);
        } catch (error) {
            console.error('Failed to load chat:', error);
            setMessages([
                { sender: 'bot', text: `Sorry, I failed to load this session.` }
            ]);
        } finally {
            setIsTyping(false);
        }
    };

    const handleRenameSubmit = async (e, chatId) => {
        e.preventDefault();
        e.stopPropagation();
        if (!editingTitle.trim()) {
            setEditingChatId(null);
            return;
        }
        try {
            await updateChatSession(chatId, editingTitle);
            toast.success('Chat renamed successfully!');
            setEditingChatId(null);
            fetchSessions();
        } catch (error) {
            toast.error('Failed to rename chat.');
        }
    };

    const handleDeleteChat = (e, chatId) => {
        e.stopPropagation();
        setChatToDelete(chatId);
    };

    const confirmDelete = async () => {
        if (!chatToDelete) return;
        setIsDeleting(true);
        try {
            await deleteChatSession(chatToDelete);
            toast.success('Chat deleted successfully!');
            if (activeChatId === chatToDelete) {
                handleNewChat();
            }
            fetchSessions();
        } catch (error) {
            toast.error('Failed to delete chat.');
        } finally {
            setIsDeleting(false);
            setChatToDelete(null);
        }
    };

    return (
        <div ref={container} className="tab-content flex w-full h-full bg-white relative font-sans overflow-hidden">
            
            {/* Mobile Overlay */}
            {isSidebarOpen && (
                <div className="absolute inset-0 bg-black/20 z-20 md:hidden" onClick={() => setIsSidebarOpen(false)}></div>
            )}

            {/* Chat History Internal Sidebar */}
            <aside className={`w-[280px] border-r border-gray-200/60 bg-white/95 backdrop-blur-md flex flex-col shrink-0 z-30 absolute md:relative h-full transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'}`}>
                {/* Sidebar Header */}
                <div className="p-4 flex items-center justify-between shrink-0">
                    <h3 className="font-extrabold text-gray-900 text-[15px] tracking-tight pl-1">Chats</h3>
                    <button
                        onClick={handleNewChat}
                        className="p-1.5 rounded-xl text-gray-400 hover:text-gray-900 hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-100 transition-all"
                        title="New Chat"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                    </button>
                </div>

                {/* Search */}
                <div className="px-4 pb-3">
                    <div className="relative group">
                        <input
                            type="text"
                            value={sidebarSearch}
                            onChange={e => setSidebarSearch(e.target.value)}
                            placeholder="Search chats..."
                            className="w-full bg-white/50 backdrop-blur-sm border border-gray-200/80 hover:border-gray-300 rounded-xl pl-9 pr-3 py-2 text-[13px] font-medium text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition-all shadow-inner"
                        />
                        <svg className="absolute left-3 top-2.5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                    </div>
                </div>

                {/* Chat List */}
                <div className="flex-1 overflow-y-auto px-3 pb-4 flex flex-col gap-1">
                    {filteredChats.map(chat => {
                        const isActive = activeChatId === chat.id;
                        return (
                            <div 
                                key={chat.id}
                                onClick={() => loadPastChat(chat.id, chat.title)}
                                className={`flex flex-col gap-1 px-3.5 py-3 rounded-xl cursor-pointer transition-all duration-300 group ${
                                    isActive
                                        ? 'bg-white shadow-md shadow-gray-200/40 border border-gray-100 scale-[1.02]'
                                        : 'hover:bg-white/50 border border-transparent'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    {editingChatId === chat.id ? (
                                        <form 
                                            onSubmit={(e) => handleRenameSubmit(e, chat.id)}
                                            className="flex-1 mr-2"
                                        >
                                            <input
                                                autoFocus
                                                type="text"
                                                value={editingTitle}
                                                onChange={(e) => setEditingTitle(e.target.value)}
                                                onBlur={(e) => handleRenameSubmit(e, chat.id)}
                                                onClick={(e) => e.stopPropagation()}
                                                className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-0.5 text-[14px] text-gray-900 focus:outline-none focus:border-indigo-500"
                                            />
                                        </form>
                                    ) : (
                                        <span className={`truncate text-[14px] ${isActive ? 'font-bold text-gray-900' : 'font-medium text-gray-700 group-hover:text-indigo-600'}`}>
                                            {chat.title}
                                        </span>
                                    )}
                                    
                                    {!editingChatId && (
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingTitle(chat.title);
                                                    setEditingChatId(chat.id);
                                                }}
                                                className="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
                                                title="Rename Chat"
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                                            </button>
                                            <button
                                                onClick={(e) => handleDeleteChat(e, chat.id)}
                                                className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                                title="Delete Chat"
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center justify-between mt-0.5 gap-2">
                                    <span className="text-xs font-normal text-gray-500 truncate flex-1">
                                        Click to view chat...
                                    </span>
                                    <span className="text-[10px] font-medium text-gray-400 shrink-0">
                                        {new Date(chat.updatedAt).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>
                        );
                    })}

                    {filteredChats.length === 0 && sidebarSearch && (
                        <div className="text-center py-10">
                            <p className="text-[13px] font-bold text-gray-400">No chats match "{sidebarSearch}"</p>
                        </div>
                    )}
                </div>
            </aside>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col h-full relative">
                {/* Header */}
                <div className="w-full flex items-center justify-between py-4 px-4 border-b border-slate-100 shadow-sm bg-white/90 backdrop-blur z-10 shrink-0">
                    <button onClick={() => setIsSidebarOpen(true)} className="md:hidden text-slate-500 hover:text-slate-800 p-1">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                    </button>
                    <span className="text-sm font-semibold text-slate-500 absolute left-1/2 -translate-x-1/2">Prompty Assistant</span>
                    <div className="w-7 md:hidden"></div>
                </div>

                {/* Message Log */}
                <div className="flex-1 p-6 md:p-10 lg:px-[10%] overflow-y-auto flex flex-col gap-6 scroll-smooth bg-white">
                    {messages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                            <div className={`max-w-[90%] md:max-w-[80%] flex gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                {/* Avatar */}
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                                    msg.sender === 'user' 
                                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' 
                                        : 'bg-slate-50 text-slate-700 shadow-sm border border-slate-200'
                                }`}>
                                    {msg.sender === 'user' ? <UserIcon /> : <BotIcon />}
                                </div>

                                {/* Bubble */}
                                <div className={`bubble ${msg.sender === 'user' ? 'user !bg-indigo-600 !text-white !border-indigo-700 !rounded-tl-2xl !rounded-bl-2xl !rounded-tr-none !rounded-br-2xl' : 'bot highlight !rounded-tl-none !rounded-tr-2xl !rounded-bl-2xl !rounded-br-2xl'} whitespace-pre-wrap leading-relaxed shadow-sm`}>
                                    {msg.text}
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Typing Indicator */}
                    {isTyping && (
                        <div className="flex justify-start">
                            <div className="flex gap-3 items-center">
                                <div className="w-9 h-9 rounded-full bg-slate-50 text-slate-700 border border-slate-200 shadow-sm flex items-center justify-center text-xl shrink-0">
                                    <BotIcon />
                                </div>
                                <div className="bubble bot flex items-center gap-1.5 !rounded-tl-none !rounded-tr-2xl !rounded-bl-2xl !rounded-br-2xl py-3 shadow-sm">
                                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-pulse"></span>
                                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></span>
                                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></span>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Footer Input Area */}
                <div className="w-full bg-white border-t border-slate-100 p-4 pb-6 lg:px-[10%] shrink-0">
                    <form
                        onSubmit={(e) => { e.preventDefault(); handleSendMessage(inputText); }}
                        className="flex gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-2 shadow-sm focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-500/10 transition-all max-w-4xl mx-auto"
                    >
                        <input
                            type="text"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder="Ask me anything: e.g. 'Can you draft a follow-up mail?'..."
                            className="flex-1 bg-transparent border-none outline-none text-slate-900 placeholder:text-slate-400 px-4 py-2 font-medium"
                        />
                        <button
                            type="submit"
                            disabled={!inputText.trim() || isTyping}
                            className={`w-12 h-12 rounded-xl grid place-items-center transition-all ${
                                inputText.trim() && !isTyping 
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 hover:-translate-y-0.5 cursor-pointer' 
                                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            }`}
                        >
                            <SendIcon />
                        </button>
                    </form>
                    <div className="text-center mt-3 text-[0.7rem] font-medium text-slate-400">
                        Prompty can make mistakes. Consider verifying important information.
                    </div>
                </div>
            </div>

            {/* Custom Delete Confirmation Modal */}
            {chatToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-sm w-full p-6 animate-fade-in">
                        <div className="flex flex-col items-center text-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-500 mb-2">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            </div>
                            <h3 className="text-lg font-bold text-slate-900">Delete Chat?</h3>
                            <p className="text-sm text-slate-500">
                                This action cannot be undone. Are you sure you want to permanently delete this conversation?
                            </p>
                        </div>
                        <div className="flex gap-3 mt-8">
                            <button
                                disabled={isDeleting}
                                onClick={() => setChatToDelete(null)}
                                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                disabled={isDeleting}
                                onClick={confirmDelete}
                                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 shadow-md shadow-red-500/20 transition-all flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {isDeleting ? (
                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                ) : (
                                    'Delete'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChatTab;
