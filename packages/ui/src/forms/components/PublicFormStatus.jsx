import React from 'react'

const FORM_STATUS = {
    notFound: {
        title: 'Form Not Found',
        defaultMessage: 'This form is no longer available or the link is invalid.',
        iconClassName: 'bg-red-50 border-red-100',
        stroke: '#ef4444',
        icon: 'alert'
    },
    closed: {
        title: 'Form Closed',
        defaultMessage: 'This form is no longer accepting responses.',
        iconClassName: 'bg-amber-50 border-amber-100',
        stroke: '#d97706',
        icon: 'lock'
    },
    submitted: {
        title: 'Already Submitted',
        defaultMessage: 'Thank you! Your response has been recorded. You may only submit this form once per browser.',
        iconClassName: 'bg-emerald-50 border-emerald-100',
        stroke: '#10b981',
        icon: 'check'
    }
}

function FormStatusIcon({ type, stroke }) {
    if (type === 'lock') {
        return (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
        )
    }

    if (type === 'check') {
        return (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        )
    }

    return (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
    )
}

function PublicFormStatus({ status, message }) {
    const config = FORM_STATUS[status]

    return (
        <div className="app-status-page">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 shadow-sm border ${config.iconClassName}`}>
                <FormStatusIcon type={config.icon} stroke={config.stroke} />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-2">{config.title}</h1>
            <p className="text-slate-500 font-medium text-center max-w-sm">{message || config.defaultMessage}</p>
        </div>
    )
}

export default PublicFormStatus
