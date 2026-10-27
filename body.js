/**
 * body.js ― 体組成レポート（選手本人の画面・スタッフの選手詳細の両方で使う）と、グラフの描画（Phase 3）
 *   Body.showMine()            … 選手本人のレポート画面を開く
 *   Body.reportHtml(data)      … レポートのHTMLを作る（data = { weight: [...], inbody: [...] }）
 *   Body.lineChart(series,opt) … 折れ線グラフ（SVG）を作る。外部のグラフ用ライブラリは使わない
 */
var Body = {
  /** 選手本人の体組成レポートを開く */
  showMine: function () {
    S.view = 'body';
    app.innerHTML = '<div class="loading">読み込み中…</div>';
    Api.call('myBody', { token: S.token }).then(function (res) {
      Body.mine = res;
      Body.renderMine();
    }).catch(function (err) {
      app.innerHTML = msgHtml('error', err.message) + '<button class="btn block" data-act="home">ホームへ</button>';
    });
  },

  renderMine: function () {
    app.innerHTML = '<div class="topbar"><h1>体組成レポート</h1><button class="btn ghost" data-act="home">ホームへ</button></div>' +
      Body.reportHtml(Body.mine);
  },

  /** 前回との差を「▲0.4」「▼0.2」「±0」の形にする */
  diff: function (now, prev, unit) {
    if (now === '' || prev === '' || now == null || prev == null) return '<span class="muted">前回比 -</span>';
    var d = Math.round((now - prev) * 10) / 10;
    var mark = d > 0 ? '▲' : d < 0 ? '▼' : '±';
    return '<span class="muted">前回比</span> <b>' + mark + Math.abs(d) + '</b>' + (unit || '');
  },

  /** 最新値と前回比のカード */
  card: function (label, unit, rows, key, extra) {
    var vals = rows.filter(function (r) { return r[key] !== '' && r[key] != null; });
    var last = vals[vals.length - 1], prev = vals[vals.length - 2];
    var spark = vals.length > 1 ? Body.lineChart([{ points: vals.slice(-12).map(function (r) { return { x: r.date, y: r[key] }; }), color: 'var(--primary)' }],
                                                 { height: 60, mini: true }) : '';
    return '<div class="metric"><div class="metric-label">' + esc(label) + '</div>' +
      (last ? '<div class="metric-value">' + esc(last[key]) + '<span class="unit">' + unit + '</span></div>' +
              '<div class="muted small">' + esc(last.date) + '</div><div class="small">' + Body.diff(last[key], prev ? prev[key] : '', unit) + '</div>' +
              (extra ? extra(last) : '') + spark
            : '<div class="metric-value muted">記録なし</div>') + '</div>';
  },

  /** レポート全体のHTML */
  /** 体重の集計（最新・前回・直近4週間の平均・4週前との差・3か月前との差） */
  weightStats: function (w) {
    var vals = w.filter(function (r) { return r.weight !== '' && r.weight != null; });
    var last = vals[vals.length - 1], prev = vals[vals.length - 2];
    if (!last) return null;
    var t = function (d) { return new Date(d.replace(/-/g, '/')).getTime(); }, day = 86400000, lt = t(last.date);
    var recent = vals.filter(function (r) { return t(r.date) > lt - 28 * day; });
    var avg = Math.round(recent.reduce(function (s, r) { return s + Number(r.weight); }, 0) / recent.length * 10) / 10;
    // 基準の日付にいちばん近い記録（許容範囲 tol 日以内）
    var near = function (target, tol) {
      var best = null;
      vals.forEach(function (r) { var dd = Math.abs(t(r.date) - target); if (r !== last && dd <= tol * day && (!best || dd < best.dd)) best = { r: r, dd: dd }; });
      return best ? best.r : null;
    };
    var d3 = new Date(lt); d3.setMonth(d3.getMonth() - 3);
    return { last: last, prev: prev, avg4w: avg, w4: near(lt - 28 * day, 7), m3: near(d3.getTime(), 14), count: vals.length };
  },

  /** 差を「▲0.4kg」の形で */
  delta: function (now, ref) {
    if (!ref) return '<span class="muted">-（記録なし）</span>';
    var d = Math.round((now - ref.weight) * 10) / 10;
    return '<b>' + (d > 0 ? '▲' : d < 0 ? '▼' : '±') + Math.abs(d) + '</b>kg <span class="muted small">（' + esc(ref.date) + '：' + esc(ref.weight) + 'kg）</span>';
  },

  /** 体重のレポート（体重管理表の記録＋InBodyで測った体重） */
  weightHtml: function (w, opt) {
    opt = opt || {};
    var st = Body.weightStats(w);
    if (!st) return '<div class="card"><p class="muted">体重の記録がありません。</p></div>';
    var spark = Body.lineChart([{ points: w.slice(-12).map(function (r) { return { x: r.date, y: r.weight }; }), color: 'var(--primary)' }], { height: 60, mini: true });
    var html = '<div class="card"><h2>体重の概要</h2><div class="metrics">' +
      '<div class="metric"><div class="metric-label">最新の体重</div><div class="metric-value">' + esc(st.last.weight) + '<span class="unit">kg</span></div>' +
        '<div class="muted small">' + esc(st.last.date) + '</div><div class="small">' + Body.diff(st.last.weight, st.prev ? st.prev.weight : '', 'kg') + '</div>' + spark + '</div>' +
      '<div class="metric"><div class="metric-label">直近4週間の平均</div><div class="metric-value">' + esc(st.avg4w) + '<span class="unit">kg</span></div></div>' +
      '<div class="metric"><div class="metric-label">4週前との差</div><div class="small">' + Body.delta(st.last.weight, st.w4) + '</div></div>' +
      '<div class="metric"><div class="metric-label">3か月前との差</div><div class="small">' + Body.delta(st.last.weight, st.m3) + '</div></div></div></div>';
    if (w.length > 1) html += '<div class="card"><h2>体重の推移</h2>' +
      Body.lineChart([{ points: w.map(function (r) { return { x: r.date, y: r.weight }; }), color: 'var(--primary)', label: '体重' }],
                     { height: opt.print ? 150 : 200, width: opt.print ? 660 : 320 }) + '</div>';
    var hist = w.slice().reverse().slice(0, opt.print ? 15 : 30);
    html += '<div class="card"><h2>体重の履歴（直近' + hist.length + '回）</h2><div class="table-scroll"><table class="tbl"><tr><th>測定日</th><th>体重</th><th>前回比</th><th>種類</th></tr>' +
      hist.map(function (r, i) {
        var p = hist[i + 1], d = p ? Math.round((r.weight - p.weight) * 10) / 10 : '';
        return '<tr><td>' + esc(r.date) + '</td><td>' + esc(r.weight) + '</td><td>' + (d === '' ? '-' : (d > 0 ? '▲' : d < 0 ? '▼' : '±') + Math.abs(d)) + '</td><td class="small">' + esc(r.src || '') + '</td></tr>';
      }).join('') + '</table></div></div>';
    return html;
  },

  /** InBodyのレポート。opt.print = true のときはA4縦1枚に収まるよう詰める */
  inbodyHtml: function (ib, opt) {
    opt = opt || {};
    if (!ib.length) return '<div class="card"><p class="muted">InBodyの記録がありません。</p></div>';
    var html = '<div class="card"><h2>最新の測定結果（InBody）</h2><div class="metrics">' +
      Body.card('体重', 'kg', ib, 'weight') +
      Body.card('体脂肪率', '%', ib, 'fat') +
      Body.card('除脂肪体重', 'kg', ib, 'lbm') +
      Body.card('FFMI', '', ib, 'ffmi', function (r) {
        return r.rank ? '<div class="small">同日順位 <b>' + r.rank + '位</b><span class="muted">（' + r.rankOf + '人中）</span></div>' : '';
      }) + '</div></div>';
    if (ib.length > 1) {
      var h = opt.print ? 120 : 160;
      var lChart = Body.lineChart([{ points: ib.filter(function (r) { return r.lbm !== ''; }).map(function (r) { return { x: r.date, y: r.lbm }; }), color: '#2e9d5b', label: '除脂肪体重(kg)' }], { height: h });
      var fChart = Body.lineChart([{ points: ib.filter(function (r) { return r.ffmi !== ''; }).map(function (r) { return { x: r.date, y: r.ffmi }; }), color: '#d9822b', label: 'FFMI' }], { height: h });
      var fatChart = Body.lineChart([{ points: ib.filter(function (r) { return r.fat !== ''; }).map(function (r) { return { x: r.date, y: r.fat }; }), color: '#8a5cc7', label: '体脂肪率(%)' }], { height: h });
      var wChart = Body.lineChart([{ points: ib.map(function (r) { return { x: r.date, y: r.weight }; }), color: 'var(--primary)', label: '体重(kg)' }], { height: h });
      html += '<div class="card"><h2>InBodyの推移</h2><div class="' + (opt.print ? 'print-charts4' : '') + '"><div>' + wChart + '</div><div>' + fatChart + '</div><div>' + lChart + '</div><div>' + fChart + '</div></div></div>';   // 体重→体脂肪率→除脂肪体重→FFMIの順
    }
    var hist = ib.slice().reverse();
    if (opt.print) hist = hist.slice(0, 12);
    html += '<div class="card"><h2>InBodyの履歴' + (opt.print && ib.length > 12 ? '（直近12回）' : '') + '</h2><div class="table-scroll"><table class="tbl"><tr><th>測定日</th><th>身長</th><th>体重</th><th>体脂肪率</th><th>除脂肪体重</th><th>FFMI</th></tr>' +
      hist.map(function (r) {
        return '<tr><td>' + esc(r.date) + '</td><td>' + esc(r.height) + '</td><td>' + esc(r.weight) + '</td><td>' + esc(r.fat) + '</td><td>' + esc(r.lbm) + '</td><td>' + esc(r.ffmi) +
          (r.rank ? '<span class="muted small">（' + r.rank + '/' + r.rankOf + '）</span>' : '') + '</td></tr>';
      }).join('') + '</table></div></div>';
    return html;
  },

  /** 選手本人の画面用: InBodyと体重をタブで切り替える */
  reportHtml: function (data) {
    var w = data.weight || [], ib = data.inbody || [];
    if (!w.length && !ib.length) return '<div class="card"><p class="muted">まだ体重・InBodyの記録がありません。スタッフが取り込むと表示されます。</p></div>';
    var tab = Body.tab || (ib.length ? 'inbody' : 'weight');
    return '<div class="tabs"><button class="tab' + (tab === 'inbody' ? ' on' : '') + '" data-body-tab="inbody">InBody</button>' +
      '<button class="tab' + (tab === 'weight' ? ' on' : '') + '" data-body-tab="weight">体重</button></div>' +
      (tab === 'inbody' ? Body.inbodyHtml(ib) : Body.weightHtml(w));
  },

  /**
   * 折れ線グラフ（SVG）。series = [{ points: [{x: '日付', y: 数値}], color, label }]
   * opt.height: 高さ / opt.mini: 小さい表示（目盛りなし）
   */
  lineChart: function (series, opt) {
    opt = opt || {};
    var W = opt.width || 320, H = opt.height || 180, padL = opt.mini ? 4 : 34, padR = 8, padT = 8, padB = opt.mini ? 4 : 22;
    var all = [];
    series.forEach(function (s) { s.points.forEach(function (p) { all.push(p); }); });
    if (all.length < 2) return '';
    var xs = all.map(function (p) { return new Date(p.x.replace(/-/g, '/')).getTime(); });
    var ys = all.map(function (p) { return Number(p.y); });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    if (y1 - y0 < 1) { y0 -= 0.5; y1 += 0.5; }
    var pad = (y1 - y0) * 0.1; y0 -= pad; y1 += pad;
    var sx = function (t) { return padL + (x1 === x0 ? 0.5 : (t - x0) / (x1 - x0)) * (W - padL - padR); };
    var sy = function (v) { return padT + (1 - (v - y0) / (y1 - y0)) * (H - padT - padB); };
    var svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img">';
    if (!opt.mini) {
      [y0 + pad, (y0 + y1) / 2, y1 - pad].forEach(function (v) {
        svg += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + sy(v) + '" y2="' + sy(v) + '" class="grid"/>' +
               '<text x="' + (padL - 4) + '" y="' + (sy(v) + 3) + '" class="axis" text-anchor="end">' + (Math.round(v * 10) / 10) + '</text>';
      });
      var first = all[0].x, last = all[all.length - 1].x;
      svg += '<text x="' + padL + '" y="' + (H - 6) + '" class="axis">' + esc(first.slice(2)) + '</text>' +
             '<text x="' + (W - padR) + '" y="' + (H - 6) + '" class="axis" text-anchor="end">' + esc(last.slice(2)) + '</text>';
    }
    series.forEach(function (s) {
      var pts = s.points.map(function (p) { return sx(new Date(p.x.replace(/-/g, '/')).getTime()) + ',' + sy(Number(p.y)); });
      svg += '<polyline fill="none" stroke="' + s.color + '" stroke-width="' + (opt.mini ? 2 : 2.5) + '" points="' + pts.join(' ') + '"/>';
      if (!opt.mini) s.points.forEach(function (p) {
        svg += '<circle cx="' + sx(new Date(p.x.replace(/-/g, '/')).getTime()) + '" cy="' + sy(Number(p.y)) + '" r="3" fill="' + s.color + '"><title>' + esc(p.x + ' ' + p.y) + '</title></circle>';
      });
    });
    svg += '</svg>';
    var legend = opt.mini ? '' : series.filter(function (s) { return s.label; }).map(function (s) {
      return '<span class="legend"><i style="background:' + s.color + '"></i>' + esc(s.label) + '</span>';
    }).join('');
    return (legend ? '<div class="legends">' + legend + '</div>' : '') + svg;
  }
};

// InBody／体重のタブ切り替え（選手本人の画面）
document.getElementById('app').addEventListener('click', function (e) {
  var t = e.target.closest('[data-body-tab]');
  if (!t || S.view !== 'body') return;
  Body.tab = t.dataset.bodyTab;
  Body.renderMine();
});
