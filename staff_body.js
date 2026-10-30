/**
 * staff_body.js ― スタッフ画面の「InBody」タブと「体重」タブ（Phase 3c）
 *
 * InBodyタブ: 体組成Excel（InBody結果）の取り込み、ランキング（FFMI・除脂肪体重・体脂肪率・体重）、
 *             フィジカルレポートのPDF（学年まとめ）、Excel（ランキング・最新値）
 * 体重タブ  : 体重管理表の取り込み、測定日ごとの体重一覧（未測定は赤・前回比・4週前比）、
 *             体重レポートのPDF（学年まとめ）、Excel（一覧・全履歴）
 * InBodyタブの一番下に「基準の設定（全員共通）」（body_base.js・Phase 3e）。
 * v39：InBody・体重タブで選手の名前を押すと、その選手のフィジカルレポート（InBody／体重）を直接開く（staff.js の Staff.openReport）。
 * 取り込みは、それぞれのタブで対応するファイルだけを受け付ける（違うファイルを選ぶと知らせる）。
 */
var StaffBody = {
  kind: 'inbody', parsed: null, fileName: '', importDate: '', result: '',
  metric: 'ffmi', rankDate: '', weightDate: '', weightSort: 'roster',

  render: function (kind) {
    StaffBody.kind = kind;
    if (!Staff.body) {
      app.innerHTML = Staff.frame('<div class="loading">読み込み中…</div>');
      Staff.loadBody().then(function () { StaffBody.render(kind); }).catch(Staff.fail);
      return;
    }
    app.innerHTML = Staff.frame(StaffBody.importCard(kind) + (kind === 'weight' ? StaffBody.weightView() : StaffBody.inbodyView() + BodyBase.teamCard()));
  },

  /** 絞り込み後の選手（在籍中のみ） */
  people: function () {
    var f = Staff.filter;
    return Staff.body.athletes.filter(function (a) { return a.active && (!f.grade || a.grade === f.grade) && (!f.team || a.team === f.team); });
  },

  // ---------------- 取り込み ----------------
  importCard: function (kind) {
    var label = kind === 'weight' ? '体重管理表' : '体組成Excel（InBody結果）';
    var p = StaffBody.parsed && StaffBody.parsed.kind === kind ? StaffBody.parsed : null;
    var hasData = Staff.body.athletes.some(function (a) { return kind === 'weight' ? a.weight.length : a.inbody.length; });
    var open = p || StaffBody.result || !hasData ? ' open' : '';   // まだ記録が無いときは最初から開いておく
    var html = '<details class="card"' + open + '><summary><b>📥 ' + label + 'を取り込む</b></summary>' +
      '<p class="muted small">ファイルを選ぶと読み取り、Excelに入っているすべての測定日を取り込みます（同じ選手・同じ日は上書き）。ファイルはこの端末の中で読むだけで、保存はしません。</p>' +
      '<input type="file" accept=".xlsx,.xls" data-sb="file">';
    if (StaffBody.result) html += '<div class="msg ok">' + esc(StaffBody.result) + '</div>';
    if (p) {
      var roster = Staff.body.athletes.map(function (a) { return String(a.name).normalize('NFKC').replace(/\s/g, ''); });
      var date = StaffBody.importDate;
      var target = p.records.filter(function (r) { return !date || r.date === date; });
      var names = uniq(target.map(function (r) { return r.name; }));
      var unknown = names.filter(function (n) { return roster.indexOf(String(n).normalize('NFKC').replace(/\s/g, '')) < 0; });
      html += '<p><b>' + esc(StaffBody.fileName) + '</b>　測定日 ' + p.dates.length + '日分</p>' +
        '<label>取り込む測定日（ふつうは「すべての日付」のままでよい）</label><select class="sel" data-sb="importDate"><option value="">すべての日付（' + p.dates.length + '日分）</option>' +
        p.dates.slice().reverse().map(function (d) { return '<option' + (d === date ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select>' +
        '<p>取り込み対象：<b>' + target.length + '件</b>（' + names.length + '人）</p>' +
        (unknown.length ? '<div class="msg warn">選手マスタに無い名前（取り込まれません）：' + esc(unknown.join('、')) + '</div>' : '') +
        (p.warnings.length ? '<details class="msg warn"><summary>注意 ' + p.warnings.length + '件（範囲外の値・表記ゆれなど）</summary><div class="small">' +
          p.warnings.slice(0, 200).map(esc).join('<br>') + '</div></details>' : '') +
        '<button class="btn block big" data-sb="doImport"' + (target.length ? '' : ' disabled') + '>この内容で取り込む</button>';
    }
    return html + '</details>';
  },

  onFile: function (input) {
    var file = input.files && input.files[0], kind = StaffBody.kind;
    if (!file) return;
    StaffBody.fileName = file.name; StaffBody.importDate = ''; StaffBody.result = '';
    app.innerHTML = Staff.frame('<div class="loading">読み取り中…</div>');
    Importer.readFile(file).then(function (rows) {
      var parsed = Importer.parse(rows);
      if (parsed.kind !== kind) {
        StaffBody.parsed = null;
        StaffBody.result = '';
        StaffBody.render(kind);
        alert(parsed.kind === 'weight' ? 'このファイルは体重管理表のようです。「体重」タブで取り込んでください。'
                                       : 'このファイルは体組成Excel（InBody結果）のようです。「InBody」タブで取り込んでください。');
        return;
      }
      StaffBody.parsed = parsed;
      StaffBody.render(kind);
    }).catch(Staff.fail);
  },

  doImport: function () {
    var p = StaffBody.parsed, date = StaffBody.importDate, kind = StaffBody.kind;
    var rows = p.records.filter(function (r) { return !date || r.date === date; });
    if (!confirm((date || 'すべての日付') + ' の ' + rows.length + '件を取り込みます。同じ選手・同じ日の記録は上書きされます。よろしいですか？')) return;
    app.innerHTML = Staff.frame('<div class="loading">取り込み中…（件数が多いと数十秒かかります）</div>');
    Api.call('importBody', { token: S.token, kind: kind, fileName: StaffBody.fileName, rows: rows }).then(function (res) {
      Staff.body = null; StaffBody.parsed = null; StaffBody.weightDateSet = false;   // 取り込み後は最新の測定日を表示し直す
      StaffBody.result = '取り込みました：追加 ' + res.added + '件、上書き ' + res.updated + '件' +
        (res.skipped ? '、範囲外でスキップ ' + res.skipped + '件' : '') +
        (res.unknown.length ? '。選手マスタに無い名前：' + res.unknown.join('、') : '') +
        (res.duplicated.length ? '。同姓同名のため取り込めなかった名前：' + res.duplicated.join('、') : '');
      StaffBody.render(kind);
    }).catch(Staff.fail);
  },

  // ---------------- InBodyタブ ----------------
  inbodyView: function () {
    var metric = StaffBody.metric, date = StaffBody.rankDate, f = Staff.filter, people = StaffBody.people();
    var dates = uniq([].concat.apply([], Staff.body.athletes.map(function (a) { return a.inbody.map(function (r) { return r.date; }); }))).sort().reverse();
    var rows = people.map(function (a) {
      var list = a.inbody.filter(function (r) { return r[metric] !== '' && (!date || r.date <= date); });
      var r = list[list.length - 1];
      return r ? { id: a.id, name: a.name, grade: a.grade, value: r[metric], date: r.date } : null;
    }).filter(Boolean).sort(function (x, y) { return y.value - x.value; });
    var labels = { weight: '体重（InBody）', fat: '体脂肪率', lbm: '除脂肪体重', ffmi: 'FFMI' };   // 体重→体脂肪率→除脂肪体重→FFMIの順
    StaffBody.rankRows = rows.map(function (r, i) { return { rank: i > 0 && rows[i - 1].value === r.value ? '' : i + 1, id: r.id, name: r.name, grade: r.grade, value: r.value, date: r.date }; });
    StaffBody.rankTitle = labels[metric];
    StaffBody.rankSub = (f.grade || '全学年') + '・' + (date ? date + '以前の最新の記録' : '最新の記録') + '・' + rows.length + '人';

    var html = '<div class="card"><h2>InBodyのランキング</h2><div class="row">' +
      '<select class="sel" data-sb="metric">' + Object.keys(labels).map(function (k) { return '<option value="' + k + '"' + (metric === k ? ' selected' : '') + '>' + labels[k] + '</option>'; }).join('') + '</select>' +
      '<select class="sel" data-sb="rankDate"><option value="">最新の記録</option>' + dates.map(function (d) { return '<option' + (d === date ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select>' +
      Staff.select('grade', '学年', uniq(Staff.body.athletes.map(function (a) { return a.grade; }))) + '</div>' +
      '<p class="muted small">測定日を選ぶと、その日以前のいちばん新しい記録で並べます。選手名を押すと個別のレポートを表示します。</p>' +
      '<div class="row"><button class="btn sub" data-sb="xRankPdf">📄 ランキングをPDF</button><button class="btn sub" data-sb="xRankXlsx">📊 ランキングをExcel</button></div>' +
      '<div class="row"><button class="btn sub" data-sb="xReportsPdf">📄 学年のフィジカルレポートをまとめてPDF保存</button>' +
      '<button class="btn sub" data-sb="xLatestXlsx">📊 表示中の選手のInBody最新値をExcel</button></div></div>';
    html += '<div class="card"><table class="tbl"><tr><th>順位</th><th>選手</th><th>学年</th><th>' + esc(labels[metric]) + '</th><th>測定日</th></tr>' +
      StaffBody.rankRows.map(function (r) {
        return '<tr><td>' + r.rank + '</td><td><button class="link" data-staff="openReport" data-v="' + esc(r.id) + '" data-tab="inbody">' + esc(r.name) + '</button></td><td>' + esc(r.grade) +
          '</td><td><b>' + esc(r.value) + '</b></td><td class="small">' + esc(r.date) + '</td></tr>';
      }).join('') + '</table>' + (rows.length ? '' : '<p class="muted">InBodyの記録がありません。上の「取り込む」から体組成Excelを取り込んでください。</p>') + '</div>';
    return html;
  },

  // ---------------- 体重タブ ----------------
  /** 指定した測定日の体重一覧（日付を空にすると各選手の最新） */
  weightRows: function () {
    var date = StaffBody.weightDate;
    return StaffBody.people().map(function (a) {
      var w = a.weight, cur = null, idx = -1;
      for (var i = w.length - 1; i >= 0; i--) { if (!date ? true : w[i].date === date) { cur = w[i]; idx = i; break; } }
      var prev = idx > 0 ? w[idx - 1] : null;
      var st = cur ? Body.weightStats(w.slice(0, idx + 1)) : null;
      var r1 = function (v) { return Math.round(v * 10) / 10; };
      return { id: a.id, name: a.name, grade: a.grade, team: a.team, date: cur ? cur.date : '', weight: cur ? cur.weight : null,
               prevDate: prev ? prev.date : '', diff: cur && prev ? r1(cur.weight - prev.weight) : '',
               diff4w: cur && st && st.w4 ? r1(cur.weight - st.w4.weight) : '' };
    });
  },

  weightView: function () {
    var dates = uniq([].concat.apply([], Staff.body.athletes.map(function (a) { return a.weight.map(function (r) { return r.date; }); }))).sort().reverse();
    if (StaffBody.weightDate === null || (StaffBody.weightDate && dates.indexOf(StaffBody.weightDate) < 0)) StaffBody.weightDate = '';
    if (!StaffBody.weightDateSet && dates.length) { StaffBody.weightDate = dates[0]; StaffBody.weightDateSet = true; }   // 最初は最新の測定日
    var rows = StaffBody.weightRows(), sort = StaffBody.weightSort;
    if (sort === 'heavy') rows.sort(function (a, b) { return (b.weight || 0) - (a.weight || 0); });
    else if (sort === 'up') rows.sort(function (a, b) { return (b.diff === '' ? -99 : b.diff) - (a.diff === '' ? -99 : a.diff); });
    else if (sort === 'down') rows.sort(function (a, b) { return (a.diff === '' ? 99 : a.diff) - (b.diff === '' ? 99 : b.diff); });
    else rows.sort(function (a, b) { return (a.weight === null ? 0 : 1) - (b.weight === null ? 0 : 1) || String(a.grade).localeCompare(b.grade, 'ja') || String(a.name).localeCompare(b.name, 'ja'); });
    StaffBody.weightList = rows;
    var missing = rows.filter(function (r) { return r.weight === null; }).length;
    var html = '<div class="card"><h2>体重一覧</h2><div class="row">' +
      '<select class="sel" data-sb="weightDate"><option value="">各選手の最新の記録</option>' + dates.map(function (d) { return '<option' + (d === StaffBody.weightDate ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select>' +
      '<select class="sel" data-sb="weightSort">' + [['roster', '未測定→学年・名前順'], ['heavy', '体重の重い順'], ['up', '前回より増えた順'], ['down', '前回より減った順']]
        .map(function (o) { return '<option value="' + o[0] + '"' + (sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      Staff.select('grade', '学年', uniq(Staff.body.athletes.map(function (a) { return a.grade; }))) + '</div>' +
      '<p class="small">表示 ' + rows.length + '人' + (StaffBody.weightDate ? ' ／ <b class="ng-text">未測定 ' + missing + '人</b>' : '') + '</p>' +
      '<div class="row"><button class="btn sub" data-sb="xWeightPdf">📄 一覧をPDF</button><button class="btn sub" data-sb="xWeightXlsx">📊 一覧をExcel</button>' +
      '<button class="btn sub" data-sb="xWeightAllXlsx">📊 全員の体重の全履歴をExcel</button></div>' +
      '<div class="row"><button class="btn sub" data-sb="xWeightReportsPdf">📄 学年の体重レポートをまとめてPDF保存</button></div></div>';
    html += '<div class="card"><div class="table-scroll"><table class="tbl"><tr><th>選手</th><th>学年</th><th>体重</th><th>前回比</th><th>4週前比</th><th>測定日</th></tr>' +
      rows.map(function (r) {
        var fmt = function (d) { return d === '' ? '-' : (d > 0 ? '▲' : d < 0 ? '▼' : '±') + Math.abs(d); };
        return '<tr class="' + (r.weight === null ? 'row-ng' : '') + '"><td><button class="link" data-staff="openReport" data-v="' + esc(r.id) + '" data-tab="weight">' + esc(r.name) + '</button></td><td>' + esc(r.grade) +
          '</td><td><b>' + (r.weight === null ? '未測定' : esc(r.weight)) + '</b></td><td>' + fmt(r.diff) + '</td><td>' + fmt(r.diff4w) + '</td><td class="small">' + esc(r.date || '-') + '</td></tr>';
      }).join('') + '</table></div>' + (dates.length ? '' : '<p class="muted">体重の記録がありません。上の「取り込む」から体重管理表を取り込んでください。</p>') + '</div>';
    return html;
  }
};

// 操作の振り分け（InBody・体重タブ）
app.addEventListener('click', function (e) {
  var t = e.target.closest('[data-sb]');
  if (!t || S.view !== 'staff' || t.tagName === 'SELECT' || t.tagName === 'INPUT') return;
  var people = Staff.body ? StaffBody.people() : [], label = Staff.filter.grade || '全学年';
  switch (t.dataset.sb) {
    case 'doImport': StaffBody.doImport(); break;
    case 'xRankPdf': Export.rankingPdf(StaffBody.rankTitle, StaffBody.rankSub, StaffBody.rankRows); break;
    case 'xRankXlsx': Export.rankingExcel(StaffBody.rankTitle, StaffBody.rankRows); break;
    case 'xReportsPdf': Export.bulkDialog('inbody'); break;
    case 'xLatestXlsx': Export.excel('inbody_latest_' + Export.today() + '.xlsx', [{ name: 'InBody最新値', rows: Export.inbodyLatestRows(people) }]); break;
    case 'xWeightPdf': Export.weightTablePdf(StaffBody.weightDate, label + '・' + StaffBody.weightList.length + '人', StaffBody.weightList); break;
    case 'xWeightXlsx': Export.weightTableExcel(StaffBody.weightDate, StaffBody.weightList); break;
    case 'xWeightAllXlsx': Export.weightPivotExcel(people); break;
    case 'xWeightReportsPdf': Export.bulkDialog('weight'); break;
  }
});
app.addEventListener('change', function (e) {
  var t = e.target;
  if (S.view !== 'staff' || !t.dataset.sb) return;
  if (t.dataset.sb === 'file') return StaffBody.onFile(t);
  if (t.dataset.sb === 'importDate') StaffBody.importDate = t.value;
  if (t.dataset.sb === 'metric') StaffBody.metric = t.value;
  if (t.dataset.sb === 'rankDate') StaffBody.rankDate = t.value;
  if (t.dataset.sb === 'weightDate') StaffBody.weightDate = t.value;
  if (t.dataset.sb === 'weightSort') StaffBody.weightSort = t.value;
  StaffBody.render(StaffBody.kind);
});
