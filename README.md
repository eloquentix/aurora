# PennyBrief

**Your AI-powered morning email briefing.** Deploy in 5 minutes, runs entirely in Google Apps Script — no server, no infrastructure, no ongoing maintenance.

Every morning, PennyBrief reads your Gmail inbox, analyzes each email with an AI model of your choice, and delivers a structured briefing: summaries, action items with direct Gmail links, and one-click proposed replies.

Built by [Eloquentix](https://eloquentix.com) as an open-source demonstration of practical AI agents — simple enough to understand in an afternoon, useful enough to run every day.

---

## What you get

A daily email that looks like this:

> **Good morning. Briefing for Wednesday, May 27 · 12 emails**
>
> **Overview**
> Three items need your attention: a client is waiting on a proposal, a contractor sent an invoice, and tomorrow's meeting was rescheduled.
>
> **Action Items**
> → Send proposal to Acme Corp — deadline Friday `[open]`
> → Approve invoice from Jane Doe ($2,400) `[open]`
> → Confirm new time for 2pm design call `[open]`
>
> ---
> **Re: Proposal** · Acme Corp · 9:14 AM
> Client followed up asking for the proposal by Friday. Budget approval expires end of month.
>
> *Proposed reply:* "Hi Sarah, I'll have the proposal over to you by Thursday EOD. Looking forward to it."
>
> `[Reply in Gmail]` `[Open Thread]`

---

## How it works

PennyBrief is a small AI agent:

1. **Reads** your Gmail inbox (last 20 hours)
2. **Analyzes** each email — summary, action items, proposed reply
3. **Synthesizes** the inbox into an executive overview
4. **Delivers** a rich HTML briefing to your inbox

The agent pattern is intentionally simple: a system prompt that defines the persona, a loop over emails that calls the AI, and a second call to synthesize the whole. The code is meant to be read and extended.

```
runBriefing()
  ├─ fetchRecentEmails()       reads Gmail via GmailApp
  ├─ for each email:
  │    └─ analyzeEmail()       calls AI → JSON: summary, actions, reply
  ├─ generateOverallSummary()  second AI call to synthesize the inbox
  └─ buildBriefingHTML()       HTML email with mailto: reply links
```

---

## Supported AI Providers

Pick one — or switch anytime by changing a single config value.

| Provider | Model | Free Tier |
|----------|-------|-----------|
| **Claude** (Anthropic) | `claude-sonnet-4-6` | No — [get key](https://console.anthropic.com) |
| **OpenAI** | `gpt-4o` | No — [get key](https://platform.openai.com) |
| **Gemini** (Google) | `gemini-2.5-flash` | **Yes** — [get key](https://aistudio.google.com) |
| **Grok** (xAI) | `grok-3` | No — [get key](https://console.x.ai) |

---

## Deploy in 5 minutes

### Prerequisites
- A Google account (Gmail)
- [Node.js](https://nodejs.org) installed
- An API key from any provider above (Gemini has a free tier)

### 1. Clone and install clasp

```bash
git clone https://github.com/eloquentix/pennybrief.git
cd moneypenny
npm install -g @google/clasp
clasp login
```

`clasp login` opens a browser — sign in with the Google account whose Gmail you want to read.

### 2. Enable the Apps Script API

Visit [script.google.com/home/usersettings](https://script.google.com/home/usersettings) and turn on **Google Apps Script API**. Required once per Google account.

### 3. Create the Apps Script project

```bash
clasp create --type standalone --title "PennyBrief"
clasp push
```

When asked to overwrite the manifest — answer **Yes**.

### 4. Add your API keys

```bash
cp src/setup.example.gs src/setup.gs
```

Open `src/setup.gs` and fill in your keys:

```javascript
'AI_PROVIDER':    'gemini',          // start here — it's free
'CLAUDE_API_KEY': '',
'OPENAI_API_KEY': '',
'GEMINI_API_KEY': 'AIza...',         // free at aistudio.google.com
'GROK_API_KEY':   '',
```

Then push and run the setup:

```bash
clasp push
```

Go to [script.google.com](https://script.google.com), open **PennyBrief**, click `src/setup.gs` in the left sidebar, select `setupProperties` from the function dropdown, click **Run**, and accept the permissions prompt.

This stores your keys securely in Google's Script Properties. You never need to do it again unless keys change. `setup.gs` is gitignored — your keys stay local.

### 5. Test it

In the Apps Script editor, switch to `src/main.gs`, select `testBriefing`, and click **Run**. The Execution Log shows the full analysis without sending any email.

### 6. Go live

Select `installTrigger` and click **Run**. PennyBrief will send your briefing every morning at 7 AM.

---

## Configuration

Edit `src/config.gs` or set Script Properties to override without touching code.

| Key | Default | Description |
|-----|---------|-------------|
| `AI_PROVIDER` | `claude` | Active provider: `claude`, `openai`, `gemini`, `grok` |
| `AI_MODEL` | *(provider default)* | Override model, e.g. `gpt-4o`, `claude-opus-4-6` |
| `HOURS_BACK` | `20` | Hours of inbox to scan |
| `MAX_EMAILS` | `50` | Cap per run (controls cost) |
| `BRIEFING_HOUR` | `7` | Hour to send the briefing (0–23) |
| `PRIORITY_CONTACTS` | *(empty)* | Comma-separated emails to highlight at the top |
| `PERSONA_NAME` | `PennyBrief` | Agent name in email subject and footer |

---

## Extending PennyBrief

The codebase is intentionally small and readable. Key extension points:

**Switch providers** — change `AI_PROVIDER` in `setup.gs`, re-run `setupProperties()`.

**Add a new provider** — create `src/providers/myprovider.gs` with a single function, add one case to the switch in `src/ai.gs`. That's it.

**Add memory** — `analyzeEmail()` in `src/agent.gs` is where you'd inject sender context before calling the AI. A future version might look up the sender's email in Firebase and prepend: *"You've exchanged 12 emails with this person. Last topic: contract renewal."*

**Change the persona** — edit `SYSTEM_PROMPT` in `src/agent.gs`.

**Different delivery** — replace `GmailApp.sendEmail()` in `src/main.gs` with a Slack webhook, Google Chat message, or push notification.

---

## Project structure

```
src/
  main.gs              Entry points: runBriefing(), testBriefing(), installTrigger()
  agent.gs             The agent: persona, analysis loop, synthesis
  ai.gs                Provider router — one callAI() for all providers
  providers/
    claude.gs          Anthropic Messages API
    openai.gs          OpenAI Chat Completions
    gemini.gs          Google Gemini
    grok.gs            xAI Grok (OpenAI-compatible)
  gmail.gs             Gmail reading via GmailApp (no IMAP, no passwords)
  briefing.gs          HTML email builder with inline CSS and mailto links
  config.gs            Config defaults + Script Properties bridge
  utils.gs             Shared utilities
  setup.example.gs     Template for your API keys (copy to setup.gs)
```

---

## Built by Eloquentix

[Eloquentix](https://eloquentix.com) is a software consultancy that builds AI-powered products for US startups. We open-source the tools we build for ourselves.

---

## License

MIT
