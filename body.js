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
      app.innerHTML = '<div class="topbar"><h1>体組成レポート</h1><button class="btn ghost" data-act="home">ホームへ</button></div>' +
        Body.reportHtml(res);
    }).catch(function (err) {
      app.innerHTML = msgHtml('error', err.message) + '<button class="btn block" data-act="home">ホームへ</button>';
    });
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
  reportHtml: function (data) {
    var w = data.weight || [], ib = data.inbody || [];
    if (!w.length && !ib.length) return '<div class="card"><p class="muted">まだ体重・InBodyの記録がありません。スタッフが取り込むと表示されます。</p></div>';
    var html = '<div class="card"><h2>最新の測定結果</h2><div class="metrics">' +
      Body.card('体重', 'kg', w, 'weight') +
      Body.card('体脂肪率', '%', ib, 'fat') +
      Body.card('除脂肪体重', 'kg', ib, 'lbm') +
      Body.card('FFMI', '', ib, 'ffmi', function (r) {
        return r.rank ? '<div class="small">同日順位 <b>' + r.rank + '位</b><span class="muted">（' + r.rankOf + '人中）</span></div>' : '';
      }) + '</div></div>';
    if (w.length > 1) {
      html += '<div class="card"><h2>体重の推移</h2>' +
        Body.lineChart([{ points: w.map(function (r) { return { x: r.date, y: r.weight }; }), color: 'var(--primary)', label: '体重' }], { height: 200 }) + '</div>';
    }
    if (ib.length > 1) {
      html += '<div class="card"><h2>除脂肪体重とFFMIの推移</h2>' +
        Body.lineChart([{ points: ib.filter(function (r) { return r.lbm !== ''; }).map(function (r) { return { x: r.date, y: r.lbm }; }), color: '#2e9d5b', label: '除脂肪体重(kg)' }], { height: 170 }) +
        Body.lineChart([{ points: ib.filter(function (r) { return r.ffmi !== ''; }).map(function (r) { return { x: r.date, y: r.ffmi }; }), color: '#d9822b', label: 'FFMI' }], { height: 150 }) + '</div>';
    }
    if (ib.length) {
      html += '<div class="card"><h2>InBodyの履歴</h2><div class="table-scroll"><table class="tbl"><tr><th>測定日</th><th>体重</th><th>体脂肪率</th><th>除脂肪体重</th><th>FFMI</th></tr>' +
        ib.slice().reverse().map(function (r) {
          return '<tr><td>' + esc(r.date) + '</td><td>' + esc(r.weight) + '</td><td>' + esc(r.fat) + '</td><td>' + esc(r.lbm) + '</td><td>' + esc(r.ffmi) +
            (r.rank ? '<span class="muted small">（' + r.rank + '/' + r.rankOf + '）</span>' : '') + '</td></tr>';
        }).join('') + '</table></div></div>';
    }
    return html;
  },

  /**
   * 折れ線グラフ（SVG）。series = [{ points: [{x: '日付', y: 数値}], color, label }]
   * opt.height: 高さ / opt.mini: 小さい表示（目盛りなし）
   */
  lineChart: function (series, opt) {
    opt = opt || {};
    var W = 320, H = opt.height || 180, padL = opt.mini ? 4 : 34, padR = 8, padT = 8, padB = opt.mini ? 4 : 22;
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
