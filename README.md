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
| `v4/` | Characters and results: a named student and short setup in every scene, scene icons, a step progress bar, small transitions, and a results page with a writer type, a takeaway per pattern, and practice replays (scoring unchanged from v3) |
| `v5/` | Teacher mode: a teacher view (`v5/teacher.html`) with the game's purpose, scoring and patterns, a class summary from students' exports, and discussion questions per scene; a top-level heading on every game screen (play and scoring unchanged from v4) |

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

  The end screen shows a bar for each one. A bar compares your choices with the weakest and best choices available in the scenes you actually played, so a 6-scene path and a 9-scene path compare fairly. Not using AI is never penalized: every no-AI choice earns full points, and the profile reflects what a choice did (for example, re-checking sources), not whether AI was involved.
- **Scene variants.** A scene can change its situation and the wording of individual choices based on an earlier choice. If AI picked your topic in Brainstorming, the Research scene now names that AI-suggested topic instead of food insecurity.
- **Clearer Pitch rating.** In *Pitch it in two minutes*, the slide-deck choice now says exactly what earns its *Works* rating (you rewrite the speaker notes, cut slides, and log it), and the feedback explains why it's *Works* rather than *Transfers well*.
- The export and print view include your points and profile.

## What v4 adds: characters and a results page

- **Scene openers.** Every scene starts with a short setup featuring one of four classmates: Maya (your roommate), Luis (a classmate), Priya (your study-group friend), and Jordan (your peer-review partner). The situation, choices, and feedback are the same as v3.
- **Light visual polish.** Each scene has an icon. The progress bar has one segment per scene on your path (consequence scenes join it when they're triggered). Cards fade in and feedback drops in, but only when your device hasn't asked for reduced motion.
- **A results page.** The end screen now opens with:
  - **Your writer type**, from your profile: *The Author* (every pattern Strong), *The Original Thinker*, *The Fact-Checker*, or *The Open Book* (your strongest pattern when at least one is Strong), *The Balancer* (nothing Strong and nothing Needs attention), or *The Deadline Writer* (otherwise). It describes the playthrough, not the player, and it isn't a grade.
  - **A takeaway for each pattern**, matched to its band, plus the scene where it showed most (your best moment if Strong, otherwise the scene with the most room to grow).
  - **Scenes to replay**: up to three scenes where another choice earns more points, ranked by points left on the table. **Practice replay** lets you try any choice in a finished scene and read its feedback. Nothing is saved, so your recorded choice, points, and profile don't change. Every scene on the path has a practice button too.
- **Scoring is unchanged.** Points, profile bars, and bands are computed exactly as in v3, from the same ratings and scores.
- The export and print view include your writer type, takeaways, and the scenes to replay.

## What v5 adds: teacher mode

- **A teacher view** at `v5/teacher.html`, linked from the landing page and the game's footer. It has five sections:
  - *About the game*: what it's for, what students do in each scene, how choices follow them, and what they submit.
  - *Scoring*: ratings and points, how the profile percentages and bands work, and how a writer type is chosen. All of it is read from `policy.json`, so it stays in step with the game.
  - *The three patterns*: each pattern's description, the scenes that test it, and the takeaways students read.
  - *Class results*: choose or drop students' exported `.md` files, or paste text they copied (several at once is fine). You get a roster, writer-type counts, the average profile and band counts per pattern, the hardest scenes and choices, how the class chose in every scene, and a CSV download. Writer types and profiles count finished playthroughs only. Version 4 exports are read from their Markdown, best effort; anything that can't be matched is noted next to that student.
  - *Discussion questions*: three questions for each scene, with the scene's setup, situation, learning goal, and its choices with ratings and pattern scores.
- **Privacy.** The teacher view reads files with the browser only and keeps them in memory until the page is closed or reloaded. Nothing is stored or sent, and its Content-Security-Policy blocks connections to anything but its own files.
- **A results block in the export.** The Markdown download and copied text end with one HTML comment (`<!-- should-i-use-ai:data {...} -->`) holding the scene and choice ids, points, profile, and writer type the game already computed. It's invisible when the Markdown is rendered. The teacher view reads it; it never re-scores anything.
- **Headings.** Every game screen now has one top-level heading (the scene title, the results title, and so on), styled as before.
- **Play and scoring are unchanged** from v4.

## Your data

Progress and reflections are stored in this browser's `localStorage` under a per-version key (`shouldIUseAI.v1` through `shouldIUseAI.v5`), so versions don't overwrite each other. Nothing is sent anywhere. Clearing site data or switching browsers/devices loses progress, so export before you submit.

## Editing scenarios

Each version has its own data: `v5/data/scenarios.json` and `v5/data/policy.json` for the current version (earlier versions' are in `v1/data/` through `v4/data/`). Each scene has a stage, assignment, situation, learning goal, reflection prompts, GenAI log questions, and choices. Each choice has `text`, `usesAI`, `rating` (`transfers`, `works`, `shortcut`, or `line`), `feedback`, and an optional `policyLink` and `ethicsNote`.

v2 adds three fields for consequences:

- `flags` on a choice: short labels for what the choice means later, e.g. `["ai-topic"]`.
- `echoes` on a scene: `[{ "ifFlags": ["ai-topic"], "text": "..." }]`. The first echo whose flag an earlier choice set is shown at the top of the scene.
- `"type": "consequence"` with `"trigger": { "anyFlags": ["unverified-sources", "fabricated-citation"] }` on a scene: it plays only if an earlier choice set one of those flags. Place it in the list where it should appear.

v3 adds:

- `scores` on a choice: `{ "ownership": 2, "disclosure": -1 }`, whole numbers from -2 to 2. Give a dimension to all of a scene's choices or none of them; leave it out when the scene doesn't test it.
- `points` and `dimensions` in `policy.json`: the points per rating and the list of dimensions (`id`, `label`, `description`). Change them there to retune scoring.
- `variants` on a scene: `[{ "ifFlags": ["ai-topic"], "situation": "...", "choices": { "b": { "feedback": "..." } } }]`. The first variant whose flag an earlier choice set replaces the situation and the `text` or `feedback` of the listed choices. Ratings, flags, and scores can't be changed by a variant, so every player's choices stay comparable.

v4 adds (all optional, presentation only):

- `icon` on a scene: one of `lightbulb`, `books`, `moon`, `list`, `alert`, `people`, `mic`, `pencil`, `chat`.
- `character` on a scene: `{ "name": "Maya", "role": "your roommate" }`.
- `setup` on a scene: one or two sentences shown before the situation. A variant can also replace `setup`.
- `takeaways` on each dimension in `policy.json`: `{ "strong": "...", "mixed": "...", "needs": "..." }`.
- `writerTypes` in `policy.json`: the label, summary, and "try next" line for `author`, `ownership`, `verification`, `disclosure`, `balancer`, and `deadline`. The rule that picks one is fixed in `app.js` (`writerTypeFor`).

v5 adds (optional, teacher view only):

- `discussion` on a scene: a list of questions for class discussion, shown in the teacher view.

Choices appear in the order they're listed, lettered A to D. In v3 each scene's order is set by hand so the strongest and weakest options don't always land in the same position. Choice ids don't have to follow that order; ids are what saved progress, variants, and exports refer to.

Scenes play in list order. The game checks the file when it loads and shows an error if something is missing. It also warns in the browser console if an echo or trigger names a flag no earlier choice sets, which is usually a typo.

## Running it

On GitHub Pages: Settings → Pages → Deploy from a branch → choose the branch and the root folder. The landing page is at the site root, with each version in its folder (`/v1/` through `/v5/`). The teacher view is at `/v5/teacher.html`.

Locally, `fetch()` needs a web server rather than `file://`:

```bash
python3 -m http.server
```

then open http://localhost:8000.
