import React from 'react'

const stats = [
    { label: 'Hours saved per week', value: '12.4', detail: 'Average per admin after 30 days' },
    { label: 'Reduction in manual tasks', value: '48%', detail: 'Time reclaimed from email + data entry' },
    { label: 'Adoption by non-technical staff', value: '92%', detail: 'Teams using prompts daily' },
    { label: 'Time to first workflow', value: '43 min', detail: 'Launch a usable agent in one session' }
]

const featureBlocks = [
    {
        title: 'Natural language to structured action',
        copy: 'Admins describe outcomes; the agent writes, validates, and runs the steps safely.',
        detail: 'Automatic parameter checks, previews, and rollback options before execution.',
        icon: 'NL'
    },
    {
        title: 'Human-in-the-loop approvals',
        copy: 'Insert review checkpoints anywhere. Require sign-off before sending emails or syncing data.',
        detail: 'Granular approval tiers mapped to roles, with expiration and reminders.',
        icon: 'AP'
    },
    {
        title: 'Audit-ready by default',
        copy: 'Every prompt, dataset, and action is recorded with a replayable timeline.',
        detail: 'Exportable audit logs, data residency controls, and SSO enforcement.',
        icon: 'AU'
    }
]

const workflows = [
    {
        title: 'Email triage + follow-ups',
        category: 'Inbox automations',
        steps: [
            'Draft responses with the right template and tone',
            'Schedule follow-ups and reminders automatically',
            'Log outcomes into CRM or ticketing tools'
        ],
        tags: ['Gmail', 'Outlook', 'Templates'],
        icon: 'EM'
    },
    {
        title: 'Spreadsheet upkeep',
        category: 'Data hygiene',
        steps: [
            'Normalize phone, address, and currency formats',
            'Run deduplication with safe previews',
            'Publish cleansed sheets back to storage'
        ],
        tags: ['Sheets', 'Excel', 'CSV'],
        icon: 'SH'
    },
    {
        title: 'Vendor onboarding kits',
        category: 'Intake automation',
        steps: [
            'Collect documents via secure upload links',
            'Check completeness and policy compliance',
            'Notify stakeholders and create tasks'
        ],
        tags: ['Forms', 'Policy', 'Tasks'],
        icon: 'ON'
    },
    {
        title: 'Weekly reporting packets',
        category: 'Ops reporting',
        steps: [
            'Pull KPIs from sheets and databases',
            'Generate decks and summaries with insights',
            'Distribute to channels with approvals'
        ],
        tags: ['Slides', 'Slack', 'Email'],
        icon: 'RP'
    }
]

const automationLibrary = [
    {
        title: 'Clean & normalize CSVs',
        copy: 'Detect missing fields, auto-fix formatting, and surface anomalies before publishing.',
        tags: ['Validation', 'Governance', 'Quality'],
        time: '~8 minutes saved per run',
        icon: 'QC'
    },
    {
        title: 'Calendar + travel coordinator',
        copy: 'Propose itineraries, hold slots, and generate confirmations from a single prompt.',
        tags: ['Scheduling', 'Email', 'Docs'],
        time: '15 minutes saved per request',
        icon: 'CT'
    },
    {
        title: 'Form intake to systems',
        copy: 'Route submissions to spreadsheets, CRMs, or ticketing queues with validation.',
        tags: ['Forms', 'Routing', 'Sync'],
        time: '10 minutes saved per submission',
        icon: 'FI'
    },
    {
        title: 'Inbox summarizer + tasks',
        copy: 'Summarize threads, extract owners and due dates, and create follow-ups automatically.',
        tags: ['Email', 'Tasks', 'Summaries'],
        time: '6 minutes saved per thread',
        icon: 'IS'
    },
    {
        title: 'Spreadsheet QA reviewer',
        copy: 'Highlight outliers, inconsistent labels, and stale records with suggested fixes.',
        tags: ['Data QA', 'Alerts', 'Previews'],
        time: '12 minutes saved per sheet',
        icon: 'QA'
    },
    {
        title: 'Multi-channel announcements',
        copy: 'Draft announcements, adapt tone per channel, and track read receipts.',
        tags: ['Comms', 'Templates', 'Tracking'],
        time: '8 minutes saved per send',
        icon: 'MA'
    }
]

const integrations = [
    { name: 'Google Workspace', detail: 'Mail, Calendar, Drive', icon: 'G' },
    { name: 'Microsoft 365', detail: 'Outlook, Excel, SharePoint', icon: 'M' },
    { name: 'Slack', detail: 'Channels, approvals, alerts', icon: 'S' },
    { name: 'Airtable', detail: 'Bases, views, automations', icon: 'A' },
    { name: 'Salesforce', detail: 'CRM, cases, contacts', icon: 'SF' },
    { name: 'HubSpot', detail: 'Deals, tickets, contacts', icon: 'HS' },
    { name: 'Notion', detail: 'Pages, databases', icon: 'N' },
    { name: 'Jira', detail: 'Issues, sprints, SLAs', icon: 'J' }
]

const steps = [
    {
        title: 'Describe the outcome',
        copy: 'Admins start with a simple instruction-no syntax, just intent.',
        detail: 'The agent translates requests into structured tasks and data requirements.'
    },
    {
        title: 'Review the plan',
        copy: 'Preview steps, datasets, and risk checks before anything runs.',
        detail: 'Diff views for data changes, policy flags, and estimated time to complete.'
    },
    {
        title: 'Approve and execute',
        copy: 'Route approvals to the right owners, then let the agent complete the work.',
        detail: 'Progress trackers, live logs, and safe rollback options keep teams confident.'
    },
    {
        title: 'Measure and improve',
        copy: 'See time saved, error reduction, and adoption across teams.',
        detail: 'Analytics for every workflow plus recommended optimizations.'
    }
]

const testimonials = [
    {
        text: 'Our admins ship polished responses and updates in minutes instead of hours. The approval checkpoints keep IT comfortable.',
        name: 'Nina Delgado',
        role: 'Director of Administration, Brightline',
        initials: 'ND'
    },
    {
        text: 'The agent handles the messy spreadsheet work and tells us exactly what will change. Zero surprises, huge time savings.',
        name: 'Marcus Chen',
        role: 'Ops Manager, Northwind Services',
        initials: 'MC'
    },
    {
        text: 'We stood up intake workflows in one afternoon. Non-technical staff can now maintain processes on their own.',
        name: 'Priya Kapoor',
        role: 'People Operations, Summit Health',
        initials: 'PK'
    },
    {
        text: 'Approval routing and audit logs made security sign-off simple. Productivity gains were immediate.',
        name: 'Elliot Hayes',
        role: 'IT Lead, Haven Logistics',
        initials: 'EH'
    }
]

const plans = [
    {
        tier: 'Starter',
        name: 'Essential',
        price: '$19 / seat / mo',
        description: 'Launch core admin automations with approvals and audit trails.',
        features: ['Unlimited prompt kits', '5 live workflows', 'Email + CSV automations', 'Role-based approvals'],
        cta: 'Start free',
        popular: false
    },
    {
        tier: 'Growth',
        name: 'Operational',
        price: '$39 / seat / mo',
        description: 'Scale across teams with advanced governance and analytics.',
        features: ['All Starter features', 'Unlimited workflows', 'SSO + SCIM', 'Data residency + DLP'],
        cta: 'Book a demo',
        popular: true
    },
    {
        tier: 'Enterprise',
        name: 'Enterprise',
        price: "Let's talk",
        description: 'Custom controls, private deployments, and success partnerships.',
        features: ['Dedicated environment', 'Custom approvals', 'VPC + SIEM export', 'Premium support'],
        cta: 'Talk to sales',
        popular: false
    }
]

const faqs = [
    {
        q: 'How do approvals work?',
        a: 'Insert approvals anywhere in a workflow. Map approvers to roles, set thresholds, and require authentication before execution.'
    },
    {
        q: 'Can non-technical staff maintain workflows?',
        a: 'Yes. Workflows are created and edited in natural language. Each step is explained with previews so teams can trust the output.'
    },
    {
        q: 'How is data secured?',
        a: 'We use least-privilege connectors, encryption in transit and at rest, audit logging, and optional data residency controls.'
    },
    {
        q: 'What does onboarding look like?',
        a: 'Most teams launch a pilot in under an hour using templates. We provide guided setup, best practices, and change management kits.'
    }
]

function LandingPage() {
    return (
        <div className="page">
            <div className="ambient" />

            <header className="nav">
                <div className="brand">
                    <div className="logo">AI</div>
                    <div>
                        <p className="eyebrow">Promptly</p>
                        <strong>Admin Ops AI</strong>
                    </div>
                </div>
                <nav className="nav-links">
                    <a href="#benefits">Value</a>
                    <a href="#workflows">Workflows</a>
                    <a href="#library">Library</a>
                    <a href="#pricing">Pricing</a>
                    <a href="#faq">FAQ</a>
                </nav>
                <div className="nav-actions">
                    <button className="ghost">Book a demo</button>
                    <button className="solid">Start free</button>
                </div>
            </header>

            <main>
                <section className="hero" id="top">
                    <div className="hero-copy">
                        <div className="pill-row">
                            <span className="pill">Enterprise conversational automation</span>
                            <span className="pill pill-soft">Built for operations leaders</span>
                        </div>
                        <h1>Enterprise-grade agents that translate admin requests into compliant, auditable execution.</h1>
                        <p className="lede">
                            Standardize how work gets done: data entry, email prep, spreadsheet hygiene, and approvals-driven by secure
                            natural language, governed by policy, and visible end-to-end for admins and IT.
                        </p>
                        <div className="hero-ctas">
                            <button className="solid lg">Launch workspace</button>
                            <button className="ghost lg">See it in action</button>
                        </div>
                        <div className="trust">
                            <div className="avatar-stack">
                                <span className="avatar">AP</span>
                                <span className="avatar">HR</span>
                                <span className="avatar">OPS</span>
                            </div>
                            <p>
                                <strong>1,800+ hours saved</strong> and <strong>92% adoption</strong> across admin teams.
                            </p>
                        </div>
                    </div>
                    <div className="hero-panel">
                        <div className="panel-header">
                            <div>
                                <p className="eyebrow">Live agent</p>
                                <strong>"Atlas" - Operations Control</strong>
                            </div>
                            <span className="badge">Compliant</span>
                        </div>
                        <div className="conversation">
                            <div className="bubble user">"Clean yesterday's survey CSV and stage to CRM with duplicates removed."</div>
                            <div className="bubble bot">
                                Acknowledge. Plan: validate schema, deduplicate by email, normalize phone formats, run PII checks, then
                                stage to CRM sandbox for approval. Proceed?
                            </div>
                            <div className="bubble user small">"Proceed. Share the diff before syncing."</div>
                            <div className="bubble bot highlight">
                                Review ready: 312 rows cleaned, 17 duplicates flagged, 4 formatting fixes. Approve sync to production?
                            </div>
                        </div>
                        <div className="panel-footer">
                            <div className="signal">
                                <span />
                                <span />
                                <span />
                            </div>
                            <p>Safe actions, human-in-the-loop checkpoints, and full audit history.</p>
                        </div>
                    </div>
                </section>

                <section className="stats" id="benefits">
                    {stats.map((stat) => (
                        <div className="stat-card" key={stat.label}>
                            <p className="eyebrow">{stat.label}</p>
                            <h2>{stat.value}</h2>
                            <p className="muted">{stat.detail}</p>
                        </div>
                    ))}
                </section>

                <section className="section" id="benefits">
                    <div className="section-head">
                        <p className="eyebrow">Operational control</p>
                        <div>
                            <h2>Automate routine work without asking engineering.</h2>
                            <p className="muted">Every workflow is explained in plain language, with safety checks, approvals, and live status.</p>
                        </div>
                    </div>
                    <div className="grid three">
                        {featureBlocks.map((feature) => (
                            <article className="card" key={feature.title}>
                                <div className="icon">{feature.icon}</div>
                                <h3>{feature.title}</h3>
                                <p>{feature.copy}</p>
                                <p className="muted">{feature.detail}</p>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="section" id="workflows">
                    <div className="section-head">
                        <p className="eyebrow">Pre-built workflows</p>
                        <div>
                            <h2>Launch task-ready assistants in minutes.</h2>
                            <p className="muted">Pick a template, add your sources, and the agent guides admins with guardrails.</p>
                        </div>
                    </div>
                    <div className="grid two">
                        {workflows.map((flow) => (
                            <article className="card tall" key={flow.title}>
                                <div className="row">
                                    <div className="icon">{flow.icon}</div>
                                    <div>
                                        <h3>{flow.title}</h3>
                                        <p className="muted">{flow.category}</p>
                                    </div>
                                </div>
                                <ul>
                                    {flow.steps.map((item) => (
                                        <li key={item}>{item}</li>
                                    ))}
                                </ul>
                                <div className="chips">
                                    {flow.tags.map((tag) => (
                                        <span className="chip" key={tag}>
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="section" id="library">
                    <div className="section-head">
                        <p className="eyebrow">Automation library</p>
                        <div>
                            <h2>Curated prompt kits for daily admin moves.</h2>
                            <p className="muted">Structured prompts with field-level validation, reusable across teams.</p>
                        </div>
                    </div>
                    <div className="grid three">
                        {automationLibrary.map((auto) => (
                            <article className="card" key={auto.title}>
                                <div className="row">
                                    <div className="icon">{auto.icon}</div>
                                    <div>
                                        <h3>{auto.title}</h3>
                                        <p className="muted">{auto.time}</p>
                                    </div>
                                </div>
                                <p>{auto.copy}</p>
                                <div className="chips">
                                    {auto.tags.map((tag) => (
                                        <span className="chip soft" key={tag}>
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="section integrations">
                    <div className="section-head">
                        <p className="eyebrow">Trusted connections</p>
                        <div>
                            <h2>Connect to the tools you already use.</h2>
                            <p className="muted">Native connectors with scoped permissions and audit trails.</p>
                        </div>
                    </div>
                    <div className="grid four">
                        {integrations.map((integration) => (
                            <div className="integration" key={integration.name}>
                                <div className="logo-pill">{integration.icon}</div>
                                <strong>{integration.name}</strong>
                                <p className="muted">{integration.detail}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="section process">
                    <div className="section-head">
                        <p className="eyebrow">How it works</p>
                        <div>
                            <h2>From prompt to production-ready action.</h2>
                            <p className="muted">Clear review points ensure admins stay in control while AI does the heavy lifting.</p>
                        </div>
                    </div>
                    <div className="steps">
                        {steps.map((step, index) => (
                            <div className="step" key={step.title}>
                                <div className="step-num">0{index + 1}</div>
                                <div>
                                    <h3>{step.title}</h3>
                                    <p>{step.copy}</p>
                                    <p className="muted">{step.detail}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="section" id="testimonials">
                    <div className="section-head">
                        <p className="eyebrow">Customer stories</p>
                        <div>
                            <h2>Built for busy admin teams.</h2>
                            <p className="muted">Human-friendly prompts, transparent actions, measurable savings.</p>
                        </div>
                    </div>
                    <div className="grid two">
                        {testimonials.map((quote) => (
                            <article className="quote" key={quote.name}>
                                <p className="quote-text">"{quote.text}"</p>
                                <div className="row">
                                    <div className="avatar">{quote.initials}</div>
                                    <div>
                                        <strong>{quote.name}</strong>
                                        <p className="muted">{quote.role}</p>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="section pricing" id="pricing">
                    <div className="section-head">
                        <p className="eyebrow">Pricing</p>
                        <div>
                            <h2>Start fast, scale securely.</h2>
                            <p className="muted">Simple plans with approvals, audit logs, and SOC 2 controls.</p>
                        </div>
                    </div>
                    <div className="grid three">
                        {plans.map((plan) => (
                            <article className={`card plan${plan.popular ? ' highlight' : ''}`} key={plan.name}>
                                <div className="row space-between">
                                    <div>
                                        <p className="eyebrow">{plan.tier}</p>
                                        <h3>{plan.name}</h3>
                                    </div>
                                    {plan.popular && <span className="badge">Popular</span>}
                                </div>
                                <p className="price">{plan.price}</p>
                                <p className="muted">{plan.description}</p>
                                <ul className="features">
                                    {plan.features.map((item) => (
                                        <li key={item}>{item}</li>
                                    ))}
                                </ul>
                                <button className="solid full">{plan.cta}</button>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="section faq" id="faq">
                    <div className="section-head">
                        <p className="eyebrow">FAQ</p>
                        <div>
                            <h2>Answers for admins and IT.</h2>
                            <p className="muted">Everything you need to know before launching.</p>
                        </div>
                    </div>
                    <div className="grid two">
                        {faqs.map((faq) => (
                            <article className="card" key={faq.q}>
                                <h3>{faq.q}</h3>
                                <p>{faq.a}</p>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="cta-final">
                    <div>
                        <p className="eyebrow">Ready to reclaim your week?</p>
                        <h2>Give your admins a conversational co-pilot.</h2>
                        <p className="muted">Launch in under an hour with guided templates, approvals, and data governance built in.</p>
                    </div>
                    <div className="cta-actions">
                        <button className="solid lg">Start free</button>
                        <button className="ghost lg">Talk to us</button>
                    </div>
                </section>
            </main>
        </div>
    )
}

export default LandingPage
