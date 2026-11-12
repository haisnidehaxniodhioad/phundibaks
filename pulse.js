/**
 * pulse.js ― パルススロー（Pulse）の画面（v88）
 *
 *   ・取込（担当者用）… スタッフの「管理・設定」→「パルスの取り込み」（管理者・トレーナーだけ。Staff.page＝'pulseImport'）
 *       選手・日付・メモ → 動画を選ぶ（端末の中で読み取り。pulse_reader.js）→ 確認表で直す → 保存（pulseSave）
 *       動画は送らない・保存しない。保存するのは数値だけ
 *   ・スタッフの閲覧 … 「データ分析」の「パルス」タブ（Staff.tab＝'pulse'）。全員の一覧 → 選手を押すと測定ごとの平均・最大と推移のグラフ
 *       担当者は測定ごとに「直す」（取込の画面で pulseUpdate）・「消す」（pulseDelete）
 *   ・選手の閲覧 … 「からだ」の「パルス」タブ（Body.tab＝'pulse'）。自分の推移と、いちばん新しい測定の所見、チーム全員の一覧（名前つき）
 *   ・所見は Apps Script（パルス.gs）が「パルス所見ルール」シートの決まりで作る（生成AIは使わない）
 *   ・テスト用の選手（学年も入学年度も無い）は一覧に出さない（サーバーでも除いている）
 *   データ：pulseList（全員のまとめ）、pulseDetail（1回分の投球と所見）
 */
var Pulse = {
  data: null,        // pulseList の結果 { athletes, sessions, editor, me }
  details: {},       // 測定ID → pulseDetail の結果
  sel: '',           // 開いている選手（'' なら全員の一覧）
  openId: '',        // 投球の一覧を開いている測定
  imp: null,         // 取込の画面の状態
  IND: { up: '▲', 'in': '◆', down: '▼' },
  INDNAME: { up: '高い', 'in': '適正', down: '低い' },

  load: function (force) {
    if (Pulse.data && !force) return Promise.resolve(Pulse.data);
    return Api.call('pulseList', { token: S.token }).then(function (res) { Pulse.data = res; return res; });
  },
  detail: function (id) {
    if (Pulse.details[id]) return Promise.resolve(Pulse.details[id]);
    return Api.call('pulseDetail', { token: S.token, id: id }).then(function (res) { Pulse.details[id] = res; return res; });
  },
  reset: function () { Pulse.data = null; Pulse.details = {}; },

  // ---------------- 小さな道具 ----------------
  n1: function (v) { return v === '' || v === null || v === undefined ? '-' : String(Math.round(Number(v) * 10) / 10); },
  gnum: function (a) { var m = /(\d)/.exec(a.grade || ''); return m ? Number(m[1]) : 0; },
  md: function (d) { return d ? Number(d.slice(5, 7)) + '/' + Number(d.slice(8, 10)) : ''; },
  /** 一覧に出す選手（テスト用は、サーバーの設定「テスト選手も入れる」が TRUE のときだけ。v88b） */
  isTest: function (a) { return !!(window.Export && Export.isTest(a)); },
  athletes: function () {
    var withTest = Pulse.data && Pulse.data.withTest;
    return ((Pulse.data && Pulse.data.athletes) || []).filter(function (a) { return withTest || !Pulse.isTest(a); })
      .sort(function (x, y) { return Pulse.gnum(y) - Pulse.gnum(x) || String(x.kana || x.name).localeCompare(String(y.kana || y.name), 'ja'); });
  },
  athleteOf: function (id) { return ((Pulse.data && Pulse.data.athletes) || []).filter(function (a) { return a.id === id; })[0] || null; },
  /** 選手の測定（古い順） */
  sessionsOf: function (id) {
    return ((Pulse.data && Pulse.data.sessions) || []).filter(function (s) { return s.athleteId === id; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.id < b.id ? -1 : 1); });
  },
  isStaff: function () { return S.view === 'staff'; },
  editor: function () { return Pulse.isStaff() && Pulse.data && Pulse.data.editor; },
  box: function () { return document.getElementById(Pulse.isStaff() ? 'pulseBox' : 'pulseMine'); },

  // ---------------- 描く ----------------
  /** スタッフ：データ分析の「パルス」タブ */
  renderStaff: function () {
    app.innerHTML = Staff.frame('<div id="pulseBox" class="pulse-box"><div class="loading">読み込み中…</div></div>');
    Pulse.fill();
  },
  /** 選手：からだの「パルス」タブ（body.js が #pulseMine を描いたあとに呼ぶ） */
  mountAthlete: function () { Pulse.fill(); },

  fill: function (force) {
    Pulse.load(force).then(function () {
      var box = Pulse.box();
      if (!box) return;
      box.innerHTML = Pulse.viewHtml();
      Pulse.fillLazy();
    }).catch(function (err) {
      if (err.needLogin && Pulse.isStaff()) return Staff.fail(err);
      var box = Pulse.box();
      if (box) box.innerHTML = msgHtml('error', err.message) + '<button class="btn block" data-pulse="reload">もう一度読み込む</button>';
    });
  },

  viewHtml: function () {
    var me = (Pulse.data && Pulse.data.me) || '';
    var back = '<button class="btn ghost small pulse-back" data-pulse="team">' + Icon('left', 18) + (me ? '自分のページへ' : '全員の一覧へ') + '</button>';
    if (Pulse.isStaff()) {
      if (Pulse.sel) return back + Pulse.personHtml(Pulse.sel);
      return Pulse.teamHtml() + '<button class="btn ghost" data-pulse="xlsx">' + Icon('sheet', 18) + ' Excelで保存（パルス）</button>';
    }
    if (Pulse.sel && Pulse.sel !== me) return back + Pulse.personHtml(Pulse.sel);
    return (me ? Pulse.personHtml(me, true) : '') + Pulse.teamHtml();
  },

  /** 全員の一覧（いちばん新しい測定の値。測定した選手だけ） */
  teamHtml: function () {
    var list = Pulse.athletes(), done = [], none = 0;
    list.forEach(function (a) { var s = Pulse.sessionsOf(a.id); if (s.length) done.push({ a: a, s: s, last: s[s.length - 1] }); else none++; });
    var me = (Pulse.data && Pulse.data.me) || '';
    var html = '<div class="card"><h2>チーム全員（いちばん新しい測定）</h2>';
    if (!done.length) return html + '<p class="muted">まだパルスの測定がありません。</p></div>';
    html += '<div class="table-scroll"><table class="line-table pulse-table"><tr><th>名前</th><th>学年</th><th>ポジション</th><th>測定日</th><th class="r">回数</th>' +
      '<th class="r">トルク平均</th><th class="r">スロット平均</th><th class="r">スピード平均</th><th class="r">スピード最大</th><th class="r">球速最大</th></tr>' +
      done.map(function (x) {
        var l = x.last;
        return '<tr' + (x.a.id === me ? ' class="pulse-me"' : '') + '><td class="name"><button class="link" data-pulse="sel" data-v="' + esc(x.a.id) + '">' + esc(x.a.name) + '</button></td>' +
          '<td>' + esc(x.a.grade || (Pulse.isTest(x.a) ? 'テスト' : '')) + '</td><td>' + esc(x.a.position) + '</td><td>' + esc(Pulse.md(l.date)) + '</td><td class="r">' + x.s.length + '</td>' +
          '<td class="r">' + Pulse.n1(l.avg.torque) + '</td><td class="r">' + Pulse.n1(l.avg.slot) + '</td><td class="r">' + Pulse.n1(l.avg.speed) + '</td>' +
          '<td class="r">' + Pulse.n1(l.max.speed) + '</td><td class="r">' + Pulse.n1(l.max.velo) + '</td></tr>';
      }).join('') + '</table></div>';
    return html + '<p class="muted small">トルク＝エルボートルク（Nm）、スロット＝アームスロット（°）、スピード＝アームスピード（rpm）、球速（km/h）。名前を押すと推移が見られます。' +
      (none ? 'まだ測定していない選手：' + none + '人。' : '') + '</p></div>';
  },

  /** 1人の選手：推移のグラフと測定ごとの表。mine＝選手本人のページ（いちばん新しい測定の所見を上に出す） */
  personHtml: function (id, mine) {
    var a = Pulse.athleteOf(id) || { name: '', grade: '', position: '' }, list = Pulse.sessionsOf(id), ed = Pulse.editor();
    var html = '<div class="card"><h2>' + (mine ? 'あなたのパルス' : esc(a.name) + 'さんのパルス') + '</h2><p class="muted small">' + esc([a.grade, a.position].filter(String).join('・')) + '</p>';
    if (!list.length) return html + '<p class="muted">' + (mine ? 'まだパルスの測定がないよ。測定すると、ここに数値とグラフが出るよ。' : 'まだ測定がありません。') + '</p></div>';
    var last = list[list.length - 1];
    html += '</div><div class="card pulse-find" id="pulseFind" data-id="' + esc(last.id) + '"><h2>' + esc(Body.dLong ? Body.dLong(last.date) : last.date) + 'の所見</h2><div class="loading">読み込み中…</div></div>';
    html += '<div class="card"><h2>推移</h2><div class="pulse-charts">' +
      Pulse.chart(list, [['avg', 'torque', '平均'], ['max', 'torque', '最大']], 'エルボートルク（Nm）') +
      Pulse.chart(list, [['avg', 'speed', '平均'], ['max', 'speed', '最大']], 'アームスピード（rpm）') +
      Pulse.chart(list, [['avg', 'slot', '平均']], 'アームスロット（°）') +
      (list.some(function (s) { return s.max.velo !== ''; }) ? Pulse.chart(list, [['avg', 'velo', '平均'], ['max', 'velo', '最大']], '球速（km/h）') : '') + '</div></div>';
    html += '<div class="card"><h2>測定ごと（新しい順）</h2><div class="table-scroll"><table class="line-table pulse-table"><tr><th>測定日</th><th class="r">球数</th>' +
      '<th class="r">トルク平均</th><th class="r">トルク最大</th><th class="r">スロット平均</th><th class="r">スピード平均</th><th class="r">スピード最大</th><th class="r">球速最大</th><th></th></tr>' +
      list.slice().reverse().map(function (s) {
        var open = Pulse.openId === s.id;
        return '<tr' + (open ? ' class="on"' : '') + '><td>' + esc(Pulse.md(s.date)) + (s.memo ? '<div class="muted small">' + esc(s.memo) + '</div>' : '') + '</td><td class="r">' + s.n + '</td>' +
          '<td class="r">' + Pulse.n1(s.avg.torque) + '</td><td class="r">' + Pulse.n1(s.max.torque) + '</td><td class="r">' + Pulse.n1(s.avg.slot) + '</td>' +
          '<td class="r">' + Pulse.n1(s.avg.speed) + '</td><td class="r">' + Pulse.n1(s.max.speed) + '</td><td class="r">' + Pulse.n1(s.max.velo) + '</td>' +
          '<td class="pulse-ops"><button class="btn ghost small" data-pulse="open" data-v="' + esc(s.id) + '">' + (open ? '閉じる' : '1球ずつ') + '</button>' +
          (ed ? '<button class="btn ghost small" data-pulse="edit" data-v="' + esc(s.id) + '">直す</button><button class="btn ghost small pulse-del" data-pulse="del" data-v="' + esc(s.id) + '">消す</button>' : '') + '</td></tr>' +
          (open ? '<tr class="pulse-detail-row"><td colspan="9"><div id="pulseDetail"><div class="loading">読み込み中…</div></div></td></tr>' : '');
      }).join('') + '</table></div>' +
      '<button class="btn ghost" data-pulse="print" data-v="' + esc(last.id) + '">' + Icon('file', 18) + ' いちばん新しい測定のレポートを印刷</button></div>';
    return html;
  },

  /** あとから読む部分（所見・1球ずつの表） */
  fillLazy: function () {
    var f = document.getElementById('pulseFind');
    if (f) Pulse.detail(f.dataset.id).then(function (d) {
      var el = document.getElementById('pulseFind');
      if (el && el.dataset.id === d.session.id) el.innerHTML = el.querySelector('h2').outerHTML + Pulse.findHtml(d);
    }).catch(function (err) { var el = document.getElementById('pulseFind'); if (el) el.insertAdjacentHTML('beforeend', msgHtml('error', err.message)); var l = el && el.querySelector('.loading'); if (l) l.remove(); });
    var box = document.getElementById('pulseDetail');
    if (box && Pulse.openId) Pulse.detail(Pulse.openId).then(function (d) {
      var el = document.getElementById('pulseDetail');
      if (el) el.innerHTML = Pulse.throwsHtml(d);
    }).catch(function (err) { var el = document.getElementById('pulseDetail'); if (el) el.innerHTML = msgHtml('error', err.message); });
  },

  findHtml: function (d) {
    return '<ul class="pulse-find-list">' + (d.findings || []).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
      '<p class="muted small">' + d.summary.n + '球・トルク平均 ' + Pulse.n1(d.summary.avg.torque) + 'Nm・スピード平均 ' + Pulse.n1(d.summary.avg.speed) + 'rpm' +
      (d.prev ? '（前回 ' + esc(Pulse.md(d.prev.date)) + '：トルク平均 ' + Pulse.n1(d.prev.summary.avg.torque) + 'Nm・スピード平均 ' + Pulse.n1(d.prev.summary.avg.speed) + 'rpm）' : '（前回の測定はありません）') + '</p>' +
      ((d.ruleErrors || []).length ? msgHtml('warn', '使えなかった所見のルール（パルス所見ルールのシートを直してください）：' + d.ruleErrors.join('／')) : '');
  },

  throwsHtml: function (d) {
    var ind = function (k) { return k ? '<span class="pulse-ind ind-' + k + '" title="' + Pulse.INDNAME[k] + '">' + Pulse.IND[k] + '</span>' : ''; };
    return '<table class="line-table pulse-throws"><tr><th>#</th><th>時刻</th><th class="r">トルク</th><th class="r">スロット</th><th class="r">スピード</th><th class="r">球速</th><th>タグ</th></tr>' +
      d.throws.map(function (t) {
        return '<tr><td>' + t.no + '</td><td>' + esc(t.time) + '</td><td class="r">' + Pulse.n1(t.torque) + ind(t.torqueInd) + '</td><td class="r">' + Pulse.n1(t.slot) + ind(t.slotInd) + '</td>' +
          '<td class="r">' + Pulse.n1(t.speed) + ind(t.speedInd) + '</td><td class="r">' + Pulse.n1(t.velo) + '</td><td>' + esc(t.tag) + '</td></tr>';
      }).join('') + '</table><p class="muted small">▲高い・◆適正・▼低い（Pulseアプリの判定）</p>';
  },

  /** 推移のグラフ（SVG）。series＝[['avg'|'max', 'torque'…, '平均']] */
  chart: function (list, series, title) {
    var narrow = (window.innerWidth || 800) < 600 && !document.body.classList.contains('printing');   // スマホは図を小さく作って、文字が小さくなりすぎないように
    var W = narrow ? 360 : 640, H = narrow ? 190 : 170, L = 44, R = 12, T = 14, B = 26;
    var vals = [];
    series.forEach(function (s) { list.forEach(function (x) { var v = x[s[0]][s[1]]; if (v !== '' && v !== null) vals.push(Number(v)); }); });
    if (!vals.length) return '';
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (hi === lo) { hi += 1; lo -= 1; }
    var pad = (hi - lo) * 0.15; lo -= pad; hi += pad;
    var X = function (i) { return list.length === 1 ? (L + W - R) / 2 : L + (W - L - R) * i / (list.length - 1); };
    var Y = function (v) { return T + (H - T - B) * (1 - (v - lo) / (hi - lo)); };
    var svg = '<svg class="pulse-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(title) + 'の推移">';
    [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1].forEach(function (v) {
      svg += '<line class="pc-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text class="pc-ax" x="' + (L - 4) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + Pulse.n1(v) + '</text>';
    });
    var step = Math.max(1, Math.ceil(list.length / (narrow ? 5 : 8)));
    list.forEach(function (x, i) { if (i % step === 0 || i === list.length - 1) svg += '<text class="pc-ax" x="' + X(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + Pulse.md(x.date) + '</text>'; });
    series.forEach(function (s, k) {
      var pts = [];
      list.forEach(function (x, i) { var v = x[s[0]][s[1]]; if (v !== '' && v !== null) pts.push([X(i), Y(Number(v))]); });
      if (pts.length > 1) svg += '<polyline class="pc-line pc-' + (k + 1) + '" points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>';
      pts.forEach(function (p) { svg += '<circle class="pc-dot pc-' + (k + 1) + '" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.5"/>'; });
    });
    svg += '</svg>';
    return '<div class="pulse-chart-box"><div class="pulse-chart-head"><b>' + esc(title) + '</b>' + series.map(function (s, k) {
      return '<span class="pc-key"><i class="pc-sw pc-' + (k + 1) + '"></i>' + esc(s[2]) + '</span>'; }).join('') + '</div>' + svg + '</div>';
  },

  /** 印刷用のレポート（いちばん新しい測定。画面と印刷で月次レポートの代わりにする） */
  print: function (id) {
    Pulse.detail(id).then(function (d) {
      var list = Pulse.sessionsOf(d.session.athleteId), a = Pulse.athleteOf(d.session.athleteId) || {};
      var page = Export.head('パルスレポート　' + (d.session.name || a.name || ''), d.session.date + ' の測定（' + d.summary.n + '球）' + (a.grade ? '・' + a.grade : '') + (a.position ? '・' + a.position : '')) +
        '<h3>所見</h3>' + Pulse.findHtml(Object.assign({}, d, { ruleErrors: [] })) +
        '<h3>推移</h3>' + Pulse.chart(list, [['avg', 'torque', '平均'], ['max', 'torque', '最大']], 'エルボートルク（Nm）') +
        Pulse.chart(list, [['avg', 'speed', '平均'], ['max', 'speed', '最大']], 'アームスピード（rpm）') +
        '<h3>1球ずつ</h3>' + Pulse.throwsHtml(d);
      Export.print('パルスレポート_' + (d.session.name || '') + '_' + d.session.date, [page]);
    }).catch(function (err) { alert('レポートを作れませんでした：' + err.message); });
  },

  // ---------------- 取込の画面（管理者・トレーナー。Staff.page＝'pulseImport'） ----------------
  /** 開く。d（pulseDetail の結果）を渡すと、その測定を直す画面になる */
  openImport: function (d) {
    if (S.view !== 'staff') return;
    if (Staff.page !== 'pulseImport') {
      Staff.returnTo = { tab: Staff.tab, scroll: window.scrollY || 0 };
      try { history.pushState({ staffPulse: 1 }, ''); } catch (e) { /* 戻るボタンで戻れる */ }
    }
    Staff.page = 'pulseImport';
    if (Pulse.imp && Pulse.imp.res) PulseReader.release(Pulse.imp.res);
    var today = new Date(), ymd = today.getFullYear() + '-' + ('0' + (today.getMonth() + 1)).slice(-2) + '-' + ('0' + today.getDate()).slice(-2);
    Pulse.imp = d ? { editId: d.session.id, athleteId: d.session.athleteId, date: d.session.date, memo: d.session.memo,
                      rows: d.throws.map(function (t) { return { time: t.time, torque: t.torque, torqueInd: t.torqueInd, slot: t.slot, slotInd: t.slotInd, speed: t.speed, speedInd: t.speedInd, velo: t.velo, tag: t.tag }; }) }
                  : { editId: '', athleteId: '', date: ymd, memo: '', rows: null };
    Pulse.imp.today = ymd;
    app.innerHTML = Pulse.impFrame('<div class="card"><div class="loading">読み込み中…</div></div>');
    window.scrollTo(0, 0);
    Pulse.load().then(function () { if (Staff.page === 'pulseImport') Pulse.renderImport(); }).catch(function (err) {
      if (Staff.page === 'pulseImport') app.innerHTML = Pulse.impFrame('<div class="card">' + msgHtml('error', err.message) + '</div>');
    });
  },
  back: function () {
    var I = Pulse.imp;
    if (I && I.rows && I.rows.length && !I.done && !I.busy && !confirm('保存していない内容は消えます。戻りますか？')) return;
    var st = history.state || {};
    if (st.staffPulse) history.back(); else Pulse.leave();
  },
  leave: function () {
    if (Pulse.imp) { Pulse.imp.cancel = true; if (Pulse.imp.res) PulseReader.release(Pulse.imp.res); }
    Pulse.imp = null;
    Staff.leaveAthlete();   // 開く前の画面（管理・設定／パルスのタブ）とスクロール位置に戻る
  },
  impFrame: function (inner) {
    var edit = Pulse.imp && Pulse.imp.editId;
    return Staff.athleteFrame('<h1 class="ath-name">' + (edit ? 'パルスの測定を直す' : 'パルスの取り込み') + '</h1>' +
      '<p class="muted small">' + (edit ? '数値・判定・球速を直して保存します。' : 'Pulseアプリの Liveモードの画面を録画した動画から、1球ずつの数値を読み取ります。<b>動画はこの端末の中だけで読み、送信も保存もしません</b>（保存するのは数値だけ）。') + '</p>', inner, '管理・設定');
  },

  renderImport: function () {
    var I = Pulse.imp;
    if (!I) return;
    if (I.done) {
      app.innerHTML = Pulse.impFrame('<div class="card">' + msgHtml('ok', I.done) +
        (I.editId ? '' : '<button class="btn block" data-pulse="impAgain">続けてほかの選手を取り込む</button>') +
        '<button class="btn ghost block" data-pulse="impView">パルスの一覧で見る</button></div>');
      return;
    }
    var opts = '<option value="">選手を選ぶ</option>' + Pulse.athletes().map(function (a) {
      return '<option value="' + esc(a.id) + '"' + (I.athleteId === a.id ? ' selected' : '') + '>' + esc((a.grade ? a.grade + '　' : Pulse.isTest(a) ? '［テスト］' : '') + a.name + (a.position ? '（' + a.position + '）' : '')) + '</option>';
    }).join('');
    var html = '<div class="card pulse-imp"><h2>1. 選手・日付</h2>' +
      '<label>選手<select class="sel" data-pi-top="athleteId">' + opts + '</select></label>' +
      '<label>測定日<input class="sel" type="date" data-pi-top="date" max="' + esc(I.today) + '" value="' + esc(I.date) + '"></label>' +
      '<label>メモ（球種・何球目からの測定 など。空でもよい）<input class="sel" data-pi-top="memo" maxlength="200" value="' + esc(I.memo) + '"></label></div>';
    if (!I.editId) {
      html += '<div class="card pulse-imp"><h2>2. 動画を選ぶ</h2>' +
        '<input type="file" id="pulseFile" accept="video/*,.mp4,.mov" class="sel"' + (I.reading ? ' disabled' : '') + '>' +
        (I.reading ? '<p class="small" id="pulseProgText">読み取っています… 0%</p><progress id="pulseProg" max="100" value="0"></progress><button class="btn ghost small" data-pulse="impStop">やめる</button>' : '') +
        (I.readMsg || '') + '<p class="muted small">縦長の画面録画（mp4）を選んでください。73秒の動画で10秒ほどかかります。読み取り中は画面を閉じないでください。</p></div>';
    }
    if (I.rows) html += Pulse.impTableHtml();
    app.innerHTML = Pulse.impFrame(html);
  },

  impTableHtml: function () {
    var I = Pulse.imp, rows = I.rows;
    var sel = function (i, k, v) {
      return '<select class="sel pi-ind" data-pi="' + k + '" data-i="' + i + '"><option value=""></option>' + ['up', 'in', 'down'].map(function (x) {
        return '<option value="' + x + '"' + (v === x ? ' selected' : '') + '>' + Pulse.IND[x] + Pulse.INDNAME[x] + '</option>'; }).join('') + '</select>';
    };
    var inp = function (i, k, v, w, type) { return '<input class="sel pi-n" style="width:' + w + 'em" data-pi="' + k + '" data-i="' + i + '" inputmode="' + (type || 'decimal') + '" value="' + esc(v === null || v === undefined ? '' : v) + '">'; };
    var warn = rows.filter(function (r) { return r.frames !== undefined && r.frames < 2; }).length;
    var html = '<div class="card pulse-imp"><h2>' + (I.editId ? '数値を直す' : '3. 確かめる・直す') + '（' + rows.length + '球）</h2>' +
      (warn ? msgHtml('warn', '読み取りが怪しい球が' + warn + '球あります（黄色の行）。「画面」で動画の画面と見比べてください。') : '') +
      (I.saveMsg || '') +
      '<div class="table-scroll"><table class="line-table pulse-imp-table"><tr><th>#</th><th>時刻</th><th>エルボートルク</th><th>判定</th><th>アームスロット</th><th>判定</th><th>アームスピード</th><th>判定</th><th>球速</th><th>タグ</th><th></th></tr>' +
      rows.map(function (r, i) {
        return '<tr' + (r.frames !== undefined && r.frames < 2 ? ' class="pi-warn"' : '') + '><td>' + (i + 1) + '</td>' +
          '<td>' + inp(i, 'time', r.time, 3.6, 'numeric') + '</td><td>' + inp(i, 'torque', r.torque, 4) + '</td><td>' + sel(i, 'torqueInd', r.torqueInd) + '</td>' +
          '<td>' + inp(i, 'slot', r.slot, 4) + '</td><td>' + sel(i, 'slotInd', r.slotInd) + '</td><td>' + inp(i, 'speed', r.speed, 4.6, 'numeric') + '</td><td>' + sel(i, 'speedInd', r.speedInd) + '</td>' +
          '<td>' + inp(i, 'velo', r.velo, 4) + '</td><td><input class="sel pi-tag" data-pi="tag" data-i="' + i + '" maxlength="30" value="' + esc(r.tag || '') + '"></td>' +
          '<td class="pulse-ops">' + (I.res && r.snap !== undefined ? '<button class="btn ghost small" data-pulse="impSnap" data-v="' + i + '">画面</button>' : '') +
          '<button class="btn ghost small pulse-del" data-pulse="impDel" data-v="' + i + '">消す</button></td></tr>' +
          (I.snapRow === i ? '<tr><td colspan="11"><div id="pulseSnap" class="pulse-snap"><div class="loading">画面を出しています…</div></div></td></tr>' : '');
      }).join('') + '</table></div>' +
      '<button class="btn ghost small" data-pulse="impAdd">＋ 1球足す</button>' +
      '<p class="muted small">球速（km/h）は手で入れます（空でもよい）。いらない球（試し投げなど）は「消す」で外してください。</p>' +
      '<button class="btn block" data-pulse="impSave"' + (I.busy ? ' disabled' : '') + '>' + (I.busy ? '保存しています…' : I.editId ? '直して保存する' : '保存する') + '</button></div>';
    return html;
  },

  /** 動画を読み取る */
  readFile: function (file) {
    var I = Pulse.imp;
    if (!I || !file) return;
    if (typeof PulseReader === 'undefined') { I.readMsg = msgHtml('error', '読み取りのファイル（pulse_reader.js）が読み込めていません。GitHub に入れたか確かめてください。'); Pulse.renderImport(); return; }
    if (I.res) { PulseReader.release(I.res); I.res = null; }
    I.reading = true; I.cancel = false; I.rows = null; I.readMsg = ''; I.saveMsg = ''; I.snapRow = null;
    Pulse.renderImport();
    var started = Date.now();
    PulseReader.readVideo(file, {
      onProgress: function (p) {
        var bar = document.getElementById('pulseProg'), tx = document.getElementById('pulseProgText');
        if (bar) bar.value = Math.round(p * 100);
        if (tx) tx.textContent = '読み取っています… ' + Math.round(p * 100) + '%';
      },
      cancel: function () { return !Pulse.imp || Pulse.imp.cancel; }
    }).then(function (res) {
      if (Pulse.imp !== I) { PulseReader.release(res); return; }
      I.reading = false; I.res = res;
      I.rows = res.rows.map(function (r) {
        return { time: r.time || '', torque: r.torque, torqueInd: r.torqueInd || '', slot: r.slot, slotInd: r.slotInd || '', speed: r.speed, speedInd: r.speedInd || '',
                 velo: '', tag: '', frames: r.frames, snap: r.snap };
      });
      var sec = Math.round((Date.now() - started) / 100) / 10;
      I.readMsg = I.rows.length ? msgHtml('ok', I.rows.length + '球を読み取りました（' + sec + '秒）。下の表で確かめてください。')
        : msgHtml('error', '球を読み取れませんでした。Liveモードで投げた球が画面に出ている動画か確かめてください。');
      if (!I.rows.length) I.rows = null;
      if (Staff.page === 'pulseImport') Pulse.renderImport();
    }).catch(function (err) {
      if (Pulse.imp !== I) return;
      I.reading = false; I.readMsg = msgHtml('error', err.message);
      if (Staff.page === 'pulseImport') Pulse.renderImport();
    });
  },

  save: function () {
    var I = Pulse.imp;
    if (!I || I.busy) return;
    var err = !I.athleteId ? '選手を選んでください。' : !/^\d{4}-\d{2}-\d{2}$/.test(I.date || '') ? '測定日を入れてください。' : I.date > I.today ? '先の日付には保存できません。' :
      !(I.rows && I.rows.length) ? '保存する球がありません。' : '';
    if (err) { I.saveMsg = msgHtml('error', err); Pulse.renderImport(); return; }
    var a = Pulse.athleteOf(I.athleteId) || { name: '' };
    if (!confirm(a.name + 'さん・' + I.date + 'の測定（' + I.rows.length + '球）を' + (I.editId ? '直して保存' : '保存') + 'します。よろしいですか？')) return;
    var num = function (v) { v = String(v === null || v === undefined ? '' : v).trim().replace(/[０-９．－]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }); return v === '' ? '' : Number(v); };
    var throws = I.rows.map(function (r) {
      return { time: String(r.time || '').trim(), torque: num(r.torque), torqueInd: r.torqueInd || '', slot: num(r.slot), slotInd: r.slotInd || '',
               speed: num(r.speed), speedInd: r.speedInd || '', velo: num(r.velo), tag: String(r.tag || '').trim() };
    });
    var bad = throws.map(function (t, i) { return ['torque', 'slot', 'speed', 'velo'].some(function (k) { return t[k] !== '' && isNaN(t[k]); }) ? i + 1 : 0; }).filter(Boolean);
    if (bad.length) { I.saveMsg = msgHtml('error', bad.join('・') + '球目に数字でない値があります。'); Pulse.renderImport(); return; }
    I.busy = true; I.saveMsg = ''; Pulse.renderImport();
    var body = { token: S.token, athleteId: I.athleteId, date: I.date, memo: I.memo, throws: throws };
    if (I.editId) body.id = I.editId;
    Api.call(I.editId ? 'pulseUpdate' : 'pulseSave', body).then(function (res) {
      I.busy = false;
      if (I.res) { PulseReader.release(I.res); I.res = null; }
      I.done = a.name + 'さん・' + I.date + '：' + (res.message || '保存しました。');
      Pulse.reset();
      Pulse.sel = I.athleteId; Pulse.openId = '';
      if (Staff.page === 'pulseImport') Pulse.renderImport();
    }).catch(function (e) {
      I.busy = false;
      if (e.needLogin) return Staff.fail(e);
      I.saveMsg = msgHtml('error', e.message);
      if (Staff.page === 'pulseImport') Pulse.renderImport();
    });
  },

  showSnap: function (i) {
    var I = Pulse.imp;
    if (!I || !I.res) return;
    I.snapRow = I.snapRow === i ? null : i;
    Pulse.renderImport();
    if (I.snapRow === null) return;
    PulseReader.snapshot(I.res, I.rows[i].snap).then(function (url) {
      var el = document.getElementById('pulseSnap');
      if (el) el.innerHTML = '<img alt="' + (i + 1) + '球目の画面" src="' + url + '">';
    }).catch(function (err) { var el = document.getElementById('pulseSnap'); if (el) el.innerHTML = msgHtml('error', err.message); });
  },

  /** 削除（管理者・トレーナー） */
  remove: function (id) {
    var s = ((Pulse.data && Pulse.data.sessions) || []).filter(function (x) { return x.id === id; })[0];
    if (!s) return;
    var a = Pulse.athleteOf(s.athleteId) || { name: '' };
    if (!confirm(a.name + 'さん・' + s.date + 'の測定（' + s.n + '球）を消します。元に戻せません。よろしいですか？')) return;
    Api.call('pulseDelete', { token: S.token, id: id }).then(function () {
      Pulse.reset(); Pulse.openId = '';
      Pulse.fill(true);
    }).catch(function (err) { if (err.needLogin) return Staff.fail(err); alert('消せませんでした：' + err.message); });
  }
};

// ---- 操作の振り分け（スタッフ画面・選手の「からだ」の両方） ----
app.addEventListener('click', function (e) {
  var t = e.target.closest('[data-pulse]');
  if (!t || (S.view !== 'staff' && S.view !== 'body')) return;
  var v = t.dataset.v;
  switch (t.dataset.pulse) {
    case 'sel': Pulse.sel = v; Pulse.openId = ''; Pulse.fill(); var b = Pulse.box(); if (b) window.scrollTo(0, Math.max(0, b.getBoundingClientRect().top + window.scrollY - 80)); break;
    case 'team': Pulse.sel = ''; Pulse.openId = ''; Pulse.fill(); break;
    case 'open': Pulse.openId = Pulse.openId === v ? '' : v; Pulse.fill(); break;
    case 'reload': Pulse.fill(true); break;
    case 'xlsx': Export.pulseExcel(Pulse.data, Pulse.athletes().filter(function (a) { return !Pulse.isTest(a); })); break;   // Excel（アウトプット用資料）にはテスト選手を入れない
    case 'print': Pulse.print(v); break;
    case 'edit': if (S.view === 'staff') Pulse.detail(v).then(function (d) { Pulse.openImport(d); }).catch(function (err) { alert(err.message); }); break;
    case 'del': if (S.view === 'staff') Pulse.remove(v); break;
    case 'impDel': if (Pulse.imp && Pulse.imp.rows) { Pulse.imp.rows.splice(Number(v), 1); Pulse.imp.snapRow = null; Pulse.renderImport(); } break;
    case 'impAdd': if (Pulse.imp) { (Pulse.imp.rows = Pulse.imp.rows || []).push({ time: '', torque: '', torqueInd: '', slot: '', slotInd: '', speed: '', speedInd: '', velo: '', tag: '' }); Pulse.renderImport(); } break;
    case 'impSnap': Pulse.showSnap(Number(v)); break;
    case 'impStop': if (Pulse.imp) Pulse.imp.cancel = true; break;
    case 'impSave': Pulse.save(); break;
    case 'impAgain': var keep = Pulse.imp ? Pulse.imp.date : ''; Pulse.imp = { editId: '', athleteId: '', date: keep, memo: '', rows: null, today: Pulse.imp ? Pulse.imp.today : keep }; window.scrollTo(0, 0);
      Pulse.load().then(function () { if (Staff.page === 'pulseImport') Pulse.renderImport(); }).catch(function (er) { alert(er.message); }); break;   // 保存のあと一覧を読み直してから
    case 'impView':
      if (Pulse.imp && Pulse.imp.res) PulseReader.release(Pulse.imp.res);
      Pulse.imp = null; Staff.returnTo = { tab: 'pulse', scroll: 0 };
      try { if (history.state && history.state.staffPulse) history.replaceState(null, ''); } catch (er) { /* 何もしない */ }
      Staff.tab = 'pulse'; Staff.render(); window.scrollTo(0, 0); break;
  }
});
// 取込の画面の入力（表のセル・選手・日付・メモ・動画）
app.addEventListener('input', function (e) {
  var t = e.target, I = Pulse.imp;
  if (S.view !== 'staff' || !I || Staff.page !== 'pulseImport') return;
  if (t.dataset.pi && I.rows && I.rows[Number(t.dataset.i)]) I.rows[Number(t.dataset.i)][t.dataset.pi] = t.value;
  if (t.dataset.piTop) I[t.dataset.piTop] = t.value;
});
app.addEventListener('change', function (e) {
  var t = e.target, I = Pulse.imp;
  if (S.view !== 'staff' || !I || Staff.page !== 'pulseImport') return;
  if (t.id === 'pulseFile' && t.files && t.files[0]) { Pulse.readFile(t.files[0]); return; }
  if (t.dataset.pi && I.rows && I.rows[Number(t.dataset.i)]) I.rows[Number(t.dataset.i)][t.dataset.pi] = t.value;
  if (t.dataset.piTop) I[t.dataset.piTop] = t.value;
});
