/**
 * history.js ― 選手が自分のトレーニング記録を見る画面（Phase 3u）
 *
 *   History.show(month, after) … 記録のカレンダーを開く（month は 'yyyy-MM'。省略すると今月）
 *   カレンダーでトレーニングした日に印が付き、日付をタップするとその日の種目とセットが下に出る。
 *   見られるのは今年度の記録（‹ › で月を切り替え）。データは Apps Script の myHistory（履歴.gs）から取る。
 *   音声：「記録を見せて」で開く、「今週何回やった？」で回数を答える（commands.js）。
 *   v27：今日から3日前（MAX_BACKDATE_DAYS）までの日は、記録が無くてもタップでき、その日の分を追加できる。
 *        それより前の日は追加できない（サーバーの 記録.gs でもはじく）。
 */
var History = {
  data: null,        // 今表示している月のデータ（myHistory の返事）
  selected: '',      // 下に詳しく出している日（'yyyy-MM-dd'）
  addOpen: '',       // 記録がある日で「メニューを追加」を押して、メニューのボタンを出している日
  WEEK: ['月', '火', '水', '木', '金', '土', '日'],   // カレンダーは月曜はじまり

  /** 記録の画面を開く。after: 表示し終わったあとにすること（音声で開いたときの読み上げなど） */
  show: function (month, after) {
    S.view = 'history';
    // v62：下のバーなどから開き直したとき（month を渡さないとき）は、前に見ていた月と日をそのまま出す
    var keep = month === undefined && History.data ? { month: History.data.month, sel: History.selected } : null;
    if (keep) month = keep.month === History.data.current ? '' : keep.month;
    app.innerHTML = '<div class="loading">読み込み中…</div>';
    History.load(month).then(function () {
      if (keep && keep.sel && keep.sel.slice(0, 7) === History.data.month) History.selected = keep.sel;
      if (S.view !== 'history') return;   // 読み込み中にほかの画面へ移ったときは描かない
      History.render();
      if (after) after();
    }).catch(function (err) {
      app.innerHTML = msgHtml('error', err.message) + '<button class="btn block" data-act="home">ホームへ</button>';
    });
  },

  /** データだけ読む（画面は変えない）。音声で回数を聞かれたときにも使う */
  load: function (month) {
    return Api.call('myHistory', { token: S.token, month: month || '' }).then(function (res) {
      History.data = res;
      var days = History.trainedDays();
      // 最初に詳しく出す日：今日に記録があれば今日、なければその月の最後に記録した日
      var today = Body.today();
      History.selected = days[today] ? today : (res.sessions.length ? res.sessions[res.sessions.length - 1].date : '');
      return res;
    });
  },

  /** その日が今日から何日前か（今日=0。未来は -1） */
  daysAgo: function (key) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key); if (!m) return 999;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])), t = new Date();
    t.setHours(0, 0, 0, 0);
    return Math.round((t - d) / 86400000);
  },
  /** その日の分を追加できるか（今日〜3日前） */
  canAdd: function (key) { var n = History.daysAgo(key); return n >= 0 && n <= MAX_BACKDATE_DAYS; },

  /** その月にトレーニングした日 → { 'yyyy-MM-dd': [セッション…] } */
  trainedDays: function () {
    var map = {};
    (History.data ? History.data.sessions : []).forEach(function (s) { (map[s.date] = map[s.date] || []).push(s); });
    return map;
  },

  render: function () {
    if (S.view !== 'history') return;
    var d = History.data, days = History.trainedDays();
    var y = Number(d.month.slice(0, 4)), m = Number(d.month.slice(5, 7));
    var monthCount = d.sessions.length, dayCount = Object.keys(days).length;
    // いちばん上：その月に何日やったか（v20：レイアウト案 2a）
    // v30：見出し・回数のまとめ・今年度の月ごとの回数 は1枚にまとめる（似た内容なので）
    var html = '<div class="group hist-top"><div class="topbar"><span class="kicker">トレーニング記録</span><button class="btn ghost" data-act="home">ホームへ</button></div>' +
      '<div class="hist-summary"><span class="big-num">' + (d.month === d.current ? '今月' : m + '月') + 'は<em> ' + dayCount + '日 </em>' +
      (dayCount ? 'がんばったね' : 'まだ記録がないよ') + '</span>' +
      '<span class="muted small">' + (monthCount !== dayCount ? 'この月 ' + monthCount + '回・' : '') + '今週 ' + d.weekCount + '回・今年度 ' + d.yearCount + '回</span></div>' +
      '<div class="hist-months">' + d.months.map(function (mo) {
        return '<button class="hist-mbtn' + (mo.month === d.month ? ' on' : '') + '" data-hist-month="' + mo.month + '">' +
          Number(mo.month.slice(5, 7)) + '月<b>' + mo.count + '</b></button>';
      }).join('') + '</div></div>';
    // 月の切り替え
    // カレンダーと、選んだ日の記録は1枚にまとめる（v30）
    html += '<div class="hist-grid"><div class="hist-col"><div class="group hist-calcard"><div class="hist-month">' +
      '<button class="btn ghost hist-nav" data-hist-month="' + History.shift(d.month, -1) + '"' + (d.month <= d.fyStart ? ' disabled' : '') + ' aria-label="前の月">‹</button>' +
      '<div class="hist-title">' + y + '年' + m + '月</div>' +
      '<button class="btn ghost hist-nav" data-hist-month="' + History.shift(d.month, 1) + '"' + (d.month >= d.current ? ' disabled' : '') + ' aria-label="次の月">›</button></div>';
    // カレンダー
    html += '<div class="hist-cal">' + History.WEEK.map(function (w, i) {
      return '<div class="hist-wd' + (i === 5 ? ' sat' : i === 6 ? ' sun' : '') + '">' + w + '</div>';
    }).join('');
    var first = new Date(y, m - 1, 1), lastDay = new Date(y, m, 0).getDate();
    var lead = (first.getDay() + 6) % 7;   // 月曜はじまりで、1日の前の空きマス
    for (var k = 0; k < lead; k++) html += '<div class="hist-day empty"></div>';
    var today = Body.today();
    for (var day = 1; day <= lastDay; day++) {
      var key = d.month + '-' + ('0' + day).slice(-2), list = days[key];
      // 丸の色：チームメニューがあった日は青、自分のメニュー・白紙だけの日は赤
      var mineOnly = list && list.every(function (s) { return s.type !== 'チーム'; });
      var cond = History.data.conditions && History.data.conditions[key];   // v62：コンディションを記録した日には小さな印
      var liked = History.likedDays()[key];   // v73：スタッフのいいねがある日
      var cls = 'hist-day' + (list ? ' done' : '') + (mineOnly ? ' mine-only' : '') + (key === today ? ' today' : '') + (key === History.selected ? ' sel' : '') + (key > today ? ' future' : '') + (cond ? ' has-cond' : '') + (liked ? ' has-like' : '');
      var addable = History.canAdd(key);   // 記録が無くても、3日前までは押して追加できる
      if (addable && !list) cls += ' addable';
      html += '<button class="' + cls + '" data-hist-day="' + key + '"' + (list || addable || cond ? '' : ' disabled') + '>' +
        '<span class="hist-num">' + day + '</span>' + (liked ? '<span class="hist-like" aria-label="いいねあり">♥</span>' : '') +
        (list && list.length > 1 ? '<span class="hist-mark">' + list.map(function (s) { return '<i class="' + History.kindClass(s) + '"></i>'; }).join('') + '</span>' : '') +
        '</button>';
    }
    html += '</div>';
    html += '<div class="hist-legend muted small"><span><i class="team"></i>チームメニュー</span><span><i class="mine"></i>自分のメニュー・白紙</span><span><i class="cond"></i>コンディション</span><span><i class="add"></i>追加できる日（' + MAX_BACKDATE_DAYS + '日前まで）</span><span><b class="hist-like-legend">♥</b>スタッフのいいね</span></div>';
    html += '</div></div><div class="hist-col">';
    // 選んだ日の詳しい記録（v62：前後の記録のある日へ移れる）
    html += History.dayNavHtml() + History.detailHtml(History.selected, days[History.selected]);
    // v62：この月のコンディションの一覧（新しい順。押すとその日を選ぶ）
    html += History.condListHtml();
    html += '</div></div>';
    app.innerHTML = html;
  },

  // ---- v73：スタッフのいいね（myHistory の likes。トレーニング＝セッションID、コンディション＝日付） ----
  likesFor: function (kind, target) {
    return ((History.data && History.data.likes) || []).filter(function (l) { return l.kind === kind && l.target === String(target); });
  },
  /** いいねのある日 { 'yyyy-MM-dd': true } */
  likedDays: function () {
    var out = {}, d = History.data;
    if (!d || !d.likes) return out;
    var dateOf = {};
    (d.sessions || []).forEach(function (s) { dateOf[s.id] = s.date; });
    d.likes.forEach(function (l) { var k = l.kind === 'training' ? dateOf[l.target] : l.target; if (k) out[k] = true; });
    return out;
  },
  /** いいねの一覧（だれが・ひとこと） */
  likeHtml: function (kind, target) {
    var list = History.likesFor(kind, target);
    if (!list.length) return '';
    return '<ul class="like-list like-mine">' + list.map(function (l) {
      return '<li>♥ <b>' + esc(l.staffName || 'スタッフ') + '</b>さんがいいね' + (l.comment ? '「' + esc(l.comment) + '」' : '') + '</li>';
    }).join('') + '</ul>';
  },

  /** v62：記録（トレーニングかコンディション）のある日の一覧（古い順） */
  recordDays: function () {
    var map = History.trainedDays(), c = (History.data && History.data.conditions) || {};
    Object.keys(c).forEach(function (k) { if (k.slice(0, 7) === History.data.month) map[k] = map[k] || []; });
    return Object.keys(map).sort();
  },
  /** v62：前・次の記録のある日へ */
  dayNavHtml: function () {
    var all = History.recordDays(), sel = History.selected;
    if (!all.length) return '';
    var prev = all.filter(function (k) { return k < sel; }).pop(), next = all.filter(function (k) { return k > sel; })[0];
    var b = function (k, label, cls) { return k ? '<button class="btn ghost small ' + cls + '" data-hist-day="' + k + '">' + label + '</button>' : '<span></span>'; };
    return '<div class="hist-daynav">' + b(prev, '‹ 前の記録（' + (prev ? Number(prev.slice(5, 7)) + '/' + Number(prev.slice(8)) : '') + '）', 'prev') +
      b(next, '次の記録（' + (next ? Number(next.slice(5, 7)) + '/' + Number(next.slice(8)) : '') + '） ›', 'next') + '</div>';
  },
  /** v62：この月のコンディション（myHistory の conditions。新しい順） */
  condListHtml: function () {
    var c = (History.data && History.data.conditions) || {}, keys = Object.keys(c).filter(function (k) { return k.slice(0, 7) === History.data.month; }).sort().reverse();
    var html = '<div class="group hist-condlist"><h2>この月のコンディション</h2>';
    if (!keys.length) return html + '<p class="muted small">この月のコンディションの記録はまだないよ。</p></div>';
    html += '<table class="line-table cond-hist"><thead><tr><th>日付</th><th class="r">全身</th><th class="r">上</th><th class="r">下</th><th class="r">動き</th></tr></thead><tbody>' +
      keys.map(function (k) {
        var x = c[k], v = function (n) { return n === '' || n === undefined ? '-' : esc(n); };
        return '<tr class="' + (k === History.selected ? 'sel' : '') + '"><td><button class="link" data-hist-day="' + k + '">' + Number(k.slice(5, 7)) + '/' + Number(k.slice(8)) + '</button></td>' +
          '<td class="r">' + v(x.whole) + '</td><td class="r">' + v(x.upper) + '</td><td class="r">' + v(x.lower) + '</td><td class="r">' + v(x.perf) + '</td></tr>';
      }).join('') + '</tbody></table><p class="muted small">疲労は1 疲れていない〜10 とても疲れている、動きは1 とても悪い〜10 とても良い。</p></div>';
    return html;
  },

  /** 選んだ日の記録（種目とセット） */
  /** その日のコンディション（v33）。記録が無ければ、3日前までなら「記録する」ボタン */
  condHtml: function (date) {
    var c = History.data && History.data.conditions && History.data.conditions[date];
    if (c) return '<h2 style="margin-top:18px">コンディション</h2>' + Condition.tableHtml(c) + History.likeHtml('condition', date);   // v73：いいね
    return History.canAdd(date) ? '<button class="btn ghost block" data-act="condOpenDate" data-date="' + date + '">この日のコンディションを記録する</button>' : '';
  },

  detailHtml: function (date, list) {
    if (date && !list && History.canAdd(date)) {   // 記録が無い日（3日前まで）→ 追加だけ出す
      var m0 = /^(\d{4})-(\d{2})-(\d{2})/.exec(date), wd0 = '日月火水木金土'.charAt(new Date(Number(m0[1]), Number(m0[2]) - 1, Number(m0[3])).getDay());
      return '<div class="card hist-detail"><h2>' + Number(m0[2]) + '月' + Number(m0[3]) + '日（' + wd0 + '）</h2><p class="muted small">この日の記録はまだありません。</p>' + History.addHtml(date) + History.condHtml(date) + '</div>';
    }
    if (date && !list && History.data.conditions && History.data.conditions[date]) {   // v62：トレーニングは無く、コンディションだけある日
      var m1 = /^(\d{4})-(\d{2})-(\d{2})/.exec(date), wd1 = '日月火水木金土'.charAt(new Date(Number(m1[1]), Number(m1[2]) - 1, Number(m1[3])).getDay());
      return '<div class="card hist-detail"><h2>' + Number(m1[2]) + '月' + Number(m1[3]) + '日（' + wd1 + '）</h2><p class="muted small">この日のトレーニングの記録はありません。</p>' + History.condHtml(date) + '</div>';
    }
    if (!date || !list) {
      return '<div class="card muted">' + (History.data.sessions.length ? '印の付いた日をタップすると、その日の記録が出ます。' : 'この月のトレーニングの記録はまだありません。') + '</div>';
    }
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date), wd = '日月火水木金土'.charAt(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay());
    var html = '<div class="card hist-detail"><h2>' + Number(m[2]) + '月' + Number(m[3]) + '日（' + wd + '）の記録</h2>';
    list.forEach(function (s) {
      html += '<div class="hist-session"><div class="hist-stitle"><span class="hist-badge ' + History.kindClass(s) + '">' + esc(History.kindLabel(s)) + '</span>' +
        '<b>' + esc(History.title(s)) + '</b></div>' +
        '<div class="muted small">' + esc(s.time) + ' 開始' + (s.minutes !== '' ? '・' + s.minutes + '分' : '') + (s.part ? '・' + esc(s.part) : '') + '</div>';
      if (!s.items.length) html += '<p class="muted small">種目の記録はありません。</p>';
      else {
        html += '<table class="hist-table"><tbody>' + s.items.map(function (it) {
          return '<tr><th>' + esc(it.name) + '</th><td>' + esc(History.setsText(it.sets)) + '</td></tr>';
        }).join('') + '</tbody></table>';
      }
      html += History.likeHtml('training', s.id) + '</div>';   // v73：いいね
    });
    html += History.condHtml(date);   // その日のコンディション（v33）
    // 記録がある日は「メニューを追加」のボタンだけ。押すとメニューのボタンが出る（v29）
    if (History.canAdd(date)) {
      html += History.addOpen === date ? History.addHtml(date)
        : '<button class="btn sub btn-pill block" data-hist-add="' + date + '">' + Icon('plus', 18) + 'メニューを追加</button>';
    }
    return html + '</div>';
  },

  /**
   * その日の分を記録するボタン（v27、v28で見出しをなくした）。押すとその日の分としてトレーニングが始まり、終了画面で保存する。
   * data-bd … 何日前か（app.js の onAct・mymenu.js の MyMenu.onClick が読み取って、その日の記録にする）
   */
  addHtml: function (date) {
    var n = History.daysAgo(date), h = S.home, bd = ' data-bd="' + n + '"';
    var html = '<div class="hist-add"><div class="next-pills">';
    h.days.forEach(function (d) {
      html += '<button class="btn sub btn-pill" data-act="startDay" data-day="' + d.day + '"' + bd + '>Day' + d.day + (d.dayName ? '（' + esc(d.dayName) + '）' : '') + '</button>';
    });
    MyMenu.list().forEach(function (m) {
      html += '<button class="btn sub btn-pill" data-mm="start" data-id="' + esc(m.id) + '"' + bd + '>' + esc(m.name) + '</button>';
    });
    html += '<button class="btn sub btn-pill" data-act="startFree"' + bd + '>白紙から</button></div></div>';
    return html;
  },

  /** セット内容を短く（「60kg×8 ×3セット」「60kg×8, 57.5kg×7」） */
  setsText: function (sets) {
    if (!sets.length) return '-';
    var one = function (st) { return (st.w !== '' ? st.w + 'kg×' : '') + st.r + '回'; };
    var same = sets.every(function (st) { return st.w === sets[0].w && st.r === sets[0].r; });
    return same ? one(sets[0]) + ' × ' + sets.length + 'セット' : sets.map(one).join('、');
  },
  title: function (s) {
    if (s.myMenu) return '自分のメニュー「' + s.myMenu + '」';
    if (s.type === 'チーム' && s.day !== '') return 'Day' + s.day + (s.dayName ? '（' + s.dayName + '）' : '');
    return s.type === 'チーム' ? 'チームメニュー' : '白紙から記録';
  },
  kindClass: function (s) { return s.type === 'チーム' ? 'team' : 'mine'; },
  kindLabel: function (s) { return s.type === 'チーム' ? 'チーム' : '自分'; },
  shift: function (ym, n) {
    var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + '-' + ('0' + (m + 1)).slice(-2);
  },

  /** 音声で開いたときに読み上げる、ひとことのまとめ */
  summary: function () {
    var d = History.data;
    if (!d) return '';
    var m = Number(d.month.slice(5, 7)), n = Object.keys(History.trainedDays()).length;
    if (!d.sessions.length) return m + '月のトレーニングの記録はまだないよ。';
    var last = d.sessions[d.sessions.length - 1];
    return m + '月は' + n + '日トレーニングしたよ。最後は' + Number(last.date.slice(5, 7)) + '月' + Number(last.date.slice(8, 10)) + '日の' +
      History.title(last).replace(/[「」]/g, '') + 'だよ。日付をタップすると、その日の記録が見られるよ。';
  }
};

// カレンダーの操作（月の切り替え・日付の選択）
app.addEventListener('click', function (e) {
  if (S.view !== 'history') return;
  var mBtn = e.target.closest('[data-hist-month]');
  if (mBtn && !mBtn.disabled) { History.show(mBtn.dataset.histMonth); return; }
  var aBtn = e.target.closest('[data-hist-add]');
  if (aBtn) { History.addOpen = aBtn.dataset.histAdd; History.render(); return; }
  var dBtn = e.target.closest('[data-hist-day]');
  if (dBtn && !dBtn.disabled) {
    History.selected = dBtn.dataset.histDay;
    History.addOpen = '';
    History.render();
    var det = document.querySelector('.hist-detail');
    if (det && det.scrollIntoView) det.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});
