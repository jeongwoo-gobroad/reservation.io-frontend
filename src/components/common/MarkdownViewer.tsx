'use client';

import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownViewerProps {
  content: string;
}

function isSafeHref(href?: string): href is string {
  if (!href) return false;
  return /^(https?:|mailto:|tel:|\/|#)/i.test(href);
}

const markdownComponents: Components = {
  a: ({ node, href, children, ...props }) => {
    void node;
    if (!isSafeHref(href)) return <span>{children}</span>;
    const external = /^https?:/i.test(href);
    return (
      <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined} {...props}>
        {children}
      </a>
    );
  },
  img: ({ node, alt }) => {
    void node;
    return (
      <span className="markdown-image-placeholder">
        {alt ? `[image: ${alt}]` : '[image omitted]'}
      </span>
    );
  },
};

export default function MarkdownViewer({ content }: MarkdownViewerProps) {
  return (
    <div className="markdown-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{content}</ReactMarkdown>
    </div>
  );
}
