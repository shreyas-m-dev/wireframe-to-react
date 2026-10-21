import React, { useMemo } from 'react';

// A small, dependency-free tokenizer good enough for the JSX this pipeline
// generates (standard tags, className/attrs, string literals, braces).
// Not a full JS/JSX lexer — doesn't need to be, since it only ever renders
// output from services/codegen, not arbitrary user code.
function tokenize(line) {
  const tokens = [];
  const re = /(<\/?[A-Za-z][A-Za-z0-9.]*)|(\/?>)|([a-zA-Z-]+(?==))|("(?:[^"\\]|\\.)*")|(\{|\})/g;
  let lastIndex = 0;
  let match;
  while ((match = re.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: line.slice(lastIndex, match.index), cls: '' });
    }
    const [full, tagOpen, bracket, attr, str, brace] = match;
    if (tagOpen) tokens.push({ text: tagOpen, cls: 'text-accent' });
    else if (bracket) tokens.push({ text: bracket, cls: 'text-accent' });
    else if (attr) tokens.push({ text: attr, cls: 'text-success' });
    else if (str) tokens.push({ text: str, cls: 'text-warning' });
    else if (brace) tokens.push({ text: brace, cls: 'text-text-subtle' });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < line.length) tokens.push({ text: line.slice(lastIndex), cls: '' });
  return tokens;
}

export default function CodeView({ code, title = 'Code' }) {
  const lines = useMemo(() => (code || '').split('\n'), [code]);
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code || ''); } catch { return; } // clipboard blocked: leave the button unchanged
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="font-mono text-code overflow-auto scroll-thin max-h-[62vh] rounded-md border border-border bg-surface-2">
      <div className="sticky top-0 flex justify-between items-center px-3 py-2 border-b border-border bg-surface-2 font-sans">
        <span className="text-caption normal-case tracking-normal text-text-subtle">{title}</span>
        <button onClick={copy} className="text-label px-2 py-1 border border-border-strong rounded-sm hover:text-accent hover:border-accent">{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} className="hover:bg-surface-1/60">
              <td className="select-none text-right pr-4 pl-3 text-text-subtle w-10 align-top">
                {i + 1}
              </td>
              <td className="pr-4 whitespace-pre text-text align-top">
                {tokenize(line).map((tok, j) => (
                  <span key={j} className={tok.cls}>
                    {tok.text}
                  </span>
                ))}
                {line === '' ? '\u00A0' : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
