/**
 * condition.js ― コンディション（疲労度・パフォーマンスの質・コメント）の記録（v33）
 *
 *   画面は2つ
 *     ・保存のあと（S.view = 'afterSave'）… トレーニングを保存したら出る。「コンディションを記録する」か「あとで入力する」を選ぶ
 *     ・コンディションの入力（S.view = 'condition'）… 4つの項目を 1〜10 で選び、コメントを書いて保存
 *   ホームの「今日のコンディション」からも、いつでも入力できる（1日1回。入れ直すと上書き）
 *   声でも入れられる：「全身3、上半身2、下半身4、動き7」「コメント ふくらはぎが張ってる」「保存」「あとで」
 *   体重（v46）：入力の画面に「体重」の欄（空でもよい）。入れると体重レポートにも出る（Apps Script の 体重シート・入力者＝本人）
 *   画面を開かずに声で入れる（v46。Condition.talk）：どの画面でも（トレーニング中・終了画面を除く）
 *     ・一気に：「疲労5、上半身4、下半身6、動き7、体重72.5」
 *     ・1つずつ：「コンディションを入れて」→ コーチが足りないものを1つずつ聞く →（体重を聞く）→ 読み上げて「保存する？」→「はい」で保存
 *     ・途中で「上半身3」のように言い直せる。「やめて」で中止。入力の画面を開きたいときは「コンディションの画面を開いて」
 *   保存先は Apps Script の コンディション.gs（API saveCondition）
 *
 * ★ 項目を増やす・言葉を変えるときは ITEMS を書きかえる（Apps Script の CONDITION_ITEMS と、シートの列も合わせる）
 */
var Condition = {
  ITEMS: [
    { key: 'whole', label: '全身の疲労',     short: '全身',   low: '疲れていない', high: 'とても疲れている', words: /全身|全体|からだ全体|体全体/ },
    { key: 'upper', label: '上半身の筋肉の疲労', short: '上半身', low: '疲れていない', high: 'とても疲れている', words: /上半身|上半/ },
    { key: 'lower', label: '下半身の筋肉の疲労', short: '下半身', low: '疲れていない', high: 'とても疲れている', words: /下半身|下半/ },
    { key: 'perf',  label: 'パフォーマンスの質（動きやすさ）', short: '動きやすさ', low: 'とても悪い', high: 'とても良い', words: /動きやす|うごきやす|動き|うごき|パフォ|調子|ちょうし|質/ }
  ],

  /** トレーニングを保存したあとの画面（msg：保存のお知らせ、date：その記録の日付） */
  askAfterSave: function (msg, date) {
    S.view = 'afterSave';
    S.condDate = date || Body.today();
    S.condAfterMsg = msg || '';
    var done = S.home && S.home.condition && S.home.condition.date === S.condDate;
    app.innerHTML = '<div class="group">' +
      '<div class="fin-head"><span class="kicker">トレーニングの記録</span><h1>保存したよ！</h1>' +
      (msg ? '<p class="muted small">' + esc(msg) + '</p>' : '') + '</div>' +
      '<section class="sec"><h2>' + Condition.dateLabel(S.condDate) + 'のコンディション</h2>' +
      '<p>' + (done ? 'もう記録してあるよ。直すこともできるよ。' : '疲れ具合と動きやすさを記録しておこう。30秒くらいで終わるよ。') + '</p>' +
      '<button class="btn big block" data-act="condOpen">' + Icon('check', 22) + (done ? 'コンディションを直す' : 'コンディションを記録する') + '</button>' +
      '<button class="btn ghost block" data-act="condLater">あとで入力する</button></section></div>';
    Speech.speak(done ? '保存したよ。おつかれさま！' : '保存したよ。コンディションも記録する？「記録する」か「あとで」って言ってね。');
  },

  /** 入力の画面を開く（date を省略すると今日。その日の記録があれば、それを入れておく） */
  open: function (date) {
    var d = date || S.condDate || Body.today();
    var cur = S.home && S.home.condition && S.home.condition.date === d ? S.home.condition : null;
    S.cond = { date: d, whole: cur ? cur.whole : '', upper: cur ? cur.upper : '', lower: cur ? cur.lower : '', perf: cur ? cur.perf : '',
               comment: cur ? cur.comment : '', weight: cur && cur.weight !== undefined ? cur.weight : '', method: 'タップ', fresh: !cur };
    S.condTalk = null;
    Condition.render();
  },

  render: function (error) {
    S.view = 'condition';
    var c = S.cond;
    var html = '<div class="group"><div class="topbar"><span class="kicker">' + Condition.dateLabel(c.date) + 'のコンディション</span>' +
      '<button class="btn ghost" data-act="condLater">あとで</button></div>' + msgHtml('error', error);
    Condition.ITEMS.forEach(function (it) {
      html += '<section class="sec cond-item"><h2>' + it.label + '</h2><div class="cond-scale" role="group" aria-label="' + it.label + '">';
      for (var v = 1; v <= 10; v++) {
        html += '<button class="' + (c[it.key] === v ? 'on' : '') + '" data-act="condPick" data-k="' + it.key + '" data-v="' + v + '" aria-label="' + it.label + v + '">' + v + '</button>';
      }
      html += '</div><div class="cond-ends"><span>1 ' + it.low + '</span><span>10 ' + it.high + '</span></div></section>';
    });
    html += '<section class="sec"><h2>体重 <span class="muted small">（測った日だけ。空でもいいよ）</span></h2><div class="cond-weight">' +
      '<input id="condWeight" type="number" inputmode="decimal" step="0.1" min="30" max="200" placeholder="例 72.5" value="' + (c.weight === '' || c.weight === null || c.weight === undefined ? '' : esc(c.weight)) + '"> <span>kg</span></div></section>';
    html += '<section class="sec"><h2>コメント</h2><textarea id="condComment" class="cond-comment" maxlength="200" rows="3" placeholder="例：ふくらはぎが少し張っている">' + esc(c.comment || '') + '</textarea></section>';
    html += '<p class="muted small">保存は下の「コンディションを保存」。声でも「全身3、上半身2、下半身4、動き7、体重72.5」のように入れられるよ。</p></div>';
    app.innerHTML = html;
  },

  /** コメント欄の内容を S.cond に取り込む */
  readComment: function () {
    var el = document.getElementById('condComment');
    if (el && S.cond) S.cond.comment = el.value;
    var w = document.getElementById('condWeight');
    if (w && S.cond) S.cond.weight = w.value === '' ? '' : Number(w.value);
  },
  /** 体重が正しい範囲か（空はOK） */
  weightOk: function (w) { return w === '' || w === null || w === undefined || (Number(w) >= 30 && Number(w) <= 200); },
  /** 4つとも選んであるか */
  ready: function () {
    return !!S.cond && Condition.ITEMS.every(function (it) { return S.cond[it.key] >= 1; });
  },
  missing: function () {
    return Condition.ITEMS.filter(function (it) { return !(S.cond[it.key] >= 1); }).map(function (it) { return it.short; });
  },

  /** 保存する */
  save: function () {
    Condition.readComment();
    if (!Condition.ready()) {
      var m = '「' + Condition.missing().join('」「') + '」を選んでね。';
      Condition.render(m); Speech.speak(m); return;
    }
    if (!Condition.weightOk(S.cond.weight)) { var wm = '体重は30〜200キロで入れてね。'; Condition.render(wm); Speech.speak(wm); return; }
    var c = S.cond;
    app.innerHTML = '<div class="loading">保存中…</div>';
    Api.call('saveCondition', { token: S.token, condition: { date: c.date, whole: c.whole, upper: c.upper, lower: c.lower, perf: c.perf, comment: c.comment, method: c.method, weight: c.weight } })
      .then(function (res) {
        if (S.home && res.condition && res.condition.date === Body.today()) S.home.condition = res.condition;
        QA.reset();
        S.cond = null;
        Speech.speak('コンディションを記録したよ。' + Condition.advice(res.condition));
        loadHome(res.message);
      }).catch(function (err) { Condition.render(err.message); });
  },

  /** あとで入力する（ホームに戻る） */
  later: function () {
    S.cond = null;
    loadHome(S.view === 'afterSave' ? S.condAfterMsg : null);
  },

  /** 記録したあとのひとこと（とても疲れているときは休むことをすすめる） */
  advice: function (c) {
    if (!c) return '';
    var max = Math.max(c.whole, c.upper, c.lower);
    if (max >= 8) return 'かなり疲れているね。今日はしっかり休んで、ごはんと睡眠をとろう。';
    if (c.perf >= 8) return '動きが良さそうだね！';
    return '';
  },

  dateLabel: function (d) {
    if (!d || d === Body.today()) return '今日';
    return Number(d.slice(5, 7)) + '月' + Number(d.slice(8, 10)) + '日';
  },

  /** ホームの「今日のコンディション」 */
  homeHtml: function () {
    var c = S.home && S.home.condition;
    var html = '<section class="sec cond-home"><div class="sec-head"><h2>今日のコンディション</h2>' +
      (c ? '<button class="btn ghost small" data-act="condOpen">直す</button>' : '') + '</div>';
    if (!c) return html + '<p class="muted small">まだ記録していないよ。疲れ具合と動きやすさを記録しよう。</p>' +
      '<button class="btn sub block" data-act="condOpen">コンディションを記録する</button></section>';
    return html + Condition.tableHtml(c) + '</section>';
  },

  /** 4つの値とコメントの表（ホーム・記録のカレンダーで使う） */
  tableHtml: function (c) {
    return '<table class="line-table cond-table"><tbody>' + Condition.ITEMS.map(function (it) {
      return '<tr><td>' + it.label + '</td><td class="r"><b>' + (c[it.key] === '' ? '-' : c[it.key]) + '</b> / 10</td></tr>';
    }).join('') + (c.weight !== '' && c.weight !== undefined && c.weight !== null ? '<tr><td>体重</td><td class="r"><b>' + Number(c.weight).toFixed(1) + '</b> kg</td></tr>' : '') + (c.comment ? '<tr><td colspan="2" class="muted small">' + esc(c.comment) + '</td></tr>' : '') + '</tbody></table>';
  },

  // ---------------- 声 ----------------
  /**
   * 文から値を読み取る（v46。入力の画面・画面を開かない会話の両方で使う）
   *   返すもの: { whole, upper, lower, perf, weight, comment }（言われたものだけ）
   *   「疲労5」「疲れ5」は全身のこと（上半身・下半身を先に読んでから探す）
   */
  parse: function (text) {
    var out = {};
    var raw = VoiceParser.normalizeNumbers(text).replace(/(\d)\s*(?:てん|テン)\s*(\d)/g, '$1.$2');
    var cm = String(text).match(/(?:コメント|こめんと|メモ)(?:は|に|を)?[、,:：\s]*(.+)$/);
    if (cm) { out.comment = cm[1].trim(); raw = raw.replace(/(?:コメント|こめんと|メモ)[\s\S]*$/, ''); }
    var wm = raw.match(/(?:体重|たいじゅう)[^0-9]{0,6}?(\d{2,3}(?:\.\d)?)/) || raw.match(/(\d{2,3}(?:\.\d)?)\s*(?:キロ|きろ|kg|ｋｇ|㎏)/i);
    if (wm) { out.weight = Number(wm[1]); raw = raw.replace(wm[0], ' '); }
    var t = VoiceParser.norm(raw);
    var take = function (key, src) {
      var m = t.match(new RegExp('(?:' + src + ')[^0-9]{0,6}?(10|[1-9])'));
      if (m) { out[key] = Number(m[1]); t = t.replace(m[0], '|'); }
    };
    take('upper', Condition.ITEMS[1].words.source);
    take('lower', Condition.ITEMS[2].words.source);
    take('perf', Condition.ITEMS[3].words.source);
    take('whole', Condition.ITEMS[0].words.source + '|疲労|ひろう|疲れ|つかれ');
    return out;
  },

  /** 読み取った値を、表示用の短い文にする（「全身5、上半身4、体重72.5キロ」） */
  sayValues: function (v) {
    var a = Condition.ITEMS.filter(function (it) { return v[it.key] >= 1; }).map(function (it) { return it.short + v[it.key]; });
    if (v.weight) a.push('体重' + Number(v.weight).toFixed(1) + 'キロ');
    return a.join('、');
  },

  /** 声：保存のあとの画面・入力の画面・どの画面からでも（画面を開かない会話）。答えたら true */
  voice: function (text) {
    var t = VoiceParser.norm(VoiceParser.normalizeNumbers(text));
    var free = S.view !== 'condition' && S.view !== 'session' && S.view !== 'finish' && S.view !== 'afterSave';
    // 画面を開かずに入れている途中（v46）
    if (S.condTalk && free) {
      if (/コンディション/.test(t) && /続き|つづき|再開/.test(t)) return Condition.talkNext(text, '続きをやろう。');
      if (Condition.talk(text, t)) return true;
    }
    // 入力の画面を開く（「コンディションの画面を開いて」）
    if (free && /コンディション|体調/.test(t) && /画面|ペジ|開|ひら/.test(t)) {
      Condition.open(); reply(text, 'コンディションの画面を開いたよ。「全身3、上半身2、下半身4、動き7、体重72.5」みたいに話してもいいよ。'); return true;
    }
    // 画面を開かずに入れ始める（「コンディションを入れて」「疲労5、上半身4…」「体重72.5」）
    if (free) {
      var v = Condition.parse(text);
      var nItems = Condition.ITEMS.filter(function (it) { return v[it.key] >= 1; }).length;
      var ask = /コンディション|体調/.test(t) && /記録|入力|つけ|付け|入れ|書/.test(t);
      var oneShot = nItems >= 2 || (nItems >= 1 && /記録|入れ|入力/.test(t)) || (v.weight && /体重|たいじゅう/.test(t) && /記録|入れ|入力|はかっ|測っ|だった|でした|です$|^体重\d/.test(t));
      if (ask || oneShot) return Condition.talkStart(text, v);
      return false;
    }
    if (S.view === 'afterSave') {
      if (/あとで|後で|あと(で|にする)|いらない|いいえ|しない|やめ|ホーム/.test(t)) { Condition.later(); return true; }
      if (/記録|入力|はい|する|やる|入れ|つけ|うん|お願い/.test(t)) { Condition.open(S.condDate); reply(text, 'コンディションを記録しよう。「全身3、上半身2、下半身4、動き7」みたいに話してね。'); return true; }
      return false;
    }
    if (S.view !== 'condition' || !S.cond) return false;
    Condition.readComment();
    if (/^(保存|ほぞん|記録して|完了|おわり|終わり|オッケー|ok)/i.test(t) || /保存(して|する)?$/.test(t)) {
      if (!Condition.ready()) { reply(text, '「' + Condition.missing().join('」「') + '」を、まだ選んでないよ。', true); return true; }
      Condition.save(); return true;
    }
    if (/あとで|後で|やめ/.test(t)) { Condition.later(); return true; }
    var got = Condition.parse(text);
    if (got.comment !== undefined) { S.cond.comment = got.comment; }
    Condition.ITEMS.forEach(function (it) { if (got[it.key]) S.cond[it.key] = got[it.key]; });
    if (got.weight) S.cond.weight = got.weight;
    var said = Condition.sayValues(got);
    if (said || got.comment !== undefined) {
      S.cond.method = '音声';
      Condition.render();
      var miss = Condition.missing();
      reply(text, (said ? said + 'だね。' : 'コメントを入れたよ。') + (miss.length ? 'あとは「' + miss.join('」「') + '」を教えて。' : 'コメントがあれば「コメント〜」、なければ「保存」って言ってね。'));
      return true;
    }
    return false;
  },

  // ---------------- 画面を開かずに声で入れる（v46） ----------------
  /** 会話を始める（v：最初に言われた値）。今日の記録があれば、それを元にする（体重だけ直す、などができる） */
  talkStart: function (text, v) {
    var today = Body.today(), d = /昨日|きのう/.test(text) ? Body.addDays(today, -1) : today;
    var cur = S.home && S.home.condition && S.home.condition.date === d ? S.home.condition : null;
    var c = { date: d, whole: '', upper: '', lower: '', perf: '', weight: '', comment: '', weightAsked: false, asking: '' };
    if (cur) { Condition.ITEMS.forEach(function (it) { c[it.key] = cur[it.key]; }); c.weight = cur.weight || ''; c.comment = cur.comment || ''; c.weightAsked = true; }
    S.condTalk = c;
    Condition.talkApply(v);
    if (v.weight) c.weightAsked = true;
    var said = Condition.sayValues(v);
    Condition.talkNext(text, (cur ? Condition.dateLabel(d) + 'のコンディションを直すね。' : '') + (said ? said + 'だね。' : (cur ? '' : Condition.dateLabel(d) + 'のコンディションを入れよう。')));
    return true;
  },

  talkApply: function (v) {
    var c = S.condTalk;
    Condition.ITEMS.forEach(function (it) { if (v[it.key]) c[it.key] = v[it.key]; });
    if (v.weight) c.weight = v.weight;
    if (v.comment !== undefined) c.comment = v.comment;
  },

  /** 会話の続き */
  talk: function (text, t) {
    var c = S.condTalk;
    if (/やめ|キャンセル|中止|ちゅうし|あとで|後で|もういい/.test(t)) { S.condTalk = null; reply(text, 'コンディションの入力をやめたよ。'); return true; }
    var v = Condition.parse(text);
    var raw = VoiceParser.normalizeNumbers(text).replace(/(\d)\s*(?:てん|テン)\s*(\d)/g, '$1.$2');
    var said = Condition.sayValues(v);
    // 聞いている項目に、数字だけで答えたとき（「4」「よんです」）
    if (!said && c.asking && c.asking !== 'weight' && c.asking !== 'confirm') {
      var KANA = { 'いち': 1, 'に': 2, 'にい': 2, 'さん': 3, 'よん': 4, 'し': 4, 'ご': 5, 'ごお': 5, 'ろく': 6, 'なな': 7, 'しち': 7, 'はち': 8, 'きゅう': 9, 'きゅ': 9, 'く': 9, 'じゅう': 10, 'じゅ': 10 };
      var kt = t.replace(/(です|かな|くらい|ぐらい|ぐらいかな|かなあ)$/, '');
      if (KANA[kt]) t = String(KANA[kt]);
      var m = t.match(/^(10|[1-9])(です|かな|くらい|ぐらい|ぐらいかな)?$/);
      if (m) { v[c.asking] = Number(m[1]); said = Condition.ITEMS.filter(function (it) { return it.key === c.asking; })[0].short + m[1]; }
    }
    if (!said && c.asking === 'weight') {
      var w = raw.match(/(\d{2,3}(?:\.\d)?)/);
      if (w && Number(w[1]) >= 30 && Number(w[1]) <= 200) { v.weight = Number(w[1]); said = '体重' + Number(w[1]).toFixed(1) + 'キロ'; }
      else if (/なし|ない|測ってない|はかってない|いらない|スキップ|入れない|大丈夫|だいじょうぶ|いいえ/.test(t)) { c.weightAsked = true; return Condition.talkNext(text, 'わかった、体重はなしだね。'); }
    }
    if (v.weight && !(v.weight >= 30 && v.weight <= 200)) { reply(text, '体重は30〜200キロで教えてね。', true); return true; }
    if (said || v.comment !== undefined) {
      Condition.talkApply(v);
      if (v.weight) c.weightAsked = true;
      return Condition.talkNext(text, said ? said + 'だね。' : 'コメントを入れたよ。');
    }
    if (c.asking === 'confirm') {
      if (/^(はい|うん|保存|ほぞん|ok|オッケ|いいよ|いいです|お願い|おねがい|それで|大丈夫|だいじょうぶ|記録して)/i.test(t) || /保存(して|する)?$/.test(t)) return Condition.talkSave(text);
      if (/いいえ|違|ちが|直|なお|まちが|間違/.test(t)) { reply(text, 'どこを直す？「上半身3」「体重72.5」みたいに言ってね。やめるときは「やめて」。'); return true; }
    }
    // 数字が入っているとき・短い返事（「いいえ」「うーん」など）は、今聞いていることをもう一度
    if (/\d/.test(t) || t.length <= 6) return Condition.talkNext(text, '', true);
    // ほかの話（「今日のメニューは？」など）は、ほかの係に回す（入れている途中の値は覚えたまま。「コンディションの続き」で再開）
    return false;
  },

  /** 足りないものを1つずつ聞く → 体重を聞く → 読み上げて確かめる */
  talkNext: function (text, pre, again) {
    var c = S.condTalk;
    var miss = Condition.ITEMS.filter(function (it) { return !(c[it.key] >= 1); });
    var q;
    if (miss.length) {
      var it = miss[0];
      c.asking = it.key;
      q = it.label + 'は、1から10でいくつ？（1が' + it.low + '、10が' + it.high + '）';
    } else if (!c.weightAsked) {
      c.asking = 'weight';
      q = '体重は測った？測ったら「72.5」みたいに、なければ「なし」って言ってね。';
    } else {
      c.asking = 'confirm';
      var full = Condition.sayValues(c) + (c.comment ? '、コメント「' + c.comment + '」' : '');
      q = (pre && pre.indexOf(full + 'だね') >= 0 ? '' : full + '。') + 'これで保存する？「はい」か、直すところを言ってね。';
    }
    reply(text, (again ? 'ごめんね、わからなかったよ。' : '') + (pre || '') + q, again);
    return true;
  },

  talkSave: function (text) {
    var c = S.condTalk;
    S.condTalk = null;
    VoiceUI.show(text, '保存しているよ…');
    Api.call('saveCondition', { token: S.token, condition: { date: c.date, whole: c.whole, upper: c.upper, lower: c.lower, perf: c.perf, comment: c.comment, method: '音声', weight: c.weight } })
      .then(function (res) {
        if (S.home && res.condition && res.condition.date === Body.today()) S.home.condition = res.condition;
        QA.reset();
        reply(text, 'コンディションを記録したよ。' + Condition.advice(res.condition));
        if (S.view === 'home') renderHome();
      }).catch(function (err) { S.condTalk = c; reply(text, '保存できなかったよ（' + err.message + '）。もう一度「はい」って言うと、保存し直すよ。', true); });
    return true;
  }
};
