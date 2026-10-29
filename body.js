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
      if (res.chart) Body.chart = res.chart;
      Body.mine = { id: 'me', name: res.name, caption: res.caption || '', weight: res.weight || [], inbody: res.inbody || [], base: res.base };
      Body.renderMine();
      if (after) after();
    }).catch(function (err) {
      app.innerHTML = msgHtml('error', err.message) + '<button class="btn block" data-act="home">ホームへ</button>';
    });
  },

  renderMine: function () {
    var a = Body.mine, tab = Body.tab || (a.inbody.length || !a.weight.length ? 'inbody' : 'weight');
    app.innerHTML = '<div class="group"><div class="topbar"><h1>体組成レポート</h1><button class="btn ghost" data-act="home">ホームへ</button></div>' +
      '<div class="tabs"><button class="tab' + (tab === 'inbody' ? ' on' : '') + '" data-body-tab="inbody">InBody</button>' +
      '<button class="tab' + (tab === 'weight' ? ' on' : '') + '" data-body-tab="weight">体重</button></div></div>' +
      (tab === 'inbody' ? Body.physicalHtml(a) : Body.weightReportHtml(a));
  },

  /** アバターが読み上げる、レポートのひとこと要約（音声で開いたとき） */
  summary: function (tab) {
    var a = Body.mine;
    if (!a) return '';
    if (tab === 'weight') {
      var st = Body.weightStats(a.weight);
      if (!st) return '体重レポートだよ。まだ体重の記録はないみたい。';
      return '体重レポートだよ。' + Body.dShort(st.last.date).replace('/', '月') + '日の体重は' + st.last.value.toFixed(1) + 'キロ' +
        (st.prev ? '、前回より' + Body.speakDiff(st.last.value - st.prev.value, 'キロ') : '') + '。直近4週間の平均は' + st.w1.avg.toFixed(1) + 'キロだよ。';
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
      html += Body.spark(s) + '</div>';
    });
    html += '</div>';

    // InBodyデータの推移（左）と 体組成の比較（右）。PDFでは横に並べる
    var plotted = function (r) { return r && Body.num(r.lbm) !== null && Body.num(r.ffmi) !== null; };
    var baseRows = ib.filter(function (r) { return base.dates.indexOf(r.date) >= 0 && plotted(r); });
    var basePt = baseRows.length ? { lbm: Body.avg(baseRows.map(function (r) { return +r.lbm; })), ffmi: Body.avg(baseRows.map(function (r) { return +r.ffmi; })),
                                     fat: Body.avg(baseRows.filter(function (r) { return Body.num(r.fat) !== null; }).map(function (r) { return +r.fat; })) } : null;
    var last = ib[ib.length - 1], latestPt = plotted(last) ? { lbm: +last.lbm, ffmi: +last.ffmi, fat: Body.num(last.fat) } : null;
    html += '<div class="report-charts"><div class="report-chart-col"><div class="report-section-title">InBodyデータの推移</div>' +
      '<div class="report-chart-desc muted small">体重・除脂肪体重（左軸・kg）と体脂肪率（右軸・%）の推移です。</div>' +
      Body.trendChart(ib, opt.print ? { w: 430, h: 270 } : { w: 420, h: 300 }) + '</div>' +
      '<div class="report-chart-col"><div class="report-section-title">体組成の比較（除脂肪体重×FFMI）</div>' +
      '<div class="report-chart-desc muted small">丸の大きさは体脂肪率（大きいほど高い）。「基準」は基準の測定（複数日なら平均）、「最新」は直近のInBodyの記録です。</div>' +
      Body.compChart([{ label: '基準' + (base.label ? '（' + base.label + '）' : ''), p: basePt, color: Body.COLORS.base },
                      { label: '最新（' + Body.dShort(last.date) + '）', p: latestPt, color: Body.COLORS.latest }]) + '</div></div>';

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

  weightReportHtml: function (a, opt) {
    opt = opt || {};
    Body.reg[a.id] = a;
    var st = Body.weightStats(a.weight || []);
    var html = '<div class="card report-card">' + Body.head('体重レポート', a, st ? st.last.date : '');
    if (!st) return html + '<p class="muted" style="margin-top:12px;">まだ体重の記録がありません。体重管理表またはInBodyが取り込まれると、ここにレポートが表示されます。</p></div>';
    var L = st.last, tap = function (hl) { return '<div class="report-metric report-metric-tappable" data-rep="weight" data-aid="' + esc(a.id) + '" data-hl="' + esc(hl || '') + '" role="button" tabindex="0">'; };
    var hint = '<span class="report-tap-hint">タップで履歴を表示</span>';
    var val = function (v) { return '<div class="report-metric-value">' + v + '<span class="report-unit">kg</span></div>'; };
    var vsCard = function (ref, label) {
      if (!ref) return '<div class="report-metric-value report-none">-</div><div class="report-metric-sub">' + label + 'の記録なし</div>';
      return val(Body.diffText(L.value - ref.value).replace(/^(▲|▼|±)/, '<span class="report-mark-sm">$1</span>')) + '<div class="report-metric-sub">' + label + '（' + esc(Body.dShort(ref.date)) + '）の ' + ref.value.toFixed(1) + 'kg と比較</div>';
    };
    html += '<div class="report-section-title">体重の概要</div><div class="report-grid">' +
      tap('') + '<div class="report-metric-label">最新の体重' + hint + '</div>' + val(L.value.toFixed(1)) +
        '<div class="report-metric-sub">' + esc(Body.dShort(L.date)) + ' 測定</div>' +
        Body.diffRow('前回比', st.prev ? '<span class="report-diff">' + Body.diffText(L.value - st.prev.value) + '</span>' + Body.ref('（前回 ' + st.prev.value.toFixed(1) + ' / ' + esc(Body.dShort(st.prev.date)) + '）') : Body.ref('前回の記録なし')) +
        Body.spark(st.recs) + '</div>' +
      tap('') + '<div class="report-metric-label">直近4週間の平均' + hint + '</div>' + val(st.w1.avg.toFixed(1)) +
        '<div class="report-metric-sub">' + esc(Body.dShort(Body.addDays(L.date, -27))) + '〜' + esc(Body.dShort(L.date)) + '（' + st.w1.n + '件）</div>' +
        Body.diffRow('前4週比', st.w0.avg !== null ? '<span class="report-diff">' + Body.diffText(st.w1.avg - st.w0.avg) + '</span>' + Body.ref('（その前の4週 ' + st.w0.avg.toFixed(1) + '）') : Body.ref('その前の4週の記録なし')) + '</div>' +
      tap(st.ref4w ? st.ref4w.date : '') + '<div class="report-metric-label">4週前との差' + hint + '</div>' + vsCard(st.ref4w, '4週前') + '</div>' +
      tap(st.ref3m ? st.ref3m.date : '') + '<div class="report-metric-label">3か月前との差' + hint + '</div>' + vsCard(st.ref3m, '3か月前') + '</div></div>';

    var hasIb = st.recs.some(function (p) { return p.r.src === 'InBody'; });
    html += '<div class="report-section-title">体重の推移（全' + st.recs.length + '件）</div>' +
      (hasIb ? '<div class="report-chart-desc muted small"><span style="color:' + Body.COLORS.weight + '">●</span> 体重管理表　<span style="color:' + Body.COLORS.lbm + '">●</span> InBody測定による体重</div>' : '') +
      Body.weightChart(st.recs, opt.print ? { w: 700, h: 280 } : { w: 420, h: 260 });

    if (opt.print) {
      var prevOf = {};
      st.recs.forEach(function (p, i) { prevOf[p.date] = i > 0 ? st.recs[i - 1] : null; });
      html += '<div class="report-section-title">体重の数値（左ほど新しい日付・全' + st.recs.length + '件）</div>' +
        Body.pivot(st.recs.slice().reverse(), function (p) { return { latest: p === L }; }, [
          ['体重(kg)', function (p) { return p.value.toFixed(1); }],
          ['前回比(kg)', function (p) { var q = prevOf[p.date]; if (!q) return '-'; var d = Math.round((p.value - q.value) * 10) / 10; return d === 0 ? '±0.0' : (d > 0 ? '+' : '−') + Math.abs(d).toFixed(1); }],
          ['種別', function (p) { return p.r.src === 'InBody' ? 'InBody' : '記録'; }]
        ]);
    }
    html += '<div class="report-note">体重は、体重管理表とInBody測定の体重をあわせたものです（同じ日は体重管理表を優先）。前回比は直前の記録との差、直近4週間の平均は最終測定日から28日間の記録の平均です。' +
      '4週前・3か月前との差は、最終測定日からその分さかのぼった日付にいちばん近い記録（4週前は前後7日、3か月前は前後14日まで）との差で、その期間に記録がないときは「-」になります。' +
      '数値の良し悪しの判定は行わず、変化だけを表示しています。' + (opt.print ? '' : '項目のカードをタップすると、体重の履歴を表示します。') + '</div></div>';
    return html;
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
      svg += '<circle cx="' + sx(i).toFixed(1) + '" cy="' + sy(p.value).toFixed(1) + '" r="' + dot + '" fill="' + (p.r.src === 'InBody' ? Body.COLORS.lbm : Body.COLORS.weight) + '" stroke="#fff" stroke-width="1"><title>' +
        esc(p.date + ' ' + p.value.toFixed(1) + 'kg（' + (p.r.src === 'InBody' ? 'InBody' : '体重管理表') + '）') + '</title></circle>';
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
        (q ? Body.diffText(p.value - q.value) : '-') + '</td><td>' + (p.r.src === 'InBody' ? 'InBody' : '体重管理表') + '</td></tr>';
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
