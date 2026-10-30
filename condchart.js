/**
 * condchart.js ― コンディションの推移のグラフ（v34。スタッフ画面の選手詳細で使う）
 *
 *   2つの見方を、上のタブで切り替える。
 *     ・1週間    … その週の毎日の値（週の始まりは設定シートの「週の始まり」。‹ › で前後の週へ）
 *     ・3か月    … 13週ぶんの「週ごとの平均」（‹ › で前後の13週へ）
 *   グラフは2つに分けている（数字の意味が逆なので、同じグラフに入れない）。
 *     ・疲労（全身・上半身・下半身）… 上ほど疲れている（1 疲れていない〜10 とても疲れている）。8 の点線は注意の目安
 *     ・動きやすさ（パフォーマンスの質）… 上ほど良い（1 とても悪い〜10 とても良い）
 *   グラフの下には同じ数字の表も出す（スマホでは点を押しても数字が出にくいため）。
 *   記録が無い日（週）をはさむところは、細い点線でつなぐ（実線は続けて記録がある所だけ）。
 *
 *   使い方：CondChart.set(コンディションの一覧, '月' または '日') → CondChart.html() を画面に入れる。
 *           タブや ‹ › を押すと、#condChartBox の中だけを描き直す（サーバーへの通信はしない）。
 *   線の色は style.css の --cc-1 〜 --cc-3（昼・夜それぞれ）で変えられる。
 */
var CondChart = {
  data: [],          // [{ date, whole, upper, lower, perf, comment }]（日付の古い順）
  byDate: {},
  weekStart: '月',
  mode: 'week',      // 'week'（1週間）／ 'quarter'（3か月の週平均）
  offset: 0,         // 0 = 今週（今の13週）。1 つ増えるごとに 1週（13週）前
  WEEKS: 13,         // 「3か月」の週の数
  ALERT: 8,          // 疲労の注意の目安（スタッフの実施状況で赤くする数字と同じ）

  FATIGUE: [
    { key: 'whole', label: '全身', color: 'var(--cc-1)' },
    { key: 'upper', label: '上半身', color: 'var(--cc-2)' },
    { key: 'lower', label: '下半身', color: 'var(--cc-3)' }
  ],
  PERF: { key: 'perf', label: '動きやすさ', color: 'var(--color-accent)' },

  /** データを入れる（新しい順で来ても古い順に並べ直す）。見方は「1週間・今週」に戻す */
  set: function (list, weekStart) {
    CondChart.data = (list || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    CondChart.byDate = {};
    CondChart.data.forEach(function (c) { CondChart.byDate[c.date] = c; });
    CondChart.weekStart = weekStart === '日' ? '日' : '月';
    CondChart.mode = 'week';
    CondChart.offset = 0;
  },

  // ---------------- 日付の小さな道具 ----------------
  /** その日を含む週の始まりの日（'yyyy-mm-dd'） */
  weekStartOf: function (ds) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ds);
    var dow = new Date(Date.UTC(+m[1], m[2] - 1, +m[3])).getUTCDay();
    var start = CondChart.weekStart === '日' ? 0 : 1;
    return Body.addDays(ds, -((dow - start + 7) % 7));
  },
  md: function (ds) { return Number(ds.slice(5, 7)) + '/' + Number(ds.slice(8, 10)); },
  wd: function (ds) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ds);
    return '日月火水木金土'.charAt(new Date(Date.UTC(+m[1], m[2] - 1, +m[3])).getUTCDay());
  },
  /** 平均（空欄は除く。小数1けた。値が無ければ null） */
  avg: function (list, key) {
    var v = list.map(function (c) { return c[key]; }).filter(function (x) { return x !== '' && x !== null && x !== undefined; }).map(Number);
    return v.length ? Math.round(v.reduce(function (a, b) { return a + b; }, 0) / v.length * 10) / 10 : null;
  },
  val: function (c, key) { return c && c[key] !== '' && c[key] !== null && c[key] !== undefined ? Number(c[key]) : null; },

  // ---------------- 表示する期間のデータ ----------------
  /** 今の見方で表示する点の一覧：[{ x: 目盛りの文字, sub: 2行目, label: 表の見出し, row: 値, n: 日数, comment }] */
  points: function () {
    var thisWeek = CondChart.weekStartOf(Body.today());
    if (CondChart.mode === 'week') {
      var ws = Body.addDays(thisWeek, -7 * CondChart.offset), pts = [];
      for (var i = 0; i < 7; i++) {
        var d = Body.addDays(ws, i), c = CondChart.byDate[d] || null;
        pts.push({ x: CondChart.md(d), sub: CondChart.wd(d), label: CondChart.md(d) + '（' + CondChart.wd(d) + '）', date: d,
                   row: c, n: c ? 1 : 0, comment: c ? c.comment : '', future: d > Body.today() });
      }
      return { from: ws, to: Body.addDays(ws, 6), pts: pts };
    }
    var last = Body.addDays(thisWeek, -7 * CondChart.WEEKS * CondChart.offset), list = [];
    for (var k = CondChart.WEEKS - 1; k >= 0; k--) {
      var s = Body.addDays(last, -7 * k), e = Body.addDays(s, 6);
      var inWeek = CondChart.data.filter(function (c) { return c.date >= s && c.date <= e; });
      var row = inWeek.length ? { whole: CondChart.avg(inWeek, 'whole'), upper: CondChart.avg(inWeek, 'upper'),
                                  lower: CondChart.avg(inWeek, 'lower'), perf: CondChart.avg(inWeek, 'perf') } : null;
      list.push({ x: CondChart.md(s), sub: '', label: CondChart.md(s) + '〜' + CondChart.md(e), date: s, row: row, n: inWeek.length, future: s > Body.today() });
    }
    return { from: list[0].date, to: Body.addDays(last, 6), pts: list };
  },

  /** 前（古い方）へ進めるか：表示している期間より前に記録があるときだけ */
  hasOlder: function (from) { return CondChart.data.length > 0 && CondChart.data[0].date < from; },

  /**
   * コンディションの週平均の推移を、声で読める文にする（v43。スタッフの staff_qa.js・選手の qa.js で共通）
   *   conds: [{ date, whole, upper, lower, perf }] / weekStart: '月' または '日' / t: 聞かれた文（期間・項目の言葉を読む）
   *   最近4週（「最近2か月の」などと言えばその期間・最大13週）の週ごとの平均を、古い週から順に並べる
   */
  trendText: function (conds, weekStart, t) {
    var range = Body.trendRange(t), c = (conds || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    CondChart.weekStart = weekStart === '日' ? '日' : '月';
    var weeks = range.from ? Math.min(13, Math.max(2, Math.ceil((Date.parse(Body.today()) - Date.parse(range.from)) / (7 * 86400000)))) : 4;
    var thisWeek = CondChart.weekStartOf(Body.today()), list = [];
    for (var k = weeks - 1; k >= 0; k--) {
      var ws = Body.addDays(thisWeek, -7 * k), we = Body.addDays(ws, 6);
      var inW = c.filter(function (x) { return x.date >= ws && x.date <= we; });
      list.push({ ws: ws, n: inW.length, whole: CondChart.avg(inW, 'whole'), upper: CondChart.avg(inW, 'upper'), lower: CondChart.avg(inW, 'lower'), perf: CondChart.avg(inW, 'perf') });
    }
    var has = list.filter(function (w) { return w.n; });
    if (!has.length) return '最近' + weeks + '週間のコンディションの記録がありません。';
    var keys = /動き|パフォマンス/.test(t) ? [['perf', '動きやすさ']] : /上半身/.test(t) ? [['upper', '上半身の疲労']] : /下半身/.test(t) ? [['lower', '下半身の疲労']]
      : /全身/.test(t) ? [['whole', '全身の疲労']] : /疲労|疲れ/.test(t) ? [['whole', '全身'], ['upper', '上半身'], ['lower', '下半身']]
      : [['whole', '全身の疲労'], ['upper', '上半身'], ['lower', '下半身'], ['perf', '動きやすさ']];
    var word = function (a, b) { return has.length < 2 || a === null || b === null ? '' : b - a >= 1 ? '（上がっています）' : a - b >= 1 ? '（下がっています）' : '（ほぼ同じ）'; };
    var md = function (d) { return Number(d.slice(5, 7)) + '月' + Number(d.slice(8, 10)) + '日'; };
    return '最近' + weeks + '週間のコンディションの週平均は、' + md(has[0].ws) + 'の週からの順に、' + keys.map(function (k) {
      var vals = has.map(function (w) { return w[k[0]]; });
      return k[1] + 'が' + vals.map(function (x) { return x === null ? '-' : x; }).join('、') + word(vals[0], vals[vals.length - 1]);
    }).join('、') + 'です。記録がある週は' + has.length + '週です。';
  },

  // ---------------- 画面 ----------------
  html: function () { return '<div class="card cond-chart" id="condChartBox">' + CondChart.inner() + '</div>'; },

  render: function () {
    var box = document.getElementById('condChartBox');
    if (box) box.innerHTML = CondChart.inner();
  },

  inner: function () {
    if (!CondChart.data.length) return '<p class="muted">コンディションの記録はまだありません。</p>';
    var p = CondChart.points(), week = CondChart.mode === 'week';
    var tab = function (m, label) {
      return '<button class="tab' + (CondChart.mode === m ? ' on' : '') + '" data-cc="mode" data-v="' + m + '">' + label + '</button>';
    };
    var title = week ? CondChart.md(p.from) + '（' + CondChart.wd(p.from) + '）〜' + CondChart.md(p.to) + '（' + CondChart.wd(p.to) + '）'
                     : CondChart.md(p.from) + '〜' + CondChart.md(p.to) + '（' + CondChart.WEEKS + '週）';
    var recorded = p.pts.filter(function (x) { return x.n; }).length;
    var html = '<div class="tabs">' + tab('week', '1週間（毎日）') + tab('quarter', '3か月（週平均）') + '</div>' +
      '<div class="hist-month"><button class="btn ghost hist-nav" data-cc="prev"' + (CondChart.hasOlder(p.from) ? '' : ' disabled') + ' aria-label="前へ">‹</button>' +
      '<div class="hist-title">' + title + '</div>' +
      '<button class="btn ghost hist-nav" data-cc="next"' + (CondChart.offset > 0 ? '' : ' disabled') + ' aria-label="次へ">›</button></div>' +
      '<p class="muted small">' + (week ? '記録した日 ' + recorded + '日 / 7日' : '記録がある週 ' + recorded + '週 / ' + CondChart.WEEKS + '週（点は、その週に記録した日の平均）') +
      (CondChart.offset ? '　<button class="btn ghost small" data-cc="today">' + (week ? '今週' : '最新') + 'にもどる</button>' : '') + '</p>';
    if (!recorded) return html + '<p class="muted">この期間の記録はありません。‹ で前の期間を見られます。</p>';

    // 疲労のグラフ（3本）と、動きやすさのグラフ（1本）
    html += '<div class="cc-head"><b>疲労</b><span class="muted small">上ほど疲れている（10 とても疲れている）。点線は ' + CondChart.ALERT + '（注意の目安）</span></div>' +
      '<div class="cc-legend">' + CondChart.FATIGUE.map(function (s) { return '<span><i style="background:' + s.color + '"></i>' + s.label + '</span>'; }).join('') + '</div>' +
      CondChart.svg(p.pts, CondChart.FATIGUE, { alert: CondChart.ALERT, aria: '疲労の推移' }) +
      '<div class="cc-head"><b>動きやすさ（パフォーマンスの質）</b><span class="muted small">上ほど良い（10 とても良い）</span></div>' +
      CondChart.svg(p.pts, [CondChart.PERF], { aria: '動きやすさの推移', small: true });
    return html + CondChart.table(p.pts, week);
  },

  /** 同じ数字の表（新しい順） */
  table: function (pts, week) {
    var f = function (v) { return v === null || v === undefined || v === '' ? '-' : v; };
    var hot = function (v) { return v !== null && v !== '' && v !== undefined && Number(v) >= CondChart.ALERT ? ' class="ng-text"' : ''; };
    var rows = pts.slice().reverse().filter(function (x) { return !x.future; });
    return '<details class="cc-table"' + (week ? ' open' : '') + '><summary>数字の表</summary><div class="table-scroll"><table class="tbl"><tr><th>' + (week ? '日付' : '週') + '</th>' +
      (week ? '' : '<th>日数</th>') + '<th>全身</th><th>上半身</th><th>下半身</th><th>動き</th>' + (week ? '<th>コメント</th>' : '') + '</tr>' +
      rows.map(function (x) {
        var r = x.row || {};
        return '<tr><td>' + esc(x.label) + '</td>' + (week ? '' : '<td>' + x.n + '</td>') +
          ['whole', 'upper', 'lower'].map(function (k) { return '<td' + hot(r[k]) + '>' + f(r[k]) + '</td>'; }).join('') + '<td>' + f(r.perf) + '</td>' +
          (week ? '<td class="small" style="white-space:normal">' + esc(x.comment || '') + '</td>' : '') + '</tr>';
      }).join('') + '</table></div></details>';
  },

  /**
   * 折れ線のグラフ（SVG）。縦は 1〜10 で固定（見比べやすいように）。
   *   pts: 点の一覧 / series: [{ key, label, color }] / opt: { alert: 点線の位置, small: 低めのグラフ, aria }
   *   2本以上のときは、線の右はしに名前を書く（色だけで見分けなくてよいように）。
   */
  svg: function (pts, series, opt) {
    var W = 340, H = opt.small ? 130 : 190, L = 22, R = series.length > 1 ? 46 : 12, T = 10, B = 32, n = pts.length;
    var sx = function (i) { return L + (W - L - R) * (n === 1 ? 0.5 : i / (n - 1)); };
    var sy = function (v) { return T + (H - T - B) * (1 - (v - 1) / 9); };
    var out = '<svg class="chart cc-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opt.aria) + '">';
    // 目盛り（1・4・7・10）
    [1, 4, 7, 10].forEach(function (v) {
      out += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + sy(v) + '" y2="' + sy(v) + '" class="grid"/>' +
        '<text x="' + (L - 6) + '" y="' + (sy(v) + 3.5) + '" class="axis" text-anchor="end">' + v + '</text>';
    });
    if (opt.alert) out += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + sy(opt.alert) + '" y2="' + sy(opt.alert) + '" class="center-line"/>';
    // 横の目盛り（3か月のときは1つおき）
    pts.forEach(function (p, i) {
      if (n > 7 && i % 2 && i !== n - 1) return;
      out += '<text x="' + sx(i).toFixed(1) + '" y="' + (H - B + 14) + '" class="axis" text-anchor="middle">' + esc(p.x) + '</text>';
      if (p.sub) out += '<text x="' + sx(i).toFixed(1) + '" y="' + (H - B + 27) + '" class="axis" text-anchor="middle">' + esc(p.sub) + '</text>';
    });
    // 線と点
    var ends = [];
    series.forEach(function (s) {
      var seg = [], segs = [];
      pts.forEach(function (p, i) {
        var v = CondChart.val(p.row, s.key);
        if (v === null) { if (seg.length) segs.push(seg); seg = []; return; }
        seg.push([sx(i), sy(v), v, p.label]);
      });
      if (seg.length) segs.push(seg);
      // 記録が無い日（週）をはさむところは、細い点線でつなぐ（実線は続けて記録がある所だけ）
      for (var g = 1; g < segs.length; g++) {
        var a = segs[g - 1][segs[g - 1].length - 1], b = segs[g][0];
        out += '<line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1) +
          '" stroke="' + s.color + '" stroke-width="1.5" stroke-dasharray="3 4" opacity="0.6"/>';
      }
      segs.forEach(function (g) {
        if (g.length > 1) out += '<polyline fill="none" stroke="' + s.color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="' +
          g.map(function (q) { return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' ') + '"/>';
      });
      segs.forEach(function (g) {
        g.forEach(function (q) {
          out += '<g class="cc-pt"><circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="10" fill="transparent"/>' +
            '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="4" fill="' + s.color + '" stroke="var(--color-paper)" stroke-width="2"/>' +
            '<title>' + esc(q[3] + '　' + s.label + ' ' + q[2]) + '</title></g>';
        });
      });
      var lastSeg = segs[segs.length - 1];
      if (lastSeg && series.length > 1) { var e = lastSeg[lastSeg.length - 1]; ends.push({ x: e[0], y: e[1], label: s.label }); }
    });
    // 線の右はしの名前（重ならないように、上から順に13px以上あける）
    ends.sort(function (a, b) { return a.y - b.y; });
    for (var k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 13) ends[k].y = ends[k - 1].y + 13;
    ends.forEach(function (e) {
      out += '<text x="' + (e.x + 8).toFixed(1) + '" y="' + (e.y + 3.5).toFixed(1) + '" class="cc-end">' + esc(e.label) + '</text>';
    });
    return out + '</svg>';
  }
};

// タブ・‹ › のボタン（スタッフ画面のときだけ）
app.addEventListener('click', function (e) {
  var t = e.target.closest('[data-cc]');
  if (!t || t.disabled) return;
  switch (t.dataset.cc) {
    case 'mode': CondChart.mode = t.dataset.v; CondChart.offset = 0; break;
    case 'prev': CondChart.offset++; break;
    case 'next': CondChart.offset = Math.max(0, CondChart.offset - 1); break;
    case 'today': CondChart.offset = 0; break;
  }
  CondChart.render();
});
