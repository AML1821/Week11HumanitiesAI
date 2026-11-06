# Should I Use AI Here?

An interactive decision game for ENC 1102 (first-year writing). Players work through realistic writing-course scenarios (brainstorming, research, drafting, citations, peer review, revising) and decide whether and how to use generative AI. Every choice gets feedback that explains the reasoning and connects to the course GenAI policy, and every choice asks the player to reflect on why they made it.

Static HTML, CSS and JavaScript. No build step, no dependencies, made for GitHub Pages.

## Versions

Each version lives in its own folder and stays playable. The root `index.html` links to all of them.

| Folder | What it adds |
| --- | --- |
| `v1/` | MVP: 6 scenarios, graded feedback, required reflections, mock GenAI log entries, localStorage progress, export |
| `v2/` | Consequences: earlier choices show up in later scenes, 3 consequence scenes that appear only on certain paths, and a path timeline end screen |
| `v3/` | Scoring: points per rating, a profile across ownership of ideas, verification, and honest disclosure, and scene variants (fixes the Research topic and the Pitch slide-deck choice from v2) |
| `v4/` | (planned) Full results screen |
| `v5/` | (planned) Teacher mode for adding and editing scenarios |

## How it plays (all versions)

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

## What v2 adds: consequences

- **Echoes.** Some scenes look different because of an earlier choice. A note at the top says which choice caused it. For example, if AI picked your topic in Brainstorming, your Peer review partner asks why you care about it. The scene's choices and ratings stay the same, so every player's scenes can be compared.
- **Consequence scenes.** Three extra scenes appear only on certain paths. Each is a full scene with rated choices, feedback, and reflection.
  - *The source that wasn't there* comes after Citations if you used AI sources or citations without verifying them.
  - *Pitch it in two minutes* comes after Peer review if you chose your own topic. It's a positive outcome.
  - *The conference* comes last if AI writing went into your paper without a log entry.
- **Your path.** The end screen is a timeline of every scene you played. It shows your choice, its rating, what each choice led to later, and why each consequence scene appeared. **Roads not taken** lists the consequence scenes you never reached and the choices that would have led to them. The export follows the same path.

A full playthrough is 6 to 9 scenes depending on your choices.

## What v3 adds: scoring and a pattern profile

- **Points.** Each choice earns points by its rating: Transfers well 3, Works 2, Shortcut 1, Crosses a line 0. Feedback shows the points right after you lock in, and the end screen shows your total out of the points possible on your path.
- **A profile, not a grade.** Each choice also scores the patterns its scene tests, from -2 to +2:
  - *Ownership of ideas*: the topic, claims, words, and judgments came from your own thinking.
  - *Verification*: you checked facts and sources yourself instead of trusting what AI handed you.
  - *Honest disclosure*: you were open about how you used AI (or chose not to) through your GenAI log.

  The end screen shows a bar for each one. A bar compares your choices with the weakest and best choices available in the scenes you actually played, so a 6-scene path and a 9-scene path compare fairly. Not using AI is never scored against you: every no-AI choice earns full points and never scores below zero.
- **Scene variants.** A scene can change its situation and the wording of individual choices based on an earlier choice. If AI picked your topic in Brainstorming, the Research scene now names that AI-suggested topic instead of food insecurity.
- **Clearer Pitch rating.** In *Pitch it in two minutes*, the slide-deck choice now says exactly what earns its *Works* rating (you rewrite the speaker notes, cut slides, and log it), and the feedback explains why it's *Works* rather than *Transfers well*.
- The export and print view include your points and profile.

## Your data

Progress and reflections are stored in this browser's `localStorage` under a per-version key (`shouldIUseAI.v1`, `shouldIUseAI.v2`, `shouldIUseAI.v3`), so versions don't overwrite each other. Nothing is sent anywhere. Clearing site data or switching browsers/devices loses progress, so export before you submit.

## Editing scenarios

Each version has its own data: `v3/data/scenarios.json` and `v3/data/policy.json` for the current version (earlier versions' are in `v1/data/` and `v2/data/`). Each scene has a stage, assignment, situation, learning goal, reflection prompts, GenAI log questions, and choices. Each choice has `text`, `usesAI`, `rating` (`transfers`, `works`, `shortcut`, or `line`), `feedback`, and an optional `policyLink` and `ethicsNote`.

v2 adds three fields for consequences:

- `flags` on a choice: short labels for what the choice means later, e.g. `["ai-topic"]`.
- `echoes` on a scene: `[{ "ifFlags": ["ai-topic"], "text": "..." }]`. The first echo whose flag an earlier choice set is shown at the top of the scene.
- `"type": "consequence"` with `"trigger": { "anyFlags": ["unverified-sources", "fabricated-citation"] }` on a scene: it plays only if an earlier choice set one of those flags. Place it in the list where it should appear.

v3 adds:

- `scores` on a choice: `{ "ownership": 2, "disclosure": -1 }`, whole numbers from -2 to 2. Give a dimension to all of a scene's choices or none of them; leave it out when the scene doesn't test it.
- `points` and `dimensions` in `policy.json`: the points per rating and the list of dimensions (`id`, `label`, `description`). Change them there to retune scoring.
- `variants` on a scene: `[{ "ifFlags": ["ai-topic"], "situation": "...", "choices": { "b": { "feedback": "..." } } }]`. The first variant whose flag an earlier choice set replaces the situation and the `text` or `feedback` of the listed choices. Ratings, flags, and scores can't be changed by a variant, so every player's choices stay comparable.

Scenes play in list order. The game checks the file when it loads and shows an error if something is missing. It also warns in the browser console if an echo or trigger names a flag no earlier choice sets, which is usually a typo.

## Running it

On GitHub Pages: Settings → Pages → Deploy from a branch → choose the branch and the root folder. The landing page is at the site root, with each version in its folder (`/v1/`, `/v2/`, `/v3/`).

Locally, `fetch()` needs a web server rather than `file://`:

```bash
python3 -m http.server
```

then open http://localhost:8000.
