import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';

const SUGGESTIONS = [
  'What’s still unpaid, money in and money out?',
  'Has the brand opened our PayPal invoice?',
  'Who is due in the next 3 days?',
  'Send the brand a friendly invoice reminder',
];

const TOOL_LABEL = {
  cleared_overview: 'Campaign overview',
  cleared_deliverables: 'Deliverables',
  cleared_deliverable_evidence: 'Check evidence',
  cleared_recheck: 'Start re-check',
  list_invoices: 'list_invoices',
  get_invoice: 'get_invoice',
  search_invoicing: 'search_invoicing',
  send_invoice_reminder: 'send_invoice_reminder',
  list_transactions: 'list_transactions',
  get_merchant_insights: 'get_merchant_insights',
};

/** Operator chat. Answers come from Gemini using PayPal's Agent Toolkit and Cleared's records. */
export default function AskCleared() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]); // {role, content, toolCalls?}
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, busy]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const send = async (text) => {
    const q = text.trim();
    if (!q || busy) return;
    const next = [...msgs, { role: 'user', content: q }];
    setMsgs(next);
    setInput('');
    setBusy(true);
    try {
      const r = await api('/agent', { method: 'POST', body: { messages: next.map(({ role, content }) => ({ role, content })) } });
      setMsgs([...next, { role: 'assistant', content: r.reply, toolCalls: r.toolCalls }]);
    } catch (e) {
      setMsgs([...next, { role: 'assistant', content: `Sorry, something went wrong: ${e.message}`, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button className="ask-fab" onClick={() => setOpen(true)}>
        <span aria-hidden>✦</span> Ask Cleared
      </button>
    );
  }

  return (
    <section className="ask-panel" aria-label="Ask Cleared">
      <header className="ask-head">
        <div>
          <div style={{ fontWeight: 700 }}>Ask Cleared</div>
          <div className="muted small">Gemini + PayPal Agent Toolkit · can’t move money</div>
        </div>
        <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close assistant">
          ×
        </button>
      </header>

      <div className="ask-body">
        {!msgs.length && (
          <div className="ask-empty">
            <p className="muted small" style={{ margin: '0 0 10px' }}>
              Ask about campaigns, creators, invoices and payouts. Answers use live PayPal data.
            </p>
            {SUGGESTIONS.map((s) => (
              <button key={s} className="ask-suggest" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`ask-msg ask-${m.role}${m.error ? ' ask-error' : ''}`}>
            {m.toolCalls?.length > 0 && (
              <div className="ask-tools">
                {m.toolCalls.map((c, j) => (
                  <span key={j} className={`ask-tool ${c.source === 'Cleared' ? 'is-cleared' : 'is-paypal'}`} title={JSON.stringify(c.args)}>
                    {c.source === 'Cleared' ? 'Cleared' : 'PayPal'} · {TOOL_LABEL[c.tool] ?? c.tool}
                  </span>
                ))}
              </div>
            )}
            <div className="ask-text">{m.content}</div>
          </div>
        ))}
        {busy && (
          <div className="ask-msg ask-assistant">
            <div className="ask-text muted">
              <span className="spinner" style={{ display: 'inline-block', marginRight: 8, verticalAlign: -1 }} />
              Looking that up…
            </div>
          </div>
        )}
        <div ref={end} />
      </div>

      <form
        className="ask-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input ref={inputRef} className="input" placeholder="Ask about money, creators, invoices…" value={input} onChange={(e) => setInput(e.target.value)} maxLength={2000} />
        <button className="btn btn-primary" disabled={busy || !input.trim()}>
          Ask
        </button>
      </form>
    </section>
  );
}
