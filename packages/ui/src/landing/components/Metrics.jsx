import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const DATA = [
  { name: 'Data Entry', manual: 120, prompt: 15 },
  { name: 'Invoicing', manual: 85, prompt: 8 },
  { name: 'Reporting', manual: 240, prompt: 30 },
  { name: 'Outreach', manual: 160, prompt: 20 }
]

function Metrics() {
  return (
    <section id="metrics" className="scroll-mt-24 bg-white py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row items-center gap-16">
          <div className="lg:w-1/2">
            <p className="landing-kicker mb-6">Make the trade-off visible</p>
            <h2 className="landing-section-title mb-6">Less repetitive work. More room for judgment.</h2>
            <p className="mb-8 text-lg leading-8 text-slate-600">
              Use this illustrative comparison to reason about where an automation could reduce repetitive work. Measure the actual impact in your own runs.
            </p>
            <div className="grid grid-cols-2 gap-6">
              <div className="rounded-2xl border border-[#d9d5ff] bg-[#f1efff] p-6">
                <span className="mb-2 block font-display text-4xl font-bold text-[#5143cc]">1 task</span>
                <span className="text-sm font-medium uppercase tracking-wider text-[#5143cc]">At a time</span>
              </div>
              <div className="rounded-2xl border border-[#d9efb4] bg-[#f5fbe9] p-6">
                <span className="mb-2 block font-display text-4xl font-bold text-[#50720e]">100%</span>
                <span className="text-sm font-medium uppercase tracking-wider text-[#50720e]">Reviewable</span>
              </div>
            </div>
          </div>
          
          <div className="h-[400px] w-full rounded-[1.75rem] border border-slate-200 bg-[#f8f8fc] p-8 shadow-inner lg:w-1/2">
            <h4 className="mb-8 text-center text-sm font-semibold text-slate-500">Illustrative manual time vs. automation (minutes)</h4>
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
                    <Cell key={`${entry.name}-${index}`} fill="#5b4ee8" />
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
