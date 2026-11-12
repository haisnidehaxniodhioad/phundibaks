/**
 * export.js ― スタッフ画面の「PDFで保存」「Excelで保存」（Phase 3b、3cでInBodyと体重を分けた、3dでレポートを既存アプリの形に）
 *
 * PDF  : ブラウザの印刷機能を使う。印刷画面で「PDFとして保存」（iPhoneは共有→「プリント」→ピンチアウトでPDF）を選ぶ。
 *        印刷用の内容だけを #printArea に入れ、それ以外を隠してから印刷する（A4縦）。
 * Excel: SheetJS（取り込みと同じ無料ライブラリ）で .xlsx ファイルを作ってダウンロードする。
 *        ファイル名は端末によって日本語が使えないことがあるため、英数字にしている（例: ranking_2026-10-28.xlsx）。
 */
var Export = {
  // v81：学年がわからない選手（学年も入学年度も空＝テスト用のアカウント）は、PDF・Excel（アウトプット用資料）に入れない
  isTest: function (a) {
    if (!a || String(a.grade || '').trim()) return false;
    var full = a.enrollYear === undefined && window.Staff && Staff.body ? Staff.body.athletes.filter(function (x) { return x.id === a.id; })[0] : a;   // 表の行に入学年度が無いときは選手のデータで確かめる
    return !Number(full && full.enrollYear);
  },
  real: function (list) { return (list || []).filter(function (a) { return !Export.isTest(a); }); },
  /** 見出しの「○人」を、テスト用を除いた人数に直す */
  fixCount: function (sub, n) { return String(sub || '').replace(/\d+人$/, n + '人'); },
  today: function () { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); },

  /** Excelファイルを作って保存する。sheets = [{ name: 'シート名', rows: [[見出し...], [値...], ...] }] */
  excel: function (fileName, sheets) {
    return Importer.loadLib().then(function () {
      var wb = XLSX.utils.book_new();
      sheets.forEach(function (s) {
        var ws = XLSX.utils.aoa_to_sheet(s.rows);
        // 列の幅を内容に合わせて少し広げる
        ws['!cols'] = (s.rows[0] || []).map(function (_, c) {
          var w = 6;
          s.rows.forEach(function (r) { w = Math.max(w, String(r[c] == null ? '' : r[c]).length * 1.8); });
          return { wch: Math.min(40, w) };
        });
        XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
      });
      // ファイル名を確実に付けるため、自分でダウンロード用のリンクを作る
      var data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      var blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = fileName; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 2000);
    }).catch(function (err) { alert('Excelを作れませんでした：' + err.message); });
  },

  /** v88：パルスの測定のまとめをExcelに（「パルス」シート。測定1回＝1行。テスト用の選手は入れない） */
  pulseExcel: function (data, athletes) {
    if (!data) return;
    var by = {};
    (athletes || []).forEach(function (a) { by[a.id] = a; });
    var v = function (x) { return x === '' || x === null || x === undefined ? '' : x; };
    var rows = [['選手', '学年', 'ポジション', '測定日', '球数', 'エルボートルク平均(Nm)', 'エルボートルク最大(Nm)', 'アームスロット平均(°)',
                 'アームスピード平均(rpm)', 'アームスピード最大(rpm)', '球速平均(km/h)', '球速最大(km/h)', 'トルク「高い」の割合(%)', 'メモ']];
    (data.sessions || []).filter(function (s) { return by[s.athleteId]; }).slice().sort(function (x, y) {
      var a = by[x.athleteId], b = by[y.athleteId];
      return String(a.kana || a.name).localeCompare(String(b.kana || b.name), 'ja') || (x.date < y.date ? -1 : 1);
    }).forEach(function (s) {
      var a = by[s.athleteId];
      rows.push([a.name, a.grade, a.position, s.date, s.n, v(s.avg.torque), v(s.max.torque), v(s.avg.slot), v(s.avg.speed), v(s.max.speed), v(s.avg.velo), v(s.max.velo), v(s.ratio.torqueUp), s.memo]);
    });
    Export.excel('pulse_' + Export.today() + '.xlsx', [{ name: 'パルス', rows: rows }]);
  },

  /** 印刷（PDF保存）する。pagesHtml は1ページ分ずつのHTMLの配列 */
  print: function (title, pagesHtml, opt) {
    opt = opt || {};   // v83：opt.poster＝A3横の掲示物（ページの大きさを変え、A4用の縮める処理はしない）
    Body.closeHistory();
    // PDFはいつも昼の色（白い紙）で作る。夜の色にしていても、印刷の間だけ昼にして、終わったら戻す（v30）
    var root = document.documentElement, oldTheme = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'light');
    var area = document.getElementById('printArea');
    if (!area) { area = document.createElement('div'); area.id = 'printArea'; document.body.appendChild(area); }
    area.innerHTML = pagesHtml.map(function (h) { return '<section class="print-page">' + h + '</section>'; }).join('');
    var pageStyle = null;
    if (opt.poster) {
      area.classList.add('poster');
      pageStyle = document.createElement('style');
      pageStyle.textContent = '@page { size: A3 landscape; margin: 10mm; }';   // A4縦の指定より後に置いて、こちらを使わせる
      document.head.appendChild(pageStyle);
    }
    // A4の1枚（余白を除いた高さ 約1030px）に収まらないページは、グラフを一段小さくする（既存アプリと同じ）
    area.style.cssText = 'display:block;position:absolute;left:-10000px;top:0;width:700px;';
    if (!opt.poster) Array.prototype.forEach.call(area.children, function (sec) {
      if (sec.offsetHeight > 1030) sec.classList.add('compact');
      if (sec.offsetHeight > 1030) sec.classList.add('tight');   // v80：まだ入らないときは、もう一段小さく
    });
    area.style.cssText = '';
    var oldTitle = document.title;
    document.title = title;   // PDFのファイル名の候補になる
    document.body.classList.add('printing');
    var done = function () {
      document.body.classList.remove('printing'); area.innerHTML = ''; document.title = oldTitle;
      area.classList.remove('poster'); if (pageStyle && pageStyle.parentNode) pageStyle.parentNode.removeChild(pageStyle);
      if (oldTheme) root.setAttribute('data-theme', oldTheme); else root.removeAttribute('data-theme');
    };
    window.addEventListener('afterprint', function once() { window.removeEventListener('afterprint', once); done(); });
    setTimeout(function () { window.print(); }, 300);   // 描画が終わるのを少し待つ
  },

  /** 印刷用の見出し */
  head: function (title, sub) {
    return '<div class="print-head"><div><div class="print-title">' + esc(title) + '</div>' +
      (sub ? '<div class="print-sub">' + esc(sub) + '</div>' : '') + '</div><div class="print-date">作成日 ' + Export.today() + '</div></div>';
  },

  // ---------------- 体組成レポート（フィジカルレポート と 体重レポート は別々） ----------------
  /** 1人分のレポートのページ（見出し・作成日などはレポートの中に入っている）。kind: 'inbody' または 'weight' */
  reportPage: function (a, kind) {
    if (kind !== 'weight' && window.StaffBody && S.view === 'staff' && Staff.body) {   // v79：投手／野手の中での位置（名前なし）をPDFにも
      a.peers = StaffBody.peersOf(a);
      // v81 の学年不明（テスト用）の除外は、v82 から StaffBody.peersOf の中で行う
    }
    return kind === 'weight' ? Body.weightReportHtml(a, { print: true }) : Body.physicalHtml(a, { print: true });
  },

  fileTitle: function (kind) { return kind === 'weight' ? '体重レポート_' : 'フィジカルレポート_'; },

  reportPdf: function (a, kind) {
    Export.print(Export.fileTitle(kind) + a.name + '_' + Export.today(), [Export.reportPage(a, kind)]);
  },

  /** 複数人のレポートを1人1ページでPDFに（記録がある選手だけ。並び順は渡された順） */
  reportsPdf: function (list, label, kind) {
    var withData = Export.real(list).filter(function (a) { return kind === 'weight' ? a.weight.length : a.inbody.length; });
    if (!withData.length) { alert('記録がある選手がいません。'); return; }
    Export.print(Export.fileTitle(kind) + label + '_' + Export.today(), withData.map(function (a) { return Export.reportPage(a, kind); }));
  },

  /**
   * 「学年のレポートをまとめてPDF保存」の画面（既存アプリと同じ）。学年を選ぶと、1人1ページで
   * 学年の順 → 同じ学年の中は選手マスタの行の順 に並べてPDFにする。記録がない選手は含めない。
   */
  bulkDialog: function (kind) {
    var all = Staff.body.athletes.filter(function (a) { return a.active && String(a.grade) !== ''; });
    var has = function (a) { return kind === 'weight' ? a.weight.length : a.inbody.length; };
    var grades = uniq(all.map(function (a) { return String(a.grade); })).sort(function (x, y) { return x.localeCompare(y, 'ja', { numeric: true }); });
    var name = kind === 'weight' ? '体重レポート' : 'フィジカルレポート';
    var body = !grades.length ? '<p class="muted">学年が入っている選手がいません（選手マスタの「学年」を入れてください）。</p>' :
      '<p class="muted small">PDFにまとめる学年を選んでください（複数可）。1人を1ページ（A4）にして、学年の順・同じ学年の中は選手マスタの順に並べます。' +
      (kind === 'weight' ? '体重' : 'InBody') + 'の記録がまだない選手は含まれません。</p>' +
      grades.map(function (g) {
        var list = all.filter(function (a) { return String(a.grade) === g; }), n = list.filter(has).length;
        return '<label class="check-line"><input type="checkbox" class="bulk-grade" value="' + esc(g) + '"' + (n ? '' : ' disabled') + '> ' + esc(g) + '（' + n + '名 / 全' + list.length + '名）</label>';
      }).join('') +
      '<p class="ng-text small" id="bulkMsg"></p><div class="row"><button class="btn" id="bulkGo">PDFにまとめる</button><button class="btn sub" id="bulkCancel">キャンセル</button></div>' +
      '<p class="muted small">印刷画面が開くので「PDFとして保存」を選んでください。人数が多いと準備に少し時間がかかります。</p>';
    var ov = Body.modal('学年の' + name + 'をまとめてPDF保存', '', body);
    var go = ov.querySelector('#bulkGo');
    if (!go) return;
    ov.querySelector('#bulkCancel').onclick = Body.closeHistory;
    go.onclick = function () {
      var sel = Array.prototype.filter.call(ov.querySelectorAll('.bulk-grade'), function (c) { return c.checked; }).map(function (c) { return c.value; });
      if (!sel.length) { ov.querySelector('#bulkMsg').textContent = '学年を1つ以上選んでください。'; return; }
      var list = [];
      sel.sort(function (x, y) { return grades.indexOf(x) - grades.indexOf(y); }).forEach(function (g) {
        all.forEach(function (a) { if (String(a.grade) === g && has(a)) list.push(a); });   // all は選手マスタの行の順
      });
      Body.closeHistory();
      Export.reportsPdf(list, sel.join('-'), kind);
    };
  },

  /** 1人分の測定データをExcelに（InBodyと体重の2シート） */
  reportExcel: function (a) {
    Export.excel('body_' + a.id + '_' + Export.today() + '.xlsx', [
      { name: 'InBody', rows: [['測定日', '身長', '体重', '体脂肪率', '除脂肪体重', 'FFMI', 'FFMI同日順位', '測定人数']]
          .concat(a.inbody.map(function (r) { return [r.date, r.height, r.weight, r.fat, r.lbm, r.ffmi, r.rank || '', r.rankOf || '']; })) },
      { name: '体重', rows: [['測定日', '体重', '種類']].concat(a.weight.map(function (r) { return [r.date, r.weight, r.src]; })) }
    ]);
  },

  /** InBodyの最新値と前回比の一覧 */
  inbodyLatestRows: function (list) {
    list = Export.real(list);   // v81
    var rows = [['選手ID', '名前', '学年', 'チーム', '測定日', '身長', '体重', '体脂肪率', '除脂肪体重', 'FFMI', '前回比 体重', '前回比 体脂肪率', '前回比 除脂肪体重', '前回比 FFMI']];
    list.forEach(function (a) {
      var ib = a.inbody[a.inbody.length - 1], prev = a.inbody[a.inbody.length - 2] || {};
      if (!ib) return;
      var d = function (k) { return ib[k] !== '' && prev[k] !== undefined && prev[k] !== '' ? Math.round((ib[k] - prev[k]) * 10) / 10 : ''; };
      rows.push([a.id, a.name, a.grade, a.team, ib.date, ib.height, ib.weight, ib.fat, ib.lbm, ib.ffmi, d('weight'), d('fat'), d('lbm'), d('ffmi')]);
    });
    return rows;
  },

  // ---------------- 体重 ----------------
  /** 体重タブの表（指定日の体重・前回比・4週前比）をExcelに */
  weightTableExcel: function (date, rows) {
    rows = Export.real(rows);   // v81
    Export.excel('weight_' + (date || 'latest') + '.xlsx', [
      { name: '体重', rows: [['選手ID', '名前', '学年', 'チーム', '測定日', '体重', '前回の測定日', '前回比', '4週前比', '状態']]
          .concat(rows.map(function (r) { return [r.id, r.name, r.grade, r.team, r.date || '', r.weight === null ? '' : r.weight, r.prevDate || '', r.diff, r.diff4w, r.weight === null ? '未測定' : '']; })) }
    ]);
  },

  weightTablePdf: function (date, sub, rows) {
    rows = Export.real(rows); sub = Export.fixCount(sub, rows.length);   // v81
    var html = Export.head('体重一覧　' + (date || '最新'), sub) +
      '<table class="tbl print-tbl"><tr><th>名前</th><th>学年</th><th>体重</th><th>前回比</th><th>4週前比</th><th>測定日</th></tr>' +
      rows.map(function (r) {
        return '<tr class="' + (r.weight === null ? 'row-ng' : '') + '"><td>' + esc(r.name) + '</td><td>' + esc(r.grade) + '</td><td><b>' + (r.weight === null ? '未測定' : esc(r.weight)) +
          '</b></td><td>' + esc(r.diff === '' ? '-' : r.diff) + '</td><td>' + esc(r.diff4w === '' ? '-' : r.diff4w) + '</td><td>' + esc(r.date || '-') + '</td></tr>';
      }).join('') + '</table>';
    Export.print('体重一覧_' + (date || '最新'), [html]);
  },

  /** 体重の全履歴を「選手×測定日」の表（体重管理表と同じ形）でExcelに */
  weightPivotExcel: function (list) {
    list = Export.real(list);   // v81
    var dates = [];
    list.forEach(function (a) { a.weight.forEach(function (r) { if (dates.indexOf(r.date) < 0) dates.push(r.date); }); });
    dates.sort();
    var rows = [['選手ID', '名前', '学年'].concat(dates)];
    list.forEach(function (a) {
      var m = {};
      a.weight.forEach(function (r) { m[r.date] = r.weight; });
      rows.push([a.id, a.name, a.grade].concat(dates.map(function (d) { return m[d] === undefined ? '' : m[d]; })));
    });
    Export.excel('weight_all_' + Export.today() + '.xlsx', [{ name: '体重の履歴', rows: rows }]);
  },

  // ---------------- ランキング ----------------
  /** v81：テスト用を除いて順位をつけ直す（同じ値は同じ順位） */
  rerank: function (rows) {
    var r = Export.real(rows);
    return r.map(function (x, i) { return Object.assign({}, x, { rank: i > 0 && r[i - 1].value === x.value ? '' : i + 1 }); });
  },
  /** ランキング（画面に表示中のもの）をExcelに */
  rankingExcel: function (title, rows) {
    rows = Export.rerank(rows);   // v81
    Export.excel('ranking_' + Export.today() + '.xlsx', [
      { name: 'ランキング', rows: [['順位', '選手ID', '名前', '学年', '値', '測定日']]
          .concat(rows.map(function (r) { return [r.rank, r.id, r.name, r.grade, r.value, r.date]; })) }
    ]);
  },

  /** ランキングをPDFに（1ページに収まらなければ自動で次のページへ） */
  rankingPdf: function (title, sub, rows) {
    rows = Export.rerank(rows); sub = Export.fixCount(sub, rows.length);   // v81
    var html = Export.head('ランキング　' + title, sub) +
      '<table class="tbl print-tbl"><tr><th>順位</th><th>名前</th><th>学年</th><th>値</th><th>測定日</th></tr>' +
      rows.map(function (r) { return '<tr><td>' + esc(r.rank) + '</td><td>' + esc(r.name) + '</td><td>' + esc(r.grade) + '</td><td><b>' + esc(r.value) + '</b></td><td>' + esc(r.date) + '</td></tr>'; }).join('') +
      '</table>';
    Export.print('ランキング_' + title + '_' + Export.today(), [html]);
  },

  // ---------------- v83：FFMIランキングの掲示物（A3横） ----------------
  //   kind: 'weight'＝ウェイトルーム用（ランキングだけ）、'dining'＝食堂用（左にFFMIの説明）
  //   全員（在籍中・テスト用を除く）を1つのランキングに。いちばん新しいInBody（データ分析で測定日を選んでいれば、その日以前）を使う
  //   人数に合わせて列の数と行の高さを決め、A3の1枚に収める。食堂用で入りきらないときは、除脂肪体重と前回比の列を省く
  posterRows: function () {
    var date = StaffBody.rankDate, has = function (r) { return Body.num(r.ffmi) !== null && (!date || r.date <= date); };
    var rows = Export.real(Staff.body.athletes.filter(function (a) { return a.active; })).map(function (a) {
      var list = (a.inbody || []).filter(has), r = list[list.length - 1], p = list[list.length - 2];
      return r ? { name: a.name, ffmi: Body.num(r.ffmi), lbm: Body.num(r.lbm), date: r.date, diff: p ? Body.num(r.ffmi) - Body.num(p.ffmi) : null } : null;
    }).filter(Boolean).sort(function (x, y) { return y.ffmi - x.ffmi || String(x.name).localeCompare(String(y.name), 'ja'); });
    rows.forEach(function (r, i) { r.rank = i > 0 && rows[i - 1].ffmi === r.ffmi ? rows[i - 1].rank : i + 1; });   // 同じ値は同じ順位
    return rows;
  },
  ffmiPoster: function (kind) {
    var rows = Export.posterRows();
    if (!rows.length) { alert('FFMIの記録がある選手がいません。'); return; }
    var dining = kind === 'dining', top = Body.chart.ffmi, avg = Body.FFMI_AVG, f0 = Body.f0;
    var listW = dining ? 1080 : 1490, H = 900;   // ランキングの場所の幅と高さ（px）
    // 列の数：1列30人までを目安に、1列の幅が360px以上（全部の項目が入る）の範囲で増やす。それでも1行が22pxより低くなるときは、さらに列を増やす（項目は減る）
    var cols = Math.max(1, Math.min(Math.ceil(rows.length / 30), Math.floor(listW / 360)));
    while (Math.ceil(rows.length / cols) * 22 > H && cols < 6) cols++;
    var size = function (c) { var per = Math.ceil(rows.length / c), rowH = Math.min(44, Math.floor(H / (per + 1))); return { per: per, rowH: rowH, fs: Math.max(11, Math.min(24, Math.round(rowH * 0.56))) }; };
    var z = size(cols);
    // 文字が小さくなる（16px未満）ときは、除脂肪体重と前回比をやめて列を1つ増やし、文字を大きくする（食堂用で人数が多いとき）
    if (z.fs < 16 && listW / (cols + 1) >= 220) { cols++; z = size(cols); }
    var full = listW / cols >= 360;   // 1列の幅が足りるときだけ、除脂肪体重と前回比も出す
    var per = z.per, rowH = z.rowH, fs = z.fs;
    // v84：名前はフルネームを1行で出す（省略しない）。いちばん長い名前が1列に入るように、文字の大きさを決める
    //   1列の幅 ≒ 文字の大きさ ×（順位 2.4 ＋ 名前 ＋ FFMI 2.4 ［＋ 除脂肪体重 4 ＋ 前回比 2.6］）＋ すき間（1マス12px）
    var nameEm = rows.reduce(function (m, r) { return Math.max(m, String(r.name).split('').reduce(function (w, ch) { return w + (/[\x00-\x7F]/.test(ch) ? 0.6 : 1); }, 0)); }, 4);
    var colW = (listW - 22 * (cols - 1)) / cols, pad = (full ? 5 : 3) * 12 + 8;
    fs = Math.max(10, Math.min(fs, Math.floor((colW - pad) / (2.4 + nameEm + 2.4 + (full ? 6.6 : 0)))));
    var latest = rows.reduce(function (m, r) { return r.date > m ? r.date : m; }, '');
    var diff = function (d) { return d === null ? '-' : d > 0.05 ? '▲' + d.toFixed(1) : d < -0.05 ? '▼' + Math.abs(d).toFixed(1) : '±0.0'; };
    var table = function (part) {
      return '<table class="pst-tbl"><tr><th>順位</th><th class="pst-name">名前</th><th>FFMI</th>' + (full ? '<th>除脂肪体重</th><th>前回比</th>' : '') + '</tr>' +
        part.map(function (r) {
          var star = r.ffmi >= top;
          return '<tr class="' + (star ? 'pst-star' : '') + '"><td>' + (star ? '★' : '') + r.rank + '</td><td class="pst-name">' + esc(r.name) + '</td><td class="pst-ffmi">' + r.ffmi.toFixed(1) + '</td>' +
            (full ? '<td>' + (r.lbm === null ? '-' : r.lbm.toFixed(1) + 'kg') + '</td><td>' + diff(r.diff) + '</td>' : '') + '</tr>';
        }).join('') + '</table>';
    };
    var parts = []; for (var i = 0; i < rows.length; i += per) parts.push(rows.slice(i, i + per));
    var nTop = rows.filter(function (r) { return r.ffmi >= top; }).length;
    var head = '<div class="pst-head"><div class="pst-title">FFMI ランキング</div><div class="pst-sub">' + esc(Body.dLong(latest)) + 'までの測定（各選手のいちばん新しい記録）・' + rows.length + '人　' +
      '<b>★ FFMI' + f0(top) + '以上：' + nTop + '人</b></div></div>';
    var explain = !dining ? '' : '<div class="pst-explain">' +
      '<div class="pst-ex-h">FFMIとは？</div><div class="pst-formula">FFMI ＝ 除脂肪体重(kg) ÷ 身長(m)²</div>' +
      '<p>身長の違いをならした「筋肉の量」の数字。体の大きさがちがっても比べられます。</p>' +
      '<div class="pst-ex-h">目安</div><table class="pst-band"><tr><td class="b1">' + f0(avg) + '未満</td><td>まずは' + f0(avg) + 'を超えよう</td></tr>' +
      '<tr><td class="b2">' + f0(avg) + '〜' + f0(top) + '</td><td>大学野球の平均以上</td></tr><tr><td class="b3">' + f0(top) + '以上</td><td>トップ層 ★</td></tr></table>' +
      '<div class="pst-ex-h">目標</div><p class="pst-goal">まずは<b>除脂肪体重' + f0(Body.chart.lean) + 'kg</b>、そして<b>FFMI ' + f0(top) + '</b></p>' +
      '<p class="pst-small">身長が低くて' + f0(Body.chart.lean) + 'kgが難しい人は、まずFFMI ' + f0(top) + 'を目指そう。</p></div>';
    var html = '<div class="pst ' + (dining ? 'pst-dining' : 'pst-weight') + '" style="--pst-row:' + rowH + 'px;--pst-fs:' + fs + 'px;">' + head +
      '<div class="pst-body">' + explain + '<div class="pst-cols" style="grid-template-columns:repeat(' + cols + ', minmax(0, 1fr));">' + parts.map(table).join('') + '</div></div></div>';
    Export.print('FFMIランキング_' + (dining ? '食堂用' : 'ウェイトルーム用') + '_' + Export.today(), [html], { poster: true });
  },

  // ---------------- 実施状況 ----------------
  overviewExcel: function (o, list) {
    list = Export.real(list);   // v81
    Export.excel('weekly_' + o.weekStart + '.xlsx', [
      { name: '実施状況', rows: [['選手ID', '名前', '学年', 'チーム', '実施Day数', '全Day数', '回数', 'うち自分のメニュー', '上半身セット', '下半身セット', '全身セット', 'その他セット', '全身疲労', '上半身疲労', '下半身疲労', 'パフォーマンス', 'コンディションの日付', 'コメント', 'コンディション入力日数', '時間(分)', 'メニュー外の種目数', '最終実施日']]
          .concat(list.map(function (a) {
            return [a.id, a.name, a.grade, a.team, a.daysDone, a.menuDays, a.sessions, a.freeSessions, a.sets['上半身'], a.sets['下半身'], a.sets['全身'], a.sets['その他'],
              a.cond ? a.cond.whole : '', a.cond ? a.cond.upper : '', a.cond ? a.cond.lower : '', a.cond ? a.cond.perf : '', a.cond ? a.cond.date : '', a.cond ? a.cond.comment : '', a.condCount || 0, a.minutes, a.offMenu, a.lastDate];
          })) }
    ]);
  },

  overviewPdf: function (o, list) {
    list = Export.real(list);   // v81
    var html = Export.head('実施状況　' + o.weekStart + '〜' + o.weekEnd, '表示 ' + list.length + '人') +
      '<table class="tbl print-tbl"><tr><th>名前</th><th>学年</th><th>Day</th><th>回数</th><th>上/下/全</th><th>疲労 全/上/下</th><th>動き</th><th>最終</th></tr>' +
      list.map(function (a) {
        return '<tr class="' + (a.sessions ? '' : 'row-ng') + '"><td>' + esc(a.name) + '</td><td>' + esc(a.grade) + '</td><td>' + (a.menuDays ? a.daysDone + '/' + a.menuDays : '-') +
          '</td><td>' + a.sessions + '</td><td>' + a.sets['上半身'] + '/' + a.sets['下半身'] + '/' + a.sets['全身'] + '</td><td>' + (a.cond ? a.cond.whole + '/' + a.cond.upper + '/' + a.cond.lower : '-') +
          '</td><td>' + (a.cond ? a.cond.perf : '-') + '</td><td>' + esc(a.lastDate || '-') + '</td></tr>';
      }).join('') + '</table>';
    Export.print('実施状況_' + o.weekStart, [html]);
  }
};
