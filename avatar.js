/**
 * avatar.js ― 話しかけると返事をするアバター（コーチ）
 *   v21：絵を画像にした（Claude Design のアバター改善案 4a）。土台の絵（base）の上に、
 *        目（eye-half＝半目 / eye-closed＝閉じた目）と口（mouth-s＝少し開く / mouth-m＝大きく開く）の画像を重ねて、
 *        まばたきと口の動きを作る。画像は assets/avatar/ にある（男性 male-…、女性 female-…）。
 *        目と口以外が動かないように、重ねる画像は目・口のまわりだけを残して、ふちをぼかしてある。
 *
 *   Avatar.talk / listen / pulse / greet … 話している間は口を動かす・聞き取り中の顔・ホームのあいさつ
 *   Avatar.feedback('success'|'confirming'|'error') … 結果の表情（読み上げ中なら、読み上げのあとに出す）
 *   Avatar.setGender('male'|'female') … 男性・女性の切り替え（ホームの「コーチ」から選ぶ。この端末に保存）
 *   Avatar.mount(場所, 'big'|'dock') … アバターを置く場所（dock.js から呼ぶ）
 *   表情：成功＝目を閉じて笑う、エラー＝半目、確認＝首をかしげる。まわりの輪の色と右下の印は style.css の .avatar.state-○○
 *   ※ v20 までの「ジャケットの色」は、画像になったので選べなくなった。
 *   Talk … 返事に添える、ちょっとした言葉（毎回同じにならないように、いくつかの中から選ぶ）
 */
// 画像の置き場所と、更新したときに古い画像が残らないようにする印（画像を描き直したら数字を変える）
// GitHub に assets/avatar フォルダが無く、画像がいちばん上（index.html と同じ場所）にあるときは、自動でそちらを使う
var AVATAR_IMG = { dir: 'assets/avatar/', fallbackDir: '', ver: '21' };
// 状態ごとの右下の印（icons.js の名前）
var AVATAR_BADGE = { listening: 'mic', success: 'check', confirming: 'question', error: 'drop' };
// 状態ごとの目と口（base＝ふだん）。speaking の口は動かすので、ここでは決めない
var AVATAR_FACE = {
  idle: { eye: 'base', mouth: 'base' }, listening: { eye: 'base', mouth: 'base' }, speaking: { eye: 'base', mouth: 'base' },
  success: { eye: 'closed', mouth: 'm' }, confirming: { eye: 'base', mouth: 's' }, error: { eye: 'half', mouth: 'base' }
};

var Avatar = {
  el: null,
  talkTimer: null,
  feedbackTimer: null,
  pendingFeedback: null,
  blinkTimer: null,
  mouthTimer: null,
  currentGender: 'male',
  currentState: 'idle',
  greeted: false,
  storageKey: 'trainingAvatarGender',

  name: function () {
    if (this.isStaff()) return 'AIアシスタント';   // v36：スタッフ画面では「AIアシスタント」と呼ぶ
    return (S.home && S.home.avatarName) || 'コーチ';
  },

  /** スタッフ画面か（スタッフ画面では、名前・設定の見出しを「AIアシスタント」にする。v36） */
  isStaff: function () { return typeof S !== 'undefined' && S.view === 'staff'; },

  /** 画面に出す呼び名（選手＝コーチ、スタッフ＝AIアシスタント） */
  title: function () { return this.isStaff() ? 'AIアシスタント' : 'コーチ'; },

  getGender: function () {
    return this.currentGender;
  },

  /** 男女の外見を切り替える。選択はこのブラウザに保存する。 */
  setGender: function (gender) {
    if (gender !== 'male' && gender !== 'female') return false;
    this.currentGender = gender;
    try { localStorage.setItem(this.storageKey, gender); } catch (e) { /* 保存できなくても、今の画面では切り替える */ }
    this.redraw();
    return true;
  },

  /** 画像のファイル名（part: base / eye-half / eye-closed / mouth-s / mouth-m） */
  src: function (part) {
    return AVATAR_IMG.dir + this.currentGender + '-' + part + '.png?v=' + AVATAR_IMG.ver;
  },

  /** 今の性別の画像に入れ替える */
  redraw: function () {
    if (!this.el) return;
    var self = this, g = this.currentGender === 'male' ? '男性' : '女性';
    Array.prototype.forEach.call(this.el.querySelectorAll('img[data-part]'), function (img) { img.src = self.src(img.dataset.part); });
    this.el.dataset.gender = this.currentGender;
    this.el.setAttribute('aria-label', this.title() + 'に話しかける（' + g + '）');
    this.el.setAttribute('title', g + 'の' + this.title() + '：タップして話しかける');
    this.applyState();
  },

  init: function () {
    try {
      var stored = localStorage.getItem(this.storageKey);
      if (stored === 'male' || stored === 'female') this.currentGender = stored;
    } catch (e) {}
    var el = document.createElement('button');
    el.id = 'avatar';
    el.className = 'avatar';
    el.hidden = true;
    el.type = 'button';
    // 土台の絵と、重ねる目・口の画像（はじめは全部読み込んでおき、表示するかどうかだけを切り替える）
    el.innerHTML = '<span class="av-face">' +
      ['base', 'eye-half', 'eye-closed', 'mouth-s', 'mouth-m'].map(function (p) {
        return '<img alt="" data-part="' + p + '" class="' + (p === 'base' ? 'av-base' : 'av-part av-' + p) + '" draggable="false">';
      }).join('') + '</span><span class="av-badge" aria-hidden="true"></span>';
    document.body.appendChild(el);
    this.el = el;
    // 土台の絵が読み込めなかったら、画像の置き場所をもう一方に切り替えて読み直す（1回だけ）
    el.querySelector('.av-base').addEventListener('error', function () {
      if (AVATAR_IMG.dir === AVATAR_IMG.fallbackDir) return;
      AVATAR_IMG.dir = AVATAR_IMG.fallbackDir;
      Avatar.redraw();
    });
    this.redraw();
    var self = this;
    el.addEventListener('click', function () {
      // マイクが出ている画面のときだけ、アバターを押しても話しかけられる（ログイン画面などでは何もしない）
      if (typeof VoiceUI !== 'undefined' && VoiceUI.btn && !VoiceUI.btn.hidden && typeof VoiceUI.btn.click === 'function') {
        VoiceUI.btn.click();
      }
    });
    this.scheduleBlink();
    this.bindGlobalPickerDismiss();
  },

  /** 目と口を変える（eye: base/half/closed、mouth: base/s/m） */
  face: function (eye, mouth) {
    if (!this.el) return;
    if (eye) this.el.dataset.eye = eye;
    if (mouth) this.el.dataset.mouth = mouth;
  },

  /** まばたき：3〜5秒ごとに 半目→閉じる→半目→開く（60ミリ秒ずつ）。成功・エラーの顔のときはしない */
  scheduleBlink: function () {
    var self = this;
    clearTimeout(this.blinkTimer);
    this.blinkTimer = setTimeout(function () {
      var st = self.currentState;
      if (st !== 'success' && st !== 'error' && !self.reducedMotion()) {
        ['half', 'closed', 'half', 'base'].forEach(function (e, k) {
          setTimeout(function () { if (self.currentState !== 'success' && self.currentState !== 'error') self.face(e); }, k * 60);
        });
      }
      self.scheduleBlink();
    }, 3000 + Math.random() * 2000);
  },

  reducedMotion: function () {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  },

  /** 話している間の口の動き（120ミリ秒ごとに 小→大→小→閉… をくり返す。ときどき1つ飛ばして自然に見せる） */
  startMouth: function () {
    var self = this, seq = ['s', 'm', 's', 'base', 'm', 's', 'm', 'base'], i = 0;
    clearInterval(this.mouthTimer);
    this.mouthTimer = setInterval(function () {
      if (self.currentState !== 'speaking') { self.stopMouth(); return; }
      i = (i + 1 + (Math.random() < 0.3 ? 1 : 0)) % seq.length;
      self.face(null, seq[i]);
    }, 120);
  },
  stopMouth: function () { clearInterval(this.mouthTimer); this.mouthTimer = null; },

  bindGlobalPickerDismiss: function () {
    if (this._pickerDismissBound) return;
    this._pickerDismissBound = true;
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        var panel = document.getElementById('avatarAppearancePicker');
        if (panel) panel.hidden = true;
      }
    });
    // パネルの外をタップしても閉じる（「コーチ」のボタン自体は除く）
    document.addEventListener('pointerdown', function (event) {
      var panel = document.getElementById('avatarAppearancePicker');
      if (panel && !panel.hidden && !panel.contains(event.target) && !event.target.closest('[data-act="avatarSettings"]')) panel.hidden = true;
    }, true);
  },

  /**
   * アバターを置く場所を変える（dock.js から呼ぶ）。
   * size: 'big' … ホーム・ログインの一番上（大きく） / 'dock' … 画面の下のバーの左（小さく）
   */
  mount: function (slot, size) {
    if (!this.el || !slot) return;
    if (this.el.parentNode !== slot) slot.appendChild(this.el);
    this.el.classList.toggle('av-big', size === 'big');
    this.el.classList.toggle('av-dock', size !== 'big');
  },

  show: function (on) {
    if (this.el) this.el.hidden = !on;
  },

  /** 状態を変える（idle / listening / speaking / success / confirming / error） */
  setState: function (state) {
    var allowed = ['idle', 'listening', 'speaking', 'success', 'confirming', 'error'];
    if (allowed.indexOf(state) === -1) return false;
    this.currentState = state;
    this.applyState();
    return true;
  },

  applyState: function () {
    if (!this.el) return;
    var st = this.currentState, states = ['idle', 'listening', 'speaking', 'success', 'confirming', 'error'];
    for (var i = 0; i < states.length; i++) this.el.classList.remove('state-' + states[i]);
    this.el.classList.add('state-' + st);
    var f = AVATAR_FACE[st];
    // 女性の半目の絵は笑っているように見えるので、エラーのときは目をふだんのままにする
    this.face(st === 'error' && this.currentGender === 'female' ? 'base' : f.eye, f.mouth);
    var badge = this.el.querySelector('.av-badge');
    badge.innerHTML = AVATAR_BADGE[st] && window.Icon ? Icon(AVATAR_BADGE[st], 18) : '';
    if (st === 'speaking' && !this.reducedMotion()) this.startMouth(); else this.stopMouth();
  },

  /** 話している間は口を動かす。読み上げ後に結果の表情を出すための状態も保持する。 */
  talk: function (on, text) {
    if (!this.el) return;
    clearTimeout(this.talkTimer);
    if (on) {
      if (this.pendingFeedback) clearTimeout(this.feedbackTimer);
      this.setState('speaking');
      var self = this;
      this.talkTimer = setTimeout(function () {
        if (self.currentState === 'speaking') {
          self.setState('idle');
          self.finishFeedbackAfterSpeech();
        }
      }, (1500 + String(text || '').length * 160) * 1.05 / ((window.Speech && Speech.rate) ? Speech.rate() : 1.05));   // 速く話す設定なら早めに口を閉じる
    } else if (this.currentState === 'speaking') {
      this.setState('idle');
    }
  },

  /** 聞き取り中の顔 */
  listen: function (on) {
    if (!this.el) return;
    if (on) this.setState('listening');
    else if (this.currentState === 'listening') this.setState('idle');
  },

  /** 自分の呼び方（男性トレーナーは「ぼく」、女性トレーナーは「わたし」） */
  me: function () { return this.currentGender === 'female' || this.isStaff() ? 'わたし' : 'ぼく'; },

  /** 読み上げの区切りごとに口を大きく開ける */
  pulse: function () {
    if (!this.el || this.currentState !== 'speaking') return;
    this.face(null, 'm');
  },

  /** 成功・確認・エラーを一時表示。読み上げ中なら終了後に表情を出す。 */
  feedback: function (state, duration) {
    if (['success', 'confirming', 'error'].indexOf(state) < 0) return;
    this.pendingFeedback = { state: state, duration: duration || 1700 };
    clearTimeout(this.feedbackTimer);
    if (this.currentState !== 'speaking' && this.currentState !== 'listening') {
      this.setState(state);
      var self = this, pending = this.pendingFeedback;
      this.feedbackTimer = setTimeout(function () {
        if (self.pendingFeedback === pending) self.pendingFeedback = null;
        if (self.currentState === state) self.setState('idle');
      }, pending.duration);
    }
  },
  finishFeedbackAfterSpeech: function () {
    var pending = this.pendingFeedback;
    if (!pending) return;
    this.pendingFeedback = null;
    clearTimeout(this.feedbackTimer);
    this.setState(pending.state);
    var self = this;
    this.feedbackTimer = setTimeout(function () {
      if (self.currentState === pending.state) self.setState('idle');
    }, pending.duration);
  },
  success: function () { this.feedback('success'); },
  confirm: function () { this.feedback('confirming'); },
  error: function () { this.feedback('error'); },
  resetState: function () {
    clearTimeout(this.feedbackTimer);
    this.pendingFeedback = null;
    this.setState('idle');
  },

  /**
   * 見た目を選ぶパネル（ホームの「トレーナー設定」から開く）。
   * 種類（男性・女性）と声の速さを選べる。選んだ内容はこのブラウザに保存される。
   * 名前は「設定」シートの「キャラクターの名前」で変える（全員共通）。
   */
  openAppearancePicker: function () {
    var existing = document.getElementById('avatarAppearancePicker');
    if (existing) {
      existing.hidden = !existing.hidden;
      if (!existing.hidden) this.refreshPicker(existing);
      return;
    }
    var self = this;
    var panel = document.createElement('div');
    panel.id = 'avatarAppearancePicker';
    panel.className = 'avatar-picker';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'トレーナーの見た目を選択');

    panel.innerHTML =
      '<div class="avatar-picker-head"><span class="avatar-picker-title">' + this.title() + 'の設定</span><button type="button" class="btn ghost avatar-picker-close">閉じる</button></div>' +
      '<div class="avatar-picker-row"><span class="avatar-picker-label">名前</span><span class="avatar-picker-name"></span></div>' +
      '<div class="avatar-picker-row"><span class="avatar-picker-label">種類</span>' +
        '<span class="avatar-picker-genders"><button type="button" class="btn sub avatar-picker-option" data-gender="male">男性</button>' +
        '<button type="button" class="btn sub avatar-picker-option" data-gender="female">女性</button></span></div>' +
      '<div class="avatar-picker-row"><span class="avatar-picker-label">声の速さ</span><span class="avatar-picker-rates">' +
        Speech.RATES.map(function (r) { return '<button type="button" class="btn sub avatar-picker-option" data-rate="' + r.key + '">' + r.label + '</button>'; }).join('') + '</span></div>' +
      '<div class="avatar-picker-row"><span class="avatar-picker-label">話し方</span><span class="avatar-picker-genders">' +
        Speech.LENGTHS.map(function (l) { return '<button type="button" class="btn sub avatar-picker-option" data-length="' + l.key + '">' + l.label + '</button>'; }).join('') + '</span></div>' +
      '<div class="avatar-picker-row"><span class="avatar-picker-label">画面の色</span><span class="avatar-picker-genders">' +
        Theme.MODES.map(function (m) { return '<button type="button" class="btn sub avatar-picker-option" data-theme-mode="' + m.key + '">' + m.label + '</button>'; }).join('') + '</span></div>' +
      '<div class="avatar-picker-row"><span class="avatar-picker-label">声</span><select class="avatar-picker-voice" aria-label="声"></select></div>' +
      '<button type="button" class="btn sub avatar-picker-try" data-try="1">🔊 声を試す</button>' +
      '<button type="button" class="btn sub avatar-picker-try" data-typevoice="1">⌨ 文字で話しかける</button>' +   // v43：パソコンなどで、声の代わりに文字で
      '<details class="avatar-picker-description"><summary>声が機械っぽいときは</summary>iPhone のブラウザ（Safari・Chrome とも）は、スマホにダウンロードした「拡張」の声を使えず、Kyoko だけになることが多いです（Apple の制限）。「話し方：短め」と「声の速さ：ふつう〜ゆっくり」にすると聞き取りやすくなります。Android：「設定」→「テキスト読み上げ」で Google の音声データ（日本語）を入れてください。<br>種類・声の速さ・話し方・画面の色・声はこの端末に保存されます。「画面の色：自動」はスマホのダークモードに合わせます。声は男性・女性で変わります（スマホに入っている声によって聞こえ方は違います）。名前は「設定」シートの「キャラクターの名前」で変えられます。</details>';

    panel.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.gender) { self.setGender(t.dataset.gender); self.trySpeak(); }
      else if (t.dataset.rate) { Speech.setRate(t.dataset.rate); self.trySpeak(); }
      else if (t.dataset.length) Speech.setLength(t.dataset.length);
      else if (t.dataset.themeMode) Theme.set(t.dataset.themeMode);   // 画面の色（自動＝スマホのダークモードに合わせる／昼／夜）
      else if (t.dataset.try) { self.trySpeak(); return; }
      else if (t.dataset.typevoice) { panel.hidden = true; return; }   // 入力欄は commands.js が出す
      else if (t.classList.contains('avatar-picker-close')) { panel.hidden = true; return; }
      self.refreshPicker(panel);
    });
    // 声の一覧から選ぶ（「おすすめ」は、自然な声・その性別の声を自動で選ぶ）
    panel.querySelector('.avatar-picker-voice').addEventListener('change', function (e) {
      Speech.setVoiceName(self.currentGender, e.target.value);
      self.trySpeak();
    });
    document.body.appendChild(panel);
    this.refreshPicker(panel);
  },

  /** 今の声（男女・速さ）で試しに話す */
  trySpeak: function () {
    Speech.speak((this.currentGender === 'female' ? 'わたし' : 'ぼく') + 'は' + this.name() + '。この速さで話すね。今日もいっしょにがんばろう！', true);
  },

  /** パネルの「選んでいる印」を今の設定に合わせる */
  refreshPicker: function (panel) {
    var self = this;
    panel.querySelector('.avatar-picker-name').textContent = this.name();
    Array.prototype.forEach.call(panel.querySelectorAll('[data-gender]'), function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.gender === self.currentGender));
    });
    Array.prototype.forEach.call(panel.querySelectorAll('[data-rate]'), function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.rate === Speech.rateKey));
    });
    Array.prototype.forEach.call(panel.querySelectorAll('[data-length]'), function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.length === Speech.lengthKey));
    });
    Array.prototype.forEach.call(panel.querySelectorAll('[data-theme-mode]'), function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.themeMode === Theme.get()));
    });
    // 声の一覧（この端末に入っている日本語の声）。自然な声には「★」を付ける
    Speech.loadVoices();
    var sel = panel.querySelector('.avatar-picker-voice'), chosen = Speech.chosenName(this.currentGender);
    var auto = Speech.bestVoice(this.currentGender === 'male');
    sel.innerHTML = '<option value="">おすすめ' + (auto ? '（' + esc(auto.name) + '）' : '') + '</option>' +
      Speech.voices.map(function (v) {
        return '<option value="' + esc(v.name) + '"' + (v.name === chosen ? ' selected' : '') + '>' + (Speech.GOOD_VOICE.test(v.name) ? '★ ' : '') + esc(v.name) + '</option>';
      }).join('');
  },

  /** ホームを開いたときのひとこと（既存仕様を維持） */
  greet: function () {
    if (this.greeted || !S.home || S.view !== 'home' || !VoiceInput.supported()) return;
    this.greeted = true;
    var h = S.home, hour = new Date().getHours();
    var hello = hour < 10 ? 'おはよう' : hour < 18 ? 'こんにちは' : 'おつかれさま';
    var first = h.suggestion && h.suggestion.order && h.suggestion.order[0];
    var text = h.name + 'さん、' + hello + '！' +
      (S.draft ? '途中のトレーニングがあるよ。「続きから」で再開できるよ。'
        : first ? '今日はDay' + first + 'がおすすめだよ。'
          : (h.myMenus && h.myMenus.length ? '保存したメニューから始められるよ。' : '')) +
      '話しかけるときは、' + this.me() + 'かマイクのボタンを押してね。';
    // v20：ホームではコーチの出迎え（あいさつ）を画面の一番上に出すので、吹き出しは出さない。
    // 声で読み上げたいときは、次の行の // を消す
    // Speech.speak(text);
    return text;
  }
};

var Talk = {
  pick: function (list) { return list[Math.floor(Math.random() * list.length)]; },
  ok: function () { return this.pick(['了解！', 'オッケー！', 'わかった！', 'はーい！']); },
  nice: function () { return this.pick(['ナイス！', 'いいね！', 'その調子！', 'いい感じ！']); },
  sorry: function () { return this.pick(['ごめんね、', 'ごめん、', 'うーん、']); }
};

Avatar.init();
