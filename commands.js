/**
 * commands.js ― 音声での操作（Phase 2）
 * マイクボタンを押して話すと、voice.js で文を解析し、ここで画面の操作に変換する。
 * app.js の関数（startDay, renderSession, afterSetDone など）と状態 S を使う。
 *
 * 対応している話し方（例）:
 *   トレーニング中: 「スクワット60キロ8回」「60キロ8回」「懸垂10回」「次は？」「今の種目」「前回は？」
 *                   「レストあと何秒」「スキップ」「取り消し」「デッドリフト追加」「終わり」
 *   ホーム       : 「今日は何をする？」「デイ2を始める」
 *   終了画面     : 「きつさ7」「保存」
 * わからない言い方は「どの操作ですか？」と候補を出し、選ばれた答えを覚える（Chooser, Phase 2b）。
 */
var VoiceUI = {
  btn: document.getElementById('micBtn'),
  box: document.getElementById('voiceBox'),
  undo: [],          // 音声で記録した内容の取り消し用（新しいものが最後）
  hideHandle: null,

  init: function () {
    var self = this;
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
    var show = VoiceInput.supported() && (S.view === 'home' || S.view === 'session' || S.view === 'finish');
    this.btn.hidden = !show;
    document.body.classList.toggle('has-mic', show);
    if (!show) { this.box.hidden = true; return; }
    if ((S.view === 'session' || S.view === 'home') && !document.getElementById('voiceHelp')) {
      var help = document.createElement('details');
      help.id = 'voiceHelp';
      help.className = 'card voice-help';
      help.innerHTML = '<summary>🎤 話し方の例</summary>' + (S.view === 'session'
        ? '記録：「スクワット60キロ8回」「60キロ8回」（今の種目）「懸垂10回」<br>案内：「次は？」「今の種目」「前回は？」<br>' +
          'レスト：「あと何秒」「スキップ」<br>そのほか：「取り消し」「デッドリフト追加」「終わり」'
        : '「今日は何をする？」「デイ2を始める」') +
        '<br>わからない言い方をされたときは、画面に操作の候補が出ます。選ぶと、次からはその言い方で動きます（チームで共有）。';
      document.getElementById('app').appendChild(help);
    }
  },

  start: function () {
    var self = this;
    // マイクボタンを押した瞬間（タップ中）に読み上げの準備をしておく。これをしないとiPhoneでは返事が自動で読み上げられない
    if (window.speechSynthesis && window.speechSynthesis.speaking && Speech.unlocked) Speech.stop();   // 読み上げ中なら止める（声をマイクが拾わないように）
    Speech.unlock();
    this.btn.classList.add('listening');
    this.btn.textContent = '● 聞き取り中（押すと止まる）';
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
        var msg = {
          'not-allowed': 'マイクが許可されていません。ブラウザの設定でマイクを許可してください。',
          'service-not-allowed': '音声入力が使えません。iPhoneは「設定」→「一般」→「キーボード」→「音声入力」をオンにしてください。',
          'no-speech': '声が聞き取れませんでした。もう一度押して話してください。',
          'network': '通信の問題で聞き取れませんでした。',
          'unsupported': 'このブラウザは音声入力に対応していません。'
        }[code] || ('音声入力でエラーが起きました（' + code + '）');
        if (code !== 'aborted') self.show('', msg, true);
      }
    });
  },

  resetBtn: function () { this.btn.classList.remove('listening'); this.btn.textContent = '🎤 話しかける'; },

  /** 聞き取った文と返事を、マイクボタンの横に表示する（数秒後に自動で消える） */
  show: function (heard, reply, ng) {
    clearTimeout(this.hideHandle);
    this.box.hidden = false;
    this.box.innerHTML = (heard ? '<div class="heard">🎤 ' + esc(heard) + '</div>' : '') +
      (reply ? '<div class="reply' + (ng ? ' ng' : '') + '">' + esc(reply) + '</div>' : '');
    var self = this;
    if (!VoiceInput.active) this.hideHandle = setTimeout(function () { self.box.hidden = true; }, 6000);
  }
};

// ---------------- 「どの操作ですか？」（Phase 2b: 使いながら覚える） ----------------
var Chooser = {
  text: '', cmd: null,

  /** わからない言い方をされたとき、操作の候補をボタンで出す */
  openAction: function (text) {
    this.text = text; this.cmd = null;
    var opts = [];
    if (S.view === 'session') {
      var nums = VoiceParser.extractNumbers(VoiceParser.normalizeNumbers(text));
      if (nums.weight !== null || nums.reps !== null) opts.push(['record', '', '今の種目に記録する']);
      opts.push(['next', '', '次の種目を聞く'], ['current', '', '今の種目を聞く'], ['previous', '', '前回の記録を聞く'],
                ['restLeft', '', 'レストの残り時間'], ['skipRest', '', 'レストを終える'], ['undo', '', '直前の記録を取り消す'],
                ['finish', '', '終了して保存へ']);
    } else {
      var first = S.home.suggestion.order[0];
      if (first) opts.push(['startSuggested', '', 'おすすめのDay（今日はDay' + first + '）を始める']);
      opts.push(['suggest', '', '今日のおすすめを聞く']);
      S.home.days.forEach(function (d) { opts.push(['startDay', String(d.day), 'Day' + d.day + (d.dayName ? '（' + d.dayName + '）' : '') + 'を始める']); });
    }
    this.render('どの操作ですか？ 選ぶと、次からはこの言い方で動きます。', opts);
    Speech.speak('わかりませんでした。画面から操作を選んでください。次からは、その言い方で動きます。');
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

  /** 選ばれた操作を実行し、言い回しを覚える */
  pick: function (action, value) {
    var text = this.text, view = S.view;
    if (action === 'none') { this.close(); return; }
    this.close();
    if (action === 'exercise' || action === 'newExercise') return this.pickExercise(value, action === 'newExercise');

    var phrase = VoiceParser.phraseKey(text);
    // 「Day3を始める」を数字の入っていない言い方で覚えると、全員がいつもDay3になってしまうので覚えない
    var learnable = !(action === 'startDay' && phrase.indexOf('#') < 0);
    if (phrase.length >= 2 && learnable) {
      S.home.phrases = (S.home.phrases || []).filter(function (p) { return !(p.phrase === phrase && p.view === view); });
      S.home.phrases.push({ phrase: phrase, action: action, value: value, view: view });
      Api.call('learnPhrase', { token: S.token, phrase: phrase, op: action, value: value, view: view })
        .catch(function () { /* 覚えられなくても操作自体は続ける */ });
    }
    var cmd = learnedToCmd({ action: action, value: value }, text);
    if (view === 'session') voiceInSession(text, cmd); else voiceInHome(text, cmd);
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

VoiceUI.box.addEventListener('click', function (e) {
  var b = e.target.closest('[data-choose]');
  if (b) Chooser.pick(b.dataset.choose, b.dataset.value || '');
});
VoiceUI.box.addEventListener('change', function (e) {
  if (e.target.id === 'chooseEx' && e.target.value) Chooser.pick('exercise', e.target.value);
});

/** 返事を画面に出して、読み上げる */
function reply(heard, text, ng) { VoiceUI.show(heard, text, ng); Speech.speak(text); }

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
  var cmd = VoiceParser.parse(text, { candidates: voiceCandidates() });
  if (S.view === 'finish') return voiceInFinish(text, cmd);
  if (S.view !== 'session' && S.view !== 'home') return;

  // わからない言い方 → 覚えた言い回しを探す → それでも無ければ「どの操作ですか？」と聞く（Phase 2b）
  if (cmd.type === 'unknown') {
    var learned = VoiceParser.matchLearned(text, S.home.phrases, S.view);
    if (learned) cmd = learnedToCmd(learned, text);
    else return Chooser.openAction(text);
  }
  if (cmd.type === 'unknownExercise' && S.view === 'session') return Chooser.openExercise(text, cmd);

  if (S.view === 'session') return voiceInSession(text, cmd);
  return voiceInHome(text, cmd);
}

/** 覚えた言い回しを、操作の指示に変換する */
function learnedToCmd(p, text) {
  var norm = VoiceParser.normalizeNumbers(text);
  var nums = VoiceParser.extractNumbers(norm);
  var dayInText = norm.match(/\d/);   // 「#を始めたい」のように数字入りで覚えた場合は、話した数字のDayにする
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
  } else if (cmd.type === 'suggest' || cmd.type === 'current' || cmd.type === 'next') {
    reply(text, h.suggestion.order.length ? suggestText() : h.suggestion.reason);
  } else if (cmd.type === 'record') {
    reply(text, '先にDayを始めるか、「自分のメニューで記録する」を押してください。', true);
  } else {
    reply(text, '聞き取れませんでした。「今日は何をする？」「デイ2を始める」のように話してください。', true);
  }
}

// ---------------- トレーニング中 ----------------
function voiceInSession(text, cmd) {
  var dr = S.draft, cur = currentIndex();
  switch (cmd.type) {
    case 'record': return voiceRecord(text, cmd);
    case 'unknownExercise':
      return reply(text, '「' + cmd.name + '」という種目が見つかりません。メニュー外の種目なら「' + cmd.name + '追加」と言ってから記録してください。', true);
    case 'next':
      var nx = cur < 0 ? -1 : cur + 1;
      return reply(text, nx > 0 && nx < dr.items.length ? '次は' + Speech.exerciseText(dr.items[nx], latestOf(dr.items[nx].name)) :
        (cur >= 0 ? '今の' + dr.items[cur].name + 'が最後の種目です。' : 'すべての種目が終わっています。「終わり」と言うと保存の画面に進みます。'));
    case 'current':
      return reply(text, cur < 0 ? 'すべての種目が終わっています。' :
        dr.items[cur].name + '、' + (dr.items[cur].sets.filter(function (s) { return s.done; }).length + 1) + 'セット目です。' +
        Speech.exerciseText(dr.items[cur], latestOf(dr.items[cur].name)));
    case 'previous':
      var name = cmd.exercise || (cur >= 0 ? dr.items[cur].name : '');
      var last = name ? latestOf(name) : null;
      return reply(text, last ? name + 'の前回は、' + last.date.slice(5).replace('-', '月') + '日、' +
        last.sets.replace(/kg/g, 'キロ').replace(/×/g, 'で') + '回でした。' : (name || 'この種目') + 'の前回の記録はありません。');
    case 'restLeft':
      return reply(text, Timer.handle ? 'レストはあと' + Timer.left + '秒です。' : '今はレスト中ではありません。');
    case 'skipRest':
      Timer.stop(); return reply(text, 'レストを終わります。');
    case 'undo': return voiceUndo(text);
    case 'add':
      var ex = findExercise(cmd.exercise);
      dr.items.push(makeItem({ name: ex ? ex.name : cmd.exercise, category: ex ? ex.category : '' }, false));
      saveDraft(); renderSession();
      VoiceUI.undo.push({ addedItem: true, i: dr.items.length - 1 });
      return reply(text, (ex ? ex.name : cmd.exercise) + 'を追加しました。重量と回数を話すと記録します。');
    case 'finish':
      Timer.stop(); renderFinish();
      return reply(text, '保存の画面です。きつさを1から10で、「きつさ7」のように言うか、選んでください。');
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
    if (i < 0) return reply(text, 'すべての種目が終わっています。どの種目か、種目名も言ってください。', true);
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
  saveDraft();
  renderSession();
  var said = it.name + '、' + (s.w !== '' && s.w !== null ? s.w + 'キロ' : '') + s.r + '回、' + (j + 1) + 'セット目を記録しました。';
  VoiceUI.show(text, said);
  afterSetDone(i, said);
}

/** 直前の音声での記録・追加を取り消す */
function voiceUndo(text) {
  var u = VoiceUI.undo.pop(), dr = S.draft;
  if (!u) return reply(text, '取り消せる記録がありません。タップで直してください。', true);
  if (u.addedItem) dr.items.splice(u.i, 1);
  else if (u.addedSet) dr.items[u.i].sets.splice(u.j, 1);
  else {
    var s = dr.items[u.i].sets[u.j];
    s.w = u.before.w; s.r = u.before.r; s.done = u.before.done; s.via = u.before.via;
  }
  Timer.stop(); saveDraft(); renderSession();
  reply(text, '直前の記録を取り消しました。');
}

// ---------------- 終了画面 ----------------
function voiceInFinish(text, cmd) {
  var n = VoiceParser.normalizeNumbers(text).match(/(\d+)/);
  if (/保存|ほぞん/.test(text)) {
    if (!S.draft.srpe && !n) return reply(text, '先にきつさを1から10で言ってください。', true);
    if (n && Number(n[1]) >= 1 && Number(n[1]) <= 10) S.draft.srpe = Number(n[1]);
    Speech.speak('保存します。');
    return save();
  }
  if (n && Number(n[1]) >= 1 && Number(n[1]) <= 10) {
    S.draft.srpe = Number(n[1]); saveDraft(); renderFinish();
    return reply(text, 'きつさ' + n[1] + 'にしました。「保存」と言うと保存します。');
  }
  if (cmd.type === 'undo' || /戻る|もどる/.test(text)) { renderSession(); return reply(text, 'トレーニングに戻ります。'); }
  reply(text, '「きつさ7」のように数字を言うか、「保存」と言ってください。', true);
}

VoiceUI.init();
