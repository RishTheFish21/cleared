# Cleared

Cleared checks a creator's sponsored YouTube video against the brand's brief and the FTC's disclosure rules, and when the video passes it pays the creator through PayPal, usually about twenty seconds later. I built it for the PayPal "Build What's Next with PayPal and AI" hackathon.

- Live demo, running in the PayPal sandbox with no login needed: https://cleared-fhdb.onrender.com/
- Demo video: https://youtu.be/NpAoDbv0odA
- The project is released under the [MIT license](LICENSE).

## The problem

When a brand pays a creator to make a sponsored video, someone on the brand's side usually has to watch the whole thing, compare it with the brief, check that the creator disclosed the sponsorship the way the FTC requires, go back and forth with the creator about any fixes, and then send the payment by hand. Creators often wait weeks to be paid, and even with all of that effort the most common mistake still gets through, which is a creator praising the product for most of the video and mentioning that it's sponsored near the end.

## What Cleared does

A campaign starts with the agency sending the brand a PayPal invoice for the budget, because Cleared pays creators out of money the brand has already paid rather than the agency's own funds. The agency pastes in the brand's brief, Gemini turns it into a checklist of the things that can be verified, and Cleared adds the FTC's disclosure rules to every campaign.

Each creator has a page where they submit the link to their video once it's live, and Cleared then runs two sets of checks in parallel. Code reads the YouTube data, including the description, tags and the "includes paid promotion" setting, while Gemini watches the video and reports when the product appears, whether the brand is mentioned and when the creator says the video is sponsored. Results usually arrive in about fifteen seconds and show the evidence for each check, with a clickable timestamp that moves the video to the relevant point. When something fails, Gemini drafts a short message telling the creator what to change. 

The decision to pay is made by code rather than by the AI so a payment goes out when every check has passed, the brand's money has arrived and the fee is under a safety limit, and if the brand hasn't paid its invoice yet the payout waits and is released automatically once it has.

The agency can also use Ask Cleared, an assistant built on PayPal's Agent Toolkit that answers questions about invoices and campaigns using live PayPal data and can send the brand a payment reminder when asked, but has no way of moving money.

## Sample videos

I made these two videos myself for a fictional brand called Northpaw and its Charge energy drink, which is the brand used in the demo campaign.

| Video | What Cleared should report |
|---|---|
| [This energy drink actually slaps](https://www.youtube.com/watch?v=LilMRZ70U9I) | This one should come back as needing fixes, because the creator praises the drink from the start and doesn't disclose the sponsorship until 0:21. The description is also missing #ad, @northpaw and the campaign link, and the paid promotion box isn't ticked. |
| [What I drink before a morning workout](https://www.youtube.com/watch?v=4wrW2kegYs4) | This one should pass all eight checks, since the disclosure comes at the start, the can is on screen, the brand is named and the description and YouTube settings are all correct. |

## Trying it out

The live demo runs on Render's free plan, so the first page load can take up to a minute while the server wakes up. Everything uses the PayPal sandbox, so no real money moves.

1. Open https://cleared-fhdb.onrender.com/ and click Reset demo in the top right so you start from a clean campaign.
2. Click Invoice brand with PayPal and then Send invoice. The email field is already filled in with a sandbox account.
3. Click Joe Mendez's row, choose Open creator view, and submit the first sample video, `https://www.youtube.com/watch?v=LilMRZ70U9I`. After around 15 to 30 seconds it should come back as needing fixes, and in the dashboard drawer you can click the 0:21 timestamp to jump to the late disclosure.
4. Back on Joe's page, submit the corrected video, `https://www.youtube.com/watch?v=4wrW2kegYs4`. It should pass, although the payout will be held because the brand hasn't paid yet.
5. On the dashboard, click Brand paid by bank transfer. This records the invoice as paid in PayPal, and Cleared releases Joe's payout through PayPal Payouts within about twenty seconds.
6. Press the / key or click Ask Cleared and try asking whether the brand has opened its PayPal invoice, or ask it to pay someone and see how it responds.

To keep the public demo safe, it accepts PayPal sandbox email addresses and nothing else, limits how many requests can be made, and caps the number of AI calls each day. If Gemini's free tier is busy when you try it, video checks switch to a lighter model automatically.

## How PayPal is used

All PayPal calls go to the sandbox at `api-m.sandbox.paypal.com` and authenticate with OAuth client credentials.

- The PayPal Invoicing API (v2) is how the brand's money comes in. Cleared creates and sends the invoice, keeps checking its status, and when it's paid, or recorded as paid outside PayPal, credits the campaign once inside a database transaction before releasing any payouts that were waiting for funds. The code is in [`server/invoices.js`](server/invoices.js).
- The PayPal Payouts API is how creators get paid. Each payout uses its own database record as the `sender_batch_id` and sends a `PayPal-Request-Id`, so a retry or a crash at the wrong moment can never pay a creator twice, and a background worker checks the batch until PayPal confirms the money has arrived. The code is in [`server/payouts.js`](server/payouts.js).
- The PayPal Agent Toolkit (`@paypal/agent-toolkit`) provides the invoice tools behind Ask Cleared, which can list, look up and search invoices and send reminders. I wrapped those tools so the assistant sees the invoices Cleared created and nothing else in the PayPal account, and sends reminders to the invoice's own recipient. The code is in [`server/agent.js`](server/agent.js).

## How AI is used

Cleared calls Google Gemini through its REST API for four separate jobs.

- Watching the video is handled by `gemini-3.5-flash`, which receives the YouTube URL directly and returns structured results with a status, evidence and timestamp for each requirement that needs the video. If that model is busy or has used up its free quota, Cleared falls back to `gemini-3.5-flash-lite`. Each analysis is saved per video and checklist, so a creator who fixes their description gets re-checked instantly without the video being watched again. The code is in [`server/verifier.js`](server/verifier.js).
- Reading the brief is handled by `gemini-3.5-flash-lite`, which turns the brand's written brief into a checklist and lists anything it can't verify automatically, such as the tone of the video. The code is in [`server/brief.js`](server/brief.js).
- Writing fix messages to creators in plain English is also handled by `gemini-3.5-flash-lite`, in [`server/fixer.js`](server/fixer.js).
- Running Ask Cleared's tool calls uses my own function-calling loop, which I wrote so that newer Gemini models get their thought signatures passed back correctly while still running the PayPal toolkit's tools.

Throughout the project the AI is responsible for judging what happened in the video, and code is responsible for deciding whether money moves. Code compares the timestamps Gemini returns, for example to work out whether the disclosure came before the first endorsement, and treats any claim that comes without a timestamp as unsure so that a person reviews it. The payment decision lives in a small policy module with no AI in it, [`server/policy.js`](server/policy.js).

## Sponsor tools

The main dashboard view is built with the Bryntum Scheduler. It shows a row for each creator and a bar for each deliverable across its posting window, coloured by where that video is in the process, with a line marking the current time and tooltips on each bar, and clicking a bar opens the evidence for that video. The code is in [`web/src/Timeline.jsx`](web/src/Timeline.jsx).

The live demo is hosted on Render using the [`render.yaml`](render.yaml) blueprint, which builds the React app and runs the Node server together with its background worker.

I also use the YouTube Data API v3 to read each video's description, length and paid promotion flag.

## Tech stack

The backend is Node.js 22 or newer with Express, storing data in SQLite through Node's built-in `node:sqlite` module. The frontend is React 19 built with Vite, with the Bryntum Scheduler for the timeline. It integrates the PayPal REST APIs and Agent Toolkit, Google Gemini and the YouTube Data API v3, and is deployed on Render.

## Running it locally

You'll need Node.js 22.13 or newer, along with a few keys:

- a PayPal sandbox app from [developer.paypal.com](https://developer.paypal.com), found under Apps & Credentials with Sandbox selected, plus the email address of a sandbox personal account from Testing Tools, Sandbox Accounts, which receives the payouts and invoices
- a YouTube Data API v3 key from [console.cloud.google.com](https://console.cloud.google.com)
- a Gemini API key from [aistudio.google.com](https://aistudio.google.com)

```bash
git clone https://github.com/RishTheFish21/cleared.git
cd cleared
npm install
cp .env.example .env
```

In `.env`, fill in `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_TEST_RECEIVER` (the sandbox personal email), `YOUTUBE_API_KEY` and `GEMINI_API_KEY`. If you also set `DEMO_MODE=true`, the demo campaign is created automatically and the Reset demo button appears.

```bash
npm run dev
```

Then open http://localhost:5173. The API runs on port 3000, and the background worker starts along with it. If you'd rather run it the way it runs in production, build the frontend and start the server, which serves both the app and the API on http://localhost:3000:

```bash
npm run build
npm start
```

`npm run seed` puts the database back to the demo campaign, and `npm run spikes` runs three quick checks to confirm your keys work, which send a $1 sandbox payout, read a video's YouTube data and run a Gemini video analysis.

## Deploying to Render

In Render, choose New and then Blueprint, connect your GitHub account and pick this repository. Render will ask for the secret values, which are `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_TEST_RECEIVER`, `YOUTUBE_API_KEY` and `GEMINI_API_KEY`, and once it deploys the server creates the demo campaign the first time it starts.

On the free plan the service goes to sleep after fifteen minutes without visitors and starts with a fresh database on every deploy. If you want a demo that keeps its data between deploys, use the Starter plan with the disk that's already described in `render.yaml`.

## Project layout

```
server/
  index.js              Express app, background worker, serves the built frontend
  routes.js             REST API
  pipeline.js           the submit, check, fix and pay lifecycle
  verifier.js           YouTube data checks plus Gemini video analysis
  policy.js             the payment decision, with no AI involved
  payouts.js            PayPal Payouts
  invoices.js           PayPal Invoicing
  agent.js              Ask Cleared, built on PayPal's Agent Toolkit
  brief.js              turns the brief into a checklist
  fixer.js              writes fix messages for creators
web/src/
  CampaignPage.jsx      the dashboard
  Timeline.jsx          the Bryntum Scheduler timeline
  DeliverableDrawer.jsx evidence, verdict and payout for one video
  CreatorPage.jsx       the creator's page
  AskCleared.jsx        the assistant panel
```
