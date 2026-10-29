/**
 * staff.js ― スタッフ画面（Phase 3、3cでInBodyと体重を別タブに）
 * スタッフIDでログインすると、この画面になる。タブは3つ:
 *   実施状況 … 週ごとの選手一覧（未実施の選手が上）。名前を押すとその選手の記録と、InBody・体重のレポート
 *   InBody   … 体組成Excel（InBody結果）の取り込み、FFMI・除脂肪体重などのランキング、レポートのPDF（staff_body.js）
 *   体重     … 体重管理表の取り込み、測定日ごとの体重一覧（未測定・前回比・4週前比）、体重レポートのPDF（staff_body.js）
 */
var Staff = {
  tab: 'overview', week: null, overview: null, body: null, filter: { team: '', grade: '' }, parsed: null, fileName: '',

  start: function (name) {
    S.view = 'staff';
    Staff.name = name || Staff.name || '';
    Staff.render();
  },

  frame: function (inner) {
    var tabs = [['overview', '実施状況'], ['inbody', 'InBody'], ['weight', '体重']];
    return '<div class="group"><div class="topbar"><h1>スタッフ画面</h1><button class="btn ghost" data-act="logout">ログアウト</button></div>' +
      '<p class="muted small">' + esc(Staff.name) + 'さん　<span class="ver">' + esc(APP_VERSION) + '</span></p><div class="tabs">' +
      tabs.map(function (t) { return '<button class="tab' + (Staff.tab === t[0] ? ' on' : '') + '" data-staff="tab" data-v="' + t[0] + '">' + t[1] + '</button>'; }).join('') +
      '</div></div>' + inner;
  },

  render: function () {
    S.view = 'staff';
    if (Staff.tab === 'overview') return Staff.renderOverview();
    return StaffBody.render(Staff.tab === 'weight' ? 'weight' : 'inbody');
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
        html += '<details class="card"><summary><b>' + esc(s.date) + '</b> ' + esc(s.type === 'チーム' ? 'Day' + s.day : '自分のメニュー' + (s.myMenu ? '「' + s.myMenu + '」' : '')) +
          (s.part ? '（' + esc(s.part) + '）' : '') + ' <span class="muted small">sRPE ' + esc(s.srpe || '-') + '・' + esc(s.minutes) + '分</span></summary>' +
          '<table class="tbl">' + s.records.map(function (r) {
            return '<tr><td>' + esc(r.name) + (r.kind !== 'メニュー通り' ? '<span class="badge off">' + esc(r.kind) + '</span>' : '') + '</td><td class="small">' + esc(r.sets) + '</td></tr>';
          }).join('') + '</table></details>';
      });
      // 選手が保存した自分のメニュー（Phase 3f。見るだけ）
      var mm = d.myMenus || [];
      html += '<details class="card"><summary><b>保存している自分のメニュー（' + mm.length + '）</b></summary>' +
        (mm.length ? mm.map(function (m) {
          return '<div class="mm-staff"><b>' + esc(m.name) + '</b> <span class="muted small">更新 ' + esc(String(m.updated).slice(0, 10)) + '</span>' +
            '<table class="tbl">' + m.items.map(function (it) {
              return '<tr><td>' + esc(it.name) + '</td><td class="small">' + it.reps + '回 × ' + it.sets + 'セット' + (it.rest ? '・レスト' + it.rest + '秒' : '') + '</td></tr>';
            }).join('') + '</table></div>';
        }).join('') : '<p class="muted small">まだありません。</p>') + '</details>';
      Staff.current = b.name ? b : { id: d.athlete.id, name: d.athlete.name, grade: d.athlete.grade, team: d.athlete.team, caption: '', weight: [], inbody: [], base: null };
      html += '<div class="row report-actions"><button class="btn sub" data-staff="xInbodyPdf">📄 フィジカルレポートをPDFで保存</button>' +
        '<button class="btn sub" data-staff="xReportXlsx">📊 InBody・体重の履歴をExcelで保存</button></div>' + Body.physicalHtml(Staff.current) + BodyBase.athleteCard(Staff.current);
      html += '<div class="row report-actions"><button class="btn sub" data-staff="xWeightPdf">📄 体重レポートをPDFで保存</button></div>' + Body.weightReportHtml(Staff.current);
      html += '<p class="muted small">PDFは印刷画面が開くので「PDFとして保存」を選んでください（グラフの下に数値の表も付きます）。</p>';
      app.innerHTML = Staff.frame(html);
    }).catch(Staff.fail);
  },

  // ---------------- 体組成データの読み込み（InBody・体重タブで共通） ----------------
  loadBody: function (force) {
    if (Staff.body && !force) return Promise.resolve(Staff.body);
    return Api.call('staffBody', { token: S.token }).then(function (res) { Staff.body = res; if (res.chart) Body.chart = res.chart; return res; });
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
    // ---- PDF・Excelでの保存（export.js）。InBody・体重タブのボタンは staff_body.js ----
    case 'xOverviewXlsx': Export.overviewExcel(Staff.overview, Staff.overviewList); break;
    case 'xOverviewPdf': Export.overviewPdf(Staff.overview, Staff.overviewList); break;
    case 'xInbodyPdf': Export.reportPdf(Staff.current, 'inbody'); break;
    case 'xWeightPdf': Export.reportPdf(Staff.current, 'weight'); break;
    case 'xReportXlsx': Export.reportExcel(Staff.current); break;
    case 'reload': Staff.overview = null; Staff.body = null; Staff.render(); break;
  }
});
app.addEventListener('change', function (e) {
  var t = e.target;
  if (S.view !== 'staff' || !t.dataset.staff) return;
  if (t.dataset.staff === 'filter') { Staff.filter[t.dataset.k] = t.value; Staff.render(); }
});
