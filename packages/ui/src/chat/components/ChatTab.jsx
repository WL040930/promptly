import React, { useState, useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { BotIcon, UserIcon, SendIcon, PlusIcon, MessageSquareIcon } from './Icons';

const BOT_RESPONSES = {
    default: `That is an excellent question! As an AI assistant, I can easily automate that for you. 

Here's what we can do:
1. **Identify the sources**: Map out where your data currently sits.
2. **Setup triggers**: Trigger automations instantly.
3. **Format output**: Deliver results directly to dashboards.

Let me know if you would like me to generate a step-by-step workflow guide tailored for this task!`
};

const PAST_CHATS = [
    { id: 1, title: 'Drafting Follow-up Email', preview: 'Can you help me draft a follow up...', date: 'Today' },
    { id: 2, title: 'Sync Notion with Google Sheets', preview: 'I want to sync a database...', date: 'Yesterday' },
    { id: 3, title: 'Slack Notification Setup', preview: 'When a new lead arrives...', date: '3 days ago' },
];

const ChatTab = () => {
    const [messages, setMessages] = useState([
        {
            sender: 'bot',
            text: `Hi there! I am your friendly Prompty Assistant. I am here to help you automate your tasks without writing a single line of code!\n\nType a question to get started.`
        }
    ]);
    const [inputText, setInputText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef(null);
    const container = useRef(null);

    useGSAP(() => {
        gsap.from(container.current, { opacity: 0, y: 15, duration: 0.3, ease: 'power2.out' });
    }, { scope: container });

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]);

    const handleSendMessage = (text) => {
        if (!text.trim()) return;

        setMessages(prev => [...prev, { sender: 'user', text }]);
        setInputText('');
        setIsTyping(true);

        setTimeout(() => {
            setIsTyping(false);
            const botReply = BOT_RESPONSES[text] || BOT_RESPONSES.default;
            setMessages(prev => [...prev, { sender: 'bot', text: botReply }]);
        }, 1500);
    };

    const handleNewChat = () => {
        setMessages([
            {
                sender: 'bot',
                text: `Started a new session! What would you like to automate next?`
            }
        ]);
    };

    const loadPastChat = (title) => {
        setMessages([
            { sender: 'user', text: `Can you help me with: ${title}?` },
            { sender: 'bot', text: `Sure! I have loaded the context for "${title}". How can we proceed?` }
        ]);
    };

    return (
        <div ref={container} className="tab-content flex w-full h-full bg-white relative font-sans overflow-hidden">
            
            {/* Chat History Internal Sidebar */}
            <div className="w-64 border-r border-slate-100 bg-slate-50/50 flex flex-col h-full hidden md:flex shrink-0">
                <div className="p-4 border-b border-slate-100">
                    <button 
                        onClick={handleNewChat}
                        className="w-full py-2.5 px-4 bg-white border border-slate-200 rounded-xl shadow-sm text-sm font-bold text-slate-700 hover:border-blue-300 hover:text-blue-600 hover:shadow-md transition-all flex items-center justify-center gap-2"
                    >
                        <PlusIcon />
                        New Chat
                    </button>
                </div>
                <div className="p-4 flex-1 overflow-y-auto">
                    <h4 className="text-xs font-semibold text-slate-500 mb-3 px-1">Past Chats</h4>
                    <div className="flex flex-col gap-1">
                        {PAST_CHATS.map(chat => (
                            <button 
                                key={chat.id}
                                onClick={() => loadPastChat(chat.title)}
                                className="w-full text-left p-3 rounded-xl hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200 transition-all group"
                            >
                                <div className="text-sm font-medium text-slate-700 truncate group-hover:text-blue-600 transition-colors">
                                    {chat.title}
                                </div>
                                <div className="text-xs font-normal text-slate-500 truncate mt-1">
                                    {chat.preview}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col h-full relative">
                {/* Header */}
                <div className="w-full flex justify-center py-4 border-b border-slate-100 shadow-sm bg-white/90 backdrop-blur z-10 shrink-0">
                    <span className="text-sm font-semibold text-slate-500">Prompty Assistant</span>
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
