import React, { useState, useRef, useEffect } from 'react'
import { getGeminiResponse, analyzeWorkflowTask } from '../services/geminiService'

const SUGGESTIONS = [
  'Send update emails to all overdue clients',
  'Summarize the latest sales spreadsheet',
  'Categorize the support tickets for this week',
  'Generate a monthly expense report'
]

function InteractiveDemo() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        "Hello! I'm Promptly. I can help you automate your admin tasks. For example, tell me: 'Automate weekly report emails' or 'Extract data from these 50 invoices'."
    }
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [activeTask, setActiveTask] = useState(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async (customInput) => {
    const textToSend = customInput || input
    if (!textToSend.trim() || isLoading) return

    const userMsg = textToSend
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }])
    setIsLoading(true)

    try {
      const [aiResponse, taskAnalysis] = await Promise.all([
        getGeminiResponse(userMsg, []),
        analyzeWorkflowTask(userMsg).catch(() => null)
      ])

      setMessages((prev) => [...prev, { role: 'assistant', content: aiResponse }])
      if (taskAnalysis && taskAnalysis.category) {
        setActiveTask(taskAnalysis)
      }
    } catch (error) {
      console.error(error)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error processing that request.' }
      ])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section id="demo" className="py-24 bg-slate-50 relative overflow-hidden scroll-mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          
          <div className="space-y-8">
            <div>
              <h2 className="text-4xl font-bold text-slate-900 mb-4">Try the Conversational Agent</h2>
              <p className="text-lg text-slate-600">
                Experience how easy it is to automate routine operations. Type a common administrative task in the chat.
              </p>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Try a prompt</h4>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-full text-sm font-medium text-slate-700 hover:border-indigo-500 hover:text-indigo-600 transition-all shadow-sm"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-6 pt-6 border-t border-slate-200">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">1</div>
                <div>
                  <h4 className="font-bold text-slate-900">Define your task</h4>
                  <p className="text-slate-600 text-sm">Simply say what you want to achieve.</p>
                </div>
              </div>
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-600 font-bold">2</div>
                <div>
                  <h4 className="font-bold text-slate-900">AI Logic Generation</h4>
                  <p className="text-slate-600 text-sm">Promptly translates your intent into a structured automation workflow.</p>
                </div>
              </div>
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">3</div>
                <div>
                  <h4 className="font-bold text-slate-900">Execution & Reporting</h4>
                  <p className="text-slate-600 text-sm">Tasks are performed automatically with a summary report provided.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-slate-200 flex flex-col h-[600px]">
            <div className="bg-slate-900 p-5 flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <div>
                  <h3 className="text-white font-bold leading-none">Promptly Engine</h3>
                  <div className="flex items-center mt-1">
                    <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse mr-2"></span>
                    <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">v1.2 Online</span>
                  </div>
                </div>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 scroll-smooth bg-slate-50/30">
              {messages.map((m, i) => (
                <div key={`${m.role}-${i}`} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] p-4 rounded-2xl shadow-sm ${
                      m.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-tr-none'
                        : 'bg-white border border-slate-100 text-slate-800 rounded-tl-none'
                    }`}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-100 p-4 rounded-2xl rounded-tl-none flex space-x-2 shadow-sm">
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:-.3s]"></div>
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:-.5s]"></div>
                  </div>
                </div>
              )}
            </div>

            {activeTask && (
              <div className="px-6 pb-2">
                <div className="bg-slate-900 text-white rounded-2xl p-4 animate-slide-up shadow-xl border border-white/10 mb-2">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center">
                      <div className="w-2 h-2 bg-indigo-500 rounded-full mr-2"></div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Execution Plan Generated</span>
                    </div>
                    <button onClick={() => setActiveTask(null)} className="text-slate-500 hover:text-white">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <h4 className="text-sm font-bold mb-2 capitalize">{activeTask.category.replace('-', ' ')} Workflow</h4>
                  <div className="space-y-2">
                    {activeTask.steps.map((step, i) => (
                      <div key={`${step}-${i}`} className="flex items-start text-[11px] text-slate-300">
                        <span className="text-indigo-500 mr-2 font-bold">{i + 1}.</span>
                        {step}
                      </div>
                    ))}
                  </div>
                  <button className="w-full mt-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-xs font-bold transition-colors">
                    Deploy Automation
                  </button>
                </div>
              </div>
            )}

            <div className="p-5 bg-white border-t border-slate-100">
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="E.g. Create a summary of my inbox..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-5 pr-14 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-sm"
                />
                <button
                  onClick={() => handleSend()}
                  disabled={isLoading}
                  className="absolute right-2 p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/30 disabled:opacity-50 active:scale-90"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </button>
              </div>
              <p className="text-[10px] text-center text-slate-400 mt-3 font-medium">Powered by Gemini AI Engine & Promptly Context Layer</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default InteractiveDemo
