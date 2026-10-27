/**
 * export.js ― スタッフ画面の「PDFで保存」「Excelで保存」（Phase 3b、3cでInBodyと体重を分けた）
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

  // ---------------- 体組成レポート（InBody と 体重 は別々） ----------------
  /** 1人分のレポートのページ。kind: 'inbody' または 'weight' */
  reportPage: function (a, kind) {
    var title = kind === 'weight' ? '体重レポート' : 'InBodyレポート';
    return Export.head(title + '　' + a.name, [a.id, a.grade, a.team].filter(String).join('・')) +
      (kind === 'weight' ? Body.weightHtml(a.weight, { print: true }) : Body.inbodyHtml(a.inbody, { print: true }));
  },

  reportPdf: function (a, kind) {
    Export.print((kind === 'weight' ? '体重レポート_' : 'InBodyレポート_') + a.name + '_' + Export.today(), [Export.reportPage(a, kind)]);
  },

  /** 複数人のレポートを1人1ページでPDFに（記録がある選手だけ） */
  reportsPdf: function (list, label, kind) {
    var withData = list.filter(function (a) { return kind === 'weight' ? a.weight.length : a.inbody.length; });
    if (!withData.length) { alert('記録がある選手がいません。'); return; }
    if (!confirm(withData.length + '人分のレポートを1人1ページでPDFにします。人数が多いと印刷画面が出るまで時間がかかります。')) return;
    Export.print((kind === 'weight' ? '体重レポート_' : 'InBodyレポート_') + label + '_' + Export.today(),
                 withData.map(function (a) { return Export.reportPage(a, kind); }));
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
