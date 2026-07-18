import React, { useState, useRef } from 'react'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(useGSAP, ScrollTrigger)

const FEATURES = [
  {
    id: 'natural-language',
    title: 'Natural Language Workflows',
    description:
      'Describe what you need in plain English. Our AI understands complex administrative context without rigid logic builders.',
    details:
      'Uses the Promptly AI layer to parse intent, identify variables, and map conversational requests to executable automation steps.',
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
    title: 'AI Data Processing',
    description:
      'Use AI steps to interpret incoming text and prepare structured values for the next automation step.',
    details:
      'Combine AI tasks with validation and transformations so the workflow can make its next action explicit.',
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
    title: 'Data Transformation',
    description: 'Clean, map, calculate, and format structured data with reusable workflow steps.',
    details:
      'Use data-transform steps, database actions, HTTP requests, and Google Sheets operations where they fit your workflow.',
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
    title: 'Email Actions',
    description: 'Send an email when a form, schedule, webhook, or other supported trigger starts an automation.',
    details:
      'Compose plain-text or HTML messages and keep the action inside a reviewable execution path.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    color: 'rose'
  }
]

const COLOR_CLASS = {
  blue: 'text-indigo-600',
  teal: 'text-teal-600',
  indigo: 'text-indigo-600',
  rose: 'text-rose-600'
}

function Features() {
  const [activeId, setActiveId] = useState(null)
  const container = useRef(null)

  useGSAP(() => {
    gsap.from('.features-heading', {
      y: 30,
      opacity: 0,
      duration: 0.8,
      ease: 'power3.out',
      immediateRender: false,
      scrollTrigger: {
        trigger: container.current,
        start: 'top 80%',
        toggleActions: 'play none none none'
      }
    })

    gsap.from('.feature-card', {
      y: 50,
      opacity: 0,
      duration: 0.8,
      stagger: 0.2,
      ease: 'power3.out',
      immediateRender: false,
      scrollTrigger: {
        trigger: container.current,
        start: 'top 80%',
        toggleActions: 'play none none none'
      }
    })
  }, { scope: container })

  return (
    <section ref={container} id="features" className="py-24 bg-white relative scroll-mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="features-heading text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mb-6">Built for Modern Administration</h2>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto">
            Traditional RPA is brittle and hard to set up. Promptly uses Large Language Models to create flexible, resilient automations that anyone can manage.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {FEATURES.map((feature) => {
            const colorClass = COLOR_CLASS[feature.color] || 'text-indigo-600'
            return (
              <div
                key={feature.id}
                onMouseEnter={() => setActiveId(feature.id)}
                onMouseLeave={() => setActiveId(null)}
                className={`feature-card group p-8 rounded-3xl border transition-all duration-300 h-full flex flex-col ${
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
                    <p className="text-sm text-indigo-400 font-medium border-t border-slate-700 pt-4">{feature.details}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-20 p-8 rounded-3xl bg-gradient-to-r from-indigo-600 to-indigo-700 text-white flex flex-col md:flex-row items-center justify-between shadow-xl">
          <div className="mb-6 md:mb-0">
            <h4 className="text-2xl font-bold mb-2">Want to see a specific feature in action?</h4>
            <p className="text-indigo-100">Our live demo includes real-time workflow generation for all modules.</p>
          </div>
          <a
            href="#demo"
            className="px-8 py-4 bg-white text-indigo-600 rounded-xl font-bold hover:bg-slate-50 transition-all shadow-lg active:scale-95 whitespace-nowrap"
          >
            Launch Sandbox
          </a>
        </div>
      </div>
    </section>
  )
}

export default Features
