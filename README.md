# Aurora

**Your AI-powered morning email briefing.** Deploy in 5 minutes, runs entirely in Google Apps Script — no server, no infrastructure, no ongoing maintenance.

Every morning, Aurora reads your Gmail inbox, analyzes each email with an AI model of your choice, and delivers a structured briefing: summaries, action items with direct Gmail links, and one-click proposed replies.

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

Aurora is a small AI agent:

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

## Get started

### Easiest way — no terminal required

**[→ Click here to make your own copy](https://script.google.com/d/1AvnG6Nxl91yDswW56MkY9tegHDS3saJkzmlfpxQasLmhAwaObM_MkIRR/copy)**

Once it opens in your Google account:

1. Click `src/setup.gs` in the left sidebar
2. Replace `PASTE_YOUR_GEMINI_KEY_HERE` with your key — [get one free here](https://aistudio.google.com) (30 seconds)
3. Select `setupProperties` in the dropdown → click **▶ Run** → accept the permissions prompt
4. Switch to `src/main.gs`, select `installTrigger` → click **▶ Run**

That's it. Your briefing arrives tomorrow morning.

---

### Developer way — clasp + git

If you want to run your own copy of the code, extend it, or contribute:

#### Prerequisites
- A Google account (Gmail)
- [Node.js](https://nodejs.org) installed
- An API key from any provider (Gemini has a free tier)

#### 1. Clone and install clasp

```bash
git clone https://github.com/eloquentix/aurora.git
cd aurora
npm install -g @google/clasp
clasp login
```

#### 2. Enable the Apps Script API

Visit [script.google.com/home/usersettings](https://script.google.com/home/usersettings) and turn on **Google Apps Script API**.

#### 3. Create and push

```bash
clasp create --type standalone --title "Aurora"
clasp push
```

Answer **Yes** when asked to overwrite the manifest.

#### 4. Add your API key

Open `src/setup.gs`, paste your key, then:

```bash
clasp push
```

Go to [script.google.com](https://script.google.com), open **Aurora**, click `src/setup.gs`, select `setupProperties` → **Run**.

#### 5. Test and go live

- Run `testBriefing()` — check Execution Log, no email sent
- Run `installTrigger()` — briefing arrives every morning at 7 AM

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
| `PERSONA_NAME` | `Aurora` | Agent name in email subject and footer |

---

## Extending Aurora

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
