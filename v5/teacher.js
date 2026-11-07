/* Should I Use AI Here? (v5): teacher view.
   Plain JS, no build step. Loads the same data/scenarios.json and data/policy.json as the
   game and shows: what the game is for, how it scores, the three patterns, a class summary
   built from students' exported results, and discussion questions for each scene.

   Privacy: student files are read with FileReader or pasted, parsed in memory, and dropped
   when the page closes. Nothing is stored or sent; teacher.html's Content-Security-Policy
   blocks outside connections.

   Scoring: this page never re-scores anything. Each v5 export ends with a data comment
   holding the points, profile and writer type the game computed (see dataComment() in
   app.js). For v4 exports, the same numbers are read from the Markdown text. The only thing
   looked up here is each choice's rating and its points from policy.json, to compare scenes. */
(() => {
  "use strict";

  const SCENARIOS_URL = "data/scenarios.json";
  const POLICY_URL = "data/policy.json";
  const DATA_TAG = "should-i-use-ai:data";
  const RATINGS = ["transfers", "works", "shortcut", "line"];
  const DEFAULT_POINTS = { transfers: 3, works: 2, shortcut: 1, line: 0 };
  const BANDS = ["Strong", "Mixed", "Needs attention"];
  const WRITER_TYPE_ORDER = ["author", "ownership", "verification", "disclosure", "balancer", "deadline"];
  const TABS = [
    { id: "about", label: "About the game" },
    { id: "scoring", label: "Scoring" },
    { id: "patterns", label: "The three patterns" },
    { id: "class", label: "Class results" },
    { id: "discussion", label: "Discussion questions" },
  ];

  const $ = (sel, root = document) => root.querySelector(sel);
  const app = $("#app");
  const data = { scenarios: [], policy: null };
  let students = []; // in memory only
  let nextId = 1;
  let tab = "about";

  // ---------- helpers ----------
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const isConsequence = (s) => s.type === "consequence";
  const stageName = (s) => (isConsequence(s) ? "Consequence" : s.stage);
  const sceneById = (id) => data.scenarios.find((s) => s.id === id);
  const pointsTable = () => ({ ...DEFAULT_POINTS, ...(data.policy?.points || {}) });
  const pointsFor = (r) => pointsTable()[r] ?? 0;
  const maxPoints = () => Math.max(...RATINGS.map(pointsFor));
  const ratingLabel = (r) => data.policy?.ratings?.[r]?.label || r;
  const dimensions = () => data.policy?.dimensions || [];
  const writerTypes = () => data.policy?.writerTypes || {};
  const letterOf = (s, cid) => String.fromCharCode(65 + s.choices.findIndex((c) => c.id === cid));
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  const norm = (t) => String(t || "").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  function announce(msg) {
    const el = $("#announcer");
    el.textContent = "";
    setTimeout(() => { el.textContent = msg; }, 30);
  }

  function bar(value, label) {
    const v = Math.max(0, Math.min(100, Math.round(value)));
    return `<div class="profile-track" aria-hidden="true" title="${esc(label)}: ${v}%">${v > 0 ? `<span class="profile-fill" style="width:${v}%"></span>` : ""}</div>`;
  }

  // Which patterns a scene tests (any choice scores it).
  const scenePatterns = (s) => dimensions().filter((d) => s.choices.some((c) => Number.isInteger(c.scores?.[d.id])));

  // Choices that set any flag in a consequence scene's trigger.
  const triggersOf = (s, i) => data.scenarios.slice(0, i).flatMap((x) => x.choices
    .filter((c) => (c.flags || []).some((f) => (s.trigger?.anyFlags || []).includes(f)))
    .map((c) => ({ scene: x, choice: c })));

  // ---------- parsing exports ----------
  // Returns { records: [...], problems: [...] } for one pasted text or file.
  function parseText(text, source) {
    const records = [];
    const problems = [];
    const src = String(text || "");
    const tagRe = new RegExp(`<!--\\s*${DATA_TAG.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+([\\s\\S]*?)\\s*-->`, "g");
    let m, found = 0;
    while ((m = tagRe.exec(src))) {
      found++;
      try { records.push(fromV5(JSON.parse(m[1]), source)); }
      catch { problems.push(`${source}: one export's results block couldn't be read. It may have been edited or cut off.`); }
    }

    // A whole file of JSON (one export's data, or a list of them).
    if (!found && /^\s*[[{]/.test(src)) {
      try {
        const j = JSON.parse(src);
        for (const p of Array.isArray(j) ? j : [j]) records.push(fromV5(p, source));
        return { records, problems };
      } catch { /* fall through to Markdown */ }
    }

    // Exports without a data block (v4, or text pasted without the end of the file).
    const chunks = src.split(/^(?=# Should I Use AI Here\? \(v\d+\))/m).filter((c) => /^# Should I Use AI Here\? \(v\d+\)/.test(c));
    for (const chunk of chunks) {
      if (chunk.includes(DATA_TAG)) continue;
      records.push(fromMarkdown(chunk, source));
    }
    if (!records.length && !problems.length) {
      problems.push(`${source}: no exported results found. Use the Markdown file from the game's Download button, or text from Copy text.`);
    }
    return { records, problems };
  }

  function blankRecord(source, version) {
    return { id: nextId++, source, version, name: "", startedAt: "", complete: false, points: 0, possible: 0,
      writerType: null, dims: {}, path: [], warnings: [] };
  }

  function fromV5(p, source) {
    if (!p || typeof p !== "object" || !Array.isArray(p.path)) throw new Error("bad data");
    const r = blankRecord(source, Number(p.v) || 5);
    r.name = String(p.name || "").trim();
    r.startedAt = String(p.startedAt || "");
    r.complete = !!p.complete;
    r.points = Number(p.points) || 0;
    r.possible = Number(p.possible) || 0;
    r.writerType = typeof p.writerType === "string" && p.writerType ? p.writerType : null;
    for (const d of Array.isArray(p.dims) ? p.dims : []) {
      if (d && typeof d.id === "string") r.dims[d.id] = { pct: Number.isFinite(d.pct) ? d.pct : null, band: d.band || null };
    }
    for (const st of p.path) {
      const s = sceneById(st?.sceneId);
      if (!s) { r.warnings.push(`Skipped a scene this version doesn't have (${st?.sceneId}).`); continue; }
      const c = st.choiceId ? s.choices.find((x) => x.id === st.choiceId) : null;
      if (st.choiceId && !c) { r.warnings.push(`Couldn't match the choice in ${s.title}.`); }
      r.path.push({ sceneId: s.id, choiceId: c ? c.id : null, done: !!st.done && !!c });
      if (c && st.rating && st.rating !== c.rating) r.warnings.push(`The rating recorded for ${s.title} doesn't match this version's scenes.`);
    }
    return r;
  }

  // Best-effort reading of the Markdown the game exports (v4 and v5 share its layout).
  function fromMarkdown(md, source) {
    const ver = Number((md.match(/^# Should I Use AI Here\? \(v(\d+)\)/) || [])[1]) || 4;
    const r = blankRecord(source, ver);
    const field = (label) => (md.match(new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.+?)\\s*$`, "m")) || [])[1] || "";
    r.name = field("Name").replace(/^\(not given\)$/, "");
    r.startedAt = field("Started");
    const comp = field("Completed").match(/(\d+) of (\d+)/);
    r.complete = !!comp && comp[1] === comp[2];
    const pts = field("Points").match(/(\d+) of (\d+)/);
    if (pts) { r.points = Number(pts[1]); r.possible = Number(pts[2]); }
    const wt = field("Writer type");
    if (wt) {
      const hit = Object.entries(writerTypes()).find(([, t]) => wt.startsWith(`${t.label}.`) || wt === t.label);
      if (hit) r.writerType = hit[0]; else r.warnings.push("Couldn't match the writer type.");
    }
    for (const d of dimensions()) {
      const line = md.match(new RegExp(`^- \\*\\*${d.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\*\\*(.*)$`, "m"));
      if (!line) continue;
      const v = line[1].match(/(\d+)% \((Strong|Mixed|Needs attention)/);
      r.dims[d.id] = v ? { pct: Number(v[1]), band: v[2] } : { pct: null, band: null };
    }
    const heads = [...md.matchAll(/^## \d+\. (.+)$/gm)];
    heads.forEach((h, k) => {
      const body = md.slice(h.index + h[0].length, k + 1 < heads.length ? heads[k + 1].index : undefined);
      const title = h[1].replace(/^[^:]+: /, "");
      const s = data.scenarios.find((x) => norm(x.title) === norm(title));
      if (!s) { r.warnings.push(`Couldn't match the scene "${title}".`); return; }
      const chosen = (body.match(/^\*\*My choice:\*\*\s*(.+?)\s*$/m) || [])[1];
      if (!chosen) { r.path.push({ sceneId: s.id, choiceId: null, done: false }); return; }
      const ratingText = (body.match(/^\*\*Rating:\*\*\s*([^,]+),/m) || [])[1] || "";
      const texts = (c) => [c.text, ...(s.variants || []).map((v) => v.choices?.[c.id]?.text).filter(Boolean)].map(norm);
      let c = s.choices.find((x) => texts(x).includes(norm(chosen)));
      if (!c) {
        const byRating = s.choices.filter((x) => ratingLabel(x.rating) === ratingText.trim());
        if (byRating.length === 1) c = byRating[0];
      }
      if (!c) r.warnings.push(`Couldn't match the choice in ${s.title}.`);
      r.path.push({ sceneId: s.id, choiceId: c ? c.id : null, done: !!c && (r.complete || /\*\*(Reflection|Practice GenAI log entry)/.test(body)) });
    });
    if (!r.path.length) r.warnings.push("No scenes found in this export.");
    return r;
  }

  function addText(text, source) {
    const { records, problems } = parseText(text, source);
    const fresh = [];
    for (const rec of records) {
      const key = `${norm(rec.name)}|${rec.startedAt}`;
      const dupe = students.find((s) => `${norm(s.name)}|${s.startedAt}` === key && rec.name);
      if (dupe) { problems.push(`${source}: ${rec.name || "an export"} was already loaded, so it was skipped.`); continue; }
      if (!rec.name) rec.name = `Unnamed student ${rec.id}`;
      students.push(rec);
      fresh.push(rec);
    }
    return { added: fresh.length, problems };
  }

  // ---------- class summary ----------
  function summarize(list) {
    const answered = list.filter((r) => r.path.some((p) => p.choiceId));
    const complete = answered.filter((r) => r.complete);

    const types = WRITER_TYPE_ORDER.map((id) => ({ id, label: writerTypes()[id]?.label || id, n: complete.filter((r) => r.writerType === id).length }));

    const dims = dimensions().map((d) => {
      const vals = complete.map((r) => r.dims[d.id]?.pct).filter((v) => Number.isFinite(v));
      const bands = Object.fromEntries(BANDS.map((b) => [b, complete.filter((r) => r.dims[d.id]?.band === b).length]));
      return { ...d, n: vals.length, avg: avg(vals), bands };
    });

    const pointsPct = avg(complete.filter((r) => r.possible > 0).map((r) => (r.points / r.possible) * 100));

    const scenes = data.scenarios.map((s, i) => {
      const picks = answered.flatMap((r) => r.path.filter((p) => p.sceneId === s.id && p.choiceId));
      const top = Math.max(...s.choices.map((c) => pointsFor(c.rating)));
      const earned = picks.map((p) => pointsFor(s.choices.find((c) => c.id === p.choiceId).rating));
      const reached = answered.filter((r) => r.path.some((p) => p.sceneId === s.id)).length;
      const choices = s.choices.map((c) => ({ c, n: picks.filter((p) => p.choiceId === c.id).length }));
      return { s, i, n: picks.length, reached, top, avgPts: avg(earned), avgPct: picks.length ? pct(earned.reduce((a, b) => a + b, 0), top * picks.length) : null, choices };
    });

    const hardest = scenes.filter((x) => x.n > 0).sort((a, b) => a.avgPct - b.avgPct || b.n - a.n || a.i - b.i).slice(0, 3);
    const hardChoices = scenes.flatMap((x) => x.choices
      .filter(({ c, n }) => n > 0 && (c.rating === "shortcut" || c.rating === "line"))
      .map(({ c, n }) => ({ scene: x, c, n, share: pct(n, x.n) })))
      .sort((a, b) => b.share - a.share || b.n - a.n)
      .slice(0, 5);

    return { answered, complete, types, dims, pointsPct, scenes, hardest, hardChoices };
  }

  // ---------- rendering ----------
  function render({ focus = false } = {}) {
    const nav = `
      <nav class="teacher-nav" aria-label="Teacher view sections">
        <ul>${TABS.map((t) => `<li><a href="#${t.id}" ${t.id === tab ? 'aria-current="page"' : ""}>${esc(t.label)}${t.id === "class" && students.length ? ` <span class="nav-count">(${students.length})</span>` : ""}</a></li>`).join("")}</ul>
      </nav>`;
    const body = { about: aboutHtml, scoring: scoringHtml, patterns: patternsHtml, class: classHtml, discussion: discussionHtml }[tab]();
    app.innerHTML = `${nav}<section class="card teacher-card" aria-labelledby="view-title">${body}</section>`;
    if (tab === "class") wireClass();
    if (focus) {
      const h = $("#view-title");
      h.setAttribute("tabindex", "-1");
      h.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }

  function aboutHtml() {
    const core = data.scenarios.filter((s) => !isConsequence(s));
    const conseq = data.scenarios.map((s, i) => ({ s, i })).filter(({ s }) => isConsequence(s));
    const summary = (data.policy?.summary || []).map((p) => `<p>${esc(p)}</p>`).join("");
    return `
      <p class="eyebrow">ENC 1102 · Teacher view</p>
      <h1 id="view-title" class="view-title">About the game</h1>
      <p class="lede"><em>Should I Use AI Here?</em> puts students in ${core.length} ordinary moments from a research-writing unit and asks them to decide whether and how to use generative AI. It isn't a quiz with one right answer. It's practice in the judgment the course policy asks for: making an informed decision, explaining it, and being honest about it.</p>
      <div class="sticky-note">
        <p class="note-title">The course policy, in short</p>
        ${summary}
      </div>
      <h2 class="small-h">What students do in each scene</h2>
      <ol class="teacher-list">
        <li>Read a short setup with a classmate (Maya, Luis, Priya or Jordan) and the situation.</li>
        <li>Pick one of four choices and write at least one sentence about why, then lock it in. Choices can't be changed later.</li>
        <li>Read feedback that explains how the choice plays out and how it connects to the policy.</li>
        <li>Write a reflection of at least 25 words, or a practice GenAI log entry if their choice used AI.</li>
      </ol>
      <h2 class="small-h">Choices that follow students</h2>
      <p>Earlier choices show up later. Some scenes change their wording because of an earlier choice, and three consequence scenes appear only on certain paths, so a playthrough is 6 to 9 scenes long.</p>
      <ul class="teacher-list scene-index">
        ${core.map((s) => `<li><strong>${esc(s.stage)}:</strong> ${esc(s.title)}</li>`).join("")}
        ${conseq.map(({ s, i }) => `<li><strong>Consequence:</strong> ${esc(s.title)} <span class="hint">Appears after ${esc(triggersOf(s, i).map((t) => `${t.scene.stage} ${letterOf(t.scene, t.choice.id)}`).join(", "))}.</span></li>`).join("")}
      </ul>
      <h2 class="small-h">What students submit</h2>
      <p>At the end, students see a results page and export their choices and reflections: a Markdown download, copied text, or a PDF. The Markdown download and copied text also carry their results in a form this page can read, so you can collect them on Webcourses and load them under <a href="#class">Class results</a>. PDFs can't be read here.</p>
      <h2 class="small-h">Your students' privacy</h2>
      <p>The game saves progress only in each student's browser. This page reads the files you choose in your browser and keeps them in memory until you close or reload it. Nothing is uploaded, stored, or sent anywhere, and the page is set up so it can't contact any other site.</p>`;
  }

  function scoringHtml() {
    const ratings = RATINGS.map((r) => `
      <tr><th scope="row"><span class="pill rating-${r}">${esc(ratingLabel(r))}</span></th>
        <td>${esc(plural(pointsFor(r), "point"))}</td>
        <td>${esc(data.policy?.ratings?.[r]?.description || "")}</td></tr>`).join("");
    const types = WRITER_TYPE_ORDER.map((id) => {
      const t = writerTypes()[id] || {};
      return `<li><strong>${esc(t.label || id)}.</strong> ${esc(t.summary || "")}</li>`;
    }).join("");
    return `
      <p class="eyebrow">Teacher view</p>
      <h1 id="view-title" class="view-title">How the game scores</h1>
      <p class="lede">Every choice gets a rating and points, and it also scores the patterns its scene tests. Students see both on their results page. The score is feedback on one playthrough, not a grade.</p>
      <h2 class="small-h">Ratings and points</h2>
      <div class="table-wrap"><table class="teacher-table">
        <thead><tr><th scope="col">Rating</th><th scope="col">Points</th><th scope="col">What it means</th></tr></thead>
        <tbody>${ratings}</tbody>
      </table></div>
      <p>A student's total is out of ${plural(maxPoints(), "point")} for each scene they played. Choosing not to use AI is never rated below <em>${esc(ratingLabel("works"))}</em>, and every no-AI choice earns full points.</p>
      <h2 class="small-h">The profile</h2>
      <p>Each choice also scores each pattern its scene tests from -2 to +2 (see <a href="#patterns">The three patterns</a>). For each pattern, the game adds up a student's scores in the scenes they played that test it, then places that total between the lowest and highest totals those same scenes allow. That gives a percentage, so a 6-scene path and a 9-scene path compare fairly.</p>
      <ul class="teacher-list">
        <li><strong>Strong:</strong> 75% or more</li>
        <li><strong>Mixed:</strong> 40% to 74%</li>
        <li><strong>Needs attention:</strong> below 40%</li>
      </ul>
      <p>The profile reflects what a choice did, such as re-checking sources, not whether AI was involved.</p>
      <h2 class="small-h">Writer types</h2>
      <p>Once a student finishes, the results page names a writer type from their profile. Every pattern Strong gives <em>${esc(writerTypes().author?.label || "The Author")}</em>. Otherwise their strongest Strong pattern names the type. With nothing Strong, it's <em>${esc(writerTypes().balancer?.label || "The Balancer")}</em> if no pattern needs attention, and <em>${esc(writerTypes().deadline?.label || "The Deadline Writer")}</em> if one does. The type describes the playthrough, not the student.</p>
      <ul class="teacher-list">${types}</ul>
      <h2 class="small-h">Practice replays</h2>
      <p>After finishing, students can replay any scene to try other choices and read the feedback. Replays never change their recorded choices, points, or profile.</p>`;
  }

  function patternsHtml() {
    const rows = dimensions().map((d) => {
      const scenes = data.scenarios.filter((s) => scenePatterns(s).some((x) => x.id === d.id));
      const tk = d.takeaways || {};
      return `
        <section class="pattern">
          <h2>${esc(d.label)}</h2>
          <p>${esc(d.description)}</p>
          <p class="label-sm">Tested in</p>
          <ul class="teacher-list">${scenes.map((s) => `<li><strong>${esc(stageName(s))}:</strong> ${esc(s.title)}</li>`).join("")}</ul>
          <p class="label-sm">What students read on their results page</p>
          <dl class="takeaways">
            ${tk.strong ? `<dt>Strong</dt><dd>${esc(tk.strong)}</dd>` : ""}
            ${tk.mixed ? `<dt>Mixed</dt><dd>${esc(tk.mixed)}</dd>` : ""}
            ${tk.needs ? `<dt>Needs attention</dt><dd>${esc(tk.needs)}</dd>` : ""}
          </dl>
        </section>`;
    }).join("");
    return `
      <p class="eyebrow">Teacher view</p>
      <h1 id="view-title" class="view-title">The three patterns</h1>
      <p class="lede">The profile tracks three habits the course policy cares about. Each scene tests two of them.</p>
      ${rows}`;
  }

  function discussionHtml() {
    const items = data.scenarios.map((s, i) => `
      <section class="discussion-scene">
        <p class="eyebrow"><span class="stage-tag ${isConsequence(s) ? "consequence-tag" : ""}">${esc(stageName(s))}</span></p>
        <h2>${esc(s.title)}</h2>
        ${isConsequence(s) ? `<p class="cause small">Appears only after: ${esc(triggersOf(s, i).map((t) => `${t.scene.stage} ${letterOf(t.scene, t.choice.id)}`).join(", "))}</p>` : ""}
        ${s.setup ? `<p class="setup-text">${esc(s.setup)}</p>` : ""}
        <p class="situation">${esc(s.situation)}</p>
        ${s.learningGoal ? `<p class="goal"><strong>Learning goal:</strong> ${esc(s.learningGoal)}</p>` : ""}
        ${questionsHtml(s)}
        ${choicesTableHtml(s)}
      </section>`).join("");
    return `
      <p class="eyebrow">Teacher view</p>
      <h1 id="view-title" class="view-title">Discussion questions</h1>
      <p class="lede">Three questions for each scene, for after students have played. They work for any path, and none of them has a single right answer.</p>
      ${items}`;
  }

  function questionsHtml(s) {
    if (!Array.isArray(s.discussion) || !s.discussion.length) return "";
    return `<p class="label-sm">Questions for class</p><ol class="questions">${s.discussion.map((q) => `<li>${esc(q)}</li>`).join("")}</ol>`;
  }

  function choicesTableHtml(s, counts = null, total = 0) {
    const pats = scenePatterns(s);
    const fmt = (v) => (Number.isInteger(v) ? (v > 0 ? `+${v}` : String(v)) : "–");
    return `
      <details class="choices-detail" ${counts ? "open" : ""}>
        <summary>${counts ? "How the class chose" : "Choices and ratings"}</summary>
        <div class="table-wrap"><table class="teacher-table">
          <thead><tr><th scope="col">Choice</th><th scope="col">Rating</th>${pats.map((d) => `<th scope="col">${esc(d.label)}</th>`).join("")}${counts ? '<th scope="col">Students</th>' : ""}</tr></thead>
          <tbody>${s.choices.map((c, i) => {
            const n = counts ? counts.find((x) => x.c.id === c.id).n : 0;
            return `<tr>
              <td><strong>${String.fromCharCode(65 + i)}.</strong> ${esc(c.text)}${c.usesAI ? ' <span class="hint">(uses AI)</span>' : ""}</td>
              <td><span class="pill rating-${esc(c.rating)}">${esc(ratingLabel(c.rating))}</span></td>
              ${pats.map((d) => `<td class="num">${fmt(c.scores?.[d.id])}</td>`).join("")}
              ${counts ? `<td class="num">${n}${total ? ` <span class="hint">(${pct(n, total)}%)</span>` : ""}${total ? bar(pct(n, total), `Choice ${String.fromCharCode(65 + i)}`) : ""}</td>` : ""}
            </tr>`;
          }).join("")}</tbody>
        </table></div>
      </details>`;
  }

  function classHtml() {
    const loader = `
      <div class="loader sticky-note">
        <p class="note-title">Add students' results</p>
        <p>Choose or drop the Markdown files students downloaded from the game (.md), or paste text they copied. You can add several at once, and paste several exports into the box together. Version 4 exports work too.</p>
        <div class="drop-zone" id="drop-zone">
          <label for="file-input" class="btn primary">Choose files</label>
          <input id="file-input" class="visually-hidden" type="file" multiple accept=".md,.markdown,.txt,.json,text/markdown,text/plain,application/json">
          <span class="hint">or drop them here</span>
        </div>
        <label for="paste-box" class="reflect-label">Paste exported text</label>
        <textarea id="paste-box" class="ruled" rows="5" spellcheck="false"></textarea>
        <div class="btn-row"><button type="button" class="btn" id="paste-add">Add pasted text</button></div>
        <p class="count" id="load-status" aria-live="polite"></p>
        <p class="hint">Files are read in this browser only and kept until you close or reload this page.</p>
      </div>`;
    if (!students.length) {
      return `
        <p class="eyebrow">Teacher view</p>
        <h1 id="view-title" class="view-title">Class results</h1>
        <p class="lede">See how your class played: writer types, the average profile for each pattern, and which scenes and choices were hardest.</p>
        ${loader}`;
    }
    const sum = summarize(students);
    const nC = sum.complete.length;
    const roster = students.map((r) => {
      const answered = r.path.filter((p) => p.choiceId).length;
      const t = r.writerType ? writerTypes()[r.writerType]?.label || r.writerType : "";
      return `
        <tr>
          <th scope="row">${esc(r.name)}</th>
          <td>${r.complete ? "Finished" : `In progress (${answered} of ${r.path.length})`}${r.version !== 5 ? ` <span class="hint">v${esc(r.version)}</span>` : ""}</td>
          <td>${esc(t) || '<span class="hint">–</span>'}</td>
          <td class="num">${r.possible ? `${r.points} / ${r.possible}` : "–"}</td>
          <td>${r.warnings.length ? `<details class="warn"><summary>${plural(r.warnings.length, "note")}</summary><ul>${r.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></details>` : ""}</td>
          <td><button type="button" class="btn small ghost" data-remove="${r.id}">Remove<span class="visually-hidden"> ${esc(r.name)}</span></button></td>
        </tr>`;
    }).join("");

    const typeRows = sum.types.map((t) => `
      <li class="profile-row">
        <div class="profile-head"><span class="profile-label">${esc(t.label)}</span><span class="profile-value">${t.n} of ${nC}</span></div>
        ${bar(pct(t.n, nC), t.label)}
      </li>`).join("");

    const dimRows = sum.dims.map((d) => `
      <li class="profile-row ${d.avg === null ? "unmeasured" : ""}">
        <div class="profile-head"><span class="profile-label">${esc(d.label)}</span>
          <span class="profile-value">${d.avg === null ? "No data" : `Average ${Math.round(d.avg)}%`}</span></div>
        ${d.avg === null ? bar(0, d.label) : bar(d.avg, d.label)}
        <p class="profile-desc">${BANDS.map((b) => `${esc(b)}: ${d.bands[b]}`).join(" · ")}${d.n < nC ? ` · not measured: ${nC - d.n}` : ""}</p>
      </li>`).join("");

    const hardest = sum.hardest.map((x) => `
      <li><strong>${esc(stageName(x.s))}: ${esc(x.s.title)}</strong>
        <span class="hint">Average ${x.avgPts.toFixed(1)} of ${x.top} points (${x.avgPct}%), ${plural(x.n, "student")}</span></li>`).join("");
    const hardChoices = sum.hardChoices.map((h) => `
      <li><span class="pill rating-${esc(h.c.rating)}">${esc(ratingLabel(h.c.rating))}</span>
        <strong>${esc(stageName(h.scene.s))} ${letterOf(h.scene.s, h.c.id)}:</strong> ${esc(h.c.text)}
        <span class="hint">${h.n} of ${h.scene.n} (${h.share}%)</span></li>`).join("");

    const sceneCards = sum.scenes.map((x) => `
      <section class="discussion-scene">
        <p class="eyebrow"><span class="stage-tag ${isConsequence(x.s) ? "consequence-tag" : ""}">${esc(stageName(x.s))}</span></p>
        <h3>${esc(x.s.title)}</h3>
        <p class="hint">${x.n
          ? `${plural(x.n, "student")} answered${isConsequence(x.s) ? ` (${x.reached} of ${sum.answered.length} reached it)` : ""}. Average ${x.avgPts.toFixed(1)} of ${x.top} points (${x.avgPct}%).`
          : isConsequence(x.s) ? "No one's path reached this scene." : "No answers yet."}</p>
        ${x.n ? choicesTableHtml(x.s, x.choices, x.n) : ""}
        <details class="choices-detail"><summary>Discussion questions</summary>${questionsHtml(x.s)}</details>
      </section>`).join("");

    return `
      <p class="eyebrow">Teacher view</p>
      <h1 id="view-title" class="view-title">Class results</h1>
      <p class="lede">${plural(students.length, "student")} loaded, ${nC} finished. Writer types and profiles count finished playthroughs only; scene results count every answered scene.</p>
      ${loader}
      <h2 class="small-h">Students</h2>
      <div class="table-wrap"><table class="teacher-table roster">
        <thead><tr><th scope="col">Name</th><th scope="col">Status</th><th scope="col">Writer type</th><th scope="col">Points</th><th scope="col">Notes</th><th scope="col"><span class="visually-hidden">Remove</span></th></tr></thead>
        <tbody>${roster}</tbody>
      </table></div>
      <div class="btn-row">
        <button type="button" class="btn" id="csv-btn">Download class results (.csv)</button>
        <button type="button" class="btn ghost" id="clear-btn">Clear all</button>
      </div>
      ${nC ? `
        <h2 class="small-h">Writer types</h2>
        <ul class="profile-chart">${typeRows}</ul>
        <h2 class="small-h">Average profile per pattern</h2>
        ${sum.pointsPct !== null ? `<p>Average points: ${Math.round(sum.pointsPct)}% of the points possible on each student's path.</p>` : ""}
        <ul class="profile-chart">${dimRows}</ul>`
        : `<p class="hint">No one has finished yet, so there are no writer types or profiles to summarize.</p>`}
      ${hardest ? `
        <h2 class="small-h">Hardest scenes</h2>
        <p class="hint">Lowest average points as a share of the best choice's points.</p>
        <ol class="teacher-list numbered">${hardest}</ol>` : ""}
      <h2 class="small-h">Hardest choices</h2>
      ${hardChoices ? `<p class="hint">The ${esc(ratingLabel("shortcut"))} and ${esc(ratingLabel("line"))} choices picked by the largest share of the students who saw them.</p>
        <ul class="teacher-list">${hardChoices}</ul>`
        : `<p class="hint">No one picked a ${esc(ratingLabel("shortcut"))} or ${esc(ratingLabel("line"))} choice.</p>`}
      <h2 class="small-h">Scene by scene</h2>
      ${sceneCards}`;
  }

  function wireClass() {
    const status = (msg) => { $("#load-status").textContent = msg; };
    const finish = (added, problems) => {
      render();
      const msg = `${added ? `Added ${plural(added, "student")}.` : "No new students added."}${problems.length ? ` ${problems.join(" ")}` : ""}`;
      $("#load-status").textContent = msg;
      announce(msg);
    };
    const readFiles = async (files) => {
      let added = 0;
      const problems = [];
      for (const f of files) {
        if (/\.pdf$/i.test(f.name)) { problems.push(`${f.name}: PDFs can't be read. Ask for the .md download instead.`); continue; }
        if (f.size > 5 * 1024 * 1024) { problems.push(`${f.name}: too large to be an export.`); continue; }
        try {
          const r = addText(await f.text(), f.name);
          added += r.added; problems.push(...r.problems);
        } catch { problems.push(`${f.name}: couldn't be read.`); }
      }
      finish(added, problems);
    };
    $("#file-input").addEventListener("change", (e) => { readFiles([...e.target.files]); });
    const zone = $("#drop-zone");
    zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("over"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("over"));
    zone.addEventListener("drop", (e) => { e.preventDefault(); zone.classList.remove("over"); readFiles([...(e.dataTransfer?.files || [])]); });
    $("#paste-add").addEventListener("click", () => {
      const text = $("#paste-box").value;
      if (!text.trim()) { status("Paste an export first."); return; }
      const r = addText(text, "Pasted text");
      finish(r.added, r.problems);
    });
    app.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", () => {
      const r = students.find((s) => s.id === Number(b.dataset.remove));
      students = students.filter((s) => s !== r);
      render();
      announce(`Removed ${r?.name || "student"}.`);
      $("#view-title").focus();
    }));
    $("#clear-btn")?.addEventListener("click", () => {
      if (!confirm("Remove every loaded student from this page? Their files aren't affected.")) return;
      students = [];
      render({ focus: true });
      announce("Cleared.");
    });
    $("#csv-btn")?.addEventListener("click", downloadCsv);
  }

  // ---------- CSV ----------
  // Cells that start with = + - @ are prefixed so spreadsheets don't run them as formulas.
  function csvCell(v) {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function downloadCsv() {
    const dims = dimensions();
    const head = ["Name", "Finished", "Points", "Possible", "Writer type", ...dims.flatMap((d) => [`${d.label} %`, `${d.label} band`]),
      ...data.scenarios.map((s) => `${stageName(s)}: ${s.title}`)];
    const rows = students.map((r) => [
      r.name, r.complete ? "yes" : "no", r.points, r.possible,
      r.writerType ? writerTypes()[r.writerType]?.label || r.writerType : "",
      ...dims.flatMap((d) => [r.dims[d.id]?.pct ?? "", r.dims[d.id]?.band ?? ""]),
      ...data.scenarios.map((s) => {
        const p = r.path.find((x) => x.sceneId === s.id);
        if (!p) return "";
        const c = s.choices.find((x) => x.id === p.choiceId);
        return c ? `${letterOf(s, c.id)} (${ratingLabel(c.rating)})` : "not answered";
      }),
    ]);
    const csv = [head, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "should-i-use-ai-class-results.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $("#load-status").textContent = "Downloaded the class results.";
  }

  // ---------- navigation ----------
  function fromHash() {
    const h = location.hash.replace("#", "");
    return TABS.some((t) => t.id === h) ? h : "about";
  }
  window.addEventListener("hashchange", () => { tab = fromHash(); render({ focus: true }); });

  // ---------- boot ----------
  async function boot() {
    try {
      const [r1, r2] = await Promise.all([fetch(SCENARIOS_URL, { cache: "no-cache" }), fetch(POLICY_URL, { cache: "no-cache" })]);
      if (!r1.ok || !r2.ok) throw new Error();
      const scen = await r1.json();
      data.policy = await r2.json();
      data.scenarios = scen.scenarios || [];
      if (!data.scenarios.length) throw new Error();
    } catch {
      app.innerHTML = `
        <section class="card error-card" role="alert">
          <h1 class="view-title">The teacher view couldn't load.</h1>
          <p class="hint">It needs data/scenarios.json and data/policy.json. If you're running this from your computer, open it through a local web server (for example <code>python3 -m http.server</code>) rather than double-clicking the file.</p>
        </section>`;
      return;
    }
    tab = fromHash();
    render();
  }

  // Warn before leaving if students are loaded, since nothing is saved.
  window.addEventListener("beforeunload", (e) => {
    if (students.length) { e.preventDefault(); e.returnValue = ""; }
  });

  boot();
})();
