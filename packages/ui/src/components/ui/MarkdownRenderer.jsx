import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const parseBr = (children) => {
    if (typeof children === 'string') {
        const parts = children.split(/<br\s*\/?>/gi);
        if (parts.length === 1) return children;
        return parts.map((part, index) => (
            <React.Fragment key={index}>
                {part}
                {index < parts.length - 1 && <br className="my-1 block" />}
            </React.Fragment>
        ));
    }
    if (Array.isArray(children)) {
        return children.map((child, index) => (
            <React.Fragment key={index}>
                {parseBr(child)}
            </React.Fragment>
        ));
    }
    if (React.isValidElement(children) && children.props && children.props.children) {
        return React.cloneElement(children, { ...children.props, children: parseBr(children.props.children) });
    }
    return children;
};

/**
 * Premium Markdown Renderer using react-markdown.
 * Styled with Tailwind CSS to match Promptly's workspace theme.
 */
export default function MarkdownRenderer({ content, className = '', inverted = false }) {
    const textClass = inverted ? 'text-white/90' : 'text-slate-700';
    const headingClass = inverted ? 'text-white' : 'text-slate-900';
    const listClass = inverted ? 'text-white/90 list-disc pl-5 mb-3.5 space-y-1' : 'list-disc pl-5 mb-3.5 space-y-1 text-slate-700';
    const olClass = inverted ? 'text-white/90 list-decimal pl-5 mb-3.5 space-y-1' : 'list-decimal pl-5 mb-3.5 space-y-1 text-slate-700';
    const linkClass = inverted ? 'text-white hover:text-white/80 underline font-semibold transition-colors' : 'text-indigo-600 hover:text-indigo-800 underline font-semibold transition-colors';

    return (
        <div className={`prose max-w-none ${inverted ? 'text-white/90' : 'text-slate-800 dark:text-slate-200'} text-[14px] leading-relaxed ${className}`}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    // Headers
                    h1: ({ node, children, ...props }) => (
                        <h1 className={`text-xl font-extrabold mt-4 mb-2 tracking-tight ${headingClass}`} {...props}>
                            {children}
                        </h1>
                    ),
                    h2: ({ node, children, ...props }) => (
                        <h2 className={`text-lg font-bold mt-3 mb-2 tracking-tight ${headingClass}`} {...props}>
                            {children}
                        </h2>
                    ),
                    h3: ({ node, children, ...props }) => (
                        <h3 className={`text-base font-bold mt-2.5 mb-1 tracking-tight ${headingClass}`} {...props}>
                            {children}
                        </h3>
                    ),
                    
                    // Paragraphs
                    p: ({ node, children, ...props }) => (
                        <p className={`mb-2.5 last:mb-0 leading-relaxed font-normal ${textClass}`} {...props}>
                            {parseBr(children)}
                        </p>
                    ),

                    // Lists
                    ul: ({ node, children, ...props }) => (
                        <ul className={listClass} {...props}>
                            {children}
                        </ul>
                    ),
                    ol: ({ node, children, ...props }) => (
                        <ol className={olClass} {...props}>
                            {children}
                        </ol>
                    ),
                    li: ({ node, children, ...props }) => (
                        <li className="text-[14px] font-normal leading-relaxed" {...props}>
                            {children}
                        </li>
                    ),

                    // Links
                    a: ({ node, href, children, ...props }) => (
                        <a 
                            href={href} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className={linkClass}
                            {...props}
                        >
                            {children}
                        </a>
                    ),

                    // Blockquotes
                    blockquote: ({ node, children, ...props }) => (
                        <blockquote 
                            className={`border-l-4 border-slate-300 pl-4 py-1 my-3 rounded-r-lg italic font-medium ${inverted ? 'bg-white/10 text-white' : 'bg-slate-50 text-slate-600'}`}
                            {...props}
                        >
                            {children}
                        </blockquote>
                    ),

                    // Tables
                    table: ({ node, children, ...props }) => (
                        <div className={`w-full overflow-x-auto my-4 rounded-xl border shadow-sm ${inverted ? 'border-white/20' : 'border-slate-200'}`}>
                            <table className="w-full text-left border-collapse text-[13.5px]" {...props}>
                                {children}
                            </table>
                        </div>
                    ),
                    thead: ({ node, children, ...props }) => (
                        <thead className={`border-b ${inverted ? 'bg-white/10 border-white/20' : 'bg-slate-50 border-slate-200'}`} {...props}>
                            {children}
                        </thead>
                    ),
                    tbody: ({ node, children, ...props }) => (
                        <tbody className={`divide-y ${inverted ? 'divide-white/10' : 'divide-slate-100/80'}`} {...props}>
                            {children}
                        </tbody>
                    ),
                    tr: ({ node, children, ...props }) => (
                        <tr className={`transition-colors ${inverted ? 'hover:bg-white/5' : 'hover:bg-slate-50/50'}`} {...props}>
                            {children}
                        </tr>
                    ),
                    th: ({ node, children, ...props }) => (
                        <th className={`px-4 py-3 font-semibold whitespace-nowrap ${inverted ? 'text-white' : 'text-slate-700'}`} {...props}>
                            {parseBr(children)}
                        </th>
                    ),
                    td: ({ node, children, ...props }) => (
                        <td className={`px-4 py-3 align-top ${inverted ? 'text-white/80' : 'text-slate-600'}`} {...props}>
                            {parseBr(children)}
                        </td>
                    ),

                    // Code
                    code: ({ node, inline, className: codeClassName, children, ...props }) => {
                        const match = /language-(\w+)/.exec(codeClassName || '');
                        const lang = match ? match[1] : '';

                        if (inline) {
                            return (
                                <code 
                                    className={`px-1.5 py-0.5 rounded-lg font-mono text-[13px] font-bold border ${inverted ? 'bg-white/15 text-white border-white/20' : 'bg-slate-100 dark:bg-slate-800/80 text-indigo-600 dark:text-indigo-400 border-slate-200/50'}`}
                                    {...props}
                                >
                                    {children}
                                </code>
                            );
                        }

                        return (
                            <CodeBlock language={lang} {...props}>
                                {String(children).replace(/\n$/, '')}
                            </CodeBlock>
                        );
                    }
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}

/**
 * Custom CodeBlock component with Copy to Clipboard functionality.
 */
function CodeBlock({ children, language }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(children);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    };

    return (
        <div className="relative my-4 rounded-2xl overflow-hidden border border-slate-200/80 bg-slate-900 text-slate-100 shadow-lg group">
            {/* Header / Info bar */}
            <div className="flex items-center justify-between px-4 py-2 bg-slate-800/90 border-b border-slate-700/60 shrink-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {language || 'code'}
                </span>
                <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-700/50 hover:bg-slate-700 hover:text-white transition-all text-slate-300"
                >
                    {copied ? (
                        <>
                            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <span>Copied!</span>
                        </>
                    ) : (
                        <>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                            <span>Copy</span>
                        </>
                    )}
                </button>
            </div>
            
            {/* Code Content */}
            <pre className="p-4 overflow-x-auto font-mono text-[12.5px] leading-relaxed select-all scrollbar-thin">
                <code>{children}</code>
            </pre>
        </div>
    );
}
