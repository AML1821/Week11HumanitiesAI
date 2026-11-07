/* Should I Use AI Here? (v5: teacher mode)
   Plain JS, no build step. Scenarios and policy load from data/*.json via fetch();
   each player's progress and reflections live in localStorage under STORE_KEY.

   Flow per scene: pick a choice -> write a "why" (PRE_MIN words) -> lock in ->
   read feedback -> reflect or write a mock GenAI log entry (POST_MIN words) -> next.

   Consequences: choices carry "flags". A later scene can show an "echo" note when an
   earlier choice set one of its ifFlags, and a scene with type "consequence" is only
   played when an earlier choice set one of its trigger.anyFlags. Scenes play in array
   order and answers lock in that order, so a scene's flags only ever come from scenes
   before it and never change after the fact.

   v4 adds presentation only: each scene can have an icon, a named character, and a short
   setup; the end screen becomes a results page (writer type, a takeaway per pattern, and
   replay suggestions). Scoring is the same as v3. */
(() => {
  "use strict";

  const VERSION = 5;
  const STORE_KEY = "shouldIUseAI.v5";
  const SCENARIOS_URL = "data/scenarios.json";
  const POLICY_URL = "data/policy.json";
  const PRE_MIN = 8;
  const POST_MIN = 25;
  const RATINGS = ["transfers", "works", "shortcut", "line"];

  // Scene icons: simple stroke SVGs that take the text colour. Always decorative.
  const ICON_PATHS = {
    lightbulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z"/>',
    books: '<path d="M4 4h4v16H4zM10 4h4v16h-4z"/><path d="M16.5 4.6l3.8-1 3.1 15.4-3.8 1z" transform="translate(-2 1)"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01" stroke-width="3"/>',
    alert: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>',
    people: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14.5c3 0 6 1.7 6 5.5"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/>',
    pencil: '<path d="M4 20l4-1L19 8l-3-3L5 16l-1 4z"/><path d="M14 7l3 3"/>',
    chat: '<path d="M4 5h16v11H9l-5 4V5z"/><path d="M8 9h8M8 12h5"/>',
    flag: '<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>',
  };
  const ICONS = Object.keys(ICON_PATHS).filter((k) => k !== "flag");
  const iconSvg = (key, cls = "icon") => `<svg class="${cls}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[key] || ICON_PATHS.flag}</svg>`;
  const sceneIcon = (s) => iconSvg(s.icon || "flag");

  const $ = (sel, root = document) => root.querySelector(sel);
  const app = $("#app");

  const data = { scenarios: [], policy: null };
  let state = freshState();
  let storageOk = true;
  let view = { name: "start" }; // start | scenario | finish | explore | print

  // ---------- helpers ----------
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const words = (s) => (String(s || "").match(/\S+/g) || []).length;
  const ratingLabel = (r) => data.policy?.ratings?.[r]?.label || r;
  const ratingDesc = (r) => data.policy?.ratings?.[r]?.description || "";
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

  // Scoring defaults, used when policy.json doesn't define its own.
  const DEFAULT_POINTS = { transfers: 3, works: 2, shortcut: 1, line: 0 };
  const DEFAULT_DIMENSIONS = [
    { id: "ownership", label: "Ownership of ideas", description: "" },
    { id: "verification", label: "Verification", description: "" },
    { id: "disclosure", label: "Honest disclosure", description: "" },
  ];
  const pointsTable = () => ({ ...DEFAULT_POINTS, ...(data.policy?.points || {}) });
  const pointsFor = (r) => pointsTable()[r] ?? 0;
  const maxPoints = () => Math.max(...RATINGS.map(pointsFor));
  const dimensions = () => (Array.isArray(data.policy?.dimensions) && data.policy.dimensions.length ? data.policy.dimensions : DEFAULT_DIMENSIONS);

  function freshState() {
    return { version: VERSION, name: "", startedAt: null, finishedAt: null, currentIndex: 0, answers: {} };
  }

  function announce(msg) {
    const el = $("#announcer");
    el.textContent = "";
    setTimeout(() => { el.textContent = msg; }, 30);
  }

  function formatDate(iso) {
    if (!iso) return "";
    try { return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); }
    catch { return iso; }
  }

  // ---------- storage ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.answers && typeof parsed.answers === "object") {
        state = Object.assign(freshState(), parsed);
      }
    } catch {
      storageOk = false;
    }
  }

  function save() {
    if (!storageOk) return;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch { storageOk = false; showStorageWarning(); }
  }

  let saveTimer = null;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 300);
  }
  window.addEventListener("pagehide", save);

  function probeStorage() {
    try {
      const k = STORE_KEY + ".probe";
      localStorage.setItem(k, "1");
      localStorage.removeItem(k);
    } catch {
      storageOk = false;
    }
    showStorageWarning();
  }
  function showStorageWarning() { $("#storage-warning").hidden = storageOk; }

  // ---------- data validation ----------
  function validateScenarios(json, policy) {
    const errors = [];
    const dimIds = (Array.isArray(policy?.dimensions) && policy.dimensions.length ? policy.dimensions : DEFAULT_DIMENSIONS).map((d) => d.id);
    if (!json || !Array.isArray(json.scenarios) || json.scenarios.length === 0) {
      return ["The file needs a non-empty \"scenarios\" list."];
    }
    const ids = new Set();
    json.scenarios.forEach((s, i) => {
      const where = `Scenario ${i + 1}${s && s.id ? ` (${s.id})` : ""}`;
      if (!s || typeof s !== "object") { errors.push(`${where} is not an object.`); return; }
      for (const f of ["id", "stage", "title", "situation"]) {
        if (typeof s[f] !== "string" || !s[f].trim()) errors.push(`${where} is missing "${f}".`);
      }
      if (ids.has(s.id)) errors.push(`${where} has a duplicate id.`);
      ids.add(s.id);
      if (!Array.isArray(s.choices) || s.choices.length < 2) {
        errors.push(`${where} needs at least two choices.`);
        return;
      }
      const cids = new Set();
      s.choices.forEach((c, j) => {
        const cw = `${where}, choice ${j + 1}`;
        if (!c || typeof c !== "object") { errors.push(`${cw} is not an object.`); return; }
        if (typeof c.id !== "string" || !c.id) errors.push(`${cw} is missing "id".`);
        if (cids.has(c.id)) errors.push(`${cw} has a duplicate id.`);
        cids.add(c.id);
        if (typeof c.text !== "string" || !c.text.trim()) errors.push(`${cw} is missing "text".`);
        if (typeof c.feedback !== "string" || !c.feedback.trim()) errors.push(`${cw} is missing "feedback".`);
        if (typeof c.usesAI !== "boolean") errors.push(`${cw} needs "usesAI": true or false.`);
        if (!RATINGS.includes(c.rating)) errors.push(`${cw} has rating "${c.rating}"; use one of ${RATINGS.join(", ")}.`);
        if (c.flags !== undefined && !isStringList(c.flags)) errors.push(`${cw} has "flags" that aren't a list of words.`);
        if (c.scores !== undefined) {
          if (!c.scores || typeof c.scores !== "object" || Array.isArray(c.scores)) errors.push(`${cw} has "scores" that isn't an object.`);
          else for (const [k, v] of Object.entries(c.scores)) {
            if (!dimIds.includes(k)) errors.push(`${cw} scores "${k}", which isn't a dimension in policy.json (${dimIds.join(", ")}).`);
            if (!Number.isInteger(v) || v < -2 || v > 2) errors.push(`${cw} has score ${k}: ${JSON.stringify(v)}; use a whole number from -2 to 2.`);
          }
        }
      });
      // A dimension scored on some choices but not others is treated as 0 for the rest.
      // That's allowed but usually an oversight, so warn instead of failing.
      for (const k of dimIds) {
        const n = s.choices.filter((c) => c && c.scores && k in c.scores).length;
        if (n && n < s.choices.length) console.warn(`Scene "${s.id}" scores "${k}" on only ${n} of ${s.choices.length} choices; the rest count as 0.`);
      }
      if (s.icon !== undefined && !ICONS.includes(s.icon)) errors.push(`${where} has icon "${s.icon}"; use one of ${ICONS.join(", ")}.`);
      if (s.setup !== undefined && (typeof s.setup !== "string" || !s.setup.trim())) errors.push(`${where} has an empty "setup".`);
      if (s.character !== undefined) {
        const ch = s.character;
        if (!ch || typeof ch !== "object" || typeof ch.name !== "string" || !ch.name.trim()) errors.push(`${where} has a "character" without a "name".`);
        else if (ch.role !== undefined && typeof ch.role !== "string") errors.push(`${where} has a character "role" that isn't text.`);
      }
      const type = s.type || "core";
      if (!["core", "consequence"].includes(type)) errors.push(`${where} has type "${s.type}"; use "core" or "consequence".`);
      if (type === "consequence") {
        if (i === 0) errors.push(`${where} is a consequence scene, so it can't be first.`);
        if (!s.trigger || !isStringList(s.trigger.anyFlags) || s.trigger.anyFlags.length === 0) {
          errors.push(`${where} is a consequence scene and needs "trigger": { "anyFlags": [...] }.`);
        }
      }
      if (s.echoes !== undefined) {
        if (!Array.isArray(s.echoes)) errors.push(`${where} has "echoes" that isn't a list.`);
        else s.echoes.forEach((e, k) => {
          if (!e || !isStringList(e.ifFlags) || !e.ifFlags.length || typeof e.text !== "string" || !e.text.trim()) {
            errors.push(`${where}, echo ${k + 1} needs "ifFlags" (a list) and "text".`);
          }
        });
      }
      if (s.variants !== undefined) {
        if (!Array.isArray(s.variants)) errors.push(`${where} has "variants" that isn't a list.`);
        else s.variants.forEach((v, k) => {
          const vw = `${where}, variant ${k + 1}`;
          if (!v || !isStringList(v.ifFlags) || !v.ifFlags.length) { errors.push(`${vw} needs "ifFlags" (a list).`); return; }
          if (v.situation !== undefined && (typeof v.situation !== "string" || !v.situation.trim())) errors.push(`${vw} has an empty "situation".`);
          if (v.setup !== undefined && (typeof v.setup !== "string" || !v.setup.trim())) errors.push(`${vw} has an empty "setup".`);
          if (v.choices !== undefined) {
            if (!v.choices || typeof v.choices !== "object" || Array.isArray(v.choices)) { errors.push(`${vw} has "choices" that isn't an object keyed by choice id.`); return; }
            for (const [cid, o] of Object.entries(v.choices)) {
              if (!cids.has(cid)) errors.push(`${vw} changes choice "${cid}", which this scene doesn't have.`);
              const keys = o && typeof o === "object" ? Object.keys(o) : [];
              if (!keys.length || keys.some((x) => !["text", "feedback"].includes(x) || typeof o[x] !== "string" || !o[x].trim())) {
                errors.push(`${vw}, choice "${cid}" can only change "text" and "feedback".`);
              }
            }
          }
          if (v.situation === undefined && v.setup === undefined && v.choices === undefined) errors.push(`${vw} doesn't change anything; give it "situation", "setup", or "choices".`);
        });
      }
    });
    if (!errors.length) warnUnknownFlags(json.scenarios);
    return errors;
  }

  function isStringList(x) {
    return Array.isArray(x) && x.every((f) => typeof f === "string" && f.trim());
  }

  // A trigger or echo that names a flag no earlier choice sets can never fire. That's
  // likely a typo, but it doesn't break play, so warn in the console instead of failing.
  function warnUnknownFlags(scenarios) {
    scenarios.forEach((s, i) => {
      const earlier = new Set(scenarios.slice(0, i).flatMap((x) => x.choices.flatMap((c) => c.flags || [])));
      const named = [...(s.trigger?.anyFlags || []), ...(s.echoes || []).flatMap((e) => e.ifFlags), ...(s.variants || []).flatMap((v) => v.ifFlags)];
      for (const f of named) {
        if (!earlier.has(f)) console.warn(`Scene "${s.id}" refers to flag "${f}", but no earlier choice sets it.`);
      }
    });
  }

  // ---------- consequences ----------
  // Which flags were set by locked choices in active scenes before index i, and by what.
  // Returns Map(flag -> { scene, choice }) keeping the earliest source of each flag.
  function flagSourcesBefore(i) {
    const sources = new Map();
    for (let k = 0; k < i; k++) {
      const s = sceneView(k);
      const a = state.answers[s.id];
      if (!a || !a.locked || !isActive(k)) continue;
      const c = choiceOf(s, a.choiceId);
      for (const f of c?.flags || []) if (!sources.has(f)) sources.set(f, { scene: s, choice: c, index: k });
    }
    return sources;
  }

  function isActive(i) {
    const s = data.scenarios[i];
    if (!s) return false;
    if ((s.type || "core") !== "consequence") return true;
    return Boolean(triggerSource(i));
  }

  // The earlier choice that triggered consequence scene i, or null if it isn't triggered.
  function triggerSource(i) {
    const s = data.scenarios[i];
    if (!s || s.type !== "consequence") return null;
    const sources = flagSourcesBefore(i);
    for (const f of s.trigger.anyFlags) if (sources.has(f)) return { flag: f, ...sources.get(f) };
    return null;
  }

  // The first echo on scene i whose flags were set earlier, with the choice that set it.
  function echoFor(i) {
    const s = data.scenarios[i];
    if (!s || !Array.isArray(s.echoes)) return null;
    const sources = flagSourcesBefore(i);
    for (const e of s.echoes) {
      const f = e.ifFlags.find((x) => sources.has(x));
      if (f) return { text: e.text, flag: f, ...sources.get(f) };
    }
    return null;
  }

  // The first variant on scene i whose flags were set earlier, with the choice that set it.
  function variantFor(i) {
    const s = data.scenarios[i];
    if (!s || !Array.isArray(s.variants)) return null;
    const sources = flagSourcesBefore(i);
    for (const v of s.variants) {
      const f = v.ifFlags.find((x) => sources.has(x));
      if (f) return { ...v, flag: f, ...sources.get(f) };
    }
    return null;
  }

  // Scene i as this player sees it: a variant can replace the situation and the text or
  // feedback of individual choices. Ids, ratings, flags and scores always come from the
  // base scene, so every player's choices stay comparable.
  function sceneView(i) {
    const s = data.scenarios[i];
    const v = variantFor(i);
    if (!v) return s;
    return {
      ...s,
      situation: v.situation || s.situation,
      setup: v.setup || s.setup,
      choices: s.choices.map((c) => {
        const o = v.choices?.[c.id];
        return o ? { ...c, text: o.text || c.text, feedback: o.feedback || c.feedback } : c;
      }),
    };
  }

  const activeIndexes = () => data.scenarios.map((_, i) => i).filter(isActive);
  const isConsequence = (s) => s.type === "consequence";

  // ---------- answer helpers ----------
  const scenarioAt = (i) => data.scenarios[i];
  const answerFor = (sid) => state.answers[sid] || (state.answers[sid] = { choiceId: null, pre: "", locked: false, post: "", log: [], done: false });
  const choiceOf = (s, cid) => s.choices.find((c) => c.id === cid) || null;
  const completedCount = () => activeIndexes().filter((i) => state.answers[data.scenarios[i].id]?.done).length;
  // Scenes on this player's path so far: every core scene plus consequences already triggered.
  const pathLength = () => activeIndexes().length;
  const positionOf = (i) => activeIndexes().indexOf(i) + 1;

  function postWordCount(s, a) {
    const c = choiceOf(s, a.choiceId);
    if (c && c.usesAI && logQuestionsFor(s).length) return (a.log || []).reduce((n, t) => n + words(t), 0);
    return words(a.post);
  }
  function postComplete(s, a) {
    const c = choiceOf(s, a.choiceId);
    if (c && c.usesAI && logQuestionsFor(s).length) {
      const qs = logQuestionsFor(s);
      const allAnswered = qs.every((_, i) => words((a.log || [])[i]) > 0);
      return allAnswered && postWordCount(s, a) >= POST_MIN;
    }
    return words(a.post) >= POST_MIN;
  }
  function logQuestionsFor(s) {
    if (Array.isArray(s.logQuestions) && s.logQuestions.length) return s.logQuestions;
    return (data.policy?.logQuestions || []).slice(0, 3);
  }

  // ---------- rendering ----------
  function setView(v, { focus = true } = {}) {
    view = v;
    render();
    window.scrollTo({ top: 0, behavior: "auto" });
    if (focus) {
      const h = $("h1, h2", app);
      if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    }
  }

  function render() {
    updateProgress();
    if (view.name === "start") return renderStart();
    if (view.name === "scenario") return renderScenario();
    if (view.name === "finish") return renderFinish();
    if (view.name === "explore") return renderExplore(view.sid);
    if (view.name === "practice") return renderPractice(view.sid);
    if (view.name === "print") return renderPrint();
  }

  function updateProgress() {
    const el = $("#progress");
    if (view.name === "scenario") el.textContent = `Scene ${positionOf(state.currentIndex)} of ${pathLength()}`;
    else if (["finish", "explore", "practice"].includes(view.name)) el.textContent = `${completedCount()} of ${pathLength()} done`;
    else el.textContent = "";
  }

  function renderStart() {
    const done = completedCount();
    const started = state.startedAt && (done > 0 || Object.keys(state.answers).length > 0);
    const finished = firstIncompleteIndex(0) === -1;
    const summary = (data.policy?.summary || []).map((p) => `<p>${esc(p)}</p>`).join("");
    const stages = data.scenarios.filter((s) => !isConsequence(s)).map((s) => `<li>${esc(s.stage)}</li>`).join("");

    app.innerHTML = `
      <section class="card intro">
        <p class="eyebrow">ENC 1102 · A decision game</p>
        <h1>Should I Use AI Here?</h1>
        <p class="lede">You'll face ${data.scenarios.filter((s) => !isConsequence(s)).length} real moments from a writing course. For each one, decide whether and how you'd use generative AI, explain why, and see how your choice plays out against the course policy.</p>
        <ul class="stage-list" aria-label="Stages">${stages}</ul>
        <p class="new-note"><strong>New in version 4:</strong> meet the classmates who share these moments with you, follow your path on a scene-by-scene progress bar, and finish with a results page: your writer type, a takeaway for each pattern, and scenes worth replaying for practice. Scoring works the same as version 3.</p>
        <div class="sticky-note">
          <p class="note-title">From the course policy</p>
          ${summary}
          <button type="button" class="link-btn" data-action="policy">Read the full policy</button>
        </div>
        <div class="how">
          <h2 class="small-h">How it works</h2>
          <ol>
            <li>Pick what you'd do and write one sentence about why.</li>
            <li>Lock it in and read the feedback. There's no single right answer, but some choices <em>transfer</em> better than others.</li>
            <li>Reflect, or practice a GenAI log entry if you chose to use AI.</li>
            <li>At the end, export your choices and reflections to submit.</li>
          </ol>
        </div>
        <form id="start-form" class="start-form" novalidate>
          <label for="player-name">Your name or initials <span class="hint">(appears on your export, stays in this browser)</span></label>
          <input id="player-name" name="name" type="text" autocomplete="name" maxlength="80" value="${esc(state.name)}" required>
          <p class="field-error" id="name-error" hidden>Please enter a name or initials.</p>
          <div class="btn-row">
            ${started && !finished
              ? `<button type="submit" class="btn primary">Resume (scene ${positionOf(firstIncompleteIndex(0))} of ${pathLength()})</button>
                 <button type="button" class="btn ghost" data-action="reset">Start over</button>`
              : finished
              ? `<button type="button" class="btn primary" data-action="to-finish">See your choices</button>
                 <button type="button" class="btn ghost" data-action="reset">Start over</button>`
              : `<button type="submit" class="btn primary">Start</button>`}
          </div>
        </form>
      </section>`;

    $("#player-name").addEventListener("input", (e) => { state.name = e.target.value; saveSoon(); });
    $("#start-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("#player-name").value.trim();
      if (!name) {
        $("#name-error").hidden = false;
        $("#player-name").setAttribute("aria-invalid", "true");
        $("#player-name").setAttribute("aria-describedby", "name-error");
        $("#player-name").focus();
        return;
      }
      state.name = name;
      if (!state.startedAt) state.startedAt = new Date().toISOString();
      const next = firstIncompleteIndex(0);
      if (next !== -1) state.currentIndex = next;
      save();
      setView({ name: "scenario" });
    });
  }

  function renderScenario({ animate = true } = {}) {
    if (!scenarioAt(state.currentIndex) || !isActive(state.currentIndex)) return setView({ name: "finish" });
    const s = sceneView(state.currentIndex);
    const a = answerFor(s.id);
    const cause = isConsequence(s) ? triggerSource(state.currentIndex) : null;
    const echo = echoFor(state.currentIndex);

    const choicesHtml = s.choices.map((c, i) => {
      const checked = a.choiceId === c.id;
      return `
        <label class="choice ${checked ? "selected" : ""} ${a.locked && !checked ? "dimmed" : ""}">
          <input type="radio" name="choice" value="${esc(c.id)}" ${checked ? "checked" : ""} ${a.locked ? "disabled" : ""}>
          <span class="choice-letter" aria-hidden="true">${String.fromCharCode(65 + i)}</span>
          <span class="choice-text">${esc(c.text)}</span>
        </label>`;
    }).join("");

    app.innerHTML = `
      ${stepBarHtml(state.currentIndex)}
      <article class="card scenario ${animate ? "enter" : ""} ${cause ? "is-consequence" : ""}">
        <div class="scene-head">
          <span class="scene-icon ${cause ? "is-consequence" : ""}">${sceneIcon(s)}</span>
          <div>
            <p class="eyebrow"><span class="stage-tag ${cause ? "consequence-tag" : ""}">${cause ? "Consequence" : esc(s.stage)}</span></p>
            <h2 class="scenario-title">${esc(s.title)}</h2>
          </div>
        </div>
        ${setupHtml(s)}
        ${cause ? causeNoteHtml("This happened because", cause) : ""}
        ${s.assignment ? `<p class="assignment"><strong>Assignment:</strong> ${esc(s.assignment)}</p>` : ""}
        ${echo ? `<aside class="echo-note" aria-label="How an earlier choice shows up here">
            ${causeNoteHtml("Because", echo, true)}
            <p>${esc(echo.text)}</p>
          </aside>` : ""}
        <p class="situation">${esc(s.situation)}</p>
        ${s.learningGoal ? `<p class="goal"><strong>What's at stake for your learning:</strong> ${esc(s.learningGoal)}</p>` : ""}
        <fieldset class="choices" ${a.locked ? 'aria-describedby="locked-note"' : ""}>
          <legend>What would you do?</legend>
          ${choicesHtml}
        </fieldset>
        ${a.locked ? `<p class="locked-note" id="locked-note">Your choice is locked in. You can explore the other options after you finish.</p>` : ""}
        <div id="pre-block"></div>
        <div id="feedback-block"></div>
      </article>`;

    if (!a.locked) {
      app.querySelectorAll('input[name="choice"]').forEach((r) => r.addEventListener("change", (e) => {
        a.choiceId = e.target.value;
        save();
        app.querySelectorAll(".choice").forEach((l) => l.classList.toggle("selected", l.querySelector("input").checked));
        renderPre(s, a);
      }));
    }
    renderPre(s, a);
    if (a.locked) renderFeedback(s, a);
  }

  // Segmented progress bar: one segment per scene on the player's path so far.
  // Consequence scenes join the bar once they're triggered. The segments are decorative;
  // the progressbar role carries the same information as text.
  function stepBarHtml(current) {
    const idx = activeIndexes();
    const pos = idx.indexOf(current);
    const s = data.scenarios[current];
    const segs = idx.map((i, n) => {
      const sc = data.scenarios[i];
      const st = n < pos || state.answers[sc.id]?.done ? "done" : n === pos ? "current" : "upcoming";
      return `<li class="step ${st} ${isConsequence(sc) ? "is-consequence" : ""}" title="${esc(stageName(sc))}">${iconSvg(sc.icon || "flag", "icon step-icon")}</li>`;
    }).join("");
    return `
      <div class="stepbar" role="progressbar" aria-label="Your path" aria-valuemin="1" aria-valuemax="${idx.length}" aria-valuenow="${pos + 1}"
        aria-valuetext="Scene ${pos + 1} of ${idx.length}: ${esc(stageName(s))}">
        <ol class="steps" aria-hidden="true">${segs}</ol>
      </div>`;
  }

  // The scene opener: a name card for the scene's character and a short setup.
  function setupHtml(s) {
    if (!s.setup && !s.character) return "";
    const ch = s.character;
    return `
      <div class="scene-setup">
        ${ch ? `<p class="character"><span class="avatar" aria-hidden="true">${esc(ch.name.trim().charAt(0).toUpperCase())}</span>
          <span><strong>${esc(ch.name)}</strong>${ch.role ? `<span class="role">, ${esc(ch.role)}</span>` : ""}</span></p>` : ""}
        ${s.setup ? `<p class="setup-text">${esc(s.setup)}</p>` : ""}
      </div>`;
  }

  function renderPre(s, a) {
    const block = $("#pre-block");
    if (!a.choiceId) { block.innerHTML = ""; return; }
    if (a.locked) {
      block.innerHTML = `
        <div class="pre-saved">
          <p class="label-sm">Why you chose it</p>
          <blockquote>${esc(a.pre)}</blockquote>
        </div>`;
      return;
    }
    const existing = $("#pre-text");
    if (existing) return; // already rendered; keep focus and text
    block.innerHTML = `
      <div class="reflect">
        <label for="pre-text" class="reflect-label">${esc(s.preReflectPrompt || "Why this choice?")}</label>
        <textarea id="pre-text" class="ruled" rows="3" aria-describedby="pre-count">${esc(a.pre)}</textarea>
        <p class="count" id="pre-count"></p>
        <div class="btn-row">
          <button type="button" class="btn primary" id="lock-btn">Lock in my choice</button>
        </div>
      </div>`;
    const ta = $("#pre-text");
    const update = () => {
      const n = words(ta.value);
      const ok = n >= PRE_MIN;
      $("#pre-count").textContent = ok ? `${plural(n, "word")} ✓` : `${plural(n, "word")} · at least ${PRE_MIN} to lock in`;
      $("#pre-count").classList.toggle("ok", ok);
      $("#lock-btn").disabled = !ok;
    };
    ta.addEventListener("input", () => { a.pre = ta.value; update(); saveSoon(); });
    update();
    $("#lock-btn").addEventListener("click", () => {
      if (words(a.pre) < PRE_MIN || !a.choiceId) return;
      a.pre = a.pre.trim();
      a.locked = true;
      a.lockedAt = new Date().toISOString();
      save();
      renderScenario({ animate: false });
      const c = choiceOf(s, a.choiceId);
      announce(`Feedback: ${ratingLabel(c.rating)}, ${pointsText(c.rating)}.`);
      const fb = $("#feedback-block .feedback");
      if (fb) { fb.setAttribute("tabindex", "-1"); fb.focus({ preventScroll: true }); fb.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" }); }
    });
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // "Because in Brainstorming you chose “…”" with the earlier choice quoted.
  function causeNoteHtml(lead, src, inline = false) {
    const body = `${esc(lead)} in <strong>${esc(src.scene.stage)}</strong> you chose: <q>${esc(src.choice.text)}</q>`;
    return inline ? `<p class="cause cause-inline">${body}</p>` : `<p class="cause">${body}</p>`;
  }

  function feedbackHtml(c) {
    return `
      <div class="rating-sticker rating-${esc(c.rating)}">
        <span class="rating-label">${esc(ratingLabel(c.rating))} <span class="points">${esc(pointsText(c.rating))}</span></span>
        <span class="rating-desc">${esc(ratingDesc(c.rating))}</span>
      </div>
      <p class="feedback-text">${esc(c.feedback)}</p>
      ${c.policyLink ? `<p class="policy-link"><strong>Policy connection:</strong> ${esc(c.policyLink)}</p>` : ""}
      ${c.ethicsNote ? `<p class="ethics-note"><strong>Costs to consider:</strong> ${esc(c.ethicsNote)}</p>` : ""}`;
  }

  function renderFeedback(s, a) {
    const c = choiceOf(s, a.choiceId);
    if (!c) return;
    const isLog = c.usesAI && logQuestionsFor(s).length > 0;
    const isLast = !data.scenarios.some((_, i) => i > state.currentIndex && !isConsequence(data.scenarios[i])) &&
      !data.scenarios.some((_, i) => i > state.currentIndex && isConsequence(data.scenarios[i]) && wouldTrigger(i, s, c));
    const qs = logQuestionsFor(s);
    if (!Array.isArray(a.log)) a.log = [];

    const reflectHtml = isLog
      ? `<fieldset class="reflect log-entry">
           <legend class="reflect-label">Practice GenAI log entry</legend>
           <p class="hint">Imagine you made this choice for real. Answer as you would in your GenAI log.</p>
           ${qs.map((q, i) => `
             <label for="log-${i}" class="log-q">${esc(q)}</label>
             <textarea id="log-${i}" class="ruled" rows="2" data-log="${i}" ${a.done ? "readonly" : ""}>${esc(a.log[i] || "")}</textarea>`).join("")}
         </fieldset>`
      : `<div class="reflect">
           <label for="post-text" class="reflect-label">${esc(s.postReflectPrompt || "What does your choice reveal about how you think about AI and writing?")}</label>
           ${!c.usesAI ? `<p class="hint">You chose not to use AI here. The policy asks you to note that decision in your log and reflect on it, so this counts as that note.</p>` : ""}
           <textarea id="post-text" class="ruled" rows="4" ${a.done ? "readonly" : ""}>${esc(a.post)}</textarea>
         </div>`;

    $("#feedback-block").innerHTML = `
      <section class="feedback sticky-note drop-in" aria-label="Feedback on your choice">
        ${feedbackHtml(c)}
      </section>
      ${reflectHtml}
      <p class="count" id="post-count" aria-live="polite"></p>
      <div class="btn-row">
        <button type="button" class="btn primary" id="next-btn">${isLast ? "Finish" : "Next scene"}</button>
      </div>`;

    const update = () => {
      const n = postWordCount(s, a);
      const ok = postComplete(s, a);
      let msg = `${plural(n, "word")}`;
      if (ok) msg += " ✓";
      else if (isLog && !qs.every((_, i) => words(a.log[i]) > 0)) msg += ` · answer every question, at least ${POST_MIN} words in total`;
      else msg += ` · at least ${POST_MIN} to continue`;
      $("#post-count").textContent = msg;
      $("#post-count").classList.toggle("ok", ok);
      $("#next-btn").disabled = !ok;
    };

    if (isLog) {
      app.querySelectorAll("textarea[data-log]").forEach((ta) => ta.addEventListener("input", () => {
        a.log[Number(ta.dataset.log)] = ta.value;
        update(); saveSoon();
      }));
    } else {
      const ta = $("#post-text");
      ta.addEventListener("input", () => { a.post = ta.value; update(); saveSoon(); });
    }
    update();

    $("#next-btn").addEventListener("click", () => {
      if (!postComplete(s, a)) return;
      a.post = (a.post || "").trim();
      a.log = (a.log || []).map((t) => (t || "").trim());
      if (!a.done) { a.done = true; a.completedAt = new Date().toISOString(); }
      const nextIdx = firstIncompleteIndex(0);
      if (nextIdx === -1) {
        state.currentIndex = data.scenarios.length;
        if (!state.finishedAt) state.finishedAt = new Date().toISOString();
        save();
        setView({ name: "finish" });
      } else {
        state.currentIndex = nextIdx;
        save();
        setView({ name: "scenario" });
      }
    });
  }

  // The first active scene (in path order) that isn't finished, or -1 when the path is done.
  function firstIncompleteIndex(from) {
    for (let i = from; i < data.scenarios.length; i++) {
      if (isActive(i) && !state.answers[data.scenarios[i].id]?.done) return i;
    }
    return -1;
  }

  // Would consequence scene i be triggered once choice c in scene s counts? Used only to label
  // the button "Finish" vs "Next" before the current answer is marked done.
  function wouldTrigger(i, s, c) {
    if (isActive(i)) return true;
    return (data.scenarios[i].trigger.anyFlags || []).some((f) => (c.flags || []).includes(f));
  }

  // ---------- path model ----------
  // The scenes this player went through, in order, with what caused each echo or
  // consequence and what each choice led to; plus consequence scenes they never reached.
  function pathModel() {
    const steps = activeIndexes().map((i) => {
      const s = sceneView(i);
      const a = state.answers[s.id];
      const c = a && a.locked ? choiceOf(s, a.choiceId) : null;
      return { i, s, a, c, cause: triggerSource(i), echo: echoFor(i), ledTo: [] };
    });
    const byIndex = new Map(steps.map((st) => [st.i, st]));
    for (const st of steps) {
      if (st.echo) byIndex.get(st.echo.index)?.ledTo.push({ kind: "echo", step: st });
      if (st.cause) byIndex.get(st.cause.index)?.ledTo.push({ kind: "consequence", step: st });
    }
    const notTaken = data.scenarios.map((s, i) => ({ s, i }))
      .filter(({ s, i }) => isConsequence(s) && !isActive(i))
      .map(({ s, i }) => ({
        s,
        triggers: data.scenarios.slice(0, i).flatMap((x) => x.choices
          .filter((c) => (c.flags || []).some((f) => s.trigger.anyFlags.includes(f)))
          .map((c) => ({ scene: x, choice: c }))),
      }));
    return { steps, notTaken };
  }

  // ---------- scoring ----------
  // Points: each finished scene earns its rating's points, out of the best rating's points.
  // Profile: for each dimension, add up the player's scores in the scenes on their path that
  // score that dimension, then place the total between the lowest and highest totals those
  // same scenes allow (0-100%). Paths differ in length, so this keeps profiles comparable.
  function scoreModel(steps = pathModel().steps) {
    const done = steps.filter((st) => st.c && st.a?.done);
    const best = maxPoints();
    const points = done.reduce((n, st) => n + pointsFor(st.c.rating), 0);
    const dims = dimensions().map((d) => {
      let got = 0, lo = 0, hi = 0, scenes = 0;
      for (const st of done) {
        const vals = st.s.choices.map((c) => c.scores?.[d.id]).filter(Number.isInteger);
        if (!vals.length) continue;
        if (vals.length < st.s.choices.length) vals.push(0);
        scenes++;
        lo += Math.min(...vals);
        hi += Math.max(...vals);
        got += st.c.scores?.[d.id] ?? 0;
      }
      const pct = scenes && hi > lo ? Math.round(((got - lo) / (hi - lo)) * 100) : null;
      return { ...d, scenes, pct, band: bandFor(pct) };
    });
    return { points, possible: done.length * best, scenes: done.length, dims };
  }

  function bandFor(pct) {
    if (pct === null) return "Not measured on your path";
    if (pct >= 75) return "Strong";
    if (pct >= 40) return "Mixed";
    return "Needs attention";
  }

  const pointsText = (r) => `${pointsFor(r) > 0 ? "+" : ""}${plural(pointsFor(r), "point")}`;

  // Points total, rating tally, and a bar per dimension (0-100%). Each bar's value is
  // written out as text beside it, so the bars themselves are decorative for screen readers.
  function scoreBlockHtml(score, counts, { steps = null, animate = false } = {}) {
    const rows = score.dims.map((d) => {
      const tk = steps ? takeawayFor(d, steps) : null;
      const measured = d.pct !== null;
      const where = measured ? `Measured in ${plural(d.scenes, "scene")} on your path.` : "None of the scenes on your path tested this.";
      return `
        <li class="profile-row ${measured ? "" : "unmeasured"}">
          <div class="profile-head">
            <span class="profile-label">${esc(d.label)}</span>
            <span class="profile-value">${measured ? `${d.pct}% · ` : ""}${esc(d.band)}</span>
          </div>
          <div class="profile-track" aria-hidden="true" ${measured ? `title="${esc(d.label)}: ${d.pct}%"` : ""}>
            ${measured && d.pct > 0 ? `<span class="profile-fill ${animate ? "grow" : ""}" style="width:${d.pct}%"></span>` : ""}
          </div>
          <p class="profile-desc">${d.description ? `${esc(d.description)} ` : ""}${esc(where)}</p>
          ${tk?.text ? `<p class="takeaway"><strong>Takeaway:</strong> ${esc(tk.text)}</p>` : ""}
          ${tk?.where ? `<p class="takeaway-where">${esc(tk.where.label)}: <strong>${esc(tk.where.stage)}</strong>, ${esc(tk.where.title)}</p>` : ""}
        </li>`;
    }).join("");
    return `
      <div class="score-block">
        <h3 class="small-h">Your score</h3>
        <p class="score-total"><strong>${score.points}</strong> of ${plural(score.possible, "possible point")}
          <span class="hint">(${plural(score.scenes, "scene")} finished; ${plural(maxPoints(), "point")} for a choice that transfers well)</span></p>
        <ul class="tally" aria-label="Your choices by rating">
          ${RATINGS.map((r) => `<li class="pill rating-${r}">${esc(ratingLabel(r))}: ${counts[r]}</li>`).join("")}
        </ul>
        <h3 class="small-h">Your profile</h3>
        <ul class="profile-chart" aria-label="Your profile across three patterns">${rows}</ul>
        <p class="hint profile-note">This profile describes patterns in the choices you made in this playthrough. It isn't a grade. Each bar compares your choices with the best and weakest choices available in the scenes you played, so paths of different lengths compare fairly. Not using AI is never penalized: every choice without AI earns full points. The profile reflects what a choice did (for example, whether you re-checked your sources), not whether AI was involved.</p>
      </div>`;
  }

  // How many finished scenes on the path got each rating.
  function ratingCounts(steps) {
    const counts = Object.fromEntries(RATINGS.map((r) => [r, 0]));
    for (const st of steps) if (st.c && st.a?.done) counts[st.c.rating]++;
    return counts;
  }

  // ---------- results (v5) ----------
  // Everything here only reads scoreModel() and pathModel(); it never changes scoring.
  const DEFAULT_WRITER_TYPES = {
    author: { label: "The Author", summary: "You owned your ideas, checked your sources, and were open about your process.", next: "" },
    ownership: { label: "The Original Thinker", summary: "Your strongest pattern is ownership of ideas.", next: "" },
    verification: { label: "The Fact-Checker", summary: "Your strongest pattern is verification.", next: "" },
    disclosure: { label: "The Open Book", summary: "Your strongest pattern is honest disclosure.", next: "" },
    balancer: { label: "The Balancer", summary: "No single pattern stood out, and none held you back.", next: "" },
    deadline: { label: "The Deadline Writer", summary: "Under pressure, shortcuts often won.", next: "" },
  };

  // Writer type from the profile bands of the patterns measured on this path:
  // all Strong -> author; some Strong -> the strongest of those (ties go to the order in
  // policy.json); none Strong and none Needs attention -> balancer; otherwise -> deadline.
  function writerTypeFor(score) {
    const measured = score.dims.filter((d) => d.pct !== null);
    if (!measured.length) return null;
    const strong = measured.filter((d) => d.band === "Strong");
    let id;
    if (strong.length === measured.length) id = "author";
    else if (strong.length) id = strong.reduce((a, b) => (b.pct > a.pct ? b : a)).id;
    else if (!measured.some((d) => d.band === "Needs attention")) id = "balancer";
    else id = "deadline";
    const types = { ...DEFAULT_WRITER_TYPES, ...(data.policy?.writerTypes || {}) };
    return { id, ...(types[id] || DEFAULT_WRITER_TYPES.balancer) };
  }

  // Per pattern: the takeaway for its band, and the scene on the path where it showed most
  // (a scene with the best available score if Strong, else the scene with the biggest gap).
  function takeawayFor(d, steps) {
    if (d.pct === null) return null;
    const key = d.band === "Strong" ? "strong" : d.band === "Mixed" ? "mixed" : "needs";
    const text = d.takeaways?.[key] || "";
    let pick = null;
    for (const st of steps) {
      if (!st.c || !st.a?.done) continue;
      const vals = st.s.choices.map((c) => c.scores?.[d.id] ?? 0);
      if (!st.s.choices.some((c) => Number.isInteger(c.scores?.[d.id]))) continue;
      const got = st.c.scores?.[d.id] ?? 0, gap = Math.max(...vals) - got;
      if (key === "strong") { if (gap === 0 && got > 0 && !pick) pick = { st, gap }; }
      else if (gap > 0 && (!pick || gap > pick.gap)) pick = { st, gap };
    }
    const where = pick ? { label: key === "strong" ? "Where it showed" : "Most room to grow", stage: stageName(pick.st.s), title: pick.st.s.title } : null;
    return { text, where };
  }

  // Up to three finished scenes worth replaying: the most points left on the table first,
  // then the biggest total profile gap. Replays are practice and never change the record.
  function replaySuggestions(steps) {
    const best = maxPoints();
    return steps.filter((st) => st.c && st.a?.done)
      .map((st) => {
        const top = Math.max(...st.s.choices.map((c) => pointsFor(c.rating)));
        const lost = top - pointsFor(st.c.rating);
        const gap = dimensions().reduce((n, d) => {
          if (!st.s.choices.some((c) => Number.isInteger(c.scores?.[d.id]))) return n;
          return n + Math.max(...st.s.choices.map((c) => c.scores?.[d.id] ?? 0)) - (st.c.scores?.[d.id] ?? 0);
        }, 0);
        const better = st.s.choices.filter((c) => pointsFor(c.rating) === top).length;
        return { st, lost, gap, better, top };
      })
      .filter((r) => r.lost > 0)
      .sort((a, b) => b.lost - a.lost || b.gap - a.gap || a.st.i - b.st.i)
      .slice(0, 3)
      .map((r) => ({ ...r, reason: `You chose a ${ratingLabel(r.st.c.rating)} option (${pointsText(r.st.c.rating)}). ${r.better === 1 ? "One choice here" : `${r.better} choices here`} ${r.top === best ? "transfer well" : "earn more"} (${plural(r.top, "point")}).` }));
  }

  function resultsHtml(score, counts, steps, allDone) {
    const type = allDone ? writerTypeFor(score) : null;
    const replays = allDone ? replaySuggestions(steps) : [];
    const hero = type ? `
      <div class="results-hero drop-in">
        <p class="note-title">Your writer type</p>
        <p class="writer-type">${esc(type.label)}</p>
        <p>${esc(type.summary)}</p>
        ${type.next ? `<p class="try-next"><strong>Try next:</strong> ${esc(type.next)}</p>` : ""}
        <p class="hint">Based on the profile below. It describes this playthrough, not you, and it isn't a grade.</p>
      </div>` : allDone ? "" : `<p class="hint">Finish your path to see your writer type and replay suggestions.</p>`;
    const replayHtml = !allDone ? "" : `
      <div class="replays">
        <h3 class="small-h">Scenes to replay</h3>
        ${replays.length ? `
          <p class="hint">Practice replays let you try a different choice and read its feedback. Your recorded choice, score, and profile don't change.</p>
          <ul class="replay-list">${replays.map((r) => `
            <li class="replay">
              <span class="scene-icon small ${isConsequence(r.st.s) ? "is-consequence" : ""}">${sceneIcon(r.st.s)}</span>
              <div class="replay-body">
                <p class="finish-title"><span class="label-sm">${esc(stageName(r.st.s))}</span> ${esc(r.st.s.title)}</p>
                <p class="hint">${esc(r.reason)}</p>
                <button type="button" class="btn small" data-practice="${esc(r.st.s.id)}">Practice replay<span class="visually-hidden">: ${esc(r.st.s.title)}</span></button>
              </div>
            </li>`).join("")}</ul>`
          : `<p class="hint">Every choice you made earned the most points available in its scene. You can still practice any scene from the path below, or start over to reach scenes you didn't see.</p>`}
      </div>`;
    return `${hero}${scoreBlockHtml(score, counts, { steps, animate: true })}${replayHtml}`;
  }

  function renderFinish() {
    const { steps, notTaken } = pathModel();
    const counts = ratingCounts(steps);
    const nodes = steps.map((st, n) => {
      const { s, a, c } = st;
      const conseq = isConsequence(s);
      const led = st.ledTo.map((l) => l.kind === "consequence"
        ? `<li class="led consequence-led">↳ Led to a consequence scene: <strong>${esc(l.step.s.title)}</strong></li>`
        : `<li class="led">↳ Showed up later in <strong>${esc(l.step.s.stage)}</strong></li>`).join("");
      return `
        <li class="path-node ${conseq ? "is-consequence" : ""} ${c ? `node-${esc(c.rating)}` : "node-open"}">
          <span class="path-dot" aria-hidden="true">${sceneIcon(s)}</span>
          <div class="path-body">
            <p class="eyebrow">${n + 1}. <span class="stage-tag ${conseq ? "consequence-tag" : ""}">${conseq ? "Consequence" : esc(s.stage)}</span></p>
            <p class="finish-title">${esc(s.title)}</p>
            ${st.cause ? `<p class="cause small">Because in ${esc(st.cause.scene.stage)} you chose: <q>${esc(st.cause.choice.text)}</q></p>` : ""}
            ${st.echo ? `<p class="cause small">Your ${esc(st.echo.scene.stage)} choice showed up here: ${esc(st.echo.text)}</p>` : ""}
            ${c ? `<p class="finish-choice"><span class="label-sm">You chose</span> ${esc(c.text)}</p>` : `<p class="finish-choice muted">Not answered yet</p>`}
            ${led ? `<ul class="led-list">${led}</ul>` : ""}
            <div class="finish-side">
              ${c ? `<span class="pill rating-${esc(c.rating)}">${esc(ratingLabel(c.rating))}${a?.done ? ` · ${esc(pointsText(c.rating))}` : ""}</span>` : ""}
              ${a?.done ? `<button type="button" class="btn small ghost" data-explore="${esc(s.id)}">Explore other choices</button>
                <button type="button" class="btn small ghost" data-practice="${esc(s.id)}">Practice replay</button>` : ""}
            </div>
          </div>
        </li>`;
    }).join("");

    const roads = notTaken.map(({ s, triggers }) => `
      <li class="road">
        <p class="finish-title">${esc(s.title)}</p>
        <p class="hint">This scene would have appeared if you had chosen:</p>
        <ul>${triggers.map((t) => `<li><strong>${esc(t.scene.stage)}:</strong> ${esc(t.choice.text)}</li>`).join("")}</ul>
      </li>`).join("");

    const allDone = firstIncompleteIndex(0) === -1;
    app.innerHTML = `
      <section class="card">
        <p class="eyebrow">${allDone ? "Your results" : "In progress"}</p>
        <h2>${allDone ? `How you played, ${esc(state.name || "writer")}` : "Your path so far"}</h2>
        <p>${allDone
          ? `You went through ${plural(steps.length, "scene")}. Here's what your choices add up to, what each pattern suggests for next time, and which scenes are worth another look. Choices stay locked, but you can explore or practice the options you didn't pick. When you're ready, export your results and reflections to submit.`
          : "You haven't finished your path yet."}</p>
        ${resultsHtml(scoreModel(steps), counts, steps, allDone)}
        <h3 class="small-h">The path you took</h3>
        <ol class="path" aria-label="The path you took">${nodes}</ol>
        ${allDone && roads ? `
          <div class="roads">
            <h3 class="small-h">Roads not taken</h3>
            <p class="hint">Consequence scenes you never reached, and the choices that would have led to them.</p>
            <ul class="road-list">${roads}</ul>
          </div>` : ""}
        <div class="export-box sticky-note">
          <p class="note-title">Export your work</p>
          <p>Your work lives only in this browser. Download or copy it to submit on Webcourses, or save it as a PDF.</p>
          <div class="btn-row wrap">
            <button type="button" class="btn primary" data-action="download">Download (.md)</button>
            <button type="button" class="btn" data-action="copy">Copy text</button>
            <button type="button" class="btn" data-action="print-view">Print / Save as PDF</button>
          </div>
          <p class="count" id="export-status" aria-live="polite"></p>
        </div>
        <div class="btn-row">
          ${!allDone ? `<button type="button" class="btn primary" data-action="continue">Continue playing</button>` : ""}
          <button type="button" class="btn ghost" data-action="reset">Start over</button>
        </div>
      </section>`;

    app.querySelectorAll("[data-explore]").forEach((b) => b.addEventListener("click", () => setView({ name: "explore", sid: b.dataset.explore })));
    app.querySelectorAll("[data-practice]").forEach((b) => b.addEventListener("click", () => setView({ name: "practice", sid: b.dataset.practice })));
  }

  // Practice replay: the scene as the player saw it, any choice, instant feedback.
  // Nothing here is saved, so the recorded choice, points and profile stay as they were.
  function renderPractice(sid) {
    const idx = data.scenarios.findIndex((x) => x.id === sid);
    if (idx === -1 || !state.answers[sid]?.done) return setView({ name: "finish" });
    const s = sceneView(idx);
    const mine = state.answers[sid].choiceId;
    const conseq = isConsequence(s);
    app.innerHTML = `
      <article class="card scenario enter ${conseq ? "is-consequence" : ""}">
        <p class="practice-banner">Practice replay. Your recorded choice, score, and profile don't change.</p>
        <div class="scene-head">
          <span class="scene-icon ${conseq ? "is-consequence" : ""}">${sceneIcon(s)}</span>
          <div>
            <p class="eyebrow"><span class="stage-tag ${conseq ? "consequence-tag" : ""}">${esc(stageName(s))}</span></p>
            <h2 class="scenario-title">${esc(s.title)}</h2>
          </div>
        </div>
        ${setupHtml(s)}
        <p class="situation">${esc(s.situation)}</p>
        <fieldset class="choices">
          <legend>What would you do this time?</legend>
          ${s.choices.map((c, i) => `
            <label class="choice">
              <input type="radio" name="practice" value="${esc(c.id)}">
              <span class="choice-letter" aria-hidden="true">${String.fromCharCode(65 + i)}</span>
              <span class="choice-text">${esc(c.text)}${c.id === mine ? ' <span class="mine-tag">Your recorded choice</span>' : ""}</span>
            </label>`).join("")}
        </fieldset>
        <div id="practice-feedback" aria-live="polite"></div>
        <div class="btn-row"><button type="button" class="btn primary" data-action="to-finish">Back to your results</button></div>
      </article>`;
    app.querySelectorAll('input[name="practice"]').forEach((r) => r.addEventListener("change", () => {
      app.querySelectorAll(".choice").forEach((l) => l.classList.toggle("selected", l.querySelector("input").checked));
      const c = choiceOf(s, r.value);
      $("#practice-feedback").innerHTML = `<section class="feedback sticky-note drop-in" aria-label="Feedback on this practice choice">${feedbackHtml(c)}</section>`;
    }));
  }

  function renderExplore(sid) {
    const idx = data.scenarios.findIndex((x) => x.id === sid);
    if (idx === -1) return setView({ name: "finish" });
    const s = sceneView(idx);
    const a = state.answers[sid] || {};
    const items = s.choices.map((c, i) => {
      const mine = c.id === a.choiceId;
      return `
        <details class="explore-item ${mine ? "mine" : ""}" ${mine ? "open" : ""}>
          <summary>
            <span class="choice-letter" aria-hidden="true">${String.fromCharCode(65 + i)}</span>
            <span class="choice-text">${esc(c.text)}${mine ? ' <span class="mine-tag">Your choice</span>' : ""}</span>
          </summary>
          <div class="explore-body">${feedbackHtml(c)}</div>
        </details>`;
    }).join("");

    app.innerHTML = `
      <article class="card">
        <p class="eyebrow"><span class="stage-tag ${isConsequence(s) ? "consequence-tag" : ""}">${esc(stageName(s))}</span> · Exploring</p>
        <h2>${esc(s.title)}</h2>
        <p class="situation">${esc(s.situation)}</p>
        <p class="hint">Reading these doesn't change your recorded choice.</p>
        <div class="explore-list">${items}</div>
        <div class="btn-row"><button type="button" class="btn primary" data-action="to-finish">Back to your results</button></div>
      </article>`;
  }

  // ---------- export ----------
  function buildRecords() {
    const { steps, notTaken } = pathModel();
    const records = steps.map((st, n) => {
      const { s, a, c } = st;
      const log = c && c.usesAI ? logQuestionsFor(s).map((q, k) => ({ q, a: (a.log || [])[k] || "" })) : null;
      return { ...st, n: n + 1, log };
    });
    return { records, notTaken, score: scoreModel(steps) };
  }

  // A ten-block text bar for the Markdown export, e.g. "███████░░░".
  const textBar = (pct) => { const n = Math.floor(pct / 10); return "█".repeat(n) + "░".repeat(10 - n); };

  const stageName = (s) => (isConsequence(s) ? "Consequence" : s.stage);

  function buildMarkdown() {
    const { records, notTaken, score } = buildRecords();
    const lines = [];
    lines.push(`# Should I Use AI Here? (v5)`);
    lines.push("");
    lines.push(`**Name:** ${state.name || "(not given)"}  `);
    lines.push(`**Started:** ${formatDate(state.startedAt)}  `);
    lines.push(`**Exported:** ${formatDate(new Date().toISOString())}  `);
    lines.push(`**Completed:** ${completedCount()} of ${pathLength()} scenes on my path`);
    lines.push("");
    lines.push(`## Score and profile`);
    lines.push("");
    lines.push(`**Points:** ${score.points} of ${score.possible} possible`);
    lines.push("");
    const allDone = firstIncompleteIndex(0) === -1;
    const type = allDone ? writerTypeFor(score) : null;
    if (type) lines.push(`**Writer type:** ${type.label}. ${type.summary}`, "");
    for (const d of score.dims) {
      lines.push(d.pct === null
        ? `- **${d.label}:** not measured on my path`
        : `- **${d.label}:** \`${textBar(d.pct)}\` ${d.pct}% (${d.band}, ${plural(d.scenes, "scene")})`);
      const tk = allDone ? takeawayFor(d, records) : null;
      if (tk?.text) lines.push(`  - Takeaway: ${tk.text}${tk.where ? ` (${tk.where.label}: ${tk.where.stage}, ${tk.where.title})` : ""}`);
    }
    const replays = allDone ? replaySuggestions(records) : [];
    if (replays.length) {
      lines.push("", `**Scenes to replay:** ${replays.map((r) => `${stageName(r.st.s)}, ${r.st.s.title}`).join("; ")}`);
    }
    lines.push("");
    lines.push(`_The profile describes patterns in this playthrough, not a grade._`);
    lines.push("");
    for (const { n, s, a, c, log, cause, echo } of records) {
      lines.push(`## ${n}. ${stageName(s)}: ${s.title}`);
      lines.push("");
      if (cause) lines.push(`_This scene happened because in ${cause.scene.stage} I chose: "${cause.choice.text}"_`, "");
      if (echo) lines.push(`_My earlier ${echo.scene.stage} choice showed up here: ${echo.text}_`, "");
      if (!c || !a?.locked) { lines.push("_Not answered yet._", ""); continue; }
      lines.push(`**My choice:** ${c.text}`);
      lines.push("");
      lines.push(`**Rating:** ${ratingLabel(c.rating)}, ${pointsText(c.rating)} (${c.usesAI ? "uses AI" : "no AI"})`);
      lines.push("");
      lines.push(`**Why I chose it:** ${a.pre}`);
      lines.push("");
      if (log) {
        lines.push(`**Practice GenAI log entry:**`);
        lines.push("");
        for (const { q, a: ans } of log) lines.push(`- *${q}* ${ans || "_(blank)_"}`);
      } else {
        lines.push(`**Reflection** (${s.postReflectPrompt || ""}): ${a.post || "_(blank)_"}`);
      }
      lines.push("");
    }
    if (notTaken.length && firstIncompleteIndex(0) === -1) {
      lines.push(`## Roads not taken`);
      lines.push("");
      for (const { s, triggers } of notTaken) {
        lines.push(`- **${s.title}** would have appeared if I had chosen: ${triggers.map((t) => `${t.scene.stage}: "${t.choice.text}"`).join("; or ")}`);
      }
      lines.push("");
    }
    return lines.join("\n");
  }

  function slug(s) {
    return String(s || "player").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "player";
  }

  function download() {
    const blob = new Blob([buildMarkdown()], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `should-i-use-ai-${slug(state.name)}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    exportStatus("Downloaded.");
  }

  async function copyText() {
    const text = buildMarkdown();
    try {
      await navigator.clipboard.writeText(text);
      exportStatus("Copied to clipboard.");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      ta.remove();
      exportStatus(ok ? "Copied to clipboard." : "Couldn't copy automatically. Try Download instead.");
    }
  }

  function exportStatus(msg) {
    const el = $("#export-status");
    if (el) el.textContent = msg;
  }

  function renderPrint() {
    const { records, notTaken, score } = buildRecords();
    const recs = records.map(({ n, s, a, c, log, cause, echo }) => `
      <section class="print-item">
        <h3>${n}. ${esc(stageName(s))}: ${esc(s.title)}</h3>
        ${cause ? `<p class="cause small">This scene happened because in ${esc(cause.scene.stage)} I chose: <q>${esc(cause.choice.text)}</q></p>` : ""}
        ${echo ? `<p class="cause small">My earlier ${esc(echo.scene.stage)} choice showed up here: ${esc(echo.text)}</p>` : ""}
        ${!c || !a?.locked ? `<p><em>Not answered yet.</em></p>` : `
          <p><strong>My choice:</strong> ${esc(c.text)}</p>
          <p><strong>Rating:</strong> ${esc(ratingLabel(c.rating))}, ${esc(pointsText(c.rating))} (${c.usesAI ? "uses AI" : "no AI"})</p>
          <p><strong>Why I chose it:</strong> ${esc(a.pre)}</p>
          ${log
            ? `<p><strong>Practice GenAI log entry</strong></p><dl>${log.map(({ q, a: ans }) => `<dt>${esc(q)}</dt><dd>${esc(ans) || "<em>(blank)</em>"}</dd>`).join("")}</dl>`
            : `<p><strong>Reflection</strong> <span class="muted">(${esc(s.postReflectPrompt || "")})</span></p><p>${esc(a.post) || "<em>(blank)</em>"}</p>`}`}
      </section>`).join("");
    const roads = notTaken.length && firstIncompleteIndex(0) === -1 ? `
      <section class="print-item">
        <h3>Roads not taken</h3>
        <ul>${notTaken.map(({ s, triggers }) => `<li><strong>${esc(s.title)}</strong> would have appeared if I had chosen: ${triggers.map((t) => `${esc(t.scene.stage)}: <q>${esc(t.choice.text)}</q>`).join("; or ")}</li>`).join("")}</ul>
      </section>` : "";

    app.innerHTML = `
      <section class="card print-sheet">
        <div class="btn-row no-print">
          <button type="button" class="btn primary" data-action="print">Print / Save as PDF</button>
          <button type="button" class="btn ghost" data-action="to-finish">Back</button>
        </div>
        <h2>Should I Use AI Here? (v5)</h2>
        <p><strong>Name:</strong> ${esc(state.name || "(not given)")}<br>
           <strong>Started:</strong> ${esc(formatDate(state.startedAt))}<br>
           <strong>Printed:</strong> ${esc(formatDate(new Date().toISOString()))}<br>
           <strong>Completed:</strong> ${completedCount()} of ${pathLength()} scenes on my path</p>
        ${(() => { const t = firstIncompleteIndex(0) === -1 ? writerTypeFor(score) : null;
          return t ? `<p><strong>Writer type:</strong> ${esc(t.label)}. ${esc(t.summary)}</p>` : ""; })()}
        ${scoreBlockHtml(score, ratingCounts(records), { steps: firstIncompleteIndex(0) === -1 ? records : null })}
        ${recs}
        ${roads}
      </section>`;
  }

  // ---------- policy dialog ----------
  function openPolicy() {
    const dlg = $("#policy-dialog");
    if (data.policy) {
      $("#policy-title").textContent = data.policy.title || "Course policy";
      $("#policy-body").innerHTML = (data.policy.fullText || []).map((p) => `<p>${esc(p)}</p>`).join("");
    }
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
  }
  function closePolicy() {
    const dlg = $("#policy-dialog");
    if (typeof dlg.close === "function") dlg.close(); else dlg.removeAttribute("open");
  }

  // ---------- global actions ----------
  function reset() {
    if (!confirm("Start over? This erases your saved choices and reflections in this browser. Export first if you need them.")) return;
    const name = state.name;
    state = freshState();
    state.name = name;
    save();
    setView({ name: "start" });
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const act = btn.dataset.action;
    if (act === "policy") openPolicy();
    else if (act === "reset") reset();
    else if (act === "to-finish") setView({ name: "finish" });
    else if (act === "continue") {
      const i = firstIncompleteIndex(0);
      state.currentIndex = i === -1 ? 0 : i;
      save();
      setView({ name: "scenario" });
    }
    else if (act === "download") download();
    else if (act === "copy") copyText();
    else if (act === "print-view") setView({ name: "print" });
    else if (act === "print") window.print();
  });
  $("#policy-btn").addEventListener("click", openPolicy);
  $("#policy-close").addEventListener("click", closePolicy);
  $("#policy-dialog").addEventListener("click", (e) => { if (e.target.id === "policy-dialog") closePolicy(); });

  // ---------- boot ----------
  function showError(title, items) {
    app.innerHTML = `
      <section class="card error-card" role="alert">
        <h2>${esc(title)}</h2>
        ${items.length ? `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        <p class="hint">If you're running this from your computer, open it through a local web server (for example <code>python3 -m http.server</code>) rather than double-clicking the file.</p>
      </section>`;
  }

  async function boot() {
    probeStorage();
    load();
    let scen, pol;
    try {
      const [r1, r2] = await Promise.all([fetch(SCENARIOS_URL, { cache: "no-cache" }), fetch(POLICY_URL, { cache: "no-cache" })]);
      if (!r1.ok) throw new Error(`Couldn't load ${SCENARIOS_URL} (HTTP ${r1.status}).`);
      if (!r2.ok) throw new Error(`Couldn't load ${POLICY_URL} (HTTP ${r2.status}).`);
      try { scen = await r1.json(); } catch { throw new Error(`${SCENARIOS_URL} isn't valid JSON. Check for a missing comma or quote.`); }
      try { pol = await r2.json(); } catch { throw new Error(`${POLICY_URL} isn't valid JSON. Check for a missing comma or quote.`); }
    } catch (err) {
      showError("The game couldn't load.", [err.message]);
      return;
    }
    const errors = validateScenarios(scen, pol);
    if (errors.length) {
      showError("There's a problem in the scenario file.", errors);
      return;
    }
    data.scenarios = scen.scenarios;
    data.policy = pol;

    // Drop saved answers whose scenario or choice no longer exists, and clamp the index.
    for (const sid of Object.keys(state.answers)) {
      const s = data.scenarios.find((x) => x.id === sid);
      if (!s || (state.answers[sid].choiceId && !choiceOf(s, state.answers[sid].choiceId))) delete state.answers[sid];
    }
    if (state.currentIndex > data.scenarios.length) state.currentIndex = data.scenarios.length;

    setView({ name: "start" }, { focus: false });
  }

  boot();
})();
