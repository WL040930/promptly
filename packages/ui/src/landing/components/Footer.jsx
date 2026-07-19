
function Footer({ onSecurity, onHome }) {
  return (
    <footer className="bg-slate-900 py-16 text-slate-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-6">
              <img src="/logo.png" alt="Promptly Logo" className="w-8 h-8 object-contain rounded-lg overflow-hidden" />
              <span className="text-2xl font-bold text-white">Promptly</span>
            </div>
            <p className="max-w-sm text-slate-500 mb-8">
              Enhancing the workflow efficiency of administrative personnel through advanced conversational Artificial Intelligence agents.
            </p>
            <p className="text-sm text-slate-600">A focused workspace for building and running AI-assisted automations.</p>
          </div>
          <div>
            <h4 className="text-white font-bold mb-6">Product</h4>
            <ul className="space-y-4">
              {onHome ? (
                <li><button type="button" onClick={onHome} className="hover:text-white transition-colors">Back to Promptly</button></li>
              ) : (
                <>
                  <li><a href="#demo" className="hover:text-white transition-colors">AI Workspace</a></li>
                  <li><a href="#how-it-works" className="hover:text-white transition-colors">Automations</a></li>
                  <li><a href="#features" className="hover:text-white transition-colors">Capabilities</a></li>
                </>
              )}
              <li>
                <a
                  href="/security"
                  onClick={(e) => {
                    if (onSecurity) {
                      e.preventDefault();
                      onSecurity();
                    }
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
              {onHome ? (
                <li><span>Security foundations</span></li>
              ) : (
                <>
                  <li><a href="#how-it-works" className="hover:text-white transition-colors">How it works</a></li>
                  <li><a href="#demo" className="hover:text-white transition-colors">Interactive demo</a></li>
                  <li><a href="#metrics" className="hover:text-white transition-colors">Project metrics</a></li>
                </>
              )}
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
