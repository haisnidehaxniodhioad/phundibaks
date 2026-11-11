/**
 * staff_body.js ― スタッフ画面の「InBody」タブと「体重」タブ（Phase 3c）
 *
 * InBodyタブ: 体組成Excel（InBody結果）の取り込み、ランキング（FFMI・除脂肪体重・体脂肪率・体重）、
 *             フィジカルレポートのPDF（学年まとめ）、Excel（ランキング・最新値）
 * 体重タブ  : 体重管理表の取り込み、測定日ごとの体重一覧（未測定は赤・前回比・4週前比）、
 *             体重レポートのPDF（学年まとめ）、Excel（一覧・全履歴）
 * InBodyタブの一番下に「基準の設定（全員共通）」（body_base.js・Phase 3e）。
 * v39：InBody・体重タブで選手の名前を押すと、その選手のフィジカルレポート（InBody／体重）を直接開く（staff.js の Staff.openReport）。
 * 取り込みは、それぞれのタブで対応するファイルだけを受け付ける（違うファイルを選ぶと知らせる）。
 */
var StaffBody = {
  kind: 'inbody', parsed: null, fileName: '', importDate: '', result: '', openImport: false,
  metric: 'ffmi', rankDate: '', weightDate: '', weightSort: 'roster',

  render: function (kind) {
    StaffBody.kind = kind;
    if (!Staff.body) {
      app.innerHTML = Staff.frame('<div class="loading">読み込み中…</div>');
      Staff.loadBody().then(function () { StaffBody.render(kind); }).catch(Staff.fail);
      return;
    }
    // v65：いちばん上に最新の状況。v71：取り込みはそのすぐ下（いちばん下だと見つけにくかったため）
    var view = kind === 'weight' ? StaffBody.weightView() : StaffBody.inbodyView() + BodyBase.teamCard();
    app.innerHTML = Staff.frame(StaffBody.summaryCard(kind) + StaffBody.importCard(kind) + view);
    if (StaffBody.openImport) {   // v71：管理・設定の「取り込み」から来たときは、取り込みを開いてそこまで動く
      StaffBody.openImport = false;
      var card = document.querySelector('.import-card');
      if (card) { card.open = true; setTimeout(function () { card.scrollIntoView({ block: 'start' }); window.scrollBy(0, -130); }, 0); }
    }
  },

  /** v65：最新の状況（測定日・測った人数・平均）。推移は選手名から開くフィジカルレポートで見る */
  summaryCard: function (kind) {
    var people = StaffBody.people(), key = kind === 'weight' ? 'weight' : 'inbody';
    var last = function (a) { var l = a[key].filter(function (r) { return kind !== 'weight' || r.src !== '本人'; }); return l.length ? l.reduce(function (x, y) { return y.date >= x.date ? y : x; }) : null; };
    var latest = people.map(last).filter(Boolean);
    var day = latest.map(function (r) { return r.date; }).sort().pop() || '';
    var onDay = latest.filter(function (r) { return r.date === day; }).length;
    var avg = function (k) { var v = latest.map(function (r) { return Body.num(r[k]); }).filter(function (x) { return x !== null; }); return v.length ? (v.reduce(function (s, x) { return s + x; }, 0) / v.length).toFixed(1) : '-'; };
    var box = function (label, val) { return '<div class="kpi"><span class="small muted">' + label + '</span><b>' + val + '</b></div>'; };
    var md = day ? esc(day.slice(5).replace('-', '/')) : 'なし';
    var who = (Staff.filter.grade || '全学年') + (Staff.filter.team ? '・' + Staff.filter.team + 'チーム' : '');
    return '<div class="card data-sum"><h2>' + (kind === 'weight' ? '体重' : 'InBody') + 'の最新の状況</h2><div class="kpi-grid">' +
      box('いちばん新しい測定日', md) + box('その日に測った人', onDay + ' / ' + people.length + '人') +
      (kind === 'weight' ? box('体重の平均（各選手の最新）', avg('weight') + 'kg') :
        box('FFMIの平均（各選手の最新）', avg('ffmi')) + box('体脂肪率の平均', avg('fat') + '%')) + '</div>' +
      '<p class="muted small">' + esc(who) + '・在籍中の選手。選手名を押すと、その選手のフィジカルレポート（推移のグラフ）を開きます。' + (kind === 'weight' ? '本人が入れた体重は測定日に数えません。' : '') + '</p></div>';
  },

  /** 絞り込み後の選手（在籍中のみ） */
  people: function () {
    var f = Staff.filter;
    return Staff.body.athletes.filter(function (a) { return a.active && !StaffQA.isTest(a) && (!f.grade || a.grade === f.grade) && (!f.team || a.team === f.team); });   // v87：テスト用を除く
  },

  // ---------------- 取り込み ----------------
  importCard: function (kind) {
    var label = kind === 'weight' ? '体重管理表' : '体組成Excel（InBody結果）';
    var p = StaffBody.parsed && StaffBody.parsed.kind === kind ? StaffBody.parsed : null;
    var hasData = Staff.body.athletes.some(function (a) { return kind === 'weight' ? a.weight.length : a.inbody.length; });
    var open = p || StaffBody.result || !hasData ? ' open' : '';   // まだ記録が無いときは最初から開いておく
    var html = '<details class="card import-card"' + open + '><summary><b>' + Icon('download', 18) + ' ' + label + 'を取り込む</b></summary>' +
      '<p class="muted small">ファイルを選ぶと読み取り、Excelに入っているすべての測定日を取り込みます（同じ選手・同じ日は上書き）。ファイルはこの端末の中で読むだけで、保存はしません。</p>' +
      '<input type="file" accept=".xlsx,.xls" data-sb="file">';
    if (StaffBody.result) html += '<div class="msg ok">' + esc(StaffBody.result) + '</div>';
    if (p) {
      var roster = Staff.body.athletes.map(function (a) { return String(a.name).normalize('NFKC').replace(/\s/g, ''); });
      var date = StaffBody.importDate;
      var target = p.records.filter(function (r) { return !date || r.date === date; });
      var names = uniq(target.map(function (r) { return r.name; }));
      var unknown = names.filter(function (n) { return roster.indexOf(String(n).normalize('NFKC').replace(/\s/g, '')) < 0; });
      html += '<p><b>' + esc(StaffBody.fileName) + '</b>　測定日 ' + p.dates.length + '日分</p>' +
        '<label>取り込む測定日（ふつうは「すべての日付」のままでよい）</label><select class="sel" data-sb="importDate"><option value="">すべての日付（' + p.dates.length + '日分）</option>' +
        p.dates.slice().reverse().map(function (d) { return '<option' + (d === date ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select>' +
        '<p>取り込み対象：<b>' + target.length + '件</b>（' + names.length + '人）</p>' +
        (unknown.length ? '<div class="msg warn">選手マスタに無い名前（取り込まれません）：' + esc(unknown.join('、')) + '</div>' : '') +
        (p.warnings.length ? '<details class="msg warn"><summary>注意 ' + p.warnings.length + '件（範囲外の値・表記ゆれなど）</summary><div class="small">' +
          p.warnings.slice(0, 200).map(esc).join('<br>') + '</div></details>' : '') +
        '<button class="btn block big" data-sb="doImport"' + (target.length ? '' : ' disabled') + '>この内容で取り込む</button>';
    }
    return html + '</details>';
  },

  onFile: function (input) {
    var file = input.files && input.files[0], kind = StaffBody.kind;
    if (!file) return;
    StaffBody.fileName = file.name; StaffBody.importDate = ''; StaffBody.result = '';
    app.innerHTML = Staff.frame('<div class="loading">読み取り中…</div>');
    Importer.readFile(file).then(function (rows) {
      var parsed = Importer.parse(rows);
      if (parsed.kind !== kind) {
        StaffBody.parsed = null;
        StaffBody.result = '';
        StaffBody.render(kind);
        alert(parsed.kind === 'weight' ? 'このファイルは体重管理表のようです。「体重」タブで取り込んでください。'
                                       : 'このファイルは体組成Excel（InBody結果）のようです。「InBody」タブで取り込んでください。');
        return;
      }
      StaffBody.parsed = parsed;
      StaffBody.render(kind);
    }).catch(Staff.fail);
  },

  doImport: function () {
    var p = StaffBody.parsed, date = StaffBody.importDate, kind = StaffBody.kind;
    var rows = p.records.filter(function (r) { return !date || r.date === date; });
    if (!confirm((date || 'すべての日付') + ' の ' + rows.length + '件を取り込みます。同じ選手・同じ日の記録は上書きされます。よろしいですか？')) return;
    app.innerHTML = Staff.frame('<div class="loading">取り込み中…（件数が多いと数十秒かかります）</div>');
    Api.call('importBody', { token: S.token, kind: kind, fileName: StaffBody.fileName, rows: rows }).then(function (res) {
      Staff.body = null; StaffBody.parsed = null; StaffBody.weightDateSet = false;   // 取り込み後は最新の測定日を表示し直す
      StaffBody.result = '取り込みました：追加 ' + res.added + '件、上書き ' + res.updated + '件' +
        (res.skipped ? '、範囲外でスキップ ' + res.skipped + '件' : '') +
        (res.unknown.length ? '。選手マスタに無い名前：' + res.unknown.join('、') : '') +
        (res.duplicated.length ? '。同姓同名のため取り込めなかった名前：' + res.duplicated.join('、') : '');
      StaffBody.render(kind);
    }).catch(Staff.fail);
  },

  // ---------------- InBodyタブ ----------------
  inbodyView: function () {
    var metric = StaffBody.metric, date = StaffBody.rankDate, f = Staff.filter, people = StaffBody.people();
    var dates = uniq([].concat.apply([], Staff.body.athletes.map(function (a) { return a.inbody.map(function (r) { return r.date; }); }))).sort().reverse();
    var rows = people.map(function (a) {
      var list = a.inbody.filter(function (r) { return r[metric] !== '' && (!date || r.date <= date); });
      var r = list[list.length - 1];
      return r ? { id: a.id, name: a.name, grade: a.grade, value: r[metric], date: r.date } : null;
    }).filter(Boolean).sort(function (x, y) { return y.value - x.value; });
    var labels = { weight: '体重（InBody）', fat: '体脂肪率', lbm: '除脂肪体重', ffmi: 'FFMI' };   // 体重→体脂肪率→除脂肪体重→FFMIの順
    StaffBody.rankRows = rows.map(function (r, i) { return { rank: i > 0 && rows[i - 1].value === r.value ? '' : i + 1, id: r.id, name: r.name, grade: r.grade, value: r.value, date: r.date }; });
    StaffBody.rankTitle = labels[metric];
    StaffBody.rankSub = (f.grade || '全学年') + '・' + (date ? date + '以前の最新の記録' : '最新の記録') + '・' + rows.length + '人';

    var html = '<div class="card"><h2>InBodyのランキング</h2><div class="row">' +
      '<select class="sel" data-sb="metric">' + Object.keys(labels).map(function (k) { return '<option value="' + k + '"' + (metric === k ? ' selected' : '') + '>' + labels[k] + '</option>'; }).join('') + '</select>' +
      '<select class="sel" data-sb="rankDate"><option value="">最新の記録</option>' + dates.map(function (d) { return '<option' + (d === date ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select>' +
      Staff.select('grade', '学年', uniq(Staff.body.athletes.map(function (a) { return a.grade; }))) + '</div>' +
      '<p class="muted small">測定日を選ぶと、その日以前のいちばん新しい記録で並べます。選手名を押すと個別のレポートを表示します。</p>' +
      '<div class="row"><button class="btn sub" data-sb="xRankPdf">' + Icon('file', 18) + 'ランキングをPDF</button><button class="btn sub" data-sb="xRankXlsx">' + Icon('sheet', 18) + 'ランキングをExcel</button></div>' +
      // v83：FFMIランキングの掲示物（A3横・全員）。学年・項目の選択に関係なく、全員のFFMI（測定日の選択は使う）
      '<div class="row"><button class="btn sub" data-sb="xPosterWeight">' + Icon('file', 18) + 'FFMIランキング掲示（A3・ウェイトルーム用）</button><button class="btn sub" data-sb="xPosterDining">' + Icon('file', 18) + 'FFMIランキング掲示（A3・食堂用・説明つき）</button></div>' +
      '<div class="row"><button class="btn sub" data-sb="xReportsPdf">' + Icon('file', 18) + '学年のフィジカルレポートをまとめてPDF保存</button>' +
      '<button class="btn sub" data-sb="xLatestXlsx">' + Icon('sheet', 18) + '表示中の選手のInBody最新値をExcel</button></div></div>';
    html += '<div class="card"><div class="table-scroll"><table class="tbl"><tr><th>順位</th><th>選手</th><th>学年</th><th>' + esc(labels[metric]) + '</th><th>測定日</th></tr>' +
      StaffBody.rankRows.map(function (r) {
        return '<tr><td>' + r.rank + '</td><td><button class="link" data-staff="openReport" data-v="' + esc(r.id) + '" data-tab="inbody">' + esc(r.name) + '</button></td><td>' + esc(r.grade) +
          '</td><td><b>' + esc(r.value) + '</b></td><td class="small">' + esc(r.date) + '</td></tr>';
      }).join('') + '</table></div>' + (rows.length ? '' : '<p class="muted">InBodyの記録がありません。「取り込む」から体組成Excelを取り込んでください。</p>') + '</div>';
    return StaffBody.teamCompHtml(StaffBody.compPeople(), date) + html;   // v74：全員の体組成の比較（ランキングの上）。v75：学年・ポジション・チームはグラフ専用の絞り込み
  },

  // ---------------- v74：全員の体組成の比較（除脂肪体重×FFMI。学年カラー） ----------------
  //   学年カラーは「入学した年度」で決まり、学年が上がっても変わらない（4年ごとにくり返す）。
  //   2026年度：4年（2023年度入学）＝黄、3年（2024）＝青、2年（2025）＝赤、1年（2026）＝緑。
  //   新入生は、前の年度の4年生（卒業した学年）と同じ色になる（2027年度入学＝黄）。
  //   ★ 色や基準の年度を変えるときは GRADE_COLORS・GRADE_COLOR_BASE を書きかえる
  GRADE_COLOR_BASE: 2023,   // この年度に入学した学年が GRADE_COLORS[0]（黄）
  GRADE_COLORS: [{ name: '黄', c: '#E8A800' }, { name: '青', c: '#2F6FD6' }, { name: '赤', c: '#D93F3F' }, { name: '緑', c: '#2E9E55' }],
  compNames: true,
  compF: { grade: '', position: '', team: '' },   // v75：グラフ専用の絞り込み（学年・ポジション・チーム。空＝すべて）
  /** v75：グラフに出す選手（在籍中＋グラフ専用の絞り込み。ポジションの「内野手」は一塁〜遊撃） */
  compPeople: function () {
    var f = StaffBody.compF, inf = (window.StaffList && StaffList.INFIELD) || ['一塁手', '二塁手', '三塁手', '遊撃手'];
    return Staff.body.athletes.filter(function (a) {
      if (!a.active || StaffQA.isTest(a)) return false;   // v87：テスト用を除く
      if (f.grade && a.grade !== f.grade) return false;
      if (f.position && !(f.position === '内野手' ? inf.indexOf(a.position) >= 0 : a.position === f.position)) return false;
      return !f.team || a.team === f.team;
    });
  },
  /** v75：グラフ専用の絞り込みの選択肢（在籍中の選手から作る） */
  compFilterHtml: function () {
    var all = Staff.body.athletes.filter(function (a) { return a.active; }), f = StaffBody.compF;
    var vals = function (k) { return uniq(all.map(function (a) { return a[k] || ''; })).filter(String); };
    var grades = window.StaffList ? StaffList.gradeOrder(vals('grade')) : vals('grade').sort().reverse();
    var positions = window.StaffList ? StaffList.posOrder(vals('position')) : vals('position');
    var teams = vals('team').sort(function (a, b) { return a.localeCompare(b, 'ja'); });
    var sel = function (k, label, list, extra) {
      return '<select class="sel" data-sb="comp" data-k="' + k + '" aria-label="' + label + '"><option value="">' + label + '：すべて</option>' + (extra || '') +
        list.map(function (v) { return '<option value="' + esc(v) + '"' + (f[k] === v ? ' selected' : '') + '>' + esc(k === 'team' ? v + 'チーム' : v) + '</option>'; }).join('') + '</select>';
    };
    return '<div class="row tc-filter">' + sel('grade', '学年', grades) +
      sel('position', 'ポジション', positions, '<option value="内野手"' + (f.position === '内野手' ? ' selected' : '') + '>内野手（一塁〜遊撃）</option>') +
      sel('team', 'チーム', teams) + '</div>';
  },
  /** 今の年度（4月始まり） */
  fiscalYear: function () { var d = new Date(); return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; },
  /** 選手の入学年度（入学年度の列が空なら学年から逆算。わからなければ 0） */
  enrollOf: function (a) {
    if (Number(a.enrollYear)) return Number(a.enrollYear);
    var m = /([1-6])/.exec(String(a.grade || ''));
    return m ? StaffBody.fiscalYear() - Number(m[1]) + 1 : 0;
  },
  /** 学年カラー（入学年度から。わからなければ灰色） */
  gradeColor: function (a) {
    var y = StaffBody.enrollOf(a);
    if (!y) return { name: '灰', c: '#8A90A6' };
    return StaffBody.GRADE_COLORS[(((y - StaffBody.GRADE_COLOR_BASE) % 4) + 4) % 4];
  },
  /** 表示中の選手（学年・チームの絞り込み）の、いちばん新しい（date があればその日以前の）除脂肪体重とFFMI */
  teamCompPoints: function (people, date) {
    return people.map(function (a) {
      var list = (a.inbody || []).filter(function (r) { return Body.num(r.lbm) !== null && Body.num(r.ffmi) !== null && (!date || r.date <= date); });
      var r = list[list.length - 1];
      if (!r) return null;
      var y = StaffBody.enrollOf(a), g = y ? StaffBody.fiscalYear() - y + 1 : 0;
      return { id: a.id, name: a.name, grade: a.grade || (g >= 1 && g <= 4 ? g + '年' : y ? y + '年度入学' : ''), gnum: g, color: StaffBody.gradeColor(a).c,
               lbm: Body.num(r.lbm), ffmi: Body.num(r.ffmi), fat: Body.num(r.fat), date: r.date };
    }).filter(Boolean);
  },
  teamCompHtml: function (people, date) {
    var pts = StaffBody.teamCompPoints(people, date), c = Body.chart;
    var html = '<div class="card team-comp"><h2>体組成の比較（除脂肪体重×FFMI）</h2>' +
      StaffBody.compFilterHtml() +
      '<p class="muted small">' + esc([StaffBody.compF.grade || '全学年', StaffBody.compF.position, StaffBody.compF.team ? StaffBody.compF.team + 'チーム' : ''].filter(String).join('・')) + '・在籍中・' +
      (date ? date + '以前の' : '') + 'いちばん新しいInBodyの記録・' + pts.length + '人。測定日は下のランキングの選択と同じです。丸を押すと、その選手のフィジカルレポートを開きます。</p>';
    if (!pts.length) return html + '<p class="muted">表示できる記録がありません（除脂肪体重とFFMIの両方がある記録が必要です）。</p></div>';
    // 凡例（表示中の学年だけ。4年→1年）
    var seen = {};
    pts.slice().sort(function (a, b) { return b.gnum - a.gnum; }).forEach(function (p) { var k = p.grade || '学年不明'; if (!seen[k]) seen[k] = p.color; });
    html += '<div class="legends tc-legend">' + Object.keys(seen).map(function (k) { return '<span class="legend"><i style="background:' + seen[k] + '"></i>' + esc(k) + '</span>'; }).join('') + '</div>' +
      '<label class="check-line small"><input type="checkbox" data-sb="compNames"' + (StaffBody.compNames ? ' checked' : '') + '> 名前を表示</label>' +
      StaffBody.teamCompSvg(pts) + StaffBody.zoneCountHtml(pts) +
      (StaffBody.compHidden ? '<p class="muted small">名前が重なるため、' + StaffBody.compHidden + '人の名前は出していません（丸を押すか、下の「数値の一覧」で確かめられます）。</p>' : '') +
      '<p class="muted small">点線は今の基準線（除脂肪体重' + Number(c.lean).toFixed(1) + 'kg・FFMI' + Number(c.ffmi).toFixed(1) + '）の位置です（InBodyの下の「基準の設定」で変えられます）。</p>' +
      '<details class="tc-table"><summary>数値の一覧（' + pts.length + '人）</summary><div class="table-scroll"><table class="tbl"><tr><th>選手</th><th>学年</th><th>測定日</th><th>除脂肪体重(kg)</th><th>FFMI</th><th>体脂肪率(%)</th><th>区分</th></tr>' +
      pts.slice().sort(function (a, b) { return b.gnum - a.gnum || String(a.name).localeCompare(String(b.name), 'ja'); }).map(function (p) {
        return '<tr><td><i class="tc-dot" style="background:' + p.color + '"></i><button class="link" data-staff="openReport" data-v="' + esc(p.id) + '" data-tab="inbody">' + esc(p.name) + '</button></td><td>' + esc(p.grade || '-') + '</td>' +
          '<td class="small">' + esc(p.date) + '</td><td>' + p.lbm.toFixed(1) + '</td><td>' + p.ffmi.toFixed(1) + '</td><td>' + (p.fat === null ? '-' : p.fat.toFixed(1)) + '</td><td class="small">' + esc(Body.zoneName(Body.zoneOf(p.lbm, p.ffmi))) + '</td></tr>';
      }).join('') + '</table></div></details></div>';
    return html;
  },
  /** v76：フィジカルレポートの比較グラフ用（スタッフ画面）。その選手と同じ区分（投手／野手）の在籍中の選手の、最新の除脂肪体重・FFMI（名前は入れない） */
  peersOf: function (c) {
    if (!Staff.body || !c) return null;
    var groupOf = function (a) { return String(a.position || '').trim() === '投手' ? '投手' : '野手'; }, me = c.id;
    var group = groupOf(c), points = [];
    Staff.body.athletes.forEach(function (a) {
      if (groupOf(a) !== group || (!a.active && a.id !== me)) return;
      var list = (a.inbody || []).filter(function (r) { return Body.num(r.lbm) !== null && Body.num(r.ffmi) !== null; }), r = list[list.length - 1];
      if (!r) return;
      if (a.id !== me && !String(a.grade || '').trim() && !Number(a.enrollYear)) return;   // v82：学年も入学年度も無い人（テスト用）は入れない
      // v82：選手の画面（Apps Script の bodyPeers_）と同じく、ほかの選手の値は丸め（除脂肪体重 1kg・FFMI 0.2）、学年は持たない（PDFは選手に渡すことがあるため）
      points.push(a.id === me ? { lbm: Body.num(r.lbm), ffmi: Body.num(r.ffmi), me: true } : { lbm: Math.round(Body.num(r.lbm)), ffmi: Math.round(Body.num(r.ffmi) * 5) / 5, me: false });
    });
    var MIN = 5;   // 本人以外がこの人数より少ないときは、本人の点だけ
    if (points.filter(function (p) { return !p.me; }).length < MIN) return { group: group, points: points.filter(function (p) { return p.me; }), few: true, min: MIN, self: 'この選手' };
    return { group: group, points: points, self: 'この選手' };
  },
  /** v77：4つの区分ごとの人数（表示中の選手） */
  zoneCountHtml: function (pts) {
    var n = { best: 0, next: 0, short: 0, low: 0 };
    pts.forEach(function (p) { n[Body.zoneOf(p.lbm, p.ffmi)]++; });
    return '<div class="zone-counts">' + ['best', 'next', 'short', 'low'].map(function (k) {
      return '<span class="zone-count ' + Body.ZONES[k].cls + '">' + esc(Body.zoneName(k)) + '<b>' + n[k] + '人</b></span>'; }).join('') + '</div>';
  },
  /** 散布図（横＝除脂肪体重、縦＝FFMI。軸は基準線と全員が入るように広げる）。名前は重ならない位置を探して置く */
  teamCompSvg: function (pts) {
    var narrow = window.innerWidth < 600;   // スマホは図を小さく作って、文字が小さくなりすぎないようにする
    var W = narrow ? 380 : 720, H = narrow ? 420 : 480, L = 36, R = 12, T = 12, B = 38, c = Body.chart;
    var xMin = Math.min(50, Math.floor((c.lean - 15) / 5) * 5), xMax = Math.max(85, Math.ceil((c.lean + 15) / 5) * 5), yMin = Math.min(18, Math.floor(c.ffmi - 3)), yMax = Math.max(25, Math.ceil(c.ffmi + 3));
    pts.forEach(function (p) {
      xMin = Math.min(xMin, Math.floor((p.lbm - 3) / 5) * 5); xMax = Math.max(xMax, Math.ceil((p.lbm + 3) / 5) * 5);
      yMin = Math.min(yMin, Math.floor(p.ffmi - 1)); yMax = Math.max(yMax, Math.ceil(p.ffmi + 1));
    });
    var sx = function (v) { return L + (W - L - R) * (v - xMin) / (xMax - xMin); }, sy = function (v) { return T + (H - T - B) * (1 - (v - yMin) / (yMax - yMin)); };
    var svg = '<svg class="chart team-comp-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="除脂肪体重とFFMIの散布図">', v;
    var zone = Body.zoneSvg(sx, sy, xMin, xMax, yMin, yMax, L, T, W - R, H - B, true); svg += zone.svg;   // v77：4つの区分の色分け
    for (v = Math.ceil(xMin / 5) * 5; v <= xMax; v += 5) svg += '<line x1="' + sx(v) + '" x2="' + sx(v) + '" y1="' + T + '" y2="' + (H - B) + '" class="grid"/><text x="' + sx(v) + '" y="' + (H - B + 15) + '" class="axis" text-anchor="middle">' + v + '</text>';
    for (v = Math.ceil(yMin); v <= yMax; v += 1) svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + sy(v) + '" y2="' + sy(v) + '" class="grid"/><text x="' + (L - 6) + '" y="' + (sy(v) + 4) + '" class="axis" text-anchor="end">' + v + '</text>';
    svg += '<line x1="' + sx(c.lean) + '" x2="' + sx(c.lean) + '" y1="' + T + '" y2="' + (H - B) + '" class="center-line"/>' +
      '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + sy(c.ffmi) + '" y2="' + sy(c.ffmi) + '" class="center-line"/>' +
      '<text x="' + ((L + W - R) / 2) + '" y="' + (H - 6) + '" class="axis" text-anchor="middle">除脂肪体重(kg)</text>' +
      '<text x="12" y="' + ((T + H - B) / 2) + '" class="axis" text-anchor="middle" transform="rotate(-90 12 ' + ((T + H - B) / 2) + ')">FFMI</text>';
    // 丸（あとで名前を重ならないように置くため、丸の位置を先に覚える）
    var boxes = [], dots = pts.map(function (p) { return { p: p, x: sx(p.lbm), y: sy(p.ffmi) }; });
    dots.forEach(function (d) { boxes.push({ x1: d.x - 7, y1: d.y - 7, x2: d.x + 7, y2: d.y + 7 }); });
    boxes = boxes.concat(zone.boxes);   // v77：区分の言葉にも名前を重ねない
    svg += zone.text;
    var hit = function (b) { return boxes.some(function (o) { return b.x1 < o.x2 && o.x1 < b.x2 && b.y1 < o.y2 && o.y1 < b.y2; }); };
    var labels = '', lines = '';
    StaffBody.compHidden = 0;
    if (StaffBody.compNames) {
      // v76：名前どうし・丸と重ならない場所を、丸の近くから順に遠くへ探す（離れたときは細い線で丸とつなぐ）。どこにも置けない名前は出さない（重ねない）
      var textW = function (t) { return String(t).split('').reduce(function (w, ch) { return w + (/[\x00-\x7F]/.test(ch) ? 8 : 13); }, 0) + 6; };   // 少し広めに見積もる（字の形の差で重ならないように）
      dots.slice().sort(function (a, b) { return a.y - b.y; }).forEach(function (d) {
        var w = textW(d.p.name), h = 16, placed = false;
        var tries = [[9, -2, 'start'], [-9, -2, 'end'], [0, -12, 'middle'], [0, 18, 'middle'], [9, 10, 'start'], [-9, 10, 'end'], [9, -14, 'start'], [-9, -14, 'end']];
        for (var ring = 1; ring <= 7; ring++) for (var k = 0; k < 16; k++) {   // 2周目からは、丸のまわりの16方向を少しずつ遠くへ
          var ang = Math.PI * 2 * k / 16, dist = 14 + ring * 13;
          tries.push([Math.cos(ang) * dist, Math.sin(ang) * dist, Math.cos(ang) > 0.3 ? 'start' : Math.cos(ang) < -0.3 ? 'end' : 'middle', true]);
        }
        for (var i = 0; i < tries.length && !placed; i++) {
          var t = tries[i], tx = d.x + t[0], ty = d.y + t[1] + 4;
          var x1 = t[2] === 'start' ? tx - 2 : t[2] === 'end' ? tx - w + 2 : tx - w / 2, b = { x1: x1, y1: ty - h + 4, x2: x1 + w, y2: ty + 4 };
          if (b.x1 < L || b.x2 > W - R + 10 || b.y1 < 0 || b.y2 > H - B + 2 || hit(b)) continue;
          boxes.push(b); placed = true;
          if (t[3]) {   // 離れた名前は、名前の箱のいちばん近い点と丸を線でつなぐ
            var lx = Math.max(b.x1, Math.min(d.x, b.x2)), ly = Math.max(b.y1, Math.min(d.y, b.y2));
            lines += '<line x1="' + d.x.toFixed(1) + '" y1="' + d.y.toFixed(1) + '" x2="' + lx.toFixed(1) + '" y2="' + ly.toFixed(1) + '" class="tc-leader"/>';
          }
          labels += '<text x="' + tx.toFixed(1) + '" y="' + ty.toFixed(1) + '" class="tc-label" text-anchor="' + t[2] + '">' + esc(d.p.name) + '</text>';
        }
        if (!placed) StaffBody.compHidden++;
      });
    }
    svg += lines;
    dots.forEach(function (d) {
      var p = d.p;
      svg += '<circle cx="' + d.x.toFixed(1) + '" cy="' + d.y.toFixed(1) + '" r="6.5" fill="' + p.color + '" class="tc-dot-svg" data-staff="openReport" data-v="' + esc(p.id) + '" data-tab="inbody"><title>' +
        esc(p.name + '（' + (p.grade || '-') + '）' + p.date + '　除脂肪体重' + p.lbm.toFixed(1) + 'kg・FFMI' + p.ffmi.toFixed(1) + (p.fat !== null ? '・体脂肪率' + p.fat.toFixed(1) + '%' : '')) + '</title></circle>';
    });
    return svg + labels + '</svg>';
  },

  // ---------------- 体重タブ ----------------
  /** 指定した測定日の体重一覧（日付を空にすると各選手の最新） */
  weightRows: function () {
    var date = StaffBody.weightDate;
    return StaffBody.people().map(function (a) {
      var w = a.weight, cur = null, idx = -1;
      for (var i = w.length - 1; i >= 0; i--) { if (!date ? true : w[i].date === date) { cur = w[i]; idx = i; break; } }
      var prev = idx > 0 ? w[idx - 1] : null;
      var st = cur ? Body.weightStats(w.slice(0, idx + 1)) : null;
      var r1 = function (v) { return Math.round(v * 10) / 10; };
      return { id: a.id, name: a.name, grade: a.grade, team: a.team, date: cur ? cur.date : '', weight: cur ? cur.weight : null,
               prevDate: prev ? prev.date : '', diff: cur && prev ? r1(cur.weight - prev.weight) : '',
               diff4w: cur && st && st.w4 ? r1(cur.weight - st.w4.weight) : '' };
    });
  },

  weightView: function () {
    // 測定日の一覧は、チームで測った日（体重管理表・InBody）だけ。選手本人が毎日入れた体重の日は出さない（v46）
    var dates = uniq([].concat.apply([], Staff.body.athletes.map(function (a) { return a.weight.filter(function (r) { return r.src !== '本人'; }).map(function (r) { return r.date; }); }))).sort().reverse();
    if (StaffBody.weightDate === null || (StaffBody.weightDate && dates.indexOf(StaffBody.weightDate) < 0)) StaffBody.weightDate = '';
    if (!StaffBody.weightDateSet && dates.length) { StaffBody.weightDate = dates[0]; StaffBody.weightDateSet = true; }   // 最初は最新の測定日
    var rows = StaffBody.weightRows(), sort = StaffBody.weightSort;
    if (sort === 'heavy') rows.sort(function (a, b) { return (b.weight || 0) - (a.weight || 0); });
    else if (sort === 'up') rows.sort(function (a, b) { return (b.diff === '' ? -99 : b.diff) - (a.diff === '' ? -99 : a.diff); });
    else if (sort === 'down') rows.sort(function (a, b) { return (a.diff === '' ? 99 : a.diff) - (b.diff === '' ? 99 : b.diff); });
    else rows.sort(function (a, b) { return (a.weight === null ? 0 : 1) - (b.weight === null ? 0 : 1) || String(a.grade).localeCompare(b.grade, 'ja') || String(a.name).localeCompare(b.name, 'ja'); });
    StaffBody.weightList = rows;
    var missing = rows.filter(function (r) { return r.weight === null; }).length;
    var html = '<div class="card"><h2>体重一覧</h2><div class="row">' +
      '<select class="sel" data-sb="weightDate"><option value="">各選手の最新の記録</option>' + dates.map(function (d) { return '<option' + (d === StaffBody.weightDate ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select>' +
      '<select class="sel" data-sb="weightSort">' + [['roster', '未測定→学年・名前順'], ['heavy', '体重の重い順'], ['up', '前回より増えた順'], ['down', '前回より減った順']]
        .map(function (o) { return '<option value="' + o[0] + '"' + (sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      Staff.select('grade', '学年', uniq(Staff.body.athletes.map(function (a) { return a.grade; }))) + '</div>' +
      '<p class="small">表示 ' + rows.length + '人' + (StaffBody.weightDate ? ' ／ <b class="ng-text">未測定 ' + missing + '人</b>' : '') + '</p>' +
      '<div class="row"><button class="btn sub" data-sb="xWeightPdf">' + Icon('file', 18) + '一覧をPDF</button><button class="btn sub" data-sb="xWeightXlsx">' + Icon('sheet', 18) + '一覧をExcel</button>' +
      '<button class="btn sub" data-sb="xWeightAllXlsx">' + Icon('sheet', 18) + '全員の体重の全履歴をExcel</button></div>' +
      '<div class="row"><button class="btn sub" data-sb="xWeightReportsPdf">' + Icon('file', 18) + '学年の体重レポートをまとめてPDF保存</button></div></div>';
    html += '<div class="card"><div class="table-scroll"><table class="tbl"><tr><th>選手</th><th>学年</th><th>体重</th><th>前回比</th><th>4週前比</th><th>測定日</th></tr>' +
      rows.map(function (r) {
        var fmt = function (d) { return d === '' ? '-' : (d > 0 ? '▲' : d < 0 ? '▼' : '±') + Math.abs(d); };
        return '<tr class="' + (r.weight === null ? 'row-ng' : '') + '"><td><button class="link" data-staff="openReport" data-v="' + esc(r.id) + '" data-tab="weight">' + esc(r.name) + '</button></td><td>' + esc(r.grade) +
          '</td><td><b>' + (r.weight === null ? '未測定' : esc(r.weight)) + '</b></td><td>' + fmt(r.diff) + '</td><td>' + fmt(r.diff4w) + '</td><td class="small">' + esc(r.date || '-') + '</td></tr>';
      }).join('') + '</table></div>' + (dates.length ? '' : '<p class="muted">体重の記録がありません。「取り込む」から体重管理表を取り込んでください。</p>') + '</div>';
    return html;
  }
};

// 操作の振り分け（InBody・体重タブ）
app.addEventListener('click', function (e) {
  var t = e.target.closest('[data-sb]');
  if (!t || S.view !== 'staff' || t.tagName === 'SELECT' || t.tagName === 'INPUT') return;
  var people = Staff.body ? StaffBody.people() : [], label = Staff.filter.grade || '全学年';
  switch (t.dataset.sb) {
    case 'doImport': StaffBody.doImport(); break;
    case 'xRankPdf': Export.rankingPdf(StaffBody.rankTitle, StaffBody.rankSub, StaffBody.rankRows); break;
    case 'xRankXlsx': Export.rankingExcel(StaffBody.rankTitle, StaffBody.rankRows); break;
    case 'xPosterWeight': Export.ffmiPoster('weight'); break;   // v83
    case 'xPosterDining': Export.ffmiPoster('dining'); break;
    case 'xReportsPdf': Export.bulkDialog('inbody'); break;
    case 'xLatestXlsx': Export.excel('inbody_latest_' + Export.today() + '.xlsx', [{ name: 'InBody最新値', rows: Export.inbodyLatestRows(people) }]); break;
    case 'xWeightPdf': Export.weightTablePdf(StaffBody.weightDate, label + '・' + StaffBody.weightList.length + '人', StaffBody.weightList); break;
    case 'xWeightXlsx': Export.weightTableExcel(StaffBody.weightDate, StaffBody.weightList); break;
    case 'xWeightAllXlsx': Export.weightPivotExcel(people); break;
    case 'xWeightReportsPdf': Export.bulkDialog('weight'); break;
  }
});
app.addEventListener('change', function (e) {
  var t = e.target;
  if (S.view !== 'staff' || !t.dataset.sb) return;
  if (t.dataset.sb === 'file') return StaffBody.onFile(t);
  if (t.dataset.sb === 'importDate') StaffBody.importDate = t.value;
  if (t.dataset.sb === 'metric') StaffBody.metric = t.value;
  if (t.dataset.sb === 'rankDate') StaffBody.rankDate = t.value;
  if (t.dataset.sb === 'weightDate') StaffBody.weightDate = t.value;
  if (t.dataset.sb === 'weightSort') StaffBody.weightSort = t.value;
  if (t.dataset.sb === 'compNames') StaffBody.compNames = t.checked;   // v74：体組成の比較の名前
  if (t.dataset.sb === 'comp') StaffBody.compF[t.dataset.k] = t.value;   // v75：体組成の比較の絞り込み
  StaffBody.render(StaffBody.kind);
});
