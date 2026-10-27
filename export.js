/**
 * export.js ― スタッフ画面の「PDFで保存」「Excelで保存」（Phase 3b）
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
    var area = document.getElementById('printArea');
    if (!area) { area = document.createElement('div'); area.id = 'printArea'; document.body.appendChild(area); }
    area.innerHTML = pagesHtml.map(function (h) { return '<section class="print-page">' + h + '</section>'; }).join('');
    var oldTitle = document.title;
    document.title = title;   // PDFのファイル名の候補になる
    document.body.classList.add('printing');
    var done = function () { document.body.classList.remove('printing'); area.innerHTML = ''; document.title = oldTitle; };
    window.addEventListener('afterprint', function once() { window.removeEventListener('afterprint', once); done(); });
    setTimeout(function () { window.print(); }, 300);   // グラフの描画が終わるのを少し待つ
  },

  /** 印刷用の見出し */
  head: function (title, sub) {
    return '<div class="print-head"><div><div class="print-title">' + esc(title) + '</div>' +
      (sub ? '<div class="print-sub">' + esc(sub) + '</div>' : '') + '</div><div class="print-date">作成日 ' + Export.today() + '</div></div>';
  },

  // ---------------- 体組成レポート ----------------
  /** 1人分のレポートのページ */
  reportPage: function (a) {
    return Export.head('体組成レポート　' + a.name, [a.id, a.grade, a.team].filter(String).join('・')) +
      Body.reportHtml({ weight: a.weight, inbody: a.inbody }, { print: true });   // 印刷用の詰めた配置（A4縦1枚）
  },

  /** 1人分のレポートをPDFに */
  reportPdf: function (a) { Export.print('体組成レポート_' + a.name + '_' + Export.today(), [Export.reportPage(a)]); },

  /** 複数人のレポートを1人1ページでPDFに */
  reportsPdf: function (list, label) {
    var withData = list.filter(function (a) { return a.weight.length || a.inbody.length; });
    if (!withData.length) { alert('体組成の記録がある選手がいません。'); return; }
    if (!confirm(withData.length + '人分のレポートを1人1ページでPDFにします。人数が多いと印刷画面が出るまで時間がかかります。')) return;
    Export.print('体組成レポート_' + label + '_' + Export.today(), withData.map(Export.reportPage));
  },

  /** 1人分の測定データをExcelに（体重とInBodyの2シート） */
  reportExcel: function (a) {
    Export.excel('body_' + a.id + '_' + Export.today() + '.xlsx', [
      { name: 'InBody', rows: [['測定日', '身長', '体重', '体脂肪率', '除脂肪体重', 'FFMI', 'FFMI同日順位', '測定人数']]
          .concat(a.inbody.map(function (r) { return [r.date, r.height, r.weight, r.fat, r.lbm, r.ffmi, r.rank || '', r.rankOf || '']; })) },
      { name: '体重', rows: [['測定日', '体重', '種類']].concat(a.weight.map(function (r) { return [r.date, r.weight, r.src]; })) }
    ]);
  },

  /** 全員の最新値（体重・InBody）を1枚の表に */
  latestRows: function (list) {
    var rows = [['選手ID', '名前', '学年', 'チーム', '体重', '体重の測定日', '体脂肪率', '除脂肪体重', 'FFMI', 'InBodyの測定日', '前回比 除脂肪体重', '前回比 FFMI']];
    list.forEach(function (a) {
      var w = a.weight[a.weight.length - 1] || {}, ib = a.inbody[a.inbody.length - 1] || {}, prev = a.inbody[a.inbody.length - 2] || {};
      var d = function (k) { return ib[k] !== undefined && ib[k] !== '' && prev[k] !== undefined && prev[k] !== '' ? Math.round((ib[k] - prev[k]) * 10) / 10 : ''; };
      rows.push([a.id, a.name, a.grade, a.team, w.weight || '', w.date || '', ib.fat || '', ib.lbm || '', ib.ffmi || '', ib.date || '', d('lbm'), d('ffmi')]);
    });
    return rows;
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
