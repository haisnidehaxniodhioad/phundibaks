/**
 * speech.js ― 読み上げ（音声合成）と、読み上げる文章の組み立て
 * あわせて、レスト終了のアラーム音（Sound）もここにまとめている。
 */
var Speech = {
  supported: 'speechSynthesis' in window,
  unlocked: false,
  micEndedAt: 0,   // 音声認識が終わった時刻（voice.js が記録する）

  /**
   * 声の速さ（トレーナー設定で選ぶ。この端末に保存）。数字を大きくすると速くなる（1 がふつうの速さ）。
   */
  RATES: [
    { key: 'slow', label: 'ゆっくり', rate: 0.9 },
    { key: 'normal', label: 'ふつう', rate: 1.05 },
    { key: 'fast', label: 'はやい', rate: 1.25 },
    { key: 'faster', label: 'とてもはやい', rate: 1.5 }
  ],
  rateKey: 'normal',
  storageKey: 'trainingVoiceRate',
  rate: function () {
    var k = this.rateKey, r = this.RATES.filter(function (x) { return x.key === k; })[0];
    return r ? r.rate : 1.05;
  },
  setRate: function (key) {
    if (!this.RATES.some(function (x) { return x.key === key; })) return;
    this.rateKey = key;
    try { localStorage.setItem(this.storageKey, key); } catch (e) {}
  },

  /**
   * 男性・女性で声を変える（Phase 3v）。
   * 端末に入っている日本語の声から、男性・女性の声を名前で探して使う（見つからなければ、ふつうの声のまま高さだけ変える）。
   *   男性の声の名前の例：Otoya（iPhone）、Ichiro・Keita（Windows）
   *   女性の声の名前の例：Kyoko（iPhone）、Haruka・Ayumi・Nanami（Windows）、Google 日本語（Android など）
   * 高さ（pitch）は 1 がふつう。男性は低め、女性は少し高めにする。
   */
  MALE_VOICE: /otoya|ichiro|keita|daichi|takumi|hattori|male|男性/i,
  FEMALE_VOICE: /kyoko|haruka|ayumi|nanami|sayaka|mizuki|o-ren|female|女性|google/i,
  voices: [],
  loadVoices: function () {
    if (!this.supported) return;
    this.voices = window.speechSynthesis.getVoices().filter(function (v) { return /^ja/i.test(v.lang); });
  },
  /** 今のトレーナー（男性・女性）に合う声と高さ */
  voiceSetting: function () {
    var male = !(window.Avatar && Avatar.currentGender === 'female');
    if (!this.voices.length) this.loadVoices();
    var re = male ? this.MALE_VOICE : this.FEMALE_VOICE;
    var hit = this.voices.filter(function (v) { return re.test(v.name) && !(male && /female|女性/i.test(v.name)); })[0] || null;
    // 男性の声が見つかったときは高さを少しだけ下げる。見つからないときは、ふつうの声を低くして男性らしくする
    return { voice: hit, pitch: male ? (hit ? 0.95 : 0.7) : (hit ? 1.05 : 1.15) };
  },

  /**
   * 文章を読み上げる。前の読み上げが残っていれば止めてから読む。
   * iPhoneは、マイクを使った直後に読み上げると声が出ないことがあるため、少し待ってから読む。
   */
  speak: function (text, fromTap) {
    if (!this.supported || !text) return;
    if (fromTap) this.unlocked = true;   // タップから直接の読み上げで、以降の自動読み上げも使えるようになる
    var wait = Date.now() - this.micEndedAt < 1000 ? 450 : 0;
    var run = function () {
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      var vs = Speech.voiceSetting();
      try { if (vs.voice) u.voice = vs.voice; } catch (e) { /* 声を選べない端末では、ふつうの声のまま */ }
      u.pitch = vs.pitch;
      u.rate = Speech.rate();
      u.volume = 1;
      u.onstart = function () { Speech.unlocked = true; };
      // アバターの口を動かす（avatar.js）。読み上げが終わったら止める
      if (window.Avatar) {
        Avatar.talk(true, text);
        u.onend = u.onerror = function () {
          Avatar.talk(false);
          if (typeof Avatar.finishFeedbackAfterSpeech === 'function') Avatar.finishFeedbackAfterSpeech();
        };
        u.onboundary = function () { Avatar.pulse(); };
      }
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();   // iPhoneで読み上げが「一時停止」のまま止まるのを防ぐ
      window.speechSynthesis.speak(u);
    };
    if (wait) setTimeout(run, wait); else run();
  },

  stop: function () { if (this.supported) window.speechSynthesis.cancel(); if (window.Avatar) Avatar.talk(false); },

  /**
   * iPhoneは「画面をタップした瞬間」に一度読み上げておかないと、
   * あとから（音声認識のあとやタイマーで）自動で読み上げられない。
   * そこでタップのたびに、まだ準備できていなければ、ほぼ無音の短い読み上げをしておく。
   * 空白だけの文はiPhoneに無視されるため、「ん」を最小音量で読む。実際に読み上げが始まったら準備完了とする。
   */
  unlock: function () {
    Sound.prepare();
    if (this.unlocked || !this.supported || this.unlocking) return;
    var self = this;
    this.unlocking = true;
    var u = new SpeechSynthesisUtterance('ん');
    u.lang = 'ja-JP';
    u.volume = 0.01;
    u.rate = 2;
    u.onstart = function () { self.unlocked = true; };
    u.onend = u.onerror = function () { self.unlocking = false; };
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(u);
    setTimeout(function () { self.unlocking = false; }, 1500);
  },

  /** 「Day2」を読み上げで「デイ2」と読ませる */
  dayText: function (day) { return 'デイ' + day; },

  /**
   * テンポの表記を、読み上げ・表示用の説明にする。
   *   '203' → 2秒で下ろし、止めずに、3秒で上げる
   *   'X'   → できるだけ素早く、爆発的に
   */
  tempoText: function (tempo) {
    var t = String(tempo || '').trim().toUpperCase();
    if (!t || t === '-') return '';
    if (t === 'X') return 'できるだけ素早く、爆発的に行います';
    if (!/^[0-9X]{3,4}$/.test(t)) return 'テンポは' + t;
    var down = t[0], pause = t[1], up = t[2];
    var parts = [];
    parts.push(down === 'X' || down === '0' ? '素早く下ろし' : down + '秒で下ろし');
    parts.push(pause === '0' ? '止めずに' : (pause === 'X' ? '止めずに' : pause + '秒止めて'));
    parts.push(up === 'X' || up === '0' ? '素早く上げます' : up + '秒で上げます');
    return parts.join('、');
  },

  /** 種目の内容を読み上げる文章にする */
  exerciseText: function (item, latest) {
    var s = item.name + '。';
    // メニューの種目は reps/sets、トレーニング中の種目は planned.reps/planned.sets に予定が入っている
    var reps = item.reps || (item.planned && item.planned.reps);
    var sets = item.sets && !Array.isArray(item.sets) ? item.sets : (item.planned && item.planned.sets);
    if (reps && sets) s += reps + '回を' + sets + 'セット。';
    if (item.rest) s += 'レストは' + item.rest + '秒。';
    var tempo = this.tempoText(item.tempo);
    if (tempo) s += tempo + '。';
    if (item.rir && item.rir !== '-') s += '余力は' + item.rir + '回残します。';
    if (latest && latest.sets) {
      // 前回の1セット目だけを読む（例: 「60kg×8」→「前回は60キロで8回でした」）
      var first = latest.sets.split(',')[0].trim();
      var m = first.match(/^(?:([\d.]+)kg)?×(\d+)$/);
      if (m) s += '前回は' + (m[1] ? m[1] + 'キロで' : '') + m[2] + '回でした。';
    }
    return s;
  }
};

/**
 * アラーム音（Web Audioで音を作る。音声ファイルは使わない）
 *   Sound.tick()  … 残り3秒からの、やわらかい「ポン」という音
 *   Sound.alarm() … レスト終了のチャイム（ド・ミ・ソ・ドの上がるメロディを2回）
 * メロディを変えたいときは ALARM_MELODY の音の高さ（ヘルツ）と鳴らす時刻（秒）を書き換える。
 * 音が出ないときは、スマホのマナーモード（消音スイッチ）と音量を確認する。
 */
var ALARM_MELODY = [
  // [鳴らし始める時刻(秒), 音の高さ(Hz), 長さ(秒)]  C5=523, E5=659, G5=784, C6=1047
  [0.00, 523, 0.5], [0.15, 659, 0.5], [0.30, 784, 0.5], [0.45, 1047, 0.9],
  [1.20, 523, 0.5], [1.35, 659, 0.5], [1.50, 784, 0.5], [1.65, 1047, 1.2]
];

var Sound = {
  ctx: null,
  prepare: function () {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!this.ctx) this.ctx = new AC();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.note(0, 440, 0.01, 0.0001);   // 無音に近い音を一度鳴らして、音を出せる状態にする
    } catch (e) { /* 音が出せない端末では何もしない */ }
  },
  /**
   * 鐘やマリンバのような音を1つ鳴らす（基音＋少し高い倍音を重ね、すっと減衰させる）
   * start: 何秒後に鳴らすか / freq: 音の高さ / length: 余韻の長さ / volume: 音量(0〜1)
   */
  note: function (start, freq, length, volume) {
    if (!this.ctx) return;
    var ctx = this.ctx, t = ctx.currentTime + start;
    [[1, 1], [2, 0.35], [3, 0.12]].forEach(function (h) {   // [倍音, 音量の割合]
      var osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * h[0];
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(volume * h[1], t + 0.01);   // すぐに立ち上がる
      gain.gain.exponentialRampToValueAtTime(0.0001, t + length);         // ゆっくり消える
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t); osc.stop(t + length + 0.05);
    });
  },
  tick: function () { this.prepare(); this.note(0, 880, 0.25, 0.25); },
  alarm: function () {
    this.prepare();
    var self = this;
    ALARM_MELODY.forEach(function (n) { self.note(n[0], n[1], n[2], 0.5); });
  }
};

// 保存しておいた声の速さを読み込む。声の一覧はあとから届くことがあるので、届いたら読み直す
try { var savedRate = localStorage.getItem(Speech.storageKey); if (savedRate) Speech.setRate(savedRate); } catch (e) {}
if (Speech.supported) {
  Speech.loadVoices();
  if ('onvoiceschanged' in window.speechSynthesis) window.speechSynthesis.onvoiceschanged = function () { Speech.loadVoices(); };
}

// 最初のタップで、読み上げとアラーム音を使える状態にする（iPhone対策）
['touchend', 'click'].forEach(function (ev) {
  document.addEventListener(ev, function () { if (!VoiceInputActive()) Speech.unlock(); }, { capture: true });
});

/** 音声認識の最中かどうか（聞き取り中に読み上げると、その声を拾ってしまうため） */
function VoiceInputActive() { return typeof VoiceInput !== 'undefined' && !!VoiceInput.active; }
