import { useState, useRef, useEffect } from 'react'
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
    <section id="demo" className="relative scroll-mt-24 overflow-hidden bg-[#f5f6fb] py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          
          <div className="space-y-8 pt-2">
            <div>
              <p className="landing-kicker mb-6">A small taste of the workspace</p>
              <h2 className="landing-section-title mb-5">Say what needs doing.</h2>
              <p className="text-lg leading-8 text-slate-600">
                Experience how easy it is to automate routine operations. Type a common administrative task in the chat.
              </p>
            </div>

            <div className="space-y-4">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Start with a prompt</h4>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left text-sm font-semibold text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#aaa2ff] hover:text-[#5143cc]"
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

          <div className="flex h-[600px] flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_28px_70px_rgba(23,24,39,0.12)]">
            <div className="flex items-center justify-between bg-[#171827] p-5">
              <div className="flex items-center space-x-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#5b4ee8]">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <div>
                  <h3 className="text-white font-bold leading-none">Promptly Engine</h3>
                  <div className="flex items-center mt-1">
                    <span className="mr-2 status-dot animate-pulse"></span>
                    <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">v1.2 Online</span>
                  </div>
                </div>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto bg-[#f8f8fc] p-6 scroll-smooth">
              {messages.map((m, i) => (
                <div key={`${m.role}-${i}`} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] p-4 rounded-2xl shadow-sm ${
                      m.role === 'user'
                        ? 'rounded-tr-none bg-[#5b4ee8] text-white'
                        : 'rounded-tl-none border border-slate-200 bg-white text-slate-800'
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

            <div className="border-t border-slate-200 bg-white p-5">
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="E.g. Create a summary of my inbox..."
                  className="w-full rounded-2xl border border-slate-200 bg-[#f8f8fc] py-4 pl-5 pr-14 text-sm transition-all focus:border-[#5b4ee8] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#5b4ee8]/10"
                />
                <button
                  onClick={() => handleSend()}
                  disabled={isLoading}
                  className="absolute right-2 rounded-xl bg-[#171827] p-2.5 text-white shadow-lg shadow-[#171827]/20 transition-all hover:bg-[#2a2840] active:scale-90 disabled:opacity-50"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </button>
              </div>
              <p className="text-[10px] text-center text-slate-400 mt-3 font-medium">Powered by Promptly AI</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default InteractiveDemo
