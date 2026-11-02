/**
 * staff_list.js ― スタッフ画面の「選手一覧」タブ（v46）
 *
 *   全選手の一覧を、学年・ポジション・チームで絞り込み、学年別／ポジション別にまとめて見る。名前やふりがなで探せる。
 *   名前を押すと、その選手の個人ページ（staff.js の showAthlete）。
 *   データは InBody・体重タブと同じ staffBody（体組成.gs の staffBody_。v46 でポジション・ふりがな・出身校・身長を足した）。
 *   声：「選手一覧」「1年の投手を見せて」「ピッチャーは誰？」「ポジション別にして」「学年別にして」「全員を表示」（StaffList.voice）
 *
 * ★ ポジションの並び順・呼び方を変えるときは POSITIONS を書きかえる
 */
var StaffList = {
  filter: { grade: '', position: '', team: '', q: '', group: 'grade', inactive: false },

  // ポジションの並び（名簿のポジション名）と、声での呼び方
  POSITIONS: [
    ['投手', /投手|ピッチャ|ぴっちゃ/], ['捕手', /捕手|キャッチャ|きゃっちゃ/], ['一塁手', /一塁|1塁|ファスト|ふぁすと/], ['二塁手', /二塁|2塁|セカンド|せかんど/],
    ['三塁手', /三塁|3塁|サド|さど/], ['遊撃手', /遊撃|ショト|しょと/], ['外野手', /外野|がいや|アウトフィルダ/]
  ],
  INFIELD: ['一塁手', '二塁手', '三塁手', '遊撃手'],

  render: function () {
    if (!Staff.body) {
      app.innerHTML = Staff.frame('<div class="loading">読み込み中…</div>');
      return Staff.loadBody().then(function () { if (Staff.tab === 'list') StaffList.render(); }).catch(Staff.fail);
    }
    var f = StaffList.filter, all = StaffList.people(true);
    var grades = StaffList.gradeOrder(uniq(all.map(function (a) { return a.grade; })));
    var positions = StaffList.posOrder(uniq(all.map(function (a) { return a.position; })));
    var teams = uniq(all.map(function (a) { return a.team; })).filter(String).sort();
    var sel = function (key, label, values) {
      return '<select class="sel" data-sl="' + key + '"><option value="">' + label + '：すべて</option>' +
        values.filter(String).map(function (v) { return '<option' + (f[key] === v ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('') +
        (key === 'position' ? '<option value="内野手"' + (f.position === '内野手' ? ' selected' : '') + '>内野手（一塁〜遊撃）</option>' : '') + '</select>';
    };
    var grp = function (k, label) { return '<button class="tab' + (f.group === k ? ' on' : '') + '" data-sl="group" data-v="' + k + '">' + label + '</button>'; };
    var html = '<div class="card"><div class="row">' + sel('grade', '学年', grades) + sel('position', 'ポジション', positions) + sel('team', 'チーム', teams) + '</div>' +
      '<div class="row"><input class="sel sl-search" type="search" data-sl="q" placeholder="名前・ふりがなで探す" value="' + esc(f.q) + '"></div>' +
      '<div class="tabs sl-group">' + grp('grade', '学年別') + grp('position', 'ポジション別') + grp('none', 'まとめない') + '</div>' +
      '<label class="check-line small"><input type="checkbox" data-sl="inactive"' + (f.inactive ? ' checked' : '') + '> 卒業・退部した人も表示</label>' +
      '<p class="small" id="slCount"></p></div>' +
      '<div class="card"><div id="slTable"></div>' +
      '<p class="muted small">名前を押すと、その選手の個人ページを開きます。体重は最新の週平均（なければ最新の記録）です。学年・ポジション・ふりがな・出身校は選手マスタ（部員名簿から取り込めます）。</p></div>';
    app.innerHTML = Staff.frame(html);
    StaffList.renderTable();
  },

  /** 一覧の表だけ描き直す（名前で探しているときに、入力欄が消えないように） */
  renderTable: function () {
    var box = document.getElementById('slTable');
    if (!box) return;
    var list = StaffList.filtered(), f = StaffList.filter;
    var groups = StaffList.groups(list);
    document.getElementById('slCount').textContent = '表示 ' + list.length + '人' + (StaffList.isFiltered() ? '（絞り込み中）' : '');
    if (!list.length) { box.innerHTML = '<p class="muted">当てはまる選手がいません。</p>'; return; }
    var cols = '<tr><th>名前</th>' + (f.group === 'grade' ? '' : '<th>学年</th>') + (f.group === 'position' ? '' : '<th>ポジション</th>') + '<th>チーム</th><th>身長</th><th>体重</th><th>出身校</th></tr>';
    box.innerHTML = '<div class="table-scroll"><table class="tbl sl-table">' + groups.map(function (g) {
      return (g.label ? '<tr class="sl-head"><th colspan="7">' + esc(g.label) + '（' + g.list.length + '人）</th></tr>' : '') + cols +
        g.list.map(function (a) {
          var w = StaffList.weight(a);
          return '<tr class="' + (a.active ? '' : 'sl-off') + '"><td><button class="link" data-staff="athlete" data-v="' + esc(a.id) + '">' + esc(a.name) + '</button>' +
            (a.kana ? '<div class="muted small">' + esc(a.kana) + '</div>' : '') + (a.active ? '' : '<div class="muted small">在籍でない</div>') + '</td>' +
            (f.group === 'grade' ? '' : '<td>' + esc(a.grade || '-') + '</td>') + (f.group === 'position' ? '' : '<td>' + esc(a.position || '-') + '</td>') +
            '<td>' + esc(a.team || '-') + '</td><td>' + (a.height ? esc(a.height) : '-') + '</td><td>' + (w ? w.toFixed(1) : '-') + '</td><td class="small">' + esc(a.school || '-') + '</td></tr>';
        }).join('');
    }).join('') + '</table></div>';
  },

  // ---------------- データ ----------------
  people: function (withInactive) {
    return (Staff.body ? Staff.body.athletes : []).filter(function (a) { return withInactive || a.active; });
  },
  isFiltered: function () { var f = StaffList.filter; return !!(f.grade || f.position || f.team || f.q); },
  filtered: function () {
    var f = StaffList.filter, q = VoiceParser.norm(f.q);
    return StaffList.people(f.inactive).filter(function (a) {
      if (f.grade && a.grade !== f.grade) return false;
      if (f.position && !(f.position === '内野手' ? StaffList.INFIELD.indexOf(a.position) >= 0 : a.position === f.position)) return false;
      if (f.team && a.team !== f.team) return false;
      if (q && VoiceParser.norm(a.name).indexOf(q) < 0 && VoiceParser.norm(a.kana).indexOf(q) < 0) return false;
      return true;
    });
  },
  /** まとめ方に合わせて分ける：[{ label, list }]。中は 学年（4年→1年）→ ふりがな の順 */
  groups: function (list) {
    var f = StaffList.filter;
    var byKana = function (a, b) { return String(a.kana || a.name).localeCompare(String(b.kana || b.name), 'ja'); };
    var gnum = function (a) { var m = /(\d)/.exec(a.grade || ''); return m ? Number(m[1]) : 0; };
    var sorted = list.slice().sort(function (a, b) { return (b.active ? 1 : 0) - (a.active ? 1 : 0) || gnum(b) - gnum(a) || byKana(a, b); });
    if (f.group === 'none') return [{ label: '', list: sorted }];
    var key = f.group === 'position' ? function (a) { return a.position || 'ポジションなし'; } : function (a) { return a.grade || '学年なし'; };
    var keys = uniq(sorted.map(key));
    keys = f.group === 'position' ? StaffList.posOrder(keys) : StaffList.gradeOrder(keys);
    return keys.map(function (k) { return { label: k, list: sorted.filter(function (a) { return key(a) === k; }) }; });
  },
  gradeOrder: function (arr) {
    var n = function (g) { var m = /(\d)/.exec(g || ''); return m ? Number(m[1]) : 0; };
    return arr.slice().sort(function (a, b) { return n(b) - n(a) || String(a).localeCompare(String(b), 'ja'); });
  },
  posOrder: function (arr) {
    var names = StaffList.POSITIONS.map(function (p) { return p[0]; });
    var n = function (p) { var i = names.indexOf(p); return i < 0 ? 99 : i; };
    return arr.slice().sort(function (a, b) { return n(a) - n(b) || String(a).localeCompare(String(b), 'ja'); });
  },
  /** 体重：最新の週平均（なければ最新の記録） */
  weight: function (a) {
    var st = Body.weightWeekStats(a.weight || []);
    return st ? st.week.value : null;
  },

  // ---------------- 声（staff_voice.js の nav から呼ぶ） ----------------
  /** 文の中のポジション（「内野」は内野手） */
  posOf: function (t) {
    if (/内野|ないや/.test(t)) return '内野手';
    var hit = StaffList.POSITIONS.filter(function (p) { return p[1].test(t); })[0];
    return hit ? hit[0] : '';
  },
  /** 答えたら true */
  voice: function (text, t, people) {
    if (people && people.length) return false;
    var raw = VoiceParser.norm(text);   // 「一覧」「一塁」が数字に変わる前の文
    var pos = StaffList.posOf(raw), gm = t.match(/(\d)年(生)?/), onList = Staff.page === 'list';
    var openWord = /選手(の)?(一覧|いちらん|リスト)/.test(raw);
    var groupWord = /学年(別|ごと)|ポジション(別|ごと)|まとめない/.test(t);
    var reset = /全員(を)?(表示|見せ|にして)|絞り込み(を)?(解除|やめ|なし|外)|全部(を)?表示|すべて(を)?表示/.test(t);
    var ask = /一覧|見せ|みせ|表示|誰|だれ|何人|なんにん|教えて|おしえて|だけ|のみ|開|ひら/.test(t);
    if (!(openWord || (onList && (pos || gm || groupWord || reset)) || (pos && ask))) return false;

    var f = StaffList.filter;
    // 言われた条件だけで絞り込む（言われなかった学年・ポジションは外す。「学年別にして」などのまとめ方だけのときは変えない）
    if (reset || openWord) { f.grade = ''; f.position = ''; f.team = ''; f.q = ''; }
    if (pos || gm) { f.grade = ''; f.position = ''; f.q = ''; }
    if (/ポジション(別|ごと)/.test(t)) f.group = 'position';
    else if (/学年(別|ごと)/.test(t)) f.group = 'grade';
    else if (/まとめない/.test(t)) f.group = 'none';
    if (pos) { f.position = pos; if (!groupWord) f.group = 'grade'; }
    Staff.tab = 'list';
    var p = Staff.loadBody().then(function () {
      if (gm) {
        var g = uniq(StaffList.people(true).map(function (a) { return String(a.grade); })).filter(function (x) { return x.indexOf(gm[1]) >= 0; })[0];
        if (!g) { Staff.render(); reply(text, gm[1] + '年の選手が見つかりません（選手マスタの「学年」か「入学年度」を確認してください）。', true); return; }
        f.grade = g;
        if (!pos && !groupWord) f.group = 'position';
      }
      Staff.render();
      var list = StaffList.filtered();
      var what = [f.grade, f.position].filter(String).join('の') || '全員';
      var names = list.slice(0, 12).map(function (a) { return a.name; }).join('、');
      Avatar.feedback('success');
      reply(text, '選手一覧で、' + what + 'を表示しました。' + list.length + '人です。' +
        (StaffVoice.isQuestion(text, t) && list.length && list.length <= 12 ? names + 'です。' : '') +
        (f.group === 'position' ? 'ポジション別にまとめています。' : f.group === 'grade' ? '学年別にまとめています。' : ''));
    }).catch(Staff.fail);
    return true;
  }
};

// 選手一覧の操作
app.addEventListener('click', function (e) {
  var t = e.target.closest('[data-sl]');
  if (!t || S.view !== 'staff' || Staff.tab !== 'list' || t.tagName === 'SELECT' || t.tagName === 'INPUT') return;
  if (t.dataset.sl === 'group') { StaffList.filter.group = t.dataset.v; StaffList.render(); }
});
app.addEventListener('change', function (e) {
  var t = e.target;
  if (S.view !== 'staff' || Staff.tab !== 'list' || !t.dataset || !t.dataset.sl) return;
  var k = t.dataset.sl;
  if (k === 'inactive') StaffList.filter.inactive = t.checked;
  else if (k === 'q') return;
  else StaffList.filter[k] = t.value;
  StaffList.render();
});
app.addEventListener('input', function (e) {
  var t = e.target;
  if (S.view !== 'staff' || Staff.tab !== 'list' || !t.dataset || t.dataset.sl !== 'q') return;
  StaffList.filter.q = t.value;
  StaffList.renderTable();
});
