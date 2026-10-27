/**
 * import.js ― 「体重管理表」「体組成Excel」の読み取り（スタッフ画面の「取り込み」タブ）（Phase 3）
 * Excelはブラウザの中で読み取るだけで、どこにも保存しない。読み取りには SheetJS（無料）を使う。
 *
 * 体重管理表 : A列=選手名、1行目=測定日、B列以降=体重。未測定は空欄か「-」
 * 体組成Excel: 1人4行のブロック（A列=選手名、B列=「身長」「体重」「体脂肪率」「除脂肪体重」）、1行目=測定日
 * どちらの形式かは、B列に「身長」があるかどうかで自動で判定する。
 */
var Importer = {
  SHEETJS_URL: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',

  /** SheetJSを必要になったときだけ読み込む */
  loadLib: function () {
    if (window.XLSX) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = Importer.SHEETJS_URL;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Excelを読み取る部品を読み込めませんでした。通信状況を確認してください。')); };
      document.head.appendChild(s);
    });
  },

  /** ファイルを読み取り、表（2次元の配列）にする */
  readFile: function (file) {
    return Importer.loadLib().then(function () {
      return new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onload = function () {
          try {
            // 日付はシリアル値（数値）のまま読む（日付型に変換すると時差で1日ずれることがあるため）
            var wb = XLSX.read(new Uint8Array(fr.result), { type: 'array' });
            var ws = wb.Sheets[wb.SheetNames[0]];
            resolve(XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }));
          } catch (e) { reject(new Error('Excelを読み取れませんでした: ' + e.message)); }
        };
        fr.onerror = function () { reject(new Error('ファイルを読み込めませんでした。')); };
        fr.readAsArrayBuffer(file);
      });
    });
  },

  /** Excelの日付（シリアル値・文字列）を 'yyyy-MM-dd' にする。日付でなければ '' */
  toDate: function (v) {
    if (typeof v === 'number' && v > 20000 && v < 80000) {
      var d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
      return d.toISOString().slice(0, 10);
    }
    var m = String(v || '').match(/(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/);
    return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : '';
  },

  /** 数値にする（「74,4」→74.4、「-」や空欄→null） */
  toNum: function (v) {
    if (typeof v === 'number') return v;
    var s = String(v || '').trim().replace(/[０-９．，]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    if (!s || s === '-' || s === 'ー') return null;
    s = s.replace(',', '.');
    var n = Number(s);
    return isNaN(n) ? null : n;
  },

  /**
   * 表を解析する。返す形:
   *   { kind: 'weight'|'inbody', dates: ['2026-10-10', ...], records: [{name, date, weight, height, fat, lbm}], warnings: ['...'] }
   */
  parse: function (rows) {
    var isInbody = rows.some(function (r) { return String(r[1] || '').trim() === '身長'; });
    var warnings = [], records = [];
    if (!isInbody) {
      var head = rows[0] || [], dateCols = [];
      head.forEach(function (v, c) { var d = Importer.toDate(v); if (c >= 1 && d) dateCols.push({ c: c, d: d }); });
      rows.slice(1).forEach(function (r, i) {
        var name = String(r[0] || '').trim();
        if (!name) return;
        dateCols.forEach(function (dc) {
          var raw = r[dc.c], w = Importer.toNum(raw);
          if (w === null) return;
          if (typeof raw === 'string' && raw.indexOf(',') >= 0) warnings.push(name + ' ' + dc.d + '：「' + raw + '」を ' + w + ' として読みました');
          if (w < 30 || w > 200) { warnings.push(name + ' ' + dc.d + '：体重 ' + w + ' は範囲外のため取り込みません'); return; }
          records.push({ name: name, date: dc.d, weight: w });
        });
      });
      return { kind: 'weight', dates: dateCols.map(function (x) { return x.d; }), records: records, warnings: warnings };
    }

    var headI = rows[0] || [], dcols = [];
    headI.forEach(function (v, c) { var d = Importer.toDate(v); if (c >= 2 && d) dcols.push({ c: c, d: d }); });
    var noName = 0;
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][1] || '').trim() !== '身長') continue;
      // 4行のブロック: 身長・体重・体脂肪率・除脂肪体重（名前はブロックのどこかの行のA列にある）
      var blockName = '';
      for (var n = i; n < Math.min(i + 4, rows.length) && !blockName; n++) blockName = String(rows[n][0] || '').trim();
      if (!blockName) { noName++; continue; }
      var get = function (label) {
        for (var k = i; k < Math.min(i + 4, rows.length); k++) if (String(rows[k][1] || '').trim() === label) return rows[k];
        return [];
      };
      var rh = get('身長'), rw = get('体重'), rf = get('体脂肪率'), rl = get('除脂肪体重');
      dcols.forEach(function (dc) {
        var w = Importer.toNum(rw[dc.c]);
        if (w === null) return;   // その日の体重が空欄なら未測定
        var f = Importer.toNum(rf[dc.c]), h = Importer.toNum(rh[dc.c]), l = Importer.toNum(rl[dc.c]);
        var tag = blockName + ' ' + dc.d + '：';
        if (w < 30 || w > 200) { warnings.push(tag + '体重 ' + w + ' は範囲外のため取り込みません'); return; }
        if (f === null || f < 1 || f > 60) { warnings.push(tag + '体脂肪率 ' + (f === null ? '空欄' : f) + ' のため取り込みません'); return; }
        if (l !== null) {
          var calc = w * (100 - f) / 100;
          if (Math.abs(calc - l) >= 2) warnings.push(tag + '除脂肪体重 ' + Math.round(l * 10) / 10 + ' が計算値 ' + Math.round(calc * 10) / 10 + ' と2kg以上ずれています（そのまま取り込みます）');
        }
        records.push({ name: blockName, date: dc.d, weight: w, fat: f, height: h, lbm: l });
      });
    }
    if (noName) warnings.unshift('名前が空欄のブロックが' + noName + '人分あったため、取り込みません');
    return { kind: 'inbody', dates: dcols.map(function (x) { return x.d; }), records: records, warnings: warnings };
  }
};
