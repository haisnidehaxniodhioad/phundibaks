/**
 * staff.js ― スタッフ画面（Phase 3）
 * スタッフIDでログインすると、この画面になる。タブは3つ:
 *   実施状況 … 週ごとの選手一覧（未実施の選手が上）。名前を押すとその選手の記録と体組成レポート
 *   体組成   … 除脂肪体重・FFMIのランキング（学年・測定日で絞り込み）
 *   取り込み … 体重管理表・体組成Excelの取り込み
 */
var Staff = {
  tab: 'overview', week: null, overview: null, body: null, filter: { team: '', grade: '' }, parsed: null, fileName: '',

  start: function (name) {
    S.view = 'staff';
    Staff.name = name || Staff.name || '';
    Staff.render();
  },

  frame: function (inner) {
    var tabs = [['overview', '実施状況'], ['body', '体組成'], ['import', '取り込み']];
    return '<div class="topbar"><h1>スタッフ画面</h1><button class="btn ghost" data-act="logout">ログアウト</button></div>' +
      '<p class="muted small">' + esc(Staff.name) + 'さん</p><div class="tabs">' +
      tabs.map(function (t) { return '<button class="tab' + (Staff.tab === t[0] ? ' on' : '') + '" data-staff="tab" data-v="' + t[0] + '">' + t[1] + '</button>'; }).join('') +
      '</div>' + inner;
  },

  render: function () {
    S.view = 'staff';
    if (Staff.tab === 'overview') return Staff.renderOverview();
    if (Staff.tab === 'body') return Staff.renderBody();
    return Staff.renderImport();
  },

  // ---------------- 実施状況 ----------------
  renderOverview: function () {
    if (!Staff.overview) {
      app.innerHTML = Staff.frame('<div class="loading">集計中…</div>');
      Api.call('staffOverview', { token: S.token, weekStart: Staff.week }).then(function (res) { Staff.overview = res; Staff.renderOverview(); })
        .catch(Staff.fail);
      return;
    }
    var o = Staff.overview, f = Staff.filter;
    var teams = uniq(o.athletes.map(function (a) { return a.team; })), grades = uniq(o.athletes.map(function (a) { return a.grade; }));
    var list = o.athletes.filter(function (a) { return (!f.team || a.team === f.team) && (!f.grade || a.grade === f.grade); });
    // 未実施 → 実施が少ない順 → 名前順
    list.sort(function (a, b) { return a.sessions - b.sessions || a.daysDone - b.daysDone || String(a.name).localeCompare(b.name, 'ja'); });
    var notDone = list.filter(function (a) { return !a.sessions; }).length;

    var html = '<div class="card"><div class="row"><button class="btn ghost" data-staff="week" data-v="-7">◀ 前の週</button>' +
      '<b>' + esc(o.weekStart.slice(5).replace('-', '/')) + '〜' + esc(o.weekEnd.slice(5).replace('-', '/')) + '</b>' +
      '<button class="btn ghost" data-staff="week" data-v="7">次の週 ▶</button></div>' +
      '<div class="row">' + Staff.select('team', 'チーム', teams) + Staff.select('grade', '学年', grades) + '</div>' +
      '<p class="small">表示 ' + list.length + '人 ／ <b class="ng-text">未実施 ' + notDone + '人</b></p>' +
      '<div class="row"><button class="btn sub" data-staff="xOverviewXlsx">Excelで保存</button><button class="btn sub" data-staff="xOverviewPdf">PDFで保存</button></div></div>';
    Staff.overviewList = list;
    html += '<div class="card"><div class="table-scroll"><table class="tbl"><tr><th>選手</th><th>Day</th><th>回数</th><th>上/下/全</th><th>sRPE</th><th>負荷</th><th>最終</th></tr>' +
      list.map(function (a) {
        var warn = a.sessions && !a.sets['下半身'] ? ' title="下半身のセットがありません"' : '';
        return '<tr class="' + (a.sessions ? '' : 'row-ng') + '"><td><button class="link" data-staff="athlete" data-v="' + esc(a.id) + '">' + esc(a.name) + '</button>' +
          '<div class="muted small">' + esc([a.grade, a.team].filter(String).join('・')) + '</div></td>' +
          '<td>' + (a.menuDays ? a.daysDone + '/' + a.menuDays : '-') + '</td>' +
          '<td>' + a.sessions + (a.freeSessions ? '<span class="muted small">（自' + a.freeSessions + '）</span>' : '') + '</td>' +
          '<td' + warn + '>' + a.sets['上半身'] + '/' + (a.sessions && !a.sets['下半身'] ? '<b class="ng-text">0</b>' : a.sets['下半身']) + '/' + a.sets['全身'] + '</td>' +
          '<td>' + (a.srpeAvg === '' ? '-' : a.srpeAvg) + '</td><td>' + (a.load || '-') + '</td>' +
          '<td class="small">' + esc(a.lastDate ? a.lastDate.slice(5).replace('-', '/') : '-') + '</td></tr>';
      }).join('') + '</table></div>' +
      '<p class="muted small">Day＝チームメニューの実施Day数／全Day数。回数＝その週のトレーニング回数（自＝自分のメニュー）。上/下/全＝部位ごとのセット数。負荷＝sRPE×時間(分)の合計。</p></div>';
    if (o.unregistered.length) {
      html += '<div class="card"><h2>種目マスタに無い種目</h2><p class="muted small">種目マスタに追加するか、既存の種目の「呼び方の候補」に入れると、部位の集計に入ります。</p>' +
        o.unregistered.map(function (u) { return '<span class="chip">' + esc(u.name) + '（' + u.count + '）</span>'; }).join(' ') + '</div>';
    }
    app.innerHTML = Staff.frame(html);
  },

  select: function (key, label, values) {
    return '<select class="sel" data-staff="filter" data-k="' + key + '"><option value="">' + label + '：すべて</option>' +
      values.filter(String).map(function (v) { return '<option' + (Staff.filter[key] === v ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('') + '</select>';
  },

  // ---------------- 選手詳細 ----------------
  showAthlete: function (id) {
    app.innerHTML = Staff.frame('<div class="loading">読み込み中…</div>');
    Promise.all([Api.call('staffAthlete', { token: S.token, athleteId: id }), Staff.loadBody()]).then(function (r) {
      var d = r[0], b = (Staff.body.athletes || []).filter(function (a) { return a.id === id; })[0] || { weight: [], inbody: [] };
      var html = '<button class="btn ghost" data-staff="back">← 一覧へ</button><div class="card"><h2>' + esc(d.athlete.name) + '</h2>' +
        '<p class="muted small">' + esc([d.athlete.id, d.athlete.grade, d.athlete.team, d.athlete.menuId].filter(String).join('・')) + '</p></div>';
      html += '<h2>トレーニング記録（直近' + d.sessions.length + '回）</h2>';
      if (!d.sessions.length) html += '<div class="card"><p class="muted">記録はまだありません。</p></div>';
      d.sessions.forEach(function (s) {
        html += '<details class="card"><summary><b>' + esc(s.date) + '</b> ' + esc(s.type === 'チーム' ? 'Day' + s.day : '自分のメニュー') +
          (s.part ? '（' + esc(s.part) + '）' : '') + ' <span class="muted small">sRPE ' + esc(s.srpe || '-') + '・' + esc(s.minutes) + '分</span></summary>' +
          '<table class="tbl">' + s.records.map(function (r) {
            return '<tr><td>' + esc(r.name) + (r.kind !== 'メニュー通り' ? '<span class="badge off">' + esc(r.kind) + '</span>' : '') + '</td><td class="small">' + esc(r.sets) + '</td></tr>';
          }).join('') + '</table></details>';
      });
      Staff.current = b.name ? b : { id: d.athlete.id, name: d.athlete.name, grade: d.athlete.grade, team: d.athlete.team, weight: [], inbody: [] };
      html += '<h2>体組成レポート</h2><div class="row"><button class="btn sub" data-staff="xReportPdf">PDFで保存</button>' +
        '<button class="btn sub" data-staff="xReportXlsx">Excelで保存</button></div>' + Body.reportHtml(b);
      app.innerHTML = Staff.frame(html);
    }).catch(Staff.fail);
  },

  // ---------------- 体組成（ランキング） ----------------
  loadBody: function (force) {
    if (Staff.body && !force) return Promise.resolve(Staff.body);
    return Api.call('staffBody', { token: S.token }).then(function (res) { Staff.body = res; return res; });
  },

  renderBody: function () {
    if (!Staff.body) {
      app.innerHTML = Staff.frame('<div class="loading">読み込み中…</div>');
      Staff.loadBody().then(Staff.renderBody).catch(Staff.fail);
      return;
    }
    var f = Staff.filter, metric = Staff.metric || 'ffmi', date = Staff.rankDate || '';
    var people = Staff.body.athletes.filter(function (a) { return a.active && (!f.grade || a.grade === f.grade) && (!f.team || a.team === f.team); });
    var dates = uniq([].concat.apply([], Staff.body.athletes.map(function (a) { return a.inbody.map(function (r) { return r.date; }); }))).sort().reverse();
    // 指定日以前のいちばん新しいInBody（日付を空にすると最新）
    var rows = people.map(function (a) {
      var list = a.inbody.filter(function (r) { return r[metric] !== '' && (!date || r.date <= date); });
      var r = list[list.length - 1];
      return r ? { id: a.id, name: a.name, grade: a.grade, value: r[metric], date: r.date } : null;
    }).filter(Boolean).sort(function (x, y) { return y.value - x.value; });
    var html = '<div class="card"><div class="row">' +
      '<select class="sel" data-staff="metric"><option value="ffmi"' + (metric === 'ffmi' ? ' selected' : '') + '>FFMI</option><option value="lbm"' + (metric === 'lbm' ? ' selected' : '') + '>除脂肪体重</option>' +
      '<option value="weight"' + (metric === 'weight' ? ' selected' : '') + '>体重（InBody）</option><option value="fat"' + (metric === 'fat' ? ' selected' : '') + '>体脂肪率</option></select>' +
      '<select class="sel" data-staff="rankDate"><option value="">最新の記録</option>' + dates.map(function (d) { return '<option' + (d === date ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select>' +
      Staff.select('grade', '学年', uniq(Staff.body.athletes.map(function (a) { return a.grade; }))) + '</div>' +
      '<p class="muted small">測定日を選ぶと、その日以前のいちばん新しい記録で並べます。選手名を押すと個別のレポートを表示します。</p>' +
      '<div class="row"><button class="btn sub" data-staff="xRankXlsx">ランキングをExcel</button><button class="btn sub" data-staff="xRankPdf">ランキングをPDF</button></div>' +
      '<div class="row"><button class="btn sub" data-staff="xReportsPdf">表示中の選手のレポートをまとめてPDF（1人1ページ）</button>' +
      '<button class="btn sub" data-staff="xLatestXlsx">表示中の選手の最新値をExcel</button></div></div>';
    var labels = { ffmi: 'FFMI', lbm: '除脂肪体重', weight: '体重', fat: '体脂肪率' };
    Staff.rankTitle = labels[metric] + (f.grade ? '_' + f.grade : '') + (date ? '_' + date + '以前' : '');
    Staff.rankSub = (f.grade ? f.grade + '・' : '全学年・') + (date ? date + '以前の最新の記録' : '最新の記録') + '・' + rows.length + '人';
    Staff.rankRows = rows.map(function (r, i) { return { rank: i > 0 && rows[i - 1].value === r.value ? '' : i + 1, id: r.id, name: r.name, grade: r.grade, value: r.value, date: r.date }; });
    Staff.rankPeople = people;
    html += '<div class="card"><table class="tbl"><tr><th>順位</th><th>選手</th><th>学年</th><th>値</th><th>測定日</th></tr>' +
      rows.map(function (r, i) {
        var rank = i > 0 && rows[i - 1].value === r.value ? '' : (i + 1);
        return '<tr><td>' + rank + '</td><td><button class="link" data-staff="athlete" data-v="' + esc(r.id) + '">' + esc(r.name) + '</button></td><td>' + esc(r.grade) + '</td><td><b>' + esc(r.value) + '</b></td><td class="small">' + esc(r.date) + '</td></tr>';
      }).join('') + '</table>' + (rows.length ? '' : '<p class="muted">InBodyの記録がありません。「取り込み」タブから取り込んでください。</p>') + '</div>';
    app.innerHTML = Staff.frame(html);
  },

  // ---------------- 取り込み ----------------
  renderImport: function (result) {
    var p = Staff.parsed;
    var html = '<div class="card"><h2>Excelの取り込み</h2><p class="muted small">「体重管理表」か「体組成Excel」を選ぶと、自動で種類を判定して読み取ります。ファイルはこの端末の中で読むだけで、保存はしません。</p>' +
      '<input type="file" id="xlsFile" accept=".xlsx,.xls" data-staff="file"></div>';
    if (result) html += '<div class="msg ok">' + esc(result) + '</div>';
    if (p) {
      var roster = Staff.body ? Staff.body.athletes.map(function (a) { return String(a.name).normalize('NFKC').replace(/\s/g, ''); }) : null;
      var date = Staff.importDate || '';
      var target = p.records.filter(function (r) { return !date || r.date === date; });
      var names = uniq(target.map(function (r) { return r.name; }));
      var unknown = roster ? names.filter(function (n) { return roster.indexOf(String(n).normalize('NFKC').replace(/\s/g, '')) < 0; }) : [];
      html += '<div class="card"><h2>' + esc(Staff.fileName) + '</h2><p>種類：<b>' + (p.kind === 'inbody' ? '体組成（InBody）' : '体重') + '</b>　測定日：' + p.dates.length + '日分</p>' +
        '<label>取り込む測定日（ふつうは「すべての日付」のままでよい）</label><select class="sel" data-staff="importDate"><option value="">すべての日付（' + p.dates.length + '日分）</option>' +
        p.dates.slice().reverse().map(function (d) { return '<option' + (d === date ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select>' +
        '<p>取り込み対象：<b>' + target.length + '件</b>（' + names.length + '人）</p>' +
        (unknown.length ? '<div class="msg warn">選手マスタに無い名前（取り込まれません）：' + esc(unknown.join('、')) + '</div>' : '') +
        (p.warnings.length ? '<details class="msg warn"><summary>注意 ' + p.warnings.length + '件（範囲外の値・表記ゆれなど）</summary><div class="small">' +
          p.warnings.slice(0, 200).map(esc).join('<br>') + '</div></details>' : '') +
        '<button class="btn block big" data-staff="doImport"' + (target.length ? '' : ' disabled') + '>この内容で取り込む</button></div>';
    }
    app.innerHTML = Staff.frame(html);
  },

  onFile: function (input) {
    var file = input.files && input.files[0];
    if (!file) return;
    Staff.fileName = file.name; Staff.importDate = '';
    app.innerHTML = Staff.frame('<div class="loading">読み取り中…</div>');
    Promise.all([Importer.readFile(file), Staff.loadBody()]).then(function (r) {
      Staff.parsed = Importer.parse(r[0]);
      Staff.importDate = '';   // 既定は「すべての日付」（Excelに入っている日付をまとめて記録する。同じ選手・同じ日は上書き）
      Staff.renderImport();
    }).catch(Staff.fail);
  },

  doImport: function () {
    var p = Staff.parsed, date = Staff.importDate || '';
    var rows = p.records.filter(function (r) { return !date || r.date === date; });
    if (!confirm((date || 'すべての日付') + ' の ' + rows.length + '件を取り込みます。同じ選手・同じ日の記録は上書きされます。よろしいですか？')) return;
    app.innerHTML = Staff.frame('<div class="loading">取り込み中…（件数が多いと数十秒かかります）</div>');
    Api.call('importBody', { token: S.token, kind: p.kind, fileName: Staff.fileName, rows: rows }).then(function (res) {
      Staff.body = null; Staff.parsed = null;
      Staff.renderImport('取り込みました：追加 ' + res.added + '件、上書き ' + res.updated + '件' +
        (res.skipped ? '、範囲外でスキップ ' + res.skipped + '件' : '') +
        (res.unknown.length ? '。選手マスタに無い名前：' + res.unknown.join('、') : '') +
        (res.duplicated.length ? '。同姓同名のため取り込めなかった名前：' + res.duplicated.join('、') : ''));
    }).catch(Staff.fail);
  },

  fail: function (err) {
    if (err.needLogin) { Store.remove('token'); S.token = null; renderLogin(err.message); return; }
    app.innerHTML = Staff.frame(msgHtml('error', err.message) + '<button class="btn block" data-staff="reload">もう一度読み込む</button>');
  }
};

function uniq(arr) { var o = []; arr.forEach(function (v) { if (o.indexOf(v) < 0) o.push(v); }); return o; }

// スタッフ画面の操作の振り分け
app.addEventListener('click', function (e) {
  var t = e.target.closest('[data-staff]');
  if (!t || S.view !== 'staff' || t.tagName === 'SELECT' || t.tagName === 'INPUT') return;
  var v = t.dataset.v;
  switch (t.dataset.staff) {
    case 'tab': Staff.tab = v; Staff.render(); break;
    case 'week':
      var base = new Date((Staff.overview ? Staff.overview.weekStart : new Date().toISOString().slice(0, 10)).replace(/-/g, '/'));
      base.setDate(base.getDate() + Number(v));
      Staff.week = base.getFullYear() + '-' + ('0' + (base.getMonth() + 1)).slice(-2) + '-' + ('0' + base.getDate()).slice(-2);
      Staff.overview = null; Staff.renderOverview(); break;
    case 'athlete': Staff.showAthlete(v); break;
    case 'back': Staff.render(); break;
    case 'doImport': Staff.doImport(); break;
    // ---- PDF・Excelでの保存（export.js） ----
    case 'xOverviewXlsx': Export.overviewExcel(Staff.overview, Staff.overviewList); break;
    case 'xOverviewPdf': Export.overviewPdf(Staff.overview, Staff.overviewList); break;
    case 'xReportPdf': Export.reportPdf(Staff.current); break;
    case 'xReportXlsx': Export.reportExcel(Staff.current); break;
    case 'xRankXlsx': Export.rankingExcel(Staff.rankTitle, Staff.rankRows); break;
    case 'xRankPdf': Export.rankingPdf(Staff.rankTitle.replace(/_/g, ' '), Staff.rankSub, Staff.rankRows); break;
    case 'xReportsPdf': Export.reportsPdf(Staff.rankPeople, Staff.filter.grade || '全学年'); break;
    case 'xLatestXlsx': Export.excel('body_latest_' + Export.today() + '.xlsx',
                          [{ name: '最新値', rows: Export.latestRows(Staff.rankPeople) }]); break;
    case 'reload': Staff.overview = null; Staff.body = null; Staff.render(); break;
  }
});
app.addEventListener('change', function (e) {
  var t = e.target;
  if (S.view !== 'staff' || !t.dataset.staff) return;
  if (t.dataset.staff === 'filter') { Staff.filter[t.dataset.k] = t.value; Staff.render(); }
  if (t.dataset.staff === 'metric') { Staff.metric = t.value; Staff.renderBody(); }
  if (t.dataset.staff === 'rankDate') { Staff.rankDate = t.value; Staff.renderBody(); }
  if (t.dataset.staff === 'importDate') { Staff.importDate = t.value; Staff.renderImport(); }
  if (t.dataset.staff === 'file') Staff.onFile(t);
});
