/**
 * avatar.js ― 話しかけると返事をするアバター（Phase 3f）
 *
 *   画面の左下（マイクボタンの左）にアバターを表示する。
 *   ・読み上げている間は口が動く（Speech.speak から Avatar.talk を呼ぶ）
 *   ・聞き取り中は耳を澄ましている顔になる（Avatar.listen）
 *   ・返事は、アバターの吹き出し（#voiceBox）に名前つきで表示する（commands.js の VoiceUI.show）
 *   ・アバターをタップしても話しかけられる（マイクボタンと同じ）
 *   名前は設定シート「キャラクターの名前」（初期値: コーチ）。絵はSVGで描いているので、色は AVATAR_COLORS で変えられる。
 *
 *   Talk … 返事に添える、ちょっとした言葉（毎回同じにならないように、いくつかの中から選ぶ）
 */
var AVATAR_COLORS = { head: '#5b8def', face: '#fff5ea', band: '#ff7a59', cheek: '#ffb3a7', line: '#2b2f3a' };

var Avatar = {
  el: null, talkTimer: null,

  name: function () { return (S.home && S.home.avatarName) || 'コーチ'; },

  /** アバターのSVG（丸い頭にヘッドバンドを巻いた、オリジナルのトレーナーキャラクター） */
  svg: function () {
    var c = AVATAR_COLORS;
    return '<svg viewBox="0 0 64 64" aria-hidden="true">' +
      '<circle cx="32" cy="34" r="27" fill="' + c.head + '"/>' +                            // 頭
      '<ellipse cx="32" cy="38" rx="20" ry="18" fill="' + c.face + '"/>' +                 // 顔
      '<rect x="7" y="17" width="50" height="8" rx="4" fill="' + c.band + '"/>' +          // ヘッドバンド
      '<path d="M50 19 l9 -5 l-2 8 z" fill="' + c.band + '"/>' +                            // バンドの結び目
      '<g class="av-eyes"><ellipse cx="24" cy="35" rx="3" ry="3.6" fill="' + c.line + '"/><ellipse cx="40" cy="35" rx="3" ry="3.6" fill="' + c.line + '"/>' +
      '<circle cx="25" cy="33.8" r="1" fill="#fff"/><circle cx="41" cy="33.8" r="1" fill="#fff"/></g>' +
      '<ellipse cx="18" cy="42" rx="3.5" ry="2.2" fill="' + c.cheek + '"/><ellipse cx="46" cy="42" rx="3.5" ry="2.2" fill="' + c.cheek + '"/>' +
      '<path class="av-smile" d="M26 44 q6 5 12 0" stroke="' + c.line + '" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +   // 閉じた口（笑顔）
      '<ellipse class="av-mouth" cx="32" cy="45.5" rx="4.6" ry="3.6" fill="#c2423b"/>' +   // 開いた口（話している間だけ動く）
      '</svg>';
  },

  init: function () {
    var el = document.createElement('button');
    el.id = 'avatar'; el.className = 'avatar'; el.hidden = true;
    el.setAttribute('aria-label', '話しかける');
    el.innerHTML = this.svg();
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', function () { VoiceUI.btn.click(); });   // アバターをタップ＝マイクボタン
  },

  show: function (on) { if (this.el) this.el.hidden = !on; document.body.classList.toggle('has-avatar', !!on); },

  /** 話している間は口を動かす。onend が来ない端末のため、文の長さから決めた時間で必ず止める */
  talk: function (on, text) {
    if (!this.el) return;
    clearTimeout(this.talkTimer);
    this.el.classList.toggle('talking', !!on);
    if (on) {
      var self = this;
      this.talkTimer = setTimeout(function () { self.el.classList.remove('talking'); }, 1500 + String(text || '').length * 160);
    }
  },

  /** 聞き取り中の顔 */
  listen: function (on) { if (this.el) this.el.classList.toggle('listening', !!on); },

  /** 読み上げの区切りごとに口を大きく開ける（対応している端末だけ） */
  pulse: function () {
    if (!this.el) return;
    this.el.classList.remove('pulse'); void this.el.offsetWidth; this.el.classList.add('pulse');
  },

  /** ホームを開いたときのひとこと（アプリを開いて最初の1回だけ。声は出さず吹き出しだけ） */
  greet: function () {
    if (this.greeted || !S.home || S.view !== 'home' || !VoiceInput.supported()) return;
    this.greeted = true;
    var h = S.home, hour = new Date().getHours();
    var hello = hour < 10 ? 'おはよう' : hour < 18 ? 'こんにちは' : 'おつかれさま';
    var first = h.suggestion && h.suggestion.order && h.suggestion.order[0];
    var text = h.name + 'さん、' + hello + '！' + (S.draft ? '途中のトレーニングがあるよ。「続きから」で再開できるよ。'
      : first ? '今日はDay' + first + 'がおすすめだよ。' : (h.myMenus && h.myMenus.length ? '保存したメニューから始められるよ。' : '')) +
      '話しかけるときは、ぼくかマイクのボタンを押してね。';
    setTimeout(function () { if (S.view === 'home' && VoiceUI.box.hidden) VoiceUI.show('', text); }, 600);
  }
};

var Talk = {
  pick: function (list) { return list[Math.floor(Math.random() * list.length)]; },
  ok: function () { return this.pick(['了解！', 'オッケー！', 'わかった！', 'はーい！']); },
  nice: function () { return this.pick(['ナイス！', 'いいね！', 'その調子！', 'いい感じ！']); },
  sorry: function () { return this.pick(['ごめんね、', 'ごめん、', 'うーん、']); }
};

Avatar.init();
