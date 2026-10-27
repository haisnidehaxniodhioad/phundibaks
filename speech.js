/**
 * speech.js ― 読み上げ（音声合成）と、読み上げる文章の組み立て
 * 音声で話しかける機能（音声認識）は Phase 2 でこのファイルに追加する予定。
 */
var Speech = {
  supported: 'speechSynthesis' in window,

  /** 文章を読み上げる。前の読み上げが残っていれば止めてから読む */
  speak: function (text) {
    if (!this.supported || !text) return;
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    u.rate = 1.05;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  },

  stop: function () { if (this.supported) window.speechSynthesis.cancel(); },

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
