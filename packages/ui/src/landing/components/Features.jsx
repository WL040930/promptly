import React, { useState } from 'react'

const FEATURES = [
  {
    id: 'natural-language',
    title: 'Natural Language Workflows',
    description:
      'Describe what you need in plain English. Our AI understands complex administrative context without rigid logic builders.',
    details:
      "Leverages Gemini 3 Flash to parse intent, identify variables, and map conversational requests to executable automation scripts.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
        />
      </svg>
    ),
    color: 'blue'
  },
  {
    id: 'data-entry',
    title: 'Intelligent Data Entry',
    description:
      'Automatically extract data from unstructured documents and populate your CRM or internal systems accurately.',
    details:
      "Supports OCR and semantic extraction. It doesn't just see text; it understands what \"Total Amount\" or \"Due Date\" means across different formats.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    ),
    color: 'teal'
  },
  {
    id: 'spreadsheet',
    title: 'Spreadsheet Magic',
    description: 'Format, calculate, and transform complex spreadsheets using simple verbal instructions.',
    details:
      'Direct integration with Google Sheets and Excel APIs. Perform VLOOKUPs, pivot tables, and data cleaning via chat.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
    ),
    color: 'indigo'
  },
  {
    id: 'outreach',
    title: 'Automated Outreach',
    description: 'Set up personalized email sequences and responses triggered by specific administrative events.',
    details:
      'Maintains context across threads. The AI can draft responses based on past interaction history and company policy.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    color: 'rose'
  }
]

const COLOR_CLASS = {
  blue: 'text-blue-600',
  teal: 'text-teal-600',
  indigo: 'text-indigo-600',
  rose: 'text-rose-600'
}

function Features() {
  const [activeId, setActiveId] = useState(null)

  return (
    <section id="features" className="py-24 bg-white relative scroll-mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mb-6">Built for Modern Administration</h2>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto">
            Traditional RPA is brittle and hard to set up. Promptly uses Large Language Models to create flexible, resilient automations that anyone can manage.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {FEATURES.map((feature) => {
            const colorClass = COLOR_CLASS[feature.color] || 'text-blue-600'
            return (
              <div
                key={feature.id}
                onMouseEnter={() => setActiveId(feature.id)}
                onMouseLeave={() => setActiveId(null)}
                className={`group p-8 rounded-3xl border transition-all duration-300 h-full flex flex-col ${
                  activeId === feature.id ? 'bg-slate-900 border-slate-900 shadow-2xl scale-105' : 'bg-slate-50 border-slate-100'
                }`}
              >
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-8 shadow-sm transition-colors duration-300 ${
                    activeId === feature.id ? 'bg-white text-slate-900' : `bg-white ${colorClass}`
                  }`}
                >
                  {feature.icon}
                </div>
                
                <h3
                  className={`text-2xl font-bold mb-4 transition-colors duration-300 ${
                    activeId === feature.id ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  {feature.title}
                </h3>
                
                <p
                  className={`text-lg leading-relaxed mb-6 transition-colors duration-300 ${
                    activeId === feature.id ? 'text-slate-300' : 'text-slate-600'
                  }`}
                >
                  {feature.description}
                </p>

                {activeId === feature.id && (
                  <div className="mt-auto animate-fade-in">
                    <p className="text-sm text-blue-400 font-medium border-t border-slate-700 pt-4">{feature.details}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-20 p-8 rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-700 text-white flex flex-col md:flex-row items-center justify-between shadow-xl">
          <div className="mb-6 md:mb-0">
            <h4 className="text-2xl font-bold mb-2">Want to see a specific feature in action?</h4>
            <p className="text-blue-100">Our live demo includes real-time workflow generation for all modules.</p>
          </div>
          <a
            href="#demo"
            className="px-8 py-4 bg-white text-blue-600 rounded-xl font-bold hover:bg-slate-50 transition-all shadow-lg active:scale-95 whitespace-nowrap"
          >
            Launch Sandbox
          </a>
        </div>
      </div>
    </section>
  )
}

export default Features
