import React from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const DATA = [
  { name: 'Data Entry', manual: 120, prompt: 15 },
  { name: 'Invoicing', manual: 85, prompt: 8 },
  { name: 'Reporting', manual: 240, prompt: 30 },
  { name: 'Outreach', manual: 160, prompt: 20 }
]

function Metrics() {
  return (
    <section className="py-24 bg-white scroll-mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row items-center gap-16">
          <div className="lg:w-1/2">
            <h2 className="text-4xl font-bold text-slate-900 mb-6">Efficiency Gains in Seconds</h2>
            <p className="text-lg text-slate-600 mb-8 leading-relaxed">
              Our research indicates that administrative personnel save up to 85% of their time when switching from manual workflows to conversational AI agents.
            </p>
            <div className="grid grid-cols-2 gap-6">
              <div className="p-6 rounded-2xl bg-indigo-50 border border-indigo-100">
                <span className="block text-4xl font-bold text-indigo-600 mb-2">12x</span>
                <span className="text-sm font-medium text-indigo-800 uppercase tracking-wider">Speed Increase</span>
              </div>
              <div className="p-6 rounded-2xl bg-teal-50 border border-teal-100">
                <span className="block text-4xl font-bold text-teal-600 mb-2">99%</span>
                <span className="text-sm font-medium text-teal-800 uppercase tracking-wider">Error Reduction</span>
              </div>
            </div>
          </div>
          
          <div className="lg:w-1/2 w-full h-[400px] bg-slate-50 rounded-3xl p-8 border border-slate-100 shadow-inner">
            <h4 className="text-center text-slate-500 text-sm font-medium mb-8">Manual Time vs. Promptly Automation (Minutes)</h4>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={DATA}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                <YAxis hide />
                <Tooltip
                  cursor={{ fill: '#f1f5f9' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="manual" name="Manual Work" fill="#cbd5e1" radius={[6, 6, 0, 0]} />
                <Bar dataKey="prompt" name="With Promptly" radius={[6, 6, 0, 0]}>
                  {DATA.map((entry, index) => (
                    <Cell key={`${entry.name}-${index}`} fill="#3b82f6" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Metrics
