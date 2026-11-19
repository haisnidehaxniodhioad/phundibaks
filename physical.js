/**
 * physical.js ― フィジカル測定（NEXT BASE の Physical Test Feedback）の取り込みと表示（v93・v94）
 *
 *   取り込み（スタッフ：管理者・トレーナー）：PDFを何枚でも選ぶ → 端末の中でPDFの文字と位置を読み（pdf.js）、1ページ目を画像にする
 *     → 画像を直す（Phys.editImage）→ 名前で選手を探す → 確認の表（直した画像の見本つき）→ 保存（API physSave：数値と直した画像。PDFは送らない）
 *   表示：選手＝トレーニングのタブの「フィジカル測定」（自分の分だけ）、スタッフ＝データ分析の「フィジカル」（全員）。どちらも直した画像だけ
 *
 *   keke さんの決定
 *     v93（2026-11-19）：見られるのは本人とスタッフだけ・目標値は全員共通（シート「フィジカル目標」）・FFMI は計算した値・0 や読めない値は空欄
 *     v94（2026-11-19）：PDFを少し直した画像で見せる（方法A：取り込むときに画像にして直す）。アプリで作るレポートはやめ、数値はシートに保存だけ
 *       画像で直すこと：①表の誤り（FFMI を計算した値に、#DIV/0!・######・0 を「-」に）②除脂肪体重×FFMI の赤い点を正しいFFMIの位置へ
 *                       ③ロゴを隠す ④目標をクリアした数値を緑で目立たせる
 *   ★ PDFの形が変わって読めなくなったら Phys.FIELDS の re（ラベルの文字）と Phys.parse・Phys.editImage を直す
 */
var Phys = {
  data: null,        // physList の結果 { records, targets, fields, athletes?, editor? }
  person: null,      // スタッフ画面で開いている選手のID
  sel: null,         // 表示している測定ID
  imgCache: {},      // 測定ID → 画像（data URL）
  imp: null,         // 取り込みの途中 { rows: [{ file, name, date, athleteId, v, img, warn, err }] }
  importOpen: false,
  SCALE: 2,          // PDF を画像にするときの倍率（A4 → 約1190×1684）
  JPEG_Q: 0.88,
  HIT_BG: '#d3efdb', HIT_FG: '#17703a',   // 目標クリアの色（背景・文字）

  /** 項目：キー・表の名前・単位・PDFのラベル（正規表現。空白は消してから比べる） */
  FIELDS: [
    { key: 'height', name: '身長', unit: 'cm', re: /^身長/ },
    { key: 'weight', name: '体重', unit: 'kg', re: /^体重/ },
    { key: 'fat', name: '体脂肪率', unit: '%', re: /^体脂肪率/ },
    { key: 'lbm', name: '除脂肪体重', unit: 'kg', re: /^除脂肪体重/ },
    { key: 'ffmi', name: 'FFMI', unit: '', re: /^除脂肪指数/, calc: true },   // PDFの値は使わず計算する（画像も計算した値に書きかえる）
    { key: 'sq', name: 'スクワット1RM', unit: 'kg', re: /^スクワット1RM（/ },
    { key: 'sqbw', name: 'スクワット1RM/体重', unit: 'kg/BW', re: /^スクワット1RM\/体重/ },
    { key: 'bp', name: 'ベンチプレス1RM', unit: 'kg', re: /^ベンチプレス1RM（/ },
    { key: 'bpbw', name: 'ベンチプレス1RM/体重', unit: 'kg/BW', re: /^ベンチプレス1RM\/(BW|体重)/ },
    { key: 'pull', name: 'プルアップ', unit: '回', re: /^プルアップ/ },
    { key: 'sj', name: 'SJ', unit: 'cm', re: /^反動なし/ },
    { key: 'cmj', name: 'CMJ', unit: 'cm', re: /^反動あり/ },
    { key: 'pp', name: 'CMJピークパワー', unit: 'W', re: /^CMJピークパワー$/ },
    { key: 'ppbw', name: 'CMJピークパワー/体重', unit: 'W/kg', re: /^CMJピークパワー\/体重/ },
    { key: 'eur', name: '反動利用率', unit: '%', re: /^反動利用率/ },
    { key: 'rsi', name: 'RSI', unit: 'm/s', re: /^反応筋力指数/ },
    { key: 'fvimb', name: '力-速度インバランス', unit: '%', re: /^力-速度インバランス/ },
    { key: 'fvp', name: '力-速度プロファイル', unit: '', re: /^力-速度プロファイル/, text: true }
  ],

  field: function (k) { return Phys.FIELDS.filter(function (f) { return f.key === k; })[0]; },
  fmt: function (k, v) {
    if (v === undefined || v === null || v === '') return '-';
    if (Phys.field(k) && Phys.field(k).text) return String(v);
    var d = ['sqbw', 'bpbw'].indexOf(k) >= 0 ? 1 : k === 'rsi' ? 2 : ['height', 'sq', 'bp', 'pull', 'pp', 'eur', 'fvimb'].indexOf(k) >= 0 ? 0 : 1;
    return Number(v).toFixed(d);
  },
  load: function (force) {
    if (Phys.data && !force) return Promise.resolve(Phys.data);
    return Api.call('physList', { token: S.token }).then(function (res) { Phys.data = res; return res; });
  },
  recordsOf: function (id) {
    return (Phys.data.records || []).filter(function (r) { return !id || r.athleteId === id; });
  },
  athlete: function (id) { return (Phys.data.athletes || []).filter(function (a) { return a.id === id; })[0]; },
  dLong: function (d) { var p = String(d).split('-'); return p.length === 3 ? Number(p[0]) + '年' + Number(p[1]) + '月' + Number(p[2]) + '日' : d; },

  // ================= 表示（選手・スタッフ共通）：直した画像と、測定日の切り替え =================
  viewHtml: function (recs, editor) {
    if (!recs.length) return '<div class="group"><p class="muted">まだフィジカル測定の結果がありません。</p></div>';
    var list = recs.slice().reverse();   // 新しい順
    if (!Phys.sel || !list.some(function (r) { return r.id === Phys.sel; })) Phys.sel = list[0].id;
    var r = list.filter(function (x) { return x.id === Phys.sel; })[0];
    var html = '<div class="group">';
    if (list.length > 1) html += '<div class="phys-dates">' + list.map(function (x) {
      return '<button class="btn sub btn-pill small' + (x.id === Phys.sel ? ' on' : '') + '" data-physv="sel" data-v="' + esc(x.id) + '">' + esc(Phys.dLong(x.date)) + '</button>'; }).join('') + '</div>';
    html += '<div class="hcard-head"><span class="kicker">' + esc(Phys.dLong(r.date)) + 'の結果</span>' +
      (editor ? '<button class="btn ghost small" data-physv="del" data-v="' + esc(r.id) + '">この測定を消す</button>' : '') + '</div>' +
      '<div class="phys-img" id="physImg">' + (r.image ? '<div class="loading">画像を読み込み中…</div>' : '<p class="muted">この測定には画像がありません（PDFから取り込み直してください）。</p>') + '</div>' +
      '<p class="muted small">緑の数字は目標をクリアした項目。FFMIは 除脂肪体重÷身長(m)² で計算した値に直しています。「-」は測っていない・計算できなかった項目です。</p></div>';
    return html;
  },
  /** 選んでいる測定の画像を読み込んで入れる（一度読んだものは覚えておく） */
  fillImg: function () {
    var box = document.getElementById('physImg'), id = Phys.sel;
    var r = (Phys.data.records || []).filter(function (x) { return x.id === id; })[0];
    if (!box || !r || !r.image) return;
    var put = function (src) {
      var b = document.getElementById('physImg');
      if (b && Phys.sel === id) b.innerHTML = '<img src="' + src + '" alt="' + esc(Phys.dLong(r.date)) + 'のフィジカル測定の結果">';
    };
    if (Phys.imgCache[id]) return put(Phys.imgCache[id]);
    Api.call('physImage', { token: S.token, id: id }).then(function (res) {
      Phys.imgCache[id] = 'data:' + res.mime + ';base64,' + res.data;
      put(Phys.imgCache[id]);
    }).catch(function (err) { var b = document.getElementById('physImg'); if (b) b.innerHTML = msgHtml('error', err.message); });
  },

  // ---------------- 選手：トレーニングのタブの「フィジカル測定」 ----------------
  showMine: function () {
    S.view = 'phys';
    Body.closeHistory();
    app.innerHTML = Training.segHtml('phys') + '<div class="group"><div class="topbar"><h1>フィジカル測定</h1><button class="btn ghost" data-act="home">ホームへ</button></div>' +
      '<p class="muted small">半年に1回くらいの、体と力の測定の結果だよ。自分とスタッフだけが見られるよ。</p></div><div id="physMine"><div class="loading">読み込み中…</div></div>';
    window.scrollTo(0, 0);
    Phys.load(true).then(Phys.fillMine).catch(function (err) {
      var box = document.getElementById('physMine');
      if (box) box.innerHTML = msgHtml('error', err.message);
    });
  },
  fillMine: function () {
    var box = document.getElementById('physMine');
    if (!box || S.view !== 'phys') return;
    box.innerHTML = Phys.viewHtml(Phys.recordsOf(), false);
    Phys.fillImg();
  },

  // ---------------- スタッフ：データ分析の「フィジカル」 ----------------
  renderStaff: function () {
    app.innerHTML = Staff.frame('<div id="physBoxS"><div class="loading">読み込み中…</div></div>');
    Phys.load().then(Phys.fillStaff).catch(function (err) {
      var box = document.getElementById('physBoxS');
      if (box) box.innerHTML = msgHtml('error', err.message);
    });
  },
  fillStaff: function () {
    var box = document.getElementById('physBoxS');
    if (!box) return;
    var d = Phys.data, html = '';
    if (d.editor) html += Phys.importHtml();
    if (Phys.person) {
      var a = Phys.athlete(Phys.person) || { name: Phys.person };
      html += '<div class="group"><div class="topbar"><h2>' + esc(a.name) + 'さんのフィジカル測定</h2><button class="btn ghost" data-physv="close">' + Icon('left', 16) + '一覧へ</button></div></div>' +
        Phys.viewHtml(Phys.recordsOf(Phys.person), d.editor);
    } else html += Phys.teamHtml();
    box.innerHTML = html;
    if (Phys.person) Phys.fillImg();
  },
  /** 測定のある選手の一覧（名前を押すと、その選手の画像） */
  teamHtml: function () {
    var by = {};
    Phys.recordsOf().forEach(function (r) { (by[r.athleteId] = by[r.athleteId] || []).push(r); });
    var ids = Object.keys(by);
    var html = '<div class="group"><div class="hcard-head"><span class="kicker">測定のある選手（' + ids.length + '人）</span></div>';
    if (!ids.length) return html + '<p class="muted">まだ測定がありません。' + (Phys.data.editor ? '上の「PDFを読み取る」から取り込めます。' : '') + '</p></div>';
    var order = ids.map(function (id) { return { id: id, a: Phys.athlete(id) || { name: id, grade: '' }, recs: by[id] }; })
      .sort(function (x, y) { return String(y.a.grade).localeCompare(String(x.a.grade), 'ja') || String(x.a.kana || x.a.name).localeCompare(String(y.a.kana || y.a.name), 'ja'); });
    return html + '<div class="table-scroll"><table class="tbl phys-team"><tr><th>選手</th><th>学年</th><th>測定日（新しい順）</th></tr>' +
      order.map(function (o) {
        return '<tr><td><button class="link" data-physv="open" data-v="' + esc(o.id) + '">' + esc(o.a.name) + '</button></td><td>' + esc(o.a.grade || '-') + '</td><td class="small">' +
          o.recs.slice().reverse().map(function (r) { return esc(r.date); }).join('、') + '</td></tr>';
      }).join('') + '</table></div></div>';
  },

  // ================= 取り込み =================
  importHtml: function () {
    var html = '<details class="group phys-imp"' + (Phys.importOpen || Phys.imp ? ' open' : '') + '><summary><b>PDFを読み取る（フィジカル測定の取り込み）</b><span class="muted small">　管理者・トレーナー</span></summary>' +
      '<p class="muted small">測定会社の「Physical Test Feedback」のPDFを、何人分でもまとめて選んでください。この端末の中でPDFを画像にして、表の誤り・FFMIの点・ロゴ・目標クリアの色を直してから保存します（PDFは送りません）。同じ選手・同じ測定日は上書きされます。</p>' +
      '<input type="file" id="physFile" accept="application/pdf" multiple data-physv="file">';
    if (Phys.imp) html += Phys.impTableHtml();
    return html + '</details>';
  },
  impTableHtml: function () {
    var rows = Phys.imp.rows, ath = (Phys.data.athletes || []).filter(function (a) { return a.active; });
    var opts = function (sel) {
      return '<option value="">（選手を選ぶ）</option>' + ath.map(function (a) { return '<option value="' + esc(a.id) + '"' + (a.id === sel ? ' selected' : '') + '>' + esc(a.name) + (a.grade ? '（' + esc(a.grade) + '）' : '') + '</option>'; }).join('');
    };
    var ok = rows.filter(function (r) { return !r.err && r.athleteId && /^\d{4}-\d{2}-\d{2}$/.test(r.date); }).length;
    return '<div class="phys-imp-list">' + rows.map(function (r, i) {
      if (r.err) return '<div class="phys-imp-row phys-bad"><b>' + esc(r.file) + '</b><div>' + esc(r.err) + '</div></div>';
      return '<div class="phys-imp-row' + (r.athleteId ? '' : ' phys-warn') + '">' +
        '<button class="phys-thumb" data-physv="zoom" data-i="' + i + '" title="大きく見る"><img src="' + r.img + '" alt="直した画像"></button>' +
        '<div class="phys-imp-info"><label class="small"><input type="checkbox" data-physv="use" data-i="' + i + '"' + (r.use !== false && r.athleteId ? ' checked' : '') + '> 保存する</label>' +
        '<div><b>' + esc(r.name || '（名前を読めませんでした）') + '</b> <span class="muted small">' + esc(r.file) + '</span></div>' +
        '<div class="row"><select data-physv="who" data-i="' + i + '">' + opts(r.athleteId) + '</select><input type="date" value="' + esc(r.date) + '" data-physv="date" data-i="' + i + '"></div>' +
        (r.athleteId ? '' : '<div class="small phys-warn-t">名前が見つかりません。選手を選んでください</div>') +
        '<div class="small muted">直したところ：' + esc(r.fixed.length ? r.fixed.join('・') : 'なし') + '</div>' +
        (r.warn.length ? '<div class="small phys-warn-t">' + esc(r.warn.join(' ')) + '</div>' : '') + '</div>' +
        (r.zoom ? '<div class="phys-zoom"><img src="' + r.img + '" alt="直した画像（大きく）"></div>' : '') + '</div>';
    }).join('') + '</div>' +
      '<p class="muted small">見本を押すと大きく見られます（もう一度押すと閉じます）。0・#DIV/0! などの読めない値は「-」に、CMJ が無いときのピークパワー・反動利用率も「-」にしています。</p>' +
      '<div class="row"><button class="btn btn-primary" data-physv="save"' + (ok ? '' : ' disabled') + '>チェックした分を保存する</button><button class="btn ghost" data-physv="cancel">やめる</button></div>' +
      (Phys.imp.msg ? msgHtml(Phys.imp.ok ? 'ok' : 'error', Phys.imp.msg) : '');
  },
  norm: function (s) { return String(s || '').replace(/[\s　]/g, ''); },

  /** PDFの1ページ目を読む → { items: [{ s, x, y, w, h }]（pt。y は上からの文字の下端）, canvas（SCALE 倍の画像） } */
  readPdf: function (file) {
    return MenuImport.loadPdfjs().then(function () { return file.arrayBuffer(); }).then(function (buf) {
      return window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    }).then(function (doc) { return doc.getPage(1); }).then(function (page) {
      var vp1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: Phys.SCALE });
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () { return page.getTextContent(); }).then(function (tc) {
        var items = [];
        tc.items.forEach(function (i) {
          if (!i.str || !i.str.trim()) return;
          items.push({ s: i.str, x: i.transform[4], y: vp1.height - i.transform[5], w: i.width, h: Math.abs(i.transform[3]) || 8 });
        });
        return { items: items, canvas: canvas };
      });
    });
  },
  /** 文字から1人分を読む → { name, date, v（保存する数値）, cells（表の今回値のマスの位置・元の文字）, pdfFfmi, col（今回値の列の左右） } */
  parse: function (items) {
    var all = items.map(function (i) { return i.s; }).join('');
    if (all.indexOf('Physical Test Feedback') < 0 && all.indexOf('評価項目') < 0) throw new Error('「Physical Test Feedback」のPDFではないようです。');
    var rows = [];
    items.slice().sort(function (a, b) { return a.y - b.y; }).forEach(function (i) {
      var r = rows.filter(function (x) { return Math.abs(x.y - i.y) <= 4; })[0];
      if (r) r.items.push(i); else rows.push({ y: i.y, items: [i] });
    });
    var find = function (s) { return items.filter(function (i) { return i.s.indexOf(s) >= 0; })[0]; };
    var hNow = find('今回値'), hTgt = find('目標値');
    var cNow = hNow ? hNow.x + hNow.w / 2 : 203, cTgt = hTgt ? hTgt.x + hTgt.w / 2 : 260, half = (cTgt - cNow) / 2;
    var col = { l: cNow - half, r: cNow + half };   // 今回値のマスの左右（pt）
    var out = { name: '', date: '', v: {}, cells: {}, pdfFfmi: null, col: col, rows: rows };
    var nameLab = items.filter(function (i) { return Phys.norm(i.s) === '名前'; })[0];
    if (nameLab) {
      var nr = rows.filter(function (r) { return Math.abs(r.y - nameLab.y) <= 6; })[0];
      if (nr) out.name = nr.items.filter(function (i) { return i.x > nameLab.x + 20 && i.x < 300; }).map(function (i) { return i.s; }).join('').trim();
    }
    var dm = all.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (dm) out.date = dm[1] + '-' + ('0' + dm[2]).slice(-2) + '-' + ('0' + dm[3]).slice(-2);
    rows.forEach(function (r) {
      var lab = Phys.norm(r.items.filter(function (i) { return i.x < col.l - 2; }).map(function (i) { return i.s; }).join(''));
      if (!lab) return;
      var f = Phys.FIELDS.filter(function (f) { return f.re.test(lab); })[0];
      if (!f) return;
      var near = items.filter(function (i) { return Math.abs(i.y - r.y) <= 4 && i.x >= col.l - 2 && i.x < col.r; }).sort(function (a, b) { return a.x - b.x; });
      var txt = near.map(function (i) { return i.s; }).join(' ').trim();
      var base = near.length ? Math.max.apply(null, near.map(function (i) { return i.y; })) : r.y;
      var h = near.length ? Math.max.apply(null, near.map(function (i) { return i.h; })) : 8;
      out.cells[f.key] = { y: base, h: h, raw: txt };
      if (f.text) { var t = txt.replace(/\s+/g, ' ').trim(); if (t && t !== '-' && t.charAt(0) !== '#') out.v[f.key] = t; return; }
      if (/#/.test(txt)) return;
      var m = txt.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
      if (!m) return;
      var n = Number(m[0]);
      if (f.key === 'ffmi') { out.pdfFfmi = n; return; }   // PDFのFFMIは保存しない（点を動かすときだけ使う）
      if (n > 0) out.v[f.key] = n;
    });
    if (out.v.cmj === undefined) { delete out.v.pp; delete out.v.ppbw; delete out.v.eur; }
    if (out.v.sj === undefined) delete out.v.eur;
    if (out.v.height && out.v.lbm) out.v.ffmi = Math.round(out.v.lbm / Math.pow(out.v.height / 100, 2) * 10) / 10;   // 画像に書く値（保存のときも Apps Script で同じ計算をする）
    if (!Object.keys(out.v).length) throw new Error('数値を読み取れませんでした（PDFの形が違うかもしれません）。');
    return out;
  },

  /** 画像を直す → { img（JPEG の data URL）, fixed（直したところ）, warn（直せなかったところ） } */
  editImage: function (canvas, items, p, targets) {
    var K = Phys.SCALE, ctx = canvas.getContext('2d'), fixed = [], warn = [];
    var px = function (x, y) { var d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data; return [d[0], d[1], d[2]]; };
    var rgb = function (c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; };
    // ① 表：今回値のマスを書きかえる（FFMI は計算した値、読めない値は「-」、目標クリアは緑の背景と太字）
    var nBlank = 0, nHit = 0, fs = Math.max.apply(null, Object.keys(p.cells).map(function (k) { return p.cells[k].h; }).concat([7]));   // 表の文字の大きさ（そろえる）
    Phys.FIELDS.forEach(function (f) {
      var c = p.cells[f.key];
      if (!c) return;
      var v = p.v[f.key], t = targets[f.key], hit = !f.text && v !== undefined && t !== undefined && v >= t;
      var blank = v === undefined && c.raw && c.raw !== '-';
      if (!(f.calc || blank || hit)) return;
      var x0 = (p.col.l + 1) * K, x1 = (p.col.r - 1) * K, y0 = (c.y - c.h - 1.2) * K, y1 = (c.y + 2.6) * K;
      var bg = px(x0 + 2, (y0 + y1) / 2);
      ctx.fillStyle = hit ? Phys.HIT_BG : rgb(bg);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      var s = v === undefined ? '-' : Phys.fmt(f.key, v) + (f.unit ? ' ' + f.unit : '');
      ctx.fillStyle = hit ? Phys.HIT_FG : '#1f2433';
      ctx.font = (hit ? '700 ' : '500 ') + (fs * 0.95 * K).toFixed(1) + 'px "Helvetica Neue", Arial, "Hiragino Sans", "Noto Sans JP", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(s, (x0 + x1) / 2, c.y * K);
      if (blank) nBlank++;
      if (hit) nHit++;
    });
    if (p.cells.ffmi) fixed.push('FFMIを計算した値（' + Phys.fmt('ffmi', p.v.ffmi) + '）に');
    if (nBlank) fixed.push('読めない値など' + nBlank + 'か所を「-」に');
    if (nHit) fixed.push('目標クリア' + nHit + '項目を緑に');
    // ② 除脂肪体重×FFMI の散布図：赤い点を正しい FFMI の位置へ
    var mv = Phys.moveDot(ctx, items, p);
    if (mv === true) fixed.push('FFMIの点を正しい位置に');
    else if (mv) warn.push(mv);
    // ③ ロゴを隠す（「NEXT BASE」の文字とその上のマーク）
    var nb = items.filter(function (i) { return /NEXT\s*BASE/i.test(i.s); })[0];
    var lx0 = nb ? Math.min(nb.x, 470) - 10 : 462, lx1 = nb ? Math.max(nb.x + nb.w, 545) + 12 : 565, ly1 = nb ? nb.y + 12 : 128;
    ctx.fillStyle = '#fff';
    ctx.fillRect(lx0 * K, 22 * K, (lx1 - lx0) * K, (ly1 - 22) * K);
    fixed.push('ロゴを隠す');
    return { img: canvas.toDataURL('image/jpeg', Phys.JPEG_Q), fixed: fixed, warn: warn };
  },
  /** 赤い点を動かす。true＝動かした、文字＝直せなかった理由、''＝動かす必要なし */
  moveDot: function (ctx, items, p) {
    var K = Phys.SCALE;
    if (p.v.ffmi === undefined || p.v.lbm === undefined || p.pdfFfmi === null) return '';
    if (Math.abs(p.pdfFfmi - p.v.ffmi) < 0.05) return '';
    // グラフの場所：横軸の名前「除脂肪体重（kg）」の行と、その上の目盛りの数字・左の目盛りの数字
    var title = p.rows.filter(function (r) { return Phys.norm(r.items.filter(function (i) { return i.x < 300; }).map(function (i) { return i.s; }).join('')).indexOf('除脂肪体重（kg）') >= 0; })[0];
    if (!title) return 'FFMIの散布図が見つからず、点は動かしていません。';
    var num = function (i) { return /^\d+(\.\d+)?$/.test(i.s.trim()); };
    var yt = items.filter(function (i) { return num(i) && i.x < 90 && i.y < title.y - 14 && i.y > title.y - 260; });   // 左の目盛り（縦軸）
    var yx = yt.length ? Math.max.apply(null, yt.map(function (i) { return i.x + i.w; })) : 60;
    var xt = items.filter(function (i) { return num(i) && i.x > yx + 2 && i.x < 300 && i.y < title.y - 2 && i.y > title.y - 25; });   // 下の目盛り（横軸。縦軸の数字は除く）
    if (xt.length < 2 || yt.length < 2) return 'FFMIの散布図の目盛りが読めず、点は動かしていません。';
    var fit = function (arr, pos) {   // いちばん小さい目盛りと大きい目盛りで、値 → 位置
      arr = arr.slice().sort(function (a, b) { return Number(a.s) - Number(b.s); });
      var a = arr[0], b = arr[arr.length - 1], va = Number(a.s), vb = Number(b.s);
      return function (v) { return pos(a) + (pos(b) - pos(a)) * (v - va) / (vb - va); };
    };
    var fx = fit(xt, function (i) { return i.x + i.w / 2; }), fy = fit(yt, function (i) { return i.y - i.h * 0.35; });
    var cx = fx(p.v.lbm) * K, cy = fy(p.pdfFfmi) * K, R = 16 * K;
    // 赤い点を探す（赤っぽい画素のまとまり）
    var img = ctx.getImageData(Math.round(cx - R), Math.round(cy - R), Math.round(2 * R), Math.round(2 * R)), d = img.data, W = img.width;
    var minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, sr = 0, sg = 0, sb = 0, n = 0;
    for (var k = 0; k < d.length; k += 4) {
      var r = d[k], g = d[k + 1], b = d[k + 2];
      if (r > 180 && r - g > 60 && r - b > 40) {
        var X = (k / 4) % W, Y = Math.floor(k / 4 / W);
        minX = Math.min(minX, X); maxX = Math.max(maxX, X); minY = Math.min(minY, Y); maxY = Math.max(maxY, Y);
        sr += r; sg += g; sb += b; n++;
      }
    }
    if (n < 20) return 'FFMIの散布図の赤い点が見つからず、点は動かしていません。';
    var ox = cx - R + (minX + maxX) / 2, oy = cy - R + (minY + maxY) / 2, rad = Math.max(maxX - minX, maxY - minY) / 2;
    var col = 'rgb(' + Math.round(sr / n) + ',' + Math.round(sg / n) + ',' + Math.round(sb / n) + ')';
    // 点を消す：まわりの4か所の色のうち、いちばん明るい色（グラフの地の色）で塗る
    var around = [[-rad - 5, 0], [rad + 5, 0], [0, -rad - 5], [0, rad + 5]].map(function (o) { return ctx.getImageData(Math.round(ox + o[0]), Math.round(oy + o[1]), 1, 1).data; })
      .sort(function (a, b) { return (b[0] + b[1] + b[2]) - (a[0] + a[1] + a[2]); });
    var bg = around[1] || around[0];   // 2番目に明るい色（白い目盛り線を避ける）
    ctx.fillStyle = 'rgb(' + bg[0] + ',' + bg[1] + ',' + bg[2] + ')';
    ctx.beginPath(); ctx.arc(ox, oy, rad + 2.5, 0, Math.PI * 2); ctx.fill();
    // 正しい位置に同じ大きさ・色で描く
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(fx(p.v.lbm) * K, fy(p.v.ffmi) * K, rad, 0, Math.PI * 2); ctx.fill();
    return true;
  },
  readFiles: function (files) {
    if (!files || !files.length) return;
    if (typeof MenuImport === 'undefined') { alert('PDFを読む部品（menu_import.js）が読み込めていません。'); return; }
    var box = document.getElementById('physFile');
    if (box) box.insertAdjacentHTML('afterend', '<div class="loading" id="physLoading">読み取り中…（' + files.length + '件）</div>');
    var ath = Phys.data.athletes || [], rows = [], chain = Promise.resolve(), T = Phys.data.targets || {};
    Array.prototype.forEach.call(files, function (file) {
      chain = chain.then(function () { return Phys.readPdf(file); }).then(function (pdf) {
        var r = Phys.parse(pdf.items), key = Phys.norm(r.name), e = Phys.editImage(pdf.canvas, pdf.items, r, T);
        var hit = ath.filter(function (a) { return a.active && key && (Phys.norm(a.name) === key || Phys.norm(a.kana) === key); });
        rows.push({ file: file.name, name: r.name, date: r.date, v: r.v, img: e.img, fixed: e.fixed, warn: e.warn, athleteId: hit.length === 1 ? hit[0].id : '' });
      }).catch(function (err) { rows.push({ file: file.name, err: err.message }); });
    });
    chain.then(function () {
      Phys.imp = { rows: rows };
      Phys.fillStaff();
    });
  },
  /** 保存：画像があるので1人ずつ送る */
  save: function () {
    var send = Phys.imp.rows.filter(function (r) { return !r.err && r.use !== false && r.athleteId && /^\d{4}-\d{2}-\d{2}$/.test(r.date); });
    if (!send.length) return;
    var ids = send.map(function (r) { return r.athleteId + r.date; });
    if (ids.some(function (id, i) { return ids.indexOf(id) !== i; }) && !confirm('同じ選手・同じ測定日が2つ以上あります。あとの分で上書きされますが、続けますか？')) return;
    var btn = document.querySelector('[data-physv="save"]'), done = 0, added = 0, updated = 0, chain = Promise.resolve();
    if (btn) btn.disabled = true;
    send.forEach(function (r) {
      chain = chain.then(function () {
        if (btn) btn.textContent = '保存中…（' + (done + 1) + ' / ' + send.length + '）';
        return Api.call('physSave', { token: S.token, records: [{ athleteId: r.athleteId, date: r.date, v: r.v, image: { mime: 'image/jpeg', data: r.img.split(',')[1] } }] });
      }).then(function (res) { done++; added += res.added; updated += res.updated; r.saved = true; });
    });
    chain.then(function () {
      Phys.imp = null; Phys.importOpen = false; Phys.imgCache = {};
      return Phys.load(true).then(function () {
        Phys.fillStaff();
        var b = document.getElementById('physBoxS');
        if (b) b.insertAdjacentHTML('afterbegin', msgHtml('ok', '保存しました（新しく ' + added + '人・上書き ' + updated + '人）。'));
      });
    }).catch(function (err) {
      Phys.imp.rows = Phys.imp.rows.filter(function (r) { return !r.saved; });   // 保存できた分は表から外す
      Phys.imp.msg = (done ? done + '人分は保存しました。' : '') + err.message; Phys.imp.ok = false; Phys.fillStaff();
    });
  },
  remove: function (id) {
    if (!confirm('この測定を消しますか？（元に戻せません。PDFから取り込み直すことはできます）')) return;
    Api.call('physDelete', { token: S.token, id: id }).then(function () { delete Phys.imgCache[id]; Phys.sel = null; return Phys.load(true); })
      .then(Phys.fillStaff).catch(function (err) { alert(err.message); });
  }
};

// 操作の振り分け（選手の「フィジカル測定」とスタッフ画面の「フィジカル」）
document.addEventListener('click', function (e) {
  var t = e.target.closest('[data-physv]');
  if (!t || (S.view !== 'staff' && S.view !== 'phys') || t.tagName === 'INPUT' || t.tagName === 'SELECT') return;
  var k = t.dataset.physv;
  if (k === 'sel') { Phys.sel = t.dataset.v; if (S.view === 'phys') Phys.fillMine(); else Phys.fillStaff(); return; }
  if (S.view !== 'staff') return;
  if (k === 'open') { Phys.person = t.dataset.v; Phys.sel = null; Phys.fillStaff(); window.scrollTo(0, 0); }
  else if (k === 'close') { Phys.person = null; Phys.fillStaff(); }
  else if (k === 'save') Phys.save();
  else if (k === 'cancel') { Phys.imp = null; Phys.fillStaff(); }
  else if (k === 'del') Phys.remove(t.dataset.v);
  else if (k === 'zoom' && Phys.imp) { var zr = Phys.imp.rows[Number(t.dataset.i)]; if (zr) { zr.zoom = !zr.zoom; Phys.fillStaff(); } }
});
document.addEventListener('change', function (e) {
  var t = e.target.closest('[data-physv]');
  if (!t || S.view !== 'staff') return;
  var k = t.dataset.physv, r = Phys.imp && Phys.imp.rows[Number(t.dataset.i)];
  if (k === 'file') { Phys.readFiles(t.files); return; }
  if (!r) return;
  if (k === 'who') { r.athleteId = t.value; if (t.value) r.use = true; Phys.fillStaff(); }
  else if (k === 'date') { r.date = t.value; Phys.fillStaff(); }
  else if (k === 'use') { r.use = t.checked; }
});
