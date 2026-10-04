// Explore: the game data (urwort-v4 slice) as a map, charts, a word table and an affix list.
// Data: data/explore.json from explore_export.py. Routes: #/ (map)  #/x/charts  #/x/words?filters  #/x/affixes
"use strict";
const Explore = (() => {
  let X = null;                       // {families, edges, words, origin_names}
  const ORIGIN = ["native Germanic", "loanword", "no history yet"];
  const PIE_NAMES = ["none", "verified", "single source", "doubted", "conflict"];
  const LEVELS6 = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const POSN = { NOUN: "noun", VERB: "verb", ADJ: "adjective", ADV: "adverb" };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const enc = encodeURIComponent;
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const famHref = f => `#/f/${enc((f[3] > 1 ? "f:" : "w:") + f[1])}`;
  const load = async () => X ||= await fetch("data/explore.json").then(r => r.json()).then(d => {
    d.byFam = d.families.map(() => []);
    d.words.forEach((w, i) => d.byFam[w[1]].push(i));
    d.wordIdx = new Map(d.words.map((w, i) => [w[0].toLowerCase(), i]));
    d.affixes = { p: new Map(), s: new Map() };
    for (const w of d.words) for (const part of (w[5] ? w[5].split("|") : [])) {
      const [t, f] = [part[0], part.slice(2).toLowerCase()];
      if (t === "p" || t === "s") d.affixes[t].set(f, (d.affixes[t].get(f) || 0) + 1);
    }
    return d;
  });

  const subnav = cur => `<nav class="chips" aria-label="Explore views">${[["", "Map"], ["charts", "Charts"], ["words", "Words"], ["affixes", "Affixes"]]
    .map(([k, t]) => `<a class="chip ${cur === k ? "on" : ""}" href="#/${k ? "x/" + k : ""}" ${cur === k ? 'aria-current="page"' : ""}>${t}</a>`).join("")}</nav>`;

  // ---------- map ----------
  const mapState = { hideSingles: true, showEdges: true, origins: new Set([0, 1, 2]), sel: null, transform: null };
  function mapHtml() {
    const s = mapState;
    return `<section class="panel"><div class="row" style="justify-content:space-between"><h1>Game word map</h1>${subnav("")}</div>
      <p class="muted small">Each bubble is a word family in the game, sized by how many of its words the game uses. Lines are compounds that join two families (<span class="de">Handschuh</span> joins <span class="de">Hand</span> and <span class="de">Schuh</span>). Connected families form the island at the top; families without compound links sit in rows below, grouped by origin. Pinch or scroll to zoom, drag to move, tap a bubble.</p>
      <div class="row">
        ${ORIGIN.map((o, i) => `<button class="legend-chip" data-origin="${i}" aria-pressed="${s.origins.has(i)}"><i style="background:var(--o${i})"></i>${o} <span class="muted">${X.families.filter(f => f[4] === i).length}</span></button>`).join("")}
        <span class="legend-chip static"><i class="ring"></i>PIE root verified</span>
      </div>
      <div class="row small">
        <label><input type="checkbox" id="mapSingles" ${s.hideSingles ? "checked" : ""}> hide one-word families</label>
        <label><input type="checkbox" id="mapEdges" ${s.showEdges ? "checked" : ""}> show compound lines</label>
        <input id="mapFind" type="search" placeholder="Find a word on the map" style="flex:1 1 160px;min-width:0" aria-label="Find a word on the map">
        <button id="mapReset">Reset view</button>
      </div>
      <div class="mapwrap"><canvas id="map" aria-label="Map of word families"></canvas><div id="maptip" class="tip" hidden></div></div>
      <div id="mapcard"></div></section>`;
  }
  function drawMap() {
    const cv = document.getElementById("map"); if (!cv) return;
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext("2d"); ctx.scale(dpr, dpr);
    const F = X.families, s = mapState;
    const visible = F.map(f => s.origins.has(f[4]) && !(s.hideSingles && f[2] < 2 && !X.linked.has(f[0])));
    const col = [css("--o0"), css("--o1"), css("--o2")], ink = css("--fg"), line = css("--muted"), bg = css("--bg");
    const xs = F.map(f => f[9]), ys = F.map(f => f[10]);
    const bounds = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const zoom = d3.zoom().scaleExtent([0.05, 12]).on("zoom", e => { s.transform = e.transform; paint(); });
    const sel = d3.select(cv).call(zoom);
    if (!s.transform) {
      const k = 0.92 * Math.min(W / (bounds[2] - bounds[0] + 40), H / (bounds[3] - bounds[1] + 40));
      s.transform = d3.zoomIdentity.translate(W / 2 - k * (bounds[0] + bounds[2]) / 2, H / 2 - k * (bounds[1] + bounds[3]) / 2).scale(k);
    }
    sel.call(zoom.transform, s.transform);
    function paint() {
      const t = s.transform;
      ctx.save(); ctx.clearRect(0, 0, W, H); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      ctx.translate(t.x, t.y); ctx.scale(t.k, t.k);
      if (s.showEdges) {
        ctx.strokeStyle = line; ctx.globalAlpha = .55; ctx.lineWidth = 1 / t.k; ctx.beginPath();
        for (const [a, b] of X.edges) if (visible[a] && visible[b]) { ctx.moveTo(F[a][9], F[a][10]); ctx.lineTo(F[b][9], F[b][10]); }
        ctx.stroke(); ctx.globalAlpha = 1;
      }
      F.forEach((f, i) => {
        if (!visible[i]) return;
        ctx.beginPath(); ctx.arc(f[9], f[10], f[11], 0, 2 * Math.PI); ctx.fillStyle = col[f[4]];
        ctx.globalAlpha = s.sel === null || s.sel === i || s.neigh?.has(i) ? 1 : .25; ctx.fill();
        ctx.lineWidth = 1.2 / t.k; ctx.strokeStyle = bg; ctx.stroke();           // 2px-ish surface ring between overlapping marks
        if (f[7] === 1) { ctx.beginPath(); ctx.arc(f[9], f[10], f[11] + 2 / t.k, 0, 2 * Math.PI); ctx.strokeStyle = ink; ctx.lineWidth = 1.6 / t.k; ctx.stroke(); }
        if (s.sel === i) { ctx.beginPath(); ctx.arc(f[9], f[10], f[11] + 5 / t.k, 0, 2 * Math.PI); ctx.strokeStyle = ink; ctx.lineWidth = 2.5 / t.k; ctx.stroke(); }
      });
      ctx.globalAlpha = 1; ctx.fillStyle = ink; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = `${12 / t.k}px "IBM Plex Sans", system-ui, sans-serif`;
      F.forEach((f, i) => { if (visible[i] && (f[11] * t.k > 11 || s.sel === i)) ctx.fillText(f[1], f[9], f[10] + f[11] + 9 / t.k); });
      ctx.restore();
    }
    const qt = d3.quadtree().x(i => F[i][9]).y(i => F[i][10]).addAll(F.map((_, i) => i).filter(i => visible[i]));
    const hit = (px, py) => { const [x, y] = s.transform.invert([px, py]); const i = qt.find(x, y, 40); return i !== undefined && Math.hypot(F[i][9] - x, F[i][10] - y) <= F[i][11] + 8 / s.transform.k ? i : null; };
    const tip = document.getElementById("maptip");
    cv.onmousemove = e => {
      const r = cv.getBoundingClientRect(), i = hit(e.clientX - r.left, e.clientY - r.top);
      if (i === null) { tip.hidden = true; cv.style.cursor = "grab"; return; }
      const f = F[i]; cv.style.cursor = "pointer"; tip.hidden = false;
      tip.style.left = `${e.clientX - r.left + 12}px`; tip.style.top = `${e.clientY - r.top + 12}px`;
      tip.innerHTML = `<b class="de">${esc(f[1])}</b><br>${f[2]} game words · ${f[3]} in all<br>${ORIGIN[f[4]]}${f[5] ? ` (${esc(f[5])})` : ""}`;
    };
    cv.onmouseleave = () => { tip.hidden = true; };
    cv.onclick = e => { const r = cv.getBoundingClientRect(); select(hit(e.clientX - r.left, e.clientY - r.top)); };
    function select(i) {
      s.sel = i; s.neigh = new Set();
      if (i !== null) for (const [a, b] of X.edges) { if (a === i) s.neigh.add(b); if (b === i) s.neigh.add(a); }
      paint(); card(i);
    }
    s.focus = i => { const f = F[i], k = Math.max(s.transform.k, 1.2); s.transform = d3.zoomIdentity.translate(W / 2 - k * f[9], H / 2 - k * f[10]).scale(k); sel.call(zoom.transform, s.transform); select(i); };
    s.reset = () => { s.transform = null; s.sel = null; drawMap(); card(null); };
    paint();
  }
  function card(i) {
    const el = document.getElementById("mapcard"); if (!el) return;
    if (i === null) { el.innerHTML = ""; return; }
    const f = X.families[i], ws = X.byFam[i].map(j => X.words[j]).sort((a, b) => (a[4] || 1e9) - (b[4] || 1e9));
    const links = X.edges.filter(e => e[0] === i || e[1] === i);
    el.innerHTML = `<div class="mapcard"><div class="row" style="justify-content:space-between"><h2><span class="de">${esc(f[1])}</span> family</h2><a href="${famHref(f)}">Open family →</a></div>
      <p class="small muted">${f[2]} words in the game, ${f[3]} in all · ${ORIGIN[f[4]]}${f[5] ? ` · oldest stage: ${esc(f[5])}` : ""} · ${f[6]} history stages${f[7] ? ` · PIE ${PIE_NAMES[f[7]]}` : ""}${f[8] ? ` · English cognate <span class="de">${esc(f[8])}</span>` : ""}</p>
      <p>${ws.map(w => `<a class="de" href="#/w/${enc(w[0])}">${esc(w[0])}</a>${w[3] ? `<sup class="small muted">${w[3]}</sup>` : ""}`).join(", ")}</p>
      ${links.length ? `<p class="small">Compound links: ${links.map(e => { const o = X.families[e[0] === i ? e[1] : e[0]]; return `<a href="#" data-mapfocus="${X.families.indexOf(o)}"><span class="de">${esc(o[1])}</span></a>${e[3] !== o[1] && e[3] !== f[1] ? ` via <span class="de">${esc(e[3])}</span>` : ""}`; }).join(" · ")}</p>` : ""}</div>`;
  }

  // ---------- charts ----------
  function bars(title, note, rows, opts = {}) {
    // rows: [label, value, href, colorVar?]; one series; length = value; hover = exact value; click = filter
    const max = Math.max(1, ...rows.map(r => r[1])), total = rows.reduce((s, r) => s + r[1], 0);
    return `<figure class="chart"><figcaption><b>${title}</b><span class="small muted">${note}</span></figcaption>
      <div class="bars" role="list">${rows.map(([l, v, href, c]) => `<a class="bar" role="listitem" href="${href || "#"}" ${href ? "" : 'aria-disabled="true"'}
        title="${esc(l)}: ${v.toLocaleString()} (${(100 * v / Math.max(total, 1)).toFixed(1)}%)">
        <span class="bl">${esc(l)}</span><span class="bt"><span class="bf" style="width:${(100 * v / max).toFixed(2)}%;${c ? `background:var(${c})` : ""}"></span></span>
        <span class="bv">${v.toLocaleString()}</span></a>`).join("")}</div>${opts.foot ? `<p class="small muted">${opts.foot}</p>` : ""}</figure>`;
  }
  const count = (arr, key) => { const m = new Map(); for (const x of arr) { const k = key(x); m.set(k, (m.get(k) || 0) + 1); } return m; };
  function chartsHtml() {
    const W = X.words, F = X.families;
    const lv = count(W, w => w[3] || "none"), pos = count(W, w => w[2] || "other"), src = count(W, w => !w[7] ? "root / no base" : w[6] ? `${w[6]} source${w[6] > 1 ? "s" : ""}` : "indirect");
    const sizeB = n => n >= 11 ? "11+" : n >= 6 ? "6–10" : String(n);
    const fs = count(F, f => sizeB(f[2])), dep = count(F, f => f[6]), pie = count(F.filter(f => f[7]), f => PIE_NAMES[f[7]]);
    const loanLangs = [...count(F.filter(f => f[4] === 1), f => f[5] || "unknown")].sort((a, b) => b[1] - a[1]);
    const loanTop = loanLangs.slice(0, 8), loanOther = loanLangs.slice(8).reduce((s, x) => s + x[1], 0);
    const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n);
    return `<section class="panel"><div class="row" style="justify-content:space-between"><h1>The game data in charts</h1>${subnav("charts")}</div>
      <p class="muted small">${W.length.toLocaleString()} words in ${F.length.toLocaleString()} families. Hover a bar for the exact share; tap it to list those words.</p>
      <div class="charts">
      ${bars("Estimated level", "words per level", [...LEVELS6, "none"].map(l => [l, lv.get(l) || 0, `#/x/words?level=${l}`]))}
      ${bars("Part of speech", "words", [["NOUN", "noun"], ["VERB", "verb"], ["ADJ", "adjective"], ["ADV", "adverb"]].map(([k, l]) => [l, pos.get(k) || 0, `#/x/words?pos=${k}`]))}
      ${bars("Origin of the family", "families; colours match the map", ORIGIN.map((o, i) => [o, F.filter(f => f[4] === i).length, `#/x/words?origin=${i}`, `--o${i}`]))}
      ${bars("Loanwords by source language", "families", [...loanTop.map(([l, n]) => [l, n, `#/x/words?loan=${enc(l)}`, "--o1"]), ...(loanOther ? [["other", loanOther, "#/x/words?origin=1", "--o1"]] : [])])}
      ${bars("History depth", "families by number of recorded stages (Middle High German … Proto-Germanic)", [0, 1, 2, 3, 4, 5].map(n => [`${n} stage${n === 1 ? "" : "s"}`, dep.get(n) || 0, `#/x/words?depth=${n}`]))}
      ${bars("Proto-Indo-European root", "families that have a candidate; only verified ones show in the game", ["verified", "single source", "doubted", "conflict"].map(l => [l, pie.get(l) || 0, `#/x/words?pie=${PIE_NAMES.indexOf(l)}`]))}
      ${bars("Family size in the game", "families by number of game words", ["1", "2", "3", "4", "5", "6–10", "11+"].map(l => [l, fs.get(l) || 0, `#/x/words?size=${enc(l)}`]))}
      ${bars("Evidence for each word’s base", "words; sources backing the link to its base", ["root / no base", "indirect", "1 source", "2 sources", "3 sources", "4 sources"].map(l => [l, src.get(l) || 0, `#/x/words?src=${enc(l)}`]))}
      ${bars("Most common prefixes", "words containing the prefix", top(X.affixes.p, 15).map(([a, n]) => [a + "-", n, `#/x/words?affix=p:${enc(a)}`]))}
      ${bars("Most common suffixes", "words containing the suffix", top(X.affixes.s, 15).map(([a, n]) => ["-" + a, n, `#/x/words?affix=s:${enc(a)}`]))}
      </div></section>`;
  }

  // ---------- words table ----------
  const SIZE_OK = { "1": n => n === 1, "2": n => n === 2, "3": n => n === 3, "4": n => n === 4, "5": n => n === 5, "6–10": n => n >= 6 && n <= 10, "11+": n => n >= 11 };
  let tbl = { sort: "rank", dir: 1, shown: 100 };
  function filterWords(q) {
    const F = X.families, text = (q.text || "").toLowerCase();
    return X.words.filter(w => {
      const f = F[w[1]];
      if (text && !w[0].toLowerCase().includes(text) && !(w[8] || "").toLowerCase().includes(text)) return false;
      if (q.level && (w[3] || "none") !== q.level) return false;
      if (q.pos && w[2] !== q.pos) return false;
      if (q.origin && String(f[4]) !== q.origin) return false;
      if (q.loan && !(f[4] === 1 && f[5] === q.loan)) return false;
      if (q.depth && String(f[6]) !== q.depth) return false;
      if (q.pie && String(f[7]) !== q.pie) return false;
      if (q.size && !SIZE_OK[q.size]?.(f[2])) return false;
      if (q.src) { const s = !w[7] ? "root / no base" : w[6] ? `${w[6]} source${w[6] > 1 ? "s" : ""}` : "indirect"; if (s !== q.src) return false; }
      if (q.affix) { const [t, a] = [q.affix[0], q.affix.slice(2)]; if (!(w[5] || "").toLowerCase().split("|").includes(`${t}:${a}`)) return false; }
      if (q.parts === "1" && !w[5]) return false;
      return true;
    });
  }
  function wordsHtml(q) {
    const F = X.families;
    let rows = filterWords(q);
    const key = { rank: w => w[4] || 1e9, word: w => w[0].toLowerCase(), level: w => LEVELS6.indexOf(w[3]) + 1 || 9, family: w => F[w[1]][1].toLowerCase(), size: w => -F[w[1]][2], src: w => -w[6] }[tbl.sort];
    rows = rows.slice().sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * tbl.dir);
    const active = Object.entries(q).filter(([k, v]) => v && k !== "text");
    const sel = (id, label, opts) => `<label class="small">${label} <select data-f="${id}"><option value="">all</option>${opts.map(([v, t]) => `<option value="${esc(v)}" ${q[id] === v ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
    const th = (k, t) => `<th><button class="sort" data-sort="${k}">${t}${tbl.sort === k ? (tbl.dir > 0 ? " ↑" : " ↓") : ""}</button></th>`;
    const segHtml = s => s ? `<span class="segs">${s.split("|").map(p => `<span class="${{ p: "prefix", r: "root", s: "suffix" }[p[0]]}">${esc(p.slice(2))}</span>`).join("")}</span>` : "";
    return `<section class="panel"><div class="row" style="justify-content:space-between"><h1>Game words</h1>${subnav("words")}</div>
      <div class="row filters">
        <input id="wtext" type="search" placeholder="Filter by word or English meaning" value="${esc(q.text || "")}" style="flex:1 1 200px;min-width:0" aria-label="Filter by word or meaning">
        ${sel("level", "Level", [...LEVELS6, "none"].map(l => [l, l]))}
        ${sel("pos", "Part", Object.entries(POSN))}
        ${sel("origin", "Origin", ORIGIN.map((o, i) => [String(i), o]))}
        <label class="small"><input type="checkbox" data-f="parts" ${q.parts === "1" ? "checked" : ""}> has word parts</label>
      </div>
      ${active.length ? `<p class="row small">Filters: ${active.map(([k, v]) => `<button class="chipx" data-clear="${k}">${esc(k)}: ${esc(k === "origin" ? ORIGIN[v] : k === "pie" ? PIE_NAMES[v] : v)} ✕</button>`).join("")} <a href="#/x/words">clear all</a></p>` : ""}
      <p class="small muted">${rows.length.toLocaleString()} of ${X.words.length.toLocaleString()} words</p>
      <div class="scroll"><table class="wt"><thead><tr>${th("word", "Word")}${th("level", "Level")}<th>Parts</th>${th("family", "Family")}${th("size", "Fam. size")}<th>Base</th>${th("src", "Sources")}<th>Origin</th><th>Meaning</th>${th("rank", "Freq.")}</tr></thead>
      <tbody>${rows.slice(0, tbl.shown).map(w => { const f = F[w[1]]; return `<tr>
        <td><a class="de" href="#/w/${enc(w[0])}">${esc(w[0])}</a> <span class="small muted">${esc(POSN[w[2]] || w[2])}</span></td>
        <td>${w[3] ? `<span class="pill lv">${w[3]}</span>` : ""}</td><td>${segHtml(w[5])}</td>
        <td><a class="de" href="${famHref(f)}">${esc(f[1])}</a></td><td class="num">${f[2]} / ${f[3]}</td>
        <td>${w[7] ? `<span class="de">${esc(w[7])}</span>` : ""}</td><td class="num">${w[7] ? (w[6] || "ind.") : ""}</td>
        <td><i class="dot" style="background:var(--o${f[4]})"></i>${esc(f[5] || ORIGIN[f[4]])}</td><td class="small">${esc(w[8])}</td><td class="num small muted">${w[4] || ""}</td></tr>`; }).join("")}</tbody></table></div>
      ${rows.length > tbl.shown ? `<p><button id="more">Show ${Math.min(200, rows.length - tbl.shown)} more</button></p>` : ""}</section>`;
  }

  // ---------- affixes ----------
  function affixesHtml() {
    const list = (t, label) => [...X.affixes[t]].sort((a, b) => b[1] - a[1]).map(([a, n]) =>
      `<a class="affix" href="#/x/words?affix=${t}:${enc(a)}"><span class="segs"><span class="${label}">${esc(t === "p" ? a + "-" : "-" + a)}</span></span> <span class="small muted">${n}</span></a>`).join("");
    return `<section class="panel"><div class="row" style="justify-content:space-between"><h1>Prefixes and suffixes</h1>${subnav("affixes")}</div>
      <p class="muted small">Every affix found in the word parts of game words, with how many words use it. Tap one to list its words. Word parts exist for words that derive from another word in their family.</p>
      <h3>Prefixes (${X.affixes.p.size})</h3><div class="affixes">${list("p", "prefix")}</div>
      <h3>Suffixes (${X.affixes.s.size})</h3><div class="affixes">${list("s", "suffix")}</div></section>`;
  }

  // ---------- entry ----------
  async function show(view, sub, query) {
    await load();
    X.linked ||= new Set(X.edges.flatMap(e => [X.families[e[0]][0], X.families[e[1]][0]]));
    const q = Object.fromEntries(new URLSearchParams(query || ""));
    if (!sub) { view.innerHTML = mapHtml(); drawMap(); }
    else if (sub === "charts") view.innerHTML = chartsHtml();
    else if (sub === "words") { view.innerHTML = wordsHtml(q); bindWords(view, q); }
    else if (sub === "affixes") view.innerHTML = affixesHtml();
  }
  function bindWords(view, q) {
    const go = nq => { tbl.shown = 100; location.hash = "#/x/words" + (Object.keys(nq).length ? "?" + new URLSearchParams(Object.entries(nq).filter(([, v]) => v)) : ""); };
    view.querySelector("#wtext").addEventListener("change", e => go({ ...q, text: e.target.value.trim() }));
    view.querySelectorAll("select[data-f]").forEach(s => s.addEventListener("change", e => go({ ...q, [s.dataset.f]: e.target.value })));
    view.querySelector('input[data-f="parts"]').addEventListener("change", e => go({ ...q, parts: e.target.checked ? "1" : "" }));
    view.querySelectorAll("[data-clear]").forEach(b => b.addEventListener("click", () => { const nq = { ...q }; delete nq[b.dataset.clear]; go(nq); }));
    view.querySelectorAll("[data-sort]").forEach(b => b.addEventListener("click", () => { tbl.dir = tbl.sort === b.dataset.sort ? -tbl.dir : 1; tbl.sort = b.dataset.sort; show(view, "words", new URLSearchParams(q).toString()); }));
    view.querySelector("#more")?.addEventListener("click", () => { tbl.shown += 200; show(view, "words", new URLSearchParams(q).toString()); });
  }
  document.addEventListener("click", e => {
    const oc = e.target.closest("[data-origin]");
    if (oc) { const i = +oc.dataset.origin; mapState.origins.has(i) ? mapState.origins.delete(i) : mapState.origins.add(i); oc.setAttribute("aria-pressed", mapState.origins.has(i)); drawMap(); return; }
    const mf = e.target.closest("[data-mapfocus]"); if (mf) { e.preventDefault(); mapState.focus?.(+mf.dataset.mapfocus); return; }
    if (e.target.id === "mapReset") mapState.reset?.();
  });
  document.addEventListener("change", e => {
    if (e.target.id === "mapSingles") { mapState.hideSingles = e.target.checked; drawMap(); }
    if (e.target.id === "mapEdges") { mapState.showEdges = e.target.checked; drawMap(); }
    if (e.target.id === "mapFind") {
      const i = X?.wordIdx.get(e.target.value.trim().toLowerCase());
      if (i === undefined) { e.target.setCustomValidity("Not a game word"); e.target.reportValidity(); return; }
      e.target.setCustomValidity("");
      const fi = X.words[i][1], f = X.families[fi];
      mapState.origins.add(f[4]); if (f[2] < 2 && !X.linked.has(f[0])) { mapState.hideSingles = false; const cb = document.getElementById("mapSingles"); if (cb) cb.checked = false; }
      drawMap(); mapState.focus(fi);
    }
  });
  window.addEventListener("resize", () => { if (document.getElementById("map")) drawMap(); });
  return { show };
})();
