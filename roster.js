/**
 * roster.js ― 部員名簿（チームのホームページ）から選手を追加・更新する画面（v44。スタッフ画面の中の1ページ）
 *
 *   開き方：実施状況の下の「部員名簿から選手を取り込む」ボタン、または声で「部員名簿から取り込んで」
 *   流れ  ：① Apps Script（名簿.gs の rosterCheck）がホームページの名簿を読み、選手マスタ・スタッフマスタと比べる（シートは変えない）
 *           スタッフ（v44d）は 学生コーチ・トレーナー・アナリスト・指導陣。画面の下半分に同じ3つの一覧を出す
 *           ② この画面に3つの一覧を出す：新しく追加／内容が変わる／名簿にいない（在籍を外す候補）
 *           ③ スタッフがチェックした分だけ「反映する」（rosterApply）。最初のチェックは、追加・変更＝付ける、在籍を外す＝付けない
 *   戻る  ：「← 戻る」またはブラウザの戻るで、実施状況へ
 *
 * ★ 学年は「入学年度」で保存し、選手マスタの「学年」は空欄にする（空欄なら入学年度から自動で出る）。
 *   名前の書き方はアプリのものを変えない。身長はアプリで空欄の人にだけ入れる。
 */
var Roster = {
  data: null,      // rosterCheck の結果
  result: null,    // rosterApply の結果
  busy: false,

  /** ページを開く（読み込みも始める） */
  open: function () {
    if (S.view !== 'staff') return;
    if (Staff.page !== 'roster') {
      Staff.returnTo = { tab: Staff.tab, scroll: window.scrollY || 0 };
      try { history.pushState({ staffRoster: 1 }, ''); } catch (e) { /* 履歴に足せなくても「戻る」ボタンで戻れる */ }
    }
    Staff.page = 'roster';
    Roster.data = null; Roster.result = null;
    Roster.render();
    window.scrollTo(0, 0);
    Roster.load();
  },

  load: function () {
    Roster.busy = true;
    Api.call('rosterCheck', { token: S.token }).then(function (res) {
      Roster.busy = false;
      Roster.data = res;
      if (Staff.page === 'roster') Roster.render();
    }).catch(function (err) {
      Roster.busy = false;
      if (Staff.page !== 'roster') return;
      Roster.render(msgHtml('error', err.message) + '<button class="btn block" data-roster="reload">もう一度読み込む</button>');
    });
  },

  /** 「← 戻る」：ブラウザの履歴に足していれば履歴で戻る（→ popstate で leave） */
  back: function () {
    var st = history.state || {};
    if (st.staffRoster) history.back(); else Roster.leave();
  },
  leave: function () {
    Staff.leaveAthlete();   // 覚えておいたタブとスクロール位置に戻る（個人ページと同じ）
  },

  frame: function (inner) {
    return Staff.athleteFrame('<h1 class="ath-name">部員名簿から取り込む</h1>' +
      '<p class="muted small">チームのホームページの部員名簿と、アプリの選手・スタッフを比べます。チェックした分だけ反映します。</p>', inner, '選手の管理');
  },

  render: function (errorHtml) {
    if (errorHtml) { app.innerHTML = Roster.frame('<div class="card">' + errorHtml + '</div>'); return; }
    if (Roster.result) { app.innerHTML = Roster.frame(Roster.resultHtml()); return; }
    if (!Roster.data) {
      app.innerHTML = Roster.frame('<div class="card"><div class="loading">ホームページの名簿を読んでいます…</div>' +
        '<p class="muted small">選手一人ひとりのページも読むので、1分ほどかかることがあります。</p></div>');
      return;
    }
    var d = Roster.data, sf = d.staff || { add: [], update: [], missing: [] };
    var html = '<div class="card"><p class="small">名簿 ' + d.total + '人（うち選手 ' + d.players + '人・スタッフ ' + (d.staffCount || 0) + '人）を読みました。' +
      (d.players && d.profiles < d.players ? '<br><span class="muted">個人ページを読めなかった選手が' + (d.players - d.profiles) + '人います（ふりがな・出身校・身長が空になります）。</span>' : '') + '</p>' +
      '<div class="roster-sum"><span class="chip">新しく追加 ' + d.add.length + '</span><span class="chip">内容が変わる ' + d.update.length + '</span>' +
      '<span class="chip">名簿にいない ' + d.missing.length + '</span></div>' +
      '<div class="roster-sum"><span class="chip">スタッフ：追加 ' + sf.add.length + '</span><span class="chip">変わる ' + sf.update.length + '</span>' +
      '<span class="chip">名簿にいない ' + sf.missing.length + '</span></div>' +
      '<p class="muted small">学年は入学年度（今年度 ' + d.fiscalYear + ' − 学年 ＋ 1）で保存します。4月に自動で学年が上がります。' +
      '新しい学年に変わる春は、ホームページの名簿が新しくなってから取り込んでください。</p></div>';

    if (!d.add.length && !d.update.length && !d.missing.length && !sf.add.length && !sf.update.length && !sf.missing.length) {
      html += '<div class="card">' + msgHtml('ok', 'アプリの選手とスタッフは、部員名簿と同じです。反映するものはありません。') + '</div>';
      app.innerHTML = Roster.frame(html);
      return;
    }

    // ① 新しく追加
    if (d.add.length) {
      html += '<div class="card"><h2>新しく追加（' + d.add.length + '人）</h2>' +
        '<p class="muted small">名簿にいて、アプリにいない選手です。追加すると、選手IDとPINを発行します。</p>' +
        '<div class="row"><label class="small">新しい選手のチーム <select class="sel" id="rosterTeam"><option value="">あとで決める</option>' +
        d.teams.map(function (t, i) { return '<option value="' + i + '">' + esc(t.team) + (t.menuId ? '（メニュー ' + esc(t.menuId) + '）' : '') + '</option>'; }).join('') +
        '</select></label></div>' + Roster.allBox('add') +
        d.add.map(function (p, i) {
          return '<label class="check-line roster-item"><input type="checkbox" class="roster-add" value="' + i + '"' + (p.note ? '' : ' checked') + '> <span>' +
            '<b>' + esc(p.name) + '</b>' + (p.kana ? ' <span class="muted small">' + esc(p.kana) + '</span>' : '') + '<br><span class="small">' +
            esc([p.grade ? p.grade + '年（' + p.enrollYear + '年度入学）' : '', p.position, p.school, p.height ? p.height + 'cm' : ''].filter(String).join('・')) + '</span>' +
            (p.note ? '<br><span class="small ng-text">' + esc(p.note) + '</span>' : '') + '</span></label>';
        }).join('') + '</div>';
    }

    // ② 内容が変わる
    if (d.update.length) {
      html += '<div class="card"><h2>内容が変わる（' + d.update.length + '人）</h2>' +
        '<p class="muted small">名簿とアプリの両方にいて、内容が違う選手です。名前の書き方はアプリのまま変えません。</p>' + Roster.allBox('update') +
        d.update.map(function (u, i) {
          return '<label class="check-line roster-item"><input type="checkbox" class="roster-update" value="' + i + '"' + (u.inactive ? '' : ' checked') + '> <span>' +
            '<b>' + esc(u.name) + '</b> <span class="muted small">ID ' + esc(u.id) + (u.rosterName ? '・名簿の表記「' + esc(u.rosterName) + '」' : '') + '</span>' +
            '<span class="roster-changes small">' + u.changes.map(function (c) {
              return '<span>' + esc(c.label) + '：' + (c.col === '名簿ID' ? esc(c.to) : (c.col === '学年' ? esc(c.from) + ' → 空欄' :
                (c.col === '在籍' ? '外れている → 在籍' : esc(c.from === '' ? '（空）' : c.from) + ' → ' + esc(String(c.to))))) + '</span>';
            }).join('') + '</span></span></label>';
        }).join('') + '</div>';
    }

    // ③ 名簿にいない
    if (d.missing.length) {
      html += '<div class="card"><h2>名簿にいない（' + d.missing.length + '人）</h2>' +
        '<p class="muted small">アプリでは在籍なのに、名簿にいない人です。卒業・退部した人だけチェックすると、在籍を外します（記録は消えません）。' +
        '名前の書き方が名簿と違うだけの人は、チェックしないでください。</p>' + Roster.allBox('missing', true) +
        d.missing.map(function (m, i) {
          return '<label class="check-line roster-item"><input type="checkbox" class="roster-missing" value="' + i + '"> <span><b>' + esc(m.name) + '</b> ' +
            '<span class="muted small">' + esc(['ID ' + m.id, m.grade, m.team ? m.team + 'チーム' : ''].filter(String).join('・')) + '</span></span></label>';
        }).join('') + '</div>';
    }

    html += Roster.staffHtml(sf);

    html += '<div class="roster-apply"><button class="btn block" data-roster="apply" id="rosterApplyBtn">チェックした分を反映する</button>' +
      '<p class="muted small" id="rosterCount"></p></div>';
    app.innerHTML = Roster.frame(html);
    Roster.count();
  },

  /** スタッフの3つの一覧（v44d。学生コーチ・トレーナー・アナリスト・指導陣 → スタッフマスタ） */
  staffHtml: function (sf) {
    if (!sf.add.length && !sf.update.length && !sf.missing.length) return '';
    var who = function (p) { return esc([p.role, p.grade ? p.grade + '年' : ''].filter(String).join('・')); };
    var html = '<h2 class="roster-part">スタッフ（学生コーチ・トレーナー・アナリスト・指導陣）</h2>';
    if (sf.add.length) {
      html += '<div class="card"><h2>スタッフ：新しく追加（' + sf.add.length + '人）</h2>' +
        '<p class="muted small">名簿にいて、スタッフマスタにいない人です。追加すると、スタッフIDとPINを発行します（スタッフ画面に入れるようになります）。</p>' + Roster.allBox('sadd') +
        sf.add.map(function (p, i) {
          return '<label class="check-line roster-item"><input type="checkbox" class="roster-sadd" value="' + i + '"' + (p.note ? '' : ' checked') + '> <span>' +
            '<b>' + esc(p.name) + '</b>' + (p.kana ? ' <span class="muted small">' + esc(p.kana) + '</span>' : '') + '<br><span class="small">' + who(p) + '</span>' +
            (p.note ? '<br><span class="small ng-text">' + esc(p.note) + '</span>' : '') + '</span></label>';
        }).join('') + '</div>';
    }
    if (sf.update.length) {
      html += '<div class="card"><h2>スタッフ：内容が変わる（' + sf.update.length + '人）</h2>' +
        '<p class="muted small">名簿とスタッフマスタの両方にいて、役職・ふりがななどが違う人です。名前の書き方はアプリのまま変えません。</p>' + Roster.allBox('supdate') +
        sf.update.map(function (u, i) {
          return '<label class="check-line roster-item"><input type="checkbox" class="roster-supdate" value="' + i + '"' + (u.inactive ? '' : ' checked') + '> <span>' +
            '<b>' + esc(u.name) + '</b> <span class="muted small">ID ' + esc(u.id) + (u.rosterName ? '・名簿の表記「' + esc(u.rosterName) + '」' : '') + '</span>' +
            '<span class="roster-changes small">' + u.changes.map(function (c) {
              return '<span>' + esc(c.label) + '：' + (c.col === '名簿ID' ? esc(c.to) : (c.col === '在籍' ? '外れている → 在籍' :
                esc(c.from === '' ? '（空）' : c.from) + ' → ' + esc(String(c.to)))) + '</span>';
            }).join('') + '</span></span></label>';
        }).join('') + '</div>';
    }
    if (sf.missing.length) {
      html += '<div class="card"><h2>スタッフ：名簿にいない（' + sf.missing.length + '人）</h2>' +
        '<p class="muted small">スタッフマスタでは在籍なのに、名簿にいない人です（名簿に載っていないスタッフもいるので、ここに出ても外す必要はありません）。やめた人だけチェックすると、在籍を外します。今ログインしている本人は出しません。</p>' +
        Roster.allBox('smissing', true) +
        sf.missing.map(function (m, i) {
          return '<label class="check-line roster-item"><input type="checkbox" class="roster-smissing" value="' + i + '"> <span><b>' + esc(m.name) + '</b> ' +
            '<span class="muted small">' + esc(['ID ' + m.id, m.role].filter(String).join('・')) + '</span></span></label>';
        }).join('') + '</div>';
    }
    return html;
  },

  /** 「すべて選ぶ／外す」 */
  allBox: function (kind, off) {
    return '<label class="check-line small roster-all"><input type="checkbox" data-rosterall="' + kind + '"' + (off ? '' : ' checked') + '> すべて選ぶ／外す</label>';
  },

  /** 選んだもの */
  picked: function () {
    var d = Roster.data, sf = d.staff || { add: [], update: [], missing: [] };
    var changesOf = function (u) { var ch = {}; u.changes.forEach(function (c) { ch[c.col] = c.to; }); return { id: u.id, changes: ch }; };
    var idx = function (cls) { return Array.prototype.map.call(app.querySelectorAll('.' + cls + ':checked'), function (x) { return Number(x.value); }); };
    var teamSel = document.getElementById('rosterTeam'), team = teamSel && teamSel.value !== '' ? d.teams[Number(teamSel.value)] : null;
    return {
      add: idx('roster-add').map(function (i) { return d.add[i]; }),
      update: idx('roster-update').map(function (i) {
        var u = d.update[i], ch = {};
        u.changes.forEach(function (c) { ch[c.col] = c.to; });
        return { id: u.id, changes: ch };
      }),
      retire: idx('roster-missing').map(function (i) { return d.missing[i].id; }),
      team: team ? team.team : '', menuId: team ? team.menuId : '',
      staffAdd: idx('roster-sadd').map(function (i) { return sf.add[i]; }),
      staffUpdate: idx('roster-supdate').map(function (i) { return changesOf(sf.update[i]); }),
      staffRetire: idx('roster-smissing').map(function (i) { return sf.missing[i].id; })
    };
  },

  count: function () {
    var el = document.getElementById('rosterCount');
    if (!el) return;
    var p = Roster.picked();
    el.textContent = Roster.countText(p);
    document.getElementById('rosterApplyBtn').disabled = !Roster.total(p);
  },

  total: function (p) { return p.add.length + p.update.length + p.retire.length + p.staffAdd.length + p.staffUpdate.length + p.staffRetire.length; },
  countText: function (p) {
    return '選手：追加 ' + p.add.length + '・更新 ' + p.update.length + '・在籍を外す ' + p.retire.length +
      '　スタッフ：追加 ' + p.staffAdd.length + '・更新 ' + p.staffUpdate.length + '・在籍を外す ' + p.staffRetire.length + '（人）';
  },

  apply: function () {
    if (Roster.busy) return;
    var p = Roster.picked();
    if (!Roster.total(p)) return;
    if (!confirm('選手マスタ・スタッフマスタに反映します。\n' + Roster.countText(p) + '\nよろしいですか？')) return;
    Roster.busy = true;
    var btn = document.getElementById('rosterApplyBtn');
    btn.disabled = true; btn.textContent = '反映しています…';
    Api.call('rosterApply', Object.assign({ token: S.token }, p)).then(function (res) {
      Roster.busy = false;
      Roster.result = res;
      Staff.overview = null; Staff.body = null;   // 選手の一覧を読み直す
      if (Staff.page === 'roster') { Roster.render(); window.scrollTo(0, 0); }
    }).catch(function (err) {
      Roster.busy = false;
      btn.disabled = false; btn.textContent = 'チェックした分を反映する';
      btn.insertAdjacentHTML('afterend', msgHtml('error', err.message));
    });
  },

  resultHtml: function () {
    var r = Roster.result;
    var sa = r.staffAdded || [];
    return '<div class="card">' + msgHtml('ok', '反映しました。選手：追加 ' + r.added.length + '人・更新 ' + r.updated + '人・在籍を外す ' + r.retired + '人／スタッフ：追加 ' +
        sa.length + '人・更新 ' + (r.staffUpdated || 0) + '人・在籍を外す ' + (r.staffRetired || 0) + '人') +
      (r.added.length ? '<h2>追加した選手</h2><p class="small">' + r.added.map(function (a) { return esc(a.name) + '（ID ' + esc(a.id) + '）'; }).join('、') + '</p>' +
        '<p class="muted small">PINは選手マスタの「PIN」の列で確認して、本人に渡してください。チームと使用メニューIDが空の人は、選手マスタで入れてください。</p>' : '') +
      (sa.length ? '<h2>追加したスタッフ</h2><p class="small">' + sa.map(function (a) { return esc(a.name) + '（' + esc(a.role) + '・ID ' + esc(a.id) + '）'; }).join('、') + '</p>' +
        '<p class="muted small">PINはスタッフマスタの「PIN」の列で確認して、本人に渡してください。</p>' : '') +
      '<button class="btn block" data-staff="back">' + Icon('left', 18) + 'スタッフ画面に戻る</button></div>';
  }
};

// この画面の操作
app.addEventListener('click', function (e) {
  var t = e.target.closest('[data-roster]');
  if (!t || S.view !== 'staff' || Staff.page !== 'roster') return;
  if (t.dataset.roster === 'apply') Roster.apply();
  if (t.dataset.roster === 'reload') { Roster.render(); Roster.load(); }
});
app.addEventListener('change', function (e) {
  if (S.view !== 'staff' || Staff.page !== 'roster') return;
  var all = e.target.dataset && e.target.dataset.rosterall;
  if (all) Array.prototype.forEach.call(app.querySelectorAll('.roster-' + all), function (x) { x.checked = e.target.checked; });
  Roster.count();
});
