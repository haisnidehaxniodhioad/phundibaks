/**
 * staff_list.js ― スタッフ画面の「選手一覧」タブ（v46）
 *
 *   全選手の一覧を、学年・ポジション・チームで絞り込み、学年別／ポジション別にまとめて見る。名前やふりがなで探せる。
 *   名前を押すと、その選手の個人ページ（staff.js の showAthlete）。
 *   データは InBody・体重タブと同じ staffBody（体組成.gs の staffBody_。v46 でポジション・ふりがな・出身校・身長を足した）。
 *   声：「選手一覧」「1年の投手を見せて」「ピッチャーは誰？」「ポジション別にして」「学年別にして」「全員を表示」（StaffList.voice）
 *   チーム分け（v48）：「チーム分けをする」で選手の左にチェックが出る。何人でも選んで、下の欄でチームと使用メニューを選び「選んだ選手に設定」
 *     ・グループの見出しのチェックで、そのグループを全部選べる（例：学年別で「1年」を全部 → Bチーム）
 *     ・使用メニューは「チームのメニュー（自動）」なら、メニューシートの「対象チーム」がそのチームのメニューにする
 *     ・保存は Apps Script の setTeams（体組成.gs）。選手マスタの「チーム」「使用メニューID」の列だけを書きかえる
 *
 * ★ ポジションの並び順・呼び方を変えるときは POSITIONS を書きかえる
 */
var StaffList = {
  filter: { grade: '', position: '', team: '', q: '', group: 'grade', inactive: false, check: '' },   // check（v65）＝A・B・Cの確認項目（StaffQA.is のキー）
  sel: '',         // v65：PC の右の概要に出している選手のID
  edit: false,     // チーム分けの最中か（v48）
  picked: {},      // 選んだ選手 { 選手ID: true }
  msg: '',         // 保存したあとのお知らせ

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
    StaffList.loadOverview();
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
    if (StaffList.edit && f.group === 'none') f.group = 'team';
    var chk = '<select class="sel" data-sl="check"><option value="">確認：すべて</option>' + Object.keys(StaffQA.CHECK_LABELS).map(function (k) {
      return '<option value="' + k + '"' + (f.check === k ? ' selected' : '') + '>' + esc(StaffQA.CHECK_LABELS[k]) + '</option>'; }).join('') + '</select>';
    var html = '<div class="sl-wrap"><div class="sl-main"><div class="card"><div class="row">' + sel('grade', '学年', grades) + sel('position', 'ポジション', positions) + sel('team', 'チーム', teams) + chk + '</div>' +
      '<div class="row"><input class="sel sl-search" type="search" data-sl="q" placeholder="名前・ふりがなで探す" value="' + esc(f.q) + '"></div>' +
      '<div class="tabs sl-group">' + grp('grade', '学年別') + grp('position', 'ポジション別') + grp('team', 'チーム別') + (StaffList.edit ? '' : grp('none', 'まとめない')) + '</div>' +
      '<label class="check-line small"><input type="checkbox" data-sl="inactive"' + (f.inactive ? ' checked' : '') + '> 卒業・退部した人も表示</label>' +
      '<p class="small" id="slCount"></p><div id="slCheck"></div>' +
      '<button class="btn ' + (StaffList.edit ? 'ghost' : 'sub') + ' block" data-sl="edit">' + (StaffList.edit ? 'チーム分けを終わる' : 'チーム分けをする（選手を選んでまとめて設定）') + '</button></div>' +
      (StaffList.msg ? '<div class="card">' + StaffList.msg + '</div>' : '') +
      '<div class="card"><div id="slTable"></div>' +
      '<p class="muted small">名前を押すと、その選手の個人ページを開きます。体重は最新の週平均（なければ最新の記録）です。学年・ポジション・ふりがな・出身校は選手マスタ（部員名簿から取り込めます）。A・B・C はダッシュボードで表示している週の判定です。</p></div>' +
      (StaffList.edit ? StaffList.barHtml(teams) : '') + '</div>' +
      (StaffList.edit ? '' : '<aside class="sl-side card" id="slSum"></aside>') + '</div>';
    app.innerHTML = Staff.frame(html);
    StaffList.renderTable();
    StaffList.syncBar();
  },

  /** 一覧の表だけ描き直す（名前で探しているときに、入力欄が消えないように） */
  renderTable: function () {
    var box = document.getElementById('slTable');
    if (!box) return;
    var list = StaffList.filtered(), f = StaffList.filter;
    var groups = StaffList.groups(list);
    document.getElementById('slCount').textContent = '表示 ' + list.length + '人' + (StaffList.isFiltered() ? '（絞り込み中）' : '');
    StaffList.checkNote();
    if (f.check && !Staff.overview) { box.innerHTML = '<div class="loading">確認項目を集計中…</div>'; StaffList.renderSum([]); return; }
    if (!list.length) { box.innerHTML = '<p class="muted">当てはまる選手がいません。</p>'; StaffList.renderSum([]); return; }
    var ed = StaffList.edit, pk = StaffList.picked;
    var cols = '<tr class="sl-cols">' + (ed ? '<th></th>' : '') + '<th>名前</th>' + (f.group === 'grade' ? '' : '<th>学年</th>') + (f.group === 'position' ? '' : '<th>ポジション</th>') +
      (f.group === 'team' ? '' : '<th>チーム</th>') + (ed ? '<th>メニュー</th>' : '<th>身長</th><th>体重</th><th>出身校</th>') + '</tr>';
    box.innerHTML = '<div class="table-scroll"><table class="tbl sl-table">' + groups.map(function (g, gi) {
      var all = g.list.every(function (a) { return pk[a.id]; });
      return (g.label ? '<tr class="sl-head"><th colspan="8">' + (ed ? '<label class="sl-gpick"><input type="checkbox" data-sl="gpick" data-g="' + gi + '"' + (all ? ' checked' : '') + '> ' : '') +
          esc(g.label) + '（' + g.list.length + '人）' + (ed ? '</label>' : '') + '</th></tr>' : '') + cols +
        g.list.map(function (a) {
          var w = StaffList.weight(a);
          return '<tr class="sl-row' + (a.active ? '' : ' sl-off') + (ed && pk[a.id] ? ' sl-picked' : '') + (!ed && StaffList.sel === a.id ? ' sl-sel' : '') + '"' + (ed ? '' : ' data-sl="sel" data-id="' + esc(a.id) + '"') + '>' +
            (ed ? '<td><input type="checkbox" class="sl-pick" data-sl="pick" data-id="' + esc(a.id) + '"' + (pk[a.id] ? ' checked' : '') + ' aria-label="' + esc(a.name) + 'を選ぶ"></td>' : '') +
            '<td class="sl-name"><button class="link" data-staff="athlete" data-v="' + esc(a.id) + '">' + esc(a.name) + '</button>' + StaffList.chipHtml(a.id) +
            (a.kana ? '<div class="muted small">' + esc(a.kana) + '</div>' : '') + (a.active ? '' : '<div class="muted small">在籍でない</div>') + '</td>' +
            (f.group === 'grade' ? '' : '<td data-l="学年">' + esc(a.grade || '-') + '</td>') + (f.group === 'position' ? '' : '<td data-l="ポジション">' + esc(a.position || '-') + '</td>') +
            (f.group === 'team' ? '' : '<td data-l="チーム">' + esc(a.team || '-') + '</td>') +
            (ed ? '<td data-l="メニュー">' + esc(a.menuId || '-') + '</td>' : '<td data-l="身長">' + (a.height ? esc(a.height) : '-') + '</td><td data-l="体重">' + (w ? w.toFixed(1) : '-') + '</td><td class="small" data-l="出身校">' + esc(a.school || '-') + '</td>') + '</tr>';
        }).join('');
    }).join('') + '</table></div>';
    StaffList.shown = groups;
    StaffList.renderSum(list);
  },

  // ---------------- v65：確認項目（A・B・C）と、PC の右の概要 ----------------
  /** 実施状況（staffOverview）を、まだ無ければ読む。読めなくても一覧はそのまま使える */
  loadOverview: function () {
    if (Staff.overview || StaffList.ovLoading) return;
    StaffList.ovLoading = true;
    Api.call('staffOverview', { token: S.token, weekStart: Staff.week }).then(function (res) {
      StaffList.ovLoading = false; if (!Staff.overview) Staff.overview = res;
      if (Staff.tab === 'list' && Staff.page === 'list') StaffList.renderTable();
    }).catch(function () { StaffList.ovLoading = false; });
  },
  /** 選手ID → 実施状況の1人分（在籍中だけ） */
  ovOf: function (id) {
    return Staff.overview ? Staff.overview.athletes.filter(function (x) { return x.id === id; })[0] || null : null;
  },
  /** 当てはまる確認項目のキー（A1・A2・B1・B2・C の順） */
  checksOf: function (id) {
    var o = StaffList.ovOf(id);
    return o ? Object.keys(StaffQA.is).filter(function (k) { return StaffQA.is[k](o); }) : [];
  },
  /** 名前の横の印（A・B・C。色は A＞B＞C の優先で1つ） */
  chipHtml: function (id) {
    var ks = StaffList.checksOf(id);
    if (!ks.length) return '';
    var letters = uniq(ks.map(function (k) { return k.charAt(0); }));
    return ' <span class="chk-chip chk-' + letters[0] + '" title="' + esc(ks.map(function (k) { return StaffQA.CHECK_LABELS[k]; }).join('・')) + '">' + letters.join('') + '</span>';
  },
  /** 確認項目で絞り込んでいるときの説明と「解除」 */
  checkNote: function () {
    var box = document.getElementById('slCheck'), k = StaffList.filter.check, o = Staff.overview;
    if (!box) return;
    if (!k) { box.innerHTML = ''; return; }
    var span = k === 'C' ? '今日から7日' : o ? o.weekStart.slice(5).replace('-', '/') + '〜' + o.weekEnd.slice(5).replace('-', '/') + 'の週' : '';
    box.innerHTML = '<p class="small"><span class="chip">' + esc(StaffQA.CHECK_LABELS[k]) + (span ? '（' + esc(span) + '）' : '') + '</span> ' +
      '<button class="btn ghost small" data-sl="clearCheck">確認の絞り込みを外す</button></p>';
  },
  /** PC（幅1200px以上）の右の概要。スマホ・タブレットでは CSS で隠す */
  renderSum: function (list) {
    var box = document.getElementById('slSum');
    if (!box) return;
    var a = list.filter(function (x) { return x.id === StaffList.sel; })[0] || list[0];
    if (!a) { box.innerHTML = '<p class="muted small">選手がいません。</p>'; return; }
    StaffList.sel = a.id;
    var o = StaffList.ovOf(a.id), w = StaffList.weight(a), ib = (a.inbody || []).slice().sort(function (x, y) { return x.date < y.date ? -1 : 1; }).pop();
    var row = function (k, v) { return '<tr><th>' + k + '</th><td>' + v + '</td></tr>'; };
    var ks = StaffList.checksOf(a.id);
    box.innerHTML = '<h2>' + esc(a.name) + '</h2>' + (a.kana ? '<p class="muted small">' + esc(a.kana) + '</p>' : '') +
      '<p class="small">' + esc([a.grade, a.position, a.team ? a.team + 'チーム' : ''].filter(String).join('・') || '-') + '</p>' +
      (ks.length ? '<p>' + ks.map(function (k) { return '<span class="chk-chip chk-' + k.charAt(0) + '">' + esc(StaffQA.CHECK_LABELS[k]) + '</span>'; }).join(' ') + '</p>' : '') +
      '<h3>この週</h3><table class="tbl">' +
      (o ? row('回数', o.sessions + '回') + row('Day', o.menuDays ? o.daysDone + '/' + o.menuDays : '-') +
        row('コンディション', o.cond ? '疲労 ' + o.cond.whole + '/' + o.cond.upper + '/' + o.cond.lower + '・動き ' + o.cond.perf : '未入力') +
        row('最終', o.lastDate ? esc(o.lastDate.slice(5).replace('-', '/')) : 'なし')
        : row('実施状況', Staff.overview ? '在籍でない' : '読み込み中…')) + '</table>' +
      '<h3>からだ</h3><table class="tbl">' + row('体重', w ? w.toFixed(1) + 'kg' : '-') +
      row('InBody', ib ? esc(ib.date.slice(5).replace('-', '/')) + '・FFMI ' + Body.f1(ib.ffmi) : '-') + row('身長', a.height ? esc(a.height) : '-') + '</table>' +
      '<button class="btn block" data-staff="athlete" data-v="' + esc(a.id) + '">個人ページを開く</button>';
  },
  /** ダッシュボードの A・B・C から開く（ダッシュボードの学年・チームの絞り込みを引き継ぐ） */
  showCheck: function (k) {
    if (!StaffQA.is[k]) return;
    var f = StaffList.filter;
    f.check = k; f.grade = Staff.filter.grade || ''; f.team = Staff.filter.team || ''; f.position = ''; f.q = ''; f.inactive = false;
    StaffList.edit = false; StaffList.picked = {}; StaffList.msg = ''; StaffList.sel = '';
    Staff.tab = 'list'; Staff.render(); window.scrollTo(0, 0);
  },

  // ---------------- チーム分け（v48） ----------------
  menus: function () { return (Staff.body && Staff.body.menus) || []; },
  /** 画面の下に出す、まとめて設定する欄 */
  barHtml: function (teams) {
    var menuTeams = uniq(StaffList.menus().map(function (m) { return m.team; })).filter(String);
    var names = uniq(teams.concat(menuTeams)).sort();
    return '<div class="sl-bar card"><div class="sl-bar-row"><b id="slPicked">0人を選択中</b>' +
      '<button class="btn ghost small" data-sl="pickShown">表示中を全部選ぶ</button><button class="btn ghost small" data-sl="pickNone">選ぶのをやめる</button></div>' +
      '<div class="row"><label class="small">チーム <select class="sel" id="slTeam">' +
      names.map(function (t) { return '<option value="' + esc(t) + '">' + esc(t) + '</option>'; }).join('') +
      '<option value="__new">新しいチーム…</option><option value="">チームなし</option></select></label>' +
      '<input class="sel sl-newteam" id="slNewTeam" placeholder="新しいチーム名" maxlength="20" hidden></div>' +
      '<div class="row"><label class="small">使用メニュー <select class="sel" id="slMenu"><option value="auto">チームのメニュー（自動）</option><option value="keep">変えない</option>' +
      StaffList.menus().map(function (m) { return '<option value="' + esc(m.id) + '">' + esc(m.id) + (m.team ? '（' + esc(m.team) + 'チーム・' : '（') + m.days + 'Day）</option>'; }).join('') +
      '<option value="">メニューなし</option></select></label></div>' +
      '<p class="muted small" id="slMenuNote"></p>' +
      '<button class="btn block" data-sl="apply" id="slApply">選んだ選手に設定する</button></div>';
  },
  /** 選んだ人数・自動のときのメニューを表示する */
  syncBar: function () {
    var el = document.getElementById('slPicked');
    if (!el) return;
    var n = Object.keys(StaffList.picked).length, ch = StaffList.choice();
    el.textContent = n + '人を選択中';
    document.getElementById('slNewTeam').hidden = document.getElementById('slTeam').value !== '__new';
    document.getElementById('slMenuNote').textContent = ch.note;
    var b = document.getElementById('slApply');
    b.disabled = !n || ch.error;
    b.textContent = n ? '選んだ' + n + '人を「' + (ch.team || 'チームなし') + '」にする' : '選手を選んでください';
  },
  /** 選んだチームとメニュー：{ team, menuId（'keep' も）, note, error } */
  choice: function () {
    var ts = document.getElementById('slTeam'), ms = document.getElementById('slMenu');
    var team = ts.value === '__new' ? document.getElementById('slNewTeam').value.trim() : ts.value;
    var mv = ms.value, out = { team: team, menuId: mv, note: '', error: false };
    if (ts.value === '__new' && !team) { out.error = true; out.note = '新しいチーム名を入れてください。'; return out; }
    if (mv === 'auto') {
      var hit = StaffList.menus().filter(function (m) { return team && m.team === team; });
      if (hit.length) { out.menuId = hit[0].id; out.note = '使用メニューは ' + hit[0].id + '（メニューシートの「対象チーム」が' + team + '）にします。' + (hit.length > 1 ? '（' + team + 'チームのメニューが' + hit.length + 'つあります。別のものにするときは、使用メニューを選んでください）' : ''); }
      else { out.menuId = 'keep'; out.note = team ? team + 'チームのメニューがメニューシートに無いので、使用メニューは変えません。' : 'チームなしにするので、使用メニューは変えません。'; }
    } else if (mv === 'keep') out.note = '使用メニューは今のままにします。';
    else if (mv === '') out.note = '使用メニューを空にします（チームのメニューが使えなくなり、自分のメニュー・白紙からの記録だけになります）。';
    else out.note = '使用メニューを ' + mv + ' にします。';
    return out;
  },
  apply: function () {
    var ids = Object.keys(StaffList.picked), ch = StaffList.choice();
    if (!ids.length || ch.error) return;
    var who = StaffList.people(true).filter(function (a) { return StaffList.picked[a.id]; }).map(function (a) { return a.name; });
    if (!confirm(ids.length + '人（' + who.slice(0, 5).join('、') + (who.length > 5 ? ' ほか' : '') + '）を「' + (ch.team || 'チームなし') + '」にします。\n' + ch.note + '\nよろしいですか？')) return;
    var b = document.getElementById('slApply'); b.disabled = true; b.textContent = '保存しています…';
    Api.call('setTeams', { token: S.token, ids: ids, team: ch.team, menuId: ch.menuId }).then(function (res) {
      StaffList.picked = {};
      StaffList.msg = msgHtml('ok', res.updated + '人を「' + (res.team || 'チームなし') + '」にしました。' + (res.menuId === null ? '' : '使用メニューは ' + (res.menuId || 'なし') + ' です。'));
      Staff.body = null; Staff.overview = null;   // 読み直す
      if (Staff.tab === 'list') StaffList.render();
    }).catch(function (err) { StaffList.msg = msgHtml('error', err.message); StaffList.render(); });
  },

  // ---------------- データ ----------------
  people: function (withInactive) {
    return (Staff.body ? Staff.body.athletes : []).filter(function (a) { return withInactive || a.active; });
  },
  isFiltered: function () { var f = StaffList.filter; return !!(f.grade || f.position || f.team || f.q || f.check); },
  filtered: function () {
    var f = StaffList.filter, q = VoiceParser.norm(f.q);
    return StaffList.people(f.inactive).filter(function (a) {
      if (f.grade && a.grade !== f.grade) return false;
      if (f.position && !(f.position === '内野手' ? StaffList.INFIELD.indexOf(a.position) >= 0 : a.position === f.position)) return false;
      if (f.team && a.team !== f.team) return false;
      if (q && VoiceParser.norm(a.name).indexOf(q) < 0 && VoiceParser.norm(a.kana).indexOf(q) < 0) return false;
      if (f.check && StaffList.checksOf(a.id).indexOf(f.check) < 0) return false;   // v65：A・B・C（在籍中の選手だけが当てはまる）
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
    var key = f.group === 'position' ? function (a) { return a.position || 'ポジションなし'; } :
              f.group === 'team' ? function (a) { return a.team ? a.team + 'チーム' : 'チームなし'; } : function (a) { return a.grade || '学年なし'; };
    var keys = uniq(sorted.map(key));
    keys = f.group === 'position' ? StaffList.posOrder(keys) : f.group === 'team' ? keys.sort(function (a, b) { return (a === 'チームなし') - (b === 'チームなし') || a.localeCompare(b, 'ja'); }) : StaffList.gradeOrder(keys);
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
    // チーム分けの画面を開く（v48。設定そのものは、画面で選んでボタンで行う）
    if (/チ(ム|ーム)分け|チ(ム|ーム)わけ/.test(t) && !/終わ|おわ|やめ/.test(t)) {
      Staff.tab = 'list'; StaffList.edit = true; StaffList.picked = {}; StaffList.msg = '';
      Staff.loadBody().then(function () { Staff.render(); Avatar.feedback('success');
        reply(text, 'チーム分けの画面にしました。選手の左のチェックで選び、下の欄でチームを選んで「設定する」を押してください。見出しのチェックで、学年やポジションごとにまとめて選べます。'); }).catch(Staff.fail);
      return true;
    }
    var raw = VoiceParser.norm(text);   // 「一覧」「一塁」が数字に変わる前の文
    var pos = StaffList.posOf(raw), gm = t.match(/(\d)年(生)?/), onList = Staff.page === 'list';
    var openWord = /選手(の)?(一覧|いちらん|リスト)/.test(raw);
    var groupWord = /学年(別|ごと)|ポジション(別|ごと)|チ(ム|ーム)(別|ごと)|まとめない/.test(t);
    var reset = /全員(を)?(表示|見せ|にして)|絞り込み(を)?(解除|やめ|なし|外)|全部(を)?表示|すべて(を)?表示/.test(t);
    var ask = /一覧|見せ|みせ|表示|誰|だれ|何人|なんにん|教えて|おしえて|だけ|のみ|開|ひら/.test(t);
    if (!(openWord || (onList && (pos || gm || groupWord || reset)) || (pos && ask))) return false;

    var f = StaffList.filter;
    // 言われた条件だけで絞り込む（言われなかった学年・ポジションは外す。「学年別にして」などのまとめ方だけのときは変えない）
    if (reset || openWord) { f.grade = ''; f.position = ''; f.team = ''; f.q = ''; f.check = ''; }
    if (pos || gm) { f.grade = ''; f.position = ''; f.q = ''; }
    if (/ポジション(別|ごと)/.test(t)) f.group = 'position';
    else if (/学年(別|ごと)/.test(t)) f.group = 'grade';
    else if (/チ(ム|ーム)(別|ごと)/.test(t)) f.group = 'team';
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
  if (t.dataset.sl === 'edit') { StaffList.edit = !StaffList.edit; StaffList.picked = {}; StaffList.msg = ''; StaffList.render(); }
  if (t.dataset.sl === 'pickShown') { StaffList.filtered().forEach(function (a) { StaffList.picked[a.id] = true; }); StaffList.renderTable(); StaffList.syncBar(); }
  if (t.dataset.sl === 'pickNone') { StaffList.picked = {}; StaffList.renderTable(); StaffList.syncBar(); }
  if (t.dataset.sl === 'apply') StaffList.apply();
  if (t.dataset.sl === 'clearCheck') { StaffList.filter.check = ''; StaffList.render(); }
  if (t.dataset.sl === 'sel' && !e.target.closest('[data-staff]')) {   // v65：行を押すと右の概要（PC）
    StaffList.sel = t.dataset.id;
    document.querySelectorAll('.sl-row.sl-sel').forEach(function (r) { r.classList.remove('sl-sel'); });
    t.classList.add('sl-sel');
    StaffList.renderSum(StaffList.filtered());
  }
});
app.addEventListener('change', function (e) {
  var t = e.target;
  if (S.view !== 'staff' || Staff.tab !== 'list' || !t.dataset || !t.dataset.sl) return;
  var k = t.dataset.sl;
  // チーム分け（v48）：チェックは表を描き直すだけ（絞り込みや入力欄はそのまま）
  if (k === 'pick') { if (t.checked) StaffList.picked[t.dataset.id] = true; else delete StaffList.picked[t.dataset.id]; t.closest('tr').classList.toggle('sl-picked', t.checked); StaffList.renderTable(); StaffList.syncBar(); return; }
  if (k === 'gpick') { (StaffList.shown[Number(t.dataset.g)] || { list: [] }).list.forEach(function (a) { if (t.checked) StaffList.picked[a.id] = true; else delete StaffList.picked[a.id]; }); StaffList.renderTable(); StaffList.syncBar(); return; }
  if (k === 'inactive') StaffList.filter.inactive = t.checked;
  else if (k === 'q') return;
  else StaffList.filter[k] = t.value;
  StaffList.render();
});
// チーム分けの欄（チーム・メニューを選んだとき、新しいチーム名を入れているとき）
app.addEventListener('change', function (e) {
  if (S.view === 'staff' && Staff.tab === 'list' && /^sl(Team|Menu)$/.test(e.target.id || '')) StaffList.syncBar();
});
app.addEventListener('input', function (e) {
  if (S.view === 'staff' && Staff.tab === 'list' && e.target.id === 'slNewTeam') StaffList.syncBar();
});
app.addEventListener('input', function (e) {
  var t = e.target;
  if (S.view !== 'staff' || Staff.tab !== 'list' || !t.dataset || t.dataset.sl !== 'q') return;
  StaffList.filter.q = t.value;
  StaffList.renderTable();
});
