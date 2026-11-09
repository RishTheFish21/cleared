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
