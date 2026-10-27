/**
 * voice.js ― 音声の聞き取り（音声認識）と、話した内容の解析
 *
 *   VoiceInput.listen(...) … マイクで1回分の発話を聞き取る
 *   VoiceParser.parse(...) … 聞き取った文を「何をしたいか」に変換する（画面には触らない）
 *
 * 解析だけを分けているのは、パソコン上で自動テストできるようにするため。
 * 新しい話し方に対応したいときは、VoiceParser の PATTERNS を増やす。
 */
 
// ---------------- 音声認識 ----------------
var VoiceInput = {
  Recognition: (typeof window !== 'undefined') && (window.SpeechRecognition || window.webkitSpeechRecognition),
  active: null,
 
  supported: function () { return !!this.Recognition; },
 
  /**
   * 1回分の発話を聞き取る。
   * handlers.onInterim(text) … 話している途中の文字
   * handlers.onResult(text)  … 聞き取り終わった文（空文字のこともある）
   * handlers.onError(code)   … エラー（not-allowed など）
   */
  listen: function (handlers) {
    if (!this.supported()) { handlers.onError('unsupported'); return; }
    this.stop();
    var rec = new this.Recognition();
    rec.lang = 'ja-JP';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    var last = '', finalText = '', errored = false;
    rec.onresult = function (e) {
      var text = '';
      for (var i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      last = text;
      if (e.results[e.results.length - 1].isFinal) finalText = text;
      if (handlers.onInterim) handlers.onInterim(text);
    };
    rec.onerror = function (e) { errored = true; handlers.onError(e.error); };
    // iPhoneのSafariは「確定」を返さずに終わることがあるので、途中経過の文も結果として使う
    rec.onend = function () { VoiceInput.active = null; if (!errored) handlers.onResult(finalText || last); };
    this.active = rec;
    try { rec.start(); } catch (err) { this.active = null; handlers.onError(String(err)); }
  },
 
  stop: function () { if (this.active) { try { this.active.stop(); } catch (e) { /* 無視 */ } } }
};
 
// ---------------- 話した内容の解析 ----------------
var VoiceParser = {
  /** 漢数字・全角数字を半角数字にする（例: 六十二点五キロ八回 → 62.5キロ8回） */
  normalizeNumbers: function (text) {
    var s = String(text || '').normalize('NFKC');
    var digit = { '〇': 0, '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
    s = s.replace(/[〇零一二三四五六七八九十百千]+(?:点[〇零一二三四五六七八九]+)?/g, function (m) {
      var parts = m.split('点');
      var total = 0, cur = 0;
      for (var i = 0; i < parts[0].length; i++) {
        var c = parts[0][i];
        if (c in digit) cur = cur * 10 + digit[c];
        else {
          var unit = c === '十' ? 10 : c === '百' ? 100 : 1000;
          total += (cur || 1) * unit; cur = 0;
        }
      }
      total += cur;
      if (parts[1]) total = Number(total + '.' + parts[1].split('').map(function (c) { return digit[c]; }).join(''));
      return String(total);
    });
    // 「62点5」「62.5」の表記ゆれ、数字の間の空白
    s = s.replace(/(\d)\s*点\s*(\d)/g, '$1.$2').replace(/(\d)\s+(?=\d)/g, '$1');
    return s;
  },
 
  /** 比べやすい形（空白・記号・長音「ー」を除く。キーワードの正規表現もこの形に合わせて書く） */
  norm: function (s) { return String(s || '').normalize('NFKC').replace(/[\s・\-ー_、。,.!?！？]/g, '').toLowerCase(); },
 
  /**
   * 文の中から種目名を探す。候補は「トレーニング中の種目」と「種目マスタ（呼び方の候補を含む）」。
   * いちばん長く一致した名前を返す（「ベンチ」より「ベンチプレス」を優先）。
   */
  findExercise: function (text, candidates) {
    var t = this.norm(text), best = null, bestLen = 0;
    candidates.forEach(function (c) {
      [c.name].concat(c.aliases || []).forEach(function (alias) {
        var a = VoiceParser.norm(alias);
        if (a.length >= 2 && t.indexOf(a) >= 0 && a.length > bestLen) { best = c.name; bestLen = a.length; }
      });
    });
    return best;
  },
 
  /**
   * 「デイ1を始める」のような、Dayを始める指示を読み取る。Dayの番号を返す（無ければnull）。
   * 音声認識は「デイ1」を「D1」「デイワン」「でいいち」「デー1」「1日目」などと聞き取ることがあるので、幅広く受け付ける。
   */
  parseStartDay: function (t) {
    // t は norm() 済みの文（長音「ー」は消えている: スタート→スタト、デー→デ、ワン→ワン、ツー→ツ）
    if (!/始|初め|はじめ|スタト|開始|やる|やり|する/.test(t)) return null;
    if (/キロ|きろ|kg|回|かい|レップ/.test(t)) return null;   // 「60キロ8回やる」などの記録は対象外
    var words = { 'いち': 1, 'ワン': 1, 'one': 1, 'に': 2, 'ツ': 2, 'two': 2, 'さん': 3, 'スリ': 3, 'three': 3,
                  'よん': 4, 'し': 4, 'フォ': 4, 'four': 4, 'ご': 5, 'ファイブ': 5, 'five': 5 };
    var m = t.match(/(?:デイ|でい|ディ|でぃ|デ|day|d|ﾃﾞｲ)(\d|いち|ワン|one|に|ツ|two|さん|スリ|three|よん|し|フォ|four|ご|ファイブ|five)/);
    if (m) return /\d/.test(m[1]) ? Number(m[1]) : words[m[1]];
    m = t.match(/(\d)(?:日目|にちめ|番目?)/) || t.match(/第(\d)/);
    if (m) return Number(m[1]);
    // 「1を始める」のように、1桁の数字のすぐあとに始める言葉が来る場合
    m = t.match(/^[^\d]*(\d)(?:を|から)?(?:始|初め|はじめ|スタト|開始|やる|やり|する)[^\d]*$/);
    if (m) return Number(m[1]);
    return null;
  },
 
  /**
   * 聞き取った文を、操作の指示に変換する。
   * context.candidates: [{name, aliases:[...]}]  （種目の候補）
   * 返す形の例:
   *   { type: 'record', exercise: 'スクワット' or null, weight: 60, reps: 8 }
   *   { type: 'next' } { type: 'current' } { type: 'previous', exercise } { type: 'restLeft' } { type: 'skipRest' }
   *   { type: 'undo' } { type: 'add', exercise } { type: 'finish' } { type: 'startDay', day: 2 }
   *   { type: 'suggest' } { type: 'unknown', text } { type: 'unknownExercise', name }
   */
  parse: function (rawText, context) {
    var candidates = (context && context.candidates) || [];
    var text = this.normalizeNumbers(rawText).trim();
    var t = this.norm(text);
    if (!t) return { type: 'empty' };
 
    if (/取り消|とりけし|キャンセル|やり直|間違え|まちがえ/.test(t)) return { type: 'undo' };
    if (/スキップ|レスト(終了|終わり|おわり)|休憩(終了|終わり|おわり)/.test(t)) return { type: 'skipRest' };
    if (/(あと|残り|のこり)(何|なん)?秒|レスト(は|あと)/.test(t)) return { type: 'restLeft' };
 
    var addMatch = text.match(/^(.+?)\s*を?\s*(追加|ついか)/);
    if (addMatch) {
      var addName = this.findExercise(addMatch[1], candidates);
      return { type: 'add', exercise: addName || addMatch[1].trim(), known: !!addName };
    }
 
    var startDay = this.parseStartDay(t);
    if (startDay) return { type: 'startDay', day: startDay };
 
    // ---- 記録（重量・回数） ----
    var weight = null, reps = null;
    var wm = text.match(/(\d+(?:\.\d+)?)\s*(?:キロ|きろ|kg|ｋｇ|㎏|キログラム)/i);
    var rm = text.match(/(\d+)\s*(?:回|かい|レップ|reps?)/i);
    if (wm) weight = Number(wm[1]);
    if (rm) reps = Number(rm[1]);
    if (weight === null && reps === null) {
      // 単位なしの「60の8」「60で8」「60かける8」「60×8」
      var pair = text.match(/(\d+(?:\.\d+)?)\s*(?:の|で|かける|×|x|X|を)\s*(\d+)/);
      if (pair) { weight = Number(pair[1]); reps = Number(pair[2]); }
    }
    if (weight !== null || reps !== null) {
      var exName = this.findExercise(text, candidates);
      if (!exName) {
        // 最初の数字より前に言葉があれば「知らない種目名」とみなす（「今の」「記録」などは除く）
        var rest = text.split(/\d/)[0].replace(/[をのでは、。\s]+$/, '').trim();
        if (rest.length >= 2 && !/^(記録|きろく|今の|いまの|次|これ|それ|えっと|えーと)/.test(rest)) {
          return { type: 'unknownExercise', name: rest, weight: weight, reps: reps };
        }
      }
      return { type: 'record', exercise: exName, weight: weight, reps: reps };
    }
 
    if (/前回/.test(t)) return { type: 'previous', exercise: this.findExercise(text, candidates) };
    if (/次|つぎ/.test(t)) return { type: 'next' };
    if (/今日は?(何|なに)|何(を)?(する|やる)|なにする|なにやる|おすすめ/.test(t)) return { type: 'suggest' };
    if (/今の|いまの|(何|なん)の種目|テンポ|メニュ/.test(t)) return { type: 'current' };
    if (/^(終わり|おわり|終了|しゅうりょう|保存|ほぞん|おしまい)/.test(t) || /(トレニング|練習)(終わり|終了)/.test(t)) return { type: 'finish' };
    return { type: 'unknown', text: text };
  }
};
 
if (typeof module !== 'undefined') module.exports = { VoiceParser: VoiceParser };
 
