/**
 * body.js ― 体組成のレポート（Phase 3d: 既存アプリ v1.125 の「フィジカルレポート」「体重レポート」と同じ構成）
 *   選手本人の画面・スタッフの選手詳細・PDF（1人分／学年まとめ）のすべてで、このファイルのHTMLを使う。
 *
 *   Body.showMine()                … 選手本人のレポート画面（InBody／体重のタブ）
 *   Body.physicalHtml(a, opt)      … フィジカルレポート（InBody: 体重・体脂肪率・除脂肪体重・FFMI）
 *   Body.weightReportHtml(a, opt)  … 体重レポート（体重管理表＋InBodyで測った体重）
 *       a   = { id, name, caption, inbody: [...], weight: [...], base: { dates, label, team } }（サーバーの staffBody / myBody）
 *       opt = { print: true } のときはPDF用（数値の表を付け、A4縦1枚に収まる大きさにする）
 *   カードをタップすると、測定の履歴を最前面のウィンドウで表示する（Body.openHistory）。
 *   グラフはすべてSVGで自前で描く（外部のグラフ用ライブラリは使わない）。
 *
 * 数値の良し悪しの判定はせず、変化（▲増加・▼減少・±変化なし）だけを表示する（既存アプリと同じ方針）。
 */
var Body = {
  reg: {},                         // 表示中のレポートの選手（タップで履歴を開くときに使う）。id → a
  chart: { lean: 70, ffmi: 22 },   // 体組成の比較グラフの点線の位置（設定シート。サーバーから受け取る）
  COLORS: { weight: '#2f6fed', lbm: '#2e9e5b', fat: '#f5a623', base: 'rgba(47,111,237,0.6)', latest: 'rgba(224,63,63,0.75)' },
  METRICS: [   // 表示順: 体重 → 体脂肪率 → 除脂肪体重 → FFMI
    { key: 'weight', label: '体重', unit: 'kg' },
    { key: 'fat', label: '体脂肪率', unit: '%' },
    { key: 'lbm', label: '除脂肪体重', unit: 'kg' },
    { key: 'ffmi', label: 'FFMI', unit: '' }
  ],

  // ---------------- 選手本人の画面 ----------------
  showMine: function (after) {   // after: 表示し終わったあとにすること（音声で開いたときの読み上げなど）
    S.view = 'body';
    app.innerHTML = '<div class="loading">読み込み中…</div>';
    Api.call('myBody', { token: S.token }).then(function (res) {
      if (S.view !== 'body') return;   // 読み込み中にほかの画面へ移ったときは描かない
      if (res.chart) Body.chart = res.chart;
      if (res.weekStart) Body.weekStart = res.weekStart;   // 体重の週平均の区切り（v46）
      Body.mine = { id: 'me', name: res.name, caption: res.caption || '', weight: res.weight || [], inbody: res.inbody || [], base: res.base,
                     peers: res.peers ? Object.assign({ self: 'あなた' }, res.peers) : null, likes: res.likes || [] };   // v76：投手／野手の比較・いいね
      Body.renderMine();
      if (after) after();
    }).catch(function (err) {
      app.innerHTML = msgHtml('error', err.message) + '<button class="btn block" data-act="home">ホームへ</button>';
    });
  },

  renderMine: function () {
    var a = Body.mine, tab = Body.tab || (a.inbody.length || !a.weight.length ? 'inbody' : 'weight');
    // v62：いちばん上に、InBody と体重のいちばん新しい測定日（どちらのタブを開いていても見える）。記録が無いときはそのことを書く
    var lastDate = function (arr) { return (arr || []).reduce(function (m, r) { return r.date > m ? r.date : m; }, ''); };
    var ibD = lastDate(a.inbody), wD = lastDate(a.weight);
    var latest = '<div class="body-latest">' + [['InBody', ibD], ['体重', wD]].map(function (x) {
      return '<span><b>' + x[0] + '</b>' + (x[1] ? esc(Body.dLong(x[1])) : '<span class="muted">記録なし</span>') + '</span>'; }).join('') + '</div>' +
      (!ibD && !wD ? '<p class="muted small">まだ身体データがないよ。InBodyや体重を測ると、ここに数値とグラフが出るよ。</p>' : '');
    app.innerHTML = '<div class="group"><div class="topbar"><h1>体組成レポート</h1><button class="btn ghost" data-act="home">ホームへ</button></div>' + latest +
      '<div class="tabs"><button class="tab' + (tab === 'inbody' ? ' on' : '') + '" data-body-tab="inbody">InBody</button>' +
      '<button class="tab' + (tab === 'weight' ? ' on' : '') + '" data-body-tab="weight">体重</button>' +
      '<button class="tab' + (tab === 'pulse' ? ' on' : '') + '" data-body-tab="pulse">パルス</button></div></div>' +   // v88：パルス（pulse.js）
      (tab === 'pulse' ? '<div id="pulseMine" class="pulse-box"><div class="loading">読み込み中…</div></div>'
        : Body.likesHtml(tab) + (tab === 'inbody' ? Body.physicalHtml(a) : Body.weightReportHtml(a)));
    if (tab === 'pulse') { if (window.Pulse) Pulse.mountAthlete(); else document.getElementById('pulseMine').innerHTML = msgHtml('error', 'パルスの画面のファイル（pulse.js）が読み込めていません。'); }
  },

  /** v76：選手本人の画面。InBody・体重の結果へのスタッフのいいね（新しい順・5件まで） */
  likesHtml: function (kind) {
    var list = ((Body.mine && Body.mine.likes) || []).filter(function (l) { return l.kind === kind; }).sort(function (x, y) { return y.at - x.at; }).slice(0, 5);
    if (!list.length) return '';
    return '<div class="card body-likes"><h2>♥ スタッフからのいいね</h2><ul class="like-list like-mine">' + list.map(function (l) {
      return '<li>♥ <b>' + esc(l.staffName || 'スタッフ') + '</b>さんが' + esc(Body.dShort(l.target)) + 'の' + (kind === 'inbody' ? 'InBody' : '体重') + 'の結果にいいね' + (l.comment ? '「' + esc(l.comment) + '」' : '') + '</li>';
    }).join('') + '</ul></div>';
  },

  /** アバターが読み上げる、レポートのひとこと要約（音声で開いたとき） */
  summary: function (tab) {
    var a = Body.mine;
    if (!a) return '';
    if (tab === 'weight') {
      var st = Body.weightWeekStats(a.weight);
      if (!st) return '体重レポートだよ。まだ体重の記録はないみたい。';
      return '体重レポートだよ。' + Body.dShort(st.week.date).replace('/', '月') + '日からの週の平均は' + st.week.value.toFixed(1) + 'キロ' +
        (st.prevWeek ? '、前の週より' + Body.speakDiff(st.week.value - st.prevWeek.value, 'キロ') : '') + '。いちばん新しい体重は' +
        Body.dShort(st.last.date).replace('/', '月') + '日の' + st.last.value.toFixed(1) + 'キロだよ。';
    }
    var ib = a.inbody, r = ib[ib.length - 1];
    if (!r) return 'InBodyのレポートだよ。まだInBodyの記録はないみたい。';
    return 'InBodyのレポートだよ。' + Body.dShort(r.date).replace('/', '月') + '日の測定で、体重' + Body.f1(r.weight) + 'キロ、体脂肪率' + Body.f1(r.fat) + 'パーセント、除脂肪体重' +
      Body.f1(r.lbm) + 'キロ' + (Body.num(r.ffmi) !== null ? '、FFMIは' + Body.f1(r.ffmi) + (r.rank ? 'で、同じ日に測った' + r.rankOf + '人中' + r.rank + '位' : '') : '') + 'だよ。';
  },
  /** 差を読み上げ用に（「0.4キロ増えた」「変わらない」） */
  speakDiff: function (d, unit) {
    var r = Math.round(d * 10) / 10;
    return r === 0 ? '変わらず' : Math.abs(r).toFixed(1) + unit + (r > 0 ? '増えた' : '減った');
  },

  // ---------------- 小さな部品 ----------------
  num: function (v) { return (v !== '' && v !== null && v !== undefined && isFinite(Number(v))) ? Number(v) : null; },
  f1: function (v) { var n = Body.num(v); return n === null ? '-' : n.toFixed(1); },
  dShort: function (d) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? Number(m[2]) + '/' + Number(m[3]) : (d || ''); },
  dLong: function (d) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? m[1] + '年' + Number(m[2]) + '月' + Number(m[3]) + '日' : (d || ''); },
  today: function () { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); },
  /** 変化量の表示（▲ +0.4 ／ ▼ −0.2 ／ ± 0.0） */
  diffText: function (d) {
    var r = Math.round(d * 10) / 10;
    return r === 0 ? '± 0.0' : (r > 0 ? '▲ +' : '▼ −') + Math.abs(r).toFixed(1);
  },
  /** 日付に日数を足す（'yyyy-mm-dd'） */
  addDays: function (ds, n) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ds); if (!m) return '';
    return new Date(Date.UTC(+m[1], m[2] - 1, +m[3] + n)).toISOString().slice(0, 10);
  },
  /** 日付に月数を足す（5/31の3か月前のように月末を超える日は月末にそろえる） */
  addMonths: function (ds, n) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ds); if (!m) return '';
    var y = +m[1], mo = m[2] - 1 + n; y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12;
    var last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, mo, Math.min(+m[3], last))).toISOString().slice(0, 10);
  },
  /** 目標の日付にいちばん近い記録（tol日以内）。なければ null */
  nearest: function (recs, target, tol) {
    var best = null, gap = Infinity, t0 = Date.parse(target + 'T00:00:00Z');
    recs.forEach(function (p) { var g = Math.abs(Date.parse(p.date + 'T00:00:00Z') - t0) / 86400000; if (g <= tol && g < gap) { best = p; gap = g; } });
    return best;
  },
  /** 記録の配列から、ある項目の「値がある記録」だけを {date, value} にして返す（日付の古い順） */
  series: function (rows, key) {
    return rows.map(function (r) { return { date: r.date, value: Body.num(r[key]), r: r }; }).filter(function (p) { return p.value !== null; });
  },
  avg: function (arr) { return arr.length ? arr.reduce(function (s, v) { return s + v; }, 0) / arr.length : null; },

  /**
   * 記録の始め（from）から最新までの変化と、最近3か月の変化を比べた文（v40 の trendText から分けた。v41 のレポートの説明でも使う）
   *   s: [{ date, value }]（古い順・2件以上）
   */
  trendCompare: function (s, unit, from) {
    var md = function (d) { return Number(d.slice(5, 7)) + '月' + Number(d.slice(8, 10)) + '日'; };
    var v = function (x) { return Number(x).toFixed(1) + unit; };
    var eps = unit ? 0.3 : 0.2;
    var dir = function (d) { return Math.abs(d) < eps ? 0 : d > 0 ? 1 : -1; };
    var amount = function (d) { return Math.abs(Math.round(d * 10) / 10).toFixed(1) + unit; };
    var first = s[0], last = s[s.length - 1], diff = last.value - first.value, od = dir(diff);
    // 最近3か月：3か月前ごろ（それより前でいちばん新しい記録。無ければ3か月の中の最初の記録）から最新まで
    var cut = Body.addMonths(last.date, -3), before = s.filter(function (p) { return p.date <= cut; });
    var base = before.length ? before[before.length - 1] : s.filter(function (p) { return p.date > cut; })[0];
    var useRecent = base && base !== first && base !== last && Body.addMonths(first.date, 4) < last.date;
    if (!useRecent) return od === 0 ? from + 'から、ほとんど変わっていません。' : from + 'から' + amount(diff) + (od > 0 ? '増えています。' : '減っています。');
    var rd = dir(last.value - base.value), rtext = '最近3か月（' + md(base.date) + 'の' + v(base.value) + 'から）';
    var word = function (d) { return d > 0 ? '増えて' : '減って'; };
    if (od !== 0 && rd !== 0 && od !== rd) return from + 'からは' + amount(diff) + word(od) + 'いますが、' + rtext + 'では' + amount(last.value - base.value) + word(rd) + 'います。';
    if (od !== 0 && rd === 0) return from + 'からは' + amount(diff) + word(od) + 'いますが、' + rtext + 'はほとんど変わっていません。';
    if (od === 0 && rd !== 0) return from + 'と比べるとほとんど同じですが、' + rtext + 'では' + amount(last.value - base.value) + word(rd) + 'います。';
    if (od === 0) return from + 'からも、最近3か月も、ほとんど変わっていません。';
    return from + 'から' + amount(diff) + word(od) + 'いて、' + rtext + 'でも' + amount(last.value - base.value) + word(rd) + 'います。';
  },

  /**
   * 開いているレポートの説明（v41。「このフィジカルレポートを説明して」）
   *   a: レポートの選手（Staff.current / Body.mine）、tab: 'inbody'（フィジカルレポート）または 'weight'（体重レポート）
   *   画面に出ている内容（最新の値・前回比・基準比・同日順位・平均など）を、声で聞いてわかる順に並べる。良し悪しの判定はしない
   */
  explain: function (a, tab) {
    var md = function (d) { return Number(d.slice(5, 7)) + '月' + Number(d.slice(8, 10)) + '日'; };
    var who = a.name ? a.name + 'さんの' : '';
    var change = function (d, unit) { var r = Math.round(d * 10) / 10; return r === 0 ? '変わらず' : Math.abs(r).toFixed(1) + unit + (r > 0 ? '増' : '減'); };
    if (tab === 'weight') {
      var st = Body.weightWeekStats(a.weight || []);
      if (!st) return who + '体重レポートですが、まだ体重の記録がありません。';
      var wk = function (w) { return md(w.date) + 'からの週'; };
      var out = who + '体重レポートです。体重は週ごとの平均で見ています。記録は' + st.recs.length + '回、' + st.weeks.length + '週分あります。' +
        '最新の' + wk(st.week) + 'の平均は' + st.week.value.toFixed(1) + 'キロ（' + st.week.n + '回）で、' +
        (st.prevWeek ? '前の' + wk(st.prevWeek) + 'の' + st.prevWeek.value.toFixed(1) + 'キロより' + change(st.week.value - st.prevWeek.value, 'キロ') + 'です。' : '前の週の記録はありません。');
      if (st.ref4w) out += '4週前の週と比べると' + change(st.week.value - st.ref4w.value, 'キロ') + '。';
      if (st.ref3m) out += '3か月前の週と比べると' + change(st.week.value - st.ref3m.value, 'キロ') + '。';
      out += '1回ごとの最新は、' + md(st.last.date) + 'の' + st.last.value.toFixed(1) + 'キロです。';
      if (st.weeks.length >= 3) out += '週平均は、' + Body.trendCompare(st.weeks, 'キロ', '記録の始め（' + wk(st.weeks[0]) + '）');
      return out;
    }
    var ib = a.inbody || [];
    if (!ib.length) return who + 'フィジカルレポートですが、まだInBodyの記録がありません。';
    var L = ib[ib.length - 1], P = ib[ib.length - 2], base = (a.base && a.base.dates) || [];
    var M = [['weight', '体重', 'キロ'], ['fat', '体脂肪率', 'パーセント'], ['lbm', '除脂肪体重', 'キロ'], ['ffmi', 'FFMI', '']];
    var out2 = who + 'フィジカルレポートです。InBodyは' + ib.length + '回測っていて、最新は' + md(L.date) + 'の測定です。' +
      M.filter(function (m) { return Body.num(L[m[0]]) !== null; }).map(function (m) { return m[1] + Body.f1(L[m[0]]) + m[2]; }).join('、') + 'です。';
    if (P) out2 += '前回の' + md(P.date) + 'と比べると、' + M.filter(function (m) { return Body.num(L[m[0]]) !== null && Body.num(P[m[0]]) !== null; })
      .map(function (m) { return m[1] + 'は' + change(L[m[0]] - P[m[0]], m[2]); }).join('、') + 'です。';
    var baseRows = ib.filter(function (r) { return base.indexOf(r.date) >= 0; });
    if (baseRows.length) {
      out2 += '基準（' + (a.base.label || '設定された基準日') + '）と比べると、' + M.map(function (m) {
        var bv = Body.avg(baseRows.map(function (r) { return Body.num(r[m[0]]); }).filter(function (x) { return x !== null; }));
        return bv === null || Body.num(L[m[0]]) === null ? '' : m[1] + 'は' + change(L[m[0]] - bv, m[2]);
      }).filter(String).join('、') + 'です。';
    }
    if (L.rank) out2 += 'FFMIは、同じ日に測った' + L.rankOf + '人の中で' + L.rank + '位です。';
    if (ib.length >= 3) {
      var lbm = Body.series(ib, 'lbm'), fat = Body.series(ib, 'fat');
      if (lbm.length >= 3) out2 += '除脂肪体重は、' + Body.trendCompare(lbm, 'キロ', '記録の始め');
      if (fat.length >= 3) out2 += '体脂肪率は、' + Body.trendCompare(fat, 'パーセント', '記録の始め');
    }
    return out2;
  },

  // ---------------- 数値の推移を、声で読める短い文にする（v40。スタッフの staff_qa.js・選手の qa.js で使う） ----------------
  /** 「最近3か月」「半年」「今年」「1年」などの言葉から、見る期間の始まりの日（'yyyy-mm-dd'）と説明を返す。言葉が無ければ全期間 */
  trendRange: function (t) {
    var m = String(t).match(/(\d+)(か月|ヶ月|カ月|かげつ)/), today = Body.today();
    if (m) return { from: Body.addMonths(today, -Number(m[1])), label: '最近' + m[1] + 'か月' };
    if (/半年/.test(t)) return { from: Body.addMonths(today, -6), label: '最近半年' };
    if (/1年|一年|いちねん/.test(t)) return { from: Body.addMonths(today, -12), label: '最近1年' };
    if (/今年|ことし/.test(t)) return { from: today.slice(0, 4) + '-01-01', label: '今年' };
    return { from: '', label: '' };
  },

  /**
   * 推移の説明文。series = [{ date, value }]（日付の古い順）、label = 項目の名前、unit = 読み上げる単位（'キロ' など）
   *   ①記録の始め（期間の言葉があればその期間の始め）から最新までの変化、②いちばん高い・低い、
   *   ③最近3か月の変化（3か月前ごろの値から最新まで）。①と③の向きが違うときは
   *   「記録の始めからは増えていますが、最近3か月では減っています」のように、両方を伝える（v40）
   */
  trendText: function (series, label, unit, range) {
    range = range || { from: '', label: '' };
    var s = series.filter(function (p) { return !range.from || p.date >= range.from; });
    var md = function (d) { return Number(d.slice(5, 7)) + '月' + Number(d.slice(8, 10)) + '日'; };
    var v = function (x) { return Number(x).toFixed(1) + unit; };
    var eps = unit ? 0.3 : 0.2;   // これより小さい差は「ほとんど変わらない」とみなす（FFMI は単位なしで小さめ）
    var dir = function (d) { return Math.abs(d) < eps ? 0 : d > 0 ? 1 : -1; };
    var amount = function (d) { return Math.abs(Math.round(d * 10) / 10).toFixed(1) + unit; };
    var head = (range.label ? range.label + 'の' : '') + label;
    if (!s.length) return head + 'の記録はありません。';
    if (s.length === 1) return head + 'は、' + md(s[0].date) + 'の' + v(s[0].value) + 'の1回だけなので、推移はまだわかりません。';
    var first = s[0], last = s[s.length - 1], diff = last.value - first.value;
    var from = range.label ? range.label + 'の始め' : '記録の始め';
    var out = head + 'は、' + s.length + '回の測定で、' + md(first.date) + 'の' + v(first.value) + 'から、最新の' + md(last.date) + 'は' + v(last.value) + 'です。';

    out += Body.trendCompare(s, unit, from);
    if (s.length >= 3) {
      var hi = s.reduce(function (a, p) { return p.value > a.value ? p : a; }), lo = s.reduce(function (a, p) { return p.value < a.value ? p : a; });
      out += 'いちばん高いのは' + md(hi.date) + 'の' + v(hi.value) + '、いちばん低いのは' + md(lo.date) + 'の' + v(lo.value) + 'です。';
    }
    return out;
  },

  /** カード内の小さな折れ線（直近12回）。最新の点だけ丸で強調 */
  spark: function (series) {
    var pts = series.slice(-12);
    if (pts.length < 2) return '<div class="report-spark-empty">推移を表示するには2回以上の測定が必要です</div>';
    var W = 140, H = 36, p = 4, vals = pts.map(function (q) { return q.value; });
    var min = Math.min.apply(null, vals), range = (Math.max.apply(null, vals) - min) || 1;
    var xy = pts.map(function (q, i) { return [p + (W - p * 2) * i / (pts.length - 1), H - p - (H - p * 2) * (q.value - min) / range]; });
    var last = xy[xy.length - 1];
    return '<svg class="report-spark" viewBox="0 0 ' + W + ' ' + H + '"><polyline points="' + xy.map(function (c) { return c[0].toFixed(1) + ',' + c[1].toFixed(1); }).join(' ') +
      '" fill="none" stroke="' + Body.COLORS.weight + '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="3" fill="' + Body.COLORS.weight + '"/></svg>';
  },

  /** レポートの見出し（タイトル・名前・最終測定日・作成日） */
  head: function (title, a, newest) {
    return '<div class="report-head"><div><div class="report-title">' + title + '</div>' +
      '<div class="report-name">' + esc(a.name || '') + (a.caption ? '<span class="report-caption">' + esc(a.caption) + '</span>' : '') + '</div></div>' +
      '<div class="report-meta"><div>最終測定日 <b>' + (newest ? esc(Body.dLong(newest)) : '-') + '</b></div><div>作成日 ' + esc(Body.dLong(Body.today())) + '</div></div></div>';
  },

  /** 前回比・基準比などの1行 */
  diffRow: function (label, inner) { return '<div class="report-diff-row"><span class="report-diff-label">' + label + '</span>' + inner + '</div>'; },
  ref: function (t) { return '<span class="report-diff-ref">' + t + '</span>'; },

  // ---------------- フィジカルレポート（InBody） ----------------
  physicalHtml: function (a, opt) {
    opt = opt || {};
    Body.reg[a.id] = a;
    var ib = a.inbody || [], base = a.base || { dates: [], label: '' };
    var newest = ib.length ? ib[ib.length - 1].date : '';
    var html = '<div class="card report-card">' + Body.head('フィジカルレポート', a, newest);
    if (!ib.length) return html + '<p class="muted" style="margin-top:12px;">まだ測定記録がありません。InBodyの記録が取り込まれると、ここにレポートが表示されます。</p></div>';

    var gridStart = html.length;   // v80：PDFでは、カード（2×2）と「InBodyデータの推移」を横に並べるため、カードの部分の場所を覚えておく
    html += '<div class="report-section-title">最新の測定結果</div><div class="report-grid">';
    Body.METRICS.forEach(function (m) {
      var s = Body.series(ib, m.key), latest = s[s.length - 1], prev = s[s.length - 2];
      var baseVal = Body.avg(s.filter(function (p) { return base.dates.indexOf(p.date) >= 0; }).map(function (p) { return p.value; }));
      html += '<div class="report-metric report-metric-tappable" data-rep="inbody" data-aid="' + esc(a.id) + '" data-k="' + m.key + '" role="button" tabindex="0">' +
        '<div class="report-metric-label">' + m.label + '<span class="report-tap-hint">タップで履歴を表示</span></div>';
      if (!latest) {
        html += '<div class="report-metric-value report-none">-</div><div class="report-metric-sub">記録なし' + (m.key === 'ffmi' ? '（身長が無いと計算されません）' : '') + '</div></div>';
        return;
      }
      html += '<div class="report-metric-value">' + latest.value.toFixed(1) + '<span class="report-unit">' + m.unit + '</span></div>' +
        '<div class="report-metric-sub">' + esc(Body.dShort(latest.date)) + ' 測定</div>' +
        Body.diffRow('前回比', prev ? '<span class="report-diff">' + Body.diffText(latest.value - prev.value) + '</span>' + Body.ref('（前回 ' + prev.value.toFixed(1) + ' / ' + esc(Body.dShort(prev.date)) + '）') : Body.ref('前回の記録なし')) +
        Body.diffRow('基準比', baseVal !== null ? '<span class="report-diff">' + Body.diffText(latest.value - baseVal) + '</span>' + Body.ref('（基準 ' + baseVal.toFixed(1) + '）') : Body.ref('基準の設定なし'));
      if (m.key === 'ffmi') {
        var r = latest.r;
        html += Body.diffRow('同日順位', r.rank ? '<span class="report-diff">' + r.rank + '位</span>' + Body.ref('（' + esc(Body.dShort(latest.date)) + 'に測定した' + r.rankOf + '人中）') : Body.ref('-'));
      }
      html += (opt.print ? '' : Body.spark(s)) + '</div>';   // v79：PDFではカードの小さな折れ線を出さない（全員のグラフの場所を作る）
    });
    html += '</div>';
    var gridEnd = html.length;

    // v77：今の区分（除脂肪体重とFFMIの目標）とFFMIの目安。v80：PDFにも入れる
    var zr = ib.filter(function (r) { return Body.num(r.lbm) !== null && Body.num(r.ffmi) !== null; }), zl = zr[zr.length - 1];
    if (zl) html += Body.zoneNote(+zl.lbm, +zl.ffmi, zl.date);

    // InBodyデータの推移（左）と 体組成の比較（右）。PDFでは横に並べる
    var plotted = function (r) { return r && Body.num(r.lbm) !== null && Body.num(r.ffmi) !== null; };
    var baseRows = ib.filter(function (r) { return base.dates.indexOf(r.date) >= 0 && plotted(r); });
    var basePt = baseRows.length ? { lbm: Body.avg(baseRows.map(function (r) { return +r.lbm; })), ffmi: Body.avg(baseRows.map(function (r) { return +r.ffmi; })),
                                     fat: Body.avg(baseRows.filter(function (r) { return Body.num(r.fat) !== null; }).map(function (r) { return +r.fat; })) } : null;
    var last = ib[ib.length - 1], latestPt = plotted(last) ? { lbm: +last.lbm, ffmi: +last.ffmi, fat: Body.num(last.fat) } : null;
    var trendCol = function (w, h) { return '<div class="report-chart-col"><div class="report-section-title">InBodyデータの推移</div>' +
      '<div class="report-chart-desc muted small">体重・除脂肪体重（左軸・kg）と体脂肪率（右軸・%）の推移です。</div>' + Body.trendChart(ib, { w: w, h: h }) + '</div>'; };
    var compCol = '<div class="report-chart-col"><div class="report-section-title">体組成の比較（除脂肪体重×FFMI）</div>' +
      '<div class="report-chart-desc muted small">丸の大きさは体脂肪率（大きいほど高い）。「基準」は基準の測定（複数日なら平均）、「最新」は直近のInBodyの記録です。</div>' +
      Body.compChart([{ label: '基準' + (base.label ? '（' + base.label + '）' : ''), p: basePt, color: Body.COLORS.base },
                      { label: '最新（' + Body.dShort(last.date) + '）', p: latestPt, color: Body.COLORS.latest }]) + '</div>';
    if (opt.print && a.peers) {
      // v80：PDFは、上の段＝カード（2×2）と「InBodyデータの推移」、中の段＝今の区分、下の段＝「体組成の比較」と「投手（野手）の中での位置」を大きく横に2つ
      html = html.slice(0, gridStart) + '<div class="pr-top"><div class="pr-cards">' + html.slice(gridStart, gridEnd) + '</div>' + trendCol(380, 250) + '</div>' + html.slice(gridEnd) +
        '<div class="report-charts pr-two">' + compCol + '<div class="report-chart-col report-peer-col">' + Body.peerChart(a.peers) + '</div></div>';
    } else {
      html += '<div class="report-charts">' + trendCol(opt.print ? 430 : 420, opt.print ? 270 : 300) + compCol + '</div>';
    }

    // v76：同じ区分（投手／野手）の選手の中での位置（名前なし）。v79：PDFにも入れる（左にグラフ、右に説明と凡例）
    if (a.peers && !opt.print) html += Body.peerChart(a.peers);   // PDFでは上の「体組成の比較」の右に並べている

    // PDFだけ: 測定日を横に並べた数値の表（左ほど新しい・1つの表に最大22列）
    if (opt.print) {
      var latestRow = plotted(last) ? last : null;
      html += '<div class="report-section-title">InBodyデータの推移の数値（左ほど新しい日付・全' + ib.length + '件・FFMI同日順位は「順位/人数」）</div>' +
        Body.pivot(ib.slice().reverse(), function (r) { return { base: base.dates.indexOf(r.date) >= 0 && plotted(r), latest: r === latestRow }; }, [
          ['体重(kg)', function (r) { return Body.f1(r.weight); }],
          ['体脂肪率(%)', function (r) { return Body.f1(r.fat); }],
          ['除脂肪体重(kg)', function (r) { return Body.f1(r.lbm); }],
          ['FFMI', function (r) { return Body.f1(r.ffmi); }],
          ['FFMI同日順位', function (r) { return r.rank ? r.rank + '/' + r.rankOf : '-'; }]
        ]) +
        '<div class="report-note">色の付いた列が「体組成の比較」のグラフに丸で表示されている記録です（<span class="report-mark report-mark-base">●基準</span>＝青い丸・' +
        '<span class="report-mark report-mark-latest">●最新</span>＝赤い丸。基準が複数日のときはその平均が青い丸になります）。</div>';
    }
    var baseNote = base.label ? '基準: ' + base.label + (base.team ? '（全員共通の設定）' : '（スタッフが選手ごとに設定）') +
                                (base.team && !base.dates.length ? '。この選手にはその期間のInBody記録がないため、基準比は表示されません' : '')
                              : '基準: まだ設定されていません（スタッフが設定すると「基準比」が表示されます）';
    html += '<div class="report-note">前回比は、その項目の直前の記録との差です。体重・体脂肪率・除脂肪体重・FFMIは、すべてInBodyの値を使っています。' +
      '数値の良し悪しの判定は行わず、変化だけを表示しています。<br>FFMIの同日順位は、同じ測定日にInBodyを測定した全選手の中での順位です（同じ値は同順位）。<br>' + esc(baseNote) +
      (opt.print ? '' : '<br>項目のカードをタップすると、測定の履歴を表示します。') + '</div></div>';
    return html;
  },

  // ---------------- 体重レポート ----------------
  /** 体重の集計（体重一覧の「4週前比」でも使う） */
  weightStats: function (w) {
    var recs = Body.series(w, 'weight');
    var last = recs[recs.length - 1];
    if (!last) return null;
    var others = recs.filter(function (p) { return p !== last; });
    var avgIn = function (from, to) { var v = recs.filter(function (p) { return p.date > from && p.date <= to; }).map(function (p) { return p.value; }); return { n: v.length, avg: Body.avg(v) }; };
    var toW = function (p) { return p ? { date: p.date, weight: p.value } : null; };
    return {
      recs: recs, last: last, prev: recs[recs.length - 2] || null,
      w1: avgIn(Body.addDays(last.date, -28), last.date),                              // 直近4週間（28日）
      w0: avgIn(Body.addDays(last.date, -56), Body.addDays(last.date, -28)),           // その前の4週間
      ref4w: Body.nearest(others, Body.addDays(last.date, -28), 7),                    // 4週前（前後7日以内でいちばん近い記録）
      ref3m: Body.nearest(others, Body.addMonths(last.date, -3), 14),                  // 3か月前（前後14日以内）
      w4: toW(Body.nearest(others, Body.addDays(last.date, -28), 7))                   // 体重一覧（staff_body.js）用
    };
  },

  // ---------------- 体重の週平均（v46） ----------------
  /** その日を含む週の始まりの日（Body.weekStart：'月' または '日'。サーバーの設定シート「週の始まり」） */
  weekOf: function (ds) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ds);
    var dow = new Date(Date.UTC(+m[1], m[2] - 1, +m[3])).getUTCDay();
    var start = Body.weekStart === '日' ? 0 : 1;
    return Body.addDays(ds, -((dow - start + 7) % 7));
  },
  /** 体重の記録を週ごとの平均にする：[{ date: 週の始まり, end, value, n, days: [記録] }]（古い順） */
  weekly: function (recs) {
    var by = {};
    recs.forEach(function (p) { var w = Body.weekOf(p.date); (by[w] = by[w] || []).push(p); });
    return Object.keys(by).sort().map(function (w) {
      var v = by[w].map(function (p) { return p.value; });
      return { date: w, end: Body.addDays(w, 6), value: Math.round(Body.avg(v) * 10) / 10, n: v.length, days: by[w], r: { src: '週平均' } };
    });
  },
  /** 週平均の集計（体重レポートのカード・説明で使う） */
  weightWeekStats: function (w) {
    var recs = Body.series(w, 'weight');
    if (!recs.length) return null;
    var weeks = Body.weekly(recs), W = weeks[weeks.length - 1];
    var others = weeks.slice(0, -1);
    return {
      recs: recs, weeks: weeks, last: recs[recs.length - 1], prev: recs[recs.length - 2] || null,
      week: W, prevWeek: others[others.length - 1] || null,
      ref4w: Body.nearest(others, Body.addDays(W.date, -28), 7),       // 4週前の週（前後1週まで）
      ref3m: Body.nearest(others, Body.addMonths(W.date, -3), 14)      // 3か月前の週（前後2週まで）
    };
  },
  /** 週の書き方（「11/2〜11/8の週」） */
  weekLabel: function (wk) { return Body.dShort(wk.date) + '〜' + Body.dShort(wk.end); },
  srcName: function (src) { return src === 'InBody' ? 'InBody' : src === '本人' ? '本人の入力' : '体重管理表'; },

  weightReportHtml: function (a, opt) {
    opt = opt || {};
    Body.reg[a.id] = a;
    var st = Body.weightWeekStats(a.weight || []);
    var html = '<div class="card report-card">' + Body.head('体重レポート', a, st ? st.last.date : '');
    if (!st) return html + '<p class="muted" style="margin-top:12px;">まだ体重の記録がありません。体重管理表・InBodyが取り込まれるか、コンディションと一緒に体重を入れると、ここにレポートが表示されます。</p></div>';
    var W = st.week, L = st.last, tap = function (hl) { return '<div class="report-metric report-metric-tappable" data-rep="weight" data-aid="' + esc(a.id) + '" data-hl="' + esc(hl || '') + '" role="button" tabindex="0">'; };
    var hint = '<span class="report-tap-hint">タップで履歴を表示</span>';
    var val = function (v) { return '<div class="report-metric-value">' + v + '<span class="report-unit">kg</span></div>'; };
    var vsWeek = function (ref, label) {
      if (!ref) return '<div class="report-metric-value report-none">-</div><div class="report-metric-sub">' + label + 'の記録なし</div>';
      return val(Body.diffText(W.value - ref.value).replace(/^(▲|▼|±)/, '<span class="report-mark-sm">$1</span>')) +
        '<div class="report-metric-sub">' + label + '（' + esc(Body.weekLabel(ref)) + '）の週平均 ' + ref.value.toFixed(1) + 'kg と比較</div>';
    };
    html += '<div class="report-section-title">体重の概要（週平均）</div><div class="report-grid">' +
      tap('') + '<div class="report-metric-label">最新の週平均' + hint + '</div>' + val(W.value.toFixed(1)) +
        '<div class="report-metric-sub">' + esc(Body.weekLabel(W)) + '（' + W.n + '回の平均）</div>' +
        Body.diffRow('前週比', st.prevWeek ? '<span class="report-diff">' + Body.diffText(W.value - st.prevWeek.value) + '</span>' +
          Body.ref('（' + esc(Body.weekLabel(st.prevWeek)) + ' ' + st.prevWeek.value.toFixed(1) + '）') : Body.ref('前の週の記録なし')) +
        Body.spark(st.weeks) + '</div>' +
      tap(st.ref4w ? st.ref4w.date : '') + '<div class="report-metric-label">4週前の週平均との差' + hint + '</div>' + vsWeek(st.ref4w, '4週前') + '</div>' +
      tap(st.ref3m ? st.ref3m.date : '') + '<div class="report-metric-label">3か月前の週平均との差' + hint + '</div>' + vsWeek(st.ref3m, '3か月前') + '</div>' +
      tap('') + '<div class="report-metric-label">最新の体重（1回の値）' + hint + '</div>' + val(L.value.toFixed(1)) +
        '<div class="report-metric-sub">' + esc(Body.dShort(L.date)) + '・' + Body.srcName(L.r.src) + '</div>' +
        Body.diffRow('前回比', st.prev ? '<span class="report-diff">' + Body.diffText(L.value - st.prev.value) + '</span>' + Body.ref('（前回 ' + st.prev.value.toFixed(1) + ' / ' + esc(Body.dShort(st.prev.date)) + '）') : Body.ref('前回の記録なし')) +
        '</div></div>';

    var size = opt.print ? { w: 700, h: 260 } : { w: 420, h: 240 };
    html += '<div class="report-section-title">週平均の推移（全' + st.weeks.length + '週）</div>' +
      '<div class="report-chart-desc muted small">1つの点が1週間（' + (Body.weekStart === '日' ? '日曜' : '月曜') + 'はじまり）の平均です。</div>' +
      Body.weightChart(st.weeks, Object.assign({ tip: function (p) { return Body.weekLabel(p) + ' 平均 ' + p.value.toFixed(1) + 'kg（' + p.n + '回）'; } }, size));
    html += '<div class="report-section-title">直近1か月の毎日の体重</div>' + Body.dailyChart(st.recs, Body.addDays(Body.today(), -29), Body.today(), size);

    if (opt.print) {
      html += '<div class="report-section-title">週平均の数値（左ほど新しい週・全' + st.weeks.length + '週）</div>' +
        Body.pivot(st.weeks.slice().reverse(), function (p) { return { latest: p === W }; }, [
          ['週平均(kg)', function (p) { return p.value.toFixed(1); }],
          ['回数', function (p) { return String(p.n); }]
        ]);
    }
    html += '<div class="report-note">体重は、体重管理表・InBody測定・選手本人の入力（コンディションと一緒に入れた体重）をあわせたものです（同じ日は体重管理表を優先）。' +
      '体重は食事や水分で1日の中でも変わるため、週ごとの平均で比べています。前週比は直前の記録のある週との差、4週前・3か月前は、その分さかのぼった週にいちばん近い週（4週前は前後1週、3か月前は前後2週まで）の平均との差で、その期間に記録がないときは「-」になります。' +
      '数値の良し悪しの判定は行わず、変化だけを表示しています。' + (opt.print ? '' : '項目のカードをタップすると、体重の履歴（1回ごとの記録）を表示します。') + '</div></div>';
    return html;
  },

  /** 直近の毎日の体重（from〜to の日付を横に並べる。記録のない日はあける。点の色は記録の種類） */
  dailyChart: function (recs, from, to, o) {
    var days = [];
    for (var d = from; d <= to; d = Body.addDays(d, 1)) days.push(d);
    var pts = recs.filter(function (p) { return p.date >= from && p.date <= to; });
    if (!pts.length) return '<p class="muted small">この1か月の記録はまだありません。コンディションと一緒に体重を入れると、毎日の流れがここに出ます。</p>';
    var W = o.w, H = o.h, Lm = 40, R = 14, T = 22, B = 24, n = days.length;
    var yr = Body.range(pts.map(function (p) { return p.value; }), 3);
    var idx = function (ds) { return Math.round((Date.parse(ds + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000); };
    var sx = function (i) { return Lm + (W - Lm - R) * i / (n - 1); };
    var sy = function (v) { return T + (H - T - B) * (1 - (v - yr.min) / (yr.max - yr.min)); };
    var color = function (src) { return src === 'InBody' ? Body.COLORS.lbm : src === '本人' ? Body.COLORS.fat : Body.COLORS.weight; };
    var svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '">';
    for (var g = 0; g <= 4; g++) {
      var v = yr.min + (yr.max - yr.min) * g / 4, y = sy(v).toFixed(1);
      svg += '<line x1="' + Lm + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" class="grid"/><text x="' + (Lm - 4) + '" y="' + (+y + 3) + '" class="axis" text-anchor="end">' + (Math.round(v * 10) / 10) + '</text>';
    }
    svg += '<text x="' + (Lm - 4) + '" y="' + (T - 10) + '" class="axis" text-anchor="end">kg</text>';
    // 続けて記録がある日は実線、間があいた所は細い点線でつなぐ
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i], gap = idx(b.date) - idx(a.date) > 1;
      svg += '<line x1="' + sx(idx(a.date)).toFixed(1) + '" y1="' + sy(a.value).toFixed(1) + '" x2="' + sx(idx(b.date)).toFixed(1) + '" y2="' + sy(b.value).toFixed(1) +
        '" stroke="' + Body.COLORS.weight + '" stroke-width="' + (gap ? 1.2 : 2) + '"' + (gap ? ' stroke-dasharray="3 3"' : '') + '/>';
    }
    pts.forEach(function (p) {
      svg += '<circle cx="' + sx(idx(p.date)).toFixed(1) + '" cy="' + sy(p.value).toFixed(1) + '" r="3.5" fill="' + color(p.r.src) + '" stroke="#fff" stroke-width="1"><title>' +
        esc(p.date + ' ' + p.value.toFixed(1) + 'kg（' + Body.srcName(p.r.src) + '）') + '</title></circle>';
    });
    svg += Body.xLabels(days, sx, H - 6) + '</svg>';
    var used = {};
    pts.forEach(function (p) { used[p.r.src || '体重'] = true; });
    var legend = '<div class="report-chart-desc muted small">' + ['体重', 'InBody', '本人'].filter(function (k) { return used[k]; }).map(function (k) {
      return '<span style="color:' + color(k) + '">●</span> ' + Body.srcName(k);
    }).join('　') + '（' + pts.length + '日分。点線は記録のない日をはさむ所）</div>';
    return legend + svg;
  },

  // ---------------- PDF用の数値の表（測定日を横に並べる） ----------------
  /** cols: 列にする記録（左から）／ mark(r): {base, latest} ／ rows: [[見出し, 値を返す関数]] */
  pivot: function (cols, mark, rows) {
    var MAX = 22, MIN = 10, per = cols.length > MAX ? MAX : Math.max(MIN, cols.length), out = '';
    for (var i = 0; i < cols.length; i += per) {
      var chunk = cols.slice(i, i + per), pad = '';
      for (var k = chunk.length; k < per; k++) pad += '<td class="report-pad"></td>';
      var cls = function (r) { var m = mark(r); return (m.base || m.latest) ? ' class="report-col-marked"' : ''; };
      out += '<table class="report-print-table report-print-pivot"><thead><tr><th>測定日</th>' + chunk.map(function (r) {
        var m = mark(r);
        return '<th' + cls(r) + '><span class="report-yr">' + r.date.slice(0, 4) + '</span><br>' + Body.dShort(r.date) +
          (m.base ? '<br><span class="report-mark report-mark-base">●基準</span>' : '') + (m.latest ? '<br><span class="report-mark report-mark-latest">●最新</span>' : '') + '</th>';
      }).join('') + pad.replace(/td/g, 'th') + '</tr></thead><tbody>' +
        rows.map(function (row) { return '<tr><td>' + row[0] + '</td>' + chunk.map(function (r) { return '<td' + cls(r) + '>' + esc(row[1](r)) + '</td>'; }).join('') + pad + '</tr>'; }).join('') +
        '</tbody></table>';
    }
    return out;
  },

  // ---------------- グラフ（SVG） ----------------
  /** 軸の範囲（値の最小・最大に余白を付け、きりのよい数にする） */
  range: function (vals, minWidth) {
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var w = Math.max(hi - lo, minWidth), mid = (lo + hi) / 2;
    lo = Math.floor(mid - w * 0.6); hi = Math.ceil(mid + w * 0.6);
    return { min: lo, max: hi };
  },

  /** 日付の目盛り（多いときは間引く） */
  xLabels: function (dates, sx, y) {
    var step = Math.max(1, Math.ceil(dates.length / 7)), out = '', shownYear = '';
    dates.forEach(function (d, i) {
      var isLast = i === dates.length - 1;
      if (!isLast && (i % step || dates.length - 1 - i < step / 2)) return;   // 間引く（最後の目盛りと重ならないように）
      var label = (d.slice(0, 4) !== shownYear ? d.slice(2, 4) + '/' : '') + Body.dShort(d);   // 年が変わったところだけ年を付ける
      shownYear = d.slice(0, 4);
      out += '<text x="' + sx(i).toFixed(1) + '" y="' + y + '" class="axis" text-anchor="middle">' + label + '</text>';
    });
    return out;
  },

  /** InBodyデータの推移: 体重・除脂肪体重（左軸kg）と体脂肪率（右軸%） */
  trendChart: function (ib, o) {
    if (!ib.length) return '<p class="muted small">まだ記録がありません。</p>';
    var W = o.w, H = o.h, L = 38, R = 38, T = 30, B = 24, n = ib.length, C = Body.COLORS;
    var kg = [], pc = [];
    ib.forEach(function (r) { [r.weight, r.lbm].forEach(function (v) { if (Body.num(v) !== null) kg.push(+v); }); if (Body.num(r.fat) !== null) pc.push(+r.fat); });
    var yk = Body.range(kg.length ? kg : [60, 70], 10), yp = Body.range(pc.length ? pc : [10, 20], 8);
    var sx = function (i) { return n === 1 ? (L + W - R) / 2 : L + (W - L - R) * i / (n - 1); };
    var sy = function (v, r) { return T + (H - T - B) * (1 - (v - r.min) / (r.max - r.min)); };
    var svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '">';
    for (var g = 0; g <= 4; g++) {
      var vk = yk.min + (yk.max - yk.min) * g / 4, vp = yp.min + (yp.max - yp.min) * g / 4, yy = sy(vk, yk).toFixed(1);
      svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" class="grid"/>' +
        '<text x="' + (L - 4) + '" y="' + (+yy + 3) + '" class="axis" text-anchor="end">' + (Math.round(vk * 10) / 10) + '</text>' +
        '<text x="' + (W - R + 4) + '" y="' + (+yy + 3) + '" class="axis">' + (Math.round(vp * 10) / 10) + '</text>';
    }
    svg += '<text x="' + (L - 4) + '" y="' + (T - 8) + '" class="axis" text-anchor="end">kg</text><text x="' + (W - R + 4) + '" y="' + (T - 8) + '" class="axis">%</text>';
    var dot = Math.max(2, Math.min(4, 60 / n));
    [['weight', yk, C.weight], ['lbm', yk, C.lbm], ['fat', yp, C.fat]].forEach(function (s) {
      var pts = [];
      ib.forEach(function (r, i) { var v = Body.num(r[s[0]]); if (v !== null) pts.push([sx(i), sy(v, s[1]), r.date + ' ' + v]); });
      if (pts.length > 1) svg += '<polyline fill="none" stroke="' + s[2] + '" stroke-width="2" stroke-linejoin="round" points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>';
      pts.forEach(function (p) { svg += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + dot + '" fill="' + s[2] + '" stroke="#fff" stroke-width="1"><title>' + esc(p[2]) + '</title></circle>'; });
    });
    svg += Body.xLabels(ib.map(function (r) { return r.date; }), sx, H - 6);
    // 凡例（左上）
    [['体重(kg)', C.weight], ['除脂肪体重(kg)', C.lbm], ['体脂肪率(%)', C.fat]].reduce(function (x, l) {
      svg += '<circle cx="' + (x + 4) + '" cy="10" r="4" fill="' + l[1] + '"/><text x="' + (x + 11) + '" y="14" class="legend-t">' + l[0] + '</text>';
      return x + 18 + l[0].length * 9;
    }, L);
    return svg + '</svg>';
  },

  // ---------------- v77：除脂肪体重×FFMIの4つの区分と、FFMIの目安（チームの掲示物「除脂肪体重とFFMI」「FFMIとは？」に合わせる） ----------------
  //   区分の線は「基準の設定」の基準線（Body.chart：除脂肪体重 lean・FFMI ffmi。ふつうは 70kg・22）。
  //   ★ 言葉を変えるときは ZONES・FFMI_BANDS を書きかえる。FFMI_AVG＝大学野球の平均（21）
  FFMI_AVG: 21,
  ZONES: {
    low:   { cls: 'zone-gray',   label: 'まずは除脂肪体重を増やそう', name: 'まずは除脂肪体重を増やそう' },
    short: { cls: 'zone-purple', label: '身長が低めの人はまずここ',   name: 'FFMI達成（身長が低めの人はまずここ）' },
    next:  { cls: 'zone-purple', label: '次はFFMIへ',               name: '次はFFMIへ' },
    best:  { cls: 'zone-green',  label: 'ベスト！',                 name: 'ベスト！' }
  },
  /** 区分のキー（low・short・next・best） */
  zoneOf: function (lbm, ffmi) {
    var c = Body.chart, L = lbm >= c.lean, F = ffmi >= c.ffmi;
    return L && F ? 'best' : L ? 'next' : F ? 'short' : 'low';
  },
  /** 区分の名前（基準線の数字を入れる） */
  zoneName: function (k) {
    var f = Body.f0(Body.chart.ffmi);
    return Body.ZONES[k].name.replace('FFMI達成', 'FFMI' + f + '達成').replace('FFMIへ', 'FFMI' + f + 'へ');
  },
  f0: function (v) { v = Number(v); return v % 1 ? v.toFixed(1) : String(v); },
  /** FFMIの目安（21未満・21〜22・22以上） */
  ffmiBand: function (ffmi) {
    var top = Body.chart.ffmi, avg = Body.FFMI_AVG;
    if (ffmi >= top) return 'トップ層（' + Body.f0(top) + '以上）';
    if (ffmi >= avg) return '大学野球の平均以上（' + Body.f0(avg) + '〜' + Body.f0(top) + '。' + Body.f0(top) + '以上がトップ層）';
    return 'まずは' + Body.f0(avg) + 'を超えよう（' + Body.f0(avg) + '＝大学野球の平均）';
  },
  /** グラフの背景：基準線で4つに分けて色を付け、すみに言葉を置く。返り値 { svg（色の四角）, text（言葉）, boxes（言葉の場所。名前を重ねないため） } */
  zoneSvg: function (sx, sy, xMin, xMax, yMin, yMax, x0, y0, x1, y1, withText) {
    var c = Body.chart, cx = Math.max(x0, Math.min(x1, sx(c.lean))), cy = Math.max(y0, Math.min(y1, sy(c.ffmi)));
    var q = [['low', x0, cy, cx, y1], ['short', x0, y0, cx, cy], ['next', cx, cy, x1, y1], ['best', cx, y0, x1, cy]];
    var svg = '', text = '', boxes = [];
    q.forEach(function (z) {
      var w = z[3] - z[1], h = z[4] - z[2];
      if (w <= 0 || h <= 0) return;
      svg += '<rect x="' + z[1].toFixed(1) + '" y="' + z[2].toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" class="zone ' + Body.ZONES[z[0]].cls + '"/>';
      if (!withText) return;
      var t = Body.ZONES[z[0]].label.replace('FFMIへ', 'FFMI' + Body.f0(c.ffmi) + 'へ'), tw = t.length * 11 + 4;
      if (tw > w - 8 || h < 22) return;   // 区分がせまくて入らないときは文字を出さない
      var left = z[1] === x0, top = z[2] === y0;   // グラフの外側のすみに置く
      var tx = left ? z[1] + 5 : z[3] - 5, ty = top ? z[2] + 14 : z[4] - 6;
      text += '<text x="' + tx.toFixed(1) + '" y="' + ty.toFixed(1) + '" class="zone-t" text-anchor="' + (left ? 'start' : 'end') + '">' + esc(t) + '</text>';
      boxes.push({ x1: left ? tx : tx - tw, y1: ty - 12, x2: left ? tx + tw : tx, y2: ty + 3 });
    });
    return { svg: svg, text: text, boxes: boxes };   // text は目盛りの線のあとに足す（線が文字に重ならないように）
  },
  /** レポートの「今の区分」（区分・FFMIの目安・次の目標まであと何kg／いくつ） */
  zoneNote: function (lbm, ffmi, date) {
    var c = Body.chart, k = Body.zoneOf(lbm, ffmi), dl = c.lean - lbm, df = c.ffmi - ffmi;
    var lean = Body.f0(c.lean) + 'kg', f = 'FFMI' + Body.f0(c.ffmi), next;
    if (k === 'best') next = '除脂肪体重' + lean + '以上・' + f + '以上の、どちらの目標も達成しています。';
    else if (k === 'next') next = f + 'まで、あと ' + df.toFixed(1) + '。';
    else if (k === 'short') next = '除脂肪体重' + lean + 'まで、あと ' + dl.toFixed(1) + 'kg（' + f + 'は達成）。';
    else next = 'まずは除脂肪体重' + lean + 'まで、あと ' + dl.toFixed(1) + 'kg。身長が低くて' + lean + 'が難しい人は、' + f + 'まで、あと ' + df.toFixed(1) + '。';
    return '<div class="zone-note ' + Body.ZONES[k].cls + '"><div class="zone-note-h">今の区分：<b>' + esc(Body.zoneName(k)) + '</b>' +
      '<span class="muted small">（' + esc(Body.dShort(date)) + '：除脂肪体重' + lbm.toFixed(1) + 'kg・FFMI ' + ffmi.toFixed(1) + '）</span></div>' +
      '<div class="small">' + esc(next) + '</div><div class="small">FFMI ' + ffmi.toFixed(1) + '：' + esc(Body.ffmiBand(ffmi)) + '</div></div>';
  },

  // ---------------- v76：投手／野手の中での位置（名前なし。本人は大きな丸と「あなた」。v82：学年の色分けなし・ほかの選手の値は丸め・5人未満なら本人だけ） ----------------
  peerChart: function (peers) {
    var pts = (peers.points || []).filter(function (p) { return Body.num(p.lbm) !== null && Body.num(p.ffmi) !== null; });
    var title = '<div class="report-section-title">' + esc(peers.group) + 'の中での位置（除脂肪体重×FFMI）</div>';
    if (!pts.length || !pts.some(function (p) { return p.me; })) return title + '<p class="muted small">比べられる記録がありません（除脂肪体重とFFMIの両方がある記録が必要です）。</p>';
    var colorOf = function (p) { return p.me ? '#63349A' : '#8A90A6'; };   // v82：学年の色分けはやめた（だれのことかわからないように）
    var W = 380, H = 360, L = 36, R = 12, T = 12, B = 36, c = Body.chart;
    var xMin = Math.min(50, Math.floor((c.lean - 15) / 5) * 5), xMax = Math.max(85, Math.ceil((c.lean + 15) / 5) * 5), yMin = Math.min(18, Math.floor(c.ffmi - 3)), yMax = Math.max(25, Math.ceil(c.ffmi + 3));
    pts.forEach(function (p) {
      xMin = Math.min(xMin, Math.floor((p.lbm - 3) / 5) * 5); xMax = Math.max(xMax, Math.ceil((p.lbm + 3) / 5) * 5);
      yMin = Math.min(yMin, Math.floor(p.ffmi - 1)); yMax = Math.max(yMax, Math.ceil(p.ffmi + 1));
    });
    var sx = function (v) { return L + (W - L - R) * (v - xMin) / (xMax - xMin); }, sy = function (v) { return T + (H - T - B) * (1 - (v - yMin) / (yMax - yMin)); };
    var svg = '<svg class="chart peer-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(peers.group) + 'の中での位置">', v;
    var zone = Body.zoneSvg(sx, sy, xMin, xMax, yMin, yMax, L, T, W - R, H - B, true); svg += zone.svg;   // v77：4つの区分の色分け
    for (v = Math.ceil(xMin / 5) * 5; v <= xMax; v += 5) svg += '<line x1="' + sx(v) + '" x2="' + sx(v) + '" y1="' + T + '" y2="' + (H - B) + '" class="grid"/><text x="' + sx(v) + '" y="' + (H - B + 14) + '" class="axis" text-anchor="middle">' + v + '</text>';
    for (v = Math.ceil(yMin); v <= yMax; v += (yMax - yMin > 10 ? 2 : 1)) svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + sy(v) + '" y2="' + sy(v) + '" class="grid"/><text x="' + (L - 5) + '" y="' + (sy(v) + 4) + '" class="axis" text-anchor="end">' + v + '</text>';
    svg += '<line x1="' + sx(c.lean) + '" x2="' + sx(c.lean) + '" y1="' + T + '" y2="' + (H - B) + '" class="center-line"/>' +
      '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + sy(c.ffmi) + '" y2="' + sy(c.ffmi) + '" class="center-line"/>' +
      '<text x="' + ((L + W - R) / 2) + '" y="' + (H - 4) + '" class="axis" text-anchor="middle">除脂肪体重(kg)</text>' +
      '<text x="11" y="' + ((T + H - B) / 2) + '" class="axis" text-anchor="middle" transform="rotate(-90 11 ' + ((T + H - B) / 2) + ')">FFMI</text>';
    svg += zone.text;
    var me = null;
    pts.forEach(function (p) {
      if (p.me) { me = p; return; }
      svg += '<circle cx="' + sx(p.lbm).toFixed(1) + '" cy="' + sy(p.ffmi).toFixed(1) + '" r="5" fill="' + colorOf(p) + '" class="peer-dot"/>';
    });
    var mx = sx(me.lbm), my = sy(me.ffmi), self = peers.self || 'あなた', lw = self.length * 13 + 10;
    var lx = mx + lw + 14 > W - R ? mx - 12 - lw : mx + 12, ly = my - 22 < T ? my + 8 : my - 22;   // 「あなた」の札は丸の右上（はみ出すときは左・下）
    svg += '<circle cx="' + mx.toFixed(1) + '" cy="' + my.toFixed(1) + '" r="11" class="peer-me-ring"/>' +
      '<circle cx="' + mx.toFixed(1) + '" cy="' + my.toFixed(1) + '" r="7" fill="' + colorOf(me) + '" class="peer-me"/>' +
      '<rect x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" width="' + lw + '" height="18" rx="9" class="peer-tag"/>' +
      '<text x="' + (lx + lw / 2).toFixed(1) + '" y="' + (ly + 13).toFixed(1) + '" text-anchor="middle" class="peer-tag-t">' + esc(self) + '</text></svg>';
    // 凡例（v82：学年の色分けはやめた。ほかの選手は同じ色、本人だけ目立たせる）
    var n = pts.length - 1;
    return title + '<div class="report-chart-desc muted small">' + esc(peers.group) + '（在籍中）の、いちばん新しいInBodyの記録です。名前・学年は出していません。ほかの選手の値は少し丸めています。大きな丸が' + esc(self) + 'です。</div>' + svg +
      (peers.few ? '<p class="muted small">比べる相手が' + (peers.min || 5) + '人より少ないため、ほかの選手の位置は出していません（' + esc(self) + 'の位置だけ）。</p>' : '') +
      '<div class="legends">' + (n > 0 ? '<span class="legend"><i class="peer-dot-key"></i>ほかの' + esc(peers.group) + '（' + n + '人）</span>' : '') +
      '<span class="legend"><i class="peer-me-key"></i>' + esc(self) + '：' + me.lbm.toFixed(1) + 'kg・FFMI ' + me.ffmi.toFixed(1) + '</span></div>' +
      '<div class="muted small">点線はチームの基準線（除脂肪体重' + Number(c.lean).toFixed(1) + 'kg・FFMI' + Number(c.ffmi).toFixed(1) + '）の位置です。</div>';
  },

  /** 体組成の比較: 横軸=除脂肪体重（50kgから）、縦軸=FFMI（18から）、丸の大きさ=体脂肪率。点線は設定シートの基準線 */
  compChart: function (points) {
    var use = points.filter(function (p) { return p.p; });
    if (!use.length) return '<p class="muted small">まだ記録がありません（除脂肪体重とFFMIの両方がある記録が必要です）。</p>';
    var S = 340, L = 40, R = 12, T = 12, B = 34, c = Body.chart;
    var xMin = 50, xMax = Math.max(c.lean + 15, xMin + 30), yMin = 18, yMax = Math.max(c.ffmi + 3, yMin + 6);
    use.forEach(function (p) {   // 範囲の外の点があれば、軸を広げて必ず表示する
      xMin = Math.min(xMin, Math.floor((p.p.lbm - 3) / 5) * 5); xMax = Math.max(xMax, Math.ceil((p.p.lbm + 3) / 5) * 5);
      yMin = Math.min(yMin, Math.floor(p.p.ffmi - 1)); yMax = Math.max(yMax, Math.ceil(p.p.ffmi + 1));
    });
    var sx = function (v) { return L + (S - L - R) * (v - xMin) / (xMax - xMin); }, sy = function (v) { return T + (S - T - B) * (1 - (v - yMin) / (yMax - yMin)); };
    var svg = '<svg class="chart chart-square" viewBox="0 0 ' + S + ' ' + S + '">', v;
    svg += Body.zoneSvg(sx, sy, xMin, xMax, yMin, yMax, L, T, S - R, S - B, false).svg;   // v77：4つの区分の色分け（小さいので文字なし）
    for (v = Math.ceil(xMin / 5) * 5; v <= xMax; v += 5) svg += '<line x1="' + sx(v) + '" x2="' + sx(v) + '" y1="' + T + '" y2="' + (S - B) + '" class="grid"/><text x="' + sx(v) + '" y="' + (S - B + 13) + '" class="axis" text-anchor="middle">' + v + '</text>';
    var yStep = yMax - yMin > 10 ? 2 : 1;
    for (v = Math.ceil(yMin); v <= yMax; v += yStep) svg += '<line x1="' + L + '" x2="' + (S - R) + '" y1="' + sy(v) + '" y2="' + sy(v) + '" class="grid"/><text x="' + (L - 4) + '" y="' + (sy(v) + 3) + '" class="axis" text-anchor="end">' + v + '</text>';
    svg += '<line x1="' + sx(c.lean) + '" x2="' + sx(c.lean) + '" y1="' + T + '" y2="' + (S - B) + '" class="center-line"/>' +
      '<line x1="' + L + '" x2="' + (S - R) + '" y1="' + sy(c.ffmi) + '" y2="' + sy(c.ffmi) + '" class="center-line"/>' +
      '<text x="' + ((L + S - R) / 2) + '" y="' + (S - 4) + '" class="axis" text-anchor="middle">除脂肪体重(kg)</text>' +
      '<text x="10" y="' + ((T + S - B) / 2) + '" class="axis" text-anchor="middle" transform="rotate(-90 10 ' + ((T + S - B) / 2) + ')">FFMI</text>';
    use.forEach(function (p) {
      var f = p.p.fat === null || p.p.fat === undefined ? 5 : Math.max(5, Math.min(30, p.p.fat));
      var r = (10 + (f - 5) / 25 * 16) * 0.65;   // 体脂肪率5〜30% → 半径（既存アプリと同じ比率）
      svg += '<circle cx="' + sx(p.p.lbm).toFixed(1) + '" cy="' + sy(p.p.ffmi).toFixed(1) + '" r="' + r.toFixed(1) + '" fill="' + p.color + '" stroke="' + p.color + '"><title>' +
        esc(p.label + ': 除脂肪体重' + p.p.lbm.toFixed(1) + 'kg・FFMI' + p.p.ffmi.toFixed(1) + (p.p.fat !== null && p.p.fat !== undefined ? '・体脂肪率' + p.p.fat.toFixed(1) + '%' : '')) + '</title></circle>';
    });
    svg += '</svg>';
    var legend = '<div class="legends">' + use.map(function (p) {
      return '<span class="legend"><i style="background:' + p.color + '"></i>' + esc(p.label) + '：' + p.p.lbm.toFixed(1) + 'kg・FFMI ' + p.p.ffmi.toFixed(1) + '</span>';
    }).join('') + '</div>';
    return svg + legend + '<div class="muted small">点線はチームの基準線（除脂肪体重' + Number(c.lean).toFixed(1) + 'kg・FFMI' + Number(c.ffmi).toFixed(1) + '）の位置です。</div>';
  },

  /** 体重の推移: 横いっぱいの折れ線。点の色で種別（青=体重管理表・緑=InBody） */
  weightChart: function (recs, o) {
    if (recs.length < 1) return '';
    var W = o.w, H = o.h, L = 40, R = 14, T = 22, B = 24, n = recs.length;
    var yr = Body.range(recs.map(function (p) { return p.value; }), 4);
    var sx = function (i) { return n === 1 ? (L + W - R) / 2 : L + (W - L - R) * i / (n - 1); };
    var sy = function (v) { return T + (H - T - B) * (1 - (v - yr.min) / (yr.max - yr.min)); };
    var svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '">';
    for (var g = 0; g <= 4; g++) {
      var v = yr.min + (yr.max - yr.min) * g / 4, y = sy(v).toFixed(1);
      svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" class="grid"/><text x="' + (L - 4) + '" y="' + (+y + 3) + '" class="axis" text-anchor="end">' + (Math.round(v * 10) / 10) + '</text>';
    }
    svg += '<text x="' + (L - 4) + '" y="' + (T - 10) + '" class="axis" text-anchor="end">kg</text>';
    if (n > 1) svg += '<polyline fill="none" stroke="' + Body.COLORS.weight + '" stroke-width="2" stroke-linejoin="round" points="' + recs.map(function (p, i) { return sx(i).toFixed(1) + ',' + sy(p.value).toFixed(1); }).join(' ') + '"/>';
    var dot = Math.max(2, Math.min(4, 80 / n));
    recs.forEach(function (p, i) {
      svg += '<circle cx="' + sx(i).toFixed(1) + '" cy="' + sy(p.value).toFixed(1) + '" r="' + dot + '" fill="' + (p.r.src === 'InBody' ? Body.COLORS.lbm : p.r.src === '本人' ? Body.COLORS.fat : Body.COLORS.weight) + '" stroke="#fff" stroke-width="1"><title>' +
        esc(o.tip ? o.tip(p) : p.date + ' ' + p.value.toFixed(1) + 'kg（' + Body.srcName(p.r.src) + '）') + '</title></circle>';
    });
    return svg + Body.xLabels(recs.map(function (p) { return p.date; }), sx, H - 6) + '</svg>';
  },

  // ---------------- 測定の履歴（最前面のウィンドウ） ----------------
  closeHistory: function () {
    var m = document.getElementById('reportModal');
    if (m) m.remove();
    document.body.classList.remove('report-modal-open');
  },

  modal: function (title, sub, body) {
    Body.closeHistory();
    var ov = document.createElement('div');
    ov.id = 'reportModal'; ov.className = 'report-modal-overlay';
    ov.innerHTML = '<div class="report-modal" role="dialog" aria-modal="true"><div class="report-modal-head"><div><div class="report-modal-title">' + title + '</div>' +
      '<div class="report-modal-sub">' + esc(sub) + '</div></div><button type="button" class="report-modal-close" aria-label="閉じる">×</button></div>' +
      '<div class="report-modal-body">' + body + '</div></div>';
    ov.onclick = function (e) { if (e.target === ov || e.target.closest('.report-modal-close')) Body.closeHistory(); };   // ×・外側のタップで閉じる
    document.body.appendChild(ov);
    document.body.classList.add('report-modal-open');
    return ov;
  },

  /** InBodyの履歴（全件・新しい順）。key の列を強調する */
  openInbodyHistory: function (a, key) {
    var base = (a.base && a.base.dates) || [], rows = a.inbody.slice().reverse();
    var hl = function (k) { return (k === key || (key === 'ffmi' && k === 'rank')) ? ' class="report-col-hl"' : ''; };
    var body = rows.length ? '<div class="table-scroll"><table class="tbl"><tr><th>測定日</th><th' + hl('weight') + '>体重(kg)</th><th' + hl('fat') + '>体脂肪率(%)</th><th' + hl('lbm') + '>除脂肪体重(kg)</th><th' +
      hl('ffmi') + '>FFMI</th><th' + hl('rank') + '>FFMI同日順位</th></tr>' + rows.map(function (r) {
        return '<tr><td>' + esc(Body.dShort(r.date)) + (base.indexOf(r.date) >= 0 ? ' <span class="report-base-tag">基準</span>' : '') + '</td>' +
          ['weight', 'fat', 'lbm', 'ffmi'].map(function (k) { return '<td' + hl(k) + '>' + Body.f1(r[k]) + '</td>'; }).join('') +
          '<td' + hl('rank') + '>' + (r.rank ? r.rank + '位 / ' + r.rankOf + '人' : '-') + '</td></tr>';
      }).join('') + '</table></div>' : '<p class="muted">InBodyの記録がまだありません。</p>';
    Body.modal('測定の履歴（InBody）', (a.name || '') + ' ・ 新しい順（全' + rows.length + '件）', body);
  },

  /** 体重の履歴（全件・新しい順）。hlDate の行（4週前・3か月前の比較対象）を強調する */
  openWeightHistory: function (a, hlDate) {
    var recs = Body.series(a.weight || [], 'weight'), rows = recs.slice().reverse();
    var body = '<div class="table-scroll"><table class="tbl"><tr><th>測定日</th><th>体重(kg)</th><th>前回比(kg)</th><th>種別</th></tr>' + rows.map(function (p, i) {
      var q = rows[i + 1], tag = i === 0 ? ' <span class="report-base-tag">最新</span>' : p.date === hlDate ? ' <span class="report-base-tag">比較対象</span>' : '';
      return '<tr' + (p.date === hlDate ? ' class="report-row-hl"' : '') + '><td>' + esc(Body.dShort(p.date)) + tag + '</td><td>' + p.value.toFixed(1) + '</td><td>' +
        (q ? Body.diffText(p.value - q.value) : '-') + '</td><td>' + Body.srcName(p.r.src) + '</td></tr>';
    }).join('') + '</table></div>';
    Body.modal('体重の履歴', (a.name || '') + ' ・ 新しい順（全' + rows.length + '件）', body);
  }
};

// 選手本人の画面: InBody／体重のタブ切り替え
document.getElementById('app').addEventListener('click', function (e) {
  var t = e.target.closest('[data-body-tab]');
  if (!t || S.view !== 'body') return;
  Body.tab = t.dataset.bodyTab;
  Body.renderMine();
});
// レポートのカードをタップ（またはEnter）→ 測定の履歴を開く（選手画面・スタッフ画面の共通）
function onReportCard(e) {
  var t = e.target.closest && e.target.closest('[data-rep]');
  if (!t) return;
  var a = Body.reg[t.dataset.aid];
  if (!a) return;
  if (t.dataset.rep === 'inbody') Body.openInbodyHistory(a, t.dataset.k); else Body.openWeightHistory(a, t.dataset.hl);
}
document.getElementById('app').addEventListener('click', onReportCard);
document.getElementById('app').addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { if (e.target.closest('[data-rep]')) { e.preventDefault(); onReportCard(e); } } });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') Body.closeHistory(); });
