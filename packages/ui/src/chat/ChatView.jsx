import React, { useState, useRef, useEffect } from 'react';

// --- Icons ---
const BotIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 8V4H8"></path>
        <rect x="4" y="8" width="16" height="12" rx="2" ry="2"></rect>
        <path d="M2 14h2"></path>
        <path d="M20 14h2"></path>
        <path d="M15 13v2"></path>
        <path d="M9 13v2"></path>
    </svg>
);

const UserIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
    </svg>
);

const SendIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
    </svg>
);

const BOT_RESPONSES = {
    default: `That is an excellent question! As an AI assistant, I can easily automate that for you. 

Here's what we can do:
1. **Identify the sources**: Map out where your data currently sits (emails, sheets, forms).
2. **Setup triggers**: Trigger automations instantly whenever new information arrives.
3. **Format output**: Deliver results directly to Slack, Excel, or email dashboards.

Let me know if you would like me to generate a step-by-step workflow guide tailored for this task!`
};

const ChatView = ({ user }) => {
    const [messages, setMessages] = useState([
        {
            sender: 'bot',
            text: `Hi there! I am your friendly Prompty Assistant. I am here to help you automate your tasks without writing a single line of code!

Type a question to get started.`
        }
    ]);
    const [inputText, setInputText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]);

    const handleSendMessage = (text) => {
        if (!text.trim()) return;

        // Add user message
        setMessages(prev => [...prev, { sender: 'user', text }]);
        setInputText('');
        setIsTyping(true);

        // Simulate Bot Response
        setTimeout(() => {
            setIsTyping(false);
            const botReply = BOT_RESPONSES[text] || BOT_RESPONSES.default;
            setMessages(prev => [...prev, { sender: 'bot', text: botReply }]);
        }, 1500);
    };

    return (
        <section className="flex flex-col w-full h-full bg-white relative font-['Space_Grotesk','Manrope',sans-serif]">
            
            {/* Header / Top padding */}
            <div className="w-full flex justify-center py-4 border-b border-slate-100 shadow-sm sticky top-0 bg-white/90 backdrop-blur z-10">
                <span className="text-sm font-bold text-slate-400">Chat Mode Session</span>
            </div>

            {/* Message Log */}
            <div className="flex-1 p-6 md:p-10 lg:px-[15%] overflow-y-auto flex flex-col gap-6 scroll-smooth">
                {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                        <div className={`max-w-[85%] md:max-w-[75%] flex gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
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
            <div className="w-full bg-white border-t border-slate-100 p-4 pb-6 md:p-8 lg:px-[15%]">
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
        </section>
    );
};

export default ChatView;
