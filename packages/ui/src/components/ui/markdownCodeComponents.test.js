import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createMarkdownCodeComponents } from './markdownCodeComponents.js';

const tick = String.fromCharCode(96);
const renderMarkdown = content => {
    const components = createMarkdownCodeComponents({
        renderBlock: ({ language, children }) => React.createElement(
            'div',
            { 'data-code-block': language || 'code' },
            children
        )
    });
    return renderToStaticMarkup(React.createElement(
        ReactMarkdown,
        { remarkPlugins: [remarkGfm], components },
        content
    ));
};

test('renders inline code inside a table as compact code', () => {
    const html = renderMarkdown(`| Form ID | Title |\n| --- | --- |\n| ${tick}form_1${tick} | Contact Us |`);

    assert.doesNotMatch(html, /data-code-block/);
    assert.match(html, /<code class="[^"]*">form_1<\/code>/);
});

test('keeps fenced code as a code block and preserves its language', () => {
    const html = renderMarkdown(`${tick.repeat(3)}json\n{"ok":true}\n${tick.repeat(3)}`);

    assert.match(html, /data-code-block="json"/);
    assert.match(html, /\{&quot;ok&quot;:true\}/);
});
