import React from 'react'

function Footer({ onSecurity }) {
  return (
    <footer className="bg-slate-900 py-16 text-slate-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          <div className="col-span-1 md:col-span-2">
            <span className="text-2xl font-bold text-white mb-6 block">Promptly</span>
            <p className="max-w-sm text-slate-500 mb-8">
              Enhancing the workflow efficiency of administrative personnel through advanced conversational Artificial Intelligence agents.
            </p>
            <div className="flex space-x-4">
              <a href="#" className="hover:text-white transition-colors">Twitter</a>
              <a href="#" className="hover:text-white transition-colors">LinkedIn</a>
              <a href="#" className="hover:text-white transition-colors">GitHub</a>
            </div>
          </div>
          <div>
            <h4 className="text-white font-bold mb-6">Product</h4>
            <ul className="space-y-4">
              <li><a href="#" className="hover:text-white transition-colors">Dashboard</a></li>
              <li><a href="#" className="hover:text-white transition-colors">AI Agents</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Integrations</a></li>
              <li>
                <a
                  href="/security"
                  onClick={(e) => {
                    e.preventDefault();
                    if (onSecurity) onSecurity();
                  }}
                  className="hover:text-white transition-colors"
                >
                  Security
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold mb-6">Project</h4>
            <ul className="space-y-4">
              <li><a href="#" className="hover:text-white transition-colors">FYP Details</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Documentation</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Case Studies</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Roadmap</a></li>
            </ul>
          </div>
        </div>
        <div className="pt-8 border-t border-slate-800 text-center text-sm text-slate-600">
          <p>&copy; {new Date().getFullYear()} Promptly. Final Year Project: Enhancing Administrative Workflow Efficiency.</p>
        </div>
      </div>
    </footer>
  )
}

export default Footer
