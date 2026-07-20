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
    <div className="min-h-screen bg-[#f8f8fc] text-[#171827]">
      <Header onLogin={onLogin} onHome={onHome} />
      <main>
        <section className="surface-grid relative overflow-hidden pb-20 pt-32 lg:pb-28 lg:pt-44">
          <div className="pointer-events-none absolute -right-24 top-24 h-80 w-80 rounded-full bg-[#bdb7ff]/35 blur-[110px]" />
          <div className="pointer-events-none absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-[#c8f17b]/20 blur-[110px]" />
          
          <div className="mx-auto max-w-4xl px-4 text-left sm:px-6 lg:px-8">
            <div className="landing-kicker mb-6 animate-fade-in">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span>Security foundations</span>
            </div>
            
            <h1 className="mb-8 max-w-4xl font-display text-5xl font-bold leading-[1.02] tracking-[-0.055em] text-[#171827] md:text-7xl">
              A visible foundation for <span className="gradient-text">safer automation.</span>
            </h1>
            
            <p className="mb-10 max-w-2xl text-lg leading-8 text-slate-600 md:text-xl">
              We protect the application with authenticated API access, request limits, and standard HTTP security headers. These are the safeguards currently implemented in Promptly; review your deployment configuration before making production commitments.
            </p>
          </div>
        </section>

        <section className="relative bg-white py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {SECURITY_FEATURES.map((feature) => {
                const colorClass = COLOR_CLASS[feature.color] || 'text-indigo-600'
                return (
                  <div
                    key={feature.id}
                    className="group flex h-full flex-col rounded-[1.5rem] border border-slate-200 bg-[#f8f8fc] p-7 transition-all duration-300 hover:-translate-y-1 hover:border-[#c9c4ff] hover:bg-white hover:shadow-xl"
                  >
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-8 shadow-sm bg-white ${colorClass}`}>
                      {feature.icon}
                    </div>
                    
                    <h3 className="mb-4 font-display text-xl font-bold tracking-tight text-slate-900">
                      {feature.title}
                    </h3>
                    
                    <p className="mb-6 text-base leading-7 text-slate-600">
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
