/**
 * body_base.js ― 体組成レポートの「基準」をスタッフ画面から設定する（Phase 3e）
 *
 *   全員共通の基準（InBodyタブの「基準の設定」）:
 *     基準期間（開始日〜終了日）… 期間内のその選手のInBodyの平均が「基準比」の基準になる。入れると選手ごとの基準日より優先
 *     基準線（除脂肪体重・FFMI）… 体組成の比較グラフの点線の位置
 *   選手ごとの基準日（選手詳細のフィジカルレポートの下）:
 *     その選手のInBodyの測定日から選ぶ（複数選ぶと平均が基準）。全員共通の基準期間があるときは使われない
 *
 *   保存先: 全員共通 → 設定シート ／ 選手ごと → 選手マスタ「体組成の基準日」（サーバーの setBodyBase_）
 *   シートを直接書き換えてもよい（どちらで変えても同じ結果になる）。
 */
var BodyBase = {
  /** 全員共通の基準期間が設定されているか */
  teamOn: function () { var t = Staff.body && Staff.body.teamBase; return !!(t && t.start && t.end); },

  /** InBodyタブに出す「基準の設定（全員共通）」のカード */
  teamCard: function () {
    var t = Staff.body.teamBase || { start: '', end: '' }, c = Staff.body.chart || Body.chart;
    var n = t.start && t.end ? Staff.body.athletes.filter(function (a) { return a.active && a.inbody.some(function (r) { return r.date >= t.start && r.date <= t.end; }); }).length : 0;
    // v78：測定日を1つ選んで、全員の基準をその日の測定にそろえる（開始日＝終了日＝その日で保存。今ある setBodyBase の team を使う）
    var cnt = {};
    Staff.body.athletes.forEach(function (a) { if (a.active) uniq(a.inbody.map(function (r) { return r.date; })).forEach(function (d) { cnt[d] = (cnt[d] || 0) + 1; }); });
    var days = Object.keys(cnt).sort().reverse(), one = t.start && t.start === t.end ? t.start : '';
    var unify = days.length ? '<div class="base-unify"><p class="small"><b>基準日を全員そろえる</b>（ボタン1つで、全員の「基準比」と比較グラフの青い丸を、選んだ測定日の記録にします）</p>' +
      '<div class="row"><select class="sel" id="baseUnifyDate" aria-label="そろえる測定日">' + days.map(function (d) {
        return '<option value="' + esc(d) + '"' + (d === one ? ' selected' : '') + '>' + esc(d) + '（' + cnt[d] + '人が測定）</option>'; }).join('') + '</select>' +
      '<button class="btn" data-base="unify">この測定日に全員そろえる</button></div></div>' : '';
    return '<div class="card"><h2>基準の設定（全員共通）</h2>' + unify +
      '<p class="muted small">「基準比」の基準を全員そろえるときに、期間を入れます（期間内のInBodyの平均が基準。開始日と終了日を同じにするとその日の測定）。' +
      '空にすると、選手ごとの基準日（選手の名前を押したレポートの下で設定）を使います。</p>' +
      '<div class="row base-row"><label>開始日<input type="date" id="baseStart" value="' + esc(t.start) + '"></label>' +
      '<label>終了日<input type="date" id="baseEnd" value="' + esc(t.end) + '"></label></div>' +
      (BodyBase.teamOn() ? '<p class="small">現在: <b>' + esc(t.start) + '〜' + esc(t.end) + '</b>（期間内にInBodyの記録がある在籍選手 ' + n + '人。記録が無い選手は「基準比」が出ません）</p>'
                         : '<p class="small">現在: <b>全員共通の基準なし</b>（選手ごとの基準日を使用）</p>') +
      '<p class="muted small" style="margin-top:10px;">体組成の比較グラフの点線（チームの目安）</p>' +
      '<div class="row base-row"><label>除脂肪体重(kg)<input type="number" step="0.1" id="baseLean" value="' + esc(c.lean) + '"></label>' +
      '<label>FFMI<input type="number" step="0.1" id="baseFfmi" value="' + esc(c.ffmi) + '"></label></div>' +
      '<div class="row"><button class="btn" data-base="saveTeam">保存する</button>' +
      (BodyBase.teamOn() ? '<button class="btn sub" data-base="clearTeam">全員共通の基準をやめる</button>' : '') + '</div></div>';
  },

  /** 選手詳細に出す「この選手の基準日」のカード（a = Staff.current） */
  athleteCard: function (a) {
    var html = '<div class="card"><h2>この選手の基準日（基準比の基準）</h2>';
    if (!a.inbody.length) return html + '<p class="muted">InBodyの記録が無いため、基準日を選べません。</p></div>';
    if (BodyBase.teamOn()) {
      var t = Staff.body.teamBase;
      return html + '<p class="small">いまは<b>全員共通の基準期間（' + esc(t.start) + '〜' + esc(t.end) + '）</b>を使っています。' +
        '選手ごとの基準日を使うときは、InBodyタブの「基準の設定」で全員共通の基準をやめてください。</p></div>';
    }
    var sel = (a.base && a.base.dates) || [];
    return html + '<p class="muted small">基準にする測定日を選んで保存します（複数選ぶと平均が基準）。体組成の比較グラフの青い丸にもなります。</p>' +
      '<div class="base-dates">' + a.inbody.slice().reverse().map(function (r) {
        return '<label class="check-line"><input type="checkbox" class="base-date" value="' + esc(r.date) + '"' + (sel.indexOf(r.date) >= 0 ? ' checked' : '') + '> ' +
          esc(r.date) + '<span class="muted small">　体重' + Body.f1(r.weight) + '・除脂肪' + Body.f1(r.lbm) + '・FFMI ' + Body.f1(r.ffmi) + '</span></label>';
      }).join('') + '</div>' +
      '<div class="row"><button class="btn" data-base="saveAthlete">保存する</button>' +
      (sel.length ? '<button class="btn sub" data-base="clearAthlete">基準日を外す</button>' : '') + '</div></div>';
  },

  /** 保存して、データを読み直して画面を描き直す */
  save: function (data, btn) {
    if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }
    data.token = S.token;
    Api.call('setBodyBase', data).then(function () {
      return Staff.loadBody(true);
    }).then(function () {
      if (data.target === 'athlete') Staff.refreshReport(data.athleteId); else StaffBody.render('inbody');   // v38：基準日はフィジカルレポートのページで設定する
    }).catch(function (err) {
      if (err.needLogin) return Staff.fail(err);
      alert('保存できませんでした：' + err.message);
      if (btn) { btn.disabled = false; btn.textContent = '保存する'; }
    });
  }
};

app.addEventListener('click', function (e) {
  var t = e.target.closest('[data-base]');
  if (!t || S.view !== 'staff') return;
  var v = function (id) { var el = document.getElementById(id); return el ? el.value : ''; };
  switch (t.dataset.base) {
    case 'saveTeam':
      if ((v('baseStart') === '') !== (v('baseEnd') === '')) { alert('開始日と終了日の両方を入れてください（やめるときは両方とも空に）。'); return; }
      BodyBase.save({ target: 'team', start: v('baseStart'), end: v('baseEnd'), lean: v('baseLean'), ffmi: v('baseFfmi') }, t); break;
    case 'unify':   // v78：基準日を全員そろえる
      var ud = v('baseUnifyDate');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ud)) return;
      var nOn = Staff.body.athletes.filter(function (a) { return a.active && a.inbody.some(function (r) { return r.date === ud; }); }).length;
      var nAll = Staff.body.athletes.filter(function (a) { return a.active; }).length;
      if (!confirm('全員の基準を ' + ud + ' の測定にそろえます（全員共通の基準期間を ' + ud + '〜' + ud + ' にします）。\n' +
        'この日に測った在籍選手は ' + nOn + '人 / ' + nAll + '人です。測っていない選手は「基準比」と青い丸が出なくなります。\n選手ごとに設定した基準日は、全員共通の基準をやめると元に戻ります。よろしいですか？')) return;
      BodyBase.save({ target: 'team', start: ud, end: ud, lean: v('baseLean'), ffmi: v('baseFfmi') }, t); break;
    case 'clearTeam':
      if (!confirm('全員共通の基準をやめて、選手ごとの基準日を使うようにします。よろしいですか？')) return;
      BodyBase.save({ target: 'team', start: '', end: '', lean: v('baseLean'), ffmi: v('baseFfmi') }, t); break;
    case 'saveAthlete':
      var dates = Array.prototype.filter.call(document.querySelectorAll('.base-date'), function (c) { return c.checked; }).map(function (c) { return c.value; });
      BodyBase.save({ target: 'athlete', athleteId: Staff.current.id, dates: dates }, t); break;
    case 'clearAthlete':
      BodyBase.save({ target: 'athlete', athleteId: Staff.current.id, dates: [] }, t); break;
  }
});
