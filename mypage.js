/**
 * mypage.js ― 選手のマイページ（v47。S.view = 'mypage'。下のバーの右端「マイページ」から開く）
 *
 *   上から：プロフィール（見るだけ）→ トレーニングのまとめ → フィジカルのまとめ → コンディションの推移 → 設定
 *     プロフィール      … 選手マスタの内容（API myPage。マイページ.gs）。間違いはスタッフに直してもらう
 *     トレーニングのまとめ … 回数・セット数・時間と、種目ごとの自己ベスト（API myStats。qa.js と同じデータを使い回す）。記録のカレンダーへのボタン
 *     フィジカルのまとめ … 最新のInBodyと体重の週平均（API myBody）。体組成レポートへのボタン
 *     コンディションの推移 … スタッフ画面と同じグラフ（condchart.js。1週間の毎日／3か月の週平均）
 *     設定            … コーチの設定（avatar.js のパネル）・文字で話しかける・PINの変更（API changePin）
 *   声：「マイページを開いて」「PINを変えたい」「プロフィールを見せて」、マイページで「3か月にして」「1週間にして」「前の週」（MyPage.voice）
 *       PINは声では入れない（周りに聞こえないように）
 */
var MyPage = {
  data: null,   // myPage の結果

  show: function (after) {
    S.view = 'mypage';
    app.innerHTML = '<div class="loading">読み込み中…</div>';
    var need = [Api.call('myPage', { token: S.token }).then(function (res) { MyPage.data = res; })];
    if (!QA.fresh('stats')) need.push(QA.load('stats'));
    if (!QA.fresh('body')) need.push(QA.load('body'));
    return Promise.all(need).then(function () {
      if (S.view !== 'mypage') return;
      CondChart.set(MyPage.data.conditions || [], MyPage.data.weekStart);
      MyPage.render();
      if (after) after();
    }).catch(function (err) {
      if (err.needLogin) { Store.remove('token'); S.token = null; renderLogin(err.message); return; }
      app.innerHTML = msgHtml('error', err.message) + '<button class="btn block" data-act="mypage">もう一度読み込む</button><button class="btn ghost block" data-act="home">ホームへ</button>';
    });
  },

  render: function (pinMsg) {
    S.view = 'mypage';
    var p = (MyPage.data && MyPage.data.profile) || {};
    var html = '<div class="group"><div class="topbar"><h1>マイページ</h1><button class="btn ghost" data-act="home">ホームへ</button></div>' +
      '<p class="mp-name"><b>' + esc(p.name || '') + '</b>' + (p.kana ? ' <span class="muted small">' + esc(p.kana) + '</span>' : '') + '</p></div>';
    html += MyPage.profileHtml(p) + MyPage.trainingHtml() + MyPage.physicalHtml() +
      '<div class="group" id="mpCondition"><h2 class="mp-h">コンディションの推移</h2>' + CondChart.html() +
      '<p class="muted small">疲労は上ほど疲れていて、点線の8が注意の目安だよ。動きやすさは上ほど良い状態。「3か月」は週ごとの平均だよ。</p></div>' +
      MyPage.settingsHtml(pinMsg);
    app.innerHTML = html;
  },

  // ---------------- プロフィール ----------------
  profileHtml: function (p) {
    var row = function (label, v) { return '<tr><td>' + label + '</td><td class="r">' + (v ? esc(v) : '<span class="muted">-</span>') + '</td></tr>'; };
    return '<div class="group" id="mpProfile"><h2 class="mp-h">プロフィール</h2><table class="line-table"><tbody>' +
      row('選手ID', p.id) + row('学年', p.grade + (p.enrollYear ? '（' + p.enrollYear + '年度入学）' : '')) + row('ポジション', p.position) +
      row('チーム', p.team) + row('使うメニュー', p.menuId) + row('身長', p.height ? p.height + ' cm' : '') + row('出身校', p.school) +
      '</tbody></table><p class="muted small">ここは見るだけだよ。間違っていたら、スタッフに伝えてね。</p></div>';
  },

  // ---------------- トレーニングのまとめ ----------------
  trainingHtml: function () {
    var st = QA.data.stats, html = '<div class="group" id="mpTraining"><h2 class="mp-h">トレーニングのまとめ</h2>';
    if (!st) return html + '<p class="muted">読み込めなかったよ。</p></div>';
    var c = st.training.counts;
    html += '<div class="mp-stats">' + [['今週', c.week + '回'], ['今月', c.month + '回'], ['今年度', c.year + '回'], ['これまで', c.total + '回']].map(function (x) {
      return '<div class="mp-stat"><span class="muted small">' + x[0] + '</span><b>' + x[1] + '</b></div>';
    }).join('') + '</div>' +
      '<p class="small">今月は ' + c.setsMonth + 'セット・' + c.minutesMonth + '分' + (c.volumeMonth ? '・総挙上量 ' + c.volumeMonth.toLocaleString() + 'kg' : '') + '（今年度 ' + c.setsYear + 'セット）</p>';
    var ex = Object.keys(st.training.exercises).map(function (n) { return { name: n, e: st.training.exercises[n] }; })
      .sort(function (a, b) { return b.e.count - a.e.count || a.name.localeCompare(b.name, 'ja'); });
    if (ex.length) {
      html += '<h3 class="mp-sub">自己ベスト（よくやる種目の順）</h3><table class="line-table"><tbody>' + ex.slice(0, MyPage.showAll ? ex.length : 8).map(function (x) {
        var e = x.e, best = e.best ? e.best.w + 'kg × ' + e.best.r + '回' : e.bestReps ? e.bestReps.r + '回' : '-';
        var d = e.best ? e.best.date : e.bestReps ? e.bestReps.date : '';
        return '<tr><td>' + esc(x.name) + '<div class="muted small">' + e.count + '日</div></td><td class="r"><b>' + esc(best) + '</b>' +
          (d ? '<div class="muted small">' + esc(Body.dShort(d)) + '</div>' : '') + '</td></tr>';
      }).join('') + '</tbody></table>' +
        (ex.length > 8 ? '<button class="btn ghost small" data-mp="allEx">' + (MyPage.showAll ? '少なく表示' : 'ほかの種目も見る（全' + ex.length + '種目）') + '</button>' : '');
    } else html += '<p class="muted small">まだ記録がないよ。</p>';
    return html + '<button class="btn sub block" data-act="records">' + Icon('calendar', 20) + '記録のカレンダーを見る</button></div>';
  },

  // ---------------- フィジカルのまとめ ----------------
  physicalHtml: function () {
    var b = QA.data.body || Body.mine, html = '<div class="group" id="mpPhysical"><h2 class="mp-h">フィジカルのまとめ</h2>';
    if (!b) return html + '<p class="muted">読み込めなかったよ。</p></div>';
    var ib = b.inbody || [], L = ib[ib.length - 1], P = ib[ib.length - 2];
    var d = function (k) { return P && Body.num(L[k]) !== null && Body.num(P[k]) !== null ? ' <span class="muted small">' + Body.diffText(L[k] - P[k]) + '</span>' : ''; };
    var row = function (label, k, unit) { return '<tr><td>' + label + '</td><td class="r"><b>' + Body.f1(L[k]) + '</b>' + unit + d(k) + '</td></tr>'; };
    html += '<table class="line-table"><tbody>';
    if (L) html += '<tr><td colspan="2" class="muted small">InBody　' + esc(Body.dLong(L.date)) + ' 測定' + (P ? '（▲▼は前回との差）' : '') + '</td></tr>' +
      row('体重', 'weight', 'kg') + row('体脂肪率', 'fat', '%') + row('除脂肪体重', 'lbm', 'kg') + row('FFMI', 'ffmi', '') +
      (L.rank ? '<tr><td>FFMIの同日順位</td><td class="r"><b>' + L.rank + '位</b> / ' + L.rankOf + '人</td></tr>' : '');
    else html += '<tr><td colspan="2" class="muted">InBodyの記録はまだないよ。</td></tr>';
    var wk = Body.weightWeekStats(b.weight || []);
    if (wk) html += '<tr><td>体重（週平均）</td><td class="r"><b>' + wk.week.value.toFixed(1) + '</b>kg' + (wk.prevWeek ? ' <span class="muted small">' + Body.diffText(wk.week.value - wk.prevWeek.value) + '</span>' : '') +
      '<div class="muted small">' + esc(Body.weekLabel(wk.week)) + '（' + wk.week.n + '回）' + (wk.prevWeek ? '・前の週との差' : '') + '</div></td></tr>';
    html += '</tbody></table><div class="row"><button class="btn sub" data-mp="body" data-v="inbody">' + Icon('right', 18) + 'フィジカルレポート</button>' +
      '<button class="btn sub" data-mp="body" data-v="weight">' + Icon('right', 18) + '体重レポート</button></div>' +
      '<p class="muted small">体重は、コンディションと一緒に入れると毎日の流れが体重レポートに出るよ。</p></div>';
    return html;
  },

  // ---------------- 設定 ----------------
  settingsHtml: function (pinMsg) {
    return '<div class="group" id="mpSettings"><h2 class="mp-h">設定</h2>' +
      '<button class="btn sub block" data-act="avatarSettings">' + Icon('smiley', 20) + 'コーチの設定（種類・声・話す速さ・画面の色）</button>' +
      '<button class="btn sub block" data-typevoice="1">⌨ 文字で話しかける</button>' +
      '<h3 class="mp-sub">PINの変更</h3>' + (pinMsg || '') +
      '<form class="mp-pin" data-mp-form="pin" autocomplete="off">' +
      '<label>今のPIN<input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" id="pinCur" autocomplete="current-password"></label>' +
      '<label>新しいPIN（4けたの数字）<input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" id="pinNew" autocomplete="new-password"></label>' +
      '<label>新しいPIN（もう一度）<input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" id="pinNew2" autocomplete="new-password"></label>' +
      '<button class="btn block" type="submit">PINを変更する</button></form>' +
      '<p class="muted small">1111・1234 のようなわかりやすいPINは使えないよ。変えたPINは、次にログインするときから使ってね。忘れたときは、スタッフに聞いてね。</p></div>';
  },

  changePin: function () {
    var v = function (id) { return (document.getElementById(id) || {}).value || ''; };
    var cur = v('pinCur'), n1 = v('pinNew'), n2 = v('pinNew2');
    var bad = function (m) { MyPage.render(msgHtml('error', m)); MyPage.scrollTo('mpSettings'); };
    if (!/^\d{1,4}$/.test(cur)) return bad('今のPINを入れてね。');
    if (!/^\d{4}$/.test(n1)) return bad('新しいPINは4けたの数字で入れてね。');
    if (n1 !== n2) return bad('新しいPINが2回とも同じになっていないよ。');
    var btn = app.querySelector('.mp-pin button'); if (btn) { btn.disabled = true; btn.textContent = '変更しています…'; }
    Api.call('changePin', { token: S.token, current: cur, next: n1 }).then(function (res) {
      MyPage.render(msgHtml('ok', res.message)); MyPage.scrollTo('mpSettings');
      Speech.speak('PINを変えたよ。次のログインから新しいPINを使ってね。');
    }).catch(function (err) { bad(err.message); });
  },

  scrollTo: function (id) {
    var el = document.getElementById(id);
    if (el) setTimeout(function () { el.scrollIntoView({ block: 'start' }); }, 0);
  },

  // ---------------- 声 ----------------
  /** 答えたら true（commands.js の handleVoice から呼ぶ） */
  voice: function (text) {
    var t = VoiceParser.norm(VoiceParser.normalizeNumbers(text));
    if (S.view === 'session' || S.view === 'finish') return false;
    var open = function (id, msg) {
      var go = function () { if (id) MyPage.scrollTo(id); Avatar.feedback('success'); reply(text, msg); };
      if (S.view === 'mypage') { go(); return true; }
      VoiceUI.show(text, 'マイページを開くね。');
      MyPage.show(go);
      return true;
    };
    if (/pin|ピン|暗証|あんしょう|パスワド/.test(t) && /変え|かえ|変更|へんこう|新しく/.test(t)) return open('mpSettings', 'PINは下の「PINの変更」で変えられるよ。声では言わずに、画面で入れてね。');
    if (/マイペジ|まいぺじ|my ?page/.test(t)) return open('', 'マイページだよ。プロフィール、トレーニングとフィジカルのまとめ、コンディションの推移、設定が見られるよ。');
    if (/プロフィル|ぷろふぃる|自分の(情報|じょうほう)/.test(t) && /見|み|開|ひら|教え|おしえ|表示/.test(t)) return open('mpProfile', MyPage.profileText());
    if (/自己ベスト|じこべすと/.test(t) && /一覧|いちらん|見せ|みせ|開/.test(t)) return open('mpTraining', '自己ベストは「トレーニングのまとめ」にあるよ。');
    if (S.view !== 'mypage') return false;
    // マイページの中：コンディションのグラフ
    if (/3か月|3ヶ月|3カ月|三か月|さんかげつ|週平均|しゅうへいきん/.test(t)) { CondChart.mode = 'quarter'; CondChart.offset = 0; CondChart.render(); MyPage.scrollTo('mpCondition'); reply(text, 'コンディションのグラフを、3か月の週平均にしたよ。'); return true; }
    if (/1週間|いっしゅうかん|毎日|まいにち/.test(t) && !/\?|？|は$/.test(t)) { CondChart.mode = 'week'; CondChart.offset = 0; CondChart.render(); MyPage.scrollTo('mpCondition'); reply(text, 'コンディションのグラフを、1週間の毎日にしたよ。'); return true; }
    if (/先週|せんしゅう|前の週|まえのしゅう|前の(期間|3か月)/.test(t)) { CondChart.offset++; CondChart.render(); MyPage.scrollTo('mpCondition'); reply(text, '前の期間にしたよ。'); return true; }
    if (/次の週|つぎのしゅう|次の(期間|3か月)/.test(t)) { CondChart.offset = Math.max(0, CondChart.offset - 1); CondChart.render(); MyPage.scrollTo('mpCondition'); reply(text, '次の期間にしたよ。'); return true; }
    if (/今週(に|へ)?(戻|もど)|最新(に|へ)(戻|もど)/.test(t)) { CondChart.offset = 0; CondChart.render(); MyPage.scrollTo('mpCondition'); reply(text, '最新の期間に戻したよ。'); return true; }
    if (/設定|せってい/.test(t)) { MyPage.scrollTo('mpSettings'); reply(text, '設定はいちばん下だよ。コーチの設定とPINの変更ができるよ。'); return true; }
    if (/コンディション/.test(t) && /推移|すいい|グラフ/.test(t) && /見|み|開|表示/.test(t)) { MyPage.scrollTo('mpCondition'); reply(text, 'コンディションの推移だよ。'); return true; }
    return false;
  },

  profileText: function () {
    var p = (MyPage.data && MyPage.data.profile) || {};
    if (!p.name) return 'プロフィールだよ。';
    return 'プロフィールだよ。' + [p.grade, p.position, p.team ? p.team + 'チーム' : ''].filter(String).join('、') + (p.height ? '、身長' + p.height + 'センチ' : '') + 'になってるよ。間違っていたらスタッフに伝えてね。';
  }
};

// マイページのボタン
app.addEventListener('click', function (e) {
  var t = e.target.closest('[data-mp]');
  if (!t || S.view !== 'mypage') return;
  if (t.dataset.mp === 'body') { Body.tab = t.dataset.v; Body.showMine(); }
  if (t.dataset.mp === 'allEx') { MyPage.showAll = !MyPage.showAll; MyPage.render(); MyPage.scrollTo('mpTraining'); }
});
app.addEventListener('submit', function (e) {
  var f = e.target.closest && e.target.closest('[data-mp-form="pin"]');
  if (!f) return;
  e.preventDefault();
  MyPage.changePin();
});
