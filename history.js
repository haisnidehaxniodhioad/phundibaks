/**
 * history.js ― 選手が自分のトレーニング記録を見る画面（Phase 3u）
 *
 *   History.show(month, after) … 記録のカレンダーを開く（month は 'yyyy-MM'。省略すると今月）
 *   カレンダーでトレーニングした日に印が付き、日付をタップするとその日の種目とセットが下に出る。
 *   見られるのは今年度の記録（‹ › で月を切り替え）。データは Apps Script の myHistory（履歴.gs）から取る。
 *   音声：「記録を見せて」で開く、「今週何回やった？」で回数を答える（commands.js）。
 */
var History = {
  data: null,        // 今表示している月のデータ（myHistory の返事）
  selected: '',      // 下に詳しく出している日（'yyyy-MM-dd'）
  WEEK: ['月', '火', '水', '木', '金', '土', '日'],   // カレンダーは月曜はじまり

  /** 記録の画面を開く。after: 表示し終わったあとにすること（音声で開いたときの読み上げなど） */
  show: function (month, after) {
    S.view = 'history';
    app.innerHTML = '<div class="loading">読み込み中…</div>';
    History.load(month).then(function () {
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
    var html = '<div class="topbar"><span class="kicker">トレーニング記録</span><button class="btn ghost" data-act="home">ホームへ</button></div>' +
      '<div class="hist-summary"><span class="big-num">' + (d.month === d.current ? '今月' : m + '月') + 'は<em> ' + dayCount + '日 </em>' +
      (dayCount ? 'がんばったね' : 'まだ記録がないよ') + '</span>' +
      '<span class="muted small">' + (monthCount !== dayCount ? 'この月 ' + monthCount + '回・' : '') + '今週 ' + d.weekCount + '回・今年度 ' + d.yearCount + '回</span></div>';
    // 月の切り替え
    html += '<div class="card"><div class="hist-month">' +
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
      var cls = 'hist-day' + (list ? ' done' : '') + (mineOnly ? ' mine-only' : '') + (key === today ? ' today' : '') + (key === History.selected ? ' sel' : '') + (key > today ? ' future' : '');
      html += '<button class="' + cls + '" data-hist-day="' + key + '"' + (list ? '' : ' disabled') + '>' +
        '<span class="hist-num">' + day + '</span>' +
        (list && list.length > 1 ? '<span class="hist-mark">' + list.map(function (s) { return '<i class="' + History.kindClass(s) + '"></i>'; }).join('') + '</span>' : '') +
        '</button>';
    }
    html += '</div>';
    html += '<div class="hist-legend muted small"><span><i class="team"></i>チームメニュー</span><span><i class="mine"></i>自分のメニュー・白紙</span></div></div>';
    // 選んだ日の詳しい記録
    html += History.detailHtml(History.selected, days[History.selected]);
    // 月ごとの回数（今年度）
    html += '<div class="card"><h2>今年度の月ごとの回数</h2><div class="hist-months">' + d.months.map(function (mo) {
      return '<button class="hist-mbtn' + (mo.month === d.month ? ' on' : '') + '" data-hist-month="' + mo.month + '">' +
        Number(mo.month.slice(5, 7)) + '月<b>' + mo.count + '</b></button>';
    }).join('') + '</div></div>';
    app.innerHTML = html;
  },

  /** 選んだ日の記録（種目とセット） */
  detailHtml: function (date, list) {
    if (!date || !list) {
      return '<div class="card muted">' + (History.data.sessions.length ? '印の付いた日をタップすると、その日の記録が出ます。' : 'この月のトレーニングの記録はまだありません。') + '</div>';
    }
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date), wd = '日月火水木金土'.charAt(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay());
    var html = '<div class="card hist-detail"><h2>' + Number(m[2]) + '月' + Number(m[3]) + '日（' + wd + '）の記録</h2>';
    list.forEach(function (s) {
      html += '<div class="hist-session"><div class="hist-stitle"><span class="hist-badge ' + History.kindClass(s) + '">' + esc(History.kindLabel(s)) + '</span>' +
        '<b>' + esc(History.title(s)) + '</b></div>' +
        '<div class="muted small">' + esc(s.time) + ' 開始' + (s.minutes !== '' ? '・' + s.minutes + '分' : '') + (s.srpe !== '' ? '・きつさ ' + s.srpe : '') + (s.part ? '・' + esc(s.part) : '') + '</div>';
      if (!s.items.length) html += '<p class="muted small">種目の記録はありません。</p>';
      else {
        html += '<table class="hist-table"><tbody>' + s.items.map(function (it) {
          return '<tr><th>' + esc(it.name) + '</th><td>' + esc(History.setsText(it.sets)) + '</td></tr>';
        }).join('') + '</tbody></table>';
      }
      html += '</div>';
    });
    return html + '</div>';
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
  var dBtn = e.target.closest('[data-hist-day]');
  if (dBtn && !dBtn.disabled) {
    History.selected = dBtn.dataset.histDay;
    History.render();
    var det = document.querySelector('.hist-detail');
    if (det && det.scrollIntoView) det.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});
