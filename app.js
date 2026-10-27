/**
 * app.js ― 画面の組み立てと操作
 * 画面は4つ: ログイン → ホーム → トレーニング中 → 終了（きつさの入力と保存）
 * 状態はすべて S にまとめ、変わるたびに該当する画面を描き直す。
 * トレーニング中の記録（draft）は端末に一時保存するので、画面を閉じても続きから再開できる。
 */
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
  app.innerHTML =
    '<h1>' + esc(window.APP_CONFIG.APP_NAME) + '</h1>' +
    '<div class="card"><h2>ログイン</h2>' +
    '<label for="lid">選手ID</label><input id="lid" inputmode="text" autocomplete="username" placeholder="例：26001">' +
    '<label for="lpin">PIN（4桁）</label><input id="lpin" type="password" inputmode="numeric" maxlength="4" autocomplete="current-password">' +
    msgHtml('error', error) +
    '<button class="btn block big" data-act="login">ログイン</button>' +
    '<p class="muted small">IDとPINはスタッフから受け取ってください。一度ログインすると、しばらくはこの端末で入力不要です。</p></div>';
}

function doLogin() {
  var id = document.getElementById('lid').value.trim();
  var pin = document.getElementById('lpin').value.trim();
  app.querySelector('[data-act="login"]').disabled = true;
  Api.call('login', { id: id, pin: pin }).then(function (res) {
    if (res.role !== 'athlete') { renderLogin('スタッフ用の画面は準備中です。選手IDでログインしてください。'); return; }
    S.token = res.token;
    Store.set('token', res.token);
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
  app.innerHTML = '<div class="loading">読み込み中…</div>';
  Api.call('home', { token: S.token }).then(function (res) {
    S.home = res;
    Store.set('home', res);
    renderHome(notice);
  }).catch(function (err) {
    if (err.needLogin) { Store.remove('token'); S.token = null; renderLogin(err.message); return; }
    S.home = Store.get('home', null);   // 通信できないときは前回のデータで表示する
    if (S.home) renderHome(null, '最新のデータを取得できませんでした（' + err.message + '）。前回のデータを表示しています。');
    else app.innerHTML = msgHtml('error', err.message) + '<button class="btn block" data-act="reload">もう一度読み込む</button>';
  });
}

function renderHome(notice, warning) {
  S.view = 'home';
  var h = S.home;
  var pending = Store.get('pending', []);
  var html = '<div class="topbar"><h1>' + esc(h.name) + 'さん</h1><button class="btn ghost" data-act="logout">ログアウト</button></div>';
  html += msgHtml('ok', notice) + msgHtml('warn', warning);

  if (pending.length) {
    html += '<div class="msg warn">まだ送信できていない記録が' + pending.length + '件あります。' +
      '<button class="btn sub block" data-act="resend">今すぐ送信する</button></div>';
  }
  if (S.draft) {
    html += '<div class="card"><h2>途中のトレーニングがあります</h2><p class="muted">' + esc(S.draft.title) + '</p>' +
      '<div class="row"><button class="btn" data-act="resume">続きから</button>' +
      '<button class="btn ghost" data-act="discard">記録を破棄</button></div></div>';
  }

  // 今週の進み具合
  html += '<div class="card"><h2>今週のメニュー</h2><div class="chips">';
  h.days.forEach(function (d) {
    var done = h.doneDays[d.day];
    html += '<span class="chip' + (done ? ' done' : '') + '">' + (done ? '✓ ' : '') + 'Day' + d.day +
      (d.dayName ? ' ' + esc(d.dayName) : '') + '</span>';
  });
  html += '</div></div>';

  // おすすめと開始ボタン
  html += '<div class="card"><h2>今日のおすすめ</h2><p>' + esc(h.suggestion.reason) + '</p>';
  if (h.suggestion.order.length) html += '<button class="btn sub" data-act="speakSuggest">🔊 読み上げる</button>';
  h.suggestion.order.forEach(function (dayNo, i) {
    var d = findDay(dayNo);
    html += '<button class="btn day-btn' + (i === 0 ? '' : ' sub') + '" data-act="startDay" data-day="' + d.day + '">' +
      'Day' + d.day + (d.dayName ? '（' + esc(d.dayName) + '）' : '') + 'を始める' +
      '<span class="sub-text">' + d.items.map(function (it) { return esc(it.name); }).join('・') + '</span></button>';
  });
  var doneList = h.days.filter(function (d) { return h.doneDays[d.day]; });
  if (doneList.length) {
    html += '<details class="muted small" style="margin-top:12px"><summary>今週実施済みのDayをもう一度やる</summary>';
    doneList.forEach(function (d) {
      html += '<button class="btn sub day-btn" data-act="startDay" data-day="' + d.day + '">Day' + d.day + ' をもう一度</button>';
    });
    html += '</details>';
  }
  html += '<button class="btn sub block" data-act="startFree">自分のメニューで記録する</button></div>';

  if (h.last) {
    html += '<p class="muted small">前回: ' + esc(h.last.date) + '（' + esc(h.last.type) +
      (h.last.day ? ' Day' + esc(h.last.day) : '') + '）</p>';
  }
  app.innerHTML = html;
}

function findDay(dayNo) { return S.home.days.filter(function (d) { return d.day === Number(dayNo); })[0]; }

function suggestText() {
  var h = S.home, d = findDay(h.suggestion.order[0]);
  return h.name + 'さん、' + h.suggestion.reason.replace(/Day(\d+)/g, 'デイ$1') + '最初の種目は' + d.items[0].name + 'です。';
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
  S.draft = { id: newId(), startedAt: new Date().toISOString(), type: 'チーム', menuId: S.home.menuId,
              day: d.day, dayName: d.dayName, title: 'Day' + d.day + (d.dayName ? '（' + d.dayName + '）' : ''),
              items: d.items.map(function (it) { return makeItem(it, true); }) };
  saveDraft();
  renderSession();
  Speech.speak(Speech.dayText(d.day) + 'を始めます。最初は' + Speech.exerciseText(d.items[0], latestOf(d.items[0].name)));
}

function startFree() {
  if (S.draft && !confirm('途中のトレーニングの記録を破棄して、新しく始めますか？')) return;
  S.draft = { id: newId(), startedAt: new Date().toISOString(), type: '個別', title: '自分のメニュー', items: [] };
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

function renderSession() {
  S.view = 'session';
  var dr = S.draft, cur = currentIndex();
  var html = '<div class="topbar"><h1>' + esc(dr.title) + '</h1><button class="btn ghost" data-act="home">ホームへ</button></div>';
  html += '<div class="speak-bar"><button class="btn sub" data-act="speakCurrent">🔊 今の種目</button>' +
          '<button class="btn sub" data-act="speakNext">次は？</button></div>';
  if (!dr.items.length) html += '<p class="muted">下の欄から種目を追加してください。</p>';

  dr.items.forEach(function (it, i) {
    var finished = it.sets.every(function (s) { return s.done; });
    var last = latestOf(it.name);
    html += '<div class="card ex' + (i === cur ? ' current' : '') + (finished ? ' finished' : '') + '">';
    html += '<div class="ex-head"><div><span class="ex-name">' + esc(it.name) + '</span>' +
      (it.category ? '<span class="badge">' + esc(it.category) + '</span>' : '') +
      (it.planned ? '' : '<span class="badge off">メニュー外</span>') + '</div>' +
      '<button class="btn ghost" data-act="speakItem" data-i="' + i + '">🔊</button></div>';
    if (it.planned) {
      html += '<div class="plan">' + it.planned.reps + '回 × ' + it.planned.sets + 'セット' +
        (it.rest ? '・レスト' + it.rest + '秒' : '') + (it.rir && it.rir !== '-' ? '・RIR' + esc(it.rir) : '') + '</div>';
      var tt = Speech.tempoText(it.tempo);
      if (tt) html += '<div class="muted small">テンポ ' + esc(it.tempo) + '：' + esc(tt) + '</div>';
    }
    html += '<div class="muted small">前回：' + (last ? esc(last.sets) + '（' + esc(last.date) + '）' : '記録なし') + '</div>';
    html += '<table class="sets">';
    it.sets.forEach(function (s, j) {
      html += '<tr class="' + (s.done ? 'done-set' : '') + '"><td class="no">' + (j + 1) + '</td>' +
        '<td><button class="step" data-act="wStep" data-i="' + i + '" data-j="' + j + '" data-d="-1">−</button></td>' +
        '<td><input type="number" inputmode="decimal" step="0.5" min="0" value="' + esc(s.w) + '" data-act="w" data-i="' + i + '" data-j="' + j + '" aria-label="重量"><div class="unit">kg</div></td>' +
        '<td><button class="step" data-act="wStep" data-i="' + i + '" data-j="' + j + '" data-d="1">＋</button></td>' +
        '<td><input type="number" inputmode="numeric" min="0" value="' + esc(s.r) + '" data-act="r" data-i="' + i + '" data-j="' + j + '" aria-label="回数"><div class="unit">回</div></td>' +
        '<td><button class="check' + (s.done ? ' on' : '') + '" data-act="toggle" data-i="' + i + '" data-j="' + j + '">✓</button></td></tr>';
    });
    html += '</table><div class="row" style="margin-top:6px">' +
      '<button class="btn ghost" data-act="addSet" data-i="' + i + '">＋セット</button>' +
      (it.sets.length > 1 ? '<button class="btn ghost" data-act="removeSet" data-i="' + i + '">−セット</button>' : '') +
      (it.planned ? '' : '<button class="btn ghost" data-act="removeItem" data-i="' + i + '">種目を削除</button>') + '</div></div>';
  });

  html += '<div class="card"><label for="addName">種目を追加</label><div class="row">' +
    '<input id="addName" list="exList" placeholder="例：デッドリフト" style="flex:1">' +
    '<button class="btn" data-act="addItem">追加</button></div><datalist id="exList">' +
    S.home.exercises.map(function (e) { return '<option value="' + esc(e.name) + '">'; }).join('') + '</datalist></div>';
  html += '<button class="btn block big" data-act="finish">終了して保存へ</button>';
  app.innerHTML = html;
}

function onSetInput(el) {
  var it = S.draft.items[el.dataset.i], s = it.sets[el.dataset.j];
  if (el.dataset.act === 'w') {
    s.w = el.value === '' ? '' : Number(el.value);
    // まだ重量が空のあとのセットにも同じ重量を入れておく（毎セット入力しなくて済むように）
    var filled = false;
    for (var k = Number(el.dataset.j) + 1; k < it.sets.length; k++) {
      if (!it.sets[k].done && it.sets[k].w === '') { it.sets[k].w = s.w; filled = true; }
    }
    saveDraft();
    if (filled) renderSession();
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
      Timer.start(it.rest, '次は' + S.draft.items[next].name + 'です。');
      Speech.speak(prefix + it.name + '、おつかれさまでした。次は' + S.draft.items[next].name + 'です。');
    } else {
      Timer.stop();
      Speech.speak(prefix + 'すべての種目が終わりました。終了して保存を押してください。');
    }
  } else {
    if (it.rest) Timer.start(it.rest, '次のセットです。');
    if (prefix) Speech.speak(prefix + (it.rest ? 'レスト' + it.rest + '秒です。' : ''));
  }
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
function renderFinish(error) {
  S.view = 'finish';
  var dr = S.draft;
  var done = dr.items.filter(function (it) { return it.sets.some(function (s) { return s.done; }); });
  var setCount = done.reduce(function (n, it) { return n + it.sets.filter(function (s) { return s.done; }).length; }, 0);
  var labels = ['', 'とても楽', '楽', '少し楽', 'ややきつい', 'きつい', '', 'かなりきつい', '', 'とてもきつい', '限界'];
  var html = '<h1>おつかれさまでした</h1><div class="card"><p>' + done.length + '種目・' + setCount + 'セットを記録します。</p>' +
    '<p class="muted small">✓を付けたセットだけが保存されます。</p></div>';
  html += '<div class="card"><h2>今日のトレーニングのきつさ（sRPE）</h2><div class="rpe">';
  for (var i = 1; i <= 10; i++) html += '<button class="' + (dr.srpe === i ? 'on' : '') + '" data-act="rpe" data-v="' + i + '">' + i + '</button>';
  html += '</div><p class="muted small">' + (dr.srpe ? dr.srpe + '：' + (labels[dr.srpe] || '') : '1（とても楽）〜10（限界）') + '</p></div>';
  html += msgHtml('error', error);
  html += '<button class="btn block big" data-act="save"' + (done.length ? '' : ' disabled') + '>保存する</button>' +
          '<button class="btn sub block" data-act="back">トレーニングに戻る</button>';
  app.innerHTML = html;
}

function buildPayload() {
  var dr = S.draft;
  return { id: dr.id, startedAt: dr.startedAt, endedAt: new Date().toISOString(), type: dr.type, menuId: dr.menuId,
    day: dr.day, dayName: dr.dayName, srpe: dr.srpe || '',
    items: dr.items.map(function (it) {
      return { name: it.name, planned: it.planned, rir: it.rir, method: it.method,
               sets: it.sets.filter(function (s) { return s.done; }).map(function (s) { return { w: s.w, r: s.r }; }) };
    }).filter(function (it) { return it.sets.length; }) };
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
  el: document.getElementById('timer'), left: 0, handle: null, after: '', endAt: 0,
  start: function (sec, after) {
    this.stop();
    if (!sec) return;
    this.endAt = Date.now() + sec * 1000;   // 終わる時刻で数える（画面を消していてもずれにくい）
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
  addSeconds: function (sec) { this.endAt += sec * 1000; this.update(); },
  stop: function () { clearInterval(this.handle); this.handle = null; this.el.innerHTML = ''; },
  render: function () {
    var m = Math.floor(this.left / 60), s = ('0' + (this.left % 60)).slice(-2);
    this.el.innerHTML = '<div class="timer"><div><div class="small">レスト</div><div class="time">' + m + ':' + s + '</div></div>' +
      '<div class="row"><button class="btn" data-act="plus30">+30秒</button><button class="btn" data-act="skip">スキップ</button></div></div>';
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
app.addEventListener('click', function (e) {
  var t = e.target.closest('[data-act]');
  if (!t || t.tagName === 'INPUT') return;
  var i = Number(t.dataset.i), j = Number(t.dataset.j), dr = S.draft;
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
    case 'home': Timer.stop(); Speech.stop(); renderHome(); break;
    case 'speakItem': Speech.speak(Speech.exerciseText(dr.items[i], latestOf(dr.items[i].name))); break;
    case 'speakCurrent': var c = currentIndex();
      Speech.speak(c < 0 ? 'すべての種目が終わっています。' : Speech.exerciseText(dr.items[c], latestOf(dr.items[c].name))); break;
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
    case 'addItem': addItem(); break;
    case 'finish': renderFinish(); break;
    case 'rpe': dr.srpe = Number(t.dataset.v); saveDraft(); renderFinish(); break;
    case 'back': renderSession(); break;
    case 'save': save(); break;
  }
});
app.addEventListener('change', function (e) {
  if (e.target.dataset.act === 'w' || e.target.dataset.act === 'r') onSetInput(e.target);
});
app.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && S.view === 'login') doLogin();
});

init();
