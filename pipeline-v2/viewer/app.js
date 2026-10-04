// Urwort Graph Viewer v2: browse and review the full pipeline-v2 graph (data/ = out/review from review_export.py).
// Routes: #/  #/queues  #/q/<name>  #/f/<family id>  #/w/<lemma>  #/review
// Review marks stay in this browser (localStorage); export/import as JSON.
"use strict";
const DATA = "data/";
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const SRC = {
  "wikt_en": "en Wiktionary", "wikt_en:entry": "en Wiktionary", "wikt_en:reconstruction": "reconstruction page",
  "wikt_en:category": "en Wikt. category", "wikt_de": "de Wiktionary", "wikt_de_wb": "de Wikt. word list",
  derivbase: "DErivBase", morphynet: "MorphyNet", iecor: "IE-CoR"
};
const KIND = { deriv: "derivation", compound_head: "compound head", compound_mod: "compound modifier",
  causative: "causative pair", ety_hint: "history hint", wb: "word list (untyped)" };
const STATUS = { verified: ["verified (2+ sources)", "s2"], doubted: ["doubted by IE-CoR experts", "bad"],
  conflict: ["sources disagree", "bad"], single_source: ["single source", "s1"] };
const QUEUES = {
  rejected: ["Blocked merges", "A one-source link the safety rule stopped from merging two families. If the link is right, the two families belong together."],
  indirect: ["Indirect members", "Words in a family without a direct sourced link to their base. Check that they belong."],
  multi_base: ["Several possible bases", "Words with more than one candidate base inside the family. Is the chosen one right?"],
  single_link: ["Single-source links", "Derivation links in game families backed by only one source."],
  compound_single: ["Single-source compounds", "Compound splits for game words backed by only one source."],
  pie_single_source: ["PIE: one source", "A Proto-Indo-European root that only one source gives. Hidden in the game."],
  pie_conflict: ["PIE: sources disagree", "Sources give different roots. Hidden in the game."],
  pie_doubted: ["PIE: doubted", "Sources agree, but IE-CoR's experts mark the root as doubtful. Hidden in the game."],
  no_history: ["No history", "Game families with neither an inherited chain nor a loan origin."],
  level_spread: ["Level disagreements", "Game words whose level evidence differs by two or more levels."],
  ety_hint: ["History hints", "Historical relations mentioned in German Wiktionary (e.g. fertig ~ Fahrt), not used as family links."],
};
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const enc = encodeURIComponent;
let META = null;
const cache = { index: {}, fam: {}, queue: {} };
let review = (() => { try { return JSON.parse(localStorage.getItem("urwort-review-v2") || "{}"); } catch { return {}; } })();

// ---------- data access ----------
const getJSON = url => fetch(url).then(r => { if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); });
function fnv(s) { let h = 0x811c9dc5; for (const b of new TextEncoder().encode(s)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; } return h; }
function letterOf(w) { const c = w.slice(0, 1).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, ""); return /[a-z]/.test(c) ? c : "_"; }
async function index(letter) { if (!META.letters.includes(letter)) return {}; return cache.index[letter] ||= getJSON(`${DATA}index/${letter}.json`); }
async function family(fid) {
  const b = String(fnv(fid) % META.buckets).padStart(3, "0");
  const shard = await (cache.fam[b] ||= getJSON(`${DATA}fam/${b}.json`));
  return shard[fid];
}
async function lookup(word) {
  const idx = await index(letterOf(word));
  if (idx[word]) return [word, idx[word]];
  const k = Object.keys(idx).find(w => w.toLowerCase() === word.toLowerCase());
  return k ? [k, idx[k]] : [null, null];
}
const queue = name => cache.queue[name] ||= getJSON(`${DATA}queues/${name}.json`);

// ---------- review ----------
function saveReview() { try { localStorage.setItem("urwort-review-v2", JSON.stringify(review)); } catch {} $("#rc").textContent = Object.keys(review).length; }
function rv(key, label, ctx) {
  const v = review[key]?.verdict;
  return `<span class="review" data-key="${esc(key)}" data-label="${esc(label)}" data-ctx="${esc(ctx || "")}">
    <button data-v="ok" ${v === "ok" ? 'data-on="ok"' : ""} aria-label="Correct: ${esc(label)}">✓</button>
    <button data-v="bad" ${v === "bad" ? 'data-on="bad"' : ""} aria-label="Wrong: ${esc(label)}">✗</button></span>`;
}

// ---------- small renderers ----------
function pills(srcs, indirect) {
  if (indirect) return '<span class="pill s1" title="In the family through another member or a link in the other direction">indirect</span>';
  if (!srcs || !srcs.length) return '<span class="pill bad">no source</span>';
  const c = srcs.length >= 2 ? "s2" : "s1";
  return srcs.map(s => `<span class="pill ${c}" title="${esc(s)}">${esc(SRC[s] || s)}</span>`).join(" ");
}
const segs = s => s && s.length > 1 ? `<span class="segs">${s.map(([f, t]) => `<span class="${t}" title="${t}">${esc(f)}</span>`).join("")}</span>` : "";
const wlink = w => `<a class="de" href="#/w/${enc(w)}">${esc(w)}</a>`;
const flink = (fid, text) => `<a href="#/f/${enc(fid)}">${text}</a>`;
const lv = l => l ? `<span class="pill lv" title="estimated level">${l}</span>` : "";
const ext = w => `<a href="https://en.wiktionary.org/wiki/${enc(w)}#German" target="_blank" rel="noopener">Wiktionary</a> ·
  <a href="https://de.wiktionary.org/wiki/${enc(w)}" target="_blank" rel="noopener">de.wiktionary</a> ·
  <a href="https://www.dwds.de/wb/${enc(w)}" target="_blank" rel="noopener">DWDS</a>`;
const ART = { m: "der", f: "die", n: "das" };
function formsHtml(fm) {
  if (!fm) return "";
  const lbl = { gender: "article", plural: "plural", genitive: "genitive", present_3sg: "er/sie", past_3sg: "past", past_participle: "participle", comparative: "comparative", superlative: "superlative" };
  return Object.entries(fm).map(([k, v]) => `<span class="pill" title="${lbl[k] || k}">${esc(k === "gender" ? ART[v] || v : v)}</span>`).join(" ");
}

function historyHtml(fid, root, h, pie, loan, cognates, ctx) {
  let out = "";
  if (h && h.length) out += `<div class="strata">${h.map(s => `<div class="stage"><span class="lang">${esc(s.lang)}</span>
      <span><span class="recon">${esc(s.form)}</span>${s.gloss ? ` <span class="small muted">‘${esc(s.gloss)}’</span>` : ""}${s.origin_uncertain ? ' <span class="pill bad">origin beyond uncertain</span>' : ""}<br>${pills(s.sources)}</span>
      ${rv(`${fid}|stage|${root}|${s.stage}`, `${root}: ${s.lang} ${s.form}`, ctx)}</div>`).join("")}</div>`;
  else out += '<p class="small muted">No inherited chain recorded.</p>';
  if (loan) out += `<p class="row">Loan from ${esc(loan.lang)} ${loan.form ? `<span class="de">${esc(loan.form)}</span>` : ""} ${pills(loan.sources)} ${rv(`${fid}|loan|${root}`, `${root}: loan from ${loan.lang}`, ctx)}</p>`;
  if (pie) {
    const [txt, cls] = STATUS[pie.status] || [pie.status, ""];
    out += `<h3>Proto-Indo-European</h3><p class="row"><span class="recon">${esc(pie.form)}</span> <span class="pill ${cls}">${txt}</span>
      <span class="small muted">${pie.status === "verified" ? "shown in game" : "hidden in game"}</span> ${rv(`${fid}|pie|${root}`, `${root}: PIE ${pie.form}`, ctx)}</p>
      <div class="scroll"><table><tr><th>Source</th><th>Claim</th></tr>${Object.entries(pie.claims || {}).map(([s, v]) =>
        `<tr><td>${esc(SRC[s] || s)} ${(pie.agreeing || []).includes(s) ? '<span class="pill s2">agrees</span>' : ""}</td><td class="recon">${esc(v)}</td></tr>`).join("")}</table></div>
      ${pie.iecor_comment ? `<p class="small muted">IE-CoR note: ${esc(pie.iecor_comment)}</p>` : ""}`;
  }
  const cog = Object.entries(cognates || {});
  if (cog.length) out += `<h3>Cognates</h3><p>${cog.map(([l, c]) => `${esc(l)} <span class="de">${esc(typeof c === "string" ? c : c.form)}</span>`).join(" · ")}</p>`;
  return out;
}

// ---------- views ----------
async function viewOverview() {
  const m = META, v = m.validation;
  const checks = v.results, ok = checks.filter(c => c.ok).length;
  const groups = {};
  for (const c of checks) (groups[c.kind] ||= []).push(c);
  return `<section class="panel"><h1>The word graph</h1>
    <p class="muted">Everything the pipeline builds, not only what the game uses. Generated ${esc(m.generated)}. Search any word above, or start with a review queue. New here? Read the <a href="#/guide">guide</a>.</p>
    <div class="grid">
      <div class="tile"><b>${m.lemmas.toLocaleString()}</b><span class="small muted">lemmas</span></div>
      <div class="tile"><b>${m.families.toLocaleString()}</b><span class="small muted">families of 2+ words</span></div>
      <div class="tile"><b>${m.game_words.toLocaleString()}</b><span class="small muted">words in the game</span></div>
      <div class="tile"><b>${(m.edges.deriv || 0).toLocaleString()}</b><span class="small muted">derivation links</span></div>
      <div class="tile"><b>${((m.edges.compound_head || 0) + (m.edges.compound_mod || 0)).toLocaleString()}</b><span class="small muted">compound links</span></div>
      <div class="tile"><b>${ok} / ${checks.length}</b><span class="small muted">checks passing</span></div>
    </div></section>
  <section class="panel"><h2>Review queues</h2><div class="grid">${Object.entries(QUEUES).filter(([k]) => m.queues[k]).map(([k, [t, d]]) =>
    `<a class="qcard" href="#/q/${k}"><b>${t}</b><span class="small muted">${m.queues[k].in_game.toLocaleString()} game · ${m.queues[k].total.toLocaleString()} total</span><span class="small">${esc(d)}</span></a>`).join("")}</div></section>
  <section class="panel"><h2>Checks on this build</h2>
    ${Object.entries(groups).map(([k, cs]) => `<h3>${esc(k)}</h3>${cs.map(c => `<div class="check"><span class="${c.ok ? "ok" : "fail"}">${c.ok ? "PASS" : "FAIL"}</span><span>${esc(c.check)}${c.detail ? ` <span class="small muted">(${esc(c.detail)})</span>` : ""}</span></div>`).join("")}`).join("")}
    <h3>Hand-checked precision</h3><p class="small">One-source derivations ${esc(m.precision_sample.deriv_1src)} · two-source derivations ${esc(m.precision_sample.deriv_2plus)} · compound heads ${esc(m.precision_sample.compound_head)}. <span class="muted">${esc(m.precision_sample.note)}</span></p></section>
  <section class="panel"><h2>Rules and sources</h2>
    <div class="scroll"><table>${Object.entries(m.rules).map(([k, r]) => `<tr><th>${esc(k)}</th><td>${esc(r)}</td></tr>`).join("")}</table></div>
    <div class="scroll"><table><tr><th>Source</th><th>Citation and license</th></tr>${Object.entries(m.sources).map(([k, s]) => `<tr><td>${esc(SRC[k] || k)}</td><td>${esc(s)}</td></tr>`).join("")}</table></div>
    <p class="small muted">Links: ${Object.entries(m.edges).map(([k, n]) => `${KIND[k] || k} ${n.toLocaleString()}`).join(" · ")} · blocked merges ${m.rejected_merges.toLocaleString()}</p></section>`;
}

function viewQueues() {
  return `<section class="panel"><h1>Review queues</h1><p class="muted">Each queue lists one kind of thing worth a human look, game words first.</p>
    <div class="grid">${Object.entries(QUEUES).filter(([k]) => META.queues[k]).map(([k, [t, d]]) =>
      `<a class="qcard" href="#/q/${k}"><b>${t}</b><span class="small muted">${META.queues[k].in_game.toLocaleString()} game · ${META.queues[k].total.toLocaleString()} total</span><span class="small">${esc(d)}</span></a>`).join("")}</div></section>`;
}

let qstate = { name: null, page: 0, gameOnly: true };
async function viewQueue(name) {
  if (qstate.name !== name) qstate = { name, page: 0, gameOnly: true };
  const items = (await queue(name)).filter(x => !qstate.gameOnly || x[3]);
  const per = 40, pages = Math.max(1, Math.ceil(items.length / per));
  qstate.page = Math.min(qstate.page, pages - 1);
  const slice = items.slice(qstate.page * per, qstate.page * per + per);
  const [title, desc] = QUEUES[name] || [name, ""];
  const done = items.filter(x => review[`q|${name}|${x[0]}|${x[1]}`]).length;
  return `<section class="panel"><p class="small"><a href="#/queues">← Queues</a></p><h1>${esc(title)}</h1><p class="muted">${esc(desc)}</p>
    <div class="row"><label class="small"><input type="checkbox" id="gameOnly" ${qstate.gameOnly ? "checked" : ""}> game words only</label>
    <span class="small muted">${items.length.toLocaleString()} items · ${done} reviewed</span></div>
    <div>${slice.map(x => `<div class="qitem"><span class="txt">${esc(x[2])} ${x[3] ? '<span class="pill game">game</span>' : ""}</span>
      ${flink(x[0], "family")} · ${wlink(x[1])} ${rv(`q|${name}|${x[0]}|${x[1]}`, x[2], name)}</div>`).join("") || '<p class="muted">Nothing here.</p>'}</div>
    <div class="pager"><button id="prev" ${qstate.page ? "" : "disabled"}>← Previous</button><span class="small muted">page ${qstate.page + 1} of ${pages}</span><button id="next" ${qstate.page < pages - 1 ? "" : "disabled"}>Next →</button></div></section>`;
}

let famState = { fid: null, showAll: false, kinds: new Set(["deriv", "compound_head", "compound_mod", "causative", "ety_hint"]) };
async function viewFamily(fid, focus) {
  const f = await family(fid);
  if (!f) return `<section class="panel"><p>Family not found.</p></section>`;
  if (famState.fid !== fid) famState = { ...famState, fid, showAll: f.size <= 60 };
  const W = f.words, ms = Object.keys(W);
  const visible = new Set(ms.filter(m => famState.showAll || W[m].game || m === f.root || m === focus));
  const kids = {};
  for (const m of ms) { const b = W[m].base; if (b && W[b]) (kids[b] ||= []).push(m); }
  const sortR = (a, b) => (W[a].rank || 1e9) - (W[b].rank || 1e9);
  const hasVisible = w => visible.has(w) || (kids[w] || []).some(hasVisible);
  const node = w => {
    const d = W[w];
    if (!hasVisible(w)) return "";
    return `<li><div class="node ${visible.has(w) ? "" : "dim"}" ${w === focus ? 'id="focus"' : ""}>${wlink(w)} ${segs(d.segs)}
      <span class="pill">${esc(d.pos || "")}</span>${lv(d.level)}${d.game ? '<span class="pill game">game</span>' : ""} ${formsHtml(d.forms)}
      ${d.base ? `<span class="small muted">from <span class="de">${esc(d.base)}</span></span> ${pills(d.base_src, !d.base_src)}${d.bases ? ` <span class="pill s1" title="candidate bases: ${esc(d.bases.join(", "))}">${d.bases.length} bases</span>` : ""} ${rv(`${fid}|link|${d.base}>${w}`, `${d.base} → ${w}`)}` : ""}
      <div class="gloss">${esc((d.en || []).slice(0, 2).join("; "))}</div></div>
      ${kids[w] ? `<ul>${kids[w].sort(sortR).map(node).join("")}</ul>` : ""}</li>`;
  };
  const roots = ms.filter(m => !W[m].base || !W[W[m].base]).sort(sortR);
  const edges = (f.edges || []).filter(e => famState.kinds.has(e[2]));
  const kindCounts = {}; for (const e of f.edges || []) kindCounts[e[2]] = (kindCounts[e[2]] || 0) + 1;
  return `<section class="panel"><h1><span class="de">${esc(f.root)}</span> family</h1>
    <p class="small muted">${f.size} words · ${f.in_game || 0} in the game · history from ${wlink(f.history_from || f.root)} · ${ext(f.root)}</p>
    <div class="row">${rv(`${fid}|family|${f.root}`, `${f.root}: family grouping`)} <span class="small muted">is this grouping right as a whole?</span></div></section>
  <section class="panel"><div class="row" style="justify-content:space-between"><h2>Words and derivation links</h2>
    <label class="small"><input type="checkbox" id="showAll" ${famState.showAll ? "checked" : ""}> show all ${f.size} words</label></div>
    <ul class="tree">${roots.map(node).join("")}</ul>
    ${!famState.showAll && f.size > visible.size ? `<p class="small muted">${f.size - visible.size} words outside the game are hidden. Tick “show all” to see them.</p>` : ""}</section>
  <section class="panel"><h2>History</h2>${historyHtml(fid, f.root, f.history, f.pie, f.loan, f.cognates)}</section>
  <section class="panel"><h2>All links</h2>
    <div class="chips">${Object.keys(KIND).filter(k => kindCounts[k]).map(k => `<button data-kind="${k}" aria-pressed="${famState.kinds.has(k)}">${KIND[k]} ${kindCounts[k]}</button>`).join("")}</div>
    <div class="scroll"><table><tr><th>From</th><th>To</th><th>Kind</th><th>Sources</th><th>Details</th></tr>${edges.slice(0, 400).map(e =>
      `<tr><td>${wlink(e[0])}</td><td>${wlink(e[1])}${e[5] ? ` <span class="small">${flink(e[5], "other family")}</span>` : ""}</td><td>${KIND[e[2]] || e[2]}</td><td>${pills(e[3])}</td><td class="mono small">${e[4] ? esc(Object.entries(e[4]).map(([k, v]) => `${SRC[k] || k}: ${v}`).join("; ")) : ""}</td></tr>`).join("")}</table></div>
    ${edges.length > 400 ? `<p class="small muted">First 400 of ${edges.length} links.</p>` : ""}</section>
  ${(f.rejected || []).length ? `<section class="panel"><h2>Blocked merges</h2><p class="small muted">One-source links the safety rule stopped from merging this family with another. If correct, the families belong together.</p>
    ${(f.rejected || []).map(r => `<div class="qitem"><span class="txt">${wlink(r[0])} → ${wlink(r[1])} ${pills(r[2])} <span class="mono small">${esc(Object.values(r[3] || {}).join(", "))}</span></span>${rv(`${fid}|rejected|${r[0]}>${r[1]}`, `${r[0]} → ${r[1]} (blocked merge)`)}</div>`).join("")}</section>` : ""}
  <section class="panel"><h2>Graph</h2>
    <div class="legend"><span><i style="background:var(--accent)"></i>derivation (thick: 2+ sources)</span><span><i style="background:var(--stratum)"></i>compound</span><span><i style="background:var(--bad)"></i>blocked merge</span><span>● game word · ○ other</span></div>
    <svg id="graph" role="img" aria-label="Family graph; tap a word to open it"></svg></section>
  <section class="panel"><h2>Your note</h2><textarea id="note" rows="2" placeholder="Anything wrong or missing in this family?">${esc(review[`${fid}|note|${f.root}`]?.note || "")}</textarea></section>`;
}

function drawGraph(f) {
  const el = $("#graph"); if (!el || !window.d3) return;
  const W = f.words, nodes = new Map(), links = [];
  const add = (id, inFam) => { if (!nodes.has(id)) nodes.set(id, { id, inFam, game: W[id]?.game }); };
  const shown = Object.keys(W).filter(m => famState.showAll || W[m].game || m === f.root);
  shown.forEach(m => add(m, true));
  for (const m of shown) { const b = W[m].base; if (b && nodes.has(b)) links.push({ source: b, target: m, t: "deriv", n: (W[m].base_src || []).length }); }
  for (const e of (f.edges || []).filter(e => e[2].startsWith("compound")).slice(0, 60)) {
    if (!nodes.has(e[0]) && !nodes.has(e[1])) continue;
    add(e[0], !!W[e[0]]); add(e[1], !!W[e[1]]); links.push({ source: e[0], target: e[1], t: "compound", n: e[3].length });
  }
  for (const r of (f.rejected || []).slice(0, 20)) { add(r[0], !!W[r[0]]); add(r[1], !!W[r[1]]); links.push({ source: r[0], target: r[1], t: "rejected", n: 1 }); }
  const w = el.clientWidth || 600, h = 440;
  const svg = d3.select(el).attr("viewBox", [0, 0, w, h]); svg.selectAll("*").remove();
  const css = getComputedStyle(document.documentElement), col = v => css.getPropertyValue(v).trim();
  const color = { deriv: col("--accent"), compound: col("--stratum"), rejected: col("--bad") };
  const sim = d3.forceSimulation([...nodes.values()])
    .force("link", d3.forceLink(links).id(d => d.id).distance(d => d.t === "deriv" ? 55 : 90))
    .force("charge", d3.forceManyBody().strength(-200)).force("center", d3.forceCenter(w / 2, h / 2)).force("collide", d3.forceCollide(26));
  const g = svg.append("g");
  svg.call(d3.zoom().scaleExtent([.25, 3]).on("zoom", e => g.attr("transform", e.transform)));
  const link = g.append("g").selectAll("line").data(links).join("line").attr("stroke", d => color[d.t])
    .attr("stroke-width", d => d.n >= 2 ? 2.2 : 1.2).attr("stroke-dasharray", d => d.t === "deriv" ? null : "4 3");
  const node = g.append("g").selectAll("g").data([...nodes.values()]).join("g").style("cursor", "pointer")
    .on("click", (e, d) => { location.hash = `#/w/${enc(d.id)}`; })
    .call(d3.drag().on("start", (e, d) => { if (!e.active) sim.alphaTarget(.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; }).on("end", (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = d.fy = null; }));
  node.append("circle").attr("r", d => d.id === f.root ? 9 : 6).attr("stroke", d => d.inFam ? col("--accent") : col("--muted")).attr("stroke-width", 1.5)
    .attr("fill", d => d.game ? (d.inFam ? col("--accent") : col("--stratum")) : col("--paper"));
  node.append("text").attr("x", 10).attr("y", 4).text(d => d.id);
  sim.on("tick", () => {
    link.attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
    node.attr("transform", d => `translate(${d.x},${d.y})`);
  });
}

async function viewWord(word) {
  const [w, entry] = await lookup(word);
  if (!w) return `<section class="panel"><p>No lemma <span class="de">${esc(word)}</span> in the lexicon (${META.lemmas.toLocaleString()} lemmas). Try its dictionary form.</p></section>`;
  const fid = entry[0], f = await family(fid), d = f.words[w];
  const evRow = (label, l, detail, isFinal) => `<div class="evbar"><span style="background:none;text-align:left">${label}</span>${LEVELS.map(x => `<span class="${x === l ? "on" : ""} ${isFinal && x === l ? "final" : ""}">${x}</span>`).join("")}</div>${detail ? `<p class="small muted" style="margin:0 0 4px 112px">${detail}</p>` : ""}`;
  const ev = d.ev || {};
  const merlinDetail = ev.merlin && typeof ev.merlin[1] === "object" ? "texts by rated level: " + Object.entries(ev.merlin[1]).map(([k, n]) => `${k} ${n}`).join(", ") : "";
  const links = (f.edges || []).filter(e => e[0] === w || e[1] === w);
  return `<section class="panel"><p class="small">${flink(fid, `← <span class="de">${esc(f.root)}</span> family`)} (${f.size} words)</p>
    <h1 class="word">${esc(w)}</h1>
    <div class="row"><span class="pill">${esc(d.pos || "")}</span>${lv(d.level)}${d.game ? '<span class="pill game">in game</span>' : '<span class="pill">not in game</span>'}
      ${d.rank ? `<span class="small muted">frequency rank ${d.rank.toLocaleString()}</span>` : ""}
      ${d.ipa ? `<span class="mono">/${esc(d.ipa)}/</span>` : ""}
      ${d.audio ? `<button class="play" data-audio="${esc(META.audio_base + d.audio)}" aria-label="Play pronunciation">▶ listen</button>` : ""}</div>
    ${d.segs ? `<p>${segs(d.segs)} <span class="small muted">word parts</span></p>` : ""}
    ${d.forms ? `<p class="row">${formsHtml(d.forms)} <span class="small muted">${d.nforms ? d.nforms + " inflected forms in UniMorph" : ""}</span></p>` : ""}
    <p class="small muted">${ext(w)}${d.audio ? ` · <a href="https://commons.wikimedia.org/wiki/File:${enc(d.audio)}" target="_blank" rel="noopener">audio source</a>` : ""}</p></section>
  <section class="panel"><h2>Meanings</h2>${(d.en || []).length ? `<ol>${d.en.map(g => `<li>${esc(g)}</li>`).join("")}</ol>` : '<p class="muted">No English gloss.</p>'}
    ${(d.de || []).length ? `<h3>German</h3><ol lang="de">${d.de.map(g => `<li>${esc(g)}</li>`).join("")}</ol>` : ""}</section>
  <section class="panel"><h2>Level evidence</h2>
    <p class="small muted">Rule: the course chapter if the word is in the course; otherwise the lower of subtitle and learner level; then at most one level above its parts. The outlined box is the result.</p>
    ${evRow("Deutsch im Blick", ev.dib?.[0], ev.dib ? `chapter ${ev.dib[1]}` : "not in the course")}
    ${evRow("MERLIN learners", ev.merlin?.[0], merlinDetail || "not used by 2+ learners")}
    ${evRow("Subtitles", ev.subs2?.[0], ev.subs2 ? `rank ${ev.subs2[1]?.toLocaleString?.() ?? ev.subs2[1]} among lemmas` : "not in subtitles")}
    ${evRow("Result", d.level, ev.klexikon ? `also in ${(ev.klexikon[1] * 100).toFixed(1)}% of Klexikon articles (simple German)` : "", true)}
    ${rv(`${fid}|level|${w}`, `${w}: level ${d.level || "none"}`)}</section>
  <section class="panel"><h2>Place in the family</h2>
    ${d.base ? `<p class="row">Base: ${wlink(d.base)} ${pills(d.base_src, !d.base_src)} ${rv(`${fid}|link|${d.base}>${w}`, `${d.base} → ${w}`)}</p>` : `<p>Root of the ${flink(fid, `<span class="de">${esc(f.root)}</span>`)} family.</p>`}
    ${d.bases ? `<p class="small">Candidate bases: ${d.bases.map(wlink).join(", ")}</p>` : ""}
    <h3>All links of this word</h3>
    <div class="scroll"><table><tr><th>From</th><th>To</th><th>Kind</th><th>Sources</th></tr>${links.map(e =>
      `<tr><td>${wlink(e[0])}</td><td>${wlink(e[1])}${e[5] ? ` <span class="small">${flink(e[5], "other family")}</span>` : ""}</td><td>${KIND[e[2]] || e[2]}</td><td>${pills(e[3])}</td></tr>`).join("") || '<tr><td colspan="4" class="muted">No links.</td></tr>'}</table></div></section>
  ${d.hist ? `<section class="panel"><h2>This word's own history</h2>${historyHtml(fid, w, d.hist.chain, d.hist.pie, d.hist.loan, d.hist.cognates)}</section>`
    : w === f.root ? `<section class="panel"><h2>History</h2>${historyHtml(fid, f.root, f.history, f.pie, f.loan, f.cognates)}</section>` : ""}`;
}


function viewGuide() {
  const P = (c, t) => `<span class="pill ${c}">${t}</span>`;
  return `<section class="panel"><h1>How to use this viewer</h1>
    <p>This viewer shows the whole word graph behind Urwort: every German word the pipeline knows, how words are grouped into families, where each link comes from, and the history of each root. Use it to understand the data and to mark what is right or wrong. Your marks become fixes in the pipeline.</p>
    <h3>Ways in</h3>
    <ul>
      <li><b>Search</b> (top): type 2+ letters of any German word. Suggestions show game words first, then frequent words. Enter opens the top match.</li>
      <li><b>Overview</b>: headline numbers, all build checks, the rules and the sources.</li>
      <li><b>Queues</b>: lists of things most worth a human look, one kind per queue.</li>
      <li><b>Links</b>: every word is a link to its word page; “family” links open the family page. Pages have shareable addresses, e.g. <span class="mono">#/w/fahren</span>.</li>
    </ul></section>
  <section class="panel"><h2>Explore (the game data)</h2>
    <ul>
      <li><b>Map</b>: every word family the game uses, as a bubble sized by its number of game words. Colour = origin: blue native Germanic, orange loanword, green no history yet. A black ring = Proto-Indo-European root verified. Lines are compounds joining two families. Linked families form the island at the top; families without compound links sit in rows below, by origin. Tap a bubble for its words, history summary and compound neighbours; tap a legend chip to hide an origin; “Find a word” flies to its family.</li>
      <li><b>Charts</b>: levels, parts of speech, origins, loan languages, history depth, PIE status, family sizes, link evidence, top prefixes and suffixes. Hover for exact numbers; tap a bar to list those words.</li>
      <li><b>Words</b>: all game words in a sortable table (word, level, parts, family, family size game/all, base, number of sources, origin, meaning, frequency rank) with filters. Chart taps arrive here as filters you can remove.</li>
      <li><b>Affixes</b>: every prefix and suffix in the game words with counts; tap one for its words.</li>
    </ul></section>
  <section class="panel"><h2>Family page</h2>
    <p>A family is a group of words today’s speakers feel belong together (present-day word family): <span class="de">stehen, verstehen, Verständnis, Zustand…</span>. History is kept separately, underneath.</p>
    <ul>
      <li><b>Words and derivation links</b>: a tree from the root. Each word shows its parts (${'<span class="segs"><span class="prefix">ver</span><span class="root">steh</span><span class="suffix">en</span></span>'}: prefix, root, suffix), part of speech, estimated level, ${P("game", "game")} if the game uses it, key forms (article, plural, past…), and “from <i>base</i>” with the sources behind that link.</li>
      <li><b>Show all</b>: by default big families show only game words; tick it to see all members. Faded rows lead to game words but are not used by the game.</li>
      <li><b>History</b>: older forms of the root, newest at the bottom (Middle High German → Proto-Germanic), each with its sources; Proto-Indo-European with every source’s claim; loan origin; cognates.</li>
      <li><b>All links</b>: every link touching the family, filterable by kind: derivation, compound head/modifier, causative pair (<span class="de">legen/liegen</span>), history hint (<span class="de">fertig ~ Fahrt</span>), untyped word list. “other family” marks links that leave the family.</li>
      <li><b>Blocked merges</b>: one-source links the safety rule stopped from joining this family with another. If one is right, the two families should be one.</li>
      <li><b>Graph</b>: teal lines = derivation (thick = 2+ sources), ochre dashed = compounds, red dashed = blocked merges. Filled dots are game words. Drag, pinch to zoom, tap a word to open it.</li>
    </ul></section>
  <section class="panel"><h2>Word page</h2>
    <ul>
      <li><b>Header</b>: part of speech, estimated level, whether the game uses it, frequency rank, IPA, ▶ listen (Wikimedia Commons recording), word parts, key forms and the number of inflected forms known.</li>
      <li><b>Meanings</b>: English glosses (English Wiktionary) and German definitions (German Wiktionary).</li>
      <li><b>Level evidence</b>: one row per input. Deutsch im Blick = chapter in a first-year course (1–5 → A1, 6–10 → A2); MERLIN = lowest level at which 2+ learners used the word; Subtitles = frequency rank in film subtitles (1k/2k/4k/8k/16k → A1…C1). The outlined box is the result. Levels are estimates, not official CEFR.</li>
      <li><b>Place in the family</b>: its base with sources, other candidate bases, and every link of the word.</li>
      <li><b>Own history</b>: when the word has an etymology of its own (not just its root’s).</li>
    </ul></section>
  <section class="panel"><h2>Reading the labels</h2>
    <div class="scroll"><table>
      <tr><td>${P("s2", "DErivBase")} ${P("s2", "de Wiktionary")}</td><td>green: the link or stage has 2+ independent sources</td></tr>
      <tr><td>${P("s1", "MorphyNet")}</td><td>ochre: only one source; about 95% of these were right in a sample</td></tr>
      <tr><td>${P("s1", "indirect")}</td><td>in the family through another member, with no direct link to this base</td></tr>
      <tr><td>${P("bad", "sources disagree")}</td><td>red: a conflict, a doubt, or a missing source</td></tr>
      <tr><td>${P("lv", "A2")}</td><td>estimated level</td></tr>
      <tr><td>${P("game", "game")}</td><td>used by the game (the 5,000 most frequent words)</td></tr>
      <tr><td>${P("s2", "verified (2+ sources)")}</td><td>Proto-Indo-European root confirmed by two independent sources; only these show in the game</td></tr>
      <tr><td>${P("bad", "origin beyond uncertain")}</td><td>Wiktionary marks the etymology before this stage as uncertain</td></tr>
    </table></div>
    <h3>Sources</h3>
    <p class="small">en/de Wiktionary (via kaikki.org) · reconstruction page = Wiktionary’s Proto-Germanic/Proto-Indo-European entries · DErivBase (grammar-based derivation rules) · MorphyNet (Wiktionary-derived derivations, never used alone) · IE-CoR (expert cognate database) · UniMorph (inflected forms) · Deutsch im Blick, MERLIN, subtitles (levels).</p></section>
  <section class="panel"><h2>Reviewing</h2>
    <ul>
      <li>Tap <b>✓</b> if a link, stage, root or grouping is right, <b>✗</b> if wrong. Tap again to undo. Each family also has a free-text note.</li>
      <li>Marks are saved in this browser only. Open <b>Review</b> to see them, <b>Export review</b> to download a file, and send that file to Claude to apply the fixes. <b>Import</b> continues on another device.</li>
      <li>Good places to start: Queues → Blocked merges, Indirect members, Single-source links. Game words come first.</li>
    </ul></section>`;
}

function viewReview() {
  const items = Object.entries(review).sort((a, b) => (b[1].at || "").localeCompare(a[1].at || ""));
  const bad = items.filter(([, v]) => v.verdict === "bad").length;
  return `<section class="panel"><h1>Your review</h1>
    <p class="muted">${items.length} marks (${bad} wrong). Saved in this browser only. Export the file and send it to Claude to apply the fixes, or import it on another device.</p>
    <div class="row"><button id="exp">Export review</button><label class="small"><input type="file" id="imp" accept="application/json"> import</label><button id="clr">Clear all</button></div>
    <div class="scroll"><table><tr><th>Item</th><th></th><th>Note</th><th>When</th></tr>${items.map(([k, v]) =>
      `<tr><td>${esc(v.label || k)}${v.ctx ? ` <span class="pill">${esc(QUEUES[v.ctx]?.[0] || v.ctx)}</span>` : ""}</td><td>${v.verdict === "ok" ? "✓" : v.verdict === "bad" ? "✗" : ""}</td><td>${esc(v.note || "")}</td><td class="small muted">${esc((v.at || "").slice(0, 10))}</td></tr>`).join("") ||
      '<tr><td colspan="4" class="muted">No marks yet. Use ✓ / ✗ anywhere in the viewer.</td></tr>'}</table></div></section>`;
}

// ---------- router ----------
async function route() {
  const h = decodeURIComponent(location.hash.slice(1) || "/");
  const [, a, ...rest] = h.split("/"); const b = rest.join("/");
  document.querySelectorAll(".tabs a").forEach(t => t.removeAttribute("aria-current"));
  const tab = a === "" || a === "x" ? "explore" : a === "overview" ? "overview" : a === "queues" || a === "q" ? "queues" : a === "review" ? "review" : a === "guide" ? "guide" : null;
  if (tab) $(`.tabs a[data-tab="${tab}"]`).setAttribute("aria-current", "page");
  const view = $("#view");
  try {
    if (!a || a === "x") { const [sub, query] = (b || "").split("?"); await Explore.show(view, sub, query); return; }
    else if (a === "overview") view.innerHTML = await viewOverview();
    else if (a === "queues") view.innerHTML = viewQueues();
    else if (a === "q") view.innerHTML = await viewQueue(b);
    else if (a === "f") { view.innerHTML = await viewFamily(b); drawGraph(await family(b)); }
    else if (a === "w") view.innerHTML = await viewWord(b);
    else if (a === "review") view.innerHTML = viewReview();
    else if (a === "guide") view.innerHTML = viewGuide();
    else view.innerHTML = await viewOverview();
  } catch (err) { view.innerHTML = `<section class="panel"><p>Could not load this view: ${esc(err.message)}</p></section>`; }
  window.scrollTo({ top: 0 });
}

// ---------- events ----------
document.addEventListener("click", async e => {
  const b = e.target.closest(".review button");
  if (b) {
    const wrap = b.closest(".review"), key = wrap.dataset.key, v = b.dataset.v;
    if (review[key]?.verdict === v) delete review[key];
    else review[key] = { verdict: v, label: wrap.dataset.label, ctx: wrap.dataset.ctx || undefined, at: new Date().toISOString(), note: review[key]?.note };
    wrap.querySelectorAll("button").forEach(x => { if (review[key]?.verdict === x.dataset.v) x.dataset.on = x.dataset.v; else delete x.dataset.on; });
    saveReview(); return;
  }
  const play = e.target.closest("[data-audio]");
  if (play) { const p = $("#player"); p.src = play.dataset.audio; p.play().catch(() => { play.textContent = "audio unavailable"; }); return; }
  const kb = e.target.closest("[data-kind]");
  if (kb) { const k = kb.dataset.kind; famState.kinds.has(k) ? famState.kinds.delete(k) : famState.kinds.add(k); route(); return; }
  if (e.target.id === "prev") { qstate.page--; route(); }
  if (e.target.id === "next") { qstate.page++; route(); }
  if (e.target.id === "exp") {
    const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), data_generated: META.generated, review }, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `urwort-review-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  }
  if (e.target.id === "clr") {
    if (e.target.dataset.armed) { review = {}; saveReview(); route(); } else { e.target.dataset.armed = 1; e.target.textContent = "Tap again to clear all"; }
  }
});
document.addEventListener("change", async e => {
  if (e.target.id === "showAll") { famState.showAll = e.target.checked; route(); }
  if (e.target.id === "gameOnly") { qstate.gameOnly = e.target.checked; qstate.page = 0; route(); }
  if (e.target.id === "note") {
    const key = `${famState.fid}|note|${(await family(famState.fid)).root}`, v = e.target.value.trim();
    if (v) review[key] = { note: v, label: `note on ${(await family(famState.fid)).root}`, at: new Date().toISOString() }; else delete review[key];
    saveReview();
  }
  if (e.target.id === "imp" && e.target.files[0]) {
    try { const d = JSON.parse(await e.target.files[0].text()); Object.assign(review, d.review || d); saveReview(); route(); }
    catch { alert("Could not read that file."); }
  }
});

// search with suggestions (prefix match in the letter shard, game words and frequent words first)
let sel = -1, sugg = [];
async function suggest() {
  const q = $("#q").value.trim(), ul = $("#sugg");
  if (q.length < 2) { ul.hidden = true; $("#q").setAttribute("aria-expanded", "false"); return; }
  const idx = await index(letterOf(q)), ql = q.toLowerCase();
  sugg = Object.entries(idx).filter(([w]) => w.toLowerCase().startsWith(ql))
    .sort((a, b) => (b[1][4] - a[1][4]) || ((a[1][3] || 1e9) - (b[1][3] || 1e9)) || a[0].length - b[0].length).slice(0, 12);
  sel = -1;
  ul.innerHTML = sugg.map(([w, x], i) => `<li role="option" data-i="${i}"><span class="de">${esc(w)}</span><span class="small muted">${esc(x[1])} ${x[2] || ""} ${x[4] ? "· game" : ""}</span></li>`).join("") || '<li class="muted">No match</li>';
  ul.hidden = false; $("#q").setAttribute("aria-expanded", "true");
}
function pick(i) { const s = sugg[i]; if (!s) return; $("#sugg").hidden = true; $("#q").value = ""; location.hash = `#/w/${enc(s[0])}`; }
$("#q").addEventListener("input", suggest);
$("#q").addEventListener("keydown", e => {
  const lis = [...$("#sugg").querySelectorAll("li[data-i]")];
  if (e.key === "ArrowDown") { sel = Math.min(lis.length - 1, sel + 1); }
  else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); }
  else if (e.key === "Enter") { e.preventDefault(); if (sel >= 0) pick(sel); else if (sugg.length) pick(0); else if ($("#q").value.trim()) location.hash = `#/w/${enc($("#q").value.trim())}`; return; }
  else if (e.key === "Escape") { $("#sugg").hidden = true; return; } else return;
  e.preventDefault(); lis.forEach((li, i) => li.setAttribute("aria-selected", i === sel));
});
$("#sugg").addEventListener("click", e => { const li = e.target.closest("li[data-i]"); if (li) pick(+li.dataset.i); });
document.addEventListener("click", e => { if (!e.target.closest(".search")) $("#sugg").hidden = true; });

window.addEventListener("hashchange", route);
getJSON(DATA + "meta.json").then(m => { META = m; saveReview(); route(); })
  .catch(err => { $("#view").innerHTML = `<section class="panel"><p>Could not load the data (${esc(err.message)}).</p></section>`; });
