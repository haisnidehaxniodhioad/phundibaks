/**
 * commands.js ― 音声での操作（Phase 2）
 * マイクボタンを押して話すと、voice.js で文を解析し、ここで画面の操作に変換する。
 * app.js の関数（startDay, renderSession, afterSetDone など）と状態 S を使う。
 *
 * 対応している話し方（例）:
 *   トレーニング中: 「スクワット60キロ8回」「60キロ8回」「懸垂10回」「次は？」「今の種目」「前回は？」
 *                   「レストあと何秒」「スキップ」「取り消し」「デッドリフト追加」「終わり」
 *   ホーム       : 「今日は何をする？」「デイ2を始める」
 *   終了画面     : 「保存」（v33：きつさは無くした）
 *   コンディション: 「全身3、上半身2、下半身4、動き7」「コメント 〜」「保存」「あとで」（condition.js）
 *   どの画面でも : 「ホームに戻って」「体組成レポートを開いて」「体重見せて」「InBodyにして」「体重の履歴」「閉じて」
 *                  「マイメニューは？」「（保存したメニューの名前）を始める」「新しいメニューを作る」「何ができるの？」（Phase 3f）
 *   返事は、画面の下のバー（dock.js）のアバター（avatar.js）が吹き出しと声で返す。
 * わからない言い方は「どの操作ですか？」と候補を出し、選ばれた答えを覚える（Chooser, Phase 2b）。
 */
var VoiceUI = {
  btn: document.getElementById('micBtn'),
  box: document.getElementById('voiceBox'),
  undo: [],          // 音声で記録した内容の取り消し用（新しいものが最後）
  hideHandle: null,

  init: function () {
    var self = this;
    this.btn.innerHTML = Icon('mic', 30);
    this.btn.addEventListener('click', function () {
      if (VoiceInput.active) { VoiceInput.stop(); return; }
      self.start();
    });
    // 画面が描き直されるたびに、マイクボタンの表示・非表示と話し方の例を更新する
    new MutationObserver(function () { self.update(); }).observe(document.getElementById('app'), { childList: true });
    this.update();
  },

  update: function () {
    // 新しいトレーニングを始めたら、取り消し用の履歴を空にする
    var draftId = S.draft ? S.draft.id : null;
    if (draftId !== this.draftId) { this.undo = []; this.draftId = draftId; }
    // v37：音声入力が使えないブラウザでもボタンは出す（押すと、文字で入力する欄が出る）
    var show = (!!S.home && ['home', 'session', 'finish', 'body', 'mymenu', 'history', 'afterSave', 'condition'].indexOf(S.view) >= 0 ||
                S.view === 'staff' && !!S.token);   // v35：スタッフ画面でも話しかけられる（staff_voice.js）
    this.btn.hidden = !show;
    // アバターの表示と置き場所は dock.js（画面の下のバー）が決める
    if (S.view === 'home') Avatar.greet();
    var picker = document.getElementById('avatarAppearancePicker');
    if (picker && ['home', 'history', 'body'].indexOf(S.view) < 0) picker.hidden = true;   // タブの無い画面では見た目の選択を閉じる
    document.body.classList.toggle('has-mic', show);
    if (!show) { this.box.hidden = true; return; }
    if (S.view === 'staff') { StaffVoice.helpCard(); return; }   // v35：スタッフ画面の「話し方の例」（staff_voice.js）
    if ((S.view === 'session' || S.view === 'home' || S.view === 'body' || S.view === 'history') && !document.getElementById('voiceHelp')) {
      var help = document.createElement('details');
      help.id = 'voiceHelp';
      help.className = 'card voice-help';
      help.innerHTML = '<summary>🎤 話し方の例</summary>' + (S.view === 'history' ? '「今週何回やった？」「今月は何回？」「前回のスクワットは？」「ホームに戻って」' : S.view === 'body' ? '「体重にして」「InBodyにして」「体重の履歴」「閉じて」「ホームに戻って」' : S.view === 'session'
        ? '記録：「スクワット60キロ8回」「60キロ8回」（今の種目）「懸垂10回」「同じ」「同じで7回」<br>案内：「次は？」→「それ先にやる」「その次は？」／「前回は？」→「それでできた」<br>' +
          '順番：「RDLから始める」「ベンチを最後にする」（今回だけ。いつもの順番は▲▼で）<br>' +
          'レスト：「あと何秒」「延長」「あと30秒」「スキップ」<br>そのほか：「取り消し」「もう一回言って」「デッドリフト追加」「終わり」'
        : '「今日は何をする？」「デイ2を始める」「記録を見せて」「今週何回やった？」「前回のスクワットは？」「体組成レポートを開いて」「体重見せて」「マイメニューは？」「（保存したメニューの名前）を始める」「新しいメニューを作る」') +
        '<br>自分のデータ：' + QA.TOPICS.filter(function (tp) { return tp.name !== '聞けることの一覧'; }).map(function (tp) { return '「' + tp.examples[0] + '」'; }).join('') + '（どの画面でも）' +
        '<br>「何ができるの？」と聞くと、その画面で話せることを教えてくれます。' +
        '<br>わからない言い方をされたときは、画面に操作の候補が出ます。選ぶと、次からはその言い方で動きます（チームで共有）。';
      document.getElementById('app').appendChild(help);
    }
  },

  start: function () {
    var self = this;
    this.typing = false;
    // v37：音声入力に対応していないブラウザ（Firefox など）では、文字で入力する欄を出す
    if (!VoiceInput.supported()) {
      this.typeBox('このブラウザは音声入力に対応していません（パソコンは Chrome・Edge、Mac は Safari・Chrome で使えます）。下の欄に文字で入れても、話したときと同じように動きます。');
      return;
    }
    // マイクボタンを押した瞬間（タップ中）に読み上げの準備をしておく。これをしないとiPhoneでは返事が自動で読み上げられない
    if (window.speechSynthesis && window.speechSynthesis.speaking && Speech.unlocked) Speech.stop();   // 読み上げ中なら止める（声をマイクが拾わないように）
    Speech.unlock();
    this.btn.classList.add('listening');
    Avatar.listen(true);
    this.btn.setAttribute('aria-label', '聞き取り中（押すと止まる）');
    this.show('聞き取り中…', '話し終わると自動で止まります');
    VoiceInput.listen({
      onInterim: function (t) { self.show(t, '聞き取り中…'); },
      onResult: function (t) {
        self.resetBtn();
        if (!t) { self.show('（聞き取れませんでした）', 'もう一度マイクを押して話してください', true); return; }
        handleVoice(t);
      },
      onError: function (code) {
        self.resetBtn();
        // v37：パソコンで使えないときの理由を、くわしく出す（直し方つき）。声が使えないときは文字で入れる欄も出す
        var msg = {
          'not-allowed': 'マイクが許可されていません。パソコンは、アドレスバーの左の鍵（またはマイク）のマークを押して「マイク」を「許可」にし、ページを再読み込みしてください。iPhoneは「設定」→「Safari」→「マイク」を許可にしてください。',
          'service-not-allowed': '音声入力が使えません。iPhoneは「設定」→「一般」→「キーボード」→「音声入力」をオンにしてください。パソコンは Chrome か Edge で開いてください。',
          'audio-capture': 'マイクが見つかりません。パソコンにマイク（イヤホンマイク・ヘッドセットなど）がつながっているか、Windowsは「設定」→「プライバシーとセキュリティ」→「マイク」でブラウザが使えるようになっているか、Macは「システム設定」→「プライバシーとセキュリティ」→「マイク」を確認してください。',
          'no-speech': '声が聞き取れませんでした。もう一度押して話してください。（パソコンでは、使うマイクがブラウザの設定で合っているかも確認してください）',
          'network': '聞き取りのサーバーにつながりませんでした。Chrome・Edgeの音声入力はインターネットを使います。学校や会社のネットワークでは止められていることがあります。',
          'language-not-supported': 'このブラウザでは日本語の音声入力が使えません。Chrome か Edge で開いてください。',
          'unsupported': 'このブラウザは音声入力に対応していません。'
        }[code] || ('音声入力でエラーが起きました（' + code + '）');
        if (code === 'aborted') return;
        if (code === 'no-speech') self.show('', msg, true);
        else self.typeBox(msg + '　下の欄に文字で入れても動きます。', true);
      }
    });
  },

  /**
   * 文字で入力する欄（v37）。音声入力が使えないとき・パソコンでキーボードを使いたいときに出す。
   * 入れた文は、話したときと同じように handleVoice で処理する。いったん出すと、返事のあとも欄を出し続ける（「閉じる」で消える）
   */
  typeBox: function (note, ng) {
    this.typing = true;
    clearTimeout(this.hideHandle);
    this.box.hidden = false;
    this.box.innerHTML = (note ? '<div class="reply' + (ng ? ' ng' : '') + '">' + esc(note) + '</div>' : '') + this.typeForm();
    if (ng && window.Avatar) Avatar.feedback('error', 1800);
    this.focusType();
  },
  typeForm: function () {
    return '<form class="type-form" data-typeform="1"><input class="type-input" type="text" enterkeyhint="send" autocomplete="off" placeholder="文字で入力（例：' +
      (S.view === 'staff' ? '今週やってないのは誰？' : '今日は何をする？') + '）"><button class="btn btn-pill" type="submit">送る</button>' +
      '<button class="btn ghost" type="button" data-typeclose="1">閉じる</button></form>';
  },
  focusType: function () {
    var el = this.box.querySelector('.type-input');
    if (el && !/iPhone|iPad|Android/i.test(navigator.userAgent)) el.focus();   // スマホでは勝手にキーボードを出さない
  },

  /** 返事の下に「何と判断したか」と「違う」ボタンを付ける */
  addBasis: function (text, basis, type) {
    if (this.box.hidden || this.box.querySelector('[data-remain]')) return;   // 残りのメニューを表示中は付けない
    this.lastText = text; this.lastType = type;
    var div = document.createElement('div');
    div.className = 'basis';
    div.innerHTML = '判断：' + esc(basis) + ' <button class="btn ghost basis-btn" data-choose="wrong">違う</button>';
    this.box.appendChild(div);
    var self = this;
    clearTimeout(this.hideHandle);   // 「違う」を押す時間を少し長めに取る
    this.hideHandle = setTimeout(function () { self.box.hidden = true; }, 10000);
  },

  /** マイクボタンを元の形（マイクの絵）に戻す */
  resetBtn: function () {
    this.btn.classList.remove('listening');
    this.btn.innerHTML = Icon('mic', 30);
    this.btn.setAttribute('aria-label', '話しかける');
    Avatar.listen(false);
  },

  /** 聞き取った文と返事を、マイクボタンの横に表示する（数秒後に自動で消える） */
  show: function (heard, reply, ng) {
    clearTimeout(this.hideHandle);
    if (ng && window.Avatar && typeof Avatar.feedback === 'function') Avatar.feedback('error', 1800);
    else if (reply && /どの操作|どの種目|選んでください|始めますか|始める？|ですか[。！!]?$/.test(reply) &&
             window.Avatar && typeof Avatar.feedback === 'function') Avatar.feedback('confirming', 1600);
    this.box.hidden = false;
    this.box.innerHTML = (heard ? '<div class="heard">🎤 ' + esc(heard) + '</div>' : '') +
      (reply ? '<div class="av-name">' + esc(Avatar.name()) + '</div><div class="reply' + (ng ? ' ng' : '') + '">' + esc(reply) + '</div>' : '');
    var self = this;
    // 文字で入力しているときは、入力欄を出したままにする（v37）
    if (this.typing) { this.box.insertAdjacentHTML('beforeend', this.typeForm()); this.focusType(); return; }
    if (!VoiceInput.active) this.hideHandle = setTimeout(function () { self.box.hidden = true; }, 6000);
  }
};

// ---------------- 「どの操作ですか？」（Phase 2b: 使いながら覚える） ----------------
var Chooser = {
  text: '', cmd: null,

  /** わからない言い方をされたとき、操作の候補をボタンで出す */
  openAction: function (text, near) {
    this.text = text; this.cmd = null;
    var opts = [];
    if (near) opts.push([near.action, near.value, 'もしかして：' + Chooser.label(near.action, near.value)]);
    if (S.view === 'session') {
      var nums = VoiceParser.extractNumbers(VoiceParser.normalizeNumbers(text));
      if (nums.weight !== null || nums.reps !== null) opts.push(['record', '', '今の種目に記録する']);
      opts.push(['next', '', '次の種目を聞く'], ['current', '', '今の種目を聞く'], ['previous', '', '前回の記録を聞く'],
                ['restLeft', '', 'レストの残り時間'], ['skipRest', '', 'レストを終える'], ['undo', '', '直前の記録を取り消す'],
                ['finish', '', '終了して保存へ']);
    } else if (S.view === 'home') {
      var first = S.home.suggestion.order[0];
      if (first) opts.push(['startSuggested', '', 'おすすめのDay（今日はDay' + first + '）を始める']);
      opts.push(['suggest', '', '今日のおすすめを聞く']);
      S.home.days.forEach(function (d) { opts.push(['startDay', String(d.day), 'Day' + d.day + (d.dayName ? '（' + d.dayName + '）' : '') + 'を始める']); });
    }
    // アプリの基本操作（どの画面でも）
    if (S.view === 'body') opts.push(['bodyTab', 'weight', '体重レポートにする'], ['bodyTab', 'inbody', 'InBodyレポートにする'], ['openHistory', '', '測定の履歴を開く']);
    else opts.push(['openBody', 'inbody', 'InBodyレポートを開く'], ['openBody', 'weight', '体重レポートを開く']);
    if (S.view !== 'history') opts.push(['openRecords', '', 'トレーニング記録を開く']);
    opts.push(['countTraining', 'week', '今週の回数を聞く']);
    if (S.view !== 'home') opts.push(['goHome', '', 'ホームに戻る']);
    if (S.view === 'home') opts.push(['myMenuList', '', '保存したメニューを聞く'], ['newMyMenu', '', '新しいメニューを作る'], ['startFree', '', '白紙から記録する']);
    opts.push(['help', '', '何ができるか聞く']);
    this.render('どの操作ですか？ 選ぶと、次からはこの言い方で動きます。', opts);
    if (window.Avatar && typeof Avatar.feedback === 'function') Avatar.feedback('confirming', 1600);
    Speech.speak(Talk.sorry() + 'わからなかった。画面からやりたいことを選んでね。次からは、その言い方で動くよ。');
  },

  /** 知らない種目名が出たとき、どの種目のことかを選んでもらう */
  openExercise: function (text, cmd) {
    this.text = text; this.cmd = cmd;
    var names = S.draft.items.map(function (it) { return it.name; });
    S.home.exercises.forEach(function (e) { if (names.indexOf(e.name) < 0) names.push(e.name); });
    var opts = S.draft.items.map(function (it) { return ['exercise', it.name, it.name]; });
    var html = '<select id="chooseEx" class="choose-select"><option value="">種目マスタから選ぶ…</option>' +
      names.filter(function (n) { return !S.draft.items.some(function (it) { return it.name === n; }); })
        .map(function (n) { return '<option>' + esc(n) + '</option>'; }).join('') + '</select>';
    opts.push(['newExercise', cmd.name, '新しい種目「' + cmd.name + '」として追加']);
    this.render('「' + cmd.name + '」はどの種目ですか？ 選ぶと呼び方として覚えます。', opts, html);
    Speech.speak(cmd.name + 'は、どの種目ですか。画面から選んでください。');
  },

  render: function (title, opts, extraHtml) {
    var box = VoiceUI.box;
    clearTimeout(VoiceUI.hideHandle);
    box.hidden = false;
    box.innerHTML = '<div class="heard">🎤 ' + esc(this.text) + '</div><div class="reply">' + esc(title) + '</div>' +
      '<div class="choose-list">' + opts.map(function (o) {
        return '<button class="btn sub choose-btn" data-choose="' + o[0] + '" data-value="' + esc(o[1]) + '">' + esc(o[2]) + '</button>';
      }).join('') + (extraHtml || '') +
      '<button class="btn ghost choose-btn" data-choose="none">どれでもない（覚えない）</button></div>';
  },

  close: function () { VoiceUI.box.hidden = true; },

  /** 操作の名前（「もしかして」の表示用） */
  label: function (action, value) {
    return { record: '今の種目に記録する', next: '次の種目を聞く', current: '今の種目を聞く', previous: '前回の記録を聞く',
             restLeft: 'レストの残り時間', skipRest: 'レストを終える', undo: '直前の記録を取り消す', finish: '終了して保存へ',
             suggest: '今日のおすすめを聞く', startSuggested: 'おすすめのDayを始める', startDay: 'Day' + value + 'を始める',
             goHome: 'ホームに戻る', openBody: (value === 'weight' ? '体重' : 'InBody') + 'レポートを開く', bodyTab: (value === 'weight' ? '体重' : 'InBody') + 'レポートにする',
             openHistory: '測定の履歴を開く', closePanel: '閉じる', myMenuList: '保存したメニューを聞く', newMyMenu: '新しいメニューを作る',
             startFree: '白紙から記録する', help: '何ができるか聞く', openRecords: 'トレーニング記録を開く',
             countTraining: (value === 'month' ? '今月' : value === 'year' ? '今年度' : '今週') + 'の回数を聞く' }[action] || action;
  },

  /** 選ばれた操作を実行し、言い回しを覚える */
  pick: function (action, value) {
    var text = this.text, view = S.view;
    if (action === 'none') { this.close(); return; }
    if (action === 'wrong') {   // 判断が違っていた → 記録だったら取り消してから、正しい操作を選んでもらう
      var t = VoiceUI.lastText, type = VoiceUI.lastType;
      if (type === 'record' && VoiceUI.undo.length) {
        var u = VoiceUI.undo.pop(), dr = S.draft;
        if (u.addedItem) dr.items.splice(u.i, 1);
        else if (u.addedSet) dr.items[u.i].sets.splice(u.j, 1);
        else { var st = dr.items[u.i].sets[u.j]; st.w = u.before.w; st.r = u.before.r; st.done = u.before.done; st.via = u.before.via; }
        Timer.stop(); saveDraft(); renderSession();
      }
      return this.openAction(t);
    }
    this.close();
    if (action === 'exercise' || action === 'newExercise') return this.pickExercise(value, action === 'newExercise');

    var phrase = VoiceParser.phraseKey(text);
    var isNav = NAV_ACTIONS.indexOf(action) >= 0;
    if (isNav) view = 'all';   // アプリの基本操作は、どの画面で言っても同じ操作として覚える
    // 「Day3を始める」を数字の入っていない言い方で覚えると、全員がいつもDay3になってしまうので覚えない
    var learnable = !(action === 'startDay' && phrase.indexOf('#') < 0);
    if (phrase.length >= 2 && learnable) {
      S.home.phrases = (S.home.phrases || []).filter(function (p) { return !(p.phrase === phrase && p.view === view); });
      S.home.phrases.push({ phrase: phrase, action: action, value: value, view: view });
      Api.call('learnPhrase', { token: S.token, phrase: phrase, op: action, value: value, view: view })
        .catch(function () { /* 覚えられなくても操作自体は続ける */ });
    }
    var cmd = learnedToCmd({ action: action, value: value }, text);
    if (isNav) doNav(text, cmd); else if (view === 'session') voiceInSession(text, cmd); else voiceInHome(text, cmd);
  },

  /** 知らない種目名を、既存の種目の呼び方として覚える（または新しい種目として追加する） */
  pickExercise: function (name, isNew) {
    var alias = this.cmd.name, cmd = this.cmd, text = this.text;
    var known = findExercise(name);
    if (known) {
      if (known.aliases.indexOf(alias) < 0) known.aliases = known.aliases ? known.aliases + '、' + alias : alias;
    } else {
      S.home.exercises.push({ id: '', name: name, aliases: isNew ? '' : alias, category: '', part: '' });
    }
    Api.call('learnAlias', { token: S.token, alias: alias, exercise: name, create: isNew || !known })
      .catch(function () { /* 覚えられなくても記録は続ける */ });
    voiceRecord(text, { type: 'record', exercise: name, weight: cmd.weight, reps: cmd.reps });
  }
};

// 文字で入力（v37）：送る・閉じる、画面の下のバーの「⌨ 文字で」ボタン
VoiceUI.box.addEventListener('submit', function (e) {
  var f = e.target.closest('[data-typeform]');
  if (!f) return;
  e.preventDefault();
  var input = f.querySelector('.type-input'), text = input ? input.value.trim() : '';
  if (!text) return;
  Speech.unlock();
  handleVoice(text);
});
document.addEventListener('click', function (e) {
  if (e.target.closest('[data-typeclose]')) { VoiceUI.typing = false; VoiceUI.box.hidden = true; return; }
  if (e.target.closest('[data-typevoice]')) VoiceUI.typeBox('');
});

VoiceUI.box.addEventListener('click', function (e) {
  var b = e.target.closest('[data-choose]');
  if (b) Chooser.pick(b.dataset.choose, b.dataset.value || '');
});
VoiceUI.box.addEventListener('change', function (e) {
  if (e.target.id === 'chooseEx' && e.target.value) Chooser.pick('exercise', e.target.value);
});

/** 返事を画面に出して、読み上げる */
function reply(heard, text, ng) {
  if (ng && window.Avatar && typeof Avatar.feedback === 'function') Avatar.feedback('error', 1800);
  else if (/どの操作|どの種目|選んでください|始めますか|始める？/.test(text) &&
           window.Avatar && typeof Avatar.feedback === 'function') Avatar.feedback('confirming', 1600);
  VoiceUI.show(heard, text, ng);
  Speech.speak(text);
  VoiceUI.lastReply = text;
}

/** 種目名の候補（トレーニング中の種目 ＋ 種目マスタ） */
function voiceCandidates() {
  var list = (S.home && S.home.exercises || []).map(function (e) {
    return { name: e.name, aliases: e.aliases ? e.aliases.split(/[、,，\/]/) : [] };
  });
  if (S.draft) S.draft.items.forEach(function (it) {
    if (!list.some(function (c) { return c.name === it.name; })) list.push({ name: it.name, aliases: [] });
  });
  return list;
}

/** 聞き取った文を処理する */
function handleVoice(text) {
  // v22：「えっと」「〜してください」などを取り除いてから読み取る（chat.js）
  text = Chat.clean(text);
  // v35：スタッフ画面は、スタッフ用の操作と質問へ（staff_voice.js・staff_qa.js）
  if (S.view === 'staff') return StaffVoice.handle(text);
  // ★ アプリの基本操作（どの画面でも。Phase 3f）: 覚えた言い方 → 決まった言い方 の順
  var navLearned = VoiceParser.matchLearned(text, S.home.phrases, S.view);
  if (navLearned && navLearned.exact && NAV_ACTIONS.indexOf(navLearned.exact.action) >= 0) return doNav(text, learnedToCmd(navLearned.exact, text));
  if (S.view === 'finish' && /マイメニュ|メニュ(として|に)保存/.test(VoiceParser.norm(text))) return MyMenu.voiceSaveFromFinish(text);
  // v33：コンディションの記録（「コンディションを記録」はどの画面でも。入力の画面では数字・コメント・保存）（condition.js）
  if (Condition.voice(text)) return;
  if (S.view === 'afterSave' || S.view === 'condition') {
    if (QA.handle(text)) return;
    if (smallTalk(text)) return;
    return reply(text, S.view === 'afterSave' ? '「記録する」か「あとで」って言ってね。' : '「全身3、上半身2、下半身4、動き7」みたいに話してね。保存は「保存」だよ。', true);
  }
  // v31：自分のデータの質問（「体重は？」「スクワットの最高は？」「FFMIは何位？」など）。どの画面でも答える（qa.js）
  if (QA.handle(text)) return;
  var nav = VoiceParser.parseNav(text, S.home.myMenus);
  if (nav && !(S.view === 'finish' && nav.type === 'closePanel')) return doNav(text, nav);
  if (S.view === 'finish') return voiceInFinish(text, VoiceParser.parse(text, { candidates: voiceCandidates() }));
  if (S.view === 'body' || S.view === 'mymenu' || S.view === 'history') {   // レポート・メニュー作成・記録の画面は、基本操作とちょっとした会話だけ
    if (smallTalk(text)) return;
    if (S.view === 'history' && askPrevious(text)) return;
    if (Chat.question(text)) return;   // 「今何時？」「今週あと何回？」など（chat.js）
    return Chooser.openAction(text, navLearned && navLearned.near);
  }
  if (S.view !== 'session' && S.view !== 'home') return;
  // 0. 直前に「Day2を始めますか？」と提案していれば、その返事として受け取る
  if (answerOffer(text)) return;
  if (S.view === 'session' && answerSession(text)) return;
  // v22：くだけた言い方（「できた」「重くして」「休憩する」）と質問（「何キロでやればいい？」「あと何セット？」）（chat.js）
  if (S.view === 'session' && Chat.sessionAction(text)) return;
  if (Chat.question(text)) return;

  // 1. 覚えた言い方と完全に同じなら、それを最優先で実行する（決まった言い方の誤判定も、教え直せば直る）
  var learned = VoiceParser.matchLearned(text, S.home.phrases, S.view);
  var cmd, basis;
  if (learned && learned.exact) {
    cmd = learnedToCmd(learned.exact, text);
    basis = '覚えた言い方「' + learned.exact.phrase + '」';
  } else {
    // 2. 決まった言い方（ルール）
    cmd = VoiceParser.parse(text, { candidates: voiceCandidates() });
    basis = '決まった言い方';
    // 3. わからなければ「どの操作ですか？」。よく似た覚えた言い方があれば「もしかして」として先頭に出す（勝手には実行しない）
    if (cmd.type === 'unknown') { if (smallTalk(text)) return; return Chooser.openAction(text, learned && learned.near); }
  }
  if (cmd.type === 'unknownExercise' && S.view === 'session') return Chooser.openExercise(text, cmd);

  var viewBefore = S.view;
  if (S.view === 'session') voiceInSession(text, cmd); else voiceInHome(text, cmd);
  // 何と判断したかを表示し、違っていたら「違う」で直せるようにする（画面が切り替わる操作は除く）
  if (S.view === viewBefore) VoiceUI.addBasis(text, basis, cmd.type);
}

/** 覚えた言い回しを、操作の指示に変換する */
function learnedToCmd(p, text) {
  var norm = VoiceParser.normalizeNumbers(text);
  var nums = VoiceParser.extractNumbers(norm);
  var dayInText = norm.match(/\d/);   // 「#を始めたい」のように数字入りで覚えた場合は、話した数字のDayにする
  if (NAV_ACTIONS.indexOf(p.action) >= 0) return { type: p.action, tab: p.value || '', learned: true };
  return { type: p.action, day: p.action === 'startDay' && dayInText ? Number(dayInText[0]) : (Number(p.value) || null), exercise: p.action === 'record' ? (p.value || null) : null,
           weight: nums.weight, reps: nums.reps, learned: true };
}

// ---------------- ホーム ----------------
function voiceInHome(text, cmd) {
  var h = S.home;
  if (cmd.type === 'startSuggested') {
    if (h.suggestion.order.length) { VoiceUI.show(text, 'Day' + h.suggestion.order[0] + 'を始めます'); startDay(h.suggestion.order[0]); }
    else reply(text, h.suggestion.reason, true);
  } else if (cmd.type === 'startDay') {
    if (findDay(cmd.day)) { VoiceUI.show(text, 'Day' + cmd.day + 'を始めます'); startDay(cmd.day); }
    else reply(text, 'Day' + cmd.day + 'はメニューにありません。', true);
  } else if (cmd.type === 'suggest' || cmd.type === 'current' || cmd.type === 'next' || cmd.type === 'remainingList') {   // 「今日のメニューは？」も、おすすめのDayと種目の一覧を答える
    if (!h.suggestion.order.length) return reply(text, h.suggestion.reason);
    offerDay(text, h.suggestion.order[0], suggestText());
  } else if (cmd.type === 'previous') {
    if (!askPrevious(text)) reply(text, 'どの種目の前回の記録かな？「前回のスクワットは？」のように聞いてね。', true);
  } else if (cmd.type === 'record') {
    reply(text, '先にDayか自分のメニューを始めてね。始めたら記録できるよ。', true);
  } else {
    reply(text, Talk.sorry() + 'うまく聞き取れなかった。「今日は何をする？」「デイ2を始める」のように話してね。', true);
  }
}

// ---------------- 会話の流れ（提案 → 「それにしよう」で開始） ----------------
/**
 * Dayを提案して、「はい」「それにしよう」などの返事を待つ。
 * 90秒以内に肯定の返事があれば提案したDayを始め、「他は？」なら次のおすすめを提案する。
 */
var Offer = { day: null, until: 0 };

function offerDay(text, day, intro) {
  var d = findDay(day);
  Offer.day = day; Offer.until = Date.now() + 90000;
  var say = (intro ? intro : 'Day' + day + (d && d.dayName ? '（' + d.dayName + '）' : '') + 'はどうですか。' + (d ? menuText('Day' + day, applySavedOrder(d.items, d.day)) : '')) +
            'デイ' + day + 'を始める？「はい」で始めるよ。';
  VoiceUI.show(text, say);
  Speech.speak(say.replace(/Day(\d)/g, 'デイ$1'));   // 「Day」は読み上げで「デイ」と読ませる
  // タップでも選べるようにボタンを出す
  VoiceUI.box.insertAdjacentHTML('beforeend', '<div class="choose-list">' +
    '<button class="btn choose-btn" data-offer="yes">Day' + day + 'を始める</button>' +
    '<button class="btn sub choose-btn" data-offer="other">ほかのDayにする</button></div>');
  clearTimeout(VoiceUI.hideHandle);
}

/** 提案への返事として扱えるか。扱えたらtrue */
function answerOffer(text) {
  if (S.view !== 'home' || !Offer.day || Date.now() > Offer.until) return false;
  var t = VoiceParser.norm(VoiceParser.normalizeNumbers(text));
  var no = /いいえ|いや|違う|ちがう|他|ほか|別|べつ|やめ|やだ|嫌|変え|かえ/.test(t);
  // 「やる気が出ない」「やりたくない」などは「はい」とみなさない（v22）
  var yes = !/やる気|たくない|ない$/.test(t) && /^(はい|うん|ええ|お願い|おねがい|オケ|オッケ|ok|いいよ|いいね|いい|それ|そうする|そうしよ|そうしま|やる|やろ|やります|始め|はじめ|スタト|行こ|いこ|頼む|たのむ|よろしく|了解|りょうかい)/.test(t) ||
            /それ(を|で|に)?(しよ|する|やる|やろ|始め|はじめ|お願い|おねがい|いこ|行こ)/.test(t);
  if (no) { offerNext(text); return true; }
  if (yes) { var day = Offer.day; Offer.day = null; VoiceUI.show(text, 'Day' + day + 'を始めます'); startDay(day); return true; }
  return false;
}

/** 今提案しているDayの次のおすすめを提案する */
function offerNext(text) {
  var order = S.home.suggestion.order, i = order.indexOf(Offer.day);
  var next = order[(i + 1) % order.length];
  if (!next || next === Offer.day) { Offer.day = null; return reply(text, '今週ほかに残っているDayはないよ。'); }
  offerDay(text, next, null);
}

VoiceUI.box.addEventListener('click', function (e) {
  var b = e.target.closest('[data-offer]');
  if (!b) return;
  if (b.dataset.offer === 'yes' && Offer.day) { var day = Offer.day; Offer.day = null; VoiceUI.box.hidden = true; startDay(day); }
  else if (b.dataset.offer === 'other') offerNext('');
});

// ---------------- 会話の流れ（トレーニング中） ----------------
/**
 * 直前のやりとりを2分間だけ覚えておき、続けて言われた短い返事をその流れで受け取る。
 *   「次は？」→「それ先にやる」   … 言われた種目を今の種目にする（順番を入れ替える）
 *   「次は？」→「その次は？」     … さらに次の種目を読み上げる
 *   「前回は？」→「それでできた」 … 前回と同じ重量・回数で記録する
 * 次の3つは、流れに関係なくいつでも使える。
 *   「同じ」「もう1セット」「同じで7回」 … 直前のセットと同じ重量（回数）で次のセットを記録する
 *   「延長」「あと30秒」                 … レストを延ばす（数字が無ければ30秒）
 *   「もう一回言って」                   … 直前の返事をもう一度読み上げる
 */
var Ctx = { type: null, data: null, until: 0 };
function setCtx(type, data) { Ctx.type = type; Ctx.data = data; Ctx.until = Date.now() + 120000; }
function ctxIs(type) { return Ctx.type === type && Date.now() < Ctx.until; }

var YES_RE = /^(はい|うん|ええ|お願い|おねがい|オケ|オッケ|ok|いいよ|いいね|そうする|そうしよ|やる(?!気)|やろ|やります|了解|りょうかい)/;
var GO_RE = /(それ|そっち|そちら|そいつ)(を|から|に)?(先|さき)?(に)?(やる|やろ|する|しよ|いく|いこ|行く|行こ|始め|はじめ)|先に(やる|やろ|する|しよ|いく|行く)/;
var SAME_RE = /^(同じ|おなじ|同様|さっきと同じ|前と同じ|それと同じ|もう1セット|もういっちょ|もう1回|もういっかい|もう一回)|同じ(で|重さ|重量|回数|く)/;

function answerSession(text) {
  var norm = VoiceParser.normalizeNumbers(text), t = VoiceParser.norm(norm), dr = S.draft;

  // もう一回言って
  if (/(もう(1回|いっかい|1度|いちど)|もっかい)(言|いって|読|よんで|教|おしえて)/.test(t)) {
    if (VoiceUI.lastReply) reply(text, VoiceUI.lastReply); else reply(text, 'まだ何も話してないよ。', true);
    return true;
  }

  // レスト延長
  if (Timer.handle && (/延長|もう少し休|もうちょっと休|休憩追加|レスト追加/.test(t) || /^あと\d+秒$/.test(t) || /^\d+秒(追加|延長|プラス)/.test(t))) {
    var sec = (t.match(/(\d+)秒/) || [])[1];
    sec = sec ? Number(sec) : 30;
    Timer.addSeconds(sec);
    reply(text, 'オッケー、' + sec + '秒延ばしたよ。あと' + Timer.left + '秒。');
    return true;
  }

  // 「スクワットから始める」「スクワットを先にやる」「ベンチを最後にする」（種目名を言って順番を変える。今回だけ）
  var named = VoiceParser.findExercise(text, dr.items.map(function (it) { return { name: it.name, aliases: aliasesOf(it.name) }; }));
  if (named && /(から|を?先に|を?さきに|を?最初に)(やる|やろ|する|しよ|始め|はじめ|いく|いこ|行く|行こ)/.test(t)) {
    moveToCurrent(dr.items.map(function (it) { return it.name; }).indexOf(named));
    reply(text, named + 'からやります。' + Speech.exerciseText(dr.items[currentIndex()], latestOf(named)));
    return true;
  }
  if (named && /を?(最後|さいご|後回し|あとまわし)(に|で)/.test(t)) {
    var from = dr.items.map(function (it) { return it.name; }).indexOf(named);
    dr.items.push(dr.items.splice(from, 1)[0]);
    VoiceUI.undo = []; saveDraft(); renderSession();
    reply(text, named + 'を最後にしました。');
    return true;
  }

  // 残りのメニューを出した直後の「RDLにする」「RDLで」「RDL」
  if (ctxIs('remaining') && named && Ctx.data.names.indexOf(named) >= 0 &&
      (t.length <= 12 && !/\d/.test(t))) {
    var firstPick = Ctx.data.mode === 'start';
    Ctx.type = null;
    var ri = dr.items.map(function (it) { return it.name; }).indexOf(named);
    if (ri > currentIndex()) moveToCurrent(ri);
    VoiceUI.box.hidden = true;
    reply(text, (firstPick ? 'オッケー、最初は' : '次は') + Speech.exerciseText(dr.items[currentIndex()], latestOf(named)));
    return true;
  }

  // 「次は？」の流れ
  if (ctxIs('next')) {
    var target = Ctx.data.index;
    if (/その次|次の次|そのあと|その後/.test(t)) {
      var after = target + 1;
      if (after >= dr.items.length) { reply(text, dr.items[target].name + 'が最後の種目です。'); return true; }
      setCtx('next', { index: after });
      reply(text, 'その次は' + Speech.exerciseText(dr.items[after], latestOf(dr.items[after].name)));
      return true;
    }
    if (GO_RE.test(t) || (YES_RE.test(t) && t.length <= 8)) {
      Ctx.type = null;
      var name = dr.items[target] && dr.items[target].name;
      if (!name) return false;
      moveToCurrent(target);
      reply(text, name + 'を先にやります。' + Speech.exerciseText(dr.items[currentIndex()], latestOf(name)));
      return true;
    }
  }

  // 「前回は？」の流れ →「それでできた」「同じで」
  if (ctxIs('previous') && (SAME_RE.test(t) || /^それ(で|と同じ)/.test(t))) {
    var p = Ctx.data, nums = VoiceParser.extractNumbers(norm);
    Ctx.type = null;
    voiceRecord(text, { type: 'record', exercise: p.name, weight: nums.weight !== null ? nums.weight : (p.w === '' ? null : p.w),
                        reps: nums.reps !== null ? nums.reps : p.r });
    return true;
  }

  // 「同じ」「もう1セット」「同じで7回」
  if (SAME_RE.test(t)) {
    var src = lastDoneSet();
    if (!src) { reply(text, 'まだ記録したセットがないよ。「60キロ8回」みたいに言ってね。', true); return true; }
    var n2 = VoiceParser.extractNumbers(norm);
    voiceRecord(text, { type: 'record', exercise: src.name, weight: n2.weight !== null ? n2.weight : (src.w === '' ? null : src.w),
                        reps: n2.reps !== null ? n2.reps : src.r });
    return true;
  }
  return false;
}

/** 種目マスタにある呼び方の候補 */
function aliasesOf(name) {
  var ex = (S.home.exercises || []).filter(function (e) { return e.name === name; })[0];
  return ex && ex.aliases ? ex.aliases.split(/[、,，\/]/) : [];
}

/** 今の種目（まだ終わっていなければ）か、直前に記録した種目の、最後に終わったセット */
function lastDoneSet() {
  var dr = S.draft, order = [];
  var cur = currentIndex();
  if (cur >= 0) order.push(cur);
  var u = VoiceUI.undo[VoiceUI.undo.length - 1];
  if (u && !u.addedItem && order.indexOf(u.i) < 0) order.push(u.i);
  for (var k = 0; k < order.length; k++) {
    var it = dr.items[order[k]], done = it.sets.filter(function (x) { return x.done; });
    if (done.length) { var last = done[done.length - 1]; return { name: it.name, w: last.w, r: last.r }; }
  }
  return null;
}

/** i番目の種目を「今の種目」の位置に移す（順番を入れ替える） */
function moveToCurrent(i) {
  var dr = S.draft, cur = currentIndex();
  if (cur < 0 || i <= cur) return;
  var item = dr.items.splice(i, 1)[0];
  dr.items.splice(cur, 0, item);
  VoiceUI.undo = [];   // 並びが変わったので、取り消し用の履歴は使えなくなる
  saveDraft(); renderSession();
}

// ---------------- 残りのメニュー（種目が終わるたびに表示） ----------------
/**
 * 残りの種目をボタンで出す。押した種目を次にやる（今回だけ順番を入れ替える）。
 * mode: 'start' … トレーニングを始めたとき（どれから始めるか） / 'next' … 種目が終わったとき / 'last' … 残り1種目
 */
function showRemaining(remaining, mode) {
  mode = mode || 'next';
  setCtx('remaining', { names: remaining.map(function (r) { return r.name; }), mode: mode });
  clearTimeout(VoiceUI.hideHandle);
  VoiceUI.box.hidden = false;
  var title = mode === 'start' ? 'どの種目から始めますか？（' + remaining.length + '種目）' : '残りのメニュー（' + remaining.length + '種目）';
  var lead = mode === 'last' ? '最後の種目です。' : 'やる種目を選んでください。選ばなければ上から順に進みます。';
  VoiceUI.box.innerHTML = '<div class="heard">' + esc(title) + '</div>' +
    '<div class="reply">' + esc(lead) + '</div><div class="choose-list">' +
    remaining.map(function (r) {
      return '<button class="btn sub choose-btn" data-remain="' + esc(r.name) + '">' + esc(r.name) + '</button>';
    }).join('') + '<button class="btn ghost choose-btn" data-remain="">' + (mode === 'last' ? '閉じる' : 'このままの順番で') + '</button></div>';
  // 何も選ばなければ閉じる（画面の下の方を隠し続けないように）。始めるときは少し長めに出しておく
  VoiceUI.hideHandle = setTimeout(function () { if (VoiceUI.box.querySelector('[data-remain]')) VoiceUI.box.hidden = true; }, mode === 'start' ? 40000 : 25000);
}

/** 残りの種目を読み上げる文 */
function remainingText() {
  var rem = remainingItems(), cur = currentIndex();
  if (!rem.length) return 'すべての種目が終わっています。「終わり」と言うと保存の画面に進みます。';
  // 今の種目をやっている途中なら、それを除いた残りを伝える
  var started = cur >= 0 && S.draft.items[cur].sets.some(function (x) { return x.done; });
  var names = rem.filter(function (r) { return !(started && r.index === cur); }).map(function (r) { return r.name; });
  var head = started ? '今は' + S.draft.items[cur].name + 'の途中です。' : '';
  if (!names.length) return head + 'これが最後の種目です。';
  return head + (started ? 'そのあとの' : '') + (names.length > 1 ? '残りは、' + names.join('、') + 'の' + names.length + '種目です。' + (started ? '' : '次はどれにしますか？') : '残りは' + names[0] + 'だけです。');
}

// 残りのメニューを表示中に画面のほかの場所を触ったら閉じる（そのままの順番で続ける）
document.addEventListener('pointerdown', function (e) {
  if (!VoiceUI.box.hidden && VoiceUI.box.querySelector('[data-remain]') &&
      !VoiceUI.box.contains(e.target) && !VoiceUI.btn.contains(e.target)) VoiceUI.box.hidden = true;
}, true);

VoiceUI.box.addEventListener('click', function (e) {
  var b = e.target.closest('[data-remain]');
  if (!b) return;
  VoiceUI.box.hidden = true;
  var name = b.dataset.remain;
  if (!name) return;
  var idx = S.draft.items.map(function (it) { return it.name; }).indexOf(name);
  var isStart = Ctx.data && Ctx.data.mode === 'start';
  if (idx > currentIndex()) moveToCurrent(idx);
  Ctx.type = null;
  Speech.speak((isStart ? '最初は' : '次は') + Speech.exerciseText(S.draft.items[currentIndex()], latestOf(name)));
});

// ---------------- トレーニング中 ----------------
function voiceInSession(text, cmd) {
  var dr = S.draft, cur = currentIndex();
  switch (cmd.type) {
    case 'record': return voiceRecord(text, cmd);
    case 'unknownExercise':
      return reply(text, '「' + cmd.name + '」という種目が見つかりません。メニュー外の種目なら「' + cmd.name + '追加」と言ってから記録してください。', true);
    case 'remainingList':   // 「残りの種目は？」
      var rem = remainingItems();
      reply(text, remainingText());
      var notStarted = !(cur >= 0 && dr.items[cur].sets.some(function (x) { return x.done; }));
      if (rem.length > 1 && notStarted) showRemaining(rem, 'next');   // まだ始めていなければ、次にやる種目を選べるようにする
      return;
    case 'next':
      var nx = cur < 0 ? -1 : cur + 1;
      if (nx > 0 && nx < dr.items.length) setCtx('next', { index: nx });   // 「それ先にやる」「その次は？」に備える
      return reply(text, nx > 0 && nx < dr.items.length ? '順番どおりなら、次は' + Speech.exerciseText(dr.items[nx], latestOf(dr.items[nx].name)) :
        (cur >= 0 ? '今の' + dr.items[cur].name + 'が最後の種目です。' : 'すべての種目が終わっています。「終わり」と言うと保存の画面に進みます。'));
    case 'current':
      return reply(text, cur < 0 ? 'すべての種目が終わっています。' :
        dr.items[cur].name + '、' + (dr.items[cur].sets.filter(function (s) { return s.done; }).length + 1) + 'セット目です。' +
        Speech.exerciseText(dr.items[cur], latestOf(dr.items[cur].name), true));   // 「今の種目」は全部読む
    case 'previous':
      var name = cmd.exercise || (cur >= 0 ? dr.items[cur].name : '');
      var last = name ? latestOf(name) : null;
      if (last) {   // 「それで（同じで）できた」に備えて、前回の1セット目を覚えておく
        var pm = last.sets.split(',')[0].trim().match(/^(?:([\d.]+)kg)?×(\d+)$/);
        if (pm) setCtx('previous', { name: name, w: pm[1] ? Number(pm[1]) : '', r: Number(pm[2]) });
      }
      return reply(text, last ? name + 'の前回は、' + last.date.slice(5).replace('-', '月') + '日、' +
        last.sets.replace(/kg/g, 'キロ').replace(/×/g, 'で') + '回でした。' : (name || 'この種目') + 'の前回の記録はありません。');
    case 'restLeft':
      return reply(text, Timer.handle ? 'レストはあと' + Timer.left + '秒だよ。' : '今はレスト中じゃないよ。');
    case 'skipRest':
      Timer.stop(); return reply(text, 'オッケー、レスト終わり！');
    case 'undo': return voiceUndo(text);
    case 'add':
      var ex = findExercise(cmd.exercise);
      dr.items.push(makeItem({ name: ex ? ex.name : cmd.exercise, category: ex ? ex.category : '' }, false));
      saveDraft(); renderSession();
      VoiceUI.undo.push({ addedItem: true, i: dr.items.length - 1 });
      return reply(text, (ex ? ex.name : cmd.exercise) + 'を追加しました。重量と回数を話すと記録します。');
    case 'finish':
      Timer.stop(); renderFinish();
      return reply(text, 'おつかれさま！「保存」って言うと保存するよ。');
    case 'startDay': case 'suggest':
      return reply(text, '今は' + dr.title + 'の途中です。別のDayを始めるときは、ホームに戻ってください。', true);
    default:
      return reply(text, '聞き取れませんでした。「スクワット60キロ8回」「次は？」のように話してください。', true);
  }
}

/** 重量・回数を記録する */
function voiceRecord(text, cmd) {
  var dr = S.draft, i = -1, addedItem = false;
  if (cmd.exercise) {
    i = dr.items.map(function (it) { return it.name; }).indexOf(cmd.exercise);
    if (i < 0) {   // 種目マスタにあるがメニューにない種目 → メニュー外として追加
      var ex = findExercise(cmd.exercise);
      dr.items.push(makeItem({ name: cmd.exercise, category: ex ? ex.category : '' }, false));
      i = dr.items.length - 1; addedItem = true;
    }
  } else {
    i = currentIndex();
    if (i < 0) return reply(text, '全部の種目が終わってるよ。どの種目か、名前も言ってね。', true);
  }
  var it = dr.items[i];
  var j = -1;
  for (var k = 0; k < it.sets.length; k++) if (!it.sets[k].done) { j = k; break; }
  var addedSet = false;
  if (j < 0) {   // 予定のセットが全部終わっていれば、セットを1つ増やす
    var lastSet = it.sets[it.sets.length - 1];
    it.sets.push({ w: lastSet.w, r: lastSet.r, done: false });
    j = it.sets.length - 1; addedSet = true;
  }
  var s = it.sets[j];
  var before = { w: s.w, r: s.r, done: s.done, via: s.via };
  if (cmd.weight !== null) s.w = cmd.weight;
  if (cmd.reps !== null) s.r = cmd.reps;
  if (s.r === '' || s.r === null || s.r === undefined) {
    if (addedSet) it.sets.pop();
    if (addedItem) dr.items.pop();
    return reply(text, '回数がわかりませんでした。「60キロ8回」のように回数も言ってください。', true);
  }
  // まだ空欄のあとのセットにも同じ重量を入れておく
  for (var m = j + 1; m < it.sets.length; m++) if (!it.sets[m].done && it.sets[m].w === '') it.sets[m].w = s.w;
  s.done = true; s.via = 'voice';
  it.method = it.sets.some(function (x) { return x.done && x.via !== 'voice'; }) ? 'タップ・音声' : '音声';
  VoiceUI.undo.push({ i: i, j: j, before: before, addedSet: addedSet, addedItem: addedItem });
  if (window.Avatar && typeof Avatar.feedback === 'function') Avatar.feedback('success', 1900);
  saveDraft();
  renderSession();
  var wr = (s.w !== '' && s.w !== null ? s.w + 'キロ' : '') + s.r + '回';
  var said = Speech.brief() ? Talk.nice() + (j + 1) + 'セット目、' + wr + '。'   // 短め（v23）
                            : Talk.nice() + it.name + '、' + wr + '、' + (j + 1) + 'セット目を記録したよ。';
  VoiceUI.show(text, said);
  afterSetDone(i, said);
}

/** 直前の音声での記録・追加を取り消す */
function voiceUndo(text) {
  var u = VoiceUI.undo.pop(), dr = S.draft;
  if (!u) return reply(text, '取り消せる記録がないよ。画面で直してね。', true);
  if (u.addedItem) dr.items.splice(u.i, 1);
  else if (u.addedSet) dr.items[u.i].sets.splice(u.j, 1);
  else {
    var s = dr.items[u.i].sets[u.j];
    s.w = u.before.w; s.r = u.before.r; s.done = u.before.done; s.via = u.before.via;
  }
  Timer.stop(); saveDraft(); renderSession();
  reply(text, 'オッケー、さっきの記録を取り消したよ。');
}

// ---------------- 終了画面 ----------------
function voiceInFinish(text, cmd) {
  if (/保存|ほぞん/.test(text)) {
    if (Dock.saveDisabled()) return reply(text, '✓が付いたセットがまだないよ。「トレーニングに戻る」で✓を付けてね。', true);
    Speech.speak('保存するね。おつかれさま！');
    return save();
  }
  if (cmd.type === 'undo' || /戻る|もどる/.test(text)) { renderSession(); return reply(text, 'トレーニングに戻るね。'); }
  reply(text, '「保存」って言うと保存するよ。トレーニングに戻るときは「戻る」だよ。', true);
}

// ---------------- アプリの基本操作（どの画面でも・Phase 3f） ----------------
// 覚えられる基本操作の名前（学習.gs の LEARNABLE_ACTIONS にも同じ名前がある）
var NAV_ACTIONS = ['goHome', 'openBody', 'bodyTab', 'openHistory', 'closePanel', 'myMenuList', 'startFree', 'newMyMenu', 'help', 'openRecords', 'countTraining'];

/** 基本操作を実行して、アバターが返事をする */
function doNav(text, cmd) {
  var inSession = S.view === 'session' || S.view === 'finish';
  switch (cmd.type) {
    case 'goHome':
      if (S.view === 'home') return reply(text, 'もうホームだよ。');
      Body.closeHistory(); Timer.stop(); renderHome(); Avatar.feedback('success');
      return reply(text, Talk.ok() + 'ホームに戻ったよ。' + (S.draft ? 'トレーニングの続きは「続きから」でできるよ。' : ''));
    case 'openBody': case 'bodyTab':
      if (cmd.tab) Body.tab = cmd.tab;
      if (S.view === 'body') { Body.closeHistory(); Body.renderMine(); return reply(text, Body.summary(Body.tab || 'inbody')); }
      VoiceUI.show(text, Talk.ok() + '体組成レポートを開くね。');
      return Body.showMine(function () { Avatar.feedback('success'); reply(text, Body.summary(Body.tab || (Body.mine.inbody.length ? 'inbody' : 'weight'))); });
    case 'openHistory':
      var openIt = function () {
        var tab = cmd.tab || Body.tab || 'inbody';
        Body.tab = tab; Body.renderMine();
        if (tab === 'weight') Body.openWeightHistory(Body.mine, ''); else Body.openInbodyHistory(Body.mine, '');
        reply(text, (tab === 'weight' ? '体重' : 'InBody') + 'の履歴を出したよ。「閉じて」で閉じるね。');
      };
      if (S.view === 'body') return openIt();
      VoiceUI.show(text, Talk.ok() + '履歴を開くね。');
      return Body.showMine(openIt);
    case 'openRecords':   // トレーニング記録のカレンダー（Phase 3u）
      if (inSession) return reply(text, '記録はトレーニングが終わってから見てね。今の記録は「終わり」で保存できるよ。', true);
      if (S.view === 'history') return reply(text, History.summary());
      VoiceUI.show(text, Talk.ok() + 'トレーニング記録を開くね。');
      return History.show('', function () { Avatar.feedback('success'); reply(text, History.summary()); });
    case 'countTraining':   // 「今週何回やった？」
      VoiceUI.show(text, 'ちょっと待ってね…');
      var answer = function (d) {
        var range = cmd.tab || 'week', n = range === 'month' ? d.monthCount : range === 'year' ? d.yearCount : d.weekCount;
        var label = range === 'month' ? '今月' : range === 'year' ? '今年度' : '今週';
        reply(text, n ? label + 'は' + n + '回トレーニングしたよ。' + (range === 'week' ? '今月は' + d.monthCount + '回だよ。' : '') + (n >= 3 ? Talk.nice() : '')
                      : label + 'はまだトレーニングの記録がないよ。いっしょに始めよう！');
      };
      var cur = History.data && History.data.month === History.data.current ? History.data : null;
      if (cur) return answer(cur);
      return History.load('').then(answer).catch(function (e) { reply(text, e.message, true); });
    case 'closePanel':
      Body.closeHistory(); VoiceUI.box.hidden = true; Speech.stop(); return;
    case 'help':
      return reply(text, helpText());
    case 'myMenuList':
      var list = S.home.myMenus || [];
      if (!list.length) return reply(text, 'まだ保存したメニューはないよ。「新しいメニューを作る」で作れるし、自分のメニューで記録したあとにも保存できるよ。');
      if (S.view !== 'home' && !inSession) renderHome();
      return reply(text, '保存しているメニューは、' + list.map(function (m) { return m.name; }).join('、') + 'の' + list.length + 'つだよ。' +
        '始めるときは「' + list[0].name + 'を始める」みたいに言ってね。');
    case 'startMyMenu': case 'startFree': case 'newMyMenu':
      if (inSession) return reply(text, '今はトレーニングの途中だよ。新しく始めるときは、先にホームに戻ってね。', true);
      if (cmd.type === 'newMyMenu') { MyMenu.edit(null); return reply(text, Talk.ok() + '新しいメニューを作ろう。名前と種目を入れて保存してね。'); }
      if (cmd.type === 'startFree') { startFree(); return reply(text, Talk.ok() + '白紙から記録するよ。「スクワット60キロ8回」みたいに話すと、種目ごと記録できるよ。'); }
      return MyMenu.start(cmd.id, text);
  }
}

/** ホームや記録の画面で「前回のスクワットは？」に答える。答えたら true */
function askPrevious(text) {
  if (!/前回|この前|このまえ|最後に/.test(VoiceParser.norm(text))) return false;
  var name = VoiceParser.findExercise(text, voiceCandidates());
  if (!name) return false;
  var last = latestOf(name);
  if (!last && History.data) {   // ホームの「前回の記録」に無いときは、開いている月の記録から探す
    History.data.sessions.slice().reverse().some(function (s) {
      var it = s.items.filter(function (x) { return x.name === name; })[0];
      if (it) last = { date: s.date, sets: it.sets.map(function (st) { return (st.w !== '' ? st.w + 'kg' : '') + '×' + st.r; }).join(', ') };
      return !!it;
    });
  }
  if (!last) { reply(text, name + 'の記録はまだないみたい。'); return true; }
  var sets = String(last.sets || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  var said = sets.length ? sets[0].replace(/^(?:([\d.]+)kg)?×(\d+)$/, function (m0, w, r) { return (w ? w + 'キロで' : '') + r + '回'; }) : '';
  var same = sets.length > 1 && sets.every(function (x) { return x === sets[0]; });
  reply(text, '前回の' + name + 'は' + Number(last.date.slice(5, 7)) + '月' + Number(last.date.slice(8, 10)) + '日、' +
    (said ? said + (same ? 'を' + sets.length + 'セット' : sets.length > 1 ? 'ほか、全部で' + sets.length + 'セット' : '') : '記録あり') + 'だよ。');
  return true;
}

/** 今の画面で話せることの説明 */
function helpText() {
  // v31：自分のデータの質問は、どの画面でも答える（qa.js の TOPICS から例を作る）
  var common = 'どの画面でも「ホームに戻って」「体組成レポートを開いて」「体重見せて」「コンディションを記録」が使えるよ。自分のデータは「体重は？」「スクワットの最高は？」「FFMIは何位？」みたいに聞いてね。「何が聞ける？」でもっと教えるよ。';
  if (S.view === 'session') return '記録は「スクワット60キロ8回」や「できた」、案内は「次は？」「あと何セット？」「何キロでやればいい？」、重さは「重くして」「軽くして」、レストは「休憩する」「あと何秒」「スキップ」、間違えたら「取り消し」、終わったら「終わり」だよ。' + common;
  if (S.view === 'finish') return '「保存」で保存だよ。保存したら、コンディションの記録に進めるよ。「マイメニューに保存」も使えるよ。';
  if (S.view === 'condition') return '「全身3、上半身2、下半身4、動き7」のように数字を言って、「コメント 〜」でコメント、「保存」で保存、「あとで」でやめるよ。';
  if (S.view === 'body') return '「体重にして」「InBodyにして」で切り替え、「体重の履歴」で履歴、「閉じて」で閉じるよ。' + common;
  if (S.view === 'history') return '「今週何回やった？」「今月は何回？」で回数、「前回のスクワットは？」で前回の記録を答えるよ。日付をタップすると、その日の記録が見られるよ。' + common;
  return '「今日は何をする？」でおすすめ、「デイ2を始める」で開始、「マイメニューは？」で保存したメニュー、「新しいメニューを作る」でメニュー作りができるよ。「記録を見せて」でトレーニング記録、「今週何回やった？」で回数も答えるよ。' + common;
}

/** あいさつ・雑談に返事をする。返事をしたら true（v22 から中身は chat.js の Chat.smallTalk） */
function smallTalk(text) { return Chat.smallTalk(text); }

VoiceUI.init();
