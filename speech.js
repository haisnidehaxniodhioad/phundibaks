/**
 * speech.js ― 読み上げ（音声合成）と、読み上げる文章の組み立て
 * あわせて、レスト終了のアラーム音（Sound）もここにまとめている。
 */
var Speech = {
  supported: 'speechSynthesis' in window,
  unlocked: false,
  micEndedAt: 0,   // 音声認識が終わった時刻（voice.js が記録する）

  /**
   * 文章を読み上げる。前の読み上げが残っていれば止めてから読む。
   * iPhoneは、マイクを使った直後に読み上げると声が出ないことがあるため、少し待ってから読む。
   */
  speak: function (text) {
    if (!this.supported || !text) return;
    var wait = Date.now() - this.micEndedAt < 1000 ? 450 : 0;
    var run = function () {
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      u.rate = 1.05;
      u.volume = 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();   // iPhoneで読み上げが「一時停止」のまま止まるのを防ぐ
      window.speechSynthesis.speak(u);
    };
    if (wait) setTimeout(run, wait); else run();
  },

  stop: function () { if (this.supported) window.speechSynthesis.cancel(); },

  /**
   * iPhoneは「画面をタップした瞬間」に一度音を出しておかないと、
   * あとから（タイマーや音声認識のあとに）読み上げ・アラームを鳴らせない。
   * そこで最初のタップで、無音の読み上げとアラーム用の音の準備をしておく。
   */
  unlock: function () {
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.supported) {
      var u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
    Sound.prepare();
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
 * アラーム音（Web Audioで「ピッ」という音を作る。音声ファイルは使わない）
 *   Sound.tick()  … 残り3秒からの短い音
 *   Sound.alarm() … レスト終了の音（ピピピッ を2回）
 * 音が出ないときは、スマホのマナーモード（消音スイッチ）と音量を確認する。
 */
var Sound = {
  ctx: null,
  prepare: function () {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!this.ctx) this.ctx = new AC();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.beep(0, 0.01, 440, 0.0001);   // 無音に近い音を一度鳴らして、音を出せる状態にする
    } catch (e) { /* 音が出せない端末では何もしない */ }
  },
  /** start秒後から、length秒間、freqヘルツの音を鳴らす */
  beep: function (start, length, freq, volume) {
    if (!this.ctx) return;
    var t = this.ctx.currentTime + start;
    var osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + length + 0.02);
  },
  tick: function () { this.prepare(); this.beep(0, 0.12, 880, 0.25); },
  alarm: function () {
    this.prepare();
    var self = this;
    [0, 0.18, 0.36, 0.9, 1.08, 1.26].forEach(function (s) { self.beep(s, 0.14, 1320, 0.4); });
  }
};

// 最初のタップで、読み上げとアラーム音を使える状態にする（iPhone対策）
['touchend', 'click'].forEach(function (ev) {
  document.addEventListener(ev, function () { Speech.unlock(); Sound.prepare(); }, { capture: true });
});
