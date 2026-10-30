/**
 * staff.js ― スタッフ画面（Phase 3、3cでInBodyと体重を別タブに）
 * スタッフIDでログインすると、この画面になる。タブは3つ:
 *   実施状況 … 週ごとの選手一覧（未実施の選手が上）
 * 選手の名前を押すと、タブの外の「個人ページ」に移る（v37）。上から トレーニング記録 → コンディション記録 → フィジカルデータ（InBody／体重の切り替え）。
 *   「← 戻る」（またはブラウザの戻る）で、開く前の画面に戻る
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
    // 個人ページの印（ブラウザの履歴）が残っていたら消す（声の操作などで、個人ページから直接ほかの画面に移ったとき。v37）
    try { if (history.state && history.state.staffAthlete) history.replaceState(null, ''); } catch (e) {}
    Staff.page = Staff.tab;   // 今の画面（overview / inbody / weight / athlete）。音声の操作で使う（v35）
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
    html += '<div class="card"><div class="table-scroll"><table class="tbl"><tr><th>選手</th><th>Day</th><th>回数</th><th>上/下/全</th><th>疲労 全/上/下</th><th>動き</th><th>最終</th></tr>' +
      list.map(function (a) {
        var warn = a.sessions && !a.sets['下半身'] ? ' title="下半身のセットがありません"' : '';
        return '<tr class="' + (a.sessions ? '' : 'row-ng') + '"><td><button class="link" data-staff="athlete" data-v="' + esc(a.id) + '">' + esc(a.name) + '</button>' +
          '<div class="muted small">' + esc([a.grade, a.team].filter(String).join('・')) + '</div></td>' +
          '<td>' + (a.menuDays ? a.daysDone + '/' + a.menuDays : '-') + '</td>' +
          '<td>' + a.sessions + (a.freeSessions ? '<span class="muted small">（自' + a.freeSessions + '）</span>' : '') + '</td>' +
          '<td' + warn + '>' + a.sets['上半身'] + '/' + (a.sessions && !a.sets['下半身'] ? '<b class="ng-text">0</b>' : a.sets['下半身']) + '/' + a.sets['全身'] + '</td>' +
          '<td' + (a.cond && Math.max(a.cond.whole, a.cond.upper, a.cond.lower) >= 8 ? ' class="ng-text"' : '') + '>' + (a.cond ? a.cond.whole + '/' + a.cond.upper + '/' + a.cond.lower : '-') + '</td>' +
          '<td>' + (a.cond ? a.cond.perf : '-') + '</td>' +
          '<td class="small">' + esc(a.lastDate ? a.lastDate.slice(5).replace('-', '/') : '-') + '</td></tr>';
      }).join('') + '</table></div>' +
      '<p class="muted small">Day＝チームメニューの実施Day数／全Day数。回数＝その週のトレーニング回数（自＝自分のメニュー）。上/下/全＝部位ごとのセット数。疲労・動き＝その週でいちばん新しいコンディション（疲労は1 疲れていない〜10 とても疲れている、8以上は赤。動きは1 とても悪い〜10 とても良い）。</p></div>';
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

  // ---------------- 選手の個人ページ（v37：タブの外の独立したページ。「← 戻る」で元の画面へ） ----------------
  //   上から：トレーニング記録 → コンディション記録 → フィジカルデータ（InBody／体重を切り替え）
  //   開くときにブラウザの履歴にも1つ足すので、パソコンやスマホの「戻る」でも元の画面（同じタブ・同じスクロール位置）に戻る。
  physTab: 'inbody',   // フィジカルデータで表示しているほう（'inbody' / 'weight'）

  showAthlete: function (id) {
    if (Staff.page !== 'athlete') {   // 一覧などから開いたとき：戻る先を覚えておく
      Staff.returnTo = { tab: Staff.tab, scroll: window.scrollY || 0 };
      try { history.pushState({ staffAthlete: id }, ''); } catch (e) { /* 履歴に足せなくても、画面の「戻る」で戻れる */ }
    }
    Staff.page = 'athlete';
    var same = Staff.detail && Staff.detail.athlete.id === id;
    if (!same) Staff.physTab = 'inbody';
    app.innerHTML = Staff.athleteFrame('', '<div class="loading">読み込み中…</div>');
    window.scrollTo(0, 0);
    return Promise.all([Api.call('staffAthlete', { token: S.token, athleteId: id }), Staff.loadBody()]).then(function (r) {
      if (Staff.page !== 'athlete') return;   // 読み込みの間に戻ったとき
      Staff.detail = r[0];   // 開いている選手のデータ（音声の質問で使う。v35）
      var d = r[0], b = (Staff.body.athletes || []).filter(function (a) { return a.id === id; })[0] || { weight: [], inbody: [] };
      Staff.current = b.name ? b : { id: d.athlete.id, name: d.athlete.name, grade: d.athlete.grade, team: d.athlete.team, caption: '', weight: [], inbody: [], base: null };
      // コンディションのグラフ：同じ選手を開き直したとき（基準日の保存のあとなど）は、見ていた期間のままにする
      var keep = same ? { mode: CondChart.mode, offset: CondChart.offset } : null;
      CondChart.set(d.conditions || [], d.weekStart);
      if (keep) { CondChart.mode = keep.mode; CondChart.offset = keep.offset; }
      Staff.renderAthlete();
    }).catch(Staff.fail);
  },

  /** 個人ページの枠（上にタイトルと「← 戻る」。タブは出さない） */
  athleteFrame: function (title, inner) {
    return '<div class="group"><div class="topbar ath-top"><button class="btn ghost" data-staff="back">' + Icon('left', 20) + '戻る</button>' +
      '<span class="kicker">選手の個人ページ</span></div>' + (title || '') + '</div>' + inner;
  },

  /** 個人ページを描く（読み込んだデータ Staff.detail・Staff.current から。通信はしない） */
  renderAthlete: function () {
    var d = Staff.detail, a = d.athlete;
    var title = '<h1 class="ath-name">' + esc(a.name) + '</h1><p class="muted small">' + esc([a.grade, a.team ? a.team + 'チーム' : '', 'ID ' + a.id, a.menuId ? 'メニュー ' + a.menuId : ''].filter(String).join('・')) + '</p>' +
      '<nav class="ath-jump"><a href="#athTraining">トレーニング記録</a><a href="#athCondition">コンディション記録</a><a href="#athPhysical">フィジカルデータ</a></nav>';

    // 1. トレーニング記録（直近20回）。1行に1回、押すと種目とセットが開く
    var html = '<section class="sec" id="athTraining"><h2>トレーニング記録（直近' + d.sessions.length + '回）</h2>';
    if (!d.sessions.length) html += '<p class="muted">記録はまだありません。</p>';
    else html += '<div class="ath-sessions">' + d.sessions.map(function (s) {
      return '<details class="ath-session"><summary><span class="ath-date">' + esc(Number(s.date.slice(5, 7)) + '/' + Number(s.date.slice(8, 10))) + '</span>' +
        '<span class="ath-title">' + esc(s.type === 'チーム' ? 'Day' + s.day : '自分のメニュー' + (s.myMenu ? '「' + s.myMenu + '」' : '')) + (s.part ? '<span class="muted small">（' + esc(s.part) + '）</span>' : '') + '</span>' +
        '<span class="muted small">' + (s.records.length ? s.records.length + '種目' : '') + (s.minutes !== '' && s.minutes !== undefined ? '・' + esc(s.minutes) + '分' : '') + '</span></summary>' +
        '<table class="tbl">' + s.records.map(function (r) {
          return '<tr><td>' + esc(r.name) + (r.kind !== 'メニュー通り' ? ' <span class="tag off">' + esc(r.kind) + '</span>' : '') + '</td><td class="small">' + esc(r.sets) + '</td></tr>';
        }).join('') + '</table></details>';
    }).join('') + '</div>';
    // 選手が保存した自分のメニュー（見るだけ）
    var mm = d.myMenus || [];
    html += '<details class="ath-session ath-mymenu"><summary><span class="ath-title">保存している自分のメニュー（' + mm.length + '）</span></summary>' +
      (mm.length ? mm.map(function (m) {
        return '<div class="mm-staff"><b>' + esc(m.name) + '</b> <span class="muted small">更新 ' + esc(String(m.updated).slice(0, 10)) + '</span>' +
          '<table class="tbl">' + m.items.map(function (it) {
            return '<tr><td>' + esc(it.name) + '</td><td class="small">' + it.reps + '回 × ' + it.sets + 'セット' + (it.rest ? '・レスト' + it.rest + '秒' : '') + '</td></tr>';
          }).join('') + '</table></div>';
      }).join('') : '<p class="muted small">まだありません。</p>') + '</details></section>';

    // 2. コンディション記録（1週間の毎日／3か月の週平均。condchart.js）
    html += '<section class="sec" id="athCondition"><h2>コンディション記録</h2>' + CondChart.html() + '</section>';

    // 3. フィジカルデータ（InBody／体重を切り替え）
    html += '<section class="sec" id="athPhysical"><h2>フィジカルデータ</h2><div id="physBox">' + Staff.physHtml() + '</div></section>';
    app.innerHTML = Staff.athleteFrame(title, html);
  },

  /** フィジカルデータ（切り替えのタブ＋表示しているほうのレポートと保存ボタン） */
  physHtml: function () {
    var c = Staff.current, tab = Staff.physTab;
    var t = function (k, label) { return '<button class="tab' + (tab === k ? ' on' : '') + '" data-staff="phys" data-v="' + k + '">' + label + '</button>'; };
    var html = '<div class="tabs">' + t('inbody', 'InBody') + t('weight', '体重') + '</div>';
    if (tab === 'weight') {
      html += '<div class="row report-actions"><button class="btn sub" data-staff="xWeightPdf">📄 体重レポートをPDFで保存</button>' +
        '<button class="btn sub" data-staff="xReportXlsx">📊 InBody・体重の履歴をExcelで保存</button></div>' + Body.weightReportHtml(c);
    } else {
      html += '<div class="row report-actions"><button class="btn sub" data-staff="xInbodyPdf">📄 フィジカルレポートをPDFで保存</button>' +
        '<button class="btn sub" data-staff="xReportXlsx">📊 InBody・体重の履歴をExcelで保存</button></div>' + Body.physicalHtml(c) + BodyBase.athleteCard(c);
    }
    return html + '<p class="muted small">PDFは印刷画面が開くので「PDFとして保存」を選んでください（グラフの下に数値の表も付きます）。</p>';
  },

  /** フィジカルデータの InBody／体重を切り替える（その部分だけ描き直す） */
  setPhys: function (tab) {
    Staff.physTab = tab === 'weight' ? 'weight' : 'inbody';
    var box = document.getElementById('physBox');
    if (box) box.innerHTML = Staff.physHtml();
  },

  /** 「← 戻る」：ブラウザの履歴に足してあれば、ブラウザの戻ると同じ動きにする */
  back: function () {
    if (history.state && history.state.staffAthlete) history.back();   // → popstate で leaveAthlete
    else Staff.leaveAthlete();
  },

  /** 個人ページから、開く前の画面（タブ・スクロール位置）に戻る */
  leaveAthlete: function () {
    Body.closeHistory();
    var r = Staff.returnTo || { tab: Staff.tab, scroll: 0 };
    Staff.tab = r.tab;
    Staff.render();
    setTimeout(function () { window.scrollTo(0, r.scroll || 0); }, 0);
  },

  // ---------------- 体組成データの読み込み（InBody・体重タブで共通） ----------------
  loadBody: function (force) {
    if (Staff.body && !force) return Promise.resolve(Staff.body);
    return Api.call('staffBody', { token: S.token }).then(function (res) { Staff.body = res; if (res.chart) Body.chart = res.chart; return res; });
  },

  fail: function (err) {
    if (err.needLogin) { Store.remove('token'); S.token = null; renderLogin(err.message); return; }
    if (Staff.page === 'athlete') { app.innerHTML = Staff.athleteFrame('', msgHtml('error', err.message)); return; }   // 個人ページでは「← 戻る」を残す
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
    case 'back': Staff.back(); break;
    case 'phys': Staff.setPhys(v); break;
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

// ブラウザの「戻る」で個人ページから戻ったとき（v37）
window.addEventListener('popstate', function () {
  if (S.view === 'staff' && Staff.page === 'athlete') Staff.leaveAthlete();
});
