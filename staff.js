/**
 * staff.js ― スタッフ画面（Phase 3、3cでInBodyと体重を別タブに）
 * スタッフIDでログインすると、この画面になる。タブは3つ:
 *   実施状況 … 週ごとの選手一覧（未実施の選手が上）
 *   選手一覧 … 全選手を学年・ポジション・チームで絞り込み、学年別／ポジション別にまとめる（v46。staff_list.js）
 * 選手の名前を押すと、タブの外の「個人ページ」に移る（v37）。上から トレーニング記録 → コンディション記録 → フィジカルデータ（最新の値）。
 * 個人ページの「フィジカルレポート」から、別のページ「フィジカルレポート」（InBody／体重の切り替え）に移る（v38）。
 *   「← 戻る」（またはブラウザの戻る）で、開く前の画面に戻る
 *   InBody   … 体組成Excel（InBody結果）の取り込み、FFMI・除脂肪体重などのランキング、レポートのPDF（staff_body.js）
 * 実施状況のいちばん下の「部員名簿から選手を取り込む」で、別のページ（roster.js）に移る（v44）
 * v53：管理者（役職が「管理者」）には「ログインの管理」も出る（このファイルの後半の Admin）
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
    var tabs = [['overview', '実施状況'], ['list', '選手一覧'], ['inbody', 'InBody'], ['weight', '体重']];   // 選手一覧は v46（staff_list.js）
    return '<div class="group"><div class="topbar"><h1>スタッフ画面</h1><button class="btn ghost" data-act="logout">ログアウト</button></div>' +
      '<p class="muted small">' + esc(Staff.name) + 'さん　<span class="ver">' + esc(APP_VERSION) + '</span></p><div class="tabs">' +
      tabs.map(function (t) { return '<button class="tab' + (Staff.tab === t[0] ? ' on' : '') + '" data-staff="tab" data-v="' + t[0] + '">' + t[1] + '</button>'; }).join('') +
      '</div></div>' + inner;
  },

  render: function () {
    S.view = 'staff';
    // 個人ページの印（ブラウザの履歴）が残っていたら消す（声の操作などで、個人ページから直接ほかの画面に移ったとき。v37）
    try { if (history.state && (history.state.staffAthlete || history.state.staffReport || history.state.staffRoster || history.state.staffMenuImport || history.state.staffGuide)) history.replaceState(null, ''); } catch (e) {}
    Staff.page = Staff.tab;   // 今の画面（overview / inbody / weight / athlete）。音声の操作で使う（v35）
    if (Staff.tab === 'overview') return Staff.renderOverview();
    if (Staff.tab === 'list') return StaffList.render();
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
    // 選手の管理（v44：部員名簿から選手を追加・更新。roster.js）
    html += '<div class="card"><h2>選手の管理</h2><p class="muted small">チームのホームページの部員名簿と比べて、新しい選手・スタッフ（学生コーチ・トレーナー・アナリスト・指導陣）の追加や、ポジション・ふりがななどの更新ができます。反映する前に確認できます。</p>' +
      '<button class="btn sub block" data-staff="roster">部員名簿から選手を取り込む</button></div>';
    // メニューの管理（v50：毎月のメニュー表（PDF）を取り込む。menu_import.js）
    html += '<div class="card"><h2>メニューの管理</h2><p class="muted small">毎月のメニュー表（Excel から作ったPDF）を読み取って、メニューに足します。開始日から、そのチームの選手を新しいメニューに切り替えられます。</p>' +
      '<button class="btn sub block" data-staff="menuImport">メニュー表（PDF）を取り込む</button></div>';
    // 使い方（v52：アプリの中で読む。guidebook.js）
    html += '<div class="card"><h2>使い方</h2><p class="muted small">スタッフ画面の使い方と、選手に配る案内です。</p><div class="row">' +
      '<button class="btn sub" data-staff="guide" data-v="staff">' + Icon('book', 18) + 'スタッフ向け</button>' +
      '<button class="btn sub" data-staff="guide" data-v="athlete">' + Icon('book', 18) + '選手向け（配る用）</button></div></div>';   // v52：アプリの中の使い方（guidebook.js）
    // ログインの管理（v53：管理者だけ。このファイルの後半の Admin）
    if (o.admin) html += '<div class="card"><h2>ログインの管理（管理者）</h2><p class="muted small">スマホ・タブレット・PCで、それぞれ何台ログインしているかを確かめられます。知らない端末はログアウトさせられます。ログインの失敗の記録も見られます。</p>' +
      '<button class="btn sub block" data-staff="admin">' + Icon('phone', 18) + 'ログインしている端末を見る</button></div>';
    app.innerHTML = Staff.frame(html);
  },

  select: function (key, label, values) {
    return '<select class="sel" data-staff="filter" data-k="' + key + '"><option value="">' + label + '：すべて</option>' +
      values.filter(String).map(function (v) { return '<option' + (Staff.filter[key] === v ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('') + '</select>';
  },

  // ---------------- 選手の個人ページ（v37：タブの外の独立したページ。「← 戻る」で元の画面へ） ----------------
  //   上から：トレーニング記録 → コンディション記録 → フィジカルデータ（最新の値と、フィジカルレポートのページへのボタン）
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
  athleteFrame: function (title, inner, kicker) {
    return '<div class="group"><div class="topbar ath-top"><button class="btn ghost" data-staff="back">' + Icon('left', 20) + '戻る</button>' +
      '<span class="kicker">' + (kicker || '選手の個人ページ') + '</span></div>' + (title || '') + '</div>' + inner;
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

    // 3. フィジカルデータ（v38：最新の値だけ。くわしいレポートは別のページ「フィジカルレポート」で見る）
    html += '<section class="sec" id="athPhysical"><h2>フィジカルデータ</h2>' + Staff.physSummary() + '</section>';
    app.innerHTML = Staff.athleteFrame(title, html);
  },

  /** 個人ページのフィジカルデータ：InBody と体重の最新の値と、フィジカルレポートを開くボタン（v38） */
  physSummary: function () {
    var c = Staff.current, ib = c.inbody || [], L = ib[ib.length - 1], P = ib[ib.length - 2];
    var ws = Body.weightStats(c.weight || []);
    var d = function (v, p) { var a = Body.num(v), b = p ? Body.num(p) : null; return a !== null && b !== null ? ' <span class="muted small">' + Body.diffText(a - b) + '</span>' : ''; };
    var row = function (label, v, unit, p) { return '<tr><td>' + label + '</td><td class="r"><b>' + Body.f1(v) + '</b>' + unit + (P ? d(v, p) : '') + '</td></tr>'; };
    var html = '<table class="line-table"><tbody>';
    if (L) {
      html += '<tr><td colspan="2" class="muted small">InBody　' + esc(Body.dLong(L.date)) + ' 測定' + (P ? '（右の▲▼は前回 ' + esc(Body.dShort(P.date)) + ' との差）' : '') + '</td></tr>' +
        row('体重', L.weight, 'kg', P && P.weight) + row('体脂肪率', L.fat, '%', P && P.fat) + row('除脂肪体重', L.lbm, 'kg', P && P.lbm) +
        row('FFMI', L.ffmi, '', P && P.ffmi) + (L.rank ? '<tr><td>FFMIの同日順位</td><td class="r"><b>' + L.rank + '位</b> / ' + L.rankOf + '人</td></tr>' : '');
    } else html += '<tr><td colspan="2" class="muted">InBodyの記録はまだありません。</td></tr>';
    var wk = Body.weightWeekStats(c.weight || []);
    if (wk) html += '<tr><td>体重（週平均）</td><td class="r"><b>' + wk.week.value.toFixed(1) + '</b>kg' + (wk.prevWeek ? ' <span class="muted small">' + Body.diffText(wk.week.value - wk.prevWeek.value) + '</span>' : '') +
      '<div class="muted small">' + esc(Body.weekLabel(wk.week)) + '（' + wk.week.n + '回）' + (wk.prevWeek ? '・▲▼は前の週との差' : '') + '</div></td></tr>';
    if (ws) html += '<tr><td>体重（最新）</td><td class="r"><b>' + ws.last.value.toFixed(1) + '</b>kg' + (ws.prev ? ' <span class="muted small">' + Body.diffText(ws.last.value - ws.prev.value) + '</span>' : '') +
      '<div class="muted small">' + esc(Body.dShort(ws.last.date)) + ' 測定</div></td></tr>';
    else html += '<tr><td colspan="2" class="muted">体重の記録はまだありません。</td></tr>';
    return html + '</tbody></table><div class="row"><button class="btn btn-pill" data-staff="report" data-v="inbody">' + Icon('right', 18) + 'フィジカルレポート（InBody）</button>' +
      '<button class="btn sub btn-pill" data-staff="report" data-v="weight">' + Icon('right', 18) + '体重レポート</button></div>';
  },

  // ---------------- フィジカルレポート（v38：個人ページとは別のページ。InBody／体重を切り替え） ----------------
  //   個人ページの「フィジカルレポート」から開く。「← 戻る」（またはブラウザの戻る）で個人ページの同じ位置に戻る
  showReport: function (tab) {
    if (!Staff.current) return;
    Staff.reportFrom = 'athlete';   // 戻る先は個人ページ
    if (Staff.page !== 'report') {
      Staff.reportReturnScroll = window.scrollY || 0;
      try { history.pushState({ staffReport: Staff.current.id }, ''); } catch (e) {}
    }
    Staff.page = 'report';
    Staff.physTab = tab === 'weight' ? 'weight' : 'inbody';
    Staff.renderReport();
    window.scrollTo(0, 0);
  },

  /**
   * 一覧（InBody・体重タブ）や声から、選手のフィジカルレポートを直接開く（v39）。戻る先は開く前の画面（タブ・スクロール位置）
   *   id: 選手ID / tab: 'inbody'（フィジカルレポート）または 'weight'（体重レポート）
   */
  openReport: function (id, tab) {
    if (Staff.page === 'athlete' && Staff.current && Staff.current.id === id) return Staff.showReport(tab);   // 同じ選手の個人ページからなら、個人ページに戻れるように
    var fromList = Staff.page !== 'athlete' && Staff.page !== 'report';
    if (fromList) Staff.returnTo = { tab: Staff.tab, scroll: window.scrollY || 0 };
    try { if (fromList) history.pushState({ staffReport: id }, ''); else history.replaceState({ staffReport: id }, ''); } catch (e) {}
    Staff.page = 'report';
    Staff.reportFrom = 'list';
    Staff.physTab = tab === 'weight' ? 'weight' : 'inbody';
    app.innerHTML = Staff.athleteFrame('', '<div class="loading">読み込み中…</div>', 'フィジカルレポート');
    window.scrollTo(0, 0);
    return Staff.loadBody().then(function (b) {
      if (Staff.page !== 'report') return;
      var a = (b.athletes || []).filter(function (x) { return x.id === id; })[0];
      if (!a) throw new Error('選手が見つかりません。');
      Staff.current = a;
      Staff.renderReport();
    }).catch(Staff.fail);
  },

  renderReport: function () {
    var c = Staff.current;
    var title = '<h1 class="ath-name">' + esc(c.name) + '</h1><p class="muted small">' + esc(c.caption || [c.grade, c.team ? c.team + 'チーム' : ''].filter(String).join('・')) + '</p>';
    app.innerHTML = Staff.athleteFrame(title, '<div id="physBox">' + Staff.physHtml() + '</div>', 'フィジカルレポート');
  },

  /** 基準日を保存したあと：体組成データを読み直してから、フィジカルレポートを描き直す（body_base.js から呼ぶ） */
  refreshReport: function (id) {
    var b = (Staff.body.athletes || []).filter(function (a) { return a.id === id; })[0];
    if (b) Staff.current = b;
    if (Staff.page === 'report') Staff.renderReport();
  },

  /** フィジカルデータ（切り替えのタブ＋表示しているほうのレポートと保存ボタン） */
  physHtml: function () {
    var c = Staff.current, tab = Staff.physTab;
    var t = function (k, label) { return '<button class="tab' + (tab === k ? ' on' : '') + '" data-staff="phys" data-v="' + k + '">' + label + '</button>'; };
    var html = '<div class="tabs">' + t('inbody', 'InBody') + t('weight', '体重') + '</div>';
    if (tab === 'weight') {
      html += '<div class="row report-actions"><button class="btn sub" data-staff="xWeightPdf">' + Icon('file', 18) + '体重レポートをPDFで保存</button>' +
        '<button class="btn sub" data-staff="xReportXlsx">' + Icon('sheet', 18) + 'InBody・体重の履歴をExcelで保存</button></div>' + Body.weightReportHtml(c);
    } else {
      html += '<div class="row report-actions"><button class="btn sub" data-staff="xInbodyPdf">' + Icon('file', 18) + 'フィジカルレポートをPDFで保存</button>' +
        '<button class="btn sub" data-staff="xReportXlsx">' + Icon('sheet', 18) + 'InBody・体重の履歴をExcelで保存</button></div>' + Body.physicalHtml(c) + BodyBase.athleteCard(c);
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
    var st = history.state || {};
    if (Staff.page === 'roster') { Roster.back(); return; }   // 部員名簿の取り込み（v44）
    if (Staff.page === 'menuImport') { MenuImport.back(); return; }
    if (Staff.page === 'admin') { Admin.back(); return; }   // ログインの管理（v53）
    if (Staff.page === 'guide') { Guidebook.back(); return; }   // 使い方（v52）   // メニュー表の取り込み（v50）
    if (Staff.page === 'report') { if (st.staffReport) history.back(); else Staff.leaveReportPage(); return; }   // → popstate で leaveReportPage
    if (st.staffAthlete) history.back();   // → popstate で leaveAthlete
    else Staff.leaveAthlete();
  },

  /** フィジカルレポートから個人ページ（同じスクロール位置）に戻る（通信はしない） */
  /** フィジカルレポートから戻る：個人ページから開いたなら個人ページへ、一覧（InBody・体重タブ）や声から開いたなら元の一覧へ（v39） */
  leaveReportPage: function () {
    if (Staff.reportFrom === 'list') Staff.leaveAthlete(); else Staff.leaveReport();
  },

  leaveReport: function () {
    Body.closeHistory();
    Staff.page = 'athlete';
    Staff.renderAthlete();
    var y = Staff.reportReturnScroll || 0;
    setTimeout(function () { window.scrollTo(0, y); }, 0);
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
    return Api.call('staffBody', { token: S.token }).then(function (res) { Staff.body = res; if (res.chart) Body.chart = res.chart; if (res.weekStart) Body.weekStart = res.weekStart; return res; });
  },

  fail: function (err) {
    if (err.needLogin) { Store.remove('token'); S.token = null; renderLogin(err.message); return; }
    if (Staff.page === 'athlete' || Staff.page === 'report') { app.innerHTML = Staff.athleteFrame('', msgHtml('error', err.message)); return; }   // 個人ページでは「← 戻る」を残す
    app.innerHTML = Staff.frame(msgHtml('error', err.message) + '<button class="btn block" data-staff="reload">もう一度読み込む</button>');
  }
};

function uniq(arr) { var o = []; arr.forEach(function (v) { if (o.indexOf(v) < 0) o.push(v); }); return o; }

// スタッフ画面の操作の振り分け
app.addEventListener('click', function (e) {
  var t = e.target.closest('[data-staff]');
  if (!t || S.view !== 'staff' || t.tagName === 'SELECT' || t.tagName === 'INPUT') return;
  var v = t.dataset.v;
  // v53b：別のファイルの画面が読み込めていないときは、何も起きないのではなく理由を出す（GitHub に入れ忘れたときなど）
  var need = { roster: ['Roster', 'roster.js'], menuImport: ['MenuImport', 'menu_import.js'], guide: ['Guidebook', 'guidebook.js'] }[t.dataset.staff];
  if (need && typeof window[need[0]] === 'undefined') {
    var box = t.parentNode.querySelector('.msg') || null;
    if (!box) t.insertAdjacentHTML('afterend', msgHtml('error', 'この画面のファイル（' + need[1] + '）が読み込めていません。GitHub のリポジトリに「' + need[1] + '」があるか確かめてください。入れたばかりなら、1〜2分待ってから開き直してください。'));
    return;
  }
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
    case 'report': Staff.showReport(v); break;
    case 'openReport': Staff.openReport(v, t.dataset.tab); break;   // InBody・体重タブの選手名（v39）
    // ---- PDF・Excelでの保存（export.js）。InBody・体重タブのボタンは staff_body.js ----
    case 'xOverviewXlsx': Export.overviewExcel(Staff.overview, Staff.overviewList); break;
    case 'xOverviewPdf': Export.overviewPdf(Staff.overview, Staff.overviewList); break;
    case 'xInbodyPdf': Export.reportPdf(Staff.current, 'inbody'); break;
    case 'xWeightPdf': Export.reportPdf(Staff.current, 'weight'); break;
    case 'xReportXlsx': Export.reportExcel(Staff.current); break;
    case 'roster': Roster.open(); break;
    case 'menuImport': MenuImport.open(); break;
    case 'admin': Admin.show('accounts'); break;   // ログインの管理（v53）
    case 'guide': Guidebook.showStaff(v); break;   // 使い方（v52。guidebook.js）   // メニュー表の取り込み（v50。menu_import.js）   // 部員名簿から取り込む（v44。roster.js）
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
  if (S.view !== 'staff') return;
  if (Staff.page === 'roster') Roster.leave();
  else if (Staff.page === 'menuImport') MenuImport.leave();
  else if (Staff.page === 'guide') Staff.leaveAthlete();
  else if (Staff.page === 'admin') Admin.leave();   // v53
  else if (Staff.page === 'report') Staff.leaveReportPage();
  else if (Staff.page === 'athlete') Staff.leaveAthlete();
});

/**
 * ===== v53：管理者だけのページ「ログインの管理」（v53。スタッフ画面の中の1ページ。Staff.page = 'admin'）
 *
 *   管理者＝スタッフマスタの「役職」が「管理者」の人。実施状況のいちばん下にカードが出る（声「ログインの管理を開いて」）
 *   タブ：
 *     ・アカウント別 … 今ログインしている端末の台数（スマホ・タブレット・PC）。多い人を上に。
 *                      名前を押すと端末の一覧（OS・ブラウザ・ログインした日時・最後に使った日時）
 *                      「この端末をログアウト」「全部ログアウト」（2回押すと実行）
 *     ・ログインの記録 … 成功・失敗・ログアウトの記録（新しい順）。「失敗だけ」で絞り込める
 *   データは Apps Script の adminSessions・adminLogout・adminLog（管理者.gs）
 */
var Admin = {
  tab: 'accounts',
  data: null,       // adminSessions の結果
  log: null,        // adminLog の結果
  open: {},         // 端末の一覧を開いている人（id → true）
  armed: '',        // 1回目を押したボタン（もう一度押すと実行）
  onlyFail: false,
  onlyWarn: false,
  msg: '',

  show: function (tab) {
    if (S.view !== 'staff') return;
    if (Staff.page !== 'admin') {
      Staff.returnTo = { tab: Staff.tab, scroll: window.scrollY || 0 };
      try { history.pushState({ staffAdmin: 1 }, ''); } catch (e) { /* 「戻る」ボタンでも戻れる */ }
    }
    Staff.page = 'admin';
    if (tab) Admin.tab = tab;
    Admin.msg = ''; Admin.armed = '';
    Admin.render();
    window.scrollTo(0, 0);
    Admin.load();
  },
  load: function () {
    var p = Admin.tab === 'log'
      ? Api.call('adminLog', { token: S.token, limit: 300 }).then(function (res) { Admin.log = res; })
      : Api.call('adminSessions', { token: S.token }).then(function (res) { Admin.data = res; });
    return p.then(function () { if (Staff.page === 'admin') Admin.render(); })
      .catch(function (err) { Admin.msg = msgHtml('error', err.message); if (Staff.page === 'admin') Admin.render(); });
  },
  back: function () { var st = history.state || {}; if (st.staffAdmin) history.back(); else Admin.leave(); },
  leave: function () { Staff.leaveAthlete(); },

  render: function () {
    var tab = function (k, label) { return '<button class="tab' + (Admin.tab === k ? ' on' : '') + '" data-adm="tab" data-v="' + k + '">' + label + '</button>'; };
    var head = '<h1 class="ath-name">ログインの管理</h1>' +
      '<p class="muted small">今ログインしている端末の台数と、ログインの記録を確かめられます。知らない端末があれば、ログアウトさせてPINを変えてもらってください。</p>' +
      '<div class="tabs">' + tab('accounts', 'アカウント別') + tab('log', 'ログインの記録') + '</div>';
    var html = Admin.msg ? '<div class="card">' + Admin.msg + '</div>' : '';
    html += Admin.tab === 'log' ? Admin.logHtml() : Admin.accountsHtml();
    app.innerHTML = Staff.athleteFrame(head, html, '管理者');
  },

  // ---------------- アカウント別 ----------------
  accountsHtml: function () {
    var d = Admin.data;
    if (!d) return '<div class="card"><p class="muted">読み込んでいます…</p></div>';
    var t = d.total, warnAt = d.warnAt || 3;
    var sum = t['スマホ'] + t['タブレット'] + t['PC'] + t['不明'];
    var html = '<div class="card"><h2>いまログイン中</h2><div class="adm-sum">' +
      Admin.stat('phone', 'スマホ', t['スマホ']) + Admin.stat('tablet', 'タブレット', t['タブレット']) + Admin.stat('monitor', 'PC', t['PC']) +
      (t['不明'] ? Admin.stat('question', '不明', t['不明']) : '') + '</div>' +
      '<p class="muted small">' + d.accounts.length + '人・合計' + sum + '台。最近7日のログインの失敗：' +
      (d.fails7 ? '<b class="ng-text">' + d.fails7 + '回</b>（「ログインの記録」で確かめる）' : '0回') + '</p>' +
      (t['不明'] ? '<p class="muted small">「不明」は v53 より前にログインした端末です。ログインし直すと種類が分かります。</p>' : '') + '</div>';
    var list = d.accounts.filter(function (a) { return !Admin.onlyWarn || a.total >= warnAt; });
    html += '<div class="card"><div class="row adm-tools"><h2>アカウントごとの台数</h2>' +
      '<label class="adm-check"><input type="checkbox" data-adm="onlyWarn"' + (Admin.onlyWarn ? ' checked' : '') + '>' + warnAt + '台以上だけ</label>' +
      '<button class="btn sub small" data-adm="reload">' + Icon('refresh', 16) + '読み直す</button></div>';
    if (!list.length) return html + '<p class="muted">' + (Admin.onlyWarn ? warnAt + '台以上でログインしている人はいません。' : 'ログインしている人はいません。') + '</p></div>';
    // 表ではなく、1人1行の並び（端末の一覧を開いても横にはみ出さないように）
    html += '<div class="adm-list"><div class="adm-acc adm-head"><span>名前</span><span>スマホ</span><span>タブ<br>レット</span><span>PC</span><span>計</span></div>' +
      list.map(function (a) {
        var warn = a.total >= warnAt, c = a.counts, n = function (v) { return v ? String(v) : '<span class="muted">0</span>'; };
        return '<div class="adm-acc' + (warn ? ' adm-warn' : '') + '"><span><button class="link" data-adm="toggle" data-v="' + esc(a.id) + '">' + esc(a.name) + '</button>' +
          '<span class="muted small adm-sub">' + esc([a.role === 'staff' ? 'スタッフ' : '選手', a.sub, a.id, a.active ? '' : '在籍なし'].filter(String).join('・')) + '</span></span>' +
          '<span>' + n(c['スマホ']) + '</span><span>' + n(c['タブレット']) + '</span><span>' + n(c['PC']) + (c['不明'] ? '<span class="muted small adm-sub">不明' + c['不明'] + '</span>' : '') + '</span>' +
          '<span><b' + (warn ? ' class="ng-text"' : '') + '>' + a.total + '</b></span></div>' +
          (Admin.open[a.id] ? '<div class="adm-detail">' + Admin.devicesHtml(a) + '</div>' : '');
      }).join('') + '</div>' +
      '<p class="muted small">名前を押すと、端末の一覧が出ます。' + warnAt + '台以上は赤（台数は設定シートの「端末の台数の注意」で変えられます）。同じスマホでも、Safari と「ホーム画面に追加」から開いたアプリは別の1台として数えます。</p></div>';
    return html;
  },
  stat: function (icon, label, v) {
    return '<div class="adm-stat">' + Icon(icon, 22) + '<span class="adm-stat-n">' + v + '</span><span class="muted small">' + label + '</span></div>';
  },
  devicesHtml: function (a) {
    var arm = function (key, label, cls) {
      var on = Admin.armed === key;
      return '<button class="btn small ' + (on ? 'danger' : 'sub') + (cls || '') + '" data-adm="logout" data-v="' + esc(key) + '">' + (on ? 'もう一度押すとログアウト' : label) + '</button>';
    };
    var typeIcon = { 'スマホ': 'phone', 'タブレット': 'tablet', 'PC': 'monitor' };
    return '<ul class="adm-devs">' + a.devices.map(function (d) {
      return '<li>' + Icon(typeIcon[d.type] || 'question', 20) + '<div class="adm-dev-txt"><b>' + esc(d.type) + '</b>' +
        (d.os || d.br ? '　' + esc([d.os, d.br].filter(String).join('・')) : '') + (d.mine ? '<span class="chip done">この端末</span>' : '') +
        '<div class="muted small">ログイン ' + esc(d.at || '不明') + '<br>最後に使った ' + esc(d.last || '不明') + '</div>' +
        (d.mine ? '' : '<div class="adm-dev-btn">' + arm('h:' + d.handle, 'この端末をログアウト') + '</div>') + '</div></li>';
    }).join('') + '</ul>' + (a.devices.length > 1 || !a.devices[0].mine ? '<div class="row">' + arm('id:' + a.id, 'この人の端末を全部ログアウト') + '</div>' : '');
  },

  logout: function (key) {
    if (Admin.armed !== key) { Admin.armed = key; Admin.render(); return; }   // 1回目：確認のボタンにする
    Admin.armed = '';
    var data = { token: S.token };
    if (key.indexOf('h:') === 0) data.handle = key.slice(2); else data.id = key.slice(3);
    Api.call('adminLogout', data).then(function (res) {
      Admin.msg = msgHtml('ok', res.message);
      return Admin.load();
    }).catch(function (err) { Admin.msg = msgHtml('error', err.message); Admin.render(); });
  },

  // ---------------- ログインの記録 ----------------
  logHtml: function () {
    var L = Admin.log;
    if (!L) return '<div class="card"><p class="muted">読み込んでいます…</p></div>';
    var isFail = function (r) { return /ちがい|無い|ロック/.test(r.result); };
    var rows = L.rows.filter(function (r) { return !Admin.onlyFail || isFail(r); });
    var html = '<div class="card"><div class="row adm-tools"><h2>ログインの記録</h2>' +
      '<label class="adm-check"><input type="checkbox" data-adm="onlyFail"' + (Admin.onlyFail ? ' checked' : '') + '>失敗だけ</label>' +
      '<button class="btn sub small" data-adm="reload">' + Icon('refresh', 16) + '読み直す</button></div>';
    if (!rows.length) return html + '<p class="muted">' + (Admin.onlyFail ? 'ログインの失敗はありません。' : 'まだ記録がありません（v53 から記録します）。') + '</p></div>';
    html += '<div class="table-scroll"><table class="tbl adm-tbl"><tr><th>日時</th><th>だれ</th><th>結果</th><th>端末</th></tr>' +
      rows.map(function (r) {
        return '<tr class="' + (isFail(r) ? 'adm-warn' : '') + '"><td class="small">' + esc(r.time.slice(5).replace('-', '/')) + '</td>' +
          '<td>' + esc(r.name || '（不明）') + '<div class="muted small">' + esc(r.id) + '</div></td>' +
          '<td' + (isFail(r) ? ' class="ng-text"' : '') + '>' + esc(r.result) + (r.memo ? '<div class="muted small">' + esc(r.memo) + '</div>' : '') + '</td>' +
          '<td class="small">' + esc(r.type) + '<div class="muted small">' + esc([r.os, r.br].filter(String).join('・')) + '</div></td></tr>';
      }).join('') + '</table></div>' +
      '<p class="muted small">新しい順に最大300件。全部はスプレッドシートの「ログインの記録」シートにあります。「IDが無い」＝存在しないIDでのログイン、「PINちがい」＝PINの間違い、「ロック中」＝間違えすぎて止められている間のログイン。同じIDで失敗が続いているときは要注意です。</p></div>';
    return html;
  },

  /** 声：「ログインの管理を開いて」「何台でログインしてる？」「ログインの失敗を見せて」。返事の文（関係ない言葉なら null）。staff_voice.js から呼ぶ */
  voice: function (t) {
    t = String(t || '');
    if (!/端末|台数|不正|ログインの(管理|記録|履歴|失敗)|ログイン(して|中)/.test(t)) return null;
    if (!Staff.overview || !Staff.overview.admin) return 'ログインの管理は、管理者だけが使えます。';
    var log = /記録|履歴|失敗/.test(t);
    Admin.onlyFail = /失敗/.test(t);
    Admin.show(log ? 'log' : 'accounts');
    return log ? 'ログインの記録を開きました。' + (Admin.onlyFail ? '失敗だけを出しています。' : '') : 'ログインの管理を開きました。アカウントごとの、スマホ・タブレット・PCの台数です。';
  }
};

document.addEventListener('click', function (e) {
  var t = e.target.closest('[data-adm]');
  if (!t || S.view !== 'staff' || Staff.page !== 'admin') return;
  var k = t.dataset.adm, v = t.dataset.v;
  if (k === 'tab') { Admin.tab = v; Admin.armed = ''; Admin.msg = ''; Admin.render(); Admin.load(); }
  else if (k === 'toggle') { Admin.open[v] = !Admin.open[v]; Admin.armed = ''; Admin.render(); }
  else if (k === 'logout') Admin.logout(v);
  else if (k === 'reload') { Admin.msg = ''; Admin.load(); }
});
document.addEventListener('change', function (e) {
  var t = e.target;
  if (!t.dataset || S.view !== 'staff' || Staff.page !== 'admin') return;
  if (t.dataset.adm === 'onlyFail') { Admin.onlyFail = t.checked; Admin.render(); }
  if (t.dataset.adm === 'onlyWarn') { Admin.onlyWarn = t.checked; Admin.render(); }
});
