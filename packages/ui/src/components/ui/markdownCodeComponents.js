import React from 'react';

const inlineCodeClass = inverted => `px-1.5 py-0.5 rounded-lg font-mono text-[13px] font-bold border ${inverted ? 'bg-white/15 text-white border-white/20' : 'bg-slate-100 dark:bg-slate-800/80 text-indigo-600 dark:text-indigo-400 border-slate-200/50'}`;

export const createMarkdownCodeComponents = ({ inverted = false, renderBlock }) => ({
    code: ({ node, className, children, ...props }) => React.createElement('code', {
        className: inlineCodeClass(inverted),
        ...props
    }, children),
    pre: ({ node, children, ...props }) => {
        const codeElement = React.Children.toArray(children).find(React.isValidElement);
        if (!codeElement) return React.createElement('pre', props, children);

        const languageMatch = /language-(\w+)/.exec(codeElement.props.className || '');
        return renderBlock({
            language: languageMatch ? languageMatch[1] : '',
            children: String(codeElement.props.children || '').replace(/\n$/, '')
        });
    }
});
