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
    else if (attr) tokens.push({ text: attr, cls: 'text-mint' });
    else if (str) tokens.push({ text: str, cls: 'text-amber' });
    else if (brace) tokens.push({ text: brace, cls: 'text-text-dim' });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < line.length) tokens.push({ text: line.slice(lastIndex), cls: '' });
  return tokens;
}

export default function CodeView({ code, title = 'Code' }) {
  const lines = useMemo(() => (code || '').split('\n'), [code]);
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code || '');
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="font-mono text-[13px] leading-6 overflow-auto max-h-[420px]">
      <div className="flex justify-between items-center px-3 py-2 border-b border-border font-sans">
        <span className="text-xs text-text-dim">{title}</span>
        <button onClick={copy} className="text-xs px-2 py-1 border border-border rounded hover:text-accent hover:border-accent">{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} className="hover:bg-panel-2/60">
              <td className="select-none text-right pr-4 pl-3 text-text-faint w-10 align-top">
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
