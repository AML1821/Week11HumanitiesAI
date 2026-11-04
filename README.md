# Should I Use AI Here?

An interactive decision game for ENC 1102 (first-year writing). Players work through realistic writing-course scenarios (brainstorming, research, drafting, citations, peer review, revising) and decide whether and how to use generative AI. Every choice gets feedback that explains the reasoning and connects to the course GenAI policy, and every choice asks the player to reflect on why they made it.

Static HTML, CSS and JavaScript. No build step, no dependencies, made for GitHub Pages.

## Versions

Each version lives in its own folder and stays playable. The root `index.html` links to all of them.

| Folder | What it adds |
| --- | --- |
| `v1/` | MVP: 6 scenarios, graded feedback, required reflections, mock GenAI log entries, localStorage progress, export |
| `v2/` | (planned) Branching consequences |
| `v3/` | (planned) Scoring and AI-literacy pattern dimensions |
| `v4/` | (planned) Full results screen |
| `v5/` | (planned) Teacher mode for adding and editing scenarios |

## How v1 plays

1. Enter a name or initials (saved only in your browser) and start.
2. For each scenario, pick a choice and write one sentence about **why** (at least 8 words), then lock it in.
3. Read the feedback. Choices are rated on a spectrum:
   - **Transfers well**: builds knowledge and habits that travel to new writing situations
   - **Works**: reasonable, gets the job done, may leave some learning on the table
   - **Shortcut**: saves time now at a cost to learning, accuracy, or honesty
   - **Crosses a line**: conflicts with the course policy as written (e.g., undisclosed AI writing)

   Choosing not to use AI is never rated below *Works*, in line with the policy.
4. Reflect (at least 25 words). If your choice used AI, this is a short mock **GenAI log entry**; otherwise it's a guided prompt.
5. At the end, review your choices, explore the feedback for the options you didn't pick, and export your work (Markdown download, copy, or print/save as PDF) to submit.

Choices are locked once made; exploring other options afterward doesn't change your record.

## Your data

Progress and reflections are stored in this browser's `localStorage` under a per-version key (`shouldIUseAI.v1` for v1), so versions don't overwrite each other. Nothing is sent anywhere. Clearing site data or switching browsers/devices loses progress, so export before you submit.

## Editing scenarios

Scenarios are in `v1/data/scenarios.json` and the course policy text is in `v1/data/policy.json`. Each scenario has a stage, assignment, situation, learning goal, reflection prompts, GenAI log questions, and four choices. Each choice has `text`, `usesAI`, `rating` (`transfers`, `works`, `shortcut`, or `line`), `feedback`, an optional `policyLink` and `ethicsNote`, and a `next` field reserved for branching in v2. The game checks the file when it loads and shows an error if something is missing.

## Running it

On GitHub Pages: Settings → Pages → Deploy from a branch → choose the branch and the root folder. The landing page is at the site root and v1 is at `/v1/`.

Locally, `fetch()` needs a web server rather than `file://`:

```bash
python3 -m http.server
```

then open http://localhost:8000.
