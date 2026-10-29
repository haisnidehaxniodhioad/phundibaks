/**
 * app.js ― 画面の組み立てと操作
 * 画面は4つ: ログイン → ホーム → トレーニング中 → 終了（きつさの入力と保存）
 * ほかに、体組成レポート（body.js）、自分のメニューの作成（mymenu.js）、スタッフ画面（staff.js）がある。
 * 状態はすべて S にまとめ、変わるたびに該当する画面を描き直す。
 * v20：見た目を Claude Design のレイアウト案 2a（やわらか）に変更。画面の下のバー（タブ・タイマー・保存ボタン）は dock.js、
 *      アイコンは icons.js。色や形は style.css の :root（--color-…）でまとめて変えられる。
 * トレーニング中の記録（draft）は端末に一時保存するので、画面を閉じても続きから再開できる。
 */
// アプリの版（画面の右上やログイン画面に表示される。更新が反映されたかの確認に使う）
var APP_VERSION = 'v28 2026-10-29';
// 記録し忘れた日の分を、何日前まで遡って入力できるか（v26）。Apps Script の 設定.gs の MAX_BACKDATE_DAYS と同じ数字にする
var MAX_BACKDATE_DAYS = 3;
var S = { token: null, home: null, draft: null, view: 'loading' };
var app = document.getElementById('app');

// ---------------- 共通の小さな道具 ----------------
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function msgHtml(type, text) { return text ? '<div class="msg ' + type + '">' + esc(text) + '</div>' : ''; }
function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function saveDraft() { if (S.draft) Store.set('draft', S.draft); else Store.remove('draft'); }
/** n日前の日付の表示（「10月27日（火）」）。n=0 は今日 */
function backdateLabel(n) {
  var d = new Date(); d.setDate(d.getDate() - n);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日（' + '日月火水木金土'.charAt(d.getDay()) + '）';
}
function backdateWord(n) { return ['今日', '昨日', 'おととい', '3日前'][n] || n + '日前'; }
/** 新しく始めたトレーニングに「何日前の分か」を付ける（ホームで「記録し忘れた日の分」を選んでいたとき） */
function applyBackdate(dr) {
  if (S.backdate) { dr.backdate = S.backdate; S.backdate = 0; }
  return dr;
}
function latestOf(name) { return (S.home && S.home.latest && S.home.latest[name]) || null; }

// ---------------- 起動 ----------------
function init() {
  S.token = Store.get('token', null);
  S.draft = Store.get('draft', null);
  if (S.token) loadHome(); else renderLogin();
}

// ---------------- ログイン ----------------
function renderLogin(error) {
  S.view = 'login';
  // coachTop … ここにコーチ（アバター）が大きく出る（dock.js が移動する）
  app.innerHTML =
    '<div class="login">' +
    '<div class="login-hero"><span id="coachTop" class="coach-top coach-login"></span>' +
    '<div class="bubble bubble-center"><i>おかえり！IDとPINを入れてね。</i></div>' +
    '<h1>' + esc(window.APP_CONFIG.APP_NAME) + '</h1></div>' +
    '<label for="lid">ID（選手ID・スタッフID）</label><input id="lid" class="input-pill" inputmode="text" autocomplete="username" placeholder="例：26001">' +
    '<label for="lpin">PIN（4桁）</label><input id="lpin" class="input-pill input-pin" type="password" inputmode="numeric" maxlength="4" autocomplete="current-password">' +
    msgHtml('error', error) +
    '<button class="btn btn-pill big block" data-act="login">ログイン</button>' +
    '<p class="muted small center">PINを忘れたときは、スタッフに聞いてね。<br>一度ログインすると、しばらくはこの端末で入力しなくて大丈夫。</p>' +
    '<p class="ver">' + esc(APP_VERSION) + '</p></div>';
}

function doLogin() {
  var id = document.getElementById('lid').value.trim();
  var pin = document.getElementById('lpin').value.trim();
  app.querySelector('[data-act="login"]').disabled = true;
  Api.call('login', { id: id, pin: pin }).then(function (res) {
    S.token = res.token;
    Store.set('token', res.token);
    if (res.role === 'staff') { Staff.start(res.name); return; }   // スタッフはスタッフ画面へ（staff.js）
    if (res.home) { S.home = res.home; Store.set('home', res.home); renderHome(); return; }   // ホームのデータも一緒に届く
    loadHome();
  }).catch(function (err) { renderLogin(err.message); });
}

function logout() {
  if (S.draft && !confirm('途中のトレーニングの記録が消えます。ログアウトしますか？')) return;
  Api.call('logout', { token: S.token }).catch(function () {});
  S.token = null; S.home = null; S.draft = null;
  Store.remove('token'); Store.remove('draft'); Store.remove('home');
  renderLogin();
}

// ---------------- ホーム ----------------
function loadHome(notice) {
  // 前回のデータが端末にあれば、まずそれですぐ表示し、裏で最新のデータを取りに行く（待ち時間を感じにくくする）
  var cached = Store.get('home', null);
  if (cached && !S.home) S.home = cached;
  if (S.home && S.home.role === 'athlete') { renderHome(notice); showSyncing(true); }
  else app.innerHTML = '<div class="loading">読み込み中…</div>';
  Api.call('home', { token: S.token }).then(function (res) {
    if (res.role === 'staff') { Staff.start(res.name); return; }
    S.home = res;
    Store.set('home', res);
    if (S.view === 'home' || S.view === 'loading' || S.view === 'login') renderHome(notice);   // トレーニングを始めていたら描き直さない
    showSyncing(false);
  }).catch(function (err) {
    showSyncing(false);
    if (err.needLogin) { Store.remove('token'); S.token = null; renderLogin(err.message); return; }
    S.home = Store.get('home', null);   // 通信できないときは前回のデータで表示する
    if (S.home) renderHome(null, '最新のデータを取得できませんでした（' + err.message + '）。前回のデータを表示しています。');
    else app.innerHTML = msgHtml('error', err.message) + '<button class="btn block" data-act="reload">もう一度読み込む</button>';
  });
}

/** 「最新のデータを確認中…」の小さな表示 */
function showSyncing(on) {
  var el = document.getElementById('syncing');
  if (on && !el && S.view === 'home') app.insertAdjacentHTML('afterbegin', '<div id="syncing" class="muted small">最新のデータを確認中…</div>');
  if (!on && el) el.remove();
}

function renderHome(notice, warning) {
  S.view = 'home';
  var h = S.home;
  var pending = Store.get('pending', []);
  var now = new Date(), hour = now.getHours();
  var hello = hour < 10 ? 'おはよう' : hour < 18 ? 'こんにちは' : 'おつかれさま';
  var first = h.suggestion.order[0];

  // いちばん上：日付と、コーチの出迎え（coachTop にアバターが大きく出る。dock.js が移動する）
  var html = '<div class="home-top"><span class="kicker">' + (now.getMonth() + 1) + '月' + now.getDate() + '日（' + '日月火水木金土'.charAt(now.getDay()) + '）</span>' +
    '<button class="btn ghost" data-act="logout">ログアウト</button></div>';
  html += '<div class="coach-hello"><span id="coachTop" class="coach-top"></span>' +
    '<div class="bubble bubble-left"><h1>' + hello + '、' + esc(h.name) + 'さん！</h1><i>' + esc(homeGreeting()) + '</i></div></div>';
  html += msgHtml('ok', notice) + msgHtml('warn', warning);

  if (pending.length) {
    html += '<div class="msg warn">まだ送信できていない記録が' + pending.length + '件あります。' +
      '<button class="btn sub block" data-act="resend">今すぐ送信する</button></div>';
  }
  if (S.draft) {
    html += '<div class="card soft"><h2>途中のトレーニングがあります</h2><p class="muted">' + esc(S.draft.title) + '</p>' +
      '<div class="row"><button class="btn btn-pill" data-act="resume">' + Icon('play', 20) + '続きから</button>' +
      '<button class="btn ghost" data-act="discard">記録を破棄</button></div></div>';
  }

  // 自分のメニュー（mymenu.js）。チームのメニューが無い選手は、いちばん上に出す
  if (!h.days.length) html += MyMenu.homeCard();

  // 今週のスタンプ（Dayごとの丸。済み＝✓、今日のおすすめ＝輪っか）
  if (h.days.length) {
    var left = h.days.filter(function (d) { return !h.doneDays[d.day]; }).length;
    html += '<section class="sec"><div class="sec-head"><h2>今週のスタンプ</h2><span class="accent-text small">' +
      (left ? 'あと' + left + '回で達成！' : '今週は全部できたね！') + '</span></div><div class="stamps">';
    h.days.forEach(function (d) {
      var done = h.doneDays[d.day], today = !done && d.day === first;
      html += '<div class="stamp' + (done ? ' done' : today ? ' today' : '') + '" title="Day' + d.day + (d.dayName ? ' ' + esc(d.dayName) : '') + '">' +
        '<span class="stamp-mark">' + (done ? Icon('check', 30) : d.day) + '</span>' +
        '<span class="stamp-label">' + (today ? '今日' : 'Day' + d.day) + '</span></div>';
    });
    html += '</div></section>';
  }

  // 今日はこれをやろう（おすすめのDayと開始ボタン）
  if (first) {
    var d0 = findDay(first);
    html += '<section class="today-card"><div class="today-kicker"><span>今日はこれをやろう</span>' +
      '<button class="btn ghost icon-btn" data-act="speakSuggest" aria-label="読み上げる">' + Icon('speaker', 22) + '</button></div>' +
      '<div class="today-title">Day' + d0.day + (d0.dayName ? '　' + esc(d0.dayName) : '') + '</div>' +
      '<div class="today-items">' + applySavedOrder(d0.items, d0.day).map(function (it) { return esc(it.name); }).join('・') + '</div>' +
      '<button class="btn btn-pill big block" data-act="startDay" data-day="' + d0.day + '">' + Icon('play', 22) + 'はじめる</button>';
    h.suggestion.order.slice(1).forEach(function (dayNo) {
      var d = findDay(dayNo);
      html += '<button class="btn ghost block" data-act="startDay" data-day="' + d.day + '">Day' + d.day + (d.dayName ? '（' + esc(d.dayName) + '）' : '') + 'にする</button>';
    });
    html += '</section>';
  } else if (h.days.length) {
    html += '<section class="today-card"><div class="today-kicker"><span>今日のおすすめ</span></div><p>' + esc(h.suggestion.reason) + '</p></section>';
  }
  var doneList = h.days.filter(function (d) { return h.doneDays[d.day]; });
  if (doneList.length) {
    html += '<details class="again"><summary>今週やったDayをもう一度やる</summary>';
    doneList.forEach(function (d) {
      html += '<button class="btn sub btn-pill block" data-act="startDay" data-day="' + d.day + '">Day' + d.day + (d.dayName ? '（' + esc(d.dayName) + '）' : '') + 'をもう一度</button>';
    });
    html += '</details>';
  }
  if (h.days.length) html += MyMenu.homeCard();

  if (h.last) {
    html += '<p class="muted small">前回: ' + esc(h.last.date) + '（' + esc(h.last.type) +
      (h.last.day ? ' Day' + esc(h.last.day) : '') + '）</p>';
  }
  html += '<p class="ver">' + esc(APP_VERSION) + '</p>';
  app.innerHTML = html;
}

/** ホームの出迎えのひとこと */
function homeGreeting() {
  var h = S.home;
  if (S.draft) return '途中のトレーニングがあるよ。「続きから」で再開できるよ。';
  if (h.suggestion.order.length) return h.suggestion.reason.replace(/です。$/, 'だよ。');
  if (h.days.length) return '今週のメニューは全部できたね！';
  return h.myMenus && h.myMenus.length ? '保存したメニューから始められるよ。' : '自分のメニューを作って始めよう。';
}

function findDay(dayNo) { return S.home.days.filter(function (d) { return d.day === Number(dayNo); })[0]; }

function suggestText() {
  var h = S.home, d = findDay(h.suggestion.order[0]);
  return h.name + 'さん、' + h.suggestion.reason.replace(/Day(\d+)/g, 'デイ$1').replace(/です。/g, 'だよ。') + menuText(Speech.dayText(d.day), applySavedOrder(d.items, d.day));
}

/** メニューの中身を読み上げる文（「デイ2は、スクワット、ベンチプレス、懸垂の3種目です。」） */
function menuText(title, items) {
  var names = items.map(function (it) { return it.name; });
  if (!names.length) return '';
  return title + 'は、' + names.join('、') + 'の' + names.length + '種目だよ。';
}

/**
 * トレーニングを始めたときの案内。種目の一覧を伝えて、どれから始めるかを選んでもらう（順番は選手が決める）。
 * 選ばなければ、画面の上から順に進む。
 */
function announceStart(intro) {
  var remaining = remainingItems();
  var names = remaining.map(function (r) { return r.name; }).join('、');
  var say = remaining.length <= 1 ? intro + '最初は' + Speech.exerciseText(S.draft.items[0], latestOf(S.draft.items[0].name))
    : Speech.brief() ? intro + '今日は、' + names + 'の' + remaining.length + '種目。どれからやる？'   // 短め（画面にボタンが出る）
    : intro + '今日の種目は、' + names + 'の' + remaining.length + '種目です。どの種目から始めますか？画面で選ぶか、「' + remaining[0].name + 'から」のように話してね。';
  if (remaining.length > 1 && window.showRemaining) showRemaining(remaining, 'start');
  return say;
}

// ---------------- トレーニングの開始 ----------------
function makeItem(src, planned) {
  var last = latestOf(src.name);
  var setCount = planned ? (src.sets || 1) : 1;
  var sets = [];
  for (var i = 0; i < setCount; i++) sets.push({ w: last && last.max ? last.max : '', r: planned ? src.reps : '', done: false });
  return { name: src.name, category: src.category || '', planned: planned ? { reps: src.reps, sets: src.sets } : null,
           tempo: src.tempo || '', rest: src.rest || 0, rir: src.rir || '', sets: sets, method: 'タップ' };
}

function startDay(dayNo) {
  if (S.draft && !confirm('途中のトレーニングの記録を破棄して、新しく始めますか？')) return;
  var d = findDay(dayNo);
  var items = applySavedOrder(d.items, d.day);   // 自分で決めた並び順があれば、その順番で始める
  S.draft = { id: newId(), startedAt: new Date().toISOString(), type: 'チーム', menuId: S.home.menuId,
              day: d.day, dayName: d.dayName, title: 'Day' + d.day + (d.dayName ? '（' + d.dayName + '）' : ''),
              items: items.map(function (it) { return makeItem(it, true); }) };
  applyBackdate(S.draft);
  saveDraft();
  renderSession();
  Speech.speak(announceStart(Speech.dayText(d.day) + (S.draft.backdate ? '、' + backdateWord(S.draft.backdate) + 'の分を入れるよ。' : 'を始めるよ。')));
}

// ---------------- 自分で決めた種目の並び順 ----------------
// ▲▼で並べ替えると、その順番を「メニュー＋Day」ごとにこの端末に保存し、次回も同じ順番で始める。
function orderKey(day) { return 'order_' + (S.home && S.home.menuId) + '_' + day; }

/** 保存した並び順に並べ替える（保存に無い種目は、元の順番のまま後ろに付ける） */
function applySavedOrder(items, day) {
  var saved = Store.get(orderKey(day), null);
  if (!saved || !saved.length) return items.slice();
  return items.slice().sort(function (a, b) {
    var ia = saved.indexOf(a.name), ib = saved.indexOf(b.name);
    if (ia < 0) ia = 999 + items.indexOf(a);
    if (ib < 0) ib = 999 + items.indexOf(b);
    return ia - ib;
  });
}

/** 今の並び順を保存する（チームメニューのときだけ） */
function saveOrder() {
  if (!S.draft || S.draft.type !== 'チーム') return;
  Store.set(orderKey(S.draft.day), S.draft.items.filter(function (it) { return it.planned; }).map(function (it) { return it.name; }));
}

/** i番目の種目を上（-1）か下（+1）に動かす */
function moveItem(i, dir) {
  var items = S.draft.items, j = i + dir;
  if (j < 0 || j >= items.length) return;
  var tmp = items[i]; items[i] = items[j]; items[j] = tmp;
  if (window.VoiceUI) VoiceUI.undo = [];   // 並びが変わったので、音声の取り消し履歴は使えなくなる
  saveDraft(); saveOrder(); renderSession();
}

/** 自分で決めた並び順をやめて、メニューの元の順番に戻す */
function resetOrder() {
  var dr = S.draft, d = findDay(dr.day);
  Store.remove(orderKey(dr.day));
  var base = d.items.map(function (it) { return it.name; });
  dr.items.sort(function (a, b) {
    var ia = base.indexOf(a.name), ib = base.indexOf(b.name);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  if (window.VoiceUI) VoiceUI.undo = [];
  saveDraft(); renderSession();
}

function startFree() {
  if (S.draft && !confirm('途中のトレーニングの記録を破棄して、新しく始めますか？')) return;
  S.draft = { id: newId(), startedAt: new Date().toISOString(), type: '個別', title: '自分のメニュー', items: [] };
  applyBackdate(S.draft);
  saveDraft();
  renderSession();
}

// ---------------- トレーニング中 ----------------
/** まだ終わっていないセットがある最初の種目の番号 */
function currentIndex() {
  for (var i = 0; i < S.draft.items.length; i++) {
    if (S.draft.items[i].sets.some(function (s) { return !s.done; })) return i;
  }
  return -1;
}

/**
 * トレーニング中の画面（v20：レイアウト案 2a）
 *   上から：Day名と「何種目め / 全何種目」、進み具合のバー、今の種目のカード（大きく）、
 *   つぎにやる種目（押すとそれを次にやる）、終わった種目（「直す」で開いて直せる）、種目の追加。
 *   S.openItem … 終わった種目のうち、開いて直している種目の番号
 *   S.reorder  … 「順番を入れ替える」を開いているとき true（▲▼でいつもの順番を変える）
 */
function renderSession() {
  S.view = 'session';
  var dr = S.draft, cur = currentIndex(), n = dr.items.length;
  if (S.sessId !== dr.id) { S.sessId = dr.id; S.openItem = null; S.reorder = false; }   // 新しいトレーニングでは開いていた欄を閉じる
  var isDone = function (it) { return it.sets.every(function (s) { return s.done; }); };
  var doneCount = dr.items.filter(isDone).length;
  var head = !n ? '種目を追加しよう' : cur < 0 ? '全' + n + '種目おわり！' : (doneCount + 1) + '種目め / 全' + n + '種目';
  var html = '<div class="sess-head"><div><span class="kicker">' + esc(dr.title) + (dr.backdate ? '・<b class="late">' + backdateLabel(dr.backdate) + 'の分</b>' : '') + '</span><h1>' + head + '</h1></div>' +
    '<div class="row nowrap"><button class="btn ghost" data-act="home">ホーム</button>' +
    '<button class="btn sub btn-pill" data-act="finish">おわる</button></div></div>';
  if (n) {
    html += '<div class="progress" aria-hidden="true">' + dr.items.map(function (it, i) {
      return '<span class="' + (isDone(it) ? 'done' : i === cur ? 'now' : '') + '"></span>';
    }).join('') + '</div>';
  } else {
    html += '<p class="muted">下の欄から種目を追加してください。</p>';
  }

  // 今の種目
  if (cur >= 0) html += exerciseCard(cur, true);
  else if (n) html += '<div class="card soft center"><b>すべての種目が終わったよ！</b><p class="muted small">右上の「おわる」を押して、きつさを入れて保存してね。</p>' +
    '<button class="btn btn-pill block" data-act="finish">おわる（保存へ）</button></div>';

  // つぎにやる種目（押すと、その種目を次にやる）
  var rest = [];
  dr.items.forEach(function (it, i) { if (i !== cur && !isDone(it)) rest.push(i); });
  if (rest.length) {
    html += '<section class="sec"><div class="sec-head"><h2>つぎにやる種目</h2>' +
      (dr.items.length > 1 ? '<button class="btn ghost small" data-act="toggleReorder">' + (S.reorder ? '入れ替えを閉じる' : '順番を入れ替える') + '</button>' : '') + '</div>';
    if (S.reorder) html += reorderList();
    else html += '<div class="next-pills">' + rest.map(function (i) {
      return '<button class="btn sub btn-pill" data-act="pickNext" data-i="' + i + '">' + esc(dr.items[i].name) + '</button>';
    }).join('') + '</div>';
    html += '</section>';
  } else if (S.reorder) {
    html += '<section class="sec"><div class="sec-head"><h2>種目の順番</h2><button class="btn ghost small" data-act="toggleReorder">閉じる</button></div>' + reorderList() + '</section>';
  }

  // 終わった種目（「直す」で開くと、重さ・回数を直せる）
  var fin = [];
  dr.items.forEach(function (it, i) { if (isDone(it)) fin.push(i); });
  if (fin.length) {
    html += '<section class="sec"><div class="sec-head"><h2>終わった種目</h2></div>';
    fin.forEach(function (i) {
      var it = dr.items[i];
      if (S.openItem === i) { html += exerciseCard(i, false); return; }
      html += '<div class="done-row"><span class="done-check">' + Icon('check', 18) + '</span><div class="done-text"><b>' + esc(it.name) + '</b>' +
        '<span class="muted small">' + esc(it.sets.map(function (s) { return (s.w !== '' ? s.w + '×' : '') + s.r; }).join('、')) + '</span></div>' +
        '<button class="btn ghost small" data-act="openItem" data-i="' + i + '">直す</button></div>';
    });
    html += '</section>';
  }

  html += '<div class="card soft"><label for="addName">種目を追加</label><div class="row nowrap">' +
    '<input id="addName" class="input-pill" list="exList" placeholder="例：デッドリフト" style="flex:1">' +
    '<button class="btn btn-pill" data-act="addItem">追加</button></div><datalist id="exList">' +
    S.home.exercises.map(function (e) { return '<option value="' + esc(e.name) + '">'; }).join('') + '</datalist></div>';
  app.innerHTML = html;
}

/** 種目のカード（current：今の種目なら大きく、あとのセット数で励ます） */
function exerciseCard(i, current) {
  var dr = S.draft, it = dr.items[i], last = latestOf(it.name);
  var left = it.sets.filter(function (s) { return !s.done; }).length;
  var html = '<div class="ex-card' + (current ? ' current' : '') + '">';
  html += '<div class="ex-head"><span class="ex-name">' + esc(it.name) + '</span>' +
    (it.category ? '<span class="tag">' + esc(it.category) + '</span>' : '') +
    (it.planned ? '' : '<span class="tag off">メニュー外</span>') +
    '<button class="btn ghost icon-btn ex-speak" data-act="speakItem" data-i="' + i + '" aria-label="読み上げる">' + Icon('speaker', 22) + '</button>' +
    (current ? '' : '<button class="btn ghost small" data-act="openItem" data-i="-1">閉じる</button>') + '</div>';
  if (it.planned) {
    html += '<div class="plan">目標 ' + it.planned.reps + '回×' + it.planned.sets + 'セット' +
      (it.rest ? '・レスト' + it.rest + '秒' : '') + (it.rir && it.rir !== '-' ? '・RIR' + esc(it.rir) : '') + '</div>';
    var tt = Speech.tempoText(it.tempo);
    if (tt) html += '<div class="muted small">テンポ ' + esc(it.tempo) + '：' + esc(tt) + '</div>';
  }
  html += '<div class="muted small">前回 ' + (last ? esc(last.sets) + '（' + esc(last.date) + '）' : '記録なし') + '</div>';
  html += '<div class="set-list">';
  it.sets.forEach(function (s, j) {
    html += '<div class="set-row' + (s.done ? ' done' : '') + '"><span class="set-no">' + (j + 1) + '</span>' +
      '<button class="step" data-act="wStep" data-i="' + i + '" data-j="' + j + '" data-d="-1" aria-label="重さを下げる">−</button>' +
      '<label class="num"><input type="number" inputmode="decimal" step="0.5" min="0" value="' + esc(s.w) + '" data-act="w" data-i="' + i + '" data-j="' + j + '" aria-label="重量"><span>kg</span></label>' +
      '<button class="step" data-act="wStep" data-i="' + i + '" data-j="' + j + '" data-d="1" aria-label="重さを上げる">＋</button>' +
      '<label class="num reps"><input type="number" inputmode="numeric" min="0" value="' + esc(s.r) + '" data-act="r" data-i="' + i + '" data-j="' + j + '" aria-label="回数"><span>回</span></label>' +
      '<button class="check' + (s.done ? ' on' : '') + '" data-act="toggle" data-i="' + i + '" data-j="' + j + '" aria-label="' + (j + 1) + 'セット目をおわりにする">' + Icon('check', 24) + '</button></div>';
  });
  html += '</div>';
  if (current && left) html += '<div class="cheer">あと' + left + 'セット！</div>';
  html += '<div class="row ex-tools">' +
    '<button class="btn ghost small" data-act="addSet" data-i="' + i + '">＋セット</button>' +
    (it.sets.length > 1 ? '<button class="btn ghost small" data-act="removeSet" data-i="' + i + '">−セット</button>' : '') +
    (it.planned && dr.type === 'チーム' ? '' : '<button class="btn ghost small" data-act="removeItem" data-i="' + i + '">種目を削除</button>') + '</div></div>';
  return html;
}

/** 種目の順番を▲▼で入れ替える一覧（チームメニューは、変えた順番が次回も使われる） */
function reorderList() {
  var dr = S.draft;
  var html = '<div class="reorder">' + dr.items.map(function (it, i) {
    return '<div class="reorder-row"><span class="set-no">' + (i + 1) + '</span><span class="reorder-name">' + esc(it.name) + '</span>' +
      (i > 0 ? '<button class="btn ghost icon-btn" data-act="moveUp" data-i="' + i + '" aria-label="上へ">' + Icon('up', 20) + '</button>' : '<span class="icon-space"></span>') +
      (i < dr.items.length - 1 ? '<button class="btn ghost icon-btn" data-act="moveDown" data-i="' + i + '" aria-label="下へ">' + Icon('down', 20) + '</button>' : '<span class="icon-space"></span>') + '</div>';
  }).join('') + '</div>';
  if (dr.type === 'チーム') {
    html += '<p class="muted small">変えた順番はこの端末に保存され、次回もその順番で始まります。' +
      (Store.get(orderKey(dr.day), null) ? ' <button class="btn ghost small" data-act="resetOrder">元の順番に戻す</button>' : '') + '</p>';
  }
  return html;
}

function onSetInput(el) {
  var it = S.draft.items[el.dataset.i], s = it.sets[el.dataset.j];
  if (el.dataset.act === 'w') {
    s.w = el.value === '' ? '' : Number(el.value);
    // まだ重量が空のあとのセットにも同じ重量を入れておく（毎セット入力しなくて済むように）
    // 画面は描き直さず、入れた欄だけ書き換える（描き直すと、続けて押した ✓ のタップが消えてしまうため）
    for (var k = Number(el.dataset.j) + 1; k < it.sets.length; k++) {
      if (!it.sets[k].done && it.sets[k].w === '') {
        it.sets[k].w = s.w;
        var box = app.querySelector('input[data-act="w"][data-i="' + el.dataset.i + '"][data-j="' + k + '"]');
        if (box) box.value = s.w;
      }
    }
    saveDraft();
    return;
  }
  s.r = el.value === '' ? '' : Number(el.value);
  saveDraft();
}

function toggleSet(i, j) {
  var it = S.draft.items[i], s = it.sets[j];
  s.done = !s.done;
  saveDraft();
  renderSession();
  if (s.done) afterSetDone(i, '');
}

/**
 * セットが終わったあとの案内（レストタイマーと読み上げ）。
 * prefix: 先に読み上げる言葉（音声で記録したときの「〇〇を記録しました」など）
 */
function afterSetDone(i, prefix) {
  var it = S.draft.items[i];
  if (it.sets.every(function (x) { return x.done; })) {
    var next = currentIndex();
    if (next >= 0) {
      Timer.start(it.rest, '');
      // 種目が1つ終わるたびに、残りの種目を伝えて、次にやる種目を選んでもらう（順番は選手が決める）
      var remaining = remainingItems();
      var names = remaining.map(function (r) { return r.name; });
      Speech.speak(prefix + (Speech.brief()
        ? it.name + '、終わり！' + (names.length > 1 ? '残りは、' + names.join('、') + '。次はどれにする？' : 'あとは' + names[0] + 'だけ！')
        : it.name + '、おつかれさまでした。' + (names.length > 1 ? '残りは、' + names.join('、') + 'の' + names.length + '種目です。次はどれにしますか？'
                                                                : '残りは' + names[0] + 'だけです。')));
      if (window.showRemaining) showRemaining(remaining, names.length > 1 ? 'next' : 'last');
    } else {
      Timer.stop();
      Speech.speak(prefix + (Speech.brief() ? '全部終わり！おつかれさま。「おわる」で保存してね。' : 'すべての種目が終わりました。右上の「おわる」を押して、保存してください。'));
    }
  } else {
    if (it.rest) Timer.start(it.rest, '次のセットです。');
    if (prefix) Speech.speak(prefix + (it.rest ? 'レスト' + it.rest + (Speech.brief() ? '秒。' : '秒です。') : ''));
  }
}

/** まだ終わっていない種目の一覧（今の並び順。index は S.draft.items の中の位置） */
function remainingItems() {
  var list = [];
  S.draft.items.forEach(function (it, i) {
    if (it.sets.some(function (x) { return !x.done; })) list.push({ name: it.name, index: i });
  });
  return list;
}

function addItem() {
  var name = document.getElementById('addName').value.trim();
  if (!name) return;
  var ex = findExercise(name);
  S.draft.items.push(makeItem({ name: ex ? ex.name : name, category: ex ? ex.category : '' }, false));
  saveDraft();
  renderSession();
}

/** 正式名か呼び方の候補から種目マスタの種目を探す */
function findExercise(name) {
  var norm = function (s) { return String(s).normalize('NFKC').replace(/[\s・\-ー_]/g, '').toLowerCase(); };
  var n = norm(name);
  return S.home.exercises.filter(function (e) {
    return norm(e.name) === n || e.aliases.split(/[、,，\/]/).some(function (a) { return a.trim() && norm(a) === n; });
  })[0] || null;
}

// ---------------- 終了と保存 ----------------
function renderFinish(error, notice) {
  S.view = 'finish';
  var dr = S.draft;
  var done = dr.items.filter(function (it) { return it.sets.some(function (s) { return s.done; }); });
  var setCount = done.reduce(function (n, it) { return n + it.sets.filter(function (s) { return s.done; }).length; }, 0);
  var minutes = dr.backdate ? (dr.minutes || '—') : Math.max(1, Math.round((Date.now() - new Date(dr.startedAt).getTime()) / 60000));
  var labels = ['', 'とても楽', '楽', '少し楽', 'ややきつい', 'きつい', '', 'かなりきつい', '', 'とてもきつい', '限界'];
  var tile = function (num, unit) { return '<div class="stat"><b>' + num + '</b><span>' + unit + '</span></div>'; };
  var html = '<div class="fin-head"><span class="kicker">' + esc(dr.title) + (dr.backdate ? '・<b class="late">' + backdateLabel(dr.backdate) + 'の分</b>' : '') + '</span><h1>おつかれさま！</h1>' +
    '<div class="stats">' + tile(done.length, '種目') + tile(setCount, 'セット') + tile(minutes, '分') + '</div>' +
    '<p class="muted small">' + (done.length ? '✓を付けたセットだけが保存されます。' : '✓が付いたセットがまだありません。「トレーニングに戻る」で✓を付けてね。') + '</p></div>';
  // 記録し忘れた日の分（カレンダーの日付から始めたとき）は、かかった時間を入れられる（v28：日付はカレンダーで選ぶので、ここでは選ばない）
  var bd = dr.backdate || 0;
  if (bd) html += '<section class="sec"><label for="finMinutes">かかった時間（分）<span class="muted small">　わかれば</span></label>' +
    '<input id="finMinutes" class="input-pill" type="number" inputmode="numeric" min="0" max="600" placeholder="例：60" value="' + esc(dr.minutes || '') + '"></section>';
  // きつさ（sRPE）：丸いボタン 1〜10。保存は画面の下の「記録を保存する」（dock.js）
  html += '<section class="sec"><h2>' + (bd ? 'その日の' : '今日の') + 'きつさは？</h2><div class="rpe">';
  for (var i = 1; i <= 10; i++) html += '<button class="' + (dr.srpe === i ? 'on' : '') + '" data-act="rpe" data-v="' + i + '" aria-label="きつさ' + i + '">' + i + '</button>';
  html += '</div><div class="rpe-scale"><span>1 とても楽</span><span>10 限界</span></div>' +
    (dr.srpe ? '<div class="rpe-pill">' + dr.srpe + (labels[dr.srpe] ? '：' + labels[dr.srpe] : '') + '</div>' : '') + '</section>';
  html += MyMenu.finishCard(dr, notice);   // 自分のメニューで記録したときは、その内容をメニューとして保存できる
  html += msgHtml('error', error);
  html += '<button class="btn ghost block" data-act="back">トレーニングに戻る</button>';
  app.innerHTML = html;
}

function buildPayload() {
  var dr = S.draft, startedAt = dr.startedAt, endedAt = new Date().toISOString(), extra = {};
  if (dr.backdate) {
    // 記録し忘れた日の分：その日の、トレーニングを始めた時刻にする（時間は入れた分。入れていなければ60分として送る）
    var t = new Date(); t.setDate(t.getDate() - dr.backdate);
    var s0 = new Date(dr.startedAt); t.setHours(s0.getHours(), s0.getMinutes(), 0, 0);
    var min = Number(dr.minutes) || 0;
    startedAt = t.toISOString(); endedAt = new Date(t.getTime() + (min || 60) * 60000).toISOString();
    extra = { backdated: dr.backdate, minutes: min || '', enteredAt: new Date().toISOString() };
  }
  var p = { id: dr.id, startedAt: startedAt, endedAt: endedAt, type: dr.type, menuId: dr.menuId,
    day: dr.day, dayName: dr.dayName, srpe: dr.srpe || '', myMenuName: dr.myMenuName || '',
    items: dr.items.map(function (it) {
      return { name: it.name, planned: it.planned, rir: it.rir, method: it.method,
               sets: it.sets.filter(function (s) { return s.done; }).map(function (s) { return { w: s.w, r: s.r }; }) };
    }).filter(function (it) { return it.sets.length; }) };
  for (var k in extra) p[k] = extra[k];
  return p;
}

/** 終了画面の「かかった時間（分）」を記録に取り込む */
function readFinishMinutes() {
  var el = document.getElementById('finMinutes');
  if (el && S.draft) { S.draft.minutes = el.value === '' ? '' : Math.max(0, Math.min(600, Number(el.value) || 0)); saveDraft(); }
}

function save() {
  var payload = buildPayload();
  var pending = Store.get('pending', []);
  pending.push(payload);
  Store.set('pending', pending);           // 先に端末に残してから送る（送信に失敗しても消えない）
  S.draft = null; saveDraft(); Timer.stop();
  app.innerHTML = '<div class="loading">保存中…</div>';
  sendPending().then(function (msg) { loadHome(msg); })
    .catch(function (err) {
      if (err.needLogin) { Store.remove('token'); S.token = null; renderLogin(err.message + '（記録は端末に残っています）'); return; }
      loadHome(null);
      setTimeout(function () { alert('送信できませんでした。記録は端末に残っているので、あとで「今すぐ送信する」を押してください。\n' + err.message); }, 300);
    });
}

/** 端末に残っている未送信の記録を、古い順に1件ずつ送る */
function sendPending() {
  var pending = Store.get('pending', []);
  if (!pending.length) return Promise.resolve('');
  return Api.call('saveSession', { token: S.token, session: pending[0] }).then(function (res) {
    pending.shift();
    Store.set('pending', pending);
    return pending.length ? sendPending() : res.message;
  });
}

// ---------------- レストタイマー ----------------
var Timer = {
  el: document.getElementById('timer'), left: 0, total: 0, handle: null, after: '', endAt: 0,
  start: function (sec, after) {
    this.stop();
    if (!sec) return;
    this.endAt = Date.now() + sec * 1000;   // 終わる時刻で数える（画面を消していてもずれにくい）
    this.total = sec;
    this.after = after || ''; this.update();
    var self = this;
    this.handle = setInterval(function () { self.update(); }, 250);
  },
  /** 残り時間を計算して表示し、残り3秒からは短い音、0になったらアラーム */
  update: function () {
    var left = Math.max(0, Math.ceil((this.endAt - Date.now()) / 1000));
    if (left !== this.left && left > 0 && left <= 3) Sound.tick();
    this.left = left;
    if (left <= 0) { this.finish(); return; }
    this.render();
  },
  finish: function () {
    this.stop();
    Sound.alarm();
    if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
    // レスト終了は声ではなくチャイムだけで知らせる（読み上げにしたい場合は Speech.speak('レスト終了。' + this.after) を足す）
  },
  addSeconds: function (sec) { this.endAt += sec * 1000; this.total += sec; this.update(); },
  stop: function () { clearInterval(this.handle); this.handle = null; this.el.innerHTML = ''; },
  /** 画面の下のバー（dock.js）に、丸い残り時間・「+30秒」「スキップ」を出す。2回目からは数字と輪だけ書き換える */
  render: function () {
    var m = Math.floor(this.left / 60), s = ('0' + (this.left % 60)).slice(-2);
    var p = Math.round(this.left / Math.max(1, this.total) * 100);
    if (!this.el.querySelector('.timer')) {
      this.el.innerHTML = '<div class="timer"><div class="timer-ring"><span class="time"></span></div><span class="timer-label">休けい</span>' +
        '<button class="btn sub btn-pill" data-act="plus30">+30秒</button><button class="btn sub btn-pill" data-act="skip">スキップ</button></div>';
    }
    this.el.querySelector('.time').textContent = m + ':' + s;
    this.el.querySelector('.timer-ring').style.setProperty('--p', p + '%');
  }
};
// 別のアプリから戻ってきたときに、残り時間をすぐ更新する（過ぎていればアラーム）
document.addEventListener('visibilitychange', function () { if (!document.hidden && Timer.handle) Timer.update(); });
Timer.el.addEventListener('click', function (e) {
  var t = e.target.closest('[data-act]');
  if (!t) return;
  if (t.dataset.act === 'skip') Timer.stop();
  if (t.dataset.act === 'plus30') Timer.addSeconds(30);
});

// ---------------- 操作の振り分け ----------------
// data-act の付いたボタンを押したときの動き。画面の下のバー（dock.js）のボタンもここを通る
app.addEventListener('click', function (e) {
  var t = e.target.closest('[data-act]');
  if (!t || t.tagName === 'INPUT') return;
  onAct(t);
});

function onAct(t) {
  var i = Number(t.dataset.i), j = Number(t.dataset.j), dr = S.draft;
  // トレーニング記録のカレンダーから「この日の分を追加」したとき（v27）：何日前の分かを覚えてから始める
  if (t.dataset.bd !== undefined && /startDay|startFree/.test(t.dataset.act)) S.backdate = Number(t.dataset.bd) || 0;
  switch (t.dataset.act) {
    case 'login': doLogin(); break;
    case 'logout': logout(); break;
    case 'reload': loadHome(); break;
    case 'resend': app.innerHTML = '<div class="loading">送信中…</div>';
      sendPending().then(function (m) { loadHome(m); }).catch(function (err) { loadHome(); alert(err.message); }); break;
    case 'resume': renderSession(); break;
    case 'discard': if (confirm('途中の記録を破棄しますか？')) { S.draft = null; saveDraft(); renderHome(); } break;
    case 'speakSuggest': Speech.speak(suggestText()); break;
    case 'startDay': startDay(t.dataset.day); break;
    case 'startFree': startFree(); break;
    case 'body': Body.showMine(); break;
    case 'records': History.show(); break;
    case 'avatarSettings': if (window.Avatar && typeof Avatar.openAppearancePicker === 'function') Avatar.openAppearancePicker(); else alert('トレーナー設定を読み込めませんでした。ページを再読み込みしてください。'); break;
    case 'home': if (S.view === 'session') S.reorder = false;
      Timer.stop(); Speech.stop(); Body.closeHistory(); renderHome(); break;
    case 'speakItem': Speech.speak(Speech.exerciseText(dr.items[i], latestOf(dr.items[i].name), true)); break;   // 🔊 は短めの設定でも全部読む
    case 'speakCurrent': var c = currentIndex();
      Speech.speak(c < 0 ? 'すべての種目が終わっています。' : Speech.exerciseText(dr.items[c], latestOf(dr.items[c].name), true)); break;
    case 'speakNext': var cur = currentIndex(), nx = cur < 0 ? -1 : cur + 1;
      Speech.speak(nx > 0 && nx < dr.items.length ? '次は' + Speech.exerciseText(dr.items[nx], latestOf(dr.items[nx].name)) :
        (cur >= 0 ? '今の' + dr.items[cur].name + 'が最後の種目です。' : 'すべての種目が終わっています。')); break;
    case 'wStep': var s = dr.items[i].sets[j];
      // 空欄のときは、ひとつ前のセットの重量から増減する
      var base = s.w !== '' ? Number(s.w) : (j > 0 ? Number(dr.items[i].sets[j - 1].w) || 0 : 0);
      s.w = Math.max(0, Math.round((base + Number(t.dataset.d) * S.home.weightStep) * 10) / 10);
      saveDraft(); renderSession(); break;
    case 'toggle': toggleSet(i, j); break;
    case 'addSet': var arr = dr.items[i].sets, lastSet = arr[arr.length - 1];
      arr.push({ w: lastSet.w, r: lastSet.r, done: false }); saveDraft(); renderSession(); break;
    case 'removeSet': dr.items[i].sets.pop(); saveDraft(); renderSession(); break;
    case 'removeItem': dr.items.splice(i, 1); saveDraft(); renderSession(); break;
    case 'moveUp': moveItem(i, -1); break;
    case 'moveDown': moveItem(i, 1); break;
    case 'resetOrder': if (confirm('メニューの元の順番に戻しますか？')) resetOrder(); break;
    case 'addItem': addItem(); break;
    case 'finish': renderFinish(); break;
    case 'rpe': readFinishMinutes(); dr.srpe = Number(t.dataset.v); saveDraft(); renderFinish(); break;
    case 'back': renderSession(); break;
    case 'save': readFinishMinutes(); save(); break;
    // v20：トレーニング中の画面（つぎにやる種目・終わった種目を直す・順番の入れ替え）
    case 'pickNext': moveToCurrent(i);
      if (VoiceUI.box.querySelector('[data-remain]')) VoiceUI.box.hidden = true;
      Speech.speak('次は' + Speech.exerciseText(dr.items[currentIndex()], latestOf(dr.items[currentIndex()].name))); break;
    case 'openItem': S.openItem = i >= 0 ? i : null; renderSession(); break;
    case 'toggleReorder': S.reorder = !S.reorder; renderSession(); break;
  }
}
app.addEventListener('change', function (e) {
  if (e.target.dataset.act === 'w' || e.target.dataset.act === 'r') onSetInput(e.target);
});
app.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && S.view === 'login') doLogin();
});

// すべてのファイル（mymenu.js・avatar.js など）を読み込んでから始める
document.addEventListener('DOMContentLoaded', init);
