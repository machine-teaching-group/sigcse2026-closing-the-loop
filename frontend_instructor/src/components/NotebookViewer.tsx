import React, { Suspense, useEffect, useMemo, useState } from 'react';
// Lazy-load heavy renderers to keep initial bundle small
const Markdown = React.lazy(() => import('react-markdown'));
// @ts-ignore
import remarkGfm from 'remark-gfm';
const LazySyntaxHighlighter: any = React.lazy(() =>
  import('react-syntax-highlighter').then((m) => ({ default: (m as any).Prism }))
);

export type NotebookViewerProps = {
  // Can be a parsed JSON object, JSON string, or null/undefined
  notebook: any;
  className?: string;
};

/**
 * Displays a read-only Jupyter Notebook.
 * - Accepts either a JSON object or a JSON string
 * - Renders nothing if notebook is falsy
 */
export default function NotebookViewer({ notebook, className }: NotebookViewerProps) {
  if (!notebook) return null;

  let nb: any = notebook;
  if (typeof notebook === 'string') {
    try {
      nb = JSON.parse(notebook);
    } catch (e) {
      console.error('NotebookViewer: failed to parse notebook JSON string', e);
      return <div className={className}>Invalid notebook content</div>;
    }
  }

  const cells: any[] = Array.isArray(nb?.cells) ? nb.cells : [];

  return (
    <div className={className}>
      <div className="space-y-6">
        {cells.length === 0 && (
          <div className="text-sm text-gray-600">Notebook has no cells.</div>
        )}
        {cells.map((cell: any, idx: number) => (
          <NotebookCell key={idx} cell={cell} />
        ))}
      </div>
    </div>
  );
}

function NotebookCell({ cell }: { cell: any }) {
  const type = cell?.cell_type;
  const source = normalizeSource(cell?.source);
  if (type === 'markdown') {
    return (
      <div className="prose-container">
        <Suspense fallback={<div className="text-sm text-gray-600">Rendering markdown…</div>}>
          <Markdown remarkPlugins={[remarkGfm]}>{source}</Markdown>
        </Suspense>
      </div>
    );
  }
  if (type === 'code') {
    const outputs = Array.isArray(cell?.outputs) ? cell.outputs : [];
    return (
      <div className="border rounded">
        <CodeBlock code={source} language={guessLang(cell)} />
        {outputs.length > 0 && (
          <div className="border-t bg-white p-3 space-y-3">
            {outputs.map((out: any, i: number) => (
              <OutputBlock key={i} output={out} />
            ))}
          </div>
        )}
      </div>
    );
  }
  // Raw or unknown cell types
  return (
    <div className="border rounded bg-white p-3">
      <pre className="whitespace-pre-wrap text-sm text-gray-700">{source}</pre>
    </div>
  );
}

function OutputBlock({ output }: { output: any }) {
  const type = output?.output_type;
  if (type === 'stream') {
    const text = normalizeSource(output?.text);
    return <pre className="text-sm text-gray-800 whitespace-pre-wrap">{text}</pre>;
  }
  const data = output?.data || {};
  // text/plain
  const text = normalizeSource(data['text/plain']);
  // images
  const png = data['image/png'];
  const svg = data['image/svg+xml'];
  // HTML
  const html = normalizeSource(data['text/html']);

  return (
    <div className="space-y-2">
      {text && (
        <CodeBlock code={text} language={guessOutputLang(output)} />
      )}
      {png && (
        <img
          className="max-w-full h-auto"
          src={`data:image/png;base64,${Array.isArray(png) ? png.join('') : png}`}
          alt="output"
        />
      )}
      {svg && (
        <div
          className="overflow-auto"
          // Note: svg can be array or string
          dangerouslySetInnerHTML={{ __html: Array.isArray(svg) ? svg.join('') : svg }}
        />
      )}
      {html && (
        <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: simpleSanitizeHtml(html) }} />
      )}
    </div>
  );
}

function normalizeSource(src: any): string {
  if (Array.isArray(src)) {
    // Preserve line breaks: if elements already contain \n, join as-is; otherwise, join with \n
    const anyHasNewline = src.some((s) => typeof s === 'string' && /\n$/.test(s));
    return anyHasNewline ? src.join('') : src.join('\n');
  }
  if (typeof src === 'string') return src;
  if (src == null) return '';
  try {
    return String(src);
  } catch {
    return '';
  }
}

function guessLang(cell: any): string | undefined {
  // Try to infer language from metadata or defaults to python
  const metaLang = cell?.metadata?.language || cell?.metadata?.kernelspec?.language;
  if (typeof metaLang === 'string') return metaLang.toLowerCase();
  return 'python';
}

function guessOutputLang(output: any): string | undefined {
  const txt = normalizeSource(output?.data?.['text/plain'] ?? output?.text);
  // Heuristic: if it looks like JSON, highlight as json
  if (/^\s*[{\[]/.test(txt)) return 'json';
  return 'python';
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [style, setStyle] = useState<any | null>(null);
  useEffect(() => {
    let mounted = true;
    import('react-syntax-highlighter/dist/esm/styles/prism').then((m) => {
      if (mounted) setStyle((m as any).oneLight || (m as any).default || null);
    }).catch(() => setStyle(null));
    return () => { mounted = false; };
  }, []);

  if (!style) {
    return (
      <pre className="bg-gray-50 p-3 overflow-auto" style={{ fontSize: '0.85rem', lineHeight: 1.4 }}>
        <code>{code}</code>
      </pre>
    );
  }
  return (
    <Suspense fallback={<pre className="bg-gray-50 p-3 overflow-auto" style={{ fontSize: '0.85rem', lineHeight: 1.4 }}><code>{code}</code></pre>}>
      <LazySyntaxHighlighter
        language={language}
        style={style}
        customStyle={{ margin: 0, background: '#fafafa', fontSize: '0.85rem', lineHeight: 1.4 }}
      >
        {code}
      </LazySyntaxHighlighter>
    </Suspense>
  );
}

// Very small and conservative Markdown renderer to avoid extra deps.
// Supports headings (#), inline code `code`, bold **text**, italics *text*, and paragraphs.
function simpleMarkdownToHtml(src: string): string {
  const safe = simpleSanitizeHtml(src);
  const lines = safe.split(/\r?\n/);
  const html: string[] = [];
  let para: string[] = [];

  const flushPara = () => {
    if (para.length > 0) {
      html.push(`<p>${inlineMd(para.join(' '))}</p>`);
      para = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (/^\s*$/.test(trimmed)) { flushPara(); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h) {
      flushPara();
      const level = h[1].length;
      html.push(`<h${level}>${inlineMd(h[2])}</h${level}>`);
    } else {
      para.push(trimmed);
    }
  }
  flushPara();
  return html.join('\n');
}

function inlineMd(text: string): string {
  // inline code
  let out = text.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  // bold
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // italics
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return out;
}

// Extremely conservative sanitizer: escape angle brackets to avoid HTML injection.
function simpleSanitizeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
