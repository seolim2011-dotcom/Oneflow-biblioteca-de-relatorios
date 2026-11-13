/* Roteiros células One Flow — biblioteca de roteiros de estudo bíblico
   Login, banco e PDFs: API em PHP + MySQL (pasta api/). Leitura de PDF: pdf.js. PDF gerado: jsPDF. */
(() => {
  const $ = id => document.getElementById(id);

  // ---------- API ----------
  let csrf = "";
  async function api(action, { body, form, params } = {}) {
    const url = "api/?a=" + encodeURIComponent(action) + (params ? "&" + new URLSearchParams(params) : "");
    const post = !!(body || form);
    const opt = { method: post ? "POST" : "GET", credentials: "same-origin", headers: {} };
    if (post) opt.headers["X-CSRF-Token"] = csrf;
    if (form) opt.body = form;
    else if (body) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
    let res;
    try { res = await fetch(url, opt); }
    catch (e) { throw { erro: "Sem conexão. Verifique a internet e tente de novo.", status: 0 }; }
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      const err = { erro: data?.erro || "Algo deu errado no servidor. Tente de novo.", status: res.status };
      if (res.status === 401 && action !== "entrar" && me) onLoggedOut();
      throw err;
    }
    return data || {};
  }
  const pdfUrl = (id, baixar) => `api/?a=pdf&id=${encodeURIComponent(id)}${baixar ? "&baixar=1" : ""}`;

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
  let me = null, started = false, isAdmin = false, area = "usuario", readOnly = false;
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
      id: String(r.id), numero: r.numero, titulo: r.titulo || "", passagem: r.passagem || "", tags: r.tags || [],
      resumo: r.resumo || "", roteiro: r.roteiro || "", textoPdf: r.texto_pdf || "",
      criadoEm: r.criado_em, atualizadoEm: r.atualizado_em,
      pdf: r.pdf ? { nome: r.pdf.nome, tamanho: r.pdf.tamanho, paginas: r.pdf.paginas } : null
    };
    it._p = parsePassage(it.passagem);
    return it;
  };

  // ---------- Telas e login ----------
  function show(screen) { ["setup", "login", "newpass", "convite", "app"].forEach(id => { $(id).hidden = id !== screen; }); }

  function onUser(u) {
    me = u;
    if (!u) { started = false; isAdmin = false; items = []; loaded = false; if (dlg.open) closeDlg(); show("login"); return; }
    if (u.trocar_senha) { show("newpass"); $("np-pass").focus(); return; }
    isAdmin = !!u.is_admin;
    let saved = null;
    try { saved = localStorage.getItem("bib-area"); } catch (e) {}
    area = isAdmin && saved !== "usuario" ? "admin" : "usuario";
    renderAccount();
    show("app");
    if (!started) { started = true; loadItems(); } else render();
  }
  function onLoggedOut() { onUser(null); toast("Sua sessão expirou. Entre de novo."); }

  async function boot() {
    try {
      const s = await api("sessao");
      csrf = s.csrf || "";
      const cv = location.hash.match(/^#convite=([a-f0-9]{64})$/);
      if (cv && !s.usuario) { openInvite(cv[1]); return; }
      if (cv) {
        clearInviteHash();
        setTimeout(() => toast("Você já está conectado. Para usar o convite, saia e abra o link de novo."), 400);
      }
      onUser(s.usuario || null);
    } catch (e) {
      $("setup-msg").textContent = e.erro || "Não foi possível abrir a biblioteca agora.";
      show("setup");
    }
  }

  $("login-form").addEventListener("submit", async e => {
    e.preventDefault();
    const msg = $("login-msg"), btn = $("login-btn");
    const email = $("l-email").value.trim(), senha = $("l-pass").value;
    if (!email || !senha) { msg.textContent = "Preencha o e-mail e a senha."; return; }
    msg.textContent = ""; btn.disabled = true; btn.textContent = "Entrando…";
    try {
      const r = await api("entrar", { body: { email, senha } });
      csrf = r.csrf || csrf;
      $("l-pass").value = "";
      onUser(r.usuario);
    } catch (ex) {
      msg.textContent = ex.erro;
      if (ex.status === 419) boot();
    } finally {
      btn.disabled = false; btn.textContent = "Entrar";
    }
  });
  $("forgot").addEventListener("click", () => {
    $("login-msg").textContent = "Peça a um administrador da biblioteca para criar uma senha provisória para você.";
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
    try {
      const r = await api("senha", { body: { nova: $("np-pass").value } });
      $("np-pass").value = ""; $("np-pass2").value = ""; msg.textContent = "";
      toast("Senha salva");
      onUser(r.usuario);
    } catch (ex) {
      msg.textContent = ex.erro;
    } finally {
      btn.disabled = false;
    }
  });
  $("logout").addEventListener("click", async () => {
    try { const r = await api("sair", { body: {} }); csrf = r.csrf || csrf; } catch (e) {}
    onUser(null); toast("Você saiu da biblioteca");
  });
  $("changepass").addEventListener("click", openPass);

  // ---------- Aceitar convite ----------
  let inviteToken = null;
  async function openInvite(token) {
    inviteToken = token;
    show("convite");
    $("cv-form").hidden = true;
    $("cv-text").textContent = "Carregando o convite…";
    try {
      const c = await api("convite_info", { params: { token } });
      $("cv-text").innerHTML = `Você foi convidado para a biblioteca como <strong>${c.is_admin ? "Administrador" : "Leitor"}</strong>. Crie sua conta para acessar os roteiros.`;
      $("cv-form").hidden = false;
      $("cv-nome").focus();
    } catch (ex) {
      $("cv-text").textContent = ex.erro;
    }
  }
  function clearInviteHash() {
    inviteToken = null;
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  }
  $("cv-login").addEventListener("click", () => { clearInviteHash(); show("login"); $("l-email").focus(); });
  $("cv-form").addEventListener("submit", async e => {
    e.preventDefault();
    const msg = $("cv-msg"), btn = $("cv-btn");
    const nome = $("cv-nome").value.trim(), email = $("cv-email").value.trim();
    if (!nome) { msg.textContent = "Digite seu nome."; return; }
    if (!email) { msg.textContent = "Digite seu e-mail."; return; }
    const bad = checkNewPass($("cv-pass").value, $("cv-pass2").value);
    if (bad) { msg.textContent = bad; return; }
    msg.textContent = ""; btn.disabled = true; btn.textContent = "Criando sua conta…";
    try {
      const r = await api("convite_aceitar", { body: { token: inviteToken, nome, email, senha: $("cv-pass").value } });
      csrf = r.csrf || csrf;
      clearInviteHash();
      $("cv-pass").value = ""; $("cv-pass2").value = "";
      toast("Conta criada. Bem-vindo à biblioteca!");
      onUser(r.usuario);
    } catch (ex) {
      msg.textContent = ex.erro;
      if (ex.status === 419) boot();
    } finally {
      btn.disabled = false; btn.textContent = "Criar minha conta";
    }
  });

  // ---------- Conta e áreas ----------
  function renderAccount() {
    const nome = me?.nome || me?.email || "";
    $("who-avatar").textContent = (nome[0] || "?");
    $("who-name").textContent = nome || "Você";
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
    try {
      const { roteiros } = await api("roteiros");
      items = (roteiros || []).map(fromRow); loaded = true; loadNote = ""; lastLoad = Date.now();
    } catch (e) {
      if (!loaded) { loadNote = e.erro || "Não foi possível carregar os roteiros."; render(); }
      return;
    }
    render();
    if (openId && dlg.open && !$("form") && !$("passform")) {
      const cur = items.find(x => x.id === openId);
      if (!cur) closeDlg(); else if (sig(cur) !== openSig) openRead(openId);
    }
    if (firstHash) { firstHash = false; openFromHash(); }
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && me && started && !importing && Date.now() - lastLoad > 60000) loadItems();
  });

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
    $("users").hidden = !canWriteNow();

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

  // Modelo do roteiro de célula One Flow: textos fixos de cada hora já vêm prontos,
  // o que muda a cada semana fica entre colchetes para o admin substituir.
  const MODELO_CELULA = `**Roteiro escrito por** [nome] **e revisado pela equipe Workflow da PIB Curitiba**

## Flow News
**[NOME DO EVENTO]** - [descrição, data e link de inscrição]

**[NOME DO EVENTO]** - [descrição, data e link de inscrição]

## Hora do Encontro
Este é um momento mais descontraído para a célula se soltar, criando um ambiente de conforto e **comunhão**, para que cada um se sinta parte da célula.

**Quebra-gelo:** [pergunta para a célula se soltar]

**Líder:** caso haja alguém novo, apresente-o à célula.

## Hora da Exaltação
Este é o momento em que os membros são conduzidos à **adoração** a Deus, que pode ser feita de diferentes formas: em oração, celebração, recitando textos bíblicos ou poesias, louvores, entre outros.

**Dica de exaltação:** [como conduzir a exaltação nesta semana]

**Líder:** busque trazer diferentes formas de exaltar o Senhor!

## Hora da Edificação
Este é o momento para a célula **compartilhar** e refletir verdades simples da palavra de Deus, levando-a para o seu viver diário.

**Líder:** lembre-se! Você não está ali para pregar. E sim, para conduzir a célula ao DIÁLOGO e reflexão! (Incentive os participantes a compartilharem e falarem ao longo da palavra).

**[TÍTULO DO ESTUDO]**
Texto - [livro capítulo:versículos]

**Introdução**
[texto da introdução]

## 1. [Primeiro ponto]
[texto do primeiro ponto]

**Reflexão:** [pergunta para a célula]

**Dica pro líder:** [textos de apoio e como conduzir]

## 2. [Segundo ponto]
[texto do segundo ponto]

**Reflexão:** [pergunta para a célula]

**Dica pro líder:** [textos de apoio e como conduzir]

## 3. [Terceiro ponto]
[texto do terceiro ponto]

**Reflexão:** [pergunta para a célula]

**Dica pro líder:** [textos de apoio e como conduzir]

## Hora do Evangelismo
Este é um momento para incentivar a célula a **anunciar** as boas novas ao mundo no cotidiano: intercedendo, fazendo boas ações, conversando sobre Jesus.

**Desafio evangelístico:** [desafio da semana]

**Líder:** lembre-se de pedir a cada semana que a célula compartilhe como cumpriu o desafio da última semana!`;

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
        ${it.pdf ? `<div class="pdfview"><div class="pdfbar"><span><strong>${esc(it.pdf.nome || "Roteiro em PDF")}</strong>${it.pdf.paginas ? " · " + pagesTxt(it.pdf.paginas) : ""}</span><a class="btn sm" href="${pdfUrl(it.id)}" target="_blank" rel="noopener">Abrir em nova aba</a></div><div class="pdfpages" id="pdfpages"><p class="dates">Carregando o PDF…</p></div></div>` : ""}
        ${it.roteiro || !it.pdf ? `<div class="prose">${renderProse(it.roteiro) || '<p style="color:var(--muted)">Este roteiro ainda não tem conteúdo.</p>'}</div>` : ""}
      </div>
      <div class="dlg-foot">
        <span class="dates">${it.criadoEm ? "Criado em " + fmtDate(it.criadoEm) : ""}${it.atualizadoEm && it.atualizadoEm !== it.criadoEm ? " · editado em " + fmtDate(it.atualizadoEm) : ""}</span>
        <span style="display:flex;flex-wrap:wrap;gap:8px">${writable ? `<button class="btn danger" type="button" data-act="del">Excluir</button><button class="btn" type="button" data-act="edit">Editar</button>` : ""}<button class="btn primary" type="button" data-act="download">Baixar PDF</button></span>
      </div>`;
    if (!dlg.open) dlg.showModal();
    inner.querySelector(".dlg-body").scrollTop = 0;
    openSig = sig(it);
    if (it.pdf) renderPdfPages(it.id); else ++pdfToken;
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
        <div class="field">
          <div class="labelrow"><label for="f-roteiro">Roteiro <small>## título · - item · 1. pergunta · &gt; citação · **negrito** · troque o que está entre [colchetes]</small></label><button class="btn sm" type="button" data-act="use-template">Usar modelo da célula</button></div>
          <textarea id="f-roteiro">${esc(it ? it.roteiro : MODELO_CELULA)}</textarea></div>
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
    const fd = new FormData();
    if (prev) fd.append("id", prev.id);
    fd.append("titulo", titulo);
    fd.append("passagem", $("f-passagem").value.trim());
    fd.append("tags", JSON.stringify(parseTags($("f-tags").value)));
    fd.append("resumo", $("f-resumo").value.trim());
    const texto = $("f-roteiro").value.replace(/\s+$/, "");
    fd.append("roteiro", texto === MODELO_CELULA ? "" : texto); // modelo sem nenhuma mudança não é salvo
    if (pdfDraft.file) {
      fd.append("pdf", pdfDraft.file, pdfDraft.file.name);
      fd.append("pdf_paginas", pdfDraft.pages || "");
      fd.append("texto_pdf", pdfDraft.text || "");
    } else if (pdfDraft.remove) fd.append("remover_pdf", "1");
    const btn = $("f-save"); btn.disabled = true; btn.textContent = pdfDraft.file ? "Enviando PDF…" : "Salvando…";
    try {
      const { roteiro } = await api("roteiro_salvar", { form: fd });
      const id = String(roteiro.id);
      toast("Roteiro salvo");
      openId = id;
      await loadItems();
      openRead(id);
    } catch (ex) {
      btn.disabled = false; btn.textContent = "Salvar roteiro";
      err.textContent = ex.erro;
      if (ex.status === 403) { readOnly = true; render(); }
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
    try {
      await api("roteiro_excluir", { body: { id: it.id } });
    } catch (ex) {
      btn.disabled = false; btn.textContent = "Não foi possível excluir";
      return;
    }
    closeDlg(); toast("Roteiro excluído");
    loadItems();
  }

  // ---------- Alterar senha ----------
  function openPass() {
    openId = null; ++pdfToken;
    inner.innerHTML = `
      <div class="dlg-head"><strong>Alterar senha</strong><button class="x" type="button" data-act="close" aria-label="Fechar">×</button></div>
      <form class="edit dlg-body" id="passform" novalidate>
        <div class="field"><label for="cp-atual">Senha atual</label><input id="cp-atual" type="password" autocomplete="current-password"></div>
        <div class="field"><label for="cp-pass">Nova senha <small>mínimo de 8 caracteres</small></label><input id="cp-pass" type="password" autocomplete="new-password"></div>
        <div class="field"><label for="cp-pass2">Repita a nova senha</label><input id="cp-pass2" type="password" autocomplete="new-password"></div>
        <div class="err" id="cp-msg" role="alert"></div>
      </form>
      <div class="dlg-foot"><span></span><span style="display:flex;gap:8px"><button class="btn" type="button" data-act="close">Cancelar</button><button class="btn primary" type="submit" form="passform" id="cp-save">Salvar nova senha</button></span></div>`;
    if (!dlg.open) dlg.showModal();
    $("cp-atual").focus();
  }
  async function savePass(e) {
    e.preventDefault();
    const msg = $("cp-msg");
    if (!$("cp-atual").value) { msg.textContent = "Digite sua senha atual."; return; }
    const bad = checkNewPass($("cp-pass").value, $("cp-pass2").value);
    if (bad) { msg.textContent = bad; return; }
    const btn = $("cp-save"); btn.disabled = true;
    try {
      await api("senha", { body: { atual: $("cp-atual").value, nova: $("cp-pass").value } });
      closeDlg(); toast("Senha alterada");
    } catch (ex) {
      msg.textContent = ex.erro;
    } finally {
      btn.disabled = false;
    }
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

  async function renderPdfPages(id) {
    const token = ++pdfToken;
    const box = $("pdfpages"); if (!box) return;
    try {
      const res = await fetch(pdfUrl(id), { credentials: "same-origin" });
      if (!res.ok) throw new Error("http " + res.status);
      const bytes = new Uint8Array(await res.arrayBuffer());
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
    if (it.pdf) {
      const a = document.createElement("a");
      a.href = pdfUrl(it.id, true); a.download = "";
      document.body.appendChild(a); a.click(); a.remove();
      toast("Download iniciado");
      return;
    }
    const label = btn.textContent; btn.disabled = true; btn.textContent = "Preparando…";
    try {
      saveBlob(await makePdf(it), safeName(`${pad(it.numero)} - ${it.titulo}`) + ".pdf");
      toast("Download iniciado");
    } catch (ex) {
      toast("Não foi possível gerar o PDF agora. Tente de novo.");
    } finally {
      if (btn.isConnected) { btn.disabled = false; btn.textContent = label; }
    }
  }

  // ---------- Usuários (admin) ----------
  let users = [], editingUser = null, uArmTimer = null;
  async function openUsers() {
    if (!canWriteNow()) return;
    openId = null; ++pdfToken; editingUser = null;
    inner.innerHTML = `
      <div class="dlg-head"><strong>Usuários</strong><button class="x" type="button" data-act="close" aria-label="Fechar">×</button></div>
      <div class="dlg-body" style="display:flex;flex-direction:column;gap:18px">
        <p style="margin:0;color:var(--muted)">Leitores pesquisam, leem e baixam roteiros. Administradores também adicionam, editam e excluem roteiros e cadastram pessoas.</p>
        <div id="userform-wrap"></div>
        <div class="userlist" id="userlist"><div class="urow"><span class="who"><span>Carregando…</span></span></div></div>
        <div><strong class="sectitle">Links de convite ativos</strong><div id="invites"><p class="dates" style="margin:0">Carregando…</p></div></div>
      </div>
      <div class="dlg-foot"><span class="dates" id="usercount"></span><span style="display:flex;flex-wrap:wrap;gap:8px"><button class="btn" type="button" data-act="inv-new">Convidar por link</button><button class="btn primary" type="button" data-act="u-new">+ Adicionar usuário</button></span></div>`;
    if (!dlg.open) dlg.showModal();
    await Promise.all([loadUsers(), loadInvites()]);
  }
  async function loadUsers() {
    try {
      users = (await api("usuarios")).usuarios || [];
    } catch (ex) {
      const l = $("userlist");
      if (l) l.innerHTML = `<div class="urow"><span class="who"><span>${esc(ex.erro)}</span></span></div>`;
      return;
    }
    renderUsers();
  }
  function renderUsers() {
    const l = $("userlist"); if (!l) return;
    const admins = users.filter(u => u.is_admin).length;
    $("usercount").textContent = `${users.length} ${users.length === 1 ? "pessoa" : "pessoas"} · ${admins} ${admins === 1 ? "admin" : "admins"}`;
    l.innerHTML = users.map(u => `
      <div class="urow">
        <span class="avatar-i" aria-hidden="true">${esc((u.nome || u.email)[0] || "?")}</span>
        <span class="who"><strong>${esc(u.nome || u.email)}</strong><span>${esc(u.email)}${u.trocar_senha ? " · ainda com senha provisória" : ""}${u.id === me?.id ? " · você" : ""}</span></span>
        <span class="badge${u.is_admin ? " admin" : ""}">${u.is_admin ? "Admin" : "Leitor"}</span>
        <button class="btn sm" type="button" data-act="u-edit" data-uid="${u.id}">Editar</button>
      </div>`).join("");
  }
  function openUserForm(u) {
    editingUser = u || null;
    const wrap = $("userform-wrap"); if (!wrap) return;
    const self = !!u && u.id === me?.id;
    wrap.innerHTML = `
      <form class="edit userform" id="userform" novalidate>
        <strong>${u ? "Editar " + esc(u.nome || u.email) : "Novo usuário"}</strong>
        <div class="row2">
          <div class="field"><label for="u-nome">Nome</label><input id="u-nome" maxlength="120" value="${esc(u?.nome)}"></div>
          <div class="field"><label for="u-email">E-mail</label><input id="u-email" type="email" maxlength="190" value="${esc(u?.email)}"></div>
        </div>
        <div class="field"><label for="u-senha">${u ? "Nova senha provisória <small>deixe em branco para manter a atual</small>" : "Senha provisória <small>mínimo de 8 caracteres · a pessoa troca no primeiro acesso</small>"}</label>
          <div style="display:flex;gap:8px"><input id="u-senha" type="text" autocomplete="off" spellcheck="false"><button class="btn sm" type="button" data-act="u-gen">Gerar</button></div></div>
        <label class="check"><input type="checkbox" id="u-admin"${u?.is_admin ? " checked" : ""}${self ? " disabled" : ""}> Administrador</label>
        <div class="err" id="u-err" role="alert"></div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between">
          <span>${u && !self ? '<button class="btn danger" type="button" data-act="u-del">Remover usuário</button>' : ""}</span>
          <span style="display:flex;gap:8px"><button class="btn" type="button" data-act="u-cancel">Cancelar</button><button class="btn primary" type="submit" id="u-save">Salvar usuário</button></span>
        </div>
      </form>`;
    $("u-nome").focus();
  }
  async function saveUser(e) {
    e.preventDefault();
    const err = $("u-err");
    const self = !!editingUser && editingUser.id === me?.id;
    const body = {
      id: editingUser?.id || 0,
      nome: $("u-nome").value.trim(),
      email: $("u-email").value.trim(),
      senha: $("u-senha").value,
      is_admin: self || $("u-admin").checked
    };
    if (!body.email) { err.textContent = "Digite o e-mail."; return; }
    if ((!editingUser || body.senha) && body.senha.length < 8) { err.textContent = "A senha provisória precisa de pelo menos 8 caracteres."; return; }
    const btn = $("u-save"); btn.disabled = true;
    try {
      await api("usuario_salvar", { body });
      $("userform-wrap").innerHTML = "";
      editingUser = null;
      toast(body.senha ? "Usuário salvo. Envie o e-mail e a senha provisória para a pessoa." : "Usuário salvo");
      await loadUsers();
    } catch (ex) {
      err.textContent = ex.erro; btn.disabled = false;
    }
  }
  async function delUser(btn) {
    if (!editingUser) return;
    if (!btn.classList.contains("armed")) {
      btn.classList.add("armed"); btn.textContent = "Confirmar remoção";
      clearTimeout(uArmTimer); uArmTimer = setTimeout(() => { btn.classList.remove("armed"); btn.textContent = "Remover usuário"; }, 4000);
      return;
    }
    btn.disabled = true;
    try {
      await api("usuario_excluir", { body: { id: editingUser.id } });
      $("userform-wrap").innerHTML = ""; editingUser = null;
      toast("Usuário removido");
      await loadUsers();
    } catch (ex) {
      $("u-err").textContent = ex.erro; btn.disabled = false;
    }
  }
  // ---------- Convites por link (admin) ----------
  let invites = [], invArmTimer = null;
  async function loadInvites() {
    try {
      invites = (await api("convites")).convites || [];
    } catch (ex) {
      const box = $("invites");
      if (box) box.innerHTML = `<p class="dates" style="margin:0">${esc(ex.erro)}</p>`;
      return;
    }
    renderInvites();
  }
  function renderInvites() {
    const box = $("invites"); if (!box) return;
    if (!invites.length) {
      box.innerHTML = `<p class="dates" style="margin:0">Nenhum link ativo. Use “Convidar por link” para criar um.</p>`;
      return;
    }
    box.innerHTML = `<div class="userlist">${invites.map(c => `
      <div class="urow">
        <span class="who"><strong>${c.is_admin ? "Administrador" : "Leitor"} · ${c.multiplo ? "várias pessoas" : "uma pessoa"}</strong>
          <span>Vale até ${esc(fmtDate(c.expira_em))}${c.multiplo ? ` · ${c.usos} ${c.usos === 1 ? "conta criada" : "contas criadas"}` : ""}${c.criado_por ? " · criado por " + esc(c.criado_por) : ""}</span></span>
        <span class="badge${c.is_admin ? " admin" : ""}">${c.is_admin ? "Admin" : "Leitor"}</span>
        <button class="btn sm danger" type="button" data-act="inv-revoke" data-iid="${c.id}">Desativar</button>
      </div>`).join("")}</div>`;
  }
  function openInviteForm() {
    editingUser = null;
    const wrap = $("userform-wrap"); if (!wrap) return;
    wrap.innerHTML = `
      <form class="edit userform" id="invform" novalidate>
        <strong>Novo link de convite</strong>
        <p class="dates" style="margin:0">Quem abrir o link cria a própria conta, com nome, e-mail e senha.</p>
        <fieldset class="opts"><legend>Entra como</legend>
          <label class="check"><input type="radio" name="inv-role" value="0" checked> Leitor <small>pesquisa, lê e baixa os roteiros</small></label>
          <label class="check"><input type="radio" name="inv-role" value="1"> Administrador <small>também adiciona, edita, exclui e cadastra pessoas</small></label>
        </fieldset>
        <fieldset class="opts"><legend>Quantas pessoas podem usar</legend>
          <label class="check"><input type="radio" name="inv-uso" value="0" checked> Uma pessoa</label>
          <label class="check" id="inv-multi-label"><input type="radio" name="inv-uso" value="1"> Várias pessoas <small id="inv-multi-note">bom para mandar no grupo da célula</small></label>
        </fieldset>
        <div class="field"><label for="inv-dias">Vale por</label>
          <select id="inv-dias"><option value="1">1 dia</option><option value="7" selected>7 dias</option><option value="30">30 dias</option></select></div>
        <div class="err" id="inv-err" role="alert"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" type="button" data-act="u-cancel">Cancelar</button><button class="btn primary" type="submit" id="inv-save">Criar link</button></div>
      </form>`;
  }
  function syncInviteForm() {
    const admin = document.querySelector('input[name="inv-role"]:checked')?.value === "1";
    const multi = document.querySelector('input[name="inv-uso"][value="1"]');
    if (!multi) return;
    multi.disabled = admin;
    if (admin) document.querySelector('input[name="inv-uso"][value="0"]').checked = true;
    $("inv-multi-note").textContent = admin ? "links de administrador valem para uma pessoa só" : "bom para mandar no grupo da célula";
  }
  async function createInvite(e) {
    e.preventDefault();
    const btn = $("inv-save"); btn.disabled = true;
    const body = {
      is_admin: document.querySelector('input[name="inv-role"]:checked')?.value === "1",
      multiplo: document.querySelector('input[name="inv-uso"]:checked')?.value === "1",
      dias: +$("inv-dias").value
    };
    try {
      const r = await api("convite_criar", { body });
      const link = `${location.origin}${location.pathname}#convite=${r.token}`;
      const papel = r.is_admin ? "Administrador" : "Leitor";
      const texto = `Você foi convidado para a biblioteca de roteiros das células One Flow como ${papel}. Crie sua conta neste link: ${link}`;
      $("userform-wrap").innerHTML = `
        <div class="userform invite-done">
          <strong>Link criado: entra como ${papel} · ${r.multiplo ? "várias pessoas" : "uma pessoa"} · vale até ${esc(fmtDate(r.expira_em))}</strong>
          <div style="display:flex;gap:8px"><input id="inv-link" class="invlink" readonly value="${esc(link)}" aria-label="Link de convite"><button class="btn sm primary" type="button" data-act="inv-copy">Copiar</button></div>
          <p class="dates" style="margin:0">Este link aparece só agora. Copie e envie para ${r.multiplo ? "as pessoas" : "a pessoa"}. Se perder, crie outro.</p>
          <div style="display:flex;flex-wrap:wrap;gap:8px"><a class="btn sm" href="https://wa.me/?text=${encodeURIComponent(texto)}" target="_blank" rel="noopener">Enviar pelo WhatsApp</a><button class="btn sm" type="button" data-act="u-cancel">Fechar</button></div>
        </div>`;
      $("inv-link").select();
      await loadInvites();
    } catch (ex) {
      $("inv-err").textContent = ex.erro; btn.disabled = false;
    }
  }
  async function copyInvite(btn) {
    const input = $("inv-link"); if (!input) return;
    try { await navigator.clipboard.writeText(input.value); btn.textContent = "Copiado"; toast("Link copiado"); }
    catch (e) { input.select(); toast("Selecione e copie o link com Ctrl+C"); }
  }
  async function revokeInvite(btn) {
    if (!btn.classList.contains("armed")) {
      btn.classList.add("armed"); btn.textContent = "Confirmar";
      clearTimeout(invArmTimer); invArmTimer = setTimeout(() => { btn.classList.remove("armed"); btn.textContent = "Desativar"; }, 4000);
      return;
    }
    btn.disabled = true;
    try {
      await api("convite_revogar", { body: { id: +btn.dataset.iid } });
      toast("Link desativado");
      await loadInvites();
    } catch (ex) {
      btn.disabled = false; toast(ex.erro);
    }
  }
  document.addEventListener("change", e => { if (e.target.name === "inv-role") syncInviteForm(); });

  const genPass = () => {
    const abc = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", a = new Uint32Array(10);
    crypto.getRandomValues(a);
    return [...a].map(n => abc[n % abc.length]).join("");
  };
  $("users").addEventListener("click", openUsers);

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
      let text = "", pages = null;
      try { const r = await readPdfFile(x.file); text = r.text; pages = r.pages; } catch (e) {}
      x.st = "Enviando…"; renderImportList();
      try {
        const fd = new FormData();
        fd.append("titulo", titleFromFile(x.file.name));
        fd.append("tags", JSON.stringify(tags));
        fd.append("roteiro", "");
        fd.append("pdf", x.file, x.file.name);
        fd.append("pdf_paginas", pages || "");
        fd.append("texto_pdf", text);
        const { roteiro } = await api("roteiro_salvar", { form: fd });
        done++; x.ok = true; x.st = pad(roteiro.numero) + " criado";
      } catch (ex) {
        x.st = "Não importado";
        const el = $("imp-err"); if (el) el.textContent = ex.erro;
        if ([401, 403, 419].includes(ex.status)) { stop = true; if (ex.status === 403) readOnly = true; }
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
    else if (act === "u-new") openUserForm(null);
    else if (act === "u-edit") openUserForm(users.find(u => String(u.id) === actEl.dataset.uid));
    else if (act === "u-cancel") { $("userform-wrap").innerHTML = ""; editingUser = null; }
    else if (act === "u-del") delUser(actEl);
    else if (act === "u-gen") { const i = $("u-senha"); if (i) { i.value = genPass(); i.select(); } }
    else if (act === "use-template") {
      const ta = $("f-roteiro");
      if (ta && (!ta.value.trim() || actEl.classList.contains("armed"))) {
        ta.value = MODELO_CELULA; ta.focus(); ta.setSelectionRange(0, 0); ta.scrollTop = 0;
        actEl.classList.remove("armed"); actEl.textContent = "Usar modelo da célula";
      } else if (ta) {
        actEl.classList.add("armed"); actEl.textContent = "Substituir o texto atual?";
        setTimeout(() => { if (actEl.isConnected) { actEl.classList.remove("armed"); actEl.textContent = "Usar modelo da célula"; } }, 4000);
      }
    }
    else if (act === "inv-new") openInviteForm();
    else if (act === "inv-copy") copyInvite(actEl);
    else if (act === "inv-revoke") revokeInvite(actEl);
  });
  document.addEventListener("submit", e => {
    if (e.target.id === "form") save(e);
    else if (e.target.id === "passform") savePass(e);
    else if (e.target.id === "userform") saveUser(e);
    else if (e.target.id === "invform") createInvite(e);
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
  boot();
})();
