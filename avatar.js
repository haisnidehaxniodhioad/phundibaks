/**
 * avatar.js ― 話しかけると返事をするアバター（Phase 3f、v3iで男女の切り替えと表情を追加）
 *
 *   Avatar.talk / listen / pulse / greet … 話している間は口を動かす・聞き取り中の顔・ホームのあいさつ
 *   Avatar.feedback('success'|'confirming'|'error') … 結果の表情（読み上げ中なら、読み上げのあとに出す）
 *   Avatar.setGender('male'|'female') … 見た目の切り替え。ホームの「トレーナー設定」から選ぶ（この端末に保存）
 *   表情の見た目は style.css の .avatar.state-○○ で変えられる。
 *   Talk … 返事に添える、ちょっとした言葉（毎回同じにならないように、いくつかの中から選ぶ）
 */
var AVATAR_COLORS = {
  head: '#252a35',
  face: '#f4d8c4',
  band: '#ffffff',
  cheek: '#e9a99a',
  line: '#252a35',
  shirt: '#233b68',
  shirtLight: '#f7f8fb',
  mouth: '#9f3e45'
};

var Avatar = {
  el: null,
  talkTimer: null,
  feedbackTimer: null,
  pendingFeedback: null,
  currentGender: 'male',
  currentState: 'idle',
  greeted: false,
  storageKey: 'trainingAvatarGender',

  name: function () {
    return (S.home && S.home.avatarName) || 'コーチ';
  },

  getGender: function () {
    return this.currentGender;
  },

  /** 男女の外見を切り替える。選択はこのブラウザに保存する。 */
  setGender: function (gender) {
    if (gender !== 'male' && gender !== 'female') return false;
    this.currentGender = gender;
    try {
      localStorage.setItem(this.storageKey, gender);
    } catch (e) {
      // プライベートブラウズ等で保存できなくても、現在の画面では切り替える。
    }
    if (this.el) {
      this.el.innerHTML = this.svg();
      this.el.dataset.gender = gender;
      this.el.setAttribute('aria-label', 'トレーナーに話しかける（' +
        (gender === 'male' ? '男性' : '女性') + '）');
      this.applyState();
    }
    return true;
  },

  /** SVGアバター。顔・髪・服装をパーツ化し、既存の口アニメーション用クラスを維持。 */
  svg: function () {
    var c = AVATAR_COLORS;
    var female = this.currentGender === 'female';
    var hairBack = female
      ? '<path class="av-hair-back" d="M15 34 Q10 8 32 7 Q55 7 51 34 L49 49 L43 53 L43 29 Q32 18 21 29 L21 51 L15 47 Z" fill="' + c.head + '"/>'
      : '<path class="av-hair-back" d="M17 29 Q13 8 32 8 Q50 8 48 29 L43 24 Q32 18 22 25 Z" fill="' + c.head + '"/>';

    var hairFront = female
      ? '<path class="av-hair-front" d="M15 31 Q12 8 32 8 Q52 8 49 31 L44 27 Q42 20 37 18 Q29 25 20 25 Z" fill="' + c.head + '"/>'
      : '<path class="av-hair-front" d="M17 26 Q15 8 32 8 Q48 8 47 26 L41 21 L36 23 L30 18 L24 24 Z" fill="' + c.head + '"/>';

    return '<svg viewBox="0 0 64 64" role="img" aria-label="' +
      (female ? '女性トレーナー' : '男性トレーナー') + '">' +
      /* 肩・ポロシャツ */
      '<path d="M8 64 L11 54 Q15 49 23 47 L41 47 Q49 49 53 54 L56 64 Z" fill="' + c.shirt + '"/>' +
      '<path d="M23 47 L32 55 L41 47 L38 64 L26 64 Z" fill="' + c.shirtLight + '"/>' +
      '<path d="M23 47 L32 55 L28 59 L21 50 Z" fill="' + c.shirtLight + '"/>' +
      '<path d="M41 47 L32 55 L36 59 L43 50 Z" fill="' + c.shirtLight + '"/>' +
      /* 髪の後ろ・耳・顔 */
      hairBack +
      '<ellipse cx="17" cy="35" rx="3.5" ry="5" fill="' + c.face + '"/>' +
      '<ellipse cx="47" cy="35" rx="3.5" ry="5" fill="' + c.face + '"/>' +
      '<ellipse cx="32" cy="34" rx="17" ry="21" fill="' + c.face + '"/>' +
      /* 首 */
      '<path d="M26 48 L26 53 Q32 58 38 53 L38 48 Z" fill="' + c.face + '"/>' +
      /* 髪の前 */
      hairFront +
      /* 眉・目 */
      '<g class="av-brows" stroke="' + c.line + '" stroke-width="1.5" stroke-linecap="round" fill="none">' +
        '<path d="M21 29 Q25 27 28 29"/><path d="M36 29 Q40 27 43 29"/>' +
      '</g>' +
      '<g class="av-eyes"><ellipse cx="24.5" cy="33.5" rx="2.3" ry="2.8" fill="' + c.line + '"/>' +
        '<ellipse cx="39.5" cy="33.5" rx="2.3" ry="2.8" fill="' + c.line + '"/>' +
        '<circle cx="25.2" cy="32.6" r="0.8" fill="#fff"/><circle cx="40.2" cy="32.6" r="0.8" fill="#fff"/></g>' +
      /* 頬・鼻・口 */
      '<ellipse cx="20" cy="39" rx="3" ry="1.8" fill="' + c.cheek + '" opacity=".7"/>' +
      '<ellipse cx="44" cy="39" rx="3" ry="1.8" fill="' + c.cheek + '" opacity=".7"/>' +
      '<path d="M32 35.5 L30.8 39" stroke="#d0a58f" stroke-width="1.2" stroke-linecap="round" fill="none"/>' +
      '<path class="av-smile" d="M26 42 Q32 47 38 42" stroke="' + c.line + '" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
      '<ellipse class="av-mouth" cx="32" cy="43" rx="3.8" ry="3" fill="' + c.mouth + '"/>' +
      '</svg>';
  },

  init: function () {
    var savedGender = 'male';
    try {
      var stored = localStorage.getItem(this.storageKey);
      if (stored === 'male' || stored === 'female') savedGender = stored;
    } catch (e) {}

    this.currentGender = savedGender;
    var el = document.createElement('button');
    el.id = 'avatar';
    el.className = 'avatar';
    el.hidden = true;
    el.type = 'button';
    el.setAttribute('aria-label', 'トレーナーに話しかける');
    el.innerHTML = this.svg();
    el.dataset.gender = this.currentGender;
    document.body.appendChild(el);
    this.el = el;

    var self = this;
    el.addEventListener('click', function () {
      if (typeof VoiceUI !== 'undefined' && VoiceUI.btn && typeof VoiceUI.btn.click === 'function') {
        VoiceUI.btn.click();
      }
    });
    this.applyState();
  },

  show: function (on) {
    if (this.el) this.el.hidden = !on;
    document.body.classList.toggle('has-avatar', !!on);
  },

  /** 互換性を維持した状態管理 */
  setState: function (state) {
    var allowed = ['idle', 'listening', 'speaking', 'success', 'confirming', 'error'];
    if (allowed.indexOf(state) === -1) return false;
    this.currentState = state;
    this.applyState();
    return true;
  },

  applyState: function () {
    if (!this.el) return;
    var states = ['idle', 'listening', 'speaking', 'success', 'confirming', 'error'];
    for (var i = 0; i < states.length; i++) this.el.classList.remove('state-' + states[i]);
    this.el.classList.add('state-' + this.currentState);
    this.el.classList.toggle('listening', this.currentState === 'listening');
    this.el.classList.toggle('talking', this.currentState === 'speaking');
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
      }, 1500 + String(text || '').length * 160);
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

  /** 一人称（男性トレーナーは「ぼく」、女性トレーナーは「わたし」） */
  me: function () { return this.currentGender === 'female' ? 'わたし' : 'ぼく'; },

  /** 読み上げの区切りごとに口を大きく開ける */
  pulse: function () {
    if (!this.el) return;
    this.el.classList.remove('pulse');
    void this.el.offsetWidth;
    this.el.classList.add('pulse');
    var el = this.el;
    setTimeout(function () { if (el) el.classList.remove('pulse'); }, 260);
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
   * 見た目を選ぶ小さな画面（ホームの「トレーナー設定」から開く）
   */
  openAppearancePicker: function () {
    var existing = document.getElementById('avatarAppearancePicker');
    if (existing) {
      existing.hidden = !existing.hidden;
      return;
    }

    var panel = document.createElement('div');
    panel.id = 'avatarAppearancePicker';
    panel.className = 'avatar-picker';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'トレーナーの見た目を選択');

    var title = document.createElement('div');
    title.className = 'avatar-picker-title';
    title.textContent = 'トレーナーの見た目';
    panel.appendChild(title);

    var self = this;
    [
      { gender: 'male', label: '男性トレーナー' },
      { gender: 'female', label: '女性トレーナー' }
    ].forEach(function (item) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn sub avatar-picker-option';
      button.textContent = item.label;
      button.setAttribute('aria-pressed', String(self.currentGender === item.gender));
      button.addEventListener('click', function () {
        self.setGender(item.gender);
        var options = panel.querySelectorAll('.avatar-picker-option');
        for (var i = 0; i < options.length; i++) {
          options[i].setAttribute('aria-pressed', String(i === (item.gender === 'male' ? 0 : 1)));
        }
        panel.hidden = true;
      });
      panel.appendChild(button);
    });

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn ghost avatar-picker-close';
    close.textContent = '閉じる';
    close.addEventListener('click', function () { panel.hidden = true; });
    panel.appendChild(close);

    document.body.appendChild(panel);
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
    setTimeout(function () {
      if (S.view === 'home' && VoiceUI.box.hidden) VoiceUI.show('', text);
    }, 600);
  }
};

var Talk = {
  pick: function (list) { return list[Math.floor(Math.random() * list.length)]; },
  ok: function () { return this.pick(['了解！', 'オッケー！', 'わかった！', 'はーい！']); },
  nice: function () { return this.pick(['ナイス！', 'いいね！', 'その調子！', 'いい感じ！']); },
  sorry: function () { return this.pick(['ごめんね、', 'ごめん、', 'うーん、']); }
};

Avatar.init();
