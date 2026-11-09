/**
 * staff.js ― スタッフ画面（Phase 3、3cでInBodyと体重を別タブに）
 * スタッフIDでログインすると、この画面になる。タブは3つ:
 *   実施状況 … 週ごとの選手一覧（未実施の選手が上）
 *   選手一覧 … 全選手を学年・ポジション・チームで絞り込み、学年別／ポジション別にまとめる（v46。staff_list.js）
 * v60（RIKKIO 段階2）：4つのカテゴリー ダッシュボード（overview）・選手管理（list）・データ分析（inbody／weight）・管理・設定（manage）。
 *   PC は左のサイドバー、スマホは下のナビ（dock.js）。管理・設定は Staff.tab＝'manage'（Staff.render で Staff.page も 'manage'）。
 *   管理・設定から開いた各ページの「戻る」は、開いたときのタブ（Staff.returnTo）＝管理・設定に戻る。
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

  // ---- v60：4つのカテゴリー（PC＝左のサイドバー、スマホ＝下のナビ。どちらも navHtml） ----
  //   ダッシュボード＝tab 'overview'、選手管理＝'list'、データ分析＝'inbody'・'weight'、管理・設定＝'manage'（Staff.page も 'manage'。新しいページは作らない）
  NAV: [['overview', 'ダッシュボード', 'house'], ['list', '選手管理', 'person'], ['data', 'データ分析', 'sheet'], ['manage', '管理・設定', 'book']],
  /** 今のカテゴリー（個人ページなどでは、開く前のタブ） */
  navKey: function () { return Staff.tab === 'inbody' || Staff.tab === 'weight' ? 'data' : Staff.tab; },
  navHtml: function (cls) {
    var on = Staff.navKey();
    return '<nav class="staff-nav ' + cls + '" aria-label="スタッフ画面の切り替え">' + Staff.NAV.map(function (n) {
      return '<button class="staff-nav-item' + (on === n[0] ? ' on' : '') + '" data-staffnav="' + n[0] + '"' + (on === n[0] ? ' aria-current="page"' : '') + '>' +
        Icon(n[2], 22) + '<span>' + n[1] + '</span></button>';
    }).join('') + '</nav>';
  },
  /** PC の左のサイドバー（スマホでは CSS で隠す） */
  sideHtml: function () {
    return '<aside class="staff-side"><div class="staff-brand">' + esc(BRAND) + '</div>' + Staff.navHtml('staff-nav-side') +
      '<div class="staff-side-foot"><span class="small">' + esc(Staff.name) + 'さん</span><button class="btn ghost small" data-act="logout">ログアウト</button></div></aside>';
  },
  /** カテゴリーを切り替える（データ分析は、前に見ていた InBody／体重のほう） */
  go: function (key) {
    if (S.view !== 'staff') return;
    Body.closeHistory();
    Staff.tab = key === 'data' ? (Staff.tab === 'weight' || Staff.lastData === 'weight' ? 'weight' : 'inbody') : key;
    Staff.render();
    window.scrollTo(0, 0);
  },

  frame: function (inner) {
    var key = Staff.navKey(), title = { overview: 'ダッシュボード', list: '選手管理', data: 'データ分析', manage: '管理・設定' }[key] || 'スタッフ画面';
    // データ分析の中だけ、InBody／体重の切り替え（今までのタブと同じ data-staff="tab"）
    var sub = key === 'data' ? '<div class="tabs">' + [['inbody', 'InBody'], ['weight', '体重']].map(function (t) {
      return '<button class="tab' + (Staff.tab === t[0] ? ' on' : '') + '" data-staff="tab" data-v="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' : '';
    return Staff.sideHtml() + '<div class="group"><div class="topbar"><h1>' + title + '</h1><button class="btn ghost staff-logout" data-act="logout">ログアウト</button></div>' +
      '<p class="muted small">' + esc(Staff.name) + 'さん　<span class="ver">' + esc(APP_VERSION) + '</span></p>' + sub + '</div>' + inner;
  },

  // ---- v60：管理・設定（今ある管理のページへの入り口をまとめた一覧。権限は実施状況のデータ columnEditor・admin で今までどおり） ----
  renderManage: function () {
    if (!Staff.overview) {
      app.innerHTML = Staff.frame('<div class="loading">読み込み中…</div>');
      Api.call('staffOverview', { token: S.token, weekStart: Staff.week }).then(function (res) { Staff.overview = res; if (Staff.tab === 'manage' && Staff.page === 'manage') Staff.renderManage(); })
        .catch(Staff.fail);
      return;
    }
    var o = Staff.overview;
    var item = function (act, v, icon, title, text) {
      return '<button class="manage-item" data-staff="' + act + '"' + (v ? ' data-v="' + v + '"' : '') + '>' + Icon(icon, 24) +
        '<span class="manage-text"><b>' + title + '</b><span class="small muted">' + text + '</span></span>' + Icon('right', 18) + '</button>';
    };
    var html = '<div class="manage-list">' +
      item('roster', '', 'person', '選手の登録・取り込み', 'チームのホームページの部員名簿と比べて、選手・スタッフを追加・更新します') +
      item('menuImport', '', 'file', 'メニューの管理', '毎月のメニュー表（PDF）の取り込みと、今あるメニューの中身') +
      item('bodyImport', 'inbody', 'download', '体組成（InBody）の取り込み', '体組成Excel（InBody結果）を取り込みます（データ分析のInBodyが開きます）') +
      item('bodyImport', 'weight', 'download', '体重の取り込み', '体重管理表を取り込みます（データ分析の体重が開きます）') +
      (o.columnEditor ? item('columns', '', 'book', 'お知らせ・コラムの管理', 'お知らせ・用語の説明などのコラムを追加・修正します（管理者・トレーナー）') : '') +
      (o.admin ? item('admin', '', 'phone', 'ログインの管理', 'ログインしている端末とログインの記録（管理者）') : '') +
      item('guide', 'staff', 'book', '使い方（スタッフ向け）', 'スタッフ画面の使い方') +
      item('guide', 'athlete', 'book', '使い方（選手向け・配る用）', '選手に配る案内') +
      '</div>' + (o.columnEditor ? Staff.quitHtml() + Staff.gradHtml() + Staff.addStaffHtml() : '');
    app.innerHTML = Staff.frame(html);
    if (o.columnEditor) { Staff.quitFill(); Staff.gradFill(); }
  },

  // ---- v72：選手を選んで「退部」にする（アカウントの停止）・在籍に戻す（管理者・トレーナーの画面だけ） ----
  //   選手マスタの「在籍」に「退部」と書く（今ある rosterApply の update。Apps Script は変えていない）。
  //   在籍でない人はログインできない（使っている端末も、次に操作したときにログイン画面に戻る）。記録は消さない。
  //   戻すときは同じく update で「在籍」を TRUE にする（卒業・退部・FALSE のどれで外れた人も戻せる）
  quit: { mode: 'quit', q: '', msg: '', busy: false },
  quitHtml: function () {
    var Q = Staff.quit, msg = Q.msg; Q.msg = '';
    var tab = function (k, label) { return '<button class="tab' + (Q.mode === k ? ' on' : '') + '" data-staff="quitMode" data-v="' + k + '">' + label + '</button>'; };
    return '<details class="card quit-card"' + (msg || Q.open ? ' open' : '') + '><summary><b>' + Icon('person', 18) + ' 退部の手続き（アカウントの停止）</b></summary>' +
      '<p class="muted small">選手を選んで「退部」にします。その選手はログインできなくなり、選手の一覧・ダッシュボードの人数から外れます。<b>記録は消えません</b>。間違えたときは「在籍に戻す」で戻せます。管理者・トレーナーだけが使えます。</p>' +
      (msg || '') + '<div class="tabs quit-tabs">' + tab('quit', '退部にする') + tab('back', '在籍に戻す') + '</div>' +
      '<input class="sel quit-search" type="search" id="quitSearch" placeholder="名前・ふりがなで探す" value="' + esc(Q.q) + '" autocomplete="off">' +
      '<div id="quitList"><div class="loading">読み込み中…</div></div></details>';
  },
  /** 一覧に出す選手（退部にする＝在籍中の人、在籍に戻す＝在籍でない人）。学年（4年→1年）→ ふりがなの順 */
  quitTargets: function () {
    var Q = Staff.quit, q = VoiceParser.norm(Q.q);
    var gnum = function (a) { var m = /(\d)/.exec(a.grade || ''); return m ? Number(m[1]) : 0; };
    return (Staff.body ? Staff.body.athletes : []).filter(function (a) {
      if (Q.mode === 'quit' ? !a.active : a.active) return false;
      return !q || VoiceParser.norm(a.name).indexOf(q) >= 0 || VoiceParser.norm(a.kana).indexOf(q) >= 0;
    }).sort(function (x, y) { return gnum(y) - gnum(x) || String(x.kana || x.name).localeCompare(String(y.kana || y.name), 'ja'); });
  },
  quitPicked: {},
  quitFill: function () {
    Staff.loadBody().then(function () {
      var box = document.getElementById('quitList');
      if (!box || Staff.page !== 'manage') return;
      var Q = Staff.quit, list = Staff.quitTargets();
      if (!list.length) { box.innerHTML = '<p class="muted">' + (Q.q ? '当てはまる選手がいません。' : Q.mode === 'quit' ? '在籍中の選手がいません。' : '在籍でない選手はいません。') + '</p>'; Staff.quitCount(); return; }
      box.innerHTML = '<ul class="grad-list quit-list">' + list.map(function (a) {
        return '<li><label class="check-line"><input type="checkbox" data-quit="pick" value="' + esc(a.id) + '"' + (Staff.quitPicked[a.id] ? ' checked' : '') + '> ' + esc(a.name) +
          ' <span class="muted small">' + esc([a.grade || (a.enrollYear ? a.enrollYear + '年度入学' : ''), a.position, a.team ? a.team + 'チーム' : ''].filter(String).join('・')) + '</span></label></li>';
      }).join('') + '</ul><p class="small" id="quitCount"></p>' +
        '<button class="btn block' + (Q.mode === 'quit' ? ' quit-danger' : '') + '" data-staff="quitApply"></button>';
      Staff.quitCount();
    }).catch(function (err) {
      var box = document.getElementById('quitList');
      if (box) box.innerHTML = msgHtml('error', err.message);
    });
  },
  /** 選んだ選手（探す文字を変えても、選んだままにする） */
  quitIds: function () { return Object.keys(Staff.quitPicked); },
  quitCount: function () {
    var Q = Staff.quit, ids = Staff.quitIds(), n = ids.length, btn = document.querySelector('[data-staff="quitApply"]'), c = document.getElementById('quitCount');
    var names = (Staff.body ? Staff.body.athletes : []).filter(function (a) { return Staff.quitPicked[a.id]; }).map(function (a) { return a.name; });
    if (c) c.textContent = n ? '選んだ選手：' + names.join('、') : '選手を選んでください（何人でも選べます）';
    if (btn && !Q.busy) { btn.textContent = n ? (Q.mode === 'quit' ? '選んだ' + n + '人を退部にする' : '選んだ' + n + '人を在籍に戻す') : '選手を選んでください'; btn.disabled = !n; }
  },
  quitApply: function () {
    var Q = Staff.quit;
    if (Q.busy) return;
    var ids = Staff.quitIds();
    if (!ids.length) return;
    var names = (Staff.body ? Staff.body.athletes : []).filter(function (a) { return Staff.quitPicked[a.id]; }).map(function (a) { return a.name; });
    var quit = Q.mode === 'quit';
    if (!confirm((quit ? ids.length + '人（' + names.slice(0, 5).join('、') + (names.length > 5 ? ' ほか' : '') + '）を退部にします。\nログインできなくなり、選手の一覧・ダッシュボードの人数から外れます。記録は消えません。'
                       : ids.length + '人（' + names.slice(0, 5).join('、') + (names.length > 5 ? ' ほか' : '') + '）を在籍に戻します。\nもう一度ログインできるようになります。') + '\nよろしいですか？')) return;
    Q.busy = true;
    var btn = document.querySelector('[data-staff="quitApply"]');
    if (btn) { btn.disabled = true; btn.textContent = quit ? '退部にしています…' : '在籍に戻しています…'; }
    Api.call('rosterApply', { token: S.token, update: ids.map(function (id) { return { id: id, changes: { '在籍': quit ? '退部' : true } }; }) }).then(function (res) {
      Q.busy = false; Staff.quitPicked = {}; Q.open = true;
      Q.msg = msgHtml('ok', (res.updated || 0) + '人を' + (quit ? '退部にしました（' + names.join('、') + '）。記録はそのまま残っています。' : '在籍に戻しました（' + names.join('、') + '）。もう一度ログインできます。'));
      Staff.body = null; Staff.overview = null;   // 選手の一覧・人数を読み直す
      if (Staff.tab === 'manage' && Staff.page === 'manage') Staff.renderManage();
    }).catch(function (err) {
      Q.busy = false;
      if (err.needLogin) return Staff.fail(err);
      Staff.quitCount();
      var box = document.getElementById('quitList'), old = box && box.querySelector('.msg');
      if (old) old.remove();
      if (box) box.insertAdjacentHTML('afterbegin', msgHtml('error', err.message));
    });
  },

  // ---- v70：4年生（卒業する学年）の選手の在籍を外す（管理者・トレーナーの画面だけ） ----
  //   「在籍」を FALSE にするだけ（トレーニング記録・体組成・コンディションは消さない。スプレッドシートで TRUE にすれば戻る）。
  //   保存は今ある rosterApply に retire（選手IDの一覧）だけを送る（名簿.gs。Apps Script は変えていない。選手マスタは学年・ふりがなの順に並べ直される）
  //   対象：在籍中で、学年が「4年」の選手。年度が変わったあと（入学年度から数えて5年目以上で学年が空になった選手）も出す
  gradMsg: '', gradBusy: false, gradList: null,
  gradHtml: function () {
    var msg = Staff.gradMsg; Staff.gradMsg = '';
    return '<details class="card grad-card"' + (msg ? ' open' : '') + '><summary><b>' + Icon('person', 18) + ' 4年生（卒業する選手）の在籍を外す</b></summary>' +
      '<p class="muted small">チェックした選手の「在籍」を外します。ログイン・選手の一覧・ダッシュボードの人数から外れます。<b>トレーニング記録・体組成・コンディションは消えません</b>（スプレッドシートの選手マスタで「在籍」を TRUE にすると戻ります）。管理者・トレーナーだけが使えます。</p>' +
      (msg || '') + '<div id="gradList"><div class="loading">読み込み中…</div></div></details>';
  },
  /** 対象の選手を選ぶ一覧（体組成のデータ staffBody の学年・入学年度を使う） */
  gradTargets: function () {
    var now = new Date(), fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;   // 年度（4月始まり。名簿.gs の currentFiscalYear_ と同じ）
    return (Staff.body ? Staff.body.athletes : []).filter(function (a) {
      if (!a.active) return false;
      if (String(a.grade) === '4年') return true;
      return !a.grade && a.enrollYear && fy - Number(a.enrollYear) + 1 >= 5;   // 年度が変わって学年が空になった人
    }).map(function (a) {
      return { id: a.id, name: a.name, kana: a.kana, team: a.team, label: a.grade || (Number(a.enrollYear) + '年度入学') };
    }).sort(function (x, y) { return String(x.kana || x.name).localeCompare(String(y.kana || y.name), 'ja'); });
  },
  gradFill: function () {
    Staff.loadBody().then(function () {
      var box = document.getElementById('gradList');
      if (!box || Staff.page !== 'manage') return;
      var list = Staff.gradList = Staff.gradTargets();
      if (!list.length) { box.innerHTML = '<p class="muted">在籍中の4年生の選手はいません。</p>'; return; }
      box.innerHTML = '<label class="check-line small"><input type="checkbox" data-grad="all" checked> 全員を選ぶ（' + list.length + '人）</label>' +
        '<ul class="grad-list">' + list.map(function (a) {
          return '<li><label class="check-line"><input type="checkbox" data-grad="pick" value="' + esc(a.id) + '" checked> ' + esc(a.name) +
            ' <span class="muted small">' + esc([a.label, a.team ? a.team + 'チーム' : ''].filter(String).join('・')) + '</span></label></li>';
        }).join('') + '</ul>' +
        '<button class="btn block grad-btn" data-staff="gradApply"></button>';
      Staff.gradCount();
    }).catch(function (err) {
      var box = document.getElementById('gradList');
      if (box) box.innerHTML = msgHtml('error', err.message);
    });
  },
  gradPicked: function () {
    return Array.prototype.map.call(document.querySelectorAll('[data-grad="pick"]:checked'), function (c) { return c.value; });
  },
  gradCount: function () {
    var n = Staff.gradPicked().length, btn = document.querySelector('[data-staff="gradApply"]'), all = document.querySelector('[data-grad="all"]');
    if (btn && !Staff.gradBusy) { btn.textContent = n ? 'チェックした' + n + '人の在籍を外す' : '選手を選んでください'; btn.disabled = !n; }
    if (all) all.checked = n > 0 && n === document.querySelectorAll('[data-grad="pick"]').length;
  },
  gradApply: function () {
    if (Staff.gradBusy) return;
    var ids = Staff.gradPicked();
    if (!ids.length) return;
    var names = (Staff.gradList || []).filter(function (a) { return ids.indexOf(a.id) >= 0; }).map(function (a) { return a.name; });
    if (!confirm(ids.length + '人（' + names.slice(0, 5).join('、') + (names.length > 5 ? ' ほか' : '') + '）の在籍を外します。\n' +
      'ログインできなくなり、選手の一覧・ダッシュボードの人数から外れます。記録は消えません。\nよろしいですか？')) return;
    Staff.gradBusy = true;
    var btn = document.querySelector('[data-staff="gradApply"]');
    if (btn) { btn.disabled = true; btn.textContent = '在籍を外しています…'; }
    Api.call('rosterApply', { token: S.token, retire: ids }).then(function (res) {
      Staff.gradBusy = false;
      Staff.gradMsg = msgHtml('ok', (res.retired || 0) + '人の在籍を外しました。記録はそのまま残っています。戻すときは、スプレッドシートの選手マスタで「在籍」を TRUE にしてください。');
      Staff.body = null; Staff.overview = null;   // 選手の一覧・人数を読み直す
      if (Staff.tab === 'manage' && Staff.page === 'manage') Staff.renderManage();
    }).catch(function (err) {
      Staff.gradBusy = false;
      if (err.needLogin) return Staff.fail(err);
      Staff.gradCount();
      var box = document.getElementById('gradList'), old = box && box.querySelector('.msg');
      if (old) old.remove();
      if (box) box.insertAdjacentHTML('afterbegin', msgHtml('error', err.message));
    });
  },

  // ---- v69：部員名簿にいないスタッフを1人ずつ追加する（管理者・トレーナーの画面だけ） ----
  //   保存は今ある rosterApply（名簿.gs の rosterApplyStaff_）に staffAdd だけを送る（Apps Script は変えていない）。
  //   スタッフマスタのいちばん下に1行足し、スタッフID（英字と数字の6文字）とPIN（6けた）を発行する。PINはスタッフマスタで確かめる
  //   役職は決まった中から選ぶ（「管理者」は選べない。ログインの管理などの権限につながるため、スプレッドシートで入れる）
  STAFF_ROLES: ['トレーナー', '学生コーチ', 'アナリスト', 'コーチ', 'ヘッドコーチ', '助監督', '監督', '部長', 'スタッフ'],
  addMsg: '', addBusy: false,
  addStaffHtml: function () {
    var msg = Staff.addMsg; Staff.addMsg = '';   // 結果のお知らせは1回だけ出す
    return '<details class="card add-staff"' + (msg ? ' open' : '') + '><summary><b>' + Icon('person', 18) + ' スタッフを1人追加する（部員名簿にいない人）</b></summary>' +
      '<p class="muted small">外部のトレーナーなど、部員名簿に載っていないスタッフを追加します。追加すると、スタッフIDとPINを発行します（管理者・トレーナーだけが使えます）。</p>' +
      (msg || '') +
      '<label>名前（必須）<input class="sel" id="addStaffName" maxlength="40" autocomplete="off" placeholder="例：山田 太郎"></label>' +
      '<label>ふりがな<input class="sel" id="addStaffKana" maxlength="40" autocomplete="off" placeholder="例：やまだ たろう"></label>' +
      '<label>役職<select class="sel" id="addStaffRole">' + Staff.STAFF_ROLES.map(function (r) { return '<option>' + esc(r) + '</option>'; }).join('') + '</select></label>' +
      '<p class="muted small">役職が「トレーナー」の人は、お知らせ・コラムの管理とスタッフの追加も使えるようになります。「管理者」にするときは、スプレッドシートのスタッフマスタで役職を書きかえてください。</p>' +
      '<button class="btn block" data-staff="addStaff">このスタッフを追加する</button></details>';
  },
  addStaff: function () {
    if (Staff.addBusy) return;
    var val = function (id) { var el = document.getElementById(id); return el ? String(el.value || '').replace(/\s+/g, ' ').trim() : ''; };
    var name = val('addStaffName').slice(0, 40), kana = val('addStaffKana').slice(0, 40), role = val('addStaffRole');
    var box = document.querySelector('.add-staff');
    var show = function (html) { var old = box && box.querySelector('.msg'); if (old) old.remove(); if (box) box.querySelector('summary').insertAdjacentHTML('afterend', html); };
    show('');   // 前のお知らせを消す
    if (!name) { show(msgHtml('error', '名前を入れてください。')); return; }
    if (Staff.STAFF_ROLES.indexOf(role) < 0) { show(msgHtml('error', '役職を選んでください。')); return; }
    if (!confirm('スタッフ「' + name + '」（' + role + '）をスタッフマスタに追加して、スタッフIDとPINを発行します。\nよろしいですか？')) return;
    Staff.addBusy = true;
    var btn = box && box.querySelector('[data-staff="addStaff"]');
    if (btn) { btn.disabled = true; btn.textContent = '追加しています…'; }
    Api.call('rosterApply', { token: S.token, staffAdd: [{ rosterId: '', name: name, kana: kana, role: role }] }).then(function (res) {
      Staff.addBusy = false;
      var a = (res.staffAdded || [])[0];
      Staff.addMsg = a ? msgHtml('ok', '「' + a.name + '」（' + (a.role || role) + '）を追加しました。スタッフID：' + a.id + '。PINはスタッフマスタの「PIN」の列で確かめて、本人に渡してください。')
        : msgHtml('warn', '追加できたか確かめられませんでした。スタッフマスタを確認してください。');
      if (Staff.tab === 'manage' && Staff.page === 'manage') Staff.renderManage();
    }).catch(function (err) {
      Staff.addBusy = false;
      if (err.needLogin) return Staff.fail(err);
      if (btn) { btn.disabled = false; btn.textContent = 'このスタッフを追加する'; }
      show(msgHtml('error', err.message));
    });
  },

  render: function () {
    S.view = 'staff';
    // 個人ページの印（ブラウザの履歴）が残っていたら消す（声の操作などで、個人ページから直接ほかの画面に移ったとき。v37）
    try { if (history.state && (history.state.staffAthlete || history.state.staffReport || history.state.staffRoster || history.state.staffMenuImport || history.state.staffGuide || history.state.staffAdmin || history.state.staffColumns)) history.replaceState(null, ''); } catch (e) {}
    Staff.page = Staff.tab;   // 今の画面（overview / inbody / weight / athlete）。音声の操作で使う（v35）
    if (Staff.tab === 'overview') return Staff.renderOverview();
    if (Staff.tab === 'list') return StaffList.render();
    if (Staff.tab === 'manage') return Staff.renderManage();   // v60：管理・設定（これが無いと InBody の画面になる）
    Staff.lastData = Staff.tab;   // v60：データ分析で最後に見たほう
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
    // v65：ダッシュボード。KPI・A/B/C は計画書 第8章の定義（判定は staff_qa.js の StaffQA.is。AIの答えと同じもの）
    var o = Staff.overview, f = Staff.filter;
    var teams = uniq(o.athletes.map(function (a) { return a.team; })), grades = uniq(o.athletes.map(function (a) { return a.grade; }));
    var list = StaffQA.people(o).slice();
    // 未実施 → 実施が少ない順 → 名前順
    list.sort(function (a, b) { return a.sessions - b.sessions || a.daysDone - b.daysDone || String(a.name).localeCompare(b.name, 'ja'); });
    var n = list.length, notDone = list.filter(StaffQA.is.B2).length, condIn = list.filter(function (a) { return a.condCount; }).length;
    var ck = StaffQA.checks(o), past = o.weekEnd < Body.today();

    var html = '<div class="card dash-ctl"><div class="row"><button class="btn ghost" data-staff="week" data-v="-7">◀ 前の週</button>' +
      '<b>' + esc(o.weekStart.slice(5).replace('-', '/')) + '〜' + esc(o.weekEnd.slice(5).replace('-', '/')) + '</b>' +
      '<button class="btn ghost" data-staff="week" data-v="7">次の週 ▶</button></div>' +
      '<div class="row">' + Staff.select('team', 'チーム', teams) + Staff.select('grade', '学年', grades) + '</div>' +
      '<p class="small">表示 ' + n + '人 ／ <b class="ng-text">未実施 ' + notDone + '人</b></p>' +
      '<div class="row"><button class="btn sub" data-staff="xOverviewXlsx">Excelで保存</button><button class="btn sub" data-staff="xOverviewPdf">PDFで保存</button></div></div>';
    Staff.overviewList = list;

    // ① KPI（分母＝在籍中で、今の絞り込みの選手）
    var kpi = function (label, val, sub, cls) {
      return '<div class="kpi' + (cls ? ' ' + cls : '') + '"><span class="small muted">' + label + '</span><b>' + val + '</b>' + (sub ? '<span class="small muted">' + sub + '</span>' : '') + '</div>';
    };
    html += '<div class="card"><h2>この週の状況</h2><div class="kpi-grid">' +
      kpi('今週の実施', (n - notDone) + ' / ' + n + '人', n ? Math.round((n - notDone) / n * 100) + '%' : '') +
      kpi('コンディション入力', condIn + ' / ' + n + '人', '') +
      kpi('未実施', notDone + '人', '', notDone ? 'ng' : '') +
      kpi('コンディション未入力', (n - condIn) + '人', '', n - condIn ? 'ng' : '') +
      '</div><p class="muted small">在籍中の選手で数えています。</p></div>';

    // ② 確認が必要な選手（A・B・C。重なりがあるので合計しない）
    var btn = function (k) {
      return '<button class="check-item chk-' + k.charAt(0) + '" data-staff="check" data-v="' + k + '"><span>' + esc(StaffQA.CHECK_LABELS[k].slice(2)) + '</span><b>' + ck[k].length + '人</b>' + Icon('right', 16) + '</button>';
    };
    html += '<div class="card"><h2>確認が必要な選手</h2><div class="check-grid">' +
      '<div><h3 class="chk-h chk-A">A 体調</h3>' + btn('A1') + btn('A2') + '</div>' +
      '<div><h3 class="chk-h chk-B">B 入力・実施</h3>' + btn('B1') + btn('B2') + '</div>' +
      '<div><h3 class="chk-h chk-C">C しばらく未実施</h3>' + btn('C') + '</div></div>' +
      '<p class="muted small">A・B はこの週のデータ、C は今日から7日で判定します。1人が複数に入ることがあるので、合計はしません。押すと選手管理でその選手を表示します。</p>' +
      (past ? '<p class="small">表示しているのは過去の週です。C は表示中の週ではなく、今日を基準にしています。</p>' : '') + '</div>';

    // ③ 学年・チーム別（今の絞り込みの中）
    var groupTable = function (title, key) {
      var vals = uniq(list.map(function (a) { return a[key]; })).filter(String).sort(function (a, b) { return String(a).localeCompare(String(b), 'ja'); });
      if (!vals.length) return '';
      return '<div><h3>' + title + '</h3><div class="table-scroll"><table class="tbl"><tr><th>' + title.replace('別', '') + '</th><th>人数</th><th>実施</th><th>入力</th></tr>' +
        vals.map(function (v) {
          var g = list.filter(function (a) { return a[key] === v; }), d = g.filter(function (a) { return a.sessions; }).length, c = g.filter(function (a) { return a.condCount; }).length;
          return '<tr><td>' + esc(v) + '</td><td>' + g.length + '</td><td' + (d < g.length ? ' class="ng-text"' : '') + '>' + d + '/' + g.length + '</td><td>' + c + '/' + g.length + '</td></tr>';
        }).join('') + '</table></div></div>';
    };
    html += '<div class="card"><h2>学年・チーム別</h2><div class="dash-2col">' + groupTable('学年別', 'grade') + groupTable('チーム別', 'team') + '</div>' +
      '<p class="muted small">実施＝この週に1回以上トレーニングした人数。入力＝この週にコンディションを入れた人数。</p></div>';

    // ④ 最近のデータ更新（体組成はあとから読み込む。読めなくてもほかはそのまま使える）
    var maxOf = function (arr) { return arr.filter(String).sort().pop() || ''; };
    var md = function (d) { return d ? esc(d.slice(5).replace('-', '/')) : 'なし'; };
    html += '<div class="card"><h2>最近のデータ更新</h2><div class="recent-grid" id="dashRecent">' +
      '<div><span class="small muted">トレーニング（最新）</span><b>' + md(maxOf(list.map(function (a) { return a.lastDate || ''; }))) + '</b></div>' +
      '<div><span class="small muted">コンディション（この週）</span><b>' + md(maxOf(list.map(function (a) { return a.cond ? a.cond.date || '' : ''; }))) + '</b></div>' +
      '<div><span class="small muted">InBody（最新）</span><b data-recent="inbody">…</b></div>' +
      '<div><span class="small muted">体重（最新）</span><b data-recent="weight">…</b></div></div></div>';

    // ⑤ 選手ごとの表（今までの実施状況）
    html += '<div class="card"><h2>選手ごとの実施状況</h2><div class="table-scroll"><table class="tbl"><tr><th>選手</th><th>Day</th><th>回数</th><th>上/下/全</th><th>疲労 全/上/下</th><th>動き</th><th>最終</th></tr>' +
      list.map(function (a) {
        var warn = a.sessions && !a.sets['下半身'] ? ' title="下半身のセットがありません"' : '';
        return '<tr class="' + (a.sessions ? '' : 'row-ng') + '"><td><button class="link" data-staff="athlete" data-v="' + esc(a.id) + '">' + esc(a.name) + '</button>' +
          '<div class="muted small">' + esc([a.grade, a.team].filter(String).join('・')) + '</div></td>' +
          '<td>' + (a.menuDays ? a.daysDone + '/' + a.menuDays : '-') + '</td>' +
          '<td>' + a.sessions + (a.freeSessions ? '<span class="muted small">（自' + a.freeSessions + '）</span>' : '') + '</td>' +
          '<td' + warn + '>' + a.sets['上半身'] + '/' + (a.sessions && !a.sets['下半身'] ? '<b class="ng-text">0</b>' : a.sets['下半身']) + '/' + a.sets['全身'] + '</td>' +
          '<td' + (StaffQA.is.A1(a) ? ' class="ng-text"' : '') + '>' + (a.cond ? a.cond.whole + '/' + a.cond.upper + '/' + a.cond.lower : '-') + '</td>' +
          '<td' + (StaffQA.is.A2(a) ? ' class="ng-text"' : '') + '>' + (a.cond ? a.cond.perf : '-') + '</td>' +
          '<td class="small">' + esc(a.lastDate ? a.lastDate.slice(5).replace('-', '/') : '-') + '</td></tr>';
      }).join('') + '</table></div>' +
      '<p class="muted small">Day＝チームメニューの実施Day数／全Day数。回数＝その週のトレーニング回数（自＝自分のメニュー）。上/下/全＝部位ごとのセット数。疲労・動き＝その週でいちばん新しいコンディション（疲労は1 疲れていない〜10 とても疲れている、' + StaffQA.FATIGUE_ALERT + '以上は赤。動きは1 とても悪い〜10 とても良い、' + StaffQA.PERF_LOW + '以下は赤）。</p></div>';
    if (o.unregistered.length) {
      html += '<div class="card"><h2>種目マスタに無い種目</h2><p class="muted small">種目マスタに追加するか、既存の種目の「呼び方の候補」に入れると、部位の集計に入ります。</p>' +
        o.unregistered.map(function (u) { return '<span class="chip">' + esc(u.name) + '（' + u.count + '）</span>'; }).join(' ') + '</div>';
    }
    // 選手の登録・メニュー・コラム・ログインの管理・使い方は「管理・設定」にまとめた（v65。権限の条件は renderManage で今までどおり）
    app.innerHTML = Staff.frame(html);
    Staff.fillRecent();
  },

  /** v65：最近のデータ更新の InBody・体重（staffBody を読んでから入れる） */
  fillRecent: function () {
    var put = function (k, text) { var el = document.querySelector('[data-recent="' + k + '"]'); if (el) el.textContent = text; };
    Staff.loadBody().then(function (b) {
      if (Staff.page !== 'overview') return;
      var people = StaffQA.bodyPeople(b);
      ['inbody', 'weight'].forEach(function (k) {
        var d = people.map(function (a) { return a[k].map(function (r) { return r.date; }).sort().pop() || ''; }).filter(String).sort().pop();
        put(k, d ? d.slice(5).replace('-', '/') : 'なし');
      });
    }).catch(function () { put('inbody', '読めませんでした'); put('weight', '読めませんでした'); });
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
    return Staff.sideHtml() + '<div class="group"><div class="topbar ath-top"><button class="btn ghost" data-staff="back">' + Icon('left', 20) + '戻る</button>' +
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
    if (Staff.page === 'admin') { Admin.back(); return; }
    if (Staff.page === 'columns') { ColumnEditor.back(); return; }   // コラムの管理（v56）   // ログインの管理（v53）
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
  // v66：個人ページの上の「トレーニング記録・コンディション記録・フィジカルデータ」は、同じページの中を動くだけにする
  //   （#〜 のリンクのままだとブラウザの履歴が変わり、popstate で「戻る」と同じ扱いになって元の画面に戻ってしまっていた）
  var jump = e.target.closest('.ath-jump a');
  if (jump && S.view === 'staff') {
    e.preventDefault();
    var sec = document.getElementById((jump.getAttribute('href') || '').slice(1));
    if (sec) {   // 上に重なる AIアシスタントの帯の下に見出しが来るように
      var band = document.querySelector('.coach-band'), bb = band ? band.getBoundingClientRect().bottom : 0;
      window.scrollTo(0, Math.max(0, sec.getBoundingClientRect().top + window.scrollY - Math.max(0, bb) - 8));
    }
    return;
  }
  var nav = e.target.closest('[data-staffnav]');   // v60：PC の左のサイドバー
  if (nav && S.view === 'staff') { Staff.go(nav.dataset.staffnav); return; }
  var t = e.target.closest('[data-staff]');
  if (!t || S.view !== 'staff' || t.tagName === 'SELECT' || t.tagName === 'INPUT') return;
  var v = t.dataset.v;
  // v53b：別のファイルの画面が読み込めていないときは、何も起きないのではなく理由を出す（GitHub に入れ忘れたときなど）
  var need = { roster: ['Roster', 'roster.js'], menuImport: ['MenuImport', 'menu_import.js'], guide: ['Guidebook', 'guidebook.js'], columns: ['ColumnEditor', 'menu_import.js'] }[t.dataset.staff];
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
    case 'check': StaffList.showCheck(v); break;   // v65：ダッシュボードの A・B・C → 選手管理
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
    case 'admin': Admin.show('accounts'); break;
    case 'columns': ColumnEditor.open(); break;   // コラムの管理（v56）   // ログインの管理（v53）
    case 'quitApply': Staff.quitApply(); break;   // v72：退部にする・在籍に戻す（管理・設定）
    case 'quitMode': Staff.quit.mode = v === 'back' ? 'back' : 'quit'; Staff.quitPicked = {}; Staff.quit.open = true; Staff.renderManage(); break;
    case 'gradApply': Staff.gradApply(); break;   // v70：4年生の在籍を外す（管理・設定）
    case 'addStaff': Staff.addStaff(); break;
    case 'bodyImport': StaffBody.openImport = true; Staff.tab = v === 'weight' ? 'weight' : 'inbody'; Staff.render(); window.scrollTo(0, 0); break;   // v71：管理・設定から体組成・体重の取り込みへ   // v69：スタッフを1人追加する（管理・設定）
    case 'guide': Guidebook.showStaff(v); break;   // 使い方（v52。guidebook.js）   // メニュー表の取り込み（v50。menu_import.js）   // 部員名簿から取り込む（v44。roster.js）
    case 'reload': Staff.overview = null; Staff.body = null; Staff.render(); break;
  }
});
// v72：退部の手続きの一覧のチェックと、名前で探す
app.addEventListener('change', function (e) {
  var t = e.target;
  if (S.view !== 'staff' || !t.dataset || t.dataset.quit !== 'pick') return;
  if (t.checked) Staff.quitPicked[t.value] = true; else delete Staff.quitPicked[t.value];
  Staff.quitCount();
});
app.addEventListener('input', function (e) {
  if (S.view !== 'staff' || e.target.id !== 'quitSearch') return;
  Staff.quit.q = e.target.value;
  Staff.quitFill();
});
// v70：4年生の在籍を外す一覧のチェック
app.addEventListener('change', function (e) {
  var t = e.target;
  if (S.view !== 'staff' || !t.dataset || !t.dataset.grad) return;
  if (t.dataset.grad === 'all') document.querySelectorAll('[data-grad="pick"]').forEach(function (c) { c.checked = t.checked; });
  Staff.gradCount();
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
  else if (Staff.page === 'columns') ColumnEditor.leave();   // v56
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
