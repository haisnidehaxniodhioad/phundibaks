/**
 * export.js ― スタッフ画面の「PDFで保存」「Excelで保存」（Phase 3b、3cでInBodyと体重を分けた、3dでレポートを既存アプリの形に）
 *
 * PDF  : ブラウザの印刷機能を使う。印刷画面で「PDFとして保存」（iPhoneは共有→「プリント」→ピンチアウトでPDF）を選ぶ。
 *        印刷用の内容だけを #printArea に入れ、それ以外を隠してから印刷する（A4縦）。
 * Excel: SheetJS（取り込みと同じ無料ライブラリ）で .xlsx ファイルを作ってダウンロードする。
 *        ファイル名は端末によって日本語が使えないことがあるため、英数字にしている（例: ranking_2026-10-28.xlsx）。
 */
var Export = {
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

  /** 印刷（PDF保存）する。pagesHtml は1ページ分ずつのHTMLの配列 */
  print: function (title, pagesHtml) {
    Body.closeHistory();
    var area = document.getElementById('printArea');
    if (!area) { area = document.createElement('div'); area.id = 'printArea'; document.body.appendChild(area); }
    area.innerHTML = pagesHtml.map(function (h) { return '<section class="print-page">' + h + '</section>'; }).join('');
    // A4の1枚（余白を除いた高さ 約1030px）に収まらないページは、グラフを一段小さくする（既存アプリと同じ）
    area.style.cssText = 'display:block;position:absolute;left:-10000px;top:0;width:700px;';
    Array.prototype.forEach.call(area.children, function (sec) { if (sec.offsetHeight > 1030) sec.classList.add('compact'); });
    area.style.cssText = '';
    var oldTitle = document.title;
    document.title = title;   // PDFのファイル名の候補になる
    document.body.classList.add('printing');
    var done = function () { document.body.classList.remove('printing'); area.innerHTML = ''; document.title = oldTitle; };
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
    return kind === 'weight' ? Body.weightReportHtml(a, { print: true }) : Body.physicalHtml(a, { print: true });
  },

  fileTitle: function (kind) { return kind === 'weight' ? '体重レポート_' : 'フィジカルレポート_'; },

  reportPdf: function (a, kind) {
    Export.print(Export.fileTitle(kind) + a.name + '_' + Export.today(), [Export.reportPage(a, kind)]);
  },

  /** 複数人のレポートを1人1ページでPDFに（記録がある選手だけ。並び順は渡された順） */
  reportsPdf: function (list, label, kind) {
    var withData = list.filter(function (a) { return kind === 'weight' ? a.weight.length : a.inbody.length; });
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
    Export.excel('weight_' + (date || 'latest') + '.xlsx', [
      { name: '体重', rows: [['選手ID', '名前', '学年', 'チーム', '測定日', '体重', '前回の測定日', '前回比', '4週前比', '状態']]
          .concat(rows.map(function (r) { return [r.id, r.name, r.grade, r.team, r.date || '', r.weight === null ? '' : r.weight, r.prevDate || '', r.diff, r.diff4w, r.weight === null ? '未測定' : '']; })) }
    ]);
  },

  weightTablePdf: function (date, sub, rows) {
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
  /** ランキング（画面に表示中のもの）をExcelに */
  rankingExcel: function (title, rows) {
    Export.excel('ranking_' + Export.today() + '.xlsx', [
      { name: 'ランキング', rows: [['順位', '選手ID', '名前', '学年', '値', '測定日']]
          .concat(rows.map(function (r) { return [r.rank, r.id, r.name, r.grade, r.value, r.date]; })) }
    ]);
  },

  /** ランキングをPDFに（1ページに収まらなければ自動で次のページへ） */
  rankingPdf: function (title, sub, rows) {
    var html = Export.head('ランキング　' + title, sub) +
      '<table class="tbl print-tbl"><tr><th>順位</th><th>名前</th><th>学年</th><th>値</th><th>測定日</th></tr>' +
      rows.map(function (r) { return '<tr><td>' + esc(r.rank) + '</td><td>' + esc(r.name) + '</td><td>' + esc(r.grade) + '</td><td><b>' + esc(r.value) + '</b></td><td>' + esc(r.date) + '</td></tr>'; }).join('') +
      '</table>';
    Export.print('ランキング_' + title + '_' + Export.today(), [html]);
  },

  // ---------------- 実施状況 ----------------
  overviewExcel: function (o, list) {
    Export.excel('weekly_' + o.weekStart + '.xlsx', [
      { name: '実施状況', rows: [['選手ID', '名前', '学年', 'チーム', '実施Day数', '全Day数', '回数', 'うち自分のメニュー', '上半身セット', '下半身セット', '全身セット', 'その他セット', 'sRPE平均', '負荷(sRPE×分)', '時間(分)', 'メニュー外の種目数', '最終実施日']]
          .concat(list.map(function (a) {
            return [a.id, a.name, a.grade, a.team, a.daysDone, a.menuDays, a.sessions, a.freeSessions, a.sets['上半身'], a.sets['下半身'], a.sets['全身'], a.sets['その他'], a.srpeAvg, a.load, a.minutes, a.offMenu, a.lastDate];
          })) }
    ]);
  },

  overviewPdf: function (o, list) {
    var html = Export.head('実施状況　' + o.weekStart + '〜' + o.weekEnd, '表示 ' + list.length + '人') +
      '<table class="tbl print-tbl"><tr><th>名前</th><th>学年</th><th>Day</th><th>回数</th><th>上/下/全</th><th>sRPE</th><th>負荷</th><th>最終</th></tr>' +
      list.map(function (a) {
        return '<tr class="' + (a.sessions ? '' : 'row-ng') + '"><td>' + esc(a.name) + '</td><td>' + esc(a.grade) + '</td><td>' + (a.menuDays ? a.daysDone + '/' + a.menuDays : '-') +
          '</td><td>' + a.sessions + '</td><td>' + a.sets['上半身'] + '/' + a.sets['下半身'] + '/' + a.sets['全身'] + '</td><td>' + (a.srpeAvg === '' ? '-' : a.srpeAvg) +
          '</td><td>' + (a.load || '-') + '</td><td>' + esc(a.lastDate || '-') + '</td></tr>';
      }).join('') + '</table>';
    Export.print('実施状況_' + o.weekStart, [html]);
  }
};
