import React from 'react'
import Header from './components/Header'
import Footer from './components/Footer'
import CallToAction from './components/CallToAction'

const SECURITY_FEATURES = [
  {
    id: 'jwt',
    title: 'JWT Authentication',
    description: 'Every sensitive API request is authenticated using secure JSON Web Tokens (JWT). We enforce strict verification on all prompt management endpoints to guarantee that only authorized users can access or modify your data.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
      </svg>
    ),
    color: 'blue'
  },
  {
    id: 'rate-limit',
    title: 'Advanced Rate Limiting',
    description: 'To protect against brute-force and Denial of Service (DoS) attacks, we implement intelligent rate limiting. General API requests are capped at 500 per 15 minutes, while critical authentication routes have stricter limits to prevent abuse.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: 'teal'
  },
  {
    id: 'helmet',
    title: 'Helmet Protection',
    description: 'Our infrastructure uses Helmet to configure robust HTTP headers. This mitigates common web vulnerabilities like Cross-Site Scripting (XSS), clickjacking, and MIME-type sniffing, adding an invisible layer of defense.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    ),
    color: 'indigo'
  }
]

const COLOR_CLASS = {
  blue: 'text-indigo-600',
  teal: 'text-teal-600',
  indigo: 'text-indigo-600'
}

function SecurityPage({ onHome, onLogin }) {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <Header onLogin={onLogin} onHome={onHome} />
      <main>
        <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-200/40 rounded-full blur-[120px]"></div>
            <div className="absolute bottom-[10%] right-[-10%] w-[40%] h-[40%] bg-teal-200/40 rounded-full blur-[120px]"></div>
          </div>
          
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-sm font-medium mb-6 animate-fade-in">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span>Security foundations</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-slate-900 mb-8 max-w-4xl mx-auto leading-tight">
              Securing your <span className="gradient-text">Prompts</span>
            </h1>
            
            <p className="text-lg md:text-xl text-slate-600 max-w-2xl mx-auto mb-10 leading-relaxed">
              We protect the application with authenticated API access, request limits, and standard HTTP security headers. These are the safeguards currently implemented in Promptly; review your deployment configuration before making production commitments.
            </p>
          </div>
        </section>

        <section className="py-24 bg-white relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {SECURITY_FEATURES.map((feature) => {
                const colorClass = COLOR_CLASS[feature.color] || 'text-indigo-600'
                return (
                  <div
                    key={feature.id}
                    className="group p-8 rounded-3xl border border-slate-100 bg-slate-50 transition-all duration-300 h-full flex flex-col hover:shadow-2xl hover:scale-105 hover:bg-white"
                  >
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-8 shadow-sm bg-white ${colorClass}`}>
                      {feature.icon}
                    </div>
                    
                    <h3 className="text-2xl font-bold mb-4 text-slate-900">
                      {feature.title}
                    </h3>
                    
                    <p className="text-lg leading-relaxed mb-6 text-slate-600">
                      {feature.description}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <CallToAction
          title="Ready to build securely?"
          description="Join Promptly today and start creating complex AI workflows with the peace of mind that your data is protected."
          primaryLabel="Get Started"
          onPrimaryClick={onLogin}
        />
      </main>
      <Footer onHome={onHome} />
    </div>
  )
}

export default SecurityPage
