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
        : '「今日は何をする？」「デイ2を始める」');
      document.getElementById('app').appendChild(help);
    }
  },

  start: function () {
    var self = this;
    Speech.stop();   // 読み上げの声をマイクが拾わないように止める
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
  if (S.view === 'session') return voiceInSession(text, cmd);
  if (S.view === 'finish') return voiceInFinish(text, cmd);
  if (S.view === 'home') return voiceInHome(text, cmd);
}

// ---------------- ホーム ----------------
function voiceInHome(text, cmd) {
  var h = S.home;
  if (cmd.type === 'startDay') {
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
