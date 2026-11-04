/**
 * menu_import.js ― 毎月のメニュー表（PDF）を取り込む画面（v50。スタッフ画面の中の1ページ。Staff.page = 'menuImport'）
 *
 *   開き方：実施状況のいちばん下「メニュー表（PDF）を取り込む」、または声で「メニューを取り込んで」
 *   流れ  ：① PDF（例「1年生.pdf」。Excel から作ったメニュー表）を選ぶ → この端末の中で読み取る（pdf.js。サーバーには送らない）
 *           ② 読み取った Day・種目・テンポ・回数・セット数・レスト・RIR と、推奨曜日を表で確かめる（直せる）
 *           ③ メニューID・チーム・開始日を決めて「反映する」（Apps Script の menuImport。メニュー取り込み.gs）
 *              前の月のメニューは消さずに残す。開始日から、そのチームの選手を新しいメニューに切り替える（予定にもできる）
 *   ★ メニュー表の作り（列の並び・見出しの言葉）が大きく変わったら、MenuImport.parse を直す
 *     見出しの言葉：「Day 1」「カテゴリー」「エクササイズ名」「テンポ」「回数」「セット数」「レスト」「RIR」、下の週の表「Mon〜Sun」
 */
var MenuImport = {
  PDFJS: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
  WORKER: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
  info: null,      // menuInfo の結果
  parsed: null,    // 読み取った内容
  result: null,
  msg: '',

  open: function () {
    if (S.view !== 'staff') return;
    if (Staff.page !== 'menuImport') {
      Staff.returnTo = { tab: Staff.tab, scroll: window.scrollY || 0 };
      try { history.pushState({ staffMenuImport: 1 }, ''); } catch (e) { /* 「戻る」ボタンでも戻れる */ }
    }
    Staff.page = 'menuImport';
    MenuImport.parsed = null; MenuImport.result = null; MenuImport.msg = '';
    MenuImport.render();
    window.scrollTo(0, 0);
    MenuImport.loadInfo();
  },
  loadInfo: function () {
    return Api.call('menuInfo', { token: S.token }).then(function (res) { MenuImport.info = res; if (Staff.page === 'menuImport') MenuImport.render(); })
      .catch(function (err) { MenuImport.msg = msgHtml('error', err.message); MenuImport.render(); });
  },
  back: function () { var st = history.state || {}; if (st.staffMenuImport) history.back(); else MenuImport.leave(); },
  leave: function () { Staff.leaveAthlete(); },

  frame: function (inner) {
    return Staff.athleteFrame('<h1 class="ath-name">メニュー表の取り込み</h1>' +
      '<p class="muted small">毎月のメニュー表（Excel から作ったPDF。例「1年生.pdf」）を読み取り、確かめてからメニューに足します。前の月のメニューは消さずに残ります。</p>', inner, 'メニューの管理');
  },

  render: function () {
    var html = MenuImport.msg ? '<div class="card">' + MenuImport.msg + '</div>' : '';
    if (MenuImport.result) html += MenuImport.resultHtml();
    html += '<div class="card"><h2>1. PDFを選ぶ</h2><p class="muted small">チームごとに1つずつ選びます。PDFはこの端末の中で読み取ります。</p>' +
      '<input type="file" accept="application/pdf,.pdf" id="miFile" class="mi-file"></div>';
    if (MenuImport.parsed) html += MenuImport.previewHtml();
    html += MenuImport.listHtml();
    app.innerHTML = MenuImport.frame(html);
    if (MenuImport.parsed) MenuImport.sync();
  },

  // ---------------- PDFを読む ----------------
  loadPdfjs: function () {
    if (window.pdfjsLib) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var sc = document.createElement('script');
      sc.src = MenuImport.PDFJS;
      sc.onload = function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = MenuImport.WORKER; resolve(); };
      sc.onerror = function () { reject(new Error('PDFを読む部品を読み込めませんでした。通信できる場所で、もう一度試してください。')); };
      document.head.appendChild(sc);
    });
  },
  /** PDFの文字を、位置つきの一覧にする：[{ s, x, y, w, page }]（y は上から下へ増える。ページごとに 10000 ずらす） */
  readItems: function (file) {
    return MenuImport.loadPdfjs().then(function () { return file.arrayBuffer(); }).then(function (buf) {
      return window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    }).then(function (doc) {
      var all = [], chain = Promise.resolve();
      for (var p = 1; p <= Math.min(doc.numPages, 10); p++) (function (p) {
        chain = chain.then(function () { return doc.getPage(p); }).then(function (page) {
          var vp = page.getViewport({ scale: 1 });
          return page.getTextContent().then(function (tc) {
            tc.items.forEach(function (i) {
              if (!i.str || !i.str.trim()) return;
              all.push({ s: i.str, x: i.transform[4], y: (p - 1) * 10000 + vp.height - i.transform[5], w: i.width, page: p });
            });
          });
        });
      })(p);
      return chain.then(function () { return all; });
    });
  },
  onFile: function (file) {
    if (!file) return;
    MenuImport.msg = ''; MenuImport.result = null;
    app.querySelector('#miFile').insertAdjacentHTML('afterend', '<div class="loading" id="miLoading">読み取り中…</div>');
    MenuImport.readItems(file).then(function (items) {
      // v53b：文字が入っていないPDF（「Microsoft Print to PDF」で印刷し直したもの・スキャンしたもの）は、文字が画像になっていて読めない
      if (items.length < 20) throw new Error('このPDFは、文字が画像になっているため読み取れません（「Microsoft Print to PDF」などで印刷し直したPDFや、スキャンしたPDFはこうなります）。' +
        'Excel のメニュー表から「ファイル」→「エクスポート」（または「名前を付けて保存」で種類を PDF）で作ったPDFか、印刷し直す前の元のPDFを選んでください。');
      var p = MenuImport.parse(items);
      if (!p.rows.length) throw new Error('このPDFからメニューを読み取れませんでした。「Day 1」「エクササイズ名」「テンポ」などの見出しがあるメニュー表か確かめてください（月間スケジュールのPDFは取り込めません）。');
      p.fileName = file.name;
      p.team = MenuImport.guessTeam(file.name);
      p.menuId = MenuImport.defaultId(p.start, p.team);
      p.switchTeam = true;
      MenuImport.parsed = p;
      MenuImport.render();
      var box = document.getElementById('miPreview'); if (box) box.scrollIntoView({ block: 'start' });
    }).catch(function (err) { MenuImport.parsed = null; MenuImport.msg = msgHtml('error', err.message); MenuImport.render(); });
  },

  /**
   * 文字の一覧から、メニューを読み取る（この関数だけで完結。テストしやすいように）
   *   返すもの: { start: 'yyyy-mm-dd', phase, purpose, goal, days: [{ day, name, weekday }], rows: [{ day, order, category, name, tempo, reps, sets, rest, rir }] }
   */
  parse: function (items) {
    var N = function (s) { return String(s || '').normalize('NFKC').replace(/\s+/g, ' ').trim(); };
    var it = items.map(function (i) { return { s: N(i.s), x: i.x, y: i.y, w: i.w || 0, cx: i.x + (i.w || 0) / 2 }; }).filter(function (i) { return i.s; });
    var heads = it.filter(function (i) { return /^Day ?(\d+)$/i.test(i.s); }).map(function (i) { return { day: Number(/(\d+)/.exec(i.s)[1]), x: i.x, y: i.y, cx: i.cx }; })
      .sort(function (a, b) { return a.y - b.y; });
    // 下の週の表（Mon〜Sun）
    var WK = { mon: '月', tue: '火', wed: '水', thu: '木', fri: '金', sat: '土', sun: '日', '月': '月', '火': '火', '水': '水', '木': '木', '金': '金', '土': '土', '日': '日' };
    var wkItems = it.filter(function (i) { return /^(mon|tue|wed|thu|fri|sat|sun)$/i.test(i.s); });
    var wkRow = null;
    wkItems.forEach(function (a) {
      var same = wkItems.filter(function (b) { return Math.abs(b.y - a.y) < 4; });
      if (same.length >= 5 && (!wkRow || a.y > wkRow.y)) wkRow = { y: a.y, cols: same.map(function (b) { return { wd: WK[b.s.toLowerCase()], cx: b.cx }; }) };
    });
    var near = function (label, y0, y1) {
      return it.filter(function (i) { return i.s.replace(/\s/g, '') === label && i.y >= y0 && i.y <= y1; }).sort(function (a, b) { return a.x - b.x; });
    };
    var out = { start: '', phase: '', purpose: '', goal: '', days: [], rows: [] };
    heads.forEach(function (h, k) {
      var y0 = h.y - 15, y1 = h.y + 15;
      var col = function (label) { return near(label, y0, y1)[0]; };
      var cat = col('カテゴリー') || col('カテゴリ'), nm = col('エクササイズ名'), tempo = col('テンポ'), reps = col('回数'), rest = col('レスト'), rir = col('RIR');
      var setsAll = near('セット数', y0, y1), sets = setsAll[0];
      if (!nm || !reps || !sets) return;
      var weekX = setsAll[1] ? setsAll[1].x - 2 : (rir ? rir.x + rir.w + 8 : sets.x + 60);
      var cols = [['no', h.cx], ['category', cat ? cat.cx : (h.cx + nm.cx) / 2], ['name', nm.cx], ['tempo', tempo && tempo.cx], ['reps', reps.cx], ['sets', sets.cx], ['rest', rest && rest.cx], ['rir', rir && rir.cx]]
        .filter(function (c) { return c[1] !== undefined && c[1] !== null; });
      var headBottom = Math.max.apply(null, [h.y, nm.y, reps.y, sets.y].concat(rir ? [rir.y] : []));
      var next = heads[k + 1] ? heads[k + 1].y - 20 : (wkRow && wkRow.y > h.y ? wkRow.y - 8 : h.y + 400);
      var body = it.filter(function (i) { return i.y > headBottom + 3 && i.y < next && i.cx < weekX && i.x > h.x - 20 && !/負荷|回数 ?\(|^\(?kg\)?$|^\(?回\)?$/.test(i.s); });
      // 行ごとにまとめる（y が近いもの）
      body.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
      var lines = [];
      body.forEach(function (i) {
        var L = lines[lines.length - 1];
        if (L && Math.abs(i.y - L.y) <= 4) L.items.push(i); else lines.push({ y: i.y, items: [i] });
      });
      var order = 0;
      lines.forEach(function (L) {
        var cell = {};
        L.items.sort(function (a, b) { return a.x - b.x; }).forEach(function (i) {
          var best = cols.reduce(function (b, c) { return Math.abs(c[1] - i.cx) < Math.abs(b[1] - i.cx) ? c : b; });
          cell[best[0]] = cell[best[0]] ? cell[best[0]] + ' ' + i.s : i.s;
        });
        var name = cell.name || '';
        if (!name || /^\d+$/.test(name)) return;
        order++;
        var dash = function (v) { v = N(v); return /^[-ー－―‐]+$/.test(v) ? '' : v; };
        out.rows.push({ day: h.day, order: order, category: dash(cell.category), name: name, tempo: dash(cell.tempo), reps: dash(cell.reps),
                        sets: dash(cell.sets), rest: dash(cell.rest), rir: dash(cell.rir) });
      });
      if (out.days.every(function (d) { return d.day !== h.day; })) out.days.push({ day: h.day, name: '', weekday: '' });
    });
    // 推奨曜日・Day名（週の表の「Day 1（下）」）
    if (wkRow) {
      it.filter(function (i) { return i.y > wkRow.y + 3 && i.y < wkRow.y + 40 && /Day ?\d+/i.test(i.s); }).forEach(function (i) {
        var day = Number(/Day ?(\d+)/i.exec(i.s)[1]);
        var c = wkRow.cols.reduce(function (b, x) { return Math.abs(x.cx - i.cx) < Math.abs(b.cx - i.cx) ? x : b; });
        var d = out.days.filter(function (x) { return x.day === day; })[0];
        if (!d) return;
        if (!d.weekday) d.weekday = c.wd;
        var m = /[(（]([^)）]+)[)）]/.exec(i.s);
        if (m && !d.name) d.name = { '下': '下半身', '上': '上半身', '全': '全身' }[m[1]] || m[1];
      });
    }
    // Day名が無いときは、カテゴリ（LB＝下半身、UB＝上半身）から
    out.days.forEach(function (d) {
      if (d.name) return;
      var cats = out.rows.filter(function (r) { return r.day === d.day; }).map(function (r) { return r.category; }).join(' ');
      var lb = (cats.match(/LB/g) || []).length, ub = (cats.match(/UB/g) || []).length;
      d.name = lb && ub ? '全身' : lb ? '下半身' : ub ? '上半身' : '';
    });
    out.days.sort(function (a, b) { return a.day - b.day; });
    // 上の欄：期間の始まり（「2026/10/1〜」）、その上のフェイズ名、目的、目標値
    var top = heads.length ? heads[0].y : Infinity;
    var dt = it.filter(function (i) { return i.y < top && /(\d{4})[\/.\-年](\d{1,2})[\/.\-月](\d{1,2})/.test(i.s); })[0];
    if (dt) {
      var m = /(\d{4})[\/.\-年](\d{1,2})[\/.\-月](\d{1,2})/.exec(dt.s);
      out.start = m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
      var ph = it.filter(function (i) { return i.y < dt.y && dt.y - i.y < 18 && Math.abs(i.cx - dt.cx) < 20 && !/\d{4}/.test(i.s); }).sort(function (a, b) { return b.y - a.y; })[0];
      if (ph) out.phase = ph.s;
    }
    var right = function (label) {
      var l = it.filter(function (i) { return i.s.replace(/\s/g, '') === label && i.y < top; })[0];
      if (!l) return '';
      var v = it.filter(function (i) { return Math.abs(i.y - l.y) < 4 && i.x > l.x + l.w && i.x - (l.x + l.w) < 120; }).sort(function (a, b) { return a.x - b.x; })[0];
      return v ? v.s : '';
    };
    out.purpose = right('目的');
    out.goal = right('目標値');
    return out;
  },

  // ---------------- 確かめる ----------------
  teams: function () { return ((MenuImport.info && MenuImport.info.teams) || []).map(function (t) { return t.team; }); },
  guessTeam: function (fileName) {
    var base = String(fileName || '').normalize('NFKC').replace(/\.pdf$/i, '').replace(/[（(].*?[)）]/g, '').trim();
    var teams = MenuImport.teams();
    var hit = teams.filter(function (t) { return t === base; })[0] ||
              teams.filter(function (t) { return base.indexOf(t) >= 0 || t.indexOf(base) >= 0; })[0] ||
              teams.filter(function (t) { return t.replace(/生$/, '') === base.replace(/生$/, ''); })[0];
    return hit || base.slice(0, 20);
  },
  defaultId: function (start, team) {
    var ym = (start || Body.today()).slice(0, 7);
    var id = ym + '-' + String(team || 'メニュー').replace(/[\s,、]/g, '');
    var used = ((MenuImport.info && MenuImport.info.menus) || []).map(function (m) { return m.id; });
    var n = 2, base = id;
    while (used.indexOf(id) >= 0) id = base + '-' + n++;
    return id;
  },
  /** 種目マスタに無い種目（正式名・呼び方の候補と比べる） */
  unknown: function () {
    var ex = (MenuImport.info && MenuImport.info.exercises) || [], known = {};
    ex.forEach(function (e) { [e.name].concat(e.aliases || []).forEach(function (n) { known[VoiceParser.norm(n)] = true; }); });
    return uniq(MenuImport.parsed.rows.map(function (r) { return r.name; })).filter(function (n) { return n && !known[VoiceParser.norm(n)]; });
  },

  /**
   * v54：種目マスタに無い新しい種目の部位（上半身／下半身）を自動で決める
   *   カテゴリが LB… → 下半身、UB… → 上半身。それ以外（POWER など）は、その種目のある Day の名前（上半身／下半身）、
   *   Day名でも決まらなければ、その Day の LB・UB の種目の多いほう。それでも決まらなければ下半身
   */
  autoPart: function (name) {
    var p = MenuImport.parsed, key = VoiceParser.norm(name);
    var rows = p.rows.filter(function (r) { return VoiceParser.norm(r.name) === key; });
    for (var i = 0; i < rows.length; i++) {
      var c = String(rows[i].category || '').toUpperCase().normalize('NFKC');
      if (/^LB/.test(c)) return '下半身';
      if (/^UB/.test(c)) return '上半身';
    }
    for (var j = 0; j < rows.length; j++) {
      var d = p.days.filter(function (x) { return x.day === rows[j].day; })[0], dn = d ? String(d.name) : '';
      if (/上/.test(dn) && !/下/.test(dn)) return '上半身';
      if (/下/.test(dn) && !/上/.test(dn)) return '下半身';
      var lb = 0, ub = 0;
      p.rows.forEach(function (r) { if (r.day !== rows[j].day) return; var cc = String(r.category || '').toUpperCase(); if (/^LB/.test(cc)) lb++; if (/^UB/.test(cc)) ub++; });
      if (ub > lb) return '上半身';
      if (lb > ub) return '下半身';
    }
    return '下半身';
  },
  partOf: function (name) {
    var p = MenuImport.parsed; p.parts = p.parts || {};
    return p.parts[name] || MenuImport.autoPart(name);
  },
  /** 新しい種目の部位を選ぶ欄（種目名を直したら作り直す） */
  partsHtml: function () {
    var unk = MenuImport.info ? MenuImport.unknown() : [];
    if (!unk.length) return '';
    return '<div class="mi-parts">' + msgHtml('warn', '種目マスタに無い新しい種目が' + unk.length + 'つあります。反映すると、下で選んだ部位（上半身・下半身）で種目マスタに足します。読み間違いの名前なら、下の表で直してください。') +
      '<table class="tbl mi-part-table"><tr><th>新しい種目</th><th>部位</th></tr>' + unk.map(function (n) {
        var v = MenuImport.partOf(n), auto = !(MenuImport.parsed.parts || {})[n];
        return '<tr><td>' + esc(n) + (auto ? '<span class="muted small mi-auto">自動で決めた部位</span>' : '<span class="muted small mi-auto">選び直した部位</span>') + '</td><td><select class="sel" data-mi-part="' + esc(n) + '">' + ['上半身', '下半身'].map(function (x) {
          return '<option' + (x === v ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></td></tr>';
      }).join('') + '</table><p class="muted small">自動の決め方：カテゴリが LB なら下半身、UB なら上半身。POWER などは、その Day が上半身の日か下半身の日かで決めます。</p></div>';
  },
  markUnknown: function () {
    var unk = MenuImport.unknown();
    Array.prototype.forEach.call(document.querySelectorAll('[data-mi-row][data-k="name"]'), function (el) { el.classList.toggle('mi-unk', unk.indexOf(el.value.trim()) >= 0); });
  },
  refreshParts: function () {
    var box = document.getElementById('miParts');
    if (box) box.innerHTML = MenuImport.partsHtml();
  },

  previewHtml: function () {
    var p = MenuImport.parsed, teams = MenuImport.teams();
    var WD = ['', '月', '火', '水', '木', '金', '土', '日'];
    var html = '<div class="card" id="miPreview"><h2>2. 読み取った内容を確かめる</h2>' +
      '<p class="small">' + esc(p.fileName) + (p.phase || p.purpose ? '：' + esc([p.phase, p.purpose, p.goal ? '目標 ' + p.goal : ''].filter(String).join('・')) : '') + '</p>' +
      '<div class="mi-form">' +
      '<label class="small">チーム <select class="sel" id="miTeam">' + uniq(teams.concat(p.team ? [p.team] : [])).map(function (t) {
        return '<option' + (t === p.team ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '<option value="__new">新しいチーム…</option></select></label>' +
      '<input class="sel" id="miNewTeam" placeholder="新しいチーム名" maxlength="20" hidden>' +
      '<label class="small">開始日 <input type="date" class="sel" id="miStart" value="' + esc(p.start) + '"></label>' +
      '<label class="small">メニューID <input class="sel" id="miId" value="' + esc(p.menuId) + '" maxlength="40"></label>' +
      '<label class="check-line small"><input type="checkbox" id="miSwitch"' + (p.switchTeam ? ' checked' : '') + '> <span id="miSwitchText"></span></label></div>';
    var unk = MenuImport.info ? MenuImport.unknown() : [];
    html += '<div id="miParts">' + MenuImport.partsHtml() + '</div>';   // v54：新しい種目を上半身・下半身に振り分ける
    html += '<p class="muted small">表の文字は直せます。読み間違いがないか、元のPDFと見くらべてください。種目名を空にすると、その行は取り込みません。</p>';
    p.days.forEach(function (d) {
      html += '<div class="mi-day"><div class="mi-day-head"><b>Day' + d.day + '</b>' +
        '<input class="sel mi-dname" data-mi-day="' + d.day + '" data-k="name" value="' + esc(d.name) + '" placeholder="Day名（例 下半身）" maxlength="20">' +
        '<label class="small">推奨曜日 <select class="sel" data-mi-day="' + d.day + '" data-k="weekday">' + WD.map(function (w) {
          return '<option value="' + w + '"' + (w === d.weekday ? ' selected' : '') + '>' + (w || 'なし') + '</option>'; }).join('') + '</select></label></div>' +
        '<div class="table-scroll"><table class="tbl mi-table"><tr><th>カテゴリ</th><th>種目</th><th>テンポ</th><th>回数</th><th>セット</th><th>レスト</th><th>RIR</th></tr>' +
        p.rows.map(function (r, i) {
          if (r.day !== d.day) return '';
          var f = function (k, w) { return '<td><input class="mi-in' + (k === 'name' && unk.indexOf(r.name) >= 0 ? ' mi-unk' : '') + '" data-mi-row="' + i + '" data-k="' + k + '" value="' + esc(r[k]) + '" style="width:' + w + 'em"></td>'; };
          return '<tr>' + f('category', 4) + f('name', 11) + f('tempo', 3) + f('reps', 3) + f('sets', 2.5) + f('rest', 3) + f('rir', 2.5) + '</tr>';
        }).join('') + '</table></div></div>';
    });
    return html + '<div class="roster-apply"><button class="btn block" data-mi="apply" id="miApply">このメニューを反映する</button><p class="muted small" id="miCount"></p></div></div>';
  },

  /** 入力に合わせて、切り替えの文と人数を出す */
  sync: function () {
    var p = MenuImport.parsed;
    var ts = document.getElementById('miTeam');
    if (!ts) return;
    document.getElementById('miNewTeam').hidden = ts.value !== '__new';
    var team = MenuImport.team(), start = document.getElementById('miStart').value, today = Body.today();
    var t = ((MenuImport.info && MenuImport.info.teams) || []).filter(function (x) { return x.team === team; })[0];
    document.getElementById('miSwitchText').textContent = (start && start > today ? start.slice(5).replace('-', '/') + 'から' : '今すぐ') + '、' +
      (team || '（チーム）') + 'チームの選手' + (t ? ' ' + t.n + '人' : '（今は0人）') + 'を、このメニューに切り替える' + (start && start > today ? '（その日に自動で切り替わる）' : '');
    var rows = p.rows.filter(function (r) { return String(r.name).trim(); });
    document.getElementById('miCount').textContent = p.days.length + 'Day・' + rows.length + '種目を、メニューID「' + document.getElementById('miId').value + '」で足します。';
  },
  team: function () {
    var ts = document.getElementById('miTeam');
    return ts.value === '__new' ? document.getElementById('miNewTeam').value.trim() : ts.value;
  },

  apply: function (overwrite) {
    var p = MenuImport.parsed, team = MenuImport.team();
    var body = { token: S.token, menuId: document.getElementById('miId').value.trim(), team: team, start: document.getElementById('miStart').value,
      title: [p.phase, p.purpose].filter(String).join('・'), fileName: p.fileName, switchTeam: document.getElementById('miSwitch').checked, overwrite: !!overwrite,
      rows: p.rows.filter(function (r) { return String(r.name).trim(); }),
      weekdays: p.days.filter(function (d) { return d.weekday; }).map(function (d) { return { day: d.day, weekday: d.weekday }; }) };
    body.rows.forEach(function (r) { var d = p.days.filter(function (x) { return x.day === r.day; })[0]; r.dayName = d ? d.name : ''; });
    // v54：種目マスタに無い種目は、選んだ部位で種目マスタに足す
    body.newExercises = (MenuImport.info ? MenuImport.unknown() : []).map(function (n) {
      var r = p.rows.filter(function (x) { return x.name === n; })[0];
      return { name: n, part: MenuImport.partOf(n), category: r ? r.category : '' };
    });
    if (!body.menuId) { alert('メニューIDを入れてください。'); return; }
    if (!team && body.switchTeam) { alert('チームを選んでください。'); return; }
    if (!overwrite && !confirm('メニューID「' + body.menuId + '」で、' + p.days.length + 'Day・' + body.rows.length + '種目を足します。\n' +
        (body.switchTeam ? document.getElementById('miSwitchText').textContent : '選手のメニューは切り替えません。') +
        (body.newExercises.length ? '\n新しい種目' + body.newExercises.length + 'つを、選んだ部位で種目マスタに足します。' : '') + '\nよろしいですか？')) return;
    var btn = document.getElementById('miApply'); btn.disabled = true; btn.textContent = '反映しています…';
    Api.call('menuImport', body).then(function (res) {
      MenuImport.result = res; MenuImport.parsed = null;
      Staff.overview = null; Staff.body = null;
      MenuImport.loadInfo();
      window.scrollTo(0, 0);
    }).catch(function (err) {
      if (/もうあります/.test(err.message) && confirm(err.message + '\n（前の内容は消えて、今回の内容になります）')) return MenuImport.apply(true);
      btn.disabled = false; btn.textContent = 'このメニューを反映する';
      btn.insertAdjacentHTML('afterend', msgHtml('error', err.message));
    });
  },

  resultHtml: function () {
    var r = MenuImport.result;
    return '<div class="card">' + msgHtml('ok', 'メニュー「' + r.menuId + '」を' + (r.overwritten ? '入れ直しました' : '足しました') + '（' + r.days + 'Day・' + r.rows + '種目）。' +
        (r.switched ? r.switched + '人の選手を、このメニューに切り替えました。' : r.planned ? r.start.slice(5).replace('-', '/') + 'に、選手を自動でこのメニューに切り替えます。' : '')) +
      (r.added && r.added.length ? '<p class="small">種目マスタに足した種目：' + esc(r.added.map(function (a) { return a.name + '（' + a.part + '）'; }).join('、')) + '</p>' : '') +   // v54
      (r.unknown.length ? '<p class="small">種目マスタに無い種目：' + esc(r.unknown.join('、')) + '（種目マスタに足すと、部位の集計に入ります）</p>' : '') + '</div>';
  },

  /** 今あるメニューと、切り替えの予定 */
  listHtml: function () {
    var info = MenuImport.info;
    if (!info) return '<div class="card"><div class="loading">メニューの一覧を読み込み中…</div></div>';
    var used = {};
    info.teams.forEach(function (t) { Object.keys(t.menus).forEach(function (m) { used[m] = (used[m] || 0) + t.menus[m]; }); });
    var html = '<div class="card"><h2>今あるメニュー</h2>';
    if (info.plans.length) html += '<h3 class="mp-sub">切り替えの予定</h3><ul class="mi-plans">' + info.plans.map(function (p) {
      return '<li>' + esc(p.start.slice(5).replace('-', '/')) + '：' + esc(p.team) + 'チーム → ' + esc(p.menuId) + ' <button class="btn ghost small" data-mi="cancel" data-v="' + p.row + '">取り消す</button></li>';
    }).join('') + '</ul>';
    html += '<table class="line-table"><tbody>' + info.menus.slice().reverse().map(function (m) {
      return '<tr><td>' + esc(m.id) + '<div class="muted small">' + esc(m.team ? m.team + 'チーム向け' : '対象チームなし') + '・' + m.days + 'Day</div></td><td class="r">' +
        (used[m.id] ? '<b>' + used[m.id] + '人</b>が使用中' : '<span class="muted">使っている人なし</span>') + '</td></tr>';
    }).join('') + '</tbody></table><p class="muted small">選手ごとの使用メニューは、選手一覧の「チーム分け」でも変えられます。使っていない古いメニューは、メニューシートから消してもかまいません（記録は残ります）。</p></div>';
    return html;
  }
};

// この画面の操作
app.addEventListener('change', function (e) {
  if (S.view !== 'staff' || Staff.page !== 'menuImport') return;
  var t = e.target, p = MenuImport.parsed;
  if (t.id === 'miFile') return MenuImport.onFile(t.files && t.files[0]);
  if (!p) return;
  if (t.dataset.miRow !== undefined) {
    p.rows[Number(t.dataset.miRow)][t.dataset.k] = t.value.trim();
    if (t.dataset.k === 'name' || t.dataset.k === 'category') { MenuImport.refreshParts(); MenuImport.markUnknown(); }   // v54：新しい種目の一覧を作り直す
  }
  if (t.dataset.miPart !== undefined) { p.parts = p.parts || {}; p.parts[t.dataset.miPart] = t.value; MenuImport.refreshParts(); }   // v54
  if (t.dataset.miDay !== undefined && t.dataset.k === 'name') setTimeout(MenuImport.refreshParts, 0);   // Day名で自動の部位が変わる
  if (t.dataset.miDay !== undefined) p.days.filter(function (d) { return d.day === Number(t.dataset.miDay); })[0][t.dataset.k] = t.value;
  if (t.id === 'miTeam' || t.id === 'miStart') {
    var team = MenuImport.team(), start = document.getElementById('miStart').value;
    var idEl = document.getElementById('miId');
    if (idEl.value === p.menuId) { p.menuId = MenuImport.defaultId(start, team); idEl.value = p.menuId; }   // 手で変えていなければ、IDも合わせる
  }
  MenuImport.sync();
});
app.addEventListener('input', function (e) {
  if (S.view === 'staff' && Staff.page === 'menuImport' && MenuImport.parsed && (e.target.id === 'miNewTeam' || e.target.id === 'miId')) MenuImport.sync();
});
app.addEventListener('click', function (e) {
  var t = e.target.closest('[data-mi]');
  if (!t || S.view !== 'staff' || Staff.page !== 'menuImport') return;
  if (t.dataset.mi === 'apply') MenuImport.apply(false);
  if (t.dataset.mi === 'cancel' && confirm('この切り替えの予定を取り消しますか？')) {
    Api.call('menuPlanCancel', { token: S.token, row: Number(t.dataset.v) }).then(MenuImport.loadInfo).catch(function (err) { alert(err.message); });
  }
});
