function AuthShell({ icon, title, subtitle, children, step = 'Account access' }) {
    return (
        <main className="auth-page">
            <section className="auth-story" aria-label="About Promptly">
                <a className="auth-brand" href="/" aria-label="Promptly home">
                    <img src="/logo.png" alt="" />
                    <span>Promptly<span>.</span></span>
                </a>

                <div className="auth-story-copy">
                    <p className="auth-story-kicker"><i /> Workflow intelligence</p>
                    <h1>Turn a thought into <em>forward motion.</em></h1>
                    <p>Promptly gives every handoff a clear path, a human checkpoint, and a visible outcome.</p>
                </div>

                <div className="auth-route" aria-hidden="true">
                    <span className="auth-route-line auth-route-line-one" />
                    <span className="auth-route-line auth-route-line-two" />
                    <div className="auth-node auth-node-source"><span>Brief</span><b /></div>
                    <div className="auth-node auth-node-review"><span>Review</span><b /></div>
                    <div className="auth-node auth-node-live"><span>Live</span><b /></div>
                    <div className="auth-route-pulse" />
                </div>

                <p className="auth-story-footer"><span /> Designed for work that needs a human touch.</p>
            </section>

            <section className="auth-panel">
                <div className="auth-form-wrap">
                    <div className="auth-mobile-brand">
                        <img src="/logo.png" alt="" /> <span>Promptly<span>.</span></span>
                    </div>
                    <div className="auth-heading">
                        <p className="auth-step">{step}</p>
                        <div className="auth-icon">{icon}</div>
                        <h2>{title}</h2>
                        <p>{subtitle}</p>
                    </div>
                    {children}
                </div>
            </section>
        </main>
    )
}

export default AuthShell
