/**
 * avatar.js ― 話しかけると返事をするアバター（Phase 3f、v3iで男女の切り替えと表情、v3kで絵を描き直し）
 *
 *   Avatar.talk / listen / pulse / greet … 話している間は口を動かす・聞き取り中の顔・ホームのあいさつ
 *   Avatar.feedback('success'|'confirming'|'error') … 結果の表情（読み上げ中なら、読み上げのあとに出す）
 *   Avatar.setGender('male'|'female') … 見た目の切り替え。ホームの「トレーナー設定」から選ぶ（この端末に保存）
 *   表情は style.css の .avatar.state-○○ で、SVGのパーツ（av-eyes / av-brows / av-smile / av-frown /
 *   av-confirm-mouth / av-mouth）の見せ方を変えて作っている。パーツのクラス名は変えないこと。
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

  /** 表情をCSSから切り替えられるSVGアバター。外部画像素材は使用しない。 */
  svg: function () {
    var c = AVATAR_COLORS;
    var female = this.currentGender === 'female';
    var hairBack = female
      ? '<path class="av-hair-back" d="M17 42 Q10 13 31 8 Q54 4 59 28 Q62 41 56 64 L48 75 L43 45 L22 43 L20 70 L13 60 Z" fill="url(#avHair)"/>'
      : '<path class="av-hair-back" d="M17 40 Q11 13 31 8 Q52 5 57 28 L53 48 L18 48 Z" fill="url(#avHair)"/>';
    var hairFront = female
      ? '<path class="av-hair-front" d="M15 34 Q12 8 34 7 Q55 7 57 31 L49 27 Q43 19 37 18 Q28 27 18 29 Z" fill="url(#avHair)"/><path d="M18 29 Q17 41 21 48" stroke="' + c.head + '" stroke-width="3" fill="none" stroke-linecap="round"/>'
      : '<path class="av-hair-front" d="M15 32 Q12 8 34 7 Q54 7 56 29 L49 23 L43 25 L36 18 L28 25 L21 23 Z" fill="url(#avHair)"/>';
    var lashes = female
      ? '<path d="M22 36 l-2 -2 M26 34 l-1 -2 M45 36 l2 -2 M41 34 l1 -2" stroke="' + c.line + '" stroke-width="1.2" stroke-linecap="round"/>'
      : '';
    return '<svg viewBox="0 0 72 80" role="img" aria-label="' +
      (female ? '女性トレーナー' : '男性トレーナー') + '" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' +
        '<linearGradient id="avBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eef4ff"/><stop offset="1" stop-color="#cbdcff"/></linearGradient>' +
        '<linearGradient id="avHair" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b3540"/><stop offset="1" stop-color="' + c.head + '"/></linearGradient>' +
        '<linearGradient id="avShirt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3c5d91"/><stop offset="1" stop-color="' + c.shirt + '"/></linearGradient>' +
      '</defs>' +
      '<circle class="av-halo" cx="36" cy="39" r="37" fill="url(#avBg)"/>' +
      '<circle cx="36" cy="39" r="34.5" fill="none" stroke="#ffffff" stroke-opacity=".7" stroke-width="1.5"/>' +
      /* 肩とトレーナー用ジャケット */
      '<path d="M5 80 L8 65 Q12 57 24 55 L48 55 Q60 57 64 65 L67 80 Z" fill="url(#avShirt)"/>' +
      '<path d="M24 55 L36 65 L48 55 L45 80 L27 80 Z" fill="#f7f9ff"/>' +
      '<path d="M24 55 L36 65 L30 70 L21 59 Z M48 55 L36 65 L42 70 L51 59 Z" fill="#ffffff"/>' +
      '<path d="M35.8 65 L35.8 79" stroke="#cbd5e8" stroke-width="1.1"/>' +
      '<circle cx="39" cy="71" r="1" fill="#7b8cab"/><circle cx="39" cy="76" r="1" fill="#7b8cab"/>' +
      /* 首と耳 */
      hairBack +
      '<path d="M26 48 L26 58 Q36 65 46 58 L46 48 Z" fill="' + c.face + '"/>' +
      '<ellipse cx="18.5" cy="39" rx="4.2" ry="6" fill="' + c.face + '"/><ellipse cx="53.5" cy="39" rx="4.2" ry="6" fill="' + c.face + '"/>' +
      '<path d="M16 37 Q18 33 21 38 M51 38 Q54 33 56 37" stroke="#d39e89" stroke-width="1" fill="none"/>' +
      /* 顔 */
      '<path class="av-face" d="M19 29 Q19 17 36 16 Q53 17 53 29 L51 43 Q48 54 36 56 Q24 54 21 43 Z" fill="' + c.face + '"/>' +
      '<path d="M22 44 Q24 51 31 53" stroke="#e7bca7" stroke-width="1.1" fill="none" opacity=".8"/>' +
      hairFront +
      /* 眉 */
      '<g class="av-brows" stroke="' + c.line + '" stroke-width="1.7" stroke-linecap="round" fill="none"><path d="M23 31 Q27 28 31 31"/><path d="M41 31 Q45 28 49 31"/></g>' +
      /* 目とハイライト */
      '<g class="av-eyes"><g class="av-eye-left"><ellipse cx="27" cy="36" rx="3.1" ry="3.7" fill="#fff"/><ellipse cx="27.5" cy="36.4" rx="1.9" ry="2.6" fill="#293446"/><circle cx="28.2" cy="35.4" r=".85" fill="#fff"/></g>' +
      '<g class="av-eye-right"><ellipse cx="45" cy="36" rx="3.1" ry="3.7" fill="#fff"/><ellipse cx="45.5" cy="36.4" rx="1.9" ry="2.6" fill="#293446"/><circle cx="46.2" cy="35.4" r=".85" fill="#fff"/></g></g>' + lashes +
      /* 頬・鼻・口 */
      '<ellipse class="av-cheek av-cheek-left" cx="22.5" cy="43" rx="4" ry="2.2" fill="' + c.cheek + '" opacity=".6"/><ellipse class="av-cheek av-cheek-right" cx="49.5" cy="43" rx="4" ry="2.2" fill="' + c.cheek + '" opacity=".6"/>' +
      '<path d="M36 37 L34.5 41 Q36 42.5 38 41" stroke="#d09e87" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
      '<path class="av-smile" d="M29 46 Q36 52 43 46" stroke="' + c.line + '" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
      '<path class="av-frown" d="M30 49 Q36 44 42 49" stroke="' + c.line + '" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
      '<path class="av-confirm-mouth" d="M31 48 Q36 49.5 41 48" stroke="' + c.line + '" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
      '<ellipse class="av-mouth" cx="36" cy="47.3" rx="4.3" ry="2.7" fill="' + c.mouth + '"/>' +
      '<path class="av-mouth-teeth" d="M33 46.4 Q36 47.5 39 46.4" stroke="#fff" stroke-width="1.2" stroke-linecap="round" fill="none"/>' +
      /* 小さな胸元ロゴ */
      '<circle cx="53" cy="68" r="3.2" fill="#eaf1ff"/><path d="M51.5 68 L53 66.5 L54.5 68 L53 69.5 Z" fill="#5273b5"/>' +
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
    title.textContent = 'トレーナーを選ぶ';
    panel.appendChild(title);

    var self = this;
    [
      { gender: 'male', label: '👨 男性トレーナー' },
      { gender: 'female', label: '👩 女性トレーナー' }
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
