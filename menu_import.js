/**
 * menu_import.js ― 毎月のメニュー表（PDF）を取り込む画面（v50。スタッフ画面の中の1ページ。Staff.page = 'menuImport'）
 *
 *   開き方：実施状況のいちばん下「メニュー表（PDF）を取り込む」、または声で「メニューを取り込んで」
 *   流れ  ：① PDF（例「1年生.pdf」。Excel から作ったメニュー表）を選ぶ → この端末の中で読み取る（pdf.js。サーバーには送らない）
 *           ② 読み取った Day・種目・テンポ・回数・セット数・レスト・RIR と、推奨曜日を表で確かめる（直せる）
 *           ③ メニューID・チーム・開始日を決めて「反映する」（Apps Script の menuImport。メニュー取り込み.gs）
 *              前の月のメニューは消さずに残す。開始日から、そのチームの選手を新しいメニューに切り替える（予定にもできる）
 *   ★ メニュー表の作り（列の並び・見出しの言葉）が大きく変わったら、MenuImport.parse を直す
 *     見出しの言葉：「Day 1」（v57b：「A」「B」「C」も。A＝Day1）「カテゴリー」「エクササイズ名」「テンポ」「回数」「セット数」「レスト」「RIR」、下の週の表「Mon〜Sun」
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
    MenuImport.details = {};   // v55：取り込みのあとは中身も読み直す
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
    html += '<div id="miList">' + MenuImport.listHtml() + '</div>';   // v55：一覧だけ描き直せるように
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
      if (!p.rows.length) throw new Error('このPDFからメニューを読み取れませんでした。「Day 1」（または「A」「B」）「エクササイズ名」「テンポ」などの見出しがあるメニュー表か確かめてください（月間スケジュールのPDFは取り込めません）。');
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
    // 表の見出し：「Day 1」のほか、「A」「B」「C」のような1文字のもの（v57b。A＝Day1、B＝Day2…）。
    // 1文字のものは、同じ高さに「エクササイズ名」があるときだけ表の見出しとみなす
    var hasNameLabel = function (i) { return it.some(function (j) { return Math.abs(j.y - i.y) < 15 && j.x > i.x && j.s.replace(/\s/g, '') === 'エクササイズ名'; }); };
    var heads = it.filter(function (i) { return /^Day ?(\d+)$/i.test(i.s) || (/^[A-H]$/.test(i.s) && hasNameLabel(i)); }).map(function (i) {
      var m = /(\d+)/.exec(i.s);
      return { day: m ? Number(m[1]) : i.s.charCodeAt(0) - 64, label: i.s, x: i.x, y: i.y, cx: i.cx };
    }).sort(function (a, b) { return a.y - b.y; });
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
      // 種目が1つも無い表（空の「Day 4」など）は入れない（v57b）
      if (order && out.days.every(function (d) { return d.day !== h.day; })) out.days.push({ day: h.day, name: '', weekday: '' });
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
  // ---------------- v55：取り込んだメニューの中身を見る ----------------
  openId: '',       // 中身を開いているメニューID
  details: {},      // メニューID → menuDetail の結果（読み込み中は 'loading'、失敗はエラー文）
  toggleDetail: function (id) {
    MenuImport.openId = MenuImport.openId === id ? '' : id;
    if (MenuImport.openId && !MenuImport.details[id]) {
      MenuImport.details[id] = 'loading';
      Api.call('menuDetail', { token: S.token, menuId: id }).then(function (res) { MenuImport.details[id] = res; })
        .catch(function (err) { MenuImport.details[id] = { error: err.message }; })
        .then(function () { if (Staff.page === 'menuImport') MenuImport.refreshList(); });
    }
    MenuImport.refreshList();
  },
  /** 一覧のところだけ描き直す（上のPDFの確かめる表は、そのまま残す） */
  refreshList: function () {
    var box = document.getElementById('miList');
    if (box) box.innerHTML = MenuImport.listHtml(); else MenuImport.render();
  },
  detailHtml: function (id) {
    var d = MenuImport.details[id];
    if (!d || d === 'loading') return '<div class="loading">読み込み中…</div>';
    if (d.error) return msgHtml('error', d.error);
    var WD = { '月': 1, '火': 2, '水': 3, '木': 4, '金': 5, '土': 6, '日': 7 };
    var html = '<p class="small">' + esc([d.team ? d.team + 'チーム向け' : '', d.memo, d.users ? '使用中 ' + d.users + '人' : '使っている人なし'].filter(String).join('・')) + '</p>';
    var order = d.days.filter(function (x) { return x.weekday; }).sort(function (a, b) { return (WD[a.weekday] || 9) - (WD[b.weekday] || 9); });
    if (order.length) html += '<p class="small">推奨曜日：' + order.map(function (x) { return esc(x.weekday) + '＝Day' + x.day; }).join('、') + '</p>';
    var noPart = 0;
    d.days.forEach(function (day) {
      html += '<h3 class="mi-dh">Day' + day.day + (day.name ? '　' + esc(day.name) : '') + (day.weekday ? '<span class="muted small">（' + esc(day.weekday) + '）</span>' : '') + '</h3>' +
        // スマホでも横にはみ出さないように、種目ごとに2行（上：種目名・回数×セット・部位、下：カテゴリ・テンポ・レスト・RIR）
        '<table class="tbl mi-view"><tr><th>種目</th><th>回数×セット</th><th>部位</th></tr>' +
        day.items.map(function (it) {
          if (!it.part) noPart++;
          var sub = [it.category, it.tempo ? 'テンポ ' + it.tempo : '', it.rest ? 'レスト ' + it.rest + (/^\d+$/.test(it.rest) ? '秒' : '') : '', it.rir !== '' ? 'RIR ' + it.rir : ''].filter(String).join('・');
          return '<tr><td><b>' + esc(it.name) + '</b>' + (sub ? '<span class="muted small mi-sub">' + esc(sub) + '</span>' : '') + '</td>' +
            '<td>' + esc(it.reps || '-') + (it.sets ? '×' + esc(it.sets) : '') + '</td>' +
            '<td>' + (it.part ? esc(it.part) : '<span class="ng-text small">未登録</span>') + '</td></tr>';
        }).join('') + '</table>';
    });
    if (noPart) html += '<p class="muted small">「未登録」の種目は種目マスタに無いため、部位の集計に入りません。種目マスタに足すか、メニューシートの名前を直してください。</p>';
    return html;
  },

  listHtml: function () {
    var info = MenuImport.info;
    if (!info) return '<div class="card"><div class="loading">メニューの一覧を読み込み中…</div></div>';
    var used = {};
    info.teams.forEach(function (t) { Object.keys(t.menus).forEach(function (m) { used[m] = (used[m] || 0) + t.menus[m]; }); });
    var html = '<div class="card"><h2>今あるメニュー</h2>';
    if (info.plans.length) html += '<h3 class="mp-sub">切り替えの予定</h3><ul class="mi-plans">' + info.plans.map(function (p) {
      return '<li>' + esc(p.start.slice(5).replace('-', '/')) + '：' + esc(p.team) + 'チーム → ' + esc(p.menuId) + ' <button class="btn ghost small" data-mi="cancel" data-v="' + p.row + '">取り消す</button></li>';
    }).join('') + '</ul>';
    // v55：メニューIDを押すと、その中身（Dayごとの種目・部位・テンポ・回数・セット・レスト・RIR・推奨曜日）を開く
    html += '<div class="mi-list">' + info.menus.slice().reverse().map(function (m) {
      var open = MenuImport.openId === m.id;
      return '<div class="mi-item' + (open ? ' open' : '') + '"><button class="mi-item-head" data-mi="detail" data-v="' + esc(m.id) + '" aria-expanded="' + open + '">' +
        '<span class="mi-item-name">' + Icon(open ? 'up' : 'down', 18) + esc(m.id) + '<span class="muted small">' + esc(m.team ? m.team + 'チーム向け' : '対象チームなし') + '・' + m.days + 'Day</span></span>' +
        '<span class="r small">' + (used[m.id] ? '<b>' + used[m.id] + '人</b>が使用中' : '<span class="muted">使っている人なし</span>') + '</span></button>' +
        (open ? '<div class="mi-detail">' + MenuImport.detailHtml(m.id) + '</div>' : '') + '</div>';
    }).join('') + '</div><p class="muted small">メニューIDを押すと、中身が見られます。選手ごとの使用メニューは、選手一覧の「チーム分け」でも変えられます。使っていない古いメニューは、メニューシートから消してもかまいません（記録は残ります）。</p></div>';
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
  if (t.dataset.mi === 'detail') MenuImport.toggleDetail(t.dataset.v);   // v55：メニューの中身
  if (t.dataset.mi === 'cancel' && confirm('この切り替えの予定を取り消しますか？')) {
    Api.call('menuPlanCancel', { token: S.token, row: Number(t.dataset.v) }).then(MenuImport.loadInfo).catch(function (err) { alert(err.message); });
  }
});

/**
 * ============================================================================
 * ここから v56：コラムの管理（スタッフ画面の中の1ページ。Staff.page = 'columns'）
 * ============================================================================
 *   開き方：実施状況のいちばん下「コラムの管理」（役職が 管理者・トレーナー の人だけ出る）。声「コラムを管理して」
 *   種類：コラムのページ（PDF か 手入力）。v57 で読み込み中のコラム（からだ・記録）はやめた
 *   直すとき：文字を直す・「PDFを読み込み直す」で別のPDFに入れ替える（v57。題名とIDはそのまま。使わなくなった画像はサーバーがごみ箱へ）
 *   PDFの表示のしかた（追加するときに選ぶ）：
 *     ・画像でつなげる …… ページを画像にして、上下の白い余白を切り、すき間なく縦につなげる（図もそのまま）
 *     ・文字と図 ………… 文字を読み取って見出し・段落・箇条書きに組み直し、図や写真だけ画像で入れる（スマホで読みやすい）
 *   どちらも PDF はこの端末の中で読む（pdf.js。MenuImport.loadPdfjs）。画像は保存のときに columnUpload で1枚ずつ送る
 *   読む側の表示は guidebook.js の後半 Column
 * ============================================================================
 */
var ColumnEditor = {
  // v57：読み込み中に出すコラム（からだ・記録）はやめた。コラムのページだけ
  KINDS: [
    { k: 'page', label: 'コラムのページ', note: '選手のマイページの「コラム」から、題名を選んで読みます。PDFか手入力で作ります。' }
  ],
  data: null,      // columns の結果
  openId: '',      // 中身を見ているコラム
  ed: null,        // 作っている・直しているコラム
  msg: '',
  busy: '',

  open: function () {
    if (S.view !== 'staff') return;
    if (Staff.page !== 'columns') {
      Staff.returnTo = { tab: Staff.tab, scroll: window.scrollY || 0 };
      try { history.pushState({ staffColumns: 1 }, ''); } catch (e) { /* 「戻る」ボタンでも戻れる */ }
    }
    Staff.page = 'columns';
    ColumnEditor.ed = null; ColumnEditor.msg = ''; ColumnEditor.openId = '';
    ColumnEditor.render(); window.scrollTo(0, 0);
    ColumnEditor.load();
  },
  load: function () {
    return Api.call('columns', { token: S.token, full: true }).then(function (res) { ColumnEditor.data = res; if (Staff.page === 'columns' && !ColumnEditor.ed) ColumnEditor.render(); })
      .catch(function (err) { ColumnEditor.msg = msgHtml('error', err.message); ColumnEditor.render(); });
  },
  back: function () {
    if (ColumnEditor.ed) { ColumnEditor.ed = null; ColumnEditor.render(); return; }
    var st = history.state || {}; if (st.staffColumns) history.back(); else ColumnEditor.leave();
  },
  leave: function () { ColumnEditor.ed = null; Staff.leaveAthlete(); },
  frame: function (inner) {
    return Staff.athleteFrame('<h1 class="ath-name">コラムの管理</h1><p class="muted small">用語の説明などの補足を、選手の画面に出します。追加・変更は管理者とトレーナーだけができます。</p>', inner, 'コラム');
  },

  render: function () {
    if (ColumnEditor.ed) return ColumnEditor.renderEditor();
    var d = ColumnEditor.data;
    var html = ColumnEditor.msg ? '<div class="card">' + ColumnEditor.msg + '</div>' : '';
    if (!d) { app.innerHTML = ColumnEditor.frame(html + '<div class="card"><div class="loading">読み込み中…</div></div>'); return; }
    if (!d.editor) html += '<div class="card">' + msgHtml('warn', 'コラムの追加・変更は、役職が「管理者」か「トレーナー」の人だけができます。') + '</div>';
    ColumnEditor.KINDS.forEach(function (K) {
      var list = d.columns.filter(function (c) { return c.kind === K.k; }), lim = d.limits[K.k] || 100;
      html += '<div class="card"><h2>' + esc(K.label) + (K.k !== 'page' ? '<span class="muted small">（' + list.length + ' / ' + lim + '）</span>' : '') + '</h2><p class="muted small">' + esc(K.note) + '</p>';
      html += list.length ? '<div class="ce-list">' + list.map(function (c, i) {
        var open = ColumnEditor.openId === c.id;
        return '<div class="ce-item' + (open ? ' open' : '') + '"><div class="ce-row"><button class="ce-title" data-ce="view" data-v="' + esc(c.id) + '">' + Icon(open ? 'up' : 'down', 18) + '<span>' + esc(c.title) +
          '<span class="muted small">' + esc(c.format) + (c.updated ? '・' + esc(c.updated.replace(/-/g, '/')) : '') + '</span></span></button>' +
          (d.editor ? '<span class="ce-btns"><button class="btn ghost small" data-ce="up" data-v="' + esc(c.id) + '"' + (i ? '' : ' disabled') + ' aria-label="上へ">' + Icon('up', 16) + '</button>' +
            '<button class="btn ghost small" data-ce="down" data-v="' + esc(c.id) + '"' + (i < list.length - 1 ? '' : ' disabled') + ' aria-label="下へ">' + Icon('down', 16) + '</button>' +
            '<button class="btn sub small" data-ce="edit" data-v="' + esc(c.id) + '">直す</button>' +
            '<button class="btn ghost small ce-del" data-ce="del" data-v="' + esc(c.id) + '">' + (ColumnEditor.delArm === c.id ? 'もう一度押すと消す' : '消す') + '</button></span>' : '') + '</div>' +
          (open ? '<div class="ce-preview' + (K.k !== 'page' ? ' as-card' : '') + '">' + Column.bodyHtml(c.blocks) + '</div>' : '') + '</div>';
      }).join('') + '</div>' : '<p class="muted">まだありません。</p>';
      if (d.editor) {
        var full = list.length >= lim;
        html += '<div class="row">' + (full ? '<p class="muted small">' + lim + 'つまでです。足すときは、どれかを消してください。</p>' :
          '<button class="btn sub" data-ce="addPdf" data-v="' + K.k + '">' + Icon('file', 18) + 'PDFから追加</button>' +
          (K.k === 'page' ? '<button class="btn sub" data-ce="addText" data-v="page">' + Icon('keyboard', 18) + '手入力で追加</button>' : '')) + '</div>';
      }
      html += '</div>';
    });
    app.innerHTML = ColumnEditor.frame(html);
    Column.fillImages(app);
  },

  // ---------------- 作る・直す ----------------
  startPdf: function (kind) { ColumnEditor.ed = { kind: kind, title: '', format: '', blocks: [], source: 'pdf', step: 'pick', mode: '文字と図' }; ColumnEditor.msg = ''; ColumnEditor.render(); window.scrollTo(0, 0); },
  startText: function () { ColumnEditor.ed = { kind: 'page', title: '', format: '手入力', blocks: [], source: 'text', step: 'edit', text: '' }; ColumnEditor.msg = ''; ColumnEditor.render(); window.scrollTo(0, 0); },
  startEdit: function (id) {
    var c = ColumnEditor.data.columns.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    var ed = { id: c.id, kind: c.kind, title: c.title, format: c.format, blocks: JSON.parse(JSON.stringify(c.blocks || [])), source: c.format === '手入力' ? 'text' : 'pdf', step: 'edit' };
    if (ed.source === 'text') ed.text = ColumnEditor.toText(ed.blocks);
    ColumnEditor.ed = ed; ColumnEditor.msg = ''; ColumnEditor.render(); window.scrollTo(0, 0);
  },

  /** v57：直しているコラムを、別のPDFで読み込み直す（題名・IDはそのまま） */
  reloadPdf: function () {
    var e = ColumnEditor.ed; if (!e) return;
    var tt = document.getElementById('ceTitle'); if (tt) e.title = tt.value;
    var ta = document.getElementById('ceText'); if (ta) e.text = ta.value;
    e.prev = { blocks: e.blocks, format: e.format, source: e.source, text: e.text };
    e.mode = e.format === '画像' ? '画像' : '文字と図';
    e.step = 'pick'; ColumnEditor.msg = ''; ColumnEditor.render(); window.scrollTo(0, 0);
  },
  undoReload: function () {
    var e = ColumnEditor.ed; if (!e || !e.prev) return;
    e.blocks = e.prev.blocks; e.format = e.prev.format; e.source = e.prev.source; e.text = e.prev.text; e.prev = null;
    e.step = 'edit'; ColumnEditor.busy = ''; ColumnEditor.render();
  },
  /** 手入力の決まり：「# 」で始まる行は見出し、「- 」「・」で始まる行は箇条書き、空いた行で段落を分ける */
  fromText: function (text) {
    var blocks = [], para = [];
    var flush = function () { if (para.length) { blocks.push({ t: 'p', s: para.join('\n') }); para = []; } };
    String(text || '').replace(/\r/g, '').split('\n').forEach(function (line) {
      var l = line.trim();
      if (!l) { flush(); return; }
      var m;
      if ((m = /^#+\s*(.+)$/.exec(l)) || (m = /^【(.+)】$/.exec(l))) { flush(); blocks.push({ t: 'h', s: m[1] }); return; }
      if ((m = /^(?:[-・•●]\s*)(.+)$/.exec(l))) { flush(); blocks.push({ t: 'li', s: m[1] }); return; }
      para.push(l);
    });
    flush();
    return blocks;
  },
  toText: function (blocks) {
    return (blocks || []).map(function (b) { return b.t === 'h' ? '# ' + b.s : b.t === 'li' ? '- ' + b.s : b.t === 'p' ? b.s : ''; })
      .filter(String).join('\n\n').replace(/(- [^\n]*)\n\n(?=- )/g, '$1\n');
  },

  renderEditor: function () {
    var e = ColumnEditor.ed, K = ColumnEditor.KINDS.filter(function (x) { return x.k === e.kind; })[0];
    var html = ColumnEditor.msg ? '<div class="card">' + ColumnEditor.msg + '</div>' : '';
    html += '<div class="card"><h2>' + (e.id ? 'コラムを直す' : 'コラムを追加') + '<span class="muted small">（' + esc(K.label) + '）</span></h2>' +
      (e.id && e.step === 'pick' ? '<p class="small">「' + esc(e.title) + '」の中身を、新しいPDFで入れ替えます。</p>' : '');
    if (e.step === 'pick') {
      html += '<p class="small"><b>1. 表示のしかたを選ぶ</b></p><div class="ce-mode">' +
        ['文字と図', '画像'].map(function (m) {
          return '<label class="ce-mode-opt' + (e.mode === m ? ' on' : '') + '"><input type="radio" name="ceMode" value="' + m + '"' + (e.mode === m ? ' checked' : '') + '>' +
            '<b>' + (m === '画像' ? 'ページを画像でつなげる' : '文字と図') + '</b><span class="muted small">' +
            (m === '画像' ? 'PDFの見た目のまま、ページの境目なく縦につなげます。図もそのまま残ります。小さい文字は読みにくくなります。' :
              '文字を読み取って、スマホの幅で読みやすく組み直します。図や写真は画像で入ります。読み取った文字はこのあと直せます。') + '</span></label>';
        }).join('') + '</div>' +
        '<p class="small"><b>2. PDFを選ぶ</b>（この端末の中で読み取ります。20ページまで）</p><input type="file" accept="application/pdf,.pdf" id="ceFile" class="mi-file">' +
        (ColumnEditor.busy ? '<div class="loading">' + esc(ColumnEditor.busy) + '</div>' : '') +
        '<div class="row">' + (e.prev ? '<button class="btn ghost" data-ce="unpdf">読み込み直すのをやめる</button>' : '<button class="btn ghost" data-ce="cancel">やめる</button>') + '</div></div>';
      app.innerHTML = ColumnEditor.frame(html); return;
    }
    html += '<label class="small">題名 <input class="sel ce-titlein" id="ceTitle" maxlength="60" value="' + esc(e.title) + '" placeholder="例：FFMIとは"></label>';
    if (e.id) html += '<div class="ce-reload"><button class="btn sub small" data-ce="repdf">' + Icon('file', 16) + 'PDFを読み込み直す</button>' +
      '<span class="muted small">' + (e.source === 'text' ? '手入力の中身を、PDFの中身に入れ替えます。' : '今の中身を、新しいPDFの中身に入れ替えます。') + '題名はそのままです。</span></div>';   // v57
    if (e.source === 'text') {
      html += '<p class="muted small">書き方：「# 」で始まる行は<b>見出し</b>、「- 」で始まる行は<b>箇条書き</b>、1行あけると<b>段落</b>が分かれます。</p>' +
        '<textarea class="ce-text" id="ceText" rows="14" placeholder="# FFMIとは&#10;&#10;FFMI（除脂肪量指数）は、…&#10;&#10;- 18〜20：平均的&#10;- 22以上：とても高い">' + esc(e.text || '') + '</textarea>' +
        '<h3 class="mp-sub">選手の画面での見え方</h3><div class="ce-preview" id="cePreview">' + Column.bodyHtml(ColumnEditor.fromText(e.text)) + '</div>';
    } else {
      html += '<p class="muted small">表示：' + esc(e.format) + '。読み取った文字は直せます。いらない部分は「消す」を押してください。' + (e.format === '文字と図' ? '種類（見出し・本文・箇条書き）も変えられます。' : '') + '</p>' +
        '<div class="ce-blocks">' + e.blocks.map(function (b, i) {
          if (b.t === 'img') return '<div class="ce-block img"><div class="col-img ok"><img alt="" ' + (b.local ? 'src="' + b.local + '"' : 'data-colimg="' + esc(b.id) + '"') + '></div>' +
            '<button class="btn ghost small" data-ce="bdel" data-v="' + i + '">消す</button></div>';
          return '<div class="ce-block"><select class="sel" data-ce-type="' + i + '">' + [['h', '見出し'], ['p', '本文'], ['li', '箇条書き']].map(function (o) {
              return '<option value="' + o[0] + '"' + (b.t === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
            '<textarea class="ce-btext" data-ce-text="' + i + '" rows="' + Math.min(8, Math.max(2, Math.ceil(b.s.length / 28))) + '">' + esc(b.s) + '</textarea>' +
            '<button class="btn ghost small" data-ce="bdel" data-v="' + i + '">消す</button></div>';
        }).join('') + '</div>' +
        '<h3 class="mp-sub">選手の画面での見え方</h3><div class="ce-preview' + (e.kind !== 'page' ? ' as-card' : '') + '" id="cePreview">' + Column.bodyHtml(e.blocks.map(ColumnEditor.viewBlock)) + '</div>';
    }
    html += '<div class="roster-apply"><button class="btn block" data-ce="save" id="ceSave"' + (ColumnEditor.busy ? ' disabled' : '') + '>' + (ColumnEditor.busy ? esc(ColumnEditor.busy) : (e.id ? 'この内容で直す' : 'このコラムを追加する')) + '</button>' +
      '<button class="btn ghost block" data-ce="cancel">やめる</button></div></div>';
    app.innerHTML = ColumnEditor.frame(html);
    ColumnEditor.showLocal(); Column.fillImages(app);
  },
  /** 確認の見え方：まだ送っていない画像は、端末の中の画像で見せる */
  viewBlock: function (b) { return b.t === 'img' && b.local ? { t: 'img', id: 'local', w: b.w, h: b.h, gap: b.gap, local: b.local } : b; },
  showLocal: function () {
    var e = ColumnEditor.ed; if (!e) return;
    var imgs = e.blocks.filter(function (b) { return b.t === 'img'; });
    var els = app.querySelectorAll('#cePreview img[data-colimg]');
    Array.prototype.forEach.call(els, function (img, i) { var b = imgs[i]; if (b && b.local) { img.src = b.local; img.parentNode.classList.add('ok'); } });
  },
  refreshPreview: function () {
    var e = ColumnEditor.ed, box = document.getElementById('cePreview'); if (!e || !box) return;
    box.innerHTML = Column.bodyHtml(e.source === 'text' ? ColumnEditor.fromText(e.text) : e.blocks.map(ColumnEditor.viewBlock));
    ColumnEditor.showLocal(); Column.fillImages(box);
  },

  // ---------------- PDF を読む ----------------
  onFile: function (file) {
    var e = ColumnEditor.ed; if (!file || !e) return;
    ColumnEditor.busy = 'PDFを読み取っています…'; ColumnEditor.msg = ''; ColumnEditor.render();
    MenuImport.loadPdfjs().then(function () { return file.arrayBuffer(); })
      .then(function (buf) { return window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise; })
      .then(function (doc) { return e.mode === '画像' ? ColumnEditor.pagesAsImages(doc) : ColumnEditor.textAndFigures(doc); })
      .then(function (blocks) {
        if (!blocks.length) throw new Error('このPDFから中身を読み取れませんでした。');
        e.blocks = blocks; e.format = e.mode; e.step = 'edit'; e.source = 'pdf'; e.prev = null;
        e.title = e.title || String(file.name || '').replace(/\.pdf$/i, '').slice(0, 60);
        ColumnEditor.busy = ''; ColumnEditor.render();
      })
      .catch(function (err) { ColumnEditor.busy = ''; ColumnEditor.msg = msgHtml('error', err.message || String(err)); ColumnEditor.render(); });
  },
  renderPage: function (page, width) {
    var vp1 = page.getViewport({ scale: 1 }), scale = width / vp1.width, vp = page.getViewport({ scale: scale });
    var c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () { return { canvas: c, viewport: vp }; });
  },
  /** 白い部分（上下・左右）を見つける → { top, bottom, left, right } */
  inkBox: function (c, x0, y0, x1, y1) {
    var ctx = c.getContext('2d'), w = x1 - x0, h = y1 - y0;
    if (w < 2 || h < 2) return null;
    var d = ctx.getImageData(x0, y0, w, h).data, top = -1, bottom = -1, left = w, right = -1;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x += 2) {
      var k = (y * w + x) * 4;
      if (d[k] < 235 || d[k + 1] < 235 || d[k + 2] < 235) { if (top < 0) top = y; bottom = y; if (x < left) left = x; if (x > right) right = x; }
    }
    if (top < 0) return null;
    return { top: y0 + top, bottom: y0 + bottom, left: x0 + left, right: x0 + right };
  },
  crop: function (c, x, y, w, h, maxW) {
    var s = Math.min(1, (maxW || 1000) / w), o = document.createElement('canvas');
    o.width = Math.max(1, Math.round(w * s)); o.height = Math.max(1, Math.round(h * s));
    var ctx = o.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, o.width, o.height);
    ctx.drawImage(c, x, y, w, h, 0, 0, o.width, o.height);
    return { url: o.toDataURL('image/jpeg', 0.82), w: o.width, h: o.height };
  },
  /** 画像でつなげる：ページごとに上下の白い余白を切って、すき間なくつなげる */
  pagesAsImages: function (doc) {
    var out = [], chain = Promise.resolve(), n = Math.min(doc.numPages, 20);
    for (var p = 1; p <= n; p++) (function (p) {
      chain = chain.then(function () { ColumnEditor.setBusy('ページを画像にしています（' + p + ' / ' + n + '）…'); return doc.getPage(p); })
        .then(function (page) { return ColumnEditor.renderPage(page, 1000); })
        .then(function (r) {
          var c = r.canvas, box = ColumnEditor.inkBox(c, 0, 0, c.width, c.height);
          if (!box) return;
          var pad = 16, y0 = Math.max(0, box.top - pad), y1 = Math.min(c.height, box.bottom + pad);
          var im = ColumnEditor.crop(c, 0, y0, c.width, y1 - y0, 1000);
          out.push({ t: 'img', local: im.url, w: im.w, h: im.h, gap: false });
        });
    })(p);
    return chain.then(function () { return out; });
  },
  setBusy: function (text) { ColumnEditor.busy = text; var el = app.querySelector('.card .loading'); if (el) el.textContent = text; },

  /** 文字と図：文字は行 → 段落・見出し・箇条書きに、図は画像で切り出す */
  textAndFigures: function (doc) {
    var out = [], chain = Promise.resolve(), n = Math.min(doc.numPages, 20), OPS = window.pdfjsLib.OPS;
    for (var p = 1; p <= n; p++) (function (p) {
      var page, vp, items, figs;
      chain = chain.then(function () { ColumnEditor.setBusy('読み取っています（' + p + ' / ' + n + '）…'); return doc.getPage(p); })
        .then(function (pg) { page = pg; vp = page.getViewport({ scale: 1000 / page.getViewport({ scale: 1 }).width }); return page.getTextContent(); })
        .then(function (tc) {
          items = tc.items.filter(function (i) { return i.str && i.str.trim(); }).map(function (i) {
            var pt = vp.convertToViewportPoint(i.transform[4], i.transform[5]);
            var size = Math.hypot(i.transform[2], i.transform[3]) * vp.scale;
            return { s: i.str, x: pt[0], y: pt[1] - size, b: pt[1], w: i.width * vp.scale, size: size };
          });
          return page.getOperatorList();
        })
        .then(function (ol) {
          figs = ColumnEditor.imageBoxes(ol, OPS, vp);
          var pageArea = vp.width * vp.height;
          // 文字が無いページ（スキャンなど）は、ページ全体を画像に
          if (!items.length) return ColumnEditor.renderPage(page, 1000).then(function (r) {
            var box = ColumnEditor.inkBox(r.canvas, 0, 0, r.canvas.width, r.canvas.height); if (!box) return;
            var im = ColumnEditor.crop(r.canvas, 0, Math.max(0, box.top - 12), r.canvas.width, Math.min(r.canvas.height, box.bottom + 12) - Math.max(0, box.top - 12));
            out.push({ t: 'img', local: im.url, w: im.w, h: im.h, gap: true });
          });
          figs = figs.filter(function (f) { var a = f.w * f.h; return f.w > 60 && f.h > 40 && a < pageArea * 0.85; });   // 小さすぎる・背景の画像は入れない
          var draw = figs.length ? ColumnEditor.renderPage(page, 2000) : Promise.resolve(null);   // 図はくっきり見えるように2倍の大きさで描いて切り出す
          return draw.then(function (r) {
            var els = [];
            figs.forEach(function (f) {
              var k = 2, fx = Math.max(0, f.x * k), fy = Math.max(0, f.y * k);
              var im = ColumnEditor.crop(r.canvas, fx, fy, Math.min(f.w * k, r.canvas.width - fx), Math.min(f.h * k, r.canvas.height - fy), 1000);
              els.push({ kind: 'img', y: f.y, block: { t: 'img', local: im.url, w: im.w, h: im.h, gap: true } });
            });
            var inFig = function (it) { return figs.some(function (f) { var cx = it.x + it.w / 2, cy = it.y + it.size / 2; return cx > f.x && cx < f.x + f.w && cy > f.y && cy < f.y + f.h; }); };
            ColumnEditor.textBlocks(items.filter(function (it) { return !inFig(it); }), vp.height).forEach(function (t) { els.push({ kind: 't', y: t.y, block: t.block }); });
            els.sort(function (a, b) { return a.y - b.y; }).forEach(function (e) { e.block._page = p; out.push(e.block); });
          });
        });
    })(p);
    return chain.then(function () { return ColumnEditor.mergeAcrossPages(out); });
  },
  /** 描画の命令から、画像が置かれた四角を求める（ページの座標 → 画面の座標） */
  imageBoxes: function (ol, OPS, vp) {
    var mul = function (a, b) { return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]]; };
    var ctm = [1, 0, 0, 1, 0, 0], stack = [], boxes = [];
    for (var i = 0; i < ol.fnArray.length; i++) {
      var fn = ol.fnArray[i], args = ol.argsArray[i];
      if (fn === OPS.save) stack.push(ctm.slice());
      else if (fn === OPS.restore) { if (stack.length) ctm = stack.pop(); }
      else if (fn === OPS.transform) ctm = mul(ctm, args);
      else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm.slice()); if (args && args[0]) ctm = mul(ctm, args[0]); }
      else if (fn === OPS.paintFormXObjectEnd) { if (stack.length) ctm = stack.pop(); }
      else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageXObjectRepeat) {
        var pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(function (q) { return vp.convertToViewportPoint(ctm[0] * q[0] + ctm[2] * q[1] + ctm[4], ctm[1] * q[0] + ctm[3] * q[1] + ctm[5]); });
        var xs = pts.map(function (q) { return q[0]; }), ys = pts.map(function (q) { return q[1]; });
        var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
        boxes.push({ x: x0, y: y0, w: Math.max.apply(null, xs) - x0, h: Math.max.apply(null, ys) - y0 });
      }
    }
    // 重なっている画像は1つにまとめる
    var merged = [];
    boxes.forEach(function (b) {
      var m = merged.filter(function (o) { return b.x < o.x + o.w + 4 && o.x < b.x + b.w + 4 && b.y < o.y + o.h + 4 && o.y < b.y + b.h + 4; })[0];
      if (m) { var x1 = Math.max(m.x + m.w, b.x + b.w), y1 = Math.max(m.y + m.h, b.y + b.h); m.x = Math.min(m.x, b.x); m.y = Math.min(m.y, b.y); m.w = x1 - m.x; m.h = y1 - m.y; }
      else merged.push({ x: b.x, y: b.y, w: b.w, h: b.h });
    });
    return merged;
  },
  /** 文字のかけら → 行 → 段落・見出し・箇条書き */
  textBlocks: function (items, pageH) {
    if (!items.length) return [];
    items.sort(function (a, b) { return a.b - b.b || a.x - b.x; });
    var lines = [];
    items.forEach(function (it) {
      var l = lines.filter(function (x) { return Math.abs(x.b - it.b) < Math.max(3, it.size * 0.45); })[0];
      if (!l) { l = { b: it.b, y: it.y, size: it.size, parts: [] }; lines.push(l); }
      l.parts.push(it); l.size = Math.max(l.size, it.size); l.y = Math.min(l.y, it.y);
    });
    lines.forEach(function (l) {
      l.parts.sort(function (a, b) { return a.x - b.x; });
      var s = '', end = null;
      l.parts.forEach(function (p) {
        if (end !== null && p.x - end > p.size * 0.6 && /[A-Za-z0-9]$/.test(s) && /^[A-Za-z0-9]/.test(p.s)) s += ' ';
        s += p.s; end = p.x + p.w;
      });
      // PDFのフォントによっては「⼿」のような部首の文字になるので、ふつうの漢字に直す
      l.s = ColumnEditor.fixChars(s).replace(/\s+/g, ' ').trim(); l.x = l.parts[0].x; l.end = end;
    });
    lines = lines.filter(function (l) { return l.s && !/^[-–—\s]*\d{1,3}[-–—\s]*$/.test(l.s); })   // ページ番号だけの行は入れない
      .sort(function (a, b) { return a.b - b.b; });
    var sizes = lines.map(function (l) { return l.size; }).sort(function (a, b) { return a - b; }), base = sizes[Math.floor(sizes.length / 2)] || 12;
    var xs = lines.map(function (l) { return l.x; }).sort(function (a, b) { return a - b; }), left = xs[Math.floor(xs.length * 0.2)] || 0;
    var right = Math.max.apply(null, lines.map(function (l) { return l.end; }));
    var out = [], cur = null;
    var cjk = /[　-ヿ㐀-鿿＀-￯]/;
    lines.forEach(function (l, i) {
      var bullet = /^[・•●○■□◆◇▶►\-－✓✔]\s*/.exec(l.s) || /^\(?\d{1,2}[\.\)）]\s+/.exec(l.s);
      var head = l.size >= base * 1.25 && l.s.length <= 40;
      var prev = lines[i - 1], gap = prev ? l.y - prev.b : 999;
      if (head) { cur = null; out.push({ y: l.y, block: { t: 'h', s: l.s } }); return; }
      if (bullet) { cur = { y: l.y, block: { t: 'li', s: l.s.slice(bullet[0].length).trim() || l.s } }; out.push(cur); return; }
      // 箇条書きの印が文字に無いPDF（印が図形）：左が字下げされた短い行は箇条書きにする
      if (l.x > left + l.size * 0.8 && l.end < right - l.size * 3) { cur = null; out.push({ y: l.y, block: { t: 'li', s: l.s } }); return; }
      // 前の行が右端まで届いていなければ、そこで段落が終わっている
      var prevFull = prev && prev.end > right - prev.size * 2.5;
      var cont = cur && prevFull && gap < l.size * 0.9 && Math.abs(l.size - (prev ? prev.size : l.size)) < 2;
      if (cont) {
        var a = cur.block.s, glue = cjk.test(a.slice(-1)) || cjk.test(l.s[0]) ? '' : ' ';
        cur.block.s = a + glue + l.s;
      } else { cur = { y: l.y, block: { t: 'p', s: l.s } }; out.push(cur); }
    });
    return out;
  },
  /** PDFのフォントによっては「⼿」「⻑」のような部首の文字になるので、ふつうの漢字に直す */
  RADICALS: { '⻑': '長', '⻄': '西', '⻘': '青', '⻝': '食', '⻣': '骨', '⻤': '鬼', '⻭': '歯', '⻯': '竜', '⻩': '黄', '⻲': '亀', '⻨': '麦', '⻁': '虎', '⺟': '母', '⺠': '民', '⻆': '角', '⻑': '長', '⻖': '阝', '⺍': '⺍' },
  fixChars: function (s) {
    return String(s).replace(/[\u2e80-\u2fdf]/g, function (ch) { return ColumnEditor.RADICALS[ch] || ch.normalize('NFKC'); })
      .replace(/[\u2027\u00b7\uff65]/g, '・');   // 「・」が「‧」などで読み取られるPDFがあるので直す
  },
  /** ページの境目で切れた段落をつなぐ */
  mergeAcrossPages: function (blocks) {
    var out = [];
    blocks.forEach(function (b) {
      var last = out[out.length - 1];
      if (last && last.t === 'p' && b.t === 'p' && !/[。．.!?！？」』）)]$/.test(last.s) && b._page !== last._page) { last.s += b.s; return; }
      out.push(b);
    });
    return out;
  },

  // ---------------- 保存・削除・順番 ----------------
  save: function () {
    var e = ColumnEditor.ed; if (!e || ColumnEditor.busy) return;
    var title = (document.getElementById('ceTitle') || {}).value || '';
    e.title = title.trim();
    if (!e.title) { alert('題名を入れてください。'); return; }
    var blocks = e.source === 'text' ? ColumnEditor.fromText(e.text) : e.blocks;
    if (!blocks.length) { alert('中身がありません。'); return; }
    var ups = blocks.filter(function (b) { return b.t === 'img' && b.local; }), done = 0;
    var chain = Promise.resolve();
    ups.forEach(function (b) {
      chain = chain.then(function () {
        ColumnEditor.busy = '画像を送っています（' + (done + 1) + ' / ' + ups.length + '）…'; var btn = document.getElementById('ceSave'); if (btn) { btn.disabled = true; btn.textContent = ColumnEditor.busy; }
        return Api.call('columnUpload', { token: S.token, mime: 'image/jpeg', data: b.local.split(',')[1] }).then(function (res) { b.id = res.id; delete b.local; done++; });
      });
    });
    chain.then(function () {
      ColumnEditor.busy = '保存しています…'; var btn = document.getElementById('ceSave'); if (btn) btn.textContent = ColumnEditor.busy;
      return Api.call('columnSave', { token: S.token, column: { id: e.id || '', kind: e.kind, title: e.title, format: e.format || '手入力', blocks: blocks } });
    }).then(function (res) {
      ColumnEditor.busy = ''; ColumnEditor.ed = null; ColumnEditor.msg = msgHtml('ok', res.message + '（選手の画面には、次にアプリを開いたときに出ます）');
      ColumnEditor.render(); window.scrollTo(0, 0); ColumnEditor.load();
    }).catch(function (err) {
      ColumnEditor.busy = ''; ColumnEditor.msg = msgHtml('error', err.message); ColumnEditor.render(); window.scrollTo(0, 0);
    });
  },
  del: function (id) {
    if (ColumnEditor.delArm !== id) { ColumnEditor.delArm = id; ColumnEditor.render(); return; }
    ColumnEditor.delArm = '';
    Api.call('columnDelete', { token: S.token, id: id }).then(function (res) { ColumnEditor.msg = msgHtml('ok', res.message); return ColumnEditor.load(); })
      .catch(function (err) { ColumnEditor.msg = msgHtml('error', err.message); ColumnEditor.render(); });
  },
  move: function (id, dir) {
    Api.call('columnMove', { token: S.token, id: id, dir: dir }).then(function () { return ColumnEditor.load(); })
      .catch(function (err) { ColumnEditor.msg = msgHtml('error', err.message); ColumnEditor.render(); });
  }
};

app.addEventListener('click', function (e) {
  var t = e.target.closest('[data-ce]');
  if (!t || S.view !== 'staff' || Staff.page !== 'columns') return;
  var k = t.dataset.ce, v = t.dataset.v, ed = ColumnEditor.ed;
  if (k !== 'del') ColumnEditor.delArm = '';
  if (k === 'view') { ColumnEditor.openId = ColumnEditor.openId === v ? '' : v; ColumnEditor.render(); }
  else if (k === 'addPdf') ColumnEditor.startPdf(v);
  else if (k === 'addText') ColumnEditor.startText();
  else if (k === 'edit') ColumnEditor.startEdit(v);
  else if (k === 'del') ColumnEditor.del(v);
  else if (k === 'up' || k === 'down') ColumnEditor.move(v, k === 'up' ? -1 : 1);
  else if (k === 'cancel') { ColumnEditor.ed = null; ColumnEditor.busy = ''; ColumnEditor.render(); }
  else if (k === 'repdf') ColumnEditor.reloadPdf();   // v57
  else if (k === 'unpdf') ColumnEditor.undoReload();
  else if (k === 'save') ColumnEditor.save();
  else if (k === 'bdel' && ed) { var tt = document.getElementById('ceTitle'); if (tt) ed.title = tt.value; ed.blocks.splice(Number(v), 1); ColumnEditor.render(); }
});
app.addEventListener('change', function (e) {
  if (S.view !== 'staff' || Staff.page !== 'columns' || !ColumnEditor.ed) return;
  var t = e.target, ed = ColumnEditor.ed;
  if (t.id === 'ceFile') return ColumnEditor.onFile(t.files && t.files[0]);
  if (t.name === 'ceMode') { ed.mode = t.value; ColumnEditor.render(); return; }
  if (t.dataset.ceType !== undefined) { ed.blocks[Number(t.dataset.ceType)].t = t.value; ColumnEditor.refreshPreview(); }
});
app.addEventListener('input', function (e) {
  if (S.view !== 'staff' || Staff.page !== 'columns' || !ColumnEditor.ed) return;
  var t = e.target, ed = ColumnEditor.ed;
  if (t.id === 'ceText') { ed.text = t.value; ColumnEditor.refreshPreview(); }
  if (t.dataset.ceText !== undefined) { ed.blocks[Number(t.dataset.ceText)].s = t.value; ColumnEditor.refreshPreview(); }
  if (t.id === 'ceTitle') ed.title = t.value;
});
