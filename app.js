/* Roteiros células One Flow — biblioteca de roteiros de estudo bíblico
   Login, banco e PDFs: Supabase. Leitura de PDF: pdf.js. PDF gerado: jsPDF. */
(() => {
  const $ = id => document.getElementById(id);
  const cfg = window.ROTEIROS_CONFIG || {};
  const configured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey) && !/COLE_AQUI/.test(cfg.supabaseUrl + cfg.supabaseAnonKey);
  if (!configured || !window.supabase) { $("setup").hidden = false; return; }

  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const BUCKET = "roteiros-pdf";

  // ---------- Livros da Bíblia (ordem canônica protestante) ----------
  const BOOKS = [
    ["Gênesis","Gn",["Genesis"]],["Êxodo","Êx",["Ex","Exodo"]],["Levítico","Lv",[]],["Números","Nm",[]],["Deuteronômio","Dt",[]],
    ["Josué","Js",[]],["Juízes","Jz",[]],["Rute","Rt",[]],["1 Samuel","1Sm",[]],["2 Samuel","2Sm",[]],["1 Reis","1Rs",[]],["2 Reis","2Rs",[]],
    ["1 Crônicas","1Cr",[]],["2 Crônicas","2Cr",[]],["Esdras","Ed",["Esd"]],["Neemias","Ne",[]],["Ester","Et",[]],["Jó","Jó",[]],
    ["Salmos","Sl",["Salmo"]],["Provérbios","Pv",[]],["Eclesiastes","Ec",[]],["Cânticos","Ct",["Cântico dos Cânticos","Cantares"]],
    ["Isaías","Is",[]],["Jeremias","Jr",[]],["Lamentações","Lm",[]],["Ezequiel","Ez",[]],["Daniel","Dn",[]],["Oseias","Os",["Oséias"]],
    ["Joel","Jl",[]],["Amós","Am",[]],["Obadias","Ob",[]],["Jonas","Jn",[]],["Miqueias","Mq",["Miquéias"]],["Naum","Na",[]],
    ["Habacuque","Hc",[]],["Sofonias","Sf",[]],["Ageu","Ag",[]],["Zacarias","Zc",[]],["Malaquias","Ml",[]],
    ["Mateus","Mt",[]],["Marcos","Mc",[]],["Lucas","Lc",[]],["João","Jo",[]],["Atos","At",["Atos dos Apóstolos"]],["Romanos","Rm",[]],
    ["1 Coríntios","1Co",[]],["2 Coríntios","2Co",[]],["Gálatas","Gl",[]],["Efésios","Ef",[]],["Filipenses","Fp",[]],["Colossenses","Cl",[]],
    ["1 Tessalonicenses","1Ts",[]],["2 Tessalonicenses","2Ts",[]],["1 Timóteo","1Tm",[]],["2 Timóteo","2Tm",[]],["Tito","Tt",[]],
    ["Filemom","Fm",["Filemon"]],["Hebreus","Hb",[]],["Tiago","Tg",[]],["1 Pedro","1Pe",[]],["2 Pedro","2Pe",[]],
    ["1 João","1Jo",[]],["2 João","2Jo",[]],["3 João","3Jo",[]],["Judas","Jd",[]],["Apocalipse","Ap",[]]
  ];
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const key = s => String(s || "").toLowerCase().replace(/[\s.]/g, "");
  const exactMap = new Map(), normMap = new Map();
  BOOKS.forEach(([name, abbr, alts], i) => [name, abbr, ...alts].forEach(n => { if (!exactMap.has(key(n))) exactMap.set(key(n), i); }));
  BOOKS.forEach(([name, , alts], i) => [name, ...alts].forEach(n => { if (!normMap.has(norm(key(n)))) normMap.set(norm(key(n)), i); }));
  BOOKS.forEach(([, abbr], i) => { if (!normMap.has(norm(key(abbr)))) normMap.set(norm(key(abbr)), i); });

  function parsePassage(p) {
    const m = String(p || "").match(/^\s*([1-3]?\s*[^\d:;,]+)(\d+)?(?:\s*[:.]\s*(\d+))?/);
    if (!m) return null;
    const k = key(m[1]);
    let idx = exactMap.get(k);
    if (idx === undefined) idx = normMap.get(norm(k));
    if (idx === undefined) return null;
    return { idx, book: BOOKS[idx][0], t: idx < 39 ? "AT" : "NT", ch: +(m[2] || 0), v: +(m[3] || 0) };
  }

  // ---------- Estado ----------
  let session = null, started = false, isAdmin = false, area = "usuario", readOnly = false;
  let needNewPass = /type=(invite|recovery)/.test(location.hash);
  let items = [], loaded = false, loadNote = "", lastLoad = 0, firstHash = true;
  let testament = "", sortBy = "recentes", mode = "busca", selTags = new Set(), tagSort = "az";
  try { sortBy = localStorage.getItem("bib-sort") || "recentes"; } catch (e) {}
  const canWriteNow = () => isAdmin && area === "admin" && !readOnly;

  const qEl = $("q"), listEl = $("list"), tagIndex = $("tagindex"), dlg = $("dlg"), inner = $("dlg-inner");
  $("sort").value = sortBy;

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = n => "Nº " + String(n || 0).padStart(3, "0");
  const fmtDate = iso => { try { return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }); } catch (e) { return ""; } };
  const parseTags = s => [...new Set(String(s || "").split(/[\s,;]+/).map(t => t.replace(/^#+/, "").trim().toLowerCase()).filter(Boolean))];

  const fromRow = r => {
    const it = {
      id: r.id, numero: r.numero, titulo: r.titulo || "", passagem: r.passagem || "", tags: r.tags || [],
      resumo: r.resumo || "", roteiro: r.roteiro || "", textoPdf: r.texto_pdf || "",
      criadoEm: r.criado_em, atualizadoEm: r.atualizado_em,
      pdf: r.pdf_path ? { path: r.pdf_path, nome: r.pdf_nome, tamanho: r.pdf_tamanho, paginas: r.pdf_paginas } : null
    };
    it._p = parsePassage(it.passagem);
    return it;
  };

  // ---------- Telas e login ----------
  function show(screen) { ["setup", "login", "newpass", "app"].forEach(id => { $(id).hidden = id !== screen; }); }

  async function onSession(s) {
    session = s;
    if (!s) { started = false; isAdmin = false; items = []; loaded = false; if (dlg.open) closeDlg(); show("login"); return; }
    if (needNewPass) { show("newpass"); return; }
    if (started) return;
    started = true;
    show("app");
    const { data, error } = await sb.rpc("is_admin");
    isAdmin = !error && data === true;
    let saved = null;
    try { saved = localStorage.getItem("bib-area"); } catch (e) {}
    area = isAdmin && saved !== "usuario" ? "admin" : "usuario";
    renderAccount();
    await loadItems();
  }
  sb.auth.onAuthStateChange((event, s) => {
    if (event === "PASSWORD_RECOVERY") needNewPass = true;
    setTimeout(() => onSession(s), 0); // fora do callback, como recomenda o supabase-js
  });

  $("login-form").addEventListener("submit", async e => {
    e.preventDefault();
    const msg = $("login-msg"), btn = $("login-btn");
    const email = $("l-email").value.trim(), password = $("l-pass").value;
    if (!email || !password) { msg.textContent = "Preencha o e-mail e a senha."; return; }
    msg.textContent = ""; btn.disabled = true; btn.textContent = "Entrando…";
    const { error } = await sb.auth.signInWithPassword({ email, password });
    btn.disabled = false; btn.textContent = "Entrar";
    if (error) {
      msg.textContent = /invalid/i.test(error.message) ? "E-mail ou senha incorretos."
        : /confirm/i.test(error.message) ? "Este e-mail ainda não foi confirmado. Fale com o administrador."
        : "Não foi possível entrar agora. Verifique a internet e tente de novo.";
    } else $("l-pass").value = "";
  });
  $("forgot").addEventListener("click", async () => {
    const email = $("l-email").value.trim(), msg = $("login-msg");
    if (!email) { msg.textContent = "Digite seu e-mail acima e clique de novo em “Esqueci minha senha”."; $("l-email").focus(); return; }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    msg.textContent = error
      ? (/rate|seconds|limit/i.test(error.message) ? "Muitos pedidos seguidos. Espere alguns minutos e tente de novo." : "Não foi possível enviar o e-mail agora.")
      : "Se este e-mail estiver cadastrado, você vai receber um link para criar uma nova senha.";
  });

  function checkNewPass(a, b) {
    if (a.length < 8) return "Use pelo menos 8 caracteres.";
    if (a !== b) return "As duas senhas não são iguais.";
    return "";
  }
  $("np-form").addEventListener("submit", async e => {
    e.preventDefault();
    const msg = $("np-msg"), btn = $("np-btn");
    const bad = checkNewPass($("np-pass").value, $("np-pass2").value);
    if (bad) { msg.textContent = bad; return; }
    btn.disabled = true;
    const { error } = await sb.auth.updateUser({ password: $("np-pass").value });
    btn.disabled = false;
    if (error) { msg.textContent = "Não foi possível salvar a senha. Abra de novo o link que chegou por e-mail."; return; }
    needNewPass = false;
    try { history.replaceState(null, "", location.pathname + location.search); } catch (x) {}
    toast("Senha salva");
    const { data } = await sb.auth.getSession();
    onSession(data.session);
  });
  $("logout").addEventListener("click", async () => { await sb.auth.signOut(); toast("Você saiu da biblioteca"); });
  $("changepass").addEventListener("click", openPass);

  // ---------- Conta e áreas ----------
  function renderAccount() {
    const email = session?.user?.email || "";
    $("who-avatar").textContent = (email[0] || "?");
    $("who-name").textContent = email || "Você";
    $("who-role").textContent = isAdmin ? "Administrador" : "Leitor";
    $("who-role").className = "role" + (isAdmin ? " admin" : "");
    $("areaseg").hidden = !isAdmin;
    $("areainfo").hidden = isAdmin;
    document.querySelectorAll("[data-area]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.area === area)));
  }
  document.querySelectorAll("[data-area]").forEach(b => b.addEventListener("click", () => {
    if (!isAdmin || area === b.dataset.area) return;
    area = b.dataset.area;
    try { localStorage.setItem("bib-area", area); } catch (e) {}
    if (dlg.open) closeDlg();
    renderAccount(); render();
    toast(area === "admin" ? "Área do admin: você pode adicionar e excluir roteiros" : "Área do usuário: leitura e download");
  }));

  // ---------- Dados ----------
  async function loadItems() {
    if (!loaded) { loadNote = "Carregando roteiros…"; render(); }
    const { data, error } = await sb.from("roteiros").select("*").order("numero", { ascending: true }).limit(2000);
    if (error) {
      if (!loaded) { loadNote = "Não foi possível carregar os roteiros. Verifique a internet e recarregue a página."; render(); }
      return;
    }
    items = data.map(fromRow); loaded = true; loadNote = ""; lastLoad = Date.now();
    render();
    if (openId && dlg.open && !$("form") && !$("passform")) {
      const cur = items.find(x => x.id === openId);
      if (!cur) closeDlg(); else if (sig(cur) !== openSig) openRead(openId);
    }
    if (firstHash) { firstHash = false; openFromHash(); }
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && session && started && !importing && Date.now() - lastLoad > 60000) loadItems();
  });

  function errMsg(ex) {
    const e = ex?.error || ex || {};
    const m = String(e.message || ""), st = String(e.statusCode || e.status || "");
    if (st === "413" || /too large|maximum allowed size|exceeded/i.test(m)) return "O PDF passa de 20 MB. Comprima o arquivo e tente de novo.";
    if (/mime/i.test(m)) return "Esse arquivo não é um PDF válido.";
    if (e.code === "42501" || st === "403" || /row-level security|unauthorized|permission/i.test(m)) return "Seu usuário não tem permissão de administrador para salvar roteiros.";
    if (/fetch|network/i.test(m)) return "Sem conexão. Verifique a internet e tente de novo.";
    return "Não foi possível salvar agora. Tente de novo.";
  }
  const isPermErr = ex => { const e = ex?.error || ex || {}; return e.code === "42501" || String(e.statusCode || "") === "403" || /row-level security/i.test(String(e.message || "")); };
  const newPath = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2)) + ".pdf";
  async function uploadPdf(file) {
    const path = newPath();
    const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: "application/pdf", upsert: false });
    if (error) throw { error };
    return path;
  }
  const removePdf = path => path ? sb.storage.from(BUCKET).remove([path]).catch(() => {}) : null;

  // ---------- Busca ----------
  function parseQuery(q) {
    const tags = [], nums = [], words = [];
    String(q || "").trim().split(/\s+/).filter(Boolean).forEach(tok => {
      if (tok.startsWith("#")) {
        const t = norm(tok.slice(1));
        if (!t) return;
        if (/^\d+$/.test(t)) nums.push(+t); else tags.push(t);
      } else words.push(norm(tok));
    });
    return { tags, nums, words };
  }
  function matches(it, pq) {
    if (testament && it._p?.t !== testament) return false;
    if (mode === "temas") {
      for (const t of selTags) if (!(it.tags || []).includes(t)) return false;
      return true;
    }
    if (pq.nums.length && !pq.nums.includes(+it.numero)) return false;
    for (const t of pq.tags) if (!(it.tags || []).some(tag => norm(tag).startsWith(t))) return false;
    if (pq.words.length) {
      const hay = norm([it.titulo, it.passagem, it._p?.book, BOOKS[it._p?.idx]?.[1], it.resumo, it.roteiro, it.textoPdf].join(" "));
      for (const w of pq.words) if (!hay.includes(w)) return false;
    }
    return true;
  }
  function highlight(text, words) {
    const s = String(text || "");
    if (!words.length) return esc(s);
    const chars = [...s], base = chars.map(ch => norm(ch)), flat = base.join("");
    const marks = new Array(chars.length).fill(false);
    words.forEach(w => {
      if (!w) return;
      let from = 0, pos;
      while ((pos = flat.indexOf(w, from)) !== -1) {
        let acc = 0;
        base.forEach((b, i) => { const st = acc; acc += b.length; if (acc > pos && st < pos + w.length) marks[i] = true; });
        from = pos + w.length;
      }
    });
    let out = "", open = false;
    chars.forEach((ch, i) => {
      if (marks[i] && !open) { out += "<mark>"; open = true; }
      if (!marks[i] && open) { out += "</mark>"; open = false; }
      out += esc(ch);
    });
    return out + (open ? "</mark>" : "");
  }
  function sorted(list, pq) {
    const arr = list.slice();
    const cmp = {
      recentes: (a, b) => String(b.criadoEm || "").localeCompare(String(a.criadoEm || "")),
      nome: (a, b) => String(a.titulo || "").localeCompare(String(b.titulo || ""), "pt-BR"),
      numero: (a, b) => (a.numero || 0) - (b.numero || 0),
      biblica: (a, b) => ((a._p?.idx ?? 99) - (b._p?.idx ?? 99)) || ((a._p?.ch || 0) - (b._p?.ch || 0)) || ((a._p?.v || 0) - (b._p?.v || 0))
    }[sortBy] || (() => 0);
    arr.sort(cmp);
    if (pq.words.length) {
      const inTitle = it => pq.words.every(w => norm(it.titulo).includes(w));
      arr.sort((a, b) => (inTitle(b) ? 1 : 0) - (inTitle(a) ? 1 : 0));
    }
    return arr;
  }

  // ---------- Renderização ----------
  function render() {
    const q = qEl.value;
    $("clear").hidden = !q;
    const pq = mode === "busca" ? parseQuery(q) : { tags: [], nums: [], words: [] };
    $("new").hidden = !canWriteNow();
    $("import").hidden = !canWriteNow();

    const counts = new Map();
    items.forEach(it => (it.tags || []).forEach(t => counts.set(t, (counts.get(t) || 0) + 1)));
    $("stats").textContent = !loaded ? (loadNote || "Carregando a biblioteca…")
      : `${items.length} ${items.length === 1 ? "roteiro" : "roteiros"} · ${counts.size} ${counts.size === 1 ? "tema" : "temas"}`;
    selTags.forEach(t => { if (loaded && !counts.has(t)) selTags.delete(t); });
    renderTags(counts);

    if (!loaded) {
      listEl.innerHTML = `<div class="empty"><strong>${esc(loadNote || "Carregando roteiros…")}</strong></div>`;
      $("count").textContent = "";
      return;
    }
    if (!items.length) {
      listEl.innerHTML = `<div class="empty"><strong>A estante ainda está vazia</strong><span>${canWriteNow() ? "Cada roteiro guarda título, passagem, temas com # e o estudo completo, ou um PDF pronto." : "Os roteiros aparecem aqui assim que um administrador adicionar o primeiro."}</span>${canWriteNow() ? '<button class="btn primary" type="button" data-act="new">+ Adicionar o primeiro roteiro</button>' : ""}</div>`;
      $("count").textContent = "";
      return;
    }
    const shown = sorted(items.filter(it => matches(it, pq)), pq);
    $("count").textContent = shown.length === items.length ? `${items.length} ${items.length === 1 ? "roteiro" : "roteiros"}` : `Mostrando ${shown.length} de ${items.length}`;
    if (!shown.length) {
      listEl.innerHTML = `<div class="empty"><strong>Nenhum roteiro encontrado</strong><span>Tente outro termo, menos temas, ou limpe a busca.</span><button class="btn" type="button" data-act="clear">Limpar busca</button></div>`;
      return;
    }
    listEl.innerHTML = `<div class="grid">${shown.map(it => `
      <button type="button" class="card" data-id="${esc(it.id)}">
        <span class="card-top"><span class="num">${pad(it.numero)}</span><span class="right">${it.pdf ? '<span class="pdfbadge">PDF</span>' : ""}<span class="testament">${it._p ? (it._p.t === "AT" ? "ANTIGO T." : "NOVO T.") : ""}</span></span></span>
        <h2>${highlight(it.titulo, pq.words)}</h2>
        ${it.passagem ? `<span class="ref">${highlight(it.passagem, pq.words)}</span>` : ""}
        ${it.resumo ? `<p class="resumo">${highlight(it.resumo, pq.words)}</p>` : it.textoPdf ? `<p class="resumo">${highlight(it.textoPdf.slice(0, 220), pq.words)}</p>` : ""}
        ${(it.tags || []).length ? `<span class="mini">${it.tags.map(t => "#" + esc(t)).join(" ")}</span>` : ""}
      </button>`).join("")}</div>`;
  }

  function renderTags(counts) {
    const tc = $("tagcount");
    tc.textContent = counts.size; tc.hidden = !counts.size;
    $("selected").innerHTML = selTags.size
      ? `<span class="sel-label">Roteiros com:</span>` +
        [...selTags].map(t => `<button type="button" class="tag on" data-tag="${esc(t)}" aria-label="Remover tema ${esc(t)}">#${esc(t)} ×</button>`).join("") +
        `<button type="button" class="linkbtn" data-act="cleartags">Limpar temas</button>`
      : `<span class="sel-label">Escolha um ou mais temas para ver os roteiros. Com mais de um, aparecem só os que têm todos.</span>`;
    const tq = norm($("tq").value.trim().replace(/^#+/, ""));
    const list = [...counts.entries()].filter(([t]) => !tq || norm(t).includes(tq));
    if (!list.length) {
      tagIndex.innerHTML = `<p class="muted">${counts.size ? "Nenhum tema com esse nome." : "Os temas aparecem aqui assim que os roteiros tiverem tags."}</p>`;
      return;
    }
    const chip = ([t, n]) => `<button type="button" class="tag${selTags.has(t) ? " on" : ""}" data-tag="${esc(t)}" aria-pressed="${selTags.has(t)}">#${esc(t)} <span class="n">${n}</span></button>`;
    if (tagSort === "uso") {
      list.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
      tagIndex.innerHTML = `<div class="tags">${list.map(chip).join("")}</div>`;
      return;
    }
    list.sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
    const groups = new Map();
    list.forEach(e => {
      const c = (norm(e[0])[0] || "").toUpperCase();
      const L = /[A-Z]/.test(c) ? c : "0–9";
      if (!groups.has(L)) groups.set(L, []);
      groups.get(L).push(e);
    });
    tagIndex.innerHTML = [...groups].map(([L, es]) => `<div class="letter"><span class="L">${L}</span><div class="tags">${es.map(chip).join("")}</div></div>`).join("");
  }

  function setMode(m) {
    mode = m;
    $("tab-busca").setAttribute("aria-selected", String(m === "busca"));
    $("tab-temas").setAttribute("aria-selected", String(m === "temas"));
    $("tab-busca").tabIndex = m === "busca" ? 0 : -1;
    $("tab-temas").tabIndex = m === "temas" ? 0 : -1;
    $("panel-busca").hidden = m !== "busca";
    $("panel-temas").hidden = m !== "temas";
    try { localStorage.setItem("bib-mode", m); } catch (e) {}
    render();
  }

  // Texto do roteiro: ## título, - item, 1. item, > citação, **negrito**
  function renderProse(text) {
    const lines = String(text || "").replace(/\r/g, "").split("\n");
    let out = "", list = null, para = [];
    const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
    const flushP = () => { if (para.length) { out += `<p>${para.map(inline).join("<br>")}</p>`; para = []; } };
    const flushL = () => { if (list) { out += `</${list}>`; list = null; } };
    lines.forEach(raw => {
      const l = raw.trim();
      let m;
      if (!l) { flushP(); flushL(); return; }
      if ((m = l.match(/^#{1,3}\s+(.*)/))) { flushP(); flushL(); out += `<h3>${inline(m[1])}</h3>`; return; }
      if ((m = l.match(/^>\s?(.*)/))) { flushP(); flushL(); out += `<blockquote>${inline(m[1])}</blockquote>`; return; }
      if ((m = l.match(/^[-•*]\s+(.*)/))) { flushP(); if (list !== "ul") { flushL(); out += "<ul>"; list = "ul"; } out += `<li>${inline(m[1])}</li>`; return; }
      if ((m = l.match(/^\d+[.)]\s+(.*)/))) { flushP(); if (list !== "ol") { flushL(); out += "<ol>"; list = "ol"; } out += `<li>${inline(m[1])}</li>`; return; }
      flushL(); para.push(l);
    });
    flushP(); flushL();
    return out;
  }

  // ---------- Painel de leitura ----------
  let openId = null, armTimer = null, openSig = "";
  const sig = it => JSON.stringify([it.numero, it.titulo, it.passagem, it.tags, it.resumo, it.roteiro, it.pdf, it.criadoEm, it.atualizadoEm]);
  const pagesTxt = n => n ? `${n} ${n === 1 ? "página" : "páginas"}` : "";

  function openRead(id) {
    const it = items.find(x => x.id === id);
    if (!it) return;
    openId = id;
    const writable = canWriteNow();
    inner.innerHTML = `
      <div class="dlg-head"><span class="num" style="font-family:var(--font-ref);font-size:13px">${pad(it.numero)}${it._p ? ` · ${it._p.t === "AT" ? "Antigo Testamento" : "Novo Testamento"}` : ""}</span><button class="x" type="button" data-act="close" aria-label="Fechar">×</button></div>
      <div class="dlg-body read">
        <h2>${esc(it.titulo)}</h2>
        ${it.passagem ? `<div class="ref">${esc(it.passagem)}</div>` : ""}
        ${it.resumo ? `<p class="lead">${esc(it.resumo)}</p>` : ""}
        ${(it.tags || []).length ? `<div class="tagline">${it.tags.map(t => `<button type="button" class="tag" data-tag="${esc(t)}" data-close="1">#${esc(t)}</button>`).join("")}</div>` : ""}
        ${it.pdf ? `<div class="pdfview"><div class="pdfbar"><span><strong>${esc(it.pdf.nome || "Roteiro em PDF")}</strong>${it.pdf.paginas ? " · " + pagesTxt(it.pdf.paginas) : ""}</span><a class="btn sm" id="pdf-open" href="#" target="_blank" rel="noopener" hidden>Abrir em nova aba</a></div><div class="pdfpages" id="pdfpages"><p class="dates">Carregando o PDF…</p></div></div>` : ""}
        ${it.roteiro || !it.pdf ? `<div class="prose">${renderProse(it.roteiro) || '<p style="color:var(--muted)">Este roteiro ainda não tem conteúdo.</p>'}</div>` : ""}
      </div>
      <div class="dlg-foot">
        <span class="dates">${it.criadoEm ? "Criado em " + fmtDate(it.criadoEm) : ""}${it.atualizadoEm && it.atualizadoEm !== it.criadoEm ? " · editado em " + fmtDate(it.atualizadoEm) : ""}</span>
        <span style="display:flex;flex-wrap:wrap;gap:8px">${writable ? `<button class="btn danger" type="button" data-act="del">Excluir</button><button class="btn" type="button" data-act="edit">Editar</button>` : ""}<button class="btn primary" type="button" data-act="download">Baixar PDF</button></span>
      </div>`;
    if (!dlg.open) dlg.showModal();
    inner.querySelector(".dlg-body").scrollTop = 0;
    openSig = sig(it);
    if (it.pdf) renderPdfPages(it.pdf.path); else ++pdfToken;
    try { history.replaceState(null, "", "#r-" + it.numero); } catch (e) {}
  }

  // ---------- Editor ----------
  function openEdit(id) {
    const it = id ? items.find(x => x.id === id) : null;
    openId = id || null;
    pdfDraft = { file: null, text: null, pages: null, remove: false, reading: false, note: "" };
    ++pdfToken;
    inner.innerHTML = `
      <div class="dlg-head"><strong>${it ? "Editar " + pad(it.numero) : "Novo roteiro"}</strong><button class="x" type="button" data-act="close" aria-label="Fechar">×</button></div>
      <form class="edit dlg-body" id="form" novalidate>
        <div class="field"><label for="f-titulo">Título</label><input id="f-titulo" required maxlength="140" value="${esc(it?.titulo)}" placeholder="Ex.: O Bom Samaritano"></div>
        <div class="row2">
          <div class="field"><label for="f-passagem">Passagem <small>livro capítulo:versículos</small></label><input id="f-passagem" maxlength="120" value="${esc(it?.passagem)}" placeholder="Ex.: Lucas 10:25-37"></div>
          <div class="field"><label for="f-tags">Temas <small>separe com espaço</small></label><input id="f-tags" maxlength="300" value="${esc((it?.tags || []).map(t => "#" + t).join(" "))}" placeholder="#amor #próximo #parábolas"></div>
        </div>
        <div class="field"><label for="f-pdf">Roteiro pronto em PDF <small>opcional · até 20 MB · o texto do PDF entra na busca</small></label><div class="pdfbox" id="pdfbox"></div><input type="file" id="f-pdf" accept="application/pdf,.pdf" hidden></div>
        <div class="field"><label for="f-resumo">Resumo <small>uma ou duas frases</small></label><textarea id="f-resumo" rows="2" maxlength="400">${esc(it?.resumo)}</textarea></div>
        <div class="field"><label for="f-roteiro">Roteiro <small>## título · - item · 1. pergunta · &gt; citação · **negrito**</small></label><textarea id="f-roteiro" placeholder="## Objetivo&#10;Entender…&#10;&#10;## Leitura&#10;> Versículo-chave&#10;&#10;## Perguntas&#10;1. …&#10;2. …&#10;&#10;## Aplicação&#10;- …">${esc(it?.roteiro)}</textarea></div>
        <div class="err" id="f-err" role="alert"></div>
      </form>
      <div class="dlg-foot"><span></span><span style="display:flex;gap:8px"><button class="btn" type="button" data-act="${it ? "back" : "close"}">Cancelar</button><button class="btn primary" type="submit" form="form" id="f-save">Salvar roteiro</button></span></div>`;
    if (!dlg.open) dlg.showModal();
    $("f-titulo").focus();
    renderPdfBox();
    $("f-pdf").addEventListener("change", e => { handlePdfFile(e.target.files[0]); e.target.value = ""; });
    const box = $("pdfbox");
    box.addEventListener("dragover", e => { e.preventDefault(); box.classList.add("drag"); });
    box.addEventListener("dragleave", () => box.classList.remove("drag"));
    box.addEventListener("drop", e => { e.preventDefault(); box.classList.remove("drag"); handlePdfFile(e.dataTransfer?.files?.[0]); });
  }

  async function save(e) {
    e.preventDefault();
    if (!canWriteNow()) return;
    const err = $("f-err");
    const titulo = $("f-titulo").value.trim();
    if (!titulo) { err.textContent = "Dê um título ao roteiro para poder salvar."; $("f-titulo").focus(); return; }
    if (pdfDraft.reading) { err.textContent = "Espere terminar a leitura do PDF."; return; }
    const prev = openId ? items.find(x => x.id === openId) : null;
    const row = {
      titulo,
      passagem: $("f-passagem").value.trim(),
      tags: parseTags($("f-tags").value),
      resumo: $("f-resumo").value.trim(),
      roteiro: $("f-roteiro").value.replace(/\s+$/, ""),
      atualizado_em: new Date().toISOString()
    };
    const btn = $("f-save"); btn.disabled = true; btn.textContent = "Salvando…";
    let uploaded = null, written = false;
    try {
      if (pdfDraft.file) {
        btn.textContent = "Enviando PDF…";
        uploaded = await uploadPdf(pdfDraft.file);
        Object.assign(row, { pdf_path: uploaded, pdf_nome: pdfDraft.file.name, pdf_tamanho: pdfDraft.file.size, pdf_paginas: pdfDraft.pages || null, texto_pdf: pdfDraft.text || "" });
        btn.textContent = "Salvando…";
      } else if (pdfDraft.remove) {
        Object.assign(row, { pdf_path: null, pdf_nome: null, pdf_tamanho: null, pdf_paginas: null, texto_pdf: "" });
      }
      let id;
      if (prev) {
        const { error } = await sb.from("roteiros").update(row).eq("id", prev.id);
        if (error) throw error;
        id = prev.id;
      } else {
        const { data, error } = await sb.from("roteiros").insert(row).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      written = true;
      if (prev?.pdf?.path && (pdfDraft.file || pdfDraft.remove)) removePdf(prev.pdf.path);
      toast("Roteiro salvo");
      openId = id;
      await loadItems();
      openRead(id);
    } catch (ex) {
      btn.disabled = false; btn.textContent = "Salvar roteiro";
      if (uploaded && !written) removePdf(uploaded);
      err.textContent = errMsg(ex);
      if (isPermErr(ex)) { readOnly = true; render(); }
    }
  }

  async function del(btn) {
    if (!btn.classList.contains("armed")) {
      btn.classList.add("armed"); btn.textContent = "Confirmar exclusão";
      clearTimeout(armTimer); armTimer = setTimeout(() => { btn.classList.remove("armed"); btn.textContent = "Excluir"; }, 4000);
      return;
    }
    btn.disabled = true;
    const it = items.find(x => x.id === openId);
    if (!it) return;
    const { error } = await sb.from("roteiros").delete().eq("id", it.id);
    if (error) { btn.disabled = false; btn.textContent = "Não foi possível excluir"; return; }
    if (it.pdf?.path) removePdf(it.pdf.path);
    closeDlg(); toast("Roteiro excluído");
    loadItems();
  }

  // ---------- Alterar senha ----------
  function openPass() {
    openId = null; ++pdfToken;
    inner.innerHTML = `
      <div class="dlg-head"><strong>Alterar senha</strong><button class="x" type="button" data-act="close" aria-label="Fechar">×</button></div>
      <form class="edit dlg-body" id="passform" novalidate>
        <div class="field"><label for="cp-pass">Nova senha <small>mínimo de 8 caracteres</small></label><input id="cp-pass" type="password" autocomplete="new-password"></div>
        <div class="field"><label for="cp-pass2">Repita a nova senha</label><input id="cp-pass2" type="password" autocomplete="new-password"></div>
        <div class="err" id="cp-msg" role="alert"></div>
      </form>
      <div class="dlg-foot"><span></span><span style="display:flex;gap:8px"><button class="btn" type="button" data-act="close">Cancelar</button><button class="btn primary" type="submit" form="passform" id="cp-save">Salvar nova senha</button></span></div>`;
    if (!dlg.open) dlg.showModal();
    $("cp-pass").focus();
  }
  async function savePass(e) {
    e.preventDefault();
    const msg = $("cp-msg");
    const bad = checkNewPass($("cp-pass").value, $("cp-pass2").value);
    if (bad) { msg.textContent = bad; return; }
    const btn = $("cp-save"); btn.disabled = true;
    const { error } = await sb.auth.updateUser({ password: $("cp-pass").value });
    btn.disabled = false;
    if (error) { msg.textContent = /different|same/i.test(error.message) ? "A nova senha precisa ser diferente da atual." : "Não foi possível alterar a senha agora."; return; }
    closeDlg(); toast("Senha alterada");
  }

  function closeDlg() { openId = null; if (dlg.open) dlg.close(); }
  dlg.addEventListener("close", () => { openId = null; ++pdfToken; try { if (/^#r-/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search); } catch (e) {} });
  dlg.addEventListener("click", e => { if (e.target === dlg) closeDlg(); });

  let toastT;
  function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600); }

  // ---------- PDF: leitura com pdf.js (carregado só quando precisa) ----------
  let pdfDraft = { file: null, text: null, pages: null, remove: false, reading: false, note: "" };
  let pdfToken = 0, pdfjsP = null;
  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
  const loadScript = src => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("script")); document.head.appendChild(s); });
  function getPdfjs() {
    // O worker entra como script comum: o pdf.js roda na própria página.
    if (!pdfjsP) pdfjsP = loadScript(PDFJS + "pdf.worker.min.js").then(() => loadScript(PDFJS + "pdf.min.js")).then(() => window.pdfjsLib)
      .catch(e => { pdfjsP = null; throw e; });
    return pdfjsP;
  }
  async function openPdf(bytes) { const lib = await getPdfjs(); return lib.getDocument({ data: bytes, isEvalSupported: false }).promise; }
  async function readPdfFile(file) {
    const pdf = await openPdf(new Uint8Array(await file.arrayBuffer()));
    try {
      let out = "";
      for (let i = 1; i <= pdf.numPages && out.length < 60000; i++) {
        const tc = await (await pdf.getPage(i)).getTextContent();
        out += tc.items.map(x => (x.str || "") + (x.hasEOL ? "\n" : " ")).join("") + "\n\n";
      }
      return { text: out.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 60000), pages: pdf.numPages };
    } finally { pdf.destroy(); }
  }
  const titleFromFile = name => String(name || "").replace(/\.pdf$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 140) || "Roteiro em PDF";
  const fmtSize = b => b >= 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";

  function renderPdfBox() {
    const box = $("pdfbox"); if (!box) return;
    const it = openId ? items.find(x => x.id === openId) : null;
    const d = pdfDraft;
    const trocar = `<button type="button" class="btn sm" data-act="pdf-pick">Trocar</button><button type="button" class="btn sm danger" data-act="pdf-remove">Remover</button>`;
    let info, acts = trocar;
    if (d.file && d.reading) { info = `<strong>${esc(d.file.name)}</strong><span>Lendo o PDF…</span>`; acts = ""; }
    else if (d.file) info = `<strong>${esc(d.file.name)}</strong><span>${[pagesTxt(d.pages), fmtSize(d.file.size), "será enviado ao salvar"].filter(Boolean).join(" · ")}</span>${d.note ? `<span>${esc(d.note)}</span>` : ""}`;
    else if (it?.pdf && !d.remove) info = `<strong>${esc(it.pdf.nome || "Roteiro em PDF")}</strong><span>${[pagesTxt(it.pdf.paginas), it.pdf.tamanho ? fmtSize(it.pdf.tamanho) : ""].filter(Boolean).join(" · ") || "PDF anexado"}</span>`;
    else {
      info = `<strong>Nenhum PDF anexado</strong><span>${d.remove ? "O PDF atual será removido ao salvar. " : ""}Escolha um arquivo ou arraste para cá.</span>`;
      acts = `<button type="button" class="btn sm" data-act="pdf-pick">Escolher PDF</button>`;
    }
    box.innerHTML = `<div class="info">${info}</div><div class="acts">${acts}</div>`;
  }

  async function handlePdfFile(file) {
    const err = $("f-err");
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") { err.textContent = "Escolha um arquivo PDF."; return; }
    if (file.size > 20 * 1048576) { err.textContent = "O PDF passa de 20 MB. Comprima o arquivo e tente de novo."; return; }
    err.textContent = "";
    pdfDraft = { file, text: null, pages: null, remove: false, reading: true, note: "" };
    const t = $("f-titulo"); if (t && !t.value.trim()) t.value = titleFromFile(file.name);
    renderPdfBox();
    try {
      const r = await readPdfFile(file);
      if (pdfDraft.file !== file) return;
      pdfDraft.text = r.text; pdfDraft.pages = r.pages;
      if (!r.text) pdfDraft.note = "Parece um PDF escaneado: ele será anexado, mas o texto não entra na busca.";
    } catch (ex) {
      if (pdfDraft.file !== file) return;
      pdfDraft.text = ""; pdfDraft.note = "Não consegui ler o texto deste PDF. Ele será anexado, mas o conteúdo não entra na busca.";
    }
    pdfDraft.reading = false;
    renderPdfBox();
  }

  async function renderPdfPages(path) {
    const token = ++pdfToken;
    const box = $("pdfpages"); if (!box) return;
    sb.storage.from(BUCKET).createSignedUrl(path, 3600).then(({ data }) => {
      const a = $("pdf-open");
      if (data?.signedUrl && a && token === pdfToken) { a.href = data.signedUrl; a.hidden = false; }
    });
    try {
      const { data, error } = await sb.storage.from(BUCKET).download(path);
      if (error) throw error;
      const bytes = new Uint8Array(await data.arrayBuffer());
      if (token !== pdfToken) return;
      const pdf = await openPdf(bytes);
      if (token !== pdfToken) { pdf.destroy(); return; }
      box.innerHTML = "";
      const max = Math.min(pdf.numPages, 40), dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (let i = 1; i <= max; i++) {
        if (token !== pdfToken || !box.isConnected) break;
        const page = await pdf.getPage(i);
        const w = box.clientWidth || 640;
        const vp = page.getViewport({ scale: (w / page.getViewport({ scale: 1 }).width) * dpr });
        const c = document.createElement("canvas");
        c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
        c.setAttribute("role", "img"); c.setAttribute("aria-label", "Página " + i);
        box.appendChild(c);
        await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
      }
      if (pdf.numPages > max && box.isConnected) box.insertAdjacentHTML("beforeend", `<p class="dates">Mostrando ${max} de ${pdf.numPages} páginas. Baixe o PDF para ver o restante.</p>`);
      pdf.destroy();
    } catch (e) {
      if (token === pdfToken && box.isConnected) box.innerHTML = `<p class="dates">Não foi possível mostrar o PDF aqui. Use “Baixar PDF”.</p>`;
    }
  }

  // ---------- Baixar ----------
  let jspdfP = null;
  function getJsPdf() {
    if (!jspdfP) jspdfP = loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js").then(() => window.jspdf.jsPDF)
      .catch(e => { jspdfP = null; throw e; });
    return jspdfP;
  }
  // As fontes padrão do PDF cobrem o alfabeto latino (acentos do português incluídos)
  const latin = s => String(s || "").replace(/[“”„]/g, '"').replace(/[‘’‚]/g, "'").replace(/[–—]/g, "-").replace(/…/g, "...")
    .replace(/ /g, " ").replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");
  const safeName = s => String(s || "roteiro").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 150);
  async function makePdf(it) {
    const JsPDF = await getJsPdf();
    const doc = new JsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 56, maxW = W - M * 2;
    const INK = [14, 35, 64], BLUE = [23, 57, 107], MUTED = [86, 101, 122];
    let y = M;
    const ensure = h => { if (y + h > H - M) { doc.addPage(); y = M; } };
    const write = (text, o = {}) => {
      const { size = 11, style = "normal", color = INK, indent = 0, gap = 4, lh = 1.45 } = o;
      doc.setFont("helvetica", style); doc.setFontSize(size); doc.setTextColor(...color);
      doc.splitTextToSize(latin(text), maxW - indent).forEach(l => { ensure(size * lh); doc.text(l, M + indent, y + size); y += size * lh; });
      y += gap;
    };
    const strip = s => s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/(^|[^*])\*([^*]+)\*/g, "$1$2");
    write(`${pad(it.numero)}  ·  Roteiros células One Flow`, { size: 9, color: BLUE, gap: 10 });
    write(it.titulo, { size: 20, style: "bold", lh: 1.25 });
    if (it.passagem) write(it.passagem, { color: MUTED, gap: 8 });
    if (it.resumo) write(it.resumo, { size: 11.5, style: "italic", color: MUTED, gap: 8 });
    if (it.tags?.length) write(it.tags.map(t => "#" + t).join("   "), { size: 9.5, color: BLUE, gap: 12 });
    doc.setDrawColor(211, 218, 227); doc.line(M, y, W - M, y); y += 16;
    if (!it.roteiro) write("Este roteiro ainda não tem conteúdo.", { style: "italic", color: MUTED });
    String(it.roteiro || "").replace(/\r/g, "").split("\n").forEach(raw => {
      const l = raw.trim(); let m;
      if (!l) { y += 4; return; }
      if ((m = l.match(/^#{1,3}\s+(.*)/))) { y += 8; ensure(44); write(strip(m[1]).toUpperCase(), { size: 9.5, style: "bold", color: BLUE }); return; }
      if ((m = l.match(/^>\s?(.*)/))) { write(strip(m[1]), { style: "italic", indent: 14 }); return; }
      if ((m = l.match(/^[-•*]\s+(.*)/))) { write("•  " + strip(m[1]), { indent: 10, gap: 3 }); return; }
      if ((m = l.match(/^(\d+)[.)]\s+(.*)/))) { write(m[1] + ".  " + strip(m[2]), { indent: 10, gap: 3 }); return; }
      write(strip(l), { gap: 2 });
    });
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(120, 130, 145);
      doc.text(latin(`${String(it.titulo || "").slice(0, 70)}  ·  ${i}/${total}`), M, H - 28);
    }
    return doc.output("blob");
  }
  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function baixar(btn) {
    const it = items.find(x => x.id === openId);
    if (!it) return;
    const label = btn.textContent; btn.disabled = true; btn.textContent = "Preparando…";
    try {
      let blob;
      if (it.pdf) {
        const { data, error } = await sb.storage.from(BUCKET).download(it.pdf.path);
        if (error) throw error;
        blob = data;
      } else blob = await makePdf(it);
      saveBlob(blob, safeName(`${pad(it.numero)} - ${it.titulo}`) + ".pdf");
      toast("Download iniciado");
    } catch (ex) {
      toast("Não foi possível baixar agora. Tente de novo.");
    } finally {
      if (btn.isConnected) { btn.disabled = false; btn.textContent = label; }
    }
  }

  // ---------- Importar vários PDFs ----------
  let importFiles = [], importing = false;
  function openImport(fs) {
    openId = null; ++pdfToken;
    importFiles = fs.map(f => { const big = f.size > 20 * 1048576; return { file: f, st: big ? "Maior que 20 MB" : "Pronto para importar", ok: false, skip: big }; });
    const n = importFiles.filter(x => !x.skip).length;
    inner.innerHTML = `
      <div class="dlg-head"><strong>Importar ${fs.length} ${fs.length === 1 ? "PDF" : "PDFs"}</strong><button class="x" type="button" data-act="close" aria-label="Fechar">×</button></div>
      <div class="dlg-body" style="display:flex;flex-direction:column;gap:18px">
        <p style="margin:0;color:var(--muted)">Cada PDF vira um roteiro, com o nome do arquivo como título e o texto do PDF incluído na busca. Depois abra cada roteiro para completar passagem, resumo e temas.</p>
        <ul class="importlist" id="implist"></ul>
        <div class="field edit"><label for="imp-tags">Temas para todos <small>opcional · separe com espaço</small></label><input id="imp-tags" maxlength="300" placeholder="#células #2026"></div>
        <div class="err" id="imp-err" role="alert"></div>
      </div>
      <div class="dlg-foot"><span></span><span style="display:flex;gap:8px"><button class="btn" type="button" data-act="close" id="imp-cancel">Cancelar</button><button class="btn primary" type="button" data-act="import-run" id="imp-run"${n ? "" : " disabled"}>Importar ${n} ${n === 1 ? "roteiro" : "roteiros"}</button></span></div>`;
    renderImportList();
    if (!dlg.open) dlg.showModal();
  }
  function renderImportList() {
    const ul = $("implist"); if (!ul) return;
    ul.innerHTML = importFiles.map(x => `<li><span class="nm">${esc(x.file.name)}</span><span class="st${x.ok ? " ok" : ""}">${esc(x.st)}</span></li>`).join("");
  }
  async function runImport() {
    if (importing || !canWriteNow()) return;
    importing = true;
    const btn = $("imp-run"); btn.disabled = true; btn.textContent = "Importando…";
    $("imp-cancel").hidden = true;
    const tags = parseTags($("imp-tags").value);
    let done = 0, stop = false;
    for (const x of importFiles) {
      if (x.skip || x.ok) continue;
      if (stop) { x.st = "Não importado"; continue; }
      x.st = "Lendo…"; renderImportList();
      let text = "", pages = null, path = null;
      try { const r = await readPdfFile(x.file); text = r.text; pages = r.pages; } catch (e) {}
      x.st = "Enviando…"; renderImportList();
      try {
        path = await uploadPdf(x.file);
        const now = new Date().toISOString();
        const { data, error } = await sb.from("roteiros").insert({
          titulo: titleFromFile(x.file.name), passagem: "", tags, resumo: "", roteiro: "",
          pdf_path: path, pdf_nome: x.file.name, pdf_tamanho: x.file.size, pdf_paginas: pages, texto_pdf: text,
          criado_em: now, atualizado_em: now
        }).select("numero").single();
        if (error) throw error;
        done++; x.ok = true; x.st = pad(data.numero) + " criado";
      } catch (ex) {
        if (path) removePdf(path);
        x.st = "Não importado";
        const el = $("imp-err"); if (el) el.textContent = errMsg(ex);
        if (isPermErr(ex)) { stop = true; readOnly = true; }
      }
      renderImportList();
    }
    importing = false;
    if (btn.isConnected) { btn.disabled = false; btn.textContent = "Fechar"; btn.dataset.act = "close"; }
    if (done) toast(`${done} ${done === 1 ? "roteiro importado" : "roteiros importados"}`);
    loadItems();
  }
  $("import").addEventListener("click", () => { if (canWriteNow()) $("imp").click(); });
  $("imp").addEventListener("change", e => {
    const fs = [...e.target.files].filter(f => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
    e.target.value = "";
    if (fs.length) openImport(fs); else toast("Escolha arquivos PDF");
  });

  // ---------- Eventos ----------
  function toggleTag(tag) {
    if (selTags.has(tag)) selTags.delete(tag); else selTags.add(tag);
    render();
  }
  document.addEventListener("click", e => {
    const tagBtn = e.target.closest("[data-tag]");
    if (tagBtn) {
      if (tagBtn.dataset.close) { closeDlg(); selTags = new Set([tagBtn.dataset.tag]); setMode("temas"); }
      else toggleTag(tagBtn.dataset.tag);
      return;
    }
    const card = e.target.closest(".card");
    if (card) { openRead(card.dataset.id); return; }
    const actEl = e.target.closest("[data-act]");
    const act = actEl?.dataset.act;
    if (!act) return;
    if (act === "close") closeDlg();
    else if (act === "new") { if (canWriteNow()) openEdit(null); }
    else if (act === "edit") { if (canWriteNow()) openEdit(openId); }
    else if (act === "back") openRead(openId);
    else if (act === "del") { if (canWriteNow()) del(actEl); }
    else if (act === "download") baixar(actEl);
    else if (act === "clear") { qEl.value = ""; selTags.clear(); testament = ""; syncSeg(); render(); }
    else if (act === "cleartags") { selTags.clear(); render(); }
    else if (act === "pdf-pick") $("f-pdf")?.click();
    else if (act === "pdf-remove") {
      if (pdfDraft.file) pdfDraft = { file: null, text: null, pages: null, remove: pdfDraft.remove, reading: false, note: "" };
      else pdfDraft.remove = true;
      renderPdfBox();
    }
    else if (act === "import-run") runImport();
  });
  document.addEventListener("submit", e => {
    if (e.target.id === "form") save(e);
    else if (e.target.id === "passform") savePass(e);
  });
  $("new").addEventListener("click", () => { if (canWriteNow()) openEdit(null); });
  qEl.addEventListener("input", render);
  $("clear").addEventListener("click", () => { qEl.value = ""; render(); qEl.focus(); });
  $("sort").addEventListener("change", e => { sortBy = e.target.value; try { localStorage.setItem("bib-sort", sortBy); } catch (x) {} render(); });
  function syncSeg() { document.querySelectorAll(".seg button[data-t]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.t === testament))); }
  document.querySelectorAll(".seg button[data-t]").forEach(b => b.addEventListener("click", () => { testament = b.dataset.t; syncSeg(); render(); }));
  $("tab-busca").addEventListener("click", () => { setMode("busca"); qEl.focus(); });
  $("tab-temas").addEventListener("click", () => setMode("temas"));
  document.querySelector(".tabs").addEventListener("keydown", e => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const m = mode === "busca" ? "temas" : "busca"; setMode(m); $("tab-" + m).focus(); }
  });
  $("tq").addEventListener("input", render);
  document.querySelectorAll("[data-ts]").forEach(b => b.addEventListener("click", () => {
    tagSort = b.dataset.ts;
    document.querySelectorAll("[data-ts]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    render();
  }));
  document.addEventListener("keydown", e => {
    if (e.key === "/" && !dlg.open && !$("app").hidden && document.activeElement !== qEl && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) { e.preventDefault(); qEl.focus(); }
  });

  function openFromHash() {
    const m = location.hash.match(/^#r-(\d+)$/);
    if (!m || !loaded) return;
    const it = items.find(x => +x.numero === +m[1]);
    if (it && openId !== it.id) openRead(it.id);
  }
  window.addEventListener("hashchange", openFromHash);

  try { if (localStorage.getItem("bib-mode") === "temas") setMode("temas"); } catch (e) {}
})();
