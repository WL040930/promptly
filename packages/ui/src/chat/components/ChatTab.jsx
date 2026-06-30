import React, { useState, useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { BotIcon, UserIcon, SendIcon, PlusIcon, MessageSquareIcon } from './Icons';
import { getChatSessions, getChatSession, sendChatMessage } from '../../api/backend.js';

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

    const loadPastChat = async (id, title) => {
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
                            className="w-full bg-white/50 backdrop-blur-sm border border-gray-200/80 hover:border-gray-300 rounded-xl pl-9 pr-3 py-2 text-[13px] font-medium text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all shadow-inner"
                        />
                        <svg className="absolute left-3 top-2.5 text-gray-400 group-focus-within:text-blue-500 transition-colors" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
                                    <span className={`truncate text-[14px] ${isActive ? 'font-bold text-gray-900' : 'font-medium text-gray-700 group-hover:text-blue-600'}`}>
                                        {chat.title}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between mt-0.5 gap-2">
                                    <span className="text-xs font-normal text-gray-500 truncate flex-1">
                                        {/* No preview text on the API list right now, so we can omit it or show a placeholder */}
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
                                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' 
                                        : 'bg-slate-50 text-slate-700 shadow-sm border border-slate-200'
                                }`}>
                                    {msg.sender === 'user' ? <UserIcon /> : <BotIcon />}
                                </div>

                                {/* Bubble */}
                                <div className={`bubble ${msg.sender === 'user' ? 'user !bg-blue-600 !text-white !border-blue-700 !rounded-tl-2xl !rounded-bl-2xl !rounded-tr-none !rounded-br-2xl' : 'bot highlight !rounded-tl-none !rounded-tr-2xl !rounded-bl-2xl !rounded-br-2xl'} whitespace-pre-wrap leading-relaxed shadow-sm`}>
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
                        className="flex gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-2 shadow-sm focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all max-w-4xl mx-auto"
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
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 hover:-translate-y-0.5 cursor-pointer' 
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
        </div>
    );
};

export default ChatTab;
