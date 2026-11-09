// The verify → fix → pay loop.
//   submitted ─▶ verifying ─┬─ PASS ─────────▶ verified ─▶ paying ─▶ paid
//                           ├─ FIX_NEEDED ───▶ fix_needed ─(auto re-check if fixable in place)─▶ verifying
//                           └─ HUMAN_REVIEW ─▶ human_review ─(approve)─▶ verified ─▶ ...
import { verifyPost } from './verifier.js';
import { decidePayout } from './policy.js';
import { draftFixMessage } from './fixer.js';
import { payDeliverable, pollPendingPayouts } from './payouts.js';
import { config } from './config.js';
import { one, insert, update, newId, now, logEvent, all } from './db.js';

const inFlight = new Set();

function load(deliverableId) {
  const d = one(
    `SELECT d.*, c.name AS creator_name, c.paypal_email
       FROM deliverables d JOIN creators c ON c.id = d.creator_id WHERE d.id = ?`,
    deliverableId,
  );
  if (!d) throw new Error(`No deliverable ${deliverableId}`);
  const campaign = one('SELECT * FROM campaigns WHERE id = ?', d.campaign_id);
  return { d, campaign };
}

const ev = (d, type, message, data) => logEvent({ campaignId: d.campaign_id, deliverableId: d.id, type, message, data });

/** Creator submits (or re-submits) their post link. */
export function submitPost(deliverableId, postUrl) {
  const { d } = load(deliverableId);
  if (['paid', 'paying'].includes(d.status)) throw new Error('This deliverable is already paid');
  const changed = d.post_url !== postUrl;
  update('deliverables', d.id, { post_url: postUrl, status: 'submitted', submitted_at: now(), next_check_at: null, fix_message: null });
  ev(d, 'post.submitted', changed && d.post_url ? 'Creator submitted a new link' : 'Creator submitted their post', { postUrl });
  kick(deliverableId);
}

/** Creator says "I fixed it", or the brand asks for a fresh check. */
export function recheckNow(deliverableId) {
  const { d } = load(deliverableId);
  if (!d.post_url) throw new Error('No post submitted yet');
  if (['paid', 'paying', 'verifying'].includes(d.status)) return;
  update('deliverables', d.id, { status: 'submitted', next_check_at: null });
  ev(d, 'check.requested', 'Re-check requested');
  kick(deliverableId);
}

/** Run a check now without waiting for the worker tick. */
function kick(deliverableId) {
  runCheck(deliverableId).catch((err) => console.error(`check ${deliverableId}: ${err.stack}`));
}

export async function runCheck(deliverableId) {
  if (inFlight.has(deliverableId)) return;
  inFlight.add(deliverableId);
  const checkId = newId('chk');
  try {
    const { d, campaign } = load(deliverableId);
    if (!campaign.checklist) throw new Error('Campaign has no checklist yet');
    update('deliverables', d.id, { status: 'verifying' });
    insert('checks', { id: checkId, deliverable_id: d.id });
    ev(d, 'check.started', 'Checking the video against the brief');

    let result;
    try {
      result = await verifyPost({ postUrl: d.post_url, checklist: campaign.checklist });
    } catch (err) {
      update('checks', checkId, { verdict: 'ERROR', error: err.message, finished_at: now() });
      // Leave it queued; the worker retries after the re-check interval.
      update('deliverables', d.id, { status: 'submitted', next_check_at: inSeconds(config.recheckSeconds) });
      ev(d, 'check.error', `Check failed, will retry: ${err.message}`);
      return;
    }

    update('checks', checkId, { verdict: result.verdict, result, finished_at: now() });
    const met = result.items.filter((i) => i.status === 'met').length;
    ev(d, 'check.finished', `${result.verdict}: ${met}/${result.items.length} checks passed${result.analysis?.cached ? ' (video analysis reused)' : ''}`, {
      checkId,
      verdict: result.verdict,
    });

    if (result.verdict === 'PASS') return await onPass(d, campaign);
    if (result.verdict === 'HUMAN_REVIEW') {
      update('deliverables', d.id, { status: 'human_review' });
      const unsure = result.items.filter((i) => i.status === 'unsure').map((i) => i.description);
      return ev(d, 'review.needed', `Needs a person to look: ${unsure.join('; ')}`);
    }

    // FIX_NEEDED
    const failed = result.items.filter((i) => i.status === 'not_met');
    const message = await draftFixMessage({
      creatorName: d.creator_name,
      brand: campaign.brand,
      videoTitle: result.video?.title ?? 'your video',
      failedItems: failed,
      needsReupload: result.needsReupload,
    });
    // Description/settings fixes are re-checked automatically. In-video problems wait for a new link.
    update('deliverables', d.id, {
      status: 'fix_needed',
      fix_message: message,
      next_check_at: result.needsReupload ? null : inSeconds(config.recheckSeconds),
    });
    ev(d, 'fix.requested', result.needsReupload ? 'Asked creator to re-upload' : 'Asked creator to fix the description/settings; will re-check automatically', {
      message,
      failed: failed.map((i) => i.id),
    });
  } finally {
    inFlight.delete(deliverableId);
  }
}

async function onPass(d, campaign) {
  update('deliverables', d.id, { status: 'verified', verified_at: now(), fix_message: null, next_check_at: null });
  ev(d, 'post.verified', 'All checks passed');
  return releasePayment(d.id);
}

/** Apply the payment policy and pay if it allows. */
async function releasePayment(deliverableId) {
  const { d, campaign } = load(deliverableId);
  const committed = one(
    `SELECT COALESCE(SUM(p.amount_cents), 0) AS c FROM payouts p
       JOIN deliverables x ON x.id = p.deliverable_id
      WHERE x.campaign_id = ? AND p.status NOT IN ('ERROR', 'FAILED', 'DENIED', 'RETURNED', 'BLOCKED', 'REFUNDED', 'REVERSED')`,
    campaign.id,
  ).c;
  const decision = decidePayout({ deliverable: d, campaign, verdict: 'PASS', committedCents: committed });
  ev(d, `policy.${decision.action}`, decision.reasons.join('. '), decision);

  if (decision.action === 'pay') {
    try {
      await payDeliverable(d.id, decision.amountCents);
    } catch {
      /* already logged as payout.error */
    }
  } else if (decision.action === 'review') {
    update('deliverables', d.id, { status: 'human_review' });
  }
}

/** A person approves a deliverable the checks couldn't settle. */
export async function approve(deliverableId, note = '') {
  const { d } = load(deliverableId);
  if (d.status !== 'human_review') throw new Error(`Can only approve items in review (this one is ${d.status})`);
  update('deliverables', d.id, { status: 'verified', verified_at: now() });
  ev(d, 'review.approved', `Approved by reviewer${note ? `: ${note}` : ''}`);
  await releasePayment(d.id);
}

export function reject(deliverableId, message) {
  const { d } = load(deliverableId);
  update('deliverables', d.id, { status: 'fix_needed', fix_message: message, next_check_at: null });
  ev(d, 'review.rejected', 'Reviewer asked for changes', { message });
}

const inSeconds = (s) => new Date(Date.now() + s * 1000).toISOString();

/** Background loop: due re-checks and in-flight payouts. */
export function startWorker(intervalMs = 3000) {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const due = all(
        `SELECT id FROM deliverables
          WHERE post_url IS NOT NULL
            AND ((status = 'submitted' AND (next_check_at IS NULL OR next_check_at <= ?))
              OR (status = 'fix_needed' AND next_check_at IS NOT NULL AND next_check_at <= ?))`,
        now(),
        now(),
      );
      for (const { id } of due) kick(id);
      await pollPendingPayouts();
    } catch (err) {
      console.error('worker:', err.message);
    } finally {
      busy = false;
    }
  };
  // Anything left "verifying" by a restart goes back in the queue.
  all("SELECT id FROM deliverables WHERE status = 'verifying'").forEach(({ id }) => update('deliverables', id, { status: 'submitted' }));
  return setInterval(tick, intervalMs);
}
