// Urwort Graph Viewer: browse and review data/urwort-v4.json (pipeline-v2).
// Review marks are stored in this browser (localStorage) and exported as JSON.
"use strict";
const SRC_NAMES = {
  "wikt_en": "en Wiktionary", "wikt_en:entry": "en Wiktionary", "wikt_en:reconstruction": "reconstruction page",
  "wikt_en:category": "en Wiktionary category", "wikt_de": "de Wiktionary", derivbase: "DErivBase", morphynet: "MorphyNet",
  iecor: "IE-CoR", dib: "Deutsch im Blick", merlin: "MERLIN", subs2: "subtitles"
};
const STATUS_TEXT = { verified: "verified (2+ sources)", doubted: "doubted by IE-CoR", conflict: "sources disagree", single_source: "single source" };
let D, F, W, BR, byWord, bridgesByWord, bridgesInto;
let review = load();
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function load() { try { return JSON.parse(localStorage.getItem("urwort-review") || "{}"); } catch { return {}; } }
function save() { try { localStorage.setItem("urwort-review", JSON.stringify(review)); } catch {} $("#reviewCount").textContent = Object.keys(review).length; }

function pills(sources, indirect) {
  if (indirect) return '<span class="pill s1" title="In the family through another member or a link in the other direction; no direct link to this base">indirect</span>';
  if (!sources || !sources.length) return '<span class="pill bad">no source</span>';
  const cls = sources.length >= 2 ? "s2" : "s1";
  return sources.map(s => `<span class="pill ${cls}" title="${esc(s)}">${esc(SRC_NAMES[s] || s)}</span>`).join("");
}
function segs(w) {
  const s = W[w].segments;
  if (!s || s.length < 2) return "";
  return `<span class="segs" title="word parts">${s.map(x => `<span class="${x.type}" title="${x.type}${x.function ? ": " + esc(x.function) : ""}">${esc(x.form)}</span>`).join("")}</span>`;
}
function reviewBtns(key, label) {
  const v = review[key]?.verdict;
  return `<span class="review" data-key="${esc(key)}" data-label="${esc(label)}">
    <button data-v="ok" ${v === "ok" ? 'data-on="ok"' : ""} aria-label="Mark correct: ${esc(label)}">✓</button>
    <button data-v="bad" ${v === "bad" ? 'data-on="bad"' : ""} aria-label="Mark wrong: ${esc(label)}">✗</button></span>`;
}

const FILTERS = {
  "all": ["All", f => true],
  "multi": ["2+ words", f => f.members.length > 1],
  "weak": ["Single-source links", f => f.members.some(m => W[m].base && (W[m].base_sources || []).length === 1)],
  "pie": ["PIE verified", f => f.pie?.status === "verified"],
  "pieq": ["PIE hidden", f => f.pie && f.pie.status !== "verified"],
  "nohist": ["No history", f => !f.history.length && !f.borrowed_from],
  "loan": ["Loanwords", f => !!f.borrowed_from],
  "reviewed": ["Reviewed", f => Object.keys(review).some(k => k.startsWith(f.id + ":"))],
};
let filter = "multi";

function renderStats() {
  const v = D.families.filter(f => f.pie?.status === "verified").length;
  $("#stats").innerHTML = [
    [Object.keys(W).length.toLocaleString(), "words"], [D.families.length.toLocaleString(), "families"],
    [D.families.filter(f => f.members.length > 1).length, "with 2+ words"], [D.bridges.length, "compound bridges"], [v, "verified PIE"]
  ].map(([b, s]) => `<div class="stat"><b>${b}</b><span class="small muted">${s}</span></div>`).join("");
  $("#filters").innerHTML = Object.entries(FILTERS).map(([k, [label]]) =>
    `<button data-f="${k}" aria-pressed="${k === filter}">${label}</button>`).join("");
}

function renderList(currentId) {
  const sort = $("#sort").value;
  let fs = D.families.filter(FILTERS[filter][1]);
  if (sort === "size") fs = fs.slice().sort((a, b) => b.size_full - a.size_full);
  if (sort === "alpha") fs = fs.slice().sort((a, b) => a.root.localeCompare(b.root, "de"));
  $("#famlist").innerHTML = fs.slice(0, 400).map(f =>
    `<li data-id="${f.id}" ${f.id === currentId ? 'aria-current="true"' : ""}><span class="de">${esc(f.root)}</span>
     <span class="small muted">${f.members.length}${f.size_full > f.members.length ? " / " + f.size_full : ""}${f.pie?.status === "verified" ? " · PIE" : ""}</span></li>`).join("")
    + (fs.length > 400 ? `<li class="small muted">… ${fs.length - 400} more, use search</li>` : "")
    + (!fs.length ? '<li class="small muted">No families match this filter.</li>' : "");
}

function treeHtml(f) {
  const kids = {};
  for (const m of f.members) { const b = W[m].base; if (b && f.members.includes(b)) (kids[b] ||= []).push(m); }
  const node = w => {
    const d = W[w], label = d.base ? `${d.base} → ${w}` : `${w} (root)`;
    const forms = d.forms ? Object.entries(d.forms).map(([k, v]) => `<span class="pill" title="${esc(k)}">${esc(k === "gender" ? { m: "der", f: "die", n: "das" }[v] || v : v)}</span>`).join("") : "";
    return `<li><div class="node">
      <span class="lemma de" data-word="${esc(w)}">${esc(w)}</span> ${segs(w)}
      <span class="pill">${esc(d.pos || "")}</span>${d.level ? `<span class="pill lv" title="estimated level · evidence: ${esc(JSON.stringify(d.level_evidence))}">${d.level}</span>` : ""}${forms}
      ${d.base ? `<span class="small muted">from <span class="de">${esc(d.base)}</span></span> ${pills(d.base_sources, !d.base_sources)}` : ""}
      ${d.base ? reviewBtns(`${f.id}:link:${d.base}>${w}`, label) : ""}
      <div class="gloss">${esc((d.gloss_en || []).slice(0, 2).join("; "))}${d.gloss_de?.length ? ` · <span lang="de">${esc(d.gloss_de[0])}</span>` : ""}</div>
    </div>${kids[w] ? `<ul>${kids[w].sort((a, b) => (W[a].rank || 1e9) - (W[b].rank || 1e9)).map(node).join("")}</ul>` : ""}</li>`;
  };
  const roots = f.members.filter(m => !W[m].base || !f.members.includes(W[m].base));
  return `<ul class="tree">${roots.map(node).join("")}</ul>`;
}

function historyHtml(f) {
  let h = "";
  if (f.history.length) {
    h += `<div class="strata">${f.history.map(s => `<div class="stage"><span class="lang">${esc(s.lang)}</span>
      <span><span class="recon">${esc(s.form)}</span>${s.gloss ? ` <span class="small muted">‘${esc(s.gloss)}’</span>` : ""}${s.origin_uncertain ? ' <span class="pill bad">origin beyond uncertain</span>' : ""}<br>${pills(s.sources)}</span>
      ${reviewBtns(`${f.id}:stage:${s.stage}`, `${f.root}: ${s.lang} ${s.form}`)}</div>`).join("")}</div>`;
  } else h += '<p class="small muted">No inherited history recorded for this root.</p>';
  if (f.borrowed_from) h += `<p>Loan from ${esc(f.borrowed_from.lang)} ${f.borrowed_from.form ? `<span class="de">${esc(f.borrowed_from.form)}</span>` : ""} ${pills(f.borrowed_from.sources)} ${reviewBtns(`${f.id}:loan`, `${f.root}: loan from ${f.borrowed_from.lang}`)}</p>`;
  if (f.pie) {
    const shown = f.pie.status === "verified";
    h += `<h3>Proto-Indo-European</h3><p><span class="recon">${esc(f.pie.form)}</span> <span class="pill ${shown ? "s2" : "bad"}">${esc(STATUS_TEXT[f.pie.status] || f.pie.status)}</span>
      <span class="small muted">${shown ? "shown in game" : "hidden in game"}</span> ${reviewBtns(`${f.id}:pie`, `${f.root}: PIE ${f.pie.form}`)}</p>
      <div class="scroll"><table><tr><th>Source</th><th>Claim</th></tr>${Object.entries(f.pie.claims).map(([s, v]) =>
        `<tr><td>${esc(SRC_NAMES[s] || s)}${f.pie.agreeing.includes(s) ? ' <span class="pill s2">agrees</span>' : ""}</td><td class="recon">${esc(v)}</td></tr>`).join("")}</table></div>
      ${f.pie.iecor_comment ? `<p class="small muted">IE-CoR note: ${esc(f.pie.iecor_comment)}</p>` : ""}`;
  }
  const cog = Object.entries(f.cognates || {});
  if (cog.length) h += `<h3>Cognates</h3><p>${cog.map(([l, c]) => `${esc(l)} <span class="de">${esc(c.form)}</span> ${pills(c.sources)}`).join(" · ")}</p>`;
  return h;
}

function bridgesHtml(f) {
  const own = f.members.flatMap(m => bridgesByWord[m] || []);
  const into = f.members.flatMap(m => (bridgesInto[m] || []).filter(b => !f.members.includes(b.word)));
  const row = b => `<tr><td><span class="lemma de" data-word="${esc(b.word)}">${esc(b.word)}</span></td>
    <td>${b.modifiers.map(m => `<span class="lemma de" data-word="${esc(m)}">${esc(m)}</span>`).join(" + ") || "—"} + <b>${b.head ? `<span class="lemma de" data-word="${esc(b.head)}">${esc(b.head)}</span>` : "—"}</b></td>
    <td>${pills(b.sources)}</td><td>${reviewBtns(`${f.id}:bridge:${b.word}`, `compound ${b.word}`)}</td></tr>`;
  if (!own.length && !into.length) return '<p class="small muted">No compound bridges among the exported words.</p>';
  return `<div class="scroll"><table><tr><th>Compound</th><th>Modifier(s) + head</th><th>Sources</th><th></th></tr>${[...own, ...into.slice(0, 30)].map(row).join("")}</table></div>`;
}

function drawGraph(f) {
  const el = $("#graph"); if (!el || !window.d3) return;
  const nodes = new Map(), links = [];
  const add = (id, group) => { if (!nodes.has(id)) nodes.set(id, { id, group }); };
  f.members.forEach(m => add(m, "member"));
  f.members.forEach(m => { const b = W[m].base; if (b && f.members.includes(b)) links.push({ source: b, target: m, kind: "deriv", n: (W[m].base_sources || []).length }); });
  const bs = f.members.flatMap(m => [...(bridgesByWord[m] || []), ...(bridgesInto[m] || [])]).slice(0, 40);
  for (const b of bs) {
    add(b.word, f.members.includes(b.word) ? "member" : "compound");
    for (const p of [...b.modifiers, b.head].filter(Boolean)) { add(p, f.members.includes(p) ? "member" : "other"); links.push({ source: p, target: b.word, kind: "bridge", n: b.sources.length }); }
  }
  const W_ = el.clientWidth || 600, H = 420;
  const svg = d3.select(el).attr("viewBox", [0, 0, W_, H]); svg.selectAll("*").remove();
  const css = getComputedStyle(document.documentElement), col = v => css.getPropertyValue(v).trim();
  const sim = d3.forceSimulation([...nodes.values()])
    .force("link", d3.forceLink(links).id(d => d.id).distance(d => d.kind === "bridge" ? 90 : 60))
    .force("charge", d3.forceManyBody().strength(-220)).force("center", d3.forceCenter(W_ / 2, H / 2))
    .force("collide", d3.forceCollide(28));
  const g = svg.append("g");
  svg.call(d3.zoom().scaleExtent([.3, 3]).on("zoom", e => g.attr("transform", e.transform)));
  const link = g.append("g").selectAll("line").data(links).join("line")
    .attr("stroke", d => d.kind === "bridge" ? col("--stratum") : col("--accent"))
    .attr("stroke-width", d => d.n >= 2 ? 2 : 1).attr("stroke-dasharray", d => d.kind === "bridge" ? "4 3" : null);
  const node = g.append("g").selectAll("g").data([...nodes.values()]).join("g").style("cursor", "pointer")
    .on("click", (e, d) => { if (W[d.id]) go(d.id); })
    .call(d3.drag().on("start", (e, d) => { if (!e.active) sim.alphaTarget(.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; }).on("end", (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = d.fy = null; }));
  node.append("circle").attr("r", d => d.id === f.root ? 9 : 6)
    .attr("fill", d => d.group === "member" ? col("--accent") : d.group === "compound" ? col("--stratum") : col("--muted"));
  node.append("text").attr("x", 10).attr("y", 4).text(d => d.id);
  sim.on("tick", () => {
    link.attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
    node.attr("transform", d => `translate(${d.x},${d.y})`);
  });
}

function showFamily(f, focusWord) {
  const note = review[`${f.id}:note`]?.note || "";
  $("#detail").innerHTML = `
    <div><h2><span class="de">${esc(f.root)}</span> family</h2>
    <p class="small muted">${f.members.length} words at this level · ${f.size_full} in the full lexicon · history from <span class="de">${esc(f.history_from)}</span>
    · <a href="https://en.wiktionary.org/wiki/${encodeURIComponent(f.root)}#German" target="_blank" rel="noopener">Wiktionary</a>
    · <a href="https://de.wiktionary.org/wiki/${encodeURIComponent(f.root)}" target="_blank" rel="noopener">de.wiktionary</a>
    · <a href="https://www.dwds.de/wb/${encodeURIComponent(f.root)}" target="_blank" rel="noopener">DWDS</a></p>
    ${reviewBtns(`${f.id}:family`, `${f.root}: family grouping`)} <span class="small muted">family grouping as a whole</span></div>
    <h3>Words and derivation links</h3>${treeHtml(f)}
    <h3>History (underground)</h3>${historyHtml(f)}
    <h3>Compound bridges</h3>${bridgesHtml(f)}
    <h3>Graph</h3><p class="small muted">Teal: this family (thick line = 2+ sources). Ochre dashed: compound bridges to other families. Drag, zoom, tap a word to open it.</p>
    <svg id="graph" role="img" aria-label="Family graph"></svg>
    <h3>Your note on this family</h3><textarea id="note" rows="2" placeholder="Anything wrong or missing?">${esc(note)}</textarea>`;
  $("#note").addEventListener("change", e => { const v = e.target.value.trim(); if (v) review[`${f.id}:note`] = { note: v, label: f.root, at: new Date().toISOString() }; else delete review[`${f.id}:note`]; save(); });
  drawGraph(f);
  renderList(f.id);
  if (focusWord) { const el = [...document.querySelectorAll(".node .lemma")].find(x => x.dataset.word === focusWord); el?.closest(".node")?.scrollIntoView({ block: "center" }); el?.closest(".node")?.animate([{ background: "var(--accent-soft)" }, { background: "transparent" }], 1800); }
}

function go(word) {
  const w = W[word] ? word : Object.keys(W).find(k => k.toLowerCase() === word.toLowerCase());
  if (!w) { $("#detail").innerHTML = `<p>No exported word <span class="de">${esc(word)}</span>. The viewer covers the ${Object.keys(W).length.toLocaleString()} most frequent words.</p>`; return; }
  try { history.replaceState(null, "", "#" + encodeURIComponent(w)); } catch {}
  showFamily(F[W[w].family], w);
}

function showReview() {
  const items = Object.entries(review);
  $("#detail").innerHTML = `<h2>Your review</h2>
    <p class="small muted">Marks are saved in this browser only. Export them and send the file to Claude to apply the fixes.</p>
    <p><button id="exp">Export review (JSON)</button> <button id="clr">Clear all</button></p>
    ${items.length ? `<div class="scroll"><table><tr><th>Item</th><th>Verdict</th><th>Note</th></tr>${items.map(([k, v]) =>
      `<tr><td>${esc(v.label || k)}</td><td>${v.verdict === "ok" ? "✓" : v.verdict === "bad" ? "✗" : ""}</td><td>${esc(v.note || "")}</td></tr>`).join("")}</table></div>` : '<p class="muted">No marks yet. Use ✓ / ✗ on links, stages and bridges.</p>'}`;
  $("#exp").onclick = () => {
    const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), data_generated: D.generated, review }, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `urwort-review-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  $("#clr").onclick = () => { if ($("#clr").dataset.armed) { review = {}; save(); showReview(); } else { $("#clr").dataset.armed = 1; $("#clr").textContent = "Tap again to clear"; } };
}

document.addEventListener("click", e => {
  const b = e.target.closest(".review button");
  if (b) {
    const wrap = b.closest(".review"), key = wrap.dataset.key, v = b.dataset.v;
    if (review[key]?.verdict === v) delete review[key]; else review[key] = { verdict: v, label: wrap.dataset.label, at: new Date().toISOString(), note: review[key]?.note };
    wrap.querySelectorAll("button").forEach(x => { if (review[key]?.verdict === x.dataset.v) x.dataset.on = x.dataset.v; else delete x.dataset.on; });
    save(); return;
  }
  const w = e.target.closest("[data-word]"); if (w) { go(w.dataset.word); window.scrollTo({ top: 0 }); return; }
  const li = e.target.closest("#famlist li[data-id]"); if (li) { showFamily(F[li.dataset.id]); return; }
  const fb = e.target.closest("#filters button"); if (fb) { filter = fb.dataset.f; renderStats(); renderList(); }
});
$("#sort").addEventListener("change", () => renderList());
$("#q").addEventListener("change", e => e.target.value.trim() && go(e.target.value.trim()));
$("#q").addEventListener("keydown", e => { if (e.key === "Enter" && e.target.value.trim()) go(e.target.value.trim()); });
$("#reviewBtn").addEventListener("click", showReview);

fetch("data/urwort-v4.json").then(r => r.json()).then(data => {
  D = data; W = data.words; F = Object.fromEntries(data.families.map(f => [f.id, f]));
  bridgesByWord = {}; bridgesInto = {};
  for (const b of data.bridges) {
    (bridgesByWord[b.word] ||= []).push(b);
    for (const p of [...b.modifiers, b.head].filter(Boolean)) (bridgesInto[p] ||= []).push(b);
  }
  $("#words").innerHTML = Object.keys(W).sort((a, b) => (W[a].rank || 1e9) - (W[b].rank || 1e9)).slice(0, 5200).map(w => `<option value="${esc(w)}">`).join("");
  renderStats(); renderList(); save();
  const h = decodeURIComponent(location.hash.slice(1));
  go(h && W[h] ? h : "fahren");
}).catch(err => { $("#detail").innerHTML = `<p>Could not load the data (${esc(err.message)}).</p>`; });
