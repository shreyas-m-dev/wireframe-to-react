import React from 'react';

// The pipeline's real 7 steps, matching services/*. Order carries real
// information here (each step's output feeds the next), so numbering is
// earned, not decorative.
export const STEPS = [
  { id: 'preprocess', label: 'Preprocess', desc: 'validate · normalize' },
  { id: 'detect', label: 'Detect', desc: 'CV element detection' },
  { id: 'schema', label: 'Schema', desc: 'row/col tree build' },
  { id: 'rag', label: 'RAG', desc: 'template retrieval' },
  { id: 'codegen', label: 'Generate', desc: 'schema → JSX' },
  { id: 'cgda', label: 'CGDA', desc: 'whitelist filter' },
  { id: 'validate', label: 'Validate', desc: 'tree diff + retry' },
];

/**
 * status: 'idle' | 'active' | 'done' | 'error', keyed by step id.
 */
export default function PipelineSchematic({ status }) {
  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-start min-w-[760px]">
        {STEPS.map((step, i) => {
          const st = status[step.id] || 'idle';
          const isLast = i === STEPS.length - 1;
          return (
            <React.Fragment key={step.id}>
              <div className="flex flex-col items-center w-[100px] shrink-0">
                <div
                  className={[
                    'w-11 h-11 rounded-lg flex items-center justify-center font-mono text-xs font-semibold border transition-all duration-300',
                    st === 'idle' && 'border-border text-text-faint bg-panel-2',
                    st === 'active' && 'border-accent text-accent bg-accent/10 node-active',
                    st === 'done' && 'border-mint text-mint bg-mint/10',
                    st === 'error' && 'border-danger text-danger bg-danger/10',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-label={`Step ${i + 1}: ${step.label} — ${st}`}
                >
                  {st === 'done' ? '✓' : String(i + 1).padStart(2, '0')}
                </div>
                <span
                  className={[
                    'mt-2 text-xs font-medium',
                    st === 'idle' ? 'text-text-faint' : 'text-text',
                  ].join(' ')}
                >
                  {step.label}
                </span>
                <span className="mt-0.5 text-[10px] text-text-faint text-center leading-tight px-1">
                  {step.desc}
                </span>
              </div>
              {!isLast && (
                <div className="flex items-center flex-1 min-w-[16px] mt-[22px]">
                  <div
                    className={[
                      'h-px w-full transition-colors duration-300',
                      st === 'done' ? 'bg-mint/50' : 'bg-border',
                    ].join(' ')}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
