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
    rec.onend = function () {
      VoiceInput.active = null;
      if (typeof Speech !== 'undefined') Speech.micEndedAt = Date.now();   // 直後の読み上げを少し待たせる（iPhone対策）
      if (!errored) handlers.onResult(finalText || last);
    };
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
   * 文から重量と回数を取り出す（normalizeNumbers 済みの文を渡す）。
   * 「60キロ8回」「60kg 8回」のほか、単位なしの「60の8」「60で8」「60かける8」「60×8」にも対応。
   */
  extractNumbers: function (text) {
    var weight = null, reps = null;
    var wm = text.match(/(\d+(?:\.\d+)?)\s*(?:キロ|きろ|kg|ｋｇ|㎏|キログラム)/i);
    var rm = text.match(/(\d+)\s*(?:回|かい|レップ|reps?)/i);
    if (wm) weight = Number(wm[1]);
    if (rm) reps = Number(rm[1]);
    if (weight === null && reps === null) {
      var pair = text.match(/(\d+(?:\.\d+)?)\s*(?:の|で|かける|×|x|X|を)\s*(\d+)/);
      if (pair) { weight = Number(pair[1]); reps = Number(pair[2]); }
    }
    return { weight: weight, reps: reps };
  },

  // ---------------- 覚えた言い回し（Phase 2b） ----------------
  /** 言い回しを覚えるときの形（数字は#に、空白・記号・長音は除く）。学習.gs と同じ形 */
  phraseKey: function (text) {
    return this.norm(this.normalizeNumbers(text)).replace(/\d+(?:\.\d+)?/g, '#');
  },

  /** 2つの言い回しの似ている度合い（0〜1）。2文字ずつの組の重なりで比べる */
  similarity: function (a, b) {
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;
    var pairs = function (s) { var m = {}; for (var i = 0; i < s.length - 1; i++) { var p = s.substr(i, 2); m[p] = (m[p] || 0) + 1; } return m; };
    var pa = pairs(a), pb = pairs(b), hit = 0;
    Object.keys(pa).forEach(function (k) { if (pb[k]) hit += Math.min(pa[k], pb[k]); });
    return (2 * hit) / (a.length - 1 + b.length - 1);
  },

  /**
   * 覚えた言い回しを探す（同じ画面のものだけ）。
   *   { exact: 言い回し }   … 覚えた言い方と完全に同じ（そのまま実行してよい）
   *   { near: 言い回し }    … よく似ている（勝手に実行せず「もしかして」として候補の先頭に出すだけ）
   *   null                  … 見つからない
   * 似ているだけで実行すると、違う言葉を同じと判断して誤操作になるため、実行は完全一致に限る。
   */
  matchLearned: function (text, phrases, view) {
    var key = this.phraseKey(text), best = null, bestScore = 0;
    (phrases || []).forEach(function (p) {
      if (p.view && p.view !== 'all' && p.view !== view) return;   // 'all' はどの画面でも使う言い方（アプリの基本操作）
      var score = VoiceParser.similarity(key, p.phrase);
      if (score > bestScore) { best = p; bestScore = score; }
    });
    if (!best) return null;
    if (bestScore === 1) return { exact: best };
    if (key.length >= 5 && best.phrase.length >= 5 && bestScore >= 0.7) return { near: best };
    return null;
  },

  /**
   * アプリの基本操作（どの画面でも使える。Phase 3f）を読み取る。当てはまらなければ null。
   *   myMenus: [{id, name}] … 保存した自分のメニュー（名前を言うとそのメニューを始める）
   * 返す形: { type: 'goHome' } { type: 'openBody', tab: 'inbody'|'weight'|'' } { type: 'openHistory', tab }
   *        { type: 'closePanel' } { type: 'myMenuList' } { type: 'newMyMenu' } { type: 'startFree' }
   *        { type: 'startMyMenu', id } { type: 'help' }
   * 重量・回数の入った文（記録）は対象外。キーワードは norm() 後の形（長音「ー」なし）で書く。
   */
  parseNav: function (rawText, myMenus) {
    var text = this.normalizeNumbers(rawText), t = this.norm(text);
    if (!t || /\d+(キロ|kg|回|かい|レップ)/.test(t)) return null;
    if (/何ができ|なにができ|使い方|つかいかた|ヘルプ|何て言え|なんて言え|なんていえ|どう話/.test(t)) return { type: 'help' };
    // 保存した自分のメニューの名前（長い名前を優先）
    var hit = null;
    (myMenus || []).forEach(function (m) {
      var n = VoiceParser.norm(m.name);
      if (n.length >= 2 && t.indexOf(n) >= 0 && (!hit || n.length > VoiceParser.norm(hit.name).length)) hit = m;
    });
    if (hit && !/編集|へんしゅう|直|なお|消|けし/.test(t)) return { type: 'startMyMenu', id: hit.id };
    if (/ホム|最初の画面|トップ(画面|に|へ|に戻)|メイン画面/.test(t)) return { type: 'goHome' };
    if (/閉じ|とじて|とじる|閉めて|しめて/.test(t)) return { type: 'closePanel' };
    var weight = /体重/.test(t) && !/インボディ|inbody|体組成|フィジカル|体脂肪|除脂肪|ffmi/.test(t);
    var inbody = /インボディ|inbody|フィジカル|体脂肪|除脂肪|ffmi/.test(t);
    var tab = weight ? 'weight' : inbody ? 'inbody' : '';
    if (/履歴|りれき|過去の(記録|測定)|測定の一覧/.test(t) && (tab || /体組成|測定/.test(t))) return { type: 'openHistory', tab: tab };
    // トレーニング記録（Phase 3u）：「今週何回やった？」「記録を見せて」
    if (/(今週|こんしゅう|今月|こんげつ|今年度|ことし|今年)(は|に|って)?(何回|なんかい|どれくらい|どのくらい)|何回(トレニング|練習|筋トレ)?(した|やった)/.test(t)) {
      return { type: 'countTraining', tab: /今月|こんげつ/.test(t) ? 'month' : /今年|ことし/.test(t) ? 'year' : 'week' };
    }
    if (/トレニング(の)?(記録|履歴|カレンダ)|記録(を|の)?(見|みせ|一覧|カレンダ|確認)|カレンダ|これまでの(記録|トレニング)|過去の(記録|トレニング)|何をやった|何をした|なにをやった|なにをした/.test(t)) return { type: 'openRecords' };
    if (tab || /体組成|たいそせい|レポト/.test(t)) return { type: 'openBody', tab: tab };
    if (/マイメニュ|保存した(メニュ)|自分のメニュ(の)?(一覧|は|を見|見せ|教え)|登録した(メニュ)/.test(t)) return { type: 'myMenuList' };
    if (/(新しい|あたらしい)メニュ|メニュ(を)?(新しく|作|つく)/.test(t)) return { type: 'newMyMenu' };
    if (/白紙|自由に記録|フリ(で|の)?記録|自分のメニュで(記録|始|やる)/.test(t)) return { type: 'startFree' };
    return null;
  },

  /** ちょっとした会話（あいさつ・お礼など）。当てはまらなければ null */
  parseSmallTalk: function (rawText) {
    var t = this.norm(rawText);
    if (/^(こんにちは|こんにちわ|こんばんは|こんばんわ|おはよ|やあ|ハロ|hello|hi$)/.test(t)) return 'greet';
    if (/ありがと|サンキュ|thank|助かった|たすかった/.test(t)) return 'thanks';
    if (/疲れた|つかれた|しんどい|だるい|眠い|ねむい/.test(t)) return 'tired';
    if (/頑張る|がんばる|やるぞ|いくぞ|行くぞ|気合/.test(t)) return 'cheer';
    if (/(君|きみ|あなた)(は|の名前|だれ|誰)|名前は|誰(ですか|なの)|だれ(ですか|なの)/.test(t)) return 'who';
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
    var nums = this.extractNumbers(text), weight = nums.weight, reps = nums.reps;
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

    // ここから下は「キーワードを含むか」で判定するため、長い文で誤判定しやすい。
    // 長い文（13文字以上）は判定せず「わからない」にして、画面で操作を選んでもらう（選ぶと覚える）。
    if (t.length > 12) return { type: 'unknown', text: text };
    if (/前回/.test(t)) return { type: 'previous', exercise: this.findExercise(text, candidates) };
    if (/次|つぎ/.test(t)) return { type: 'next' };
    if (/今日は?(何|なに)|何(を)?(する|やる)|なにする|なにやる|おすすめ/.test(t)) return { type: 'suggest' };
    if (/今の|いまの|(何|なん)の種目|テンポ|メニュ/.test(t)) return { type: 'current' };
    if (/^(終わり|おわり|終了|しゅうりょう|保存|ほぞん|おしまい)/.test(t) || /(トレニング|練習)(終わり|終了)/.test(t)) return { type: 'finish' };
    return { type: 'unknown', text: text };
  }
};

if (typeof module !== 'undefined') module.exports = { VoiceParser: VoiceParser };
