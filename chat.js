/**
 * chat.js ― コーチとの会話を人間らしくする（v22）
 *
 *   AI は使わず、決まりごと（ルール）で会話の幅を広げている。話した内容は外部に送らない。
 *   commands.js の handleVoice から、次の順番で呼ばれる。
 *     1. Chat.clean(文)         … 「えっと」「〜してください」「〜かな」などを取り除き、操作を読み取りやすくする
 *     2. Chat.sessionAction(文) … トレーニング中のくだけた言い方（「できた」「重くして」「セット追加」「休憩する」など）
 *     3. Chat.question(文)      … 質問への答え（「何キロでやればいい？」「あと何セット？」「今何時？」「デイ2は何をやる？」など）
 *     4. Chat.smallTalk(文)     … 雑談・あいさつ（「疲れた」「きつい」「ありがとう」「褒めて」「元気？」など）
 *   どれにも当てはまらないときは、今までどおり「どの操作ですか？」と候補を出し、選ばれた言い方を覚える。
 *
 *   言い方を増やしたいとき：それぞれの関数の中の /…|…/ （正規表現）に言葉を足す。
 *   文は VoiceParser.norm() で「空白・記号・長音（ー）を除いた形」になっているので、言葉も長音なしで書く（例：メニュー → メニュ）。
 *   返事を増やしたいとき：Chat.TALK の [ ] の中に文を足す（毎回この中から1つ選ばれる）。
 */
var Chat = {
  // ---------------- 1. 言い方を整える ----------------
  /** 前置き・語尾を取り除いた文を返す（「えっと、スクワット60キロ8回お願い」→「スクワット60キロ8回」） */
  clean: function (text) {
    var s = String(text || '').trim();
    var name = (window.Avatar && Avatar.name()) || 'コーチ';
    var lead = new RegExp('^(えっと|えーと|ええと|えーっと|えー|あのー|あのさ|あの|うーん|んー|じゃあ|じゃ|では|それじゃあ?|よーし|よし|ねえ|ねぇ|ちょっと|すみません|すいません|' +
      name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '|コーチ)(さん|くん|ちゃん)?[、,。\\s]*');
    for (var k = 0; k < 3; k++) { var t = s.replace(lead, ''); if (!t || t === s) break; s = t; }
    // 語尾（ていねいな言い方・問いかけ）
    var tail = /(して|しといて|しておいて)?(ください|下さい|くださいな|くれる|くれない|くれ|ちょうだい|もらえる|もらえます|もらっていい|もらえない|お願いします|お願い|おねがいします|おねがい|頼む|たのむ|ほしい|欲しい)?(かな|かなあ|ね|よ|な|ぞ|わ|さ|か)?[?？!！。、\s]*$/;
    var u = s.replace(tail, '');
    // 「体重にして」→「体重に」のように、意味が残るときだけ使う（全部消えてしまうなら元のまま）
    if (u && u.length >= 2) s = u;
    return s;
  },

  // ---------------- 2. トレーニング中のくだけた言い方 ----------------
  sessionAction: function (text) {
    var dr = S.draft, norm = VoiceParser.normalizeNumbers(text), t = VoiceParser.norm(norm);
    var cur = currentIndex(), it = cur >= 0 ? dr.items[cur] : null;
    var hasNum = /\d/.test(t);

    // 「できた」「クリア」「終わった」→ 今のセットを予定どおりに記録（✓を押したのと同じ）
    if (!hasNum && /^(でき(た|ました|たよ)|クリア|完了|いけた|行けた|終わった|おわった|やった|やりました|(この)?セット(終わ|おわ|完了|でき|クリア))/.test(t) &&
        !/トレニング|練習|全部|ぜんぶ|今日|きょう/.test(t)) {
      if (!it) { reply(text, 'すべての種目が終わってるよ。「終わり」と言うと保存の画面に進むよ。'); return true; }
      voiceRecord(text, { type: 'record', exercise: null, weight: null, reps: null });
      return true;
    }

    // 「重くして」「2.5キロ上げて」「軽くして」→ このあとのセットの重さを変える
    var up = /重く|おもく|重さ(を)?(上げ|あげ|増や|ふや)|(キロ|kg)(上げ|あげ|増や|プラス)|^上げて|^あげて/.test(t);
    var down = /軽く|かるく|重さ(を)?(下げ|さげ|減ら|へら)|(キロ|kg)(下げ|さげ|減ら|マイナス)|^下げて|^さげて/.test(t);
    if ((up || down) && !/回/.test(t)) {
      if (!it) { reply(text, '今は重さを変える種目がないよ。', true); return true; }
      var d = (norm.match(/(\d+(?:\.\d+)?)\s*(キロ|kg)/i) || [])[1];   // 小数点が消えないよう、norm() する前の文から取る
      var step = d ? Number(d) : S.home.weightStep;
      var changed = null;
      it.sets.forEach(function (s, j) {
        if (s.done) return;
        var base = s.w !== '' ? Number(s.w) : (latestOf(it.name) && latestOf(it.name).max) || 0;
        s.w = Math.max(0, Math.round((base + (up ? step : -step)) * 10) / 10);
        if (changed === null) changed = s.w;
      });
      if (changed === null) { reply(text, it.name + 'のセットはもう全部終わってるよ。', true); return true; }
      saveDraft(); renderSession();
      reply(text, Talk.ok() + 'このあとの' + it.name + 'は' + changed + 'キロにしたよ。' + (up ? 'いいね、攻めていこう！' : 'フォームを大事にいこう。'));
      return true;
    }

    // 「10回にして」「回数を増やして」→ このあとのセットの回数を変える
    var toReps = t.match(/(\d+)回に(して|する|変え|かえ|しよ)?$/);   // 「10回にして」（「して」は clean で消えていることがある）
    var repsUp = /回数(を)?(増や|ふや|上げ|あげ)/.test(t), repsDown = /回数(を)?(減ら|へら|下げ|さげ)/.test(t);
    if (toReps || repsUp || repsDown) {
      if (!it) { reply(text, '今は回数を変える種目がないよ。', true); return true; }
      var newR = null;
      it.sets.forEach(function (s) {
        if (s.done) return;
        var r = Number(s.r) || (it.planned ? it.planned.reps : 0) || 0;
        s.r = toReps ? Number(toReps[1]) : Math.max(1, r + (repsUp ? 1 : -1));
        if (newR === null) newR = s.r;
      });
      if (newR === null) { reply(text, it.name + 'のセットはもう全部終わってるよ。', true); return true; }
      saveDraft(); renderSession();
      reply(text, Talk.ok() + 'このあとの' + it.name + 'は' + newR + '回にしたよ。');
      return true;
    }

    // 「セット追加」「セットを減らして」
    if (/セット(を)?(追加|ついか|増や|ふや)|セット数(を)?(増や|ふや)/.test(t)) {
      if (!it) { reply(text, '今はセットを増やす種目がないよ。', true); return true; }
      var last = it.sets[it.sets.length - 1];
      it.sets.push({ w: last.w, r: last.r, done: false }); saveDraft(); renderSession();
      reply(text, Talk.ok() + it.name + 'を1セット増やして、全部で' + it.sets.length + 'セットにしたよ。');
      return true;
    }
    if (/セット(を)?(減ら|へら|消し|けし|削除|なくし)|セット数(を)?(減ら|へら)/.test(t)) {
      if (!it) { reply(text, '今はセットを減らす種目がないよ。', true); return true; }
      if (it.sets.length <= 1 || it.sets[it.sets.length - 1].done) { reply(text, 'これ以上は減らせないよ。', true); return true; }
      it.sets.pop(); saveDraft(); renderSession();
      reply(text, Talk.ok() + it.name + 'を1セット減らして、全部で' + it.sets.length + 'セットにしたよ。');
      return true;
    }

    // 「休憩する」「ちょっと休む」→ レストタイマーを始める
    if (!Timer.handle && /(休憩|きゅうけい|レスト)(する|します|開始|始め|はじめ|スタト|入る|入ろ|しよ|取る|とる)|^(休む|やすむ|休もう|やすもう|休みたい|ひと休み|一休み)/.test(t)) {
      var sec = (t.match(/(\d+)秒/) || [])[1] || (t.match(/(\d+)分/) ? Number(t.match(/(\d+)分/)[1]) * 60 : 0) || (it && it.rest) || 60;
      Timer.start(Number(sec), '');
      reply(text, Talk.ok() + Number(sec) + '秒休もう。呼吸を整えてね。');
      return true;
    }
    return false;
  },

  // ---------------- 3. 質問への答え ----------------
  question: function (text) {
    var norm = VoiceParser.normalizeNumbers(text), t = VoiceParser.norm(norm), h = S.home, now = new Date();
    var ask = /何|なに|なん|いくつ|どれ|どう|だっけ|教えて|おしえて|知りたい|ある|いい$|[?？]/.test(norm + t);

    // 時間・日付
    if (/(今|いま)?(何時|なんじ)/.test(t) && !/(何時|なんじ)(から|に|まで)/.test(t)) {
      reply(text, '今は' + now.getHours() + '時' + now.getMinutes() + '分だよ。'); return true;
    }
    if (/(今日|きょう)(は|って)?(何日|なんにち|何曜|なんよう|何月|なんがつ)|(何日|なんにち)(だっけ|かな)/.test(t)) {
      reply(text, '今日は' + (now.getMonth() + 1) + '月' + now.getDate() + '日、' + '日月火水木金土'.charAt(now.getDay()) + '曜日だよ。'); return true;
    }

    // 今週あと何回？
    if (h.days.length && /今週(は)?(あと|残り|のこり)(何|なん)|あと(何|なん)回で(達成|全部|ぜんぶ|コンプ)|今週(の)?(残り|のこり)/.test(t)) {
      var left = h.days.filter(function (d) { return !h.doneDays[d.day]; });
      reply(text, left.length ? '今週はあと' + left.length + '回、' + left.map(function (d) { return Speech.dayText(d.day); }).join('と') + 'が残ってるよ。'
                              : '今週のメニューは全部できたよ。すごい！');
      return true;
    }

    // 「デイ2は何をやる？」「Day3の種目は？」
    var dm = t.match(/(?:デイ|でい|ディ|デ|day|d)(\d)(?:は|の|って)?(何|なに|種目|メニュ|内容|中身)/);
    if (dm && h.days.length) {
      var day = findDay(dm[1]);
      if (!day) { reply(text, 'デイ' + dm[1] + 'は今のメニューにないみたい。', true); return true; }
      reply(text, menuText(Speech.dayText(day.day), applySavedOrder(day.items, day.day)) + (h.doneDays[day.day] ? '今週はもうやったね。' : ''));
      return true;
    }

    if (S.view !== 'session' || !S.draft) return false;
    var dr = S.draft, cur = currentIndex(), it = cur >= 0 ? dr.items[cur] : null;

    // あと何セット？
    if (/(あと|残り|のこり)(何|なん)セット/.test(t)) {
      if (!it) { reply(text, 'すべての種目が終わってるよ。'); return true; }
      var n = it.sets.filter(function (s) { return !s.done; }).length;
      reply(text, it.name + 'はあと' + n + 'セットだよ。' + (n === 1 ? 'ラスト、がんばろう！' : ''));
      return true;
    }
    // 何分やった？
    if (/(何分|なんぷん|どのくらい|どれくらい)(たった|経った|やって|やった|経過|してる)|経過時間|(何分|なんぷん)(たつ|経つ)/.test(t)) {
      var min = Math.max(1, Math.round((Date.now() - new Date(dr.startedAt).getTime()) / 60000));
      var doneSets = dr.items.reduce(function (a, x) { return a + x.sets.filter(function (s) { return s.done; }).length; }, 0);
      reply(text, '始めてから' + min + '分、ここまで' + doneSets + 'セットやったよ。'); return true;
    }
    // 何キロでやればいい？
    if (/(何|なん)(キロ|kg)(で|に|を)?(やれば|すれば|する|やる|がいい|だっけ|にしよ|にする|いけば)|重さ(は)?(どう|どれ|何|なに|どのくらい|どれくらい)|(おすすめ|オススメ)の重さ|どの重さ/.test(t)) {
      if (!it) { reply(text, 'すべての種目が終わってるよ。'); return true; }
      reply(text, Chat.weightAdvice(it)); return true;
    }
    // 目標は？ 何回だっけ？
    if (/目標(は|って)?|(何|なん)回(だっけ|やる|やれば|する|すれば)/.test(t)) {
      if (!it) { reply(text, 'すべての種目が終わってるよ。'); return true; }
      reply(text, it.planned ? it.name + 'は' + it.planned.reps + '回を' + it.planned.sets + 'セットが目標だよ。' + (it.rir && it.rir !== '-' ? '余力は' + it.rir + '回残してね。' : '')
                             : it.name + 'はメニュー外の種目だから、決まった目標はないよ。');
      return true;
    }
    // 前回より伸びてる？
    if (/(前回|この前|このまえ|先週)より(重|伸|上|強|増|できて)|伸びて(る|いる|ます)|成長して|強くなって/.test(t)) {
      reply(text, Chat.progressText()); return true;
    }
    return false;
  },

  /** 重さのアドバイス（前回の記録から。前回が全部目標回数できていれば、刻み1つ分重くする） */
  weightAdvice: function (it) {
    var last = latestOf(it.name), step = S.home.weightStep;
    if (!last || !last.max) return it.name + 'は前回の記録がないから、軽めから始めて、フォームがくずれずに目標回数できる重さを探そう。';
    var max = Number(last.max), reps = it.planned ? Number(it.planned.reps) : 0;
    var sets = String(last.sets).split(',').map(function (x) { var m = x.trim().match(/×(\d+)$/); return m ? Number(m[1]) : 0; });
    var allDone = reps && sets.length && sets.every(function (r) { return r >= reps; });
    if (allDone) return '前回は' + max + 'キロで全部' + reps + '回できてるから、' + (Math.round((max + step) * 10) / 10) + 'キロに挑戦してみよう。きつければ' + max + 'キロでも大丈夫。';
    return '前回は' + max + 'キロだったね。まずは同じ' + max + 'キロで、' + (reps ? reps + '回' : '目標回数') + 'を全部できるのを目指そう。';
  },

  /** 前回と比べたひとこと（今日記録した最大重量と、前回の最大重量） */
  progressText: function () {
    var dr = S.draft, best = null;
    dr.items.forEach(function (it) {
      var last = latestOf(it.name);
      var todayMax = it.sets.filter(function (s) { return s.done && s.w !== ''; }).reduce(function (a, s) { return Math.max(a, Number(s.w)); }, -1);
      if (!last || !last.max || todayMax < 0) return;
      var diff = Math.round((todayMax - Number(last.max)) * 10) / 10;
      if (!best || diff > best.diff) best = { name: it.name, diff: diff, today: todayMax, last: Number(last.max) };
    });
    if (!best) return 'まだ比べられる記録がないよ。重さを入れてセットを記録すると、前回と比べられるよ。';
    if (best.diff > 0) return best.name + 'は前回の' + best.last + 'キロから' + best.today + 'キロへ、' + best.diff + 'キロ伸びてるよ。すごい！';
    if (best.diff === 0) return best.name + 'は前回と同じ' + best.today + 'キロだよ。回数が増えていれば、それも成長だよ。';
    return best.name + 'は前回より' + (-best.diff) + 'キロ軽めだね。調子に合わせるのも大事だよ。';
  },

  // ---------------- 4. 雑談・あいさつ ----------------
  // 返事の候補（{name} は選手の名前、{me} はコーチの一人称、{coach} はコーチの名前に置き換わる）
  TALK: {
    greet: ['こんにちは、{name}さん！今日もいっしょにがんばろう。', '{name}さん、やあ！調子はどう？'],
    morning: ['おはよう、{name}さん！朝からえらいね。', 'おはよう！今日もいい一日にしよう。'],
    evening: ['こんばんは、{name}さん。今日もおつかれさま。', 'こんばんは！無理せずいこうね。'],
    thanks: ['どういたしまして！', 'いつでも呼んでね。', 'どういたしまして。その調子でいこう！'],
    tired: ['おつかれさま。無理せず、できる範囲でいこう。', 'がんばってるね。水分もとってね。', 'ここまでよくやったよ。深呼吸してひと息つこう。'],
    hard: ['きついよね。でも、そのきつさが力になるよ。あと少し！', 'よくがんばってる！フォームだけは大事にね。', 'しんどいときは、レストを少し長めにとってもいいよ。'],
    sleepy: ['眠いときは集中が切れやすいから、ケガに気をつけてね。', 'ちゃんと寝るのもトレーニングのうちだよ。'],
    hungry: ['トレーニングのあとは、たんぱく質と炭水化物をとろうね。', 'お腹すいたね。終わったらしっかり食べよう！'],
    hot: ['暑いね。こまめに水分をとってね。', '暑いときは無理しないで、休憩を多めにしよう。'],
    cold: ['寒いね。ウォーミングアップをしっかりして、体を温めてからいこう。'],
    pain: ['痛みがあるときは無理しないで。その種目は休んで、続くようならトレーナーやスタッフに相談してね。'],
    lazy: ['そんな日もあるよ。まずは1種目だけやってみない？始めると気分が乗ってくるよ。', '今日は軽めでもいいよ。来たことがえらい！'],
    good: ['いいね！その調子で今日もいこう！', '絶好調だね。ケガにだけは気をつけてね。'],
    praise: ['{name}さん、毎回ちゃんと記録してて本当にえらいよ！', 'がんばってるの、ちゃんと見てるよ。すごいよ！'],
    compliment: ['えへへ、ありがとう！{name}さんもすごいよ。', 'うれしいな。もっとがんばっちゃうね。'],
    sorry: ['大丈夫だよ、気にしないで。', 'ぜんぜん平気！続けよう。'],
    bye: ['おつかれさま！しっかり休んでね。', 'またね、{name}さん。次も待ってるよ。'],
    call: ['はーい、どうしたの？', 'いるよ！なにかな？'],
    howareyou: ['{me}は元気だよ！{name}さんは調子どう？', 'ばっちりだよ。今日もいっしょにがんばろう！'],
    weather: ['ごめんね、天気は調べられないんだ。外で動くときは空を見て、無理しないでね。'],
    joke: ['筋トレのあとは、きんにくがキンキンに…なんてね。', 'スクワットしすぎて、足がもう「スク…ワット」しない…なんてね。'],
    laugh: ['えへへ。', '笑ってくれてうれしいな。'],
    ok: ['うん！', 'オッケー！'],
    who: ['{me}は{coach}。トレーニングの記録と案内のお手伝いをしてるよ。「何ができるの？」って聞いてみてね。']
  },

  /** 雑談の種類を見分ける。当てはまらなければ null */
  kind: function (text) {
    var t = VoiceParser.norm(text), hour = new Date().getHours();
    if (/^(おはよ)/.test(t)) return 'morning';
    if (/^(こんばんは|こんばんわ)/.test(t)) return 'evening';
    if (/^(こんにちは|こんにちわ|やあ|ハロ|hello|hi$|どうも$)/.test(t)) return hour >= 18 ? 'evening' : 'greet';
    if (/ありがと|サンキュ|thank|助かった|たすかった/.test(t)) return 'thanks';
    if (/痛い|いたい|痛む|いたむ|ケガ|けが|怪我|ひねった|つった/.test(t)) return 'pain';
    if (/きつい|キツい|しんどい|つらい|辛い|限界|もう無理|もうむり|死ぬ|しぬ/.test(t)) return S.view === 'session' ? 'hard' : 'tired';
    if (/疲れ|つかれ|ヘトヘト|へとへと|クタクタ|くたくた/.test(t)) return 'tired';
    if (/眠い|ねむい|眠た|ねむた/.test(t)) return 'sleepy';
    if (/お腹(すい|空い|へった|減った)|おなか(すい|空い|へった|減った)|腹減|はらへ/.test(t)) return 'hungry';
    if (/暑い|あつい/.test(t)) return 'hot';
    if (/寒い|さむい/.test(t)) return 'cold';
    if (/やる気(が)?(出|で|ない)|だるい|サボりたい|さぼりたい|行きたくない|やりたくない|めんどくさい|面倒/.test(t)) return 'lazy';
    if (/調子(が)?(いい|良い|よい)|絶好調|元気(だよ|です|いっぱい)/.test(t)) return 'good';
    if (/褒めて|ほめて|励まして|はげまして|応援して/.test(t)) return 'praise';
    if (/すごい|えらい|かわいい|可愛い|かっこいい|格好いい|好き|最高|天才|優しい|やさしい/.test(t)) return 'compliment';
    if (/^(ごめん|すみません|すいません|申し訳)/.test(t)) return 'sorry';
    if (/バイバイ|ばいばい|またね|おやすみ|さようなら|さよなら|じゃあね|お疲れ様でした|おつかれさまでした/.test(t)) return 'bye';
    if (/元気[?？]?$|調子(は|どう)|げんき[?？]?$|元気(ですか|かな)/.test(t)) return 'howareyou';
    if (/天気|てんき|雨|あめふ|晴れ/.test(t)) return 'weather';
    if (/ダジャレ|だじゃれ|冗談|面白い(こと|話)|おもしろい(こと|話)|笑わせて/.test(t)) return 'joke';
    if (/^(笑|ははは|あはは|ウケる|うける|草$|w+$)/.test(t)) return 'laugh';
    if (/(君|きみ|あなた)(は|の名前|だれ|誰)|名前は|誰(ですか|なの)|だれ(ですか|なの)/.test(t)) return 'who';
    if (/^(ねえ|おい|おーい|コチ|聞いてる|きいてる|いる[?？]?$)/.test(t)) return 'call';
    if (/^(わかった|分かった|了解|りょうかい|オッケ|ok|おけ)$/.test(t)) return 'ok';
    return null;
  },

  /** 雑談に返事をする。返事をしたら true */
  smallTalk: function (text) {
    var k = Chat.kind(text);
    if (!k) return false;
    var say = Talk.pick(Chat.TALK[k])
      .replace(/\{name\}/g, S.home ? S.home.name : '')
      .replace(/\{me\}/g, Avatar.me())
      .replace(/\{coach\}/g, Avatar.name());
    if (k === 'praise' || k === 'compliment' || k === 'good') Avatar.feedback('success', 1600);
    reply(text, say);
    return true;
  }
};
