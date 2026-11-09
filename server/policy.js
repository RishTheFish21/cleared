// Decides whether money moves. Plain code, no AI: the model judges the video,
// this decides the payment. Every rule that fires is returned as a reason.
import { config } from './config.js';

/**
 * @returns {{ action: 'pay' | 'hold' | 'review', amountCents: number, reasons: string[] }}
 */
export function decidePayout({ deliverable, campaign, verdict, committedCents }) {
  const reasons = [];
  const amountCents = deliverable.fee_cents; // agreed fee, set by a human when the deal was made

  if (verdict !== 'PASS') return { action: 'hold', amountCents: 0, reasons: [`Verification result is ${verdict}`] };
  reasons.push('Every checklist item passed');

  if (deliverable.status === 'paid' || deliverable.status === 'paying') {
    return { action: 'hold', amountCents: 0, reasons: ['Already paid'] };
  }
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { action: 'review', amountCents, reasons: [...reasons, 'No valid fee on this deliverable'] };
  }
  if (amountCents > config.limits.maxPayoutCents) {
    return { action: 'review', amountCents, reasons: [...reasons, `Fee is over the $${config.limits.maxPayoutCents / 100} per-deliverable cap`] };
  }
  if (amountCents > config.limits.humanApprovalAboveCents) {
    return { action: 'review', amountCents, reasons: [...reasons, 'Fee needs a human sign-off'] };
  }
  // The brand's money must already be in: pay from funds received, never on credit.
  if (committedCents + amountCents > campaign.funded_cents) {
    return {
      action: 'hold',
      amountCents,
      reasons: [...reasons, `Campaign has $${(campaign.funded_cents / 100).toFixed(2)} funded and $${(committedCents / 100).toFixed(2)} already paid out`],
    };
  }
  reasons.push(`Within the campaign's funded balance`);
  return { action: 'pay', amountCents, reasons };
}
