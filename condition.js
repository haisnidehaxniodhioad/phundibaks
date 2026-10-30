/**
 * condition.js ― コンディション（疲労度・パフォーマンスの質・コメント）の記録（v33）
 *
 *   画面は2つ
 *     ・保存のあと（S.view = 'afterSave'）… トレーニングを保存したら出る。「コンディションを記録する」か「あとで入力する」を選ぶ
 *     ・コンディションの入力（S.view = 'condition'）… 4つの項目を 1〜10 で選び、コメントを書いて保存
 *   ホームの「今日のコンディション」からも、いつでも入力できる（1日1回。入れ直すと上書き）
 *   声でも入れられる：「全身3、上半身2、下半身4、動き7」「コメント ふくらはぎが張ってる」「保存」「あとで」
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
               comment: cur ? cur.comment : '', method: 'タップ', fresh: !cur };
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
    html += '<section class="sec"><h2>コメント</h2><textarea id="condComment" class="cond-comment" maxlength="200" rows="3" placeholder="例：ふくらはぎが少し張っている">' + esc(c.comment || '') + '</textarea></section>';
    html += '<p class="muted small">保存は下の「コンディションを保存」。声でも「全身3、上半身2、下半身4、動き7」のように入れられるよ。</p></div>';
    app.innerHTML = html;
  },

  /** コメント欄の内容を S.cond に取り込む */
  readComment: function () {
    var el = document.getElementById('condComment');
    if (el && S.cond) S.cond.comment = el.value;
  },
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
    var c = S.cond;
    app.innerHTML = '<div class="loading">保存中…</div>';
    Api.call('saveCondition', { token: S.token, condition: { date: c.date, whole: c.whole, upper: c.upper, lower: c.lower, perf: c.perf, comment: c.comment, method: c.method } })
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
    }).join('') + (c.comment ? '<tr><td colspan="2" class="muted small">' + esc(c.comment) + '</td></tr>' : '') + '</tbody></table>';
  },

  /** 声：コンディションの画面・保存のあとの画面、どの画面からでも「コンディションを記録」。答えたら true */
  voice: function (text) {
    var t = VoiceParser.norm(VoiceParser.normalizeNumbers(text));
    // どの画面からでも（トレーニング中・終了画面を除く）
    if (S.view !== 'condition' && S.view !== 'session' && S.view !== 'finish' && /コンディション|体調/.test(t) && /記録|入力|つけ|付け|入れ|書/.test(t)) {
      Condition.open(); reply(text, 'コンディションを記録しよう。「全身3、上半身2、下半身4、動き7」みたいに話してね。'); return true;
    }
    if (S.view === 'afterSave') {
      if (/あとで|後で|あと(で|にする)|いらない|いいえ|しない|やめ|ホーム/.test(t)) { Condition.later(); return true; }
      if (/記録|入力|はい|する|やる|入れ|つけ|うん|お願い/.test(t)) { Condition.open(S.condDate); reply(text, 'コンディションを記録しよう。「全身3、上半身2、下半身4、動き7」みたいに話してね。'); return true; }
      return false;
    }
    if (S.view !== 'condition' || !S.cond) return false;
    Condition.readComment();
    // コメント
    var cm = String(text).match(/(?:コメント|こめんと|メモ)(?:は|に|を)?[、,:：\s]*(.+)$/);
    if (cm) { S.cond.comment = cm[1].trim(); S.cond.method = '音声'; Condition.render(); reply(text, 'コメントを入れたよ。'); return true; }
    if (/^(保存|ほぞん|記録して|完了|おわり|終わり|オッケー|ok)/i.test(t) || /保存(して|する)?$/.test(t)) {
      if (!Condition.ready()) { reply(text, '「' + Condition.missing().join('」「') + '」を、まだ選んでないよ。', true); return true; }
      Condition.save(); return true;
    }
    if (/あとで|後で|やめ/.test(t)) { Condition.later(); return true; }
    // 「全身3、上半身2、下半身4、動き7」：項目の言葉のすぐあとの数字を読む
    var got = [];
    Condition.ITEMS.forEach(function (it) {
      var re = new RegExp('(?:' + it.words.source + ')[^0-9]{0,6}?(10|[1-9])');
      var m = t.match(re);
      if (m) { S.cond[it.key] = Number(m[1]); got.push(it.short + m[1]); }
    });
    if (got.length) {
      S.cond.method = '音声';
      Condition.render();
      var miss = Condition.missing();
      reply(text, got.join('、') + 'だね。' + (miss.length ? 'あとは「' + miss.join('」「') + '」を教えて。' : 'コメントがあれば「コメント〜」、なければ「保存」って言ってね。'));
      return true;
    }
    return false;
  }
};
