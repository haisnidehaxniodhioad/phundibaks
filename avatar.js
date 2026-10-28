/**
 * avatar.js ― 話しかけると返事をするアバター（Phase 3f、v3iで男女の切り替えと表情、v3k〜v5で絵と動き、v6でデザインシートに合わせて描き直し・色の切り替え）
 *
 *   Avatar.talk / listen / pulse / greet … 話している間は口を動かす・聞き取り中の顔・ホームのあいさつ
 *   Avatar.feedback('success'|'confirming'|'error') … 結果の表情（読み上げ中なら、読み上げのあとに出す）
 *   Avatar.setGender('male'|'female') / Avatar.setColor('blue'|'gray'|'pink'|'purple') … 見た目の切り替え。
 *     ホームの「トレーナー設定」から選ぶ（この端末に保存）。色は下の AVATAR_COLORS で変えられる
 *   表情は style.css の .avatar.state-○○ で、SVGのパーツ（av-eyes / av-brows / av-smile / av-frown /
 *   av-confirm-mouth / av-mouth）の見せ方を変えて作っている。パーツのクラス名は変えないこと。
 *   Talk … 返事に添える、ちょっとした言葉（毎回同じにならないように、いくつかの中から選ぶ）
 */
/**
 * アバターの色。ジャケットの色は4種類から選べる（ホームの「トレーナー設定」）。
 * 色を変えたいときは、ここの色コード（#から始まる6桁）を書き換える。
 *   main … ジャケットの色 / light … 明るい部分 / dark … 影の部分 / label … 選ぶ画面に出る名前
 */
var AVATAR_COLORS = {
  skin: '#fde3d2', skinShade: '#f3c7ae', cheek: '#f29c94', line: '#2a1d1a',
  hair: { male: ['#3b302c', '#211a18'], female: ['#8a5536', '#5a3322'] },   // 髪の色（明るい所・暗い所）
  eye: { male: ['#7a4c2c', '#3a2214'], female: ['#8a5530', '#40240f'] },    // 瞳の色
  inner: { male: '#1d2436', female: '#eef0f4' },                             // ジャケットの中のシャツ
  jackets: {
    blue:   { main: '#1f3a6b', light: '#2f5596', dark: '#13264a', label: 'ブルー（標準）' },
    gray:   { main: '#4a4f58', light: '#666c77', dark: '#30343b', label: 'グレー' },
    pink:   { main: '#d65a91', light: '#e985b1', dark: '#ad3c70', label: 'ピンク' },
    purple: { main: '#7657c4', light: '#9579d8', dark: '#573ba3', label: 'パープル' }
  }
};

var Avatar = {
  el: null,
  talkTimer: null,
  feedbackTimer: null,
  pendingFeedback: null,
  currentGender: 'male',
  currentColor: 'blue',
  currentState: 'idle',
  greeted: false,
  storageKey: 'trainingAvatarGender',
  colorKey: 'trainingAvatarColor',
  motionEnabled: true,

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
    try { localStorage.setItem(this.storageKey, gender); } catch (e) { /* 保存できなくても、今の画面では切り替える */ }
    this.redraw();
    return true;
  },

  /** ジャケットの色を切り替える（'blue' | 'gray' | 'pink' | 'purple'）。選択はこのブラウザに保存する。 */
  setColor: function (color) {
    if (!AVATAR_COLORS.jackets[color]) return false;
    this.currentColor = color;
    try { localStorage.setItem(this.colorKey, color); } catch (e) {}
    this.redraw();
    return true;
  },

  /** 今の性別・色で絵を描き直す */
  redraw: function () {
    if (!this.el) return;
    var g = this.currentGender === 'male' ? '男性' : '女性';
    this.el.innerHTML = this.svg();
    this.el.dataset.gender = this.currentGender;
    this.el.dataset.jacket = this.currentColor;
    this.el.setAttribute('aria-label', 'トレーナーに話しかける（' + g + '）');
    this.el.setAttribute('title', g + 'トレーナー：タップして話しかける');
    this.applyState();
  },

  /**
   * アバターの絵（SVG）。デザインシート「アバターのデザイン（完成版）」をもとに描いている。
   * 表情は style.css の .avatar.state-○○ で、下のパーツ（class="av-…"）の見せ方を変えて作っている。
   *   av-head … 頭全体（確認のときに少し首をかしげる） / av-eyes … ふだんの目（まばたき）
   *   av-eyes-happy … 笑った目（成功） / av-brows … 眉 / av-smile … ふだんの口
   *   av-mouth（＋av-mouth-teeth）… 話している口 / av-grin … 成功の笑顔 / av-confirm-mouth … 確認の口
   *   av-frown … 困った口 / av-waves … 聞き取り中の音の線 / av-hand … 確認のときのあごに手
   *   av-q … 確認の「？」 / av-sweat … エラーの汗
   * パーツのクラス名は変えないこと（変えると表情が動かなくなる）。
   */
  svg: function () {
    var c = AVATAR_COLORS;
    var female = this.currentGender === 'female';
    var g = female ? 'female' : 'male';
    var j = c.jackets[this.currentColor] || c.jackets.blue;
    var hair = 'url(#avHair)';

    // 髪（後ろ）…顔より奥に描く部分。女性はポニーテールも
    var hairBack = female
      ? '<path d="M85 30 Q106 33 107 58 Q108 82 98 100 Q92 108 88 102 Q96 84 94 64 Q93 46 83 40 Z" fill="' + hair + '"/>' +
        '<path d="M97 50 Q102 70 94 94" stroke="#a8714c" stroke-width="1.3" fill="none" opacity=".7"/>' +
        '<path d="M29 60 Q24 26 50 15 Q78 7 95 28 Q103 42 99 62 L96 66 L32 66 Z" fill="' + hair + '"/>'
      : '<path d="M30 54 Q25 22 50 14 Q74 7 92 21 Q103 33 98 55 L95 64 L33 64 Z" fill="' + hair + '"/>';

    // 髪（前）…前髪と、顔の横にかかる毛
    var hairFront = female
      ? '<path d="M31 60 Q25 27 52 17 Q79 9 94 31 Q99 43 97 60 L94 49 Q91 39 85 33 Q84 39 80 41 Q78 36 70 33 Q66 40 60 42 Q60 35 54 31 Q48 37 41 38 Q38 45 35 54 Z" fill="' + hair + '"/>' +
        '<path d="M35 44 Q28 60 32 82 Q34 72 36 64 Q35.5 54 37.5 47 Z M93 44 Q100 60 96 82 Q94 72 92 64 Q92.5 54 90.5 47 Z" fill="' + hair + '"/>' +
        '<path d="M44 24 Q58 16 74 19 M80 22 Q88 27 91 36" stroke="#b07a52" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".75"/>'
      : '<path d="M30 52 Q27 30 38 21 Q42 12 52 13 Q56 6 64 9 Q70 4 78 9 Q88 8 92 18 Q100 26 99 40 L97 52 Q94 42 88 37 L86 45 Q81 35 74 33 L70 41 Q64 32 56 34 L51 43 Q47 36 42 38 L37 47 Q33 45 30 52 Z" fill="' + hair + '"/>' +
        '<path d="M63 10 Q63 1 72 2 Q66 5 67 10 Z" fill="' + hair + '"/>' +
        '<path d="M46 22 Q58 16 70 18 M76 20 Q86 24 90 32" stroke="#6b5a54" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".7"/>';

    // 目（左右）。cx = 目の中心
    var eye = function (cx, side) {
      var out = side < 0 ? cx - 9.5 : cx + 9.5;   // 目尻の位置
      return '<path d="M' + (cx - 9) + ' 55 Q' + cx + ' 47 ' + (cx + 9) + ' 55 Q' + (cx + 7) + ' 62.5 ' + cx + ' 63 Q' + (cx - 7) + ' 62.5 ' + (cx - 9) + ' 55 Z" fill="#fff"/>' +
        '<ellipse cx="' + cx + '" cy="56.3" rx="4.7" ry="5.7" fill="url(#avIris)"/>' +
        '<ellipse cx="' + cx + '" cy="56.6" rx="2.3" ry="3" fill="#1c1210"/>' +
        '<circle cx="' + (cx + 1.9) + '" cy="54" r="1.7" fill="#fff"/><circle cx="' + (cx - 1.8) + '" cy="59" r=".8" fill="#fff" opacity=".85"/>' +
        '<path d="M' + (cx - 9.5) + ' 55 Q' + cx + ' 46 ' + (cx + 9.5) + ' 54.5" stroke="' + c.line + '" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
        (female ? '<path d="M' + out + ' ' + (side < 0 ? 55 : 54.5) + ' l' + (side * 3.2) + ' -2.4" stroke="' + c.line + '" stroke-width="1.8" stroke-linecap="round"/>' : '') +
        '<path d="M' + (cx - 3) + ' 62.6 Q' + cx + ' 63.3 ' + (cx + 3) + ' 62.6" stroke="#d7a18c" stroke-width=".8" fill="none" opacity=".6"/>';
    };

    var browColor = female ? '#5e3a2a' : '#241b18';
    var browWidth = female ? 2.2 : 3.2;
    var brows = female
      ? '<path d="M40 45 Q48 40.5 56 43.5"/><path d="M72 43.5 Q80 40.5 88 45"/>'
      : '<path d="M39 46 Q47 40 57 44"/><path d="M71 44 Q81 40 89 46"/>';

    return '<svg viewBox="0 0 128 128" role="img" aria-label="' +
      (female ? '女性トレーナー' : '男性トレーナー') + '" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' +
        '<linearGradient id="avBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6faff"/><stop offset=".6" stop-color="#e2edff"/><stop offset="1" stop-color="#c5dbf7"/></linearGradient>' +
        '<linearGradient id="avHair" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="' + c.hair[g][0] + '"/><stop offset="1" stop-color="' + c.hair[g][1] + '"/></linearGradient>' +
        '<linearGradient id="avJacket" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + j.light + '"/><stop offset=".55" stop-color="' + j.main + '"/><stop offset="1" stop-color="' + j.dark + '"/></linearGradient>' +
        '<linearGradient id="avSkin" x1="0" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="#fff0e5"/><stop offset="1" stop-color="' + c.skin + '"/></linearGradient>' +
        '<radialGradient id="avIris" cx=".5" cy=".65" r=".6"><stop offset="0" stop-color="' + c.eye[g][0] + '"/><stop offset="1" stop-color="' + c.eye[g][1] + '"/></radialGradient>' +
      '</defs>' +
      '<circle class="av-halo" cx="64" cy="64" r="63" fill="url(#avBg)"/>' +
      /* 聞き取り中の音の線 */
      '<g class="av-waves" stroke="#efb64e" stroke-width="2.6" fill="none" stroke-linecap="round">' +
        '<path d="M20 47 Q14 57 20 67"/><path d="M13 42 Q5 57 13 72"/><path d="M108 47 Q114 57 108 67"/><path d="M115 42 Q123 57 115 72"/></g>' +
      /* 体・ジャケット */
      '<path d="M5 128 L9 112 Q15 97 40 91 L52 86 L76 86 L88 91 Q113 97 119 112 L123 128 Z" fill="url(#avJacket)"/>' +
      '<path d="M50 88 Q64 97 78 88 L77 128 L51 128 Z" fill="' + c.inner[g] + '"/>' +
      (female ? '' : '<path d="M52 90 Q64 98 76 90" stroke="#2c3550" stroke-width="2" fill="none"/>') +
      '<path d="M39 91 L52 83 L59 103 L64 111 L60 128 L40 128 Z" fill="' + j.main + '"/>' +
      '<path d="M89 91 L76 83 L69 103 L64 111 L68 128 L88 128 Z" fill="' + j.main + '"/>' +
      '<path d="M52 83 L59 103 L64 111 L69 103 L76 83" stroke="#fff" stroke-width="1.2" fill="none" opacity=".85" stroke-linejoin="round"/>' +
      '<path d="M41 91 L52 84 L57 98 L46 103 Z M87 91 L76 84 L71 98 L82 103 Z" fill="' + j.light + '" opacity=".55"/>' +
      '<path d="M64 111 L64 128" stroke="#d6dce6" stroke-width="1.6"/><rect x="62.6" y="111" width="2.8" height="5" rx="1" fill="#e8ecf2"/>' +
      '<path d="M17 112 Q26 104 38 104 M111 112 Q102 104 90 104" stroke="' + j.dark + '" stroke-width="1.4" fill="none" opacity=".7"/>' +
      '<path d="M89 117 L93.5 108 L98 117 M91 114 L96 114" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      /* 頭（髪・顔・耳）。確認のときはこのまとまりごと首をかしげる */
      '<g class="av-head">' +
        hairBack +
        '<path d="M54 74 L54 90 Q64 96 74 90 L74 74 Z" fill="url(#avSkin)"/>' +
        '<path d="M54 82 Q64 88 74 82 L74 78 Q64 85 54 78 Z" fill="' + c.skinShade + '" opacity=".8"/>' +
        '<ellipse cx="34" cy="58" rx="5.5" ry="8" fill="' + c.skin + '"/><ellipse cx="94" cy="58" rx="5.5" ry="8" fill="' + c.skin + '"/>' +
        '<path d="M33 55 Q36 53 36 60 M95 55 Q92 53 92 60" stroke="#dba48c" stroke-width="1.3" fill="none" stroke-linecap="round"/>' +
        '<path class="av-face" d="M35 46 Q35 27 64 26 Q93 27 93 46 Q93 62 87 72 Q78 86 64 88 Q50 86 41 72 Q35 62 35 46 Z" fill="url(#avSkin)" stroke="#e8b9a3" stroke-width=".8"/>' +
        hairFront +
        '<g class="av-brows" stroke="' + browColor + '" stroke-width="' + browWidth + '" stroke-linecap="round" fill="none">' + brows + '</g>' +
        '<g class="av-eyes"><g class="av-eye-left">' + eye(48, -1) + '</g><g class="av-eye-right">' + eye(80, 1) + '</g></g>' +
        '<g class="av-eyes-happy" stroke="' + c.line + '" stroke-width="2.6" fill="none" stroke-linecap="round"><path d="M40 58 Q48 49 56 58"/><path d="M72 58 Q80 49 88 58"/></g>' +
        '<ellipse class="av-cheek" cx="45" cy="68" rx="5.8" ry="3.3" fill="' + c.cheek + '" opacity=".38"/><ellipse class="av-cheek" cx="83" cy="68" rx="5.8" ry="3.3" fill="' + c.cheek + '" opacity=".38"/>' +
        '<path d="M64.5 62 Q62.8 66.5 65.6 67.2" stroke="#d99f86" stroke-width="1.4" fill="none" stroke-linecap="round"/>' +
        /* 口 */
        '<path class="av-smile" d="M56 73 Q64 78.5 72 73" stroke="#8a3c40" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
        '<g class="av-mouth"><path d="M56 71.5 Q64 70.5 72 71.5 Q71 80.5 64 81 Q57 80.5 56 71.5 Z" fill="#8b333e"/>' +
          '<path d="M60 78.6 Q64 76.4 68 78.6 Q64 80.6 60 78.6 Z" fill="#e2797f"/>' +
          '<path class="av-mouth-teeth" d="M57.6 72 Q64 71.3 70.4 72 L69.8 73.8 Q64 74.5 58.2 73.8 Z" fill="#fff"/></g>' +
        '<g class="av-grin"><path d="M53.5 70.5 Q64 72.5 74.5 70.5 Q73 83 64 83.5 Q55 83 53.5 70.5 Z" fill="#8b333e"/>' +
          '<path d="M55.5 71.3 Q64 73 72.5 71.3 L72 73.6 Q64 75 56 73.6 Z" fill="#fff"/><path d="M58.5 80 Q64 76.6 69.5 80 Q64 83 58.5 80 Z" fill="#e2797f"/></g>' +
        '<path class="av-confirm-mouth" d="M58 74.5 Q64 75.8 70 73.6" stroke="#8a3c40" stroke-width="2.1" fill="none" stroke-linecap="round"/>' +
        '<path class="av-frown" d="M57.5 76.5 Q64 72 70.5 76.5" stroke="#8a3c40" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
        '<path class="av-sweat" d="M98 31 Q93 39 95 42 Q98 45.5 101 42 Q103 39 98 31 Z" fill="#a9d6f7" stroke="#5d9fd9" stroke-width="1"/>' +
      '</g>' +
      /* 確認：あごに手、「？」 */
      '<g class="av-hand"><path d="M70 128 L75 104 L91 104 L89 128 Z" fill="' + j.main + '"/><path d="M74 104 L92 104" stroke="' + j.light + '" stroke-width="2"/>' +
        '<path d="M73 93 Q71 85 77 83 Q85 82 87 89 Q89 98 83 104 L75 104 Q71 100 73 93 Z" fill="url(#avSkin)" stroke="#e0ac95" stroke-width=".8"/>' +
        '<path d="M75 89 Q81 87 86 90 M75 94 Q81 92 86.5 95 M75.5 99 Q80 97.5 85 99.5" stroke="#dba48c" stroke-width="1" fill="none" stroke-linecap="round"/></g>' +
      '<text class="av-q" x="104" y="34" font-size="20" font-weight="900" fill="#8b6fd6" font-family="sans-serif">?</text>' +
      '</svg>';
  },
  init: function () {
    var savedGender = 'male';
    try {
      var stored = localStorage.getItem(this.storageKey);
      if (stored === 'male' || stored === 'female') savedGender = stored;
    } catch (e) {}

    this.currentGender = savedGender;
    try {
      var storedColor = localStorage.getItem(this.colorKey);
      if (AVATAR_COLORS.jackets[storedColor]) this.currentColor = storedColor;
    } catch (e) {}
    var el = document.createElement('button');
    el.id = 'avatar';
    el.className = 'avatar';
    el.hidden = true;
    el.type = 'button';
    el.setAttribute('aria-label', 'トレーナーに話しかける');
    el.setAttribute('title', 'タップしてトレーナーに話しかける');
    el.innerHTML = this.svg();
    el.dataset.gender = this.currentGender;
    el.dataset.jacket = this.currentColor;
    document.body.appendChild(el);
    this.el = el;

    var self = this;
    el.addEventListener('click', function () {
      if (typeof VoiceUI !== 'undefined' && VoiceUI.btn && typeof VoiceUI.btn.click === 'function') {
        VoiceUI.btn.click();
      }
    });
    this.applyState();
    this.bindGlobalPickerDismiss();
  },

  bindGlobalPickerDismiss: function () {
    if (this._pickerDismissBound) return;
    this._pickerDismissBound = true;
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        var panel = document.getElementById('avatarAppearancePicker');
        if (panel) panel.hidden = true;
      }
    });
    // パネルの外をタップしても閉じる（「トレーナー設定」のボタン自体は除く）
    document.addEventListener('pointerdown', function (event) {
      var panel = document.getElementById('avatarAppearancePicker');
      if (panel && !panel.hidden && !panel.contains(event.target) && !event.target.closest('[data-act="avatarSettings"]')) panel.hidden = true;
    }, true);
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

  /** 自分の呼び方（男性トレーナーは「ぼく」、女性トレーナーは「わたし」） */
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
   * 見た目を選ぶパネル（ホームの「トレーナー設定」から開く）。
   * 種類（男性・女性）とジャケットの色を選べる。選んだ内容はこのブラウザに保存される。
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

    var colors = Object.keys(AVATAR_COLORS.jackets).map(function (key) {
      var j = AVATAR_COLORS.jackets[key];
      return '<button type="button" class="avatar-swatch" data-color="' + key + '" title="' + j.label + '" aria-label="' + j.label +
        '" style="background:' + j.main + '"></button>';
    }).join('');
    panel.innerHTML =
      '<div class="avatar-picker-title">トレーナー設定</div>' +
      '<div class="avatar-picker-row"><span class="avatar-picker-label">名前</span><span class="avatar-picker-name"></span></div>' +
      '<div class="avatar-picker-row"><span class="avatar-picker-label">種類</span>' +
        '<span class="avatar-picker-genders"><button type="button" class="btn sub avatar-picker-option" data-gender="male">男性</button>' +
        '<button type="button" class="btn sub avatar-picker-option" data-gender="female">女性</button></span></div>' +
      '<div class="avatar-picker-row"><span class="avatar-picker-label">色</span><span class="avatar-swatches">' + colors + '</span></div>' +
      '<div class="avatar-picker-description">種類と色はこの端末に保存されます。名前は「設定」シートの「キャラクターの名前」で変えられます。</div>' +
      '<button type="button" class="btn ghost avatar-picker-close">閉じる</button>';

    panel.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.gender) self.setGender(t.dataset.gender);
      else if (t.dataset.color) self.setColor(t.dataset.color);
      else if (t.classList.contains('avatar-picker-close')) { panel.hidden = true; return; }
      self.refreshPicker(panel);
    });
    document.body.appendChild(panel);
    this.refreshPicker(panel);
  },

  /** パネルの「選んでいる印」を今の設定に合わせる */
  refreshPicker: function (panel) {
    var self = this;
    panel.querySelector('.avatar-picker-name').textContent = this.name();
    Array.prototype.forEach.call(panel.querySelectorAll('[data-gender]'), function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.gender === self.currentGender));
    });
    Array.prototype.forEach.call(panel.querySelectorAll('[data-color]'), function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.color === self.currentColor));
    });
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
