// "Ask Cleared": an operator chat. Gemini answers questions about campaigns and money using
// PayPal's official Agent Toolkit (invoices, transactions, insights) plus read-only views of
// Cleared's own records. It can nudge a brand about an invoice, but it can never move money:
// payouts only happen through the verify → policy → pay pipeline.
import { tool, zodSchema } from 'ai';
import { PayPalAgentToolkit } from '@paypal/agent-toolkit/ai-sdk';
import { z } from 'zod';
import { config } from './config.js';
import { generateContent } from './gemini.js';
import { one, all } from './db.js';
import { recheckNow } from './pipeline.js';

let paypalTools;
function getPayPalTools() {
  if (paypalTools) return paypalTools;
  const toolkit = new PayPalAgentToolkit({
    clientId: config.paypal.clientId,
    clientSecret: config.paypal.clientSecret,
    configuration: {
      actions: {
        invoices: { list: true, get: true, search: true, sendReminder: true },
        transactions: { list: true },
        insights: { get: true },
      },
      context: { sandbox: config.paypal.apiBase.includes('sandbox') },
    },
  });
  const tools = toolkit.getTools();

  // Reminders only for invoices Cleared created, and only to the invoice's own recipient.
  const reminder = tools.send_invoice_reminder;
  tools.send_invoice_reminder = {
    ...reminder,
    execute: async (args, opts) => {
      const known = one('SELECT id FROM invoices WHERE paypal_id = ?', args.invoice_id);
      if (!known) return { ok: false, message: 'Cleared can only send reminders for invoices it created.' };
      const { additional_recipients: _drop, ...safe } = args;
      return reminder.execute(safe, opts);
    },
  };
  paypalTools = tools;
  return tools;
}

const money = (c) => `$${(c / 100).toFixed(2)}`;

const clearedTools = {
  cleared_overview: tool({
    description:
      'Summary of every campaign in Cleared: budget, funds received from the brand, paid to creators, deliverables by status, and PayPal invoices (with their PayPal invoice ids for the PayPal tools).',
    parameters: z.object({}),
    execute: async () =>
      all('SELECT * FROM campaigns ORDER BY created_at DESC').map((c) => {
        const ds = all('SELECT status, fee_cents FROM deliverables WHERE campaign_id = ?', c.id);
        const byStatus = ds.reduce((acc, d) => ((acc[d.status] = (acc[d.status] ?? 0) + 1), acc), {});
        const paid = ds.filter((d) => d.status === 'paid').reduce((s, d) => s + d.fee_cents, 0);
        return {
          campaign_id: c.id,
          name: c.name,
          brand: c.brand,
          budget: money(c.budget_cents),
          funded_by_brand: money(c.funded_cents),
          paid_to_creators: money(paid),
          committed_fees: money(ds.reduce((s, d) => s + d.fee_cents, 0)),
          deliverables_by_status: byStatus,
          invoices: all('SELECT invoice_number, paypal_id, amount_cents, status, created_at FROM invoices WHERE campaign_id = ?', c.id).map((i) => ({
            number: i.invoice_number,
            paypal_invoice_id: i.paypal_id,
            amount: money(i.amount_cents),
            status: i.status,
            sent: i.created_at,
          })),
        };
      }),
  }),

  cleared_deliverables: tool({
    description:
      'List deliverables (the sponsored posts creators owe). Filter by campaign and/or status. Statuses: due, submitted, verifying, fix_needed, human_review, verified (passed, waiting for funds or payout), paying, paid, payout_failed.',
    parameters: z.object({
      campaign_id: z.string().optional(),
      status: z.string().optional(),
    }),
    execute: async ({ campaign_id, status }) =>
      all(
        `SELECT d.id, d.title, d.status, d.fee_cents, d.due_date, d.post_url, d.fix_message, d.verified_at, d.paid_at,
                c.name AS creator, c.handle, k.name AS campaign, p.batch_id, p.status AS payout_status
           FROM deliverables d JOIN creators c ON c.id = d.creator_id JOIN campaigns k ON k.id = d.campaign_id
           LEFT JOIN payouts p ON p.deliverable_id = d.id
          WHERE (? IS NULL OR d.campaign_id = ?) AND (? IS NULL OR d.status = ?)
          ORDER BY d.due_date`,
        campaign_id ?? null,
        campaign_id ?? null,
        status ?? null,
        status ?? null,
      ).map((d) => ({ ...d, fee: money(d.fee_cents), fee_cents: undefined })),
  }),

  cleared_deliverable_evidence: tool({
    description: 'The latest verification result for one deliverable: each checklist item, met or not, with the evidence and video timestamp.',
    parameters: z.object({ deliverable_id: z.string() }),
    execute: async ({ deliverable_id }) => {
      const check = one('SELECT verdict, result, finished_at FROM checks WHERE deliverable_id = ? AND finished_at IS NOT NULL ORDER BY rowid DESC LIMIT 1', deliverable_id);
      if (!check) return { message: 'No completed check yet for this deliverable.' };
      return {
        verdict: check.verdict,
        checked_at: check.finished_at,
        video: check.result.video && { title: check.result.video.title, url: check.result.video.url, views: check.result.video.views },
        items: check.result.items.map((i) => ({ requirement: i.description, status: i.status, evidence: i.evidence, timestamp: i.timestamp || undefined })),
      };
    },
  }),

  cleared_recheck: tool({
    description: 'Re-run the compliance check on a deliverable now (for example after the creator says they fixed it). This never pays anyone directly.',
    parameters: z.object({ deliverable_id: z.string() }),
    execute: async ({ deliverable_id }) => {
      try {
        recheckNow(deliverable_id);
        return { ok: true, message: 'Re-check started. It takes about 10–20 seconds.' };
      } catch (err) {
        return { ok: false, message: err.message };
      }
    },
  }),
};

const SYSTEM = () => `You are Cleared's operator assistant for an influencer-marketing agency. Today is ${new Date().toDateString()}.
Cleared verifies creators' sponsored YouTube posts against the brand brief and FTC disclosure rules, and pays creators through PayPal Payouts once a post passes and the brand's invoice is paid.

How to work:
- Use the cleared_* tools for campaigns, deliverables, evidence and Cleared's invoices. Use the PayPal tools for live PayPal data (invoice details, reminders, transactions, insights). PayPal invoice ids look like INV2-XXXX-...
- Look things up before answering. Quote real numbers, names and invoice numbers. Never guess amounts.
- You cannot pay, approve or change payouts. If asked, explain that money only moves when a post passes its checks and the campaign is funded, or when a person approves it in the review panel.
- Only send an invoice reminder when the user asks you to.
- If a PayPal tool returns a permissions error, say that feature isn't enabled for this PayPal app and answer from Cleared's records instead.
- This is a PayPal sandbox demo; amounts are test money.
Reply in short plain text: one or two sentences, then a short "- " list if it helps. No markdown headings or tables.`;

const MAX_MESSAGES = 12;
const MAX_STEPS = 8;

// Gemini function declarations, built once from the toolkit's zod schemas.
let declarations;
function declare(tools) {
  declarations ??= Object.entries(tools).map(([name, t]) => {
    const { $schema: _s, additionalProperties: _a, ...params } = zodSchema(t.parameters).jsonSchema;
    return { name, description: t.description.trim().slice(0, 1000), parametersJsonSchema: params };
  });
  return declarations;
}

/**
 * Tool-calling loop run directly against Gemini. We don't use an SDK wrapper here because
 * newer Gemini models attach a thought signature to each function call that must be sent back
 * unchanged on the next step; keeping the model's own content objects in the history does that.
 * @param {{role: 'user'|'assistant', content: string}[]} messages
 */
export async function askAgent(messages) {
  const tools = { ...getPayPalTools(), ...clearedTools };
  const t0 = Date.now();
  const contents = messages.slice(-MAX_MESSAGES).map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const calls = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await generateContent(config.gemini.agentModel, {
      systemInstruction: { parts: [{ text: SYSTEM() }] },
      contents,
      tools: [{ functionDeclarations: declare(tools) }],
      generationConfig: { temperature: 0.2 },
    });
    const content = res.candidates?.[0]?.content;
    if (!content?.parts?.length) break;
    contents.push(content); // as returned, thought signatures included

    const fnCalls = content.parts.filter((p) => p.functionCall).map((p) => p.functionCall);
    if (!fnCalls.length) {
      const reply = content.parts.map((p) => (p.thought ? '' : p.text ?? '')).join('').trim();
      return { reply: reply || 'Sorry, I couldn’t find an answer to that.', toolCalls: calls, ms: Date.now() - t0 };
    }

    const responses = [];
    for (const fc of fnCalls) {
      const t = tools[fc.name];
      calls.push({ tool: fc.name, source: fc.name.startsWith('cleared_') ? 'Cleared' : 'PayPal Agent Toolkit', args: fc.args ?? {} });
      let result;
      try {
        if (!t) throw new Error(`Unknown tool ${fc.name}`);
        const args = t.parameters.parse(fc.args ?? {});
        result = await t.execute(args, { toolCallId: fc.id ?? fc.name, messages: [] });
      } catch (err) {
        result = { ok: false, error: err.message };
      }
      // Toolkit tools return JSON strings; keep responses compact.
      const parsed = typeof result === 'string' ? safeJson(result) : result;
      responses.push({ functionResponse: { ...(fc.id ? { id: fc.id } : {}), name: fc.name, response: { result: truncate(parsed) } } });
    }
    contents.push({ role: 'user', parts: responses });
  }
  return { reply: 'That took too many steps. Try asking something more specific.', toolCalls: calls, ms: Date.now() - t0 };
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

/** Keep tool output small enough for the model: long lists are cut to 25 items. */
function truncate(v) {
  const s = JSON.stringify(v ?? null);
  if (s.length <= 12000) return v;
  if (Array.isArray(v)) return { items: v.slice(0, 25), note: `${v.length - 25} more not shown` };
  return { text: s.slice(0, 12000), note: 'truncated' };
}
