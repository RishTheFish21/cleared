# Cleared

Creators get paid the minute their sponsored post goes live and passes compliance.
AI checks the video against the brand brief and FTC disclosure rules; PayPal Payouts pays the creator in seconds.

> Work in progress for the PayPal "Build What's Next with PayPal and AI" hackathon.

## Go/no-go tests (`spikes/`)

No dependencies, just Node 22+.

1. `cp .env.example .env` and fill it in.
2. Run all three tests: `npm run spikes`, or one at a time:
   - `npm run spike:paypal`: sends a $1 sandbox payout and polls until it settles.
   - `npm run spike:youtube`: reads title, views and the "paid promotion" flag.
   - `npm run spike:gemini`: Gemini watches the video and returns timestamped disclosure evidence.

Raw responses are saved to `spikes/out/` (git-ignored).

## Run the server

```bash
npm install
npm run dev        # http://localhost:3000, auto-restarts on changes
```

The background worker starts with the server. It re-checks posts the creator was asked to fix and polls PayPal until each payout settles.

### How a deliverable moves

```
submitted → verifying ─┬─ PASS ─────────▶ verified → paying → paid
                       ├─ FIX_NEEDED ───▶ fix_needed ─(auto re-check if fixable in place)─▶ verifying
                       └─ HUMAN_REVIEW ─▶ human_review ─(approve)─▶ verified → …
```

- **AI judges, code decides the money.** Gemini turns the brief into a checklist and watches the video. Plain code (`server/policy.js`) decides whether to pay, using the fee agreed in the deal, a per-payout cap and the campaign's funded balance.
- **Video analysis is cached per video.** A YouTube video's content can't change after upload, so a re-check after the creator fixes their description or ticks the paid-promotion box only re-reads metadata and takes well under a second.

### API

| Method | Path | What it does |
|---|---|---|
| POST | `/api/campaigns` | Create a campaign; AI parses `brief_text` into a checklist |
| GET | `/api/campaigns/:id` | Campaign with its deliverables |
| POST | `/api/campaigns/:id/checklist` | Re-parse the brief |
| POST | `/api/campaigns/:id/fund` | Record funds received (temporary, until Invoicing) |
| POST | `/api/creators` | Add a creator with their PayPal email |
| POST | `/api/campaigns/:id/deliverables` | Add a deliverable (creator, title, due date, fee) |
| GET | `/api/deliverables/:id` | Status, latest check with evidence, payout, history |
| POST | `/api/deliverables/:id/submit` | Creator submits a YouTube link |
| POST | `/api/deliverables/:id/recheck` | "I fixed it": re-check now |
| POST | `/api/deliverables/:id/approve` / `reject` | Human review |
| GET | `/api/events?since=&campaign_id=` | Activity feed |
