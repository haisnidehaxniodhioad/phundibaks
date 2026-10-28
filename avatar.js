/**
 * avatar.js ― 話しかけると返事をするアバター（Phase 3f、v3iで男女の切り替えと表情、v3k〜v5で絵と動き、v6でデザインシートに合わせて描き直し・色の切り替え、v7〜v8で見本にさらに近づけ、男性の目元・眉・輪郭を調整）
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
 * アバターの色。ジャケットの色は4種類から選べる（ホームの「トレーナー設定」）。色は男性・女性それぞれに保存される。
 * 色を変えたいときは、ここの色コード（#から始まる6桁）を書き換える。
 *   main … ジャケットの色 / light … 明るい部分 / dark … 影の部分 / label … 選ぶ画面に出る名前
 */
var AVATAR_COLORS = {
  defaults: { male: 'blue', female: 'pink' },   // 最初の色（男性はブルー、女性はピンク）
  skin: '#f9dcc6', skinShade: '#efc0a6', cheek: '#f29c94', line: '#2a1d1a',
  hair: { male: ['#45332a', '#1d1512'], female: ['#93603e', '#5b3322'] },   // 髪の色（明るい所・暗い所）
  eye: { male: ['#3a2215', '#6f4323', '#b97c45'], female: ['#3d2314', '#77492a', '#c48a52'] },    // 瞳の色（上・まん中・下）
  inner: { male: '#1d2436', female: '#eef0f4' },                             // ジャケットの中のシャツ
  jackets: {
    blue:   { main: '#1f3a6b', light: '#2f5596', dark: '#13264a', label: 'ブルー（男性の標準）' },
    gray:   { main: '#4a4f58', light: '#666c77', dark: '#30343b', label: 'グレー' },
    pink:   { main: '#c9508c', light: '#e07cad', dark: '#a03a6e', label: 'ピンク（女性の標準）' },
    purple: { main: '#7657c4', light: '#9579d8', dark: '#573ba3', label: 'パープル' }
  }
};

/**
 * 男性・女性で形が違うパーツ（髪・輪郭・眉・目・鼻・口）。デザイン見本「アバター デザイン（完成版）」に合わせている。
 * 男性：眉はやや直線的で太め、目は少し細めの切れ長、輪郭はあごに向かってすっきり。
 * 女性：アーチ形の細い眉、丸く大きな目とまつげ、やわらかい輪郭、横に流した前髪とポニーテール。
 * 数字は 128×128 の中の位置。少しずつ変えて、見た目を確かめながら調整する。
 *   eye の中身 … y: 目の高さ / w: 目の横幅の半分 / top: 上まぶたの高さ / bottom: 下まぶたの深さ / tilt: 目尻の上がり
 *                iris: 瞳の大きさ / thick: 目尻の上まぶたの線の太さ / wing: 目尻の線の伸び / wingUp: 伸びた先の上がり
 *                lower: 下まぶたの線の太さ / lowerColor: 下まぶたの線の色
 */
var AVATAR_SHAPES = {
  male: {
    face: 'M44.5 43 Q45 25 64 24.5 Q83 25 83.5 43 Q84.5 60 80 69 Q73 79.5 64 82 Q55 79.5 48 69 Q43.5 60 44.5 43 Z',
    ears: { x: 42.8, y: 57, rx: 3.8, ry: 6 },
    brow: { color: '#33241d',
      paths: '<path d="M60.4 49.4 Q61.2 48.5 60.6 47.6 Q54 45.4 46.8 48.8 Q46.6 49.2 47.2 49.1 Q54 47.4 60.4 49.4 Z"/><path d="M67.6 49.4 Q66.8 48.5 67.4 47.6 Q74 45.4 81.2 48.8 Q81.4 49.2 80.8 49.1 Q74 47.4 67.6 49.4 Z"/>' },
    eye: { y: 57.2, w: 6.6, top: 5, bottom: 4, tilt: .5, iris: 3.4, thick: 2, wing: 1.4, wingUp: -.2, lower: .7, lowerColor: '#6e4436' },
    cheek: '.14',
    nose: 'M64.3 60.6 Q63.3 64.6 64.9 66',
    smile: 'M59.4 71 Q64 73.4 68.6 71', smileColor: '#94453f', smileWidth: 1.5,
    hairLine: '#6d5444',   // 髪のつやの線
    hairBack: function (h) {
      return '<path d="M38.5 54 Q33 28 49 18.5 Q64 11 81 16 Q96 23.5 92.5 48 L90 56 L39 56 Z" fill="' + h + '"/>';
    },
    hairFront: function (h, line) {
      return '<path d="M40 58.5 Q35.5 46 37.2 34 Q38.4 24.5 45 19 L43.6 15 Q49.5 13.6 53 14.8 Q57.4 10.4 63.6 10.8 L66.4 6.8 Q69.6 9.8 73 10.2 Q80.4 10.4 85 14.6 L89.4 12.8 Q90 17.8 91.4 20.8 Q95.6 27 94.8 36 Q94.2 47.5 89 58.5 L87.2 52.5 Q86.4 46.5 84.6 43.2 L83.2 47.4 Q81.6 40.6 77.8 37.8 L76.6 42.6 Q73 37 67.4 36.4 Q64.6 38.6 62.6 42.4 L60.6 48.6 Q59.8 41.6 56.2 39.6 L52.4 47.4 Q51.6 41.8 48.6 41.2 L45.6 49.4 Q44.6 47.4 44 49.4 Q43.6 53 43.8 56.4 L41.8 54.8 Z" fill="' + h + '"/>' +
        '<path d="M47 25 Q56 18.5 66 18.5 M71 19.5 Q82 21 88 30 M58.5 27 Q58 34 56.2 39.6 M70 26 Q75 31 77.8 37.8" stroke="' + line + '" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".8"/>';
    }
  },
  female: {
    face: 'M43.5 43 Q44 25 64 24.5 Q84 25 84.5 43 Q85.5 61 80.5 70.5 Q73.5 80.5 64 81.8 Q54.5 80.5 47.5 70.5 Q42.5 61 43.5 43 Z',
    ears: { x: 42.2, y: 57, rx: 3.6, ry: 5.8 },
    brow: { color: '#6b4332',
      paths: '<path d="M59.8 47.9 Q60.5 47.2 60 46.5 Q53.3 43.9 46.8 47.9 Q46.7 48.2 47.2 48.1 Q53.3 45.4 59.8 47.9 Z"/><path d="M68.2 47.9 Q67.5 47.2 68 46.5 Q74.7 43.9 81.2 47.9 Q81.3 48.2 80.8 48.1 Q74.7 45.4 68.2 47.9 Z"/>' },
    eye: { y: 57.6, w: 6.8, top: 6.6, bottom: 5.2, tilt: .4, iris: 3.9, thick: 2.3, wing: 1.8, wingUp: .9, lower: .75, lowerColor: '#7a4a3a' },
    cheek: '.38',
    nose: 'M64.3 62.4 Q63.6 64.9 64.9 65.8',
    smile: 'M59.6 70.8 Q64 74 68.4 70.8', smileColor: '#b2484e', smileWidth: 1.7,
    hairLine: '#bb8660',
    hairBack: function (h, line) {
      return '<path d="M75 17.5 Q83 9 92.5 13.5 Q97.5 19.5 91 25 Q83 23 75 17.5 Z" fill="' + h + '"/>' +
        '<path d="M79 17 Q97 14 101 34 Q105 55 101 77 Q98 93 92.5 101 Q89.5 105 88.5 99 Q93.5 81 92.5 63 Q91.5 45 84 37 Z" fill="' + h + '"/>' +
        '<path d="M96 40 Q101 62 95 92 M92 46 Q96 66 91.5 90" stroke="' + line + '" stroke-width="1.1" fill="none" opacity=".6"/>' +
        '<path d="M39.5 64 Q33.5 30 51.5 19 Q70 11.5 84.5 20 Q95.5 30 91.5 60 L88.5 65 L41.5 65 Z" fill="' + h + '"/>';
    },
    hairFront: function (h, line) {
      return '<path d="M40.5 66 Q35.5 45 40 32 Q45.5 19.5 60 16.5 Q76.5 13.5 86 24 Q93 34 90.5 57 L88.4 51 Q87.4 43.4 83.6 39 L82.4 45 Q80.4 39.6 75.6 38.2 L73.8 45.6 Q71.4 39.8 66.4 39.6 L62.4 46.6 Q61.4 40.6 57 40.6 L51.4 47.4 Q51 42.6 48.4 42.6 L45.4 50.6 Q44.6 57 44.8 63 Z" fill="' + h + '"/>' +
        '<path d="M44.6 46 Q39.6 59 41.6 78 Q43.2 70 45 63.6 Q44.6 55 46.2 48.4 Z M84.4 46 Q88.6 58 86.6 72 Q85.4 66 84 61.6 Q84.6 53 83.2 48.4 Z" fill="' + h + '"/>' +
        '<path d="M47 27.5 Q58 20 72 20.5 M77 22.5 Q85.5 27 88.5 36 M61 24.5 Q60 33 57 40.6 M70.5 24.5 Q74 31 75.6 38.2" stroke="' + line + '" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".75"/>';
    }
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
    this.currentColor = this.savedColor(gender);
    this.redraw();
    return true;
  },

  /** ジャケットの色を切り替える（'blue' | 'gray' | 'pink' | 'purple'）。選択はこのブラウザに保存する。 */
  setColor: function (color) {
    if (!AVATAR_COLORS.jackets[color]) return false;
    this.currentColor = color;
    try { localStorage.setItem(this.colorKey + '_' + this.currentGender, color); } catch (e) {}
    this.redraw();
    return true;
  },

  /** その性別で保存してある色（なければ最初の色） */
  savedColor: function (gender) {
    try {
      var stored = localStorage.getItem(this.colorKey + '_' + gender);
      if (AVATAR_COLORS.jackets[stored]) return stored;
    } catch (e) {}
    return AVATAR_COLORS.defaults[gender];
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
   * アバターの絵（SVG）。デザイン見本「アバター デザイン（完成版）」に合わせて描いている。
   * 顔・眉・目・口はパーツ（class="av-…"）に分けてあり、style.css の .avatar.state-○○ で見せ方を変えて表情を作る。
   *   av-head … 頭全体（確認のときに少し首をかしげる。内側の transform は頭の位置と大きさ＝1.14倍） / av-face … 顔の輪郭
   *   av-brows … 眉 / av-eyes … ふだんの目（まばたき） / av-eyes-happy … 笑った目（成功）
   *   av-smile … ふだんの口 / av-mouth（＋av-mouth-teeth）… 話している口 / av-grin … 成功の笑顔
   *   av-confirm-mouth … 確認の口 / av-frown … 困った口 / av-cheek … 頬
   *   av-waves … 聞き取り中の音の線 / av-hand … 確認のときのあごに手 / av-q … 「？」 / av-sweat … エラーの汗
   * パーツのクラス名は変えないこと（変えると表情が動かなくなる）。
   * 男性と女性で形を変えているのは、上の AVATAR_SHAPES（髪・眉・目・輪郭・口）。
   */
  svg: function () {
    var c = AVATAR_COLORS;
    var female = this.currentGender === 'female';
    var g = female ? 'female' : 'male';
    var f = AVATAR_SHAPES[g];
    var j = c.jackets[this.currentColor] || c.jackets[c.defaults[g]];
    var hair = 'url(#avHair)';
    var n = function (v) { return Math.round(v * 100) / 100; };

    // 目（cx = 目の中心、side = -1 左 / 1 右）。見本のように、まぶた・白目・瞳がひと続きに見えるよう描く。
    //   ・上まぶたの線は目頭で細くとがり、目尻に向かって太くなって、少し外へ伸びてから下まぶたへつながる
    //   ・下まぶたの線は目尻から目の中ほどまで、だんだん細くなって消える
    //   ・白目と瞳の上側には、まぶたの影（グラデーション）をかけて、境目をやわらげる
    var eye = function (cx, side) {
      var e = f.eye, id = 'avEyeClip' + (side < 0 ? 'L' : 'R');
      var ix = cx - side * e.w, iy = e.y + .4;                 // 目頭
      var ox = cx + side * e.w, oy = e.y - e.tilt;             // 目尻
      var c1x = cx - side * e.w * .45, c2x = cx + side * e.w * .5, topY = e.y - e.top;
      var bx = cx + side * e.w * .15, by = e.y + e.bottom;     // 下まぶたの曲線の制御点
      var shape = 'M' + n(ix) + ' ' + n(iy) + ' C' + n(c1x) + ' ' + n(topY) + ' ' + n(c2x) + ' ' + n(topY) + ' ' + n(ox) + ' ' + n(oy) +
        ' Q' + n(bx) + ' ' + n(by) + ' ' + n(ix) + ' ' + n(iy) + ' Z';
      // 上まぶたの線（塗りの帯）。下の縁は白目の上の縁より少し下まで重ねて、すき間ができないようにする
      var wx = ox + side * e.wing, wy = oy - e.wingUp;
      var lash = 'M' + n(ix + side * .2) + ' ' + n(iy + .2) +
        ' C' + n(c1x) + ' ' + n(topY - .6) + ' ' + n(c2x) + ' ' + n(topY - e.thick) + ' ' + n(wx) + ' ' + n(wy) +
        ' Q' + n(ox + side * .2) + ' ' + n(oy + .3) + ' ' + n(ox - side * .9) + ' ' + n(oy + 1) +
        ' C' + n(c2x) + ' ' + n(topY + .9) + ' ' + n(c1x) + ' ' + n(topY + .9) + ' ' + n(ix + side * .9) + ' ' + n(iy + .1) + ' Z';
      // 下まぶたの線：目尻（t=0）から目の中ほど（t=.45）まで、曲線に沿って細くなる帯
      var q = function (t) { var u = 1 - t; return [u * u * ox + 2 * u * t * bx + t * t * ix, u * u * oy + 2 * u * t * by + t * t * iy]; };
      var up = [], down = [];
      for (var k = 0; k <= 12; k++) {
        var t = k / 12 * .45, p = q(t), wdt = e.lower * (1 - t / .45) * (k === 0 ? .6 : 1);
        up.push(n(p[0]) + ' ' + n(p[1] - .1)); down.unshift(n(p[0]) + ' ' + n(p[1] + wdt));
      }
      var lower = 'M' + up.join(' L') + ' L' + down.join(' L') + ' Z';
      var irisX = cx + side * .25, irisY = e.y + (e.bottom * .5 - e.top * .75) / 2 + .3, r = e.iris;
      return '<clipPath id="' + id + '"><path d="' + shape + '"/></clipPath>' +
        '<path d="' + shape + '" fill="url(#avWhite)"/>' +
        '<g clip-path="url(#' + id + ')">' +
          '<ellipse cx="' + n(irisX) + '" cy="' + n(irisY) + '" rx="' + r + '" ry="' + n(r * 1.12) + '" fill="url(#avIris)"/>' +
          '<ellipse cx="' + n(irisX) + '" cy="' + n(irisY) + '" rx="' + r + '" ry="' + n(r * 1.12) + '" fill="url(#avIrisEdge)"/>' +
          '<ellipse cx="' + n(irisX) + '" cy="' + n(irisY - .3) + '" rx="' + n(r * .34) + '" ry="' + n(r * .44) + '" fill="#24130b" opacity=".9"/>' +
          '<path d="' + shape + '" fill="url(#avLidShade)"/>' +                               // まぶたの影
          '<ellipse cx="' + n(irisX + r * .38) + '" cy="' + n(irisY - r * .38) + '" rx="' + n(r * .22) + '" ry="' + n(r * .26) + '" fill="#fff"/>' +
          '<ellipse cx="' + n(irisX - r * .35) + '" cy="' + n(irisY + r * .52) + '" rx="' + n(r * .2) + '" ry="' + n(r * .1) + '" fill="#fff" opacity=".55"/>' +
        '</g>' +
        '<path d="M' + n(ix) + ' ' + n(iy) + ' q' + n(side * 1.3) + ' -.5 ' + n(side * 1.6) + ' .5 q' + n(-side * .8) + ' .6 ' + n(-side * 1.6) + ' -.5 Z" fill="#e7a99e" opacity=".55"/>' +   // 目頭
        '<path d="' + lower + '" fill="' + e.lowerColor + '" opacity=".65"/>' +
        '<path d="' + lash + '" fill="' + c.line + '"/>' +
        '<path d="M' + n(cx - side * e.w * .05) + ' ' + n(e.y - e.top * .75 - 2.1) + ' Q' + n(cx + side * e.w * .5) + ' ' + n(e.y - e.top * .75 - 2.6) + ' ' + n(ox - side * .2) + ' ' + n(oy - 2.6) + '" stroke="#b97e68" stroke-width=".5" fill="none" stroke-linecap="round" opacity=".35"/>';
    };

    return '<svg viewBox="0 0 128 128" role="img" aria-label="' +
      (female ? '女性トレーナー' : '男性トレーナー') + '" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' +
        '<linearGradient id="avBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6faff"/><stop offset=".6" stop-color="#e3eefc"/><stop offset="1" stop-color="#c9dcf4"/></linearGradient>' +
        '<linearGradient id="avHair" x1="0" y1="0" x2=".5" y2="1"><stop offset="0" stop-color="' + c.hair[g][0] + '"/><stop offset="1" stop-color="' + c.hair[g][1] + '"/></linearGradient>' +
        '<linearGradient id="avJacket" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + j.light + '"/><stop offset=".45" stop-color="' + j.main + '"/><stop offset="1" stop-color="' + j.dark + '"/></linearGradient>' +
        '<linearGradient id="avSkin" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="#fdebdd"/><stop offset="1" stop-color="' + c.skin + '"/></linearGradient>' +
        '<linearGradient id="avWhite" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3d9d8"/><stop offset=".5" stop-color="#fdfbfa"/><stop offset="1" stop-color="#ffffff"/></linearGradient>' +
        '<linearGradient id="avLidShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2016" stop-opacity=".55"/><stop offset=".38" stop-color="#3a2016" stop-opacity="0"/></linearGradient>' +
        '<radialGradient id="avIrisEdge" cx=".5" cy=".5" r=".5"><stop offset=".62" stop-color="#2a160c" stop-opacity="0"/><stop offset="1" stop-color="#2a160c" stop-opacity=".7"/></radialGradient>' +
        '<linearGradient id="avIris" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c.eye[g][0] + '"/><stop offset=".45" stop-color="' + c.eye[g][1] + '"/><stop offset="1" stop-color="' + c.eye[g][2] + '"/></linearGradient>' +
      '</defs>' +
      '<circle class="av-halo" cx="64" cy="64" r="63" fill="url(#avBg)"/>' +
      /* 聞き取り中の音の線 */
      '<g class="av-waves" stroke="#efb64e" stroke-width="2.6" fill="none" stroke-linecap="round">' +
        '<path d="M24 46 Q18 56 24 66"/><path d="M17 41 Q9 56 17 71"/><path d="M104 46 Q110 56 104 66"/><path d="M111 41 Q119 56 111 71"/></g>' +
      /* 首 */
      '<path d="M56.5 80 L56.5 97 Q64 99.5 71.5 95 L71.5 78 Z" fill="url(#avSkin)"/>' +
      '<path d="M56.5 84 Q64 91 71.5 84 L71.5 80 Q64 88 56.5 80 Z" fill="' + c.skinShade + '" opacity=".85"/>' +
      /* 体・ジャケット（折り返しの襟が付いたジャージ。前を少し開けて中のシャツが見える） */
      '<g transform="translate(0 3)">' +
      '<path d="M8 128 L12 112 Q18 99 42 94 L56 89 L72 89 L86 94 Q110 99 116 112 L120 128 Z" fill="url(#avJacket)"/>' +
      '<path d="M55 89 Q64 97 73 89 L72 128 L56 128 Z" fill="' + c.inner[g] + '"/>' +
      (female ? '' : '<path d="M56.8 90 Q64 96 71.2 90" stroke="#2d3650" stroke-width="1.4" fill="none"/>') +
      '<path d="M43 95 L56 89 L61.5 103 L64 108 L62.5 128 L42 128 Z" fill="' + j.main + '"/>' +
      '<path d="M85 95 L72 89 L66.5 103 L64 108 L65.5 128 L86 128 Z" fill="' + j.main + '"/>' +
      /* 襟（折り返し） */
      '<path d="M56.5 86.5 L45.5 92.5 L50.5 104.5 L61.5 103 Z" fill="' + j.light + '"/><path d="M71.5 86.5 L82.5 92.5 L77.5 104.5 L66.5 103 Z" fill="' + j.light + '"/>' +
      '<path d="M56.5 86.5 L45.5 92.5 L50.5 104.5 L61.5 103 M71.5 86.5 L82.5 92.5 L77.5 104.5 L66.5 103" stroke="' + j.dark + '" stroke-width=".9" fill="none" stroke-linejoin="round" opacity=".8"/>' +
      '<path d="M64 108 L64 128" stroke="#d8dee8" stroke-width="1.5"/><rect x="62.7" y="108.5" width="2.6" height="4.6" rx="1" fill="#e9edf3"/>' +
      '<path d="M20 113 Q29 106 40 106 M108 113 Q99 106 88 106" stroke="' + j.dark + '" stroke-width="1.3" fill="none" opacity=".7"/>' +
      '<path d="M83 122 L86.5 114.5 L90 122 M84.4 119.2 L88.6 119.2" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</g>' +
      /* 頭（髪・顔・耳・表情）。確認のときはこのまとまりごと首をかしげる */
      '<g class="av-head"><g transform="translate(64 59) scale(1.14) translate(-64 -57)">' +
        f.hairBack(hair, f.hairLine) +
        '<ellipse cx="' + f.ears.x + '" cy="' + f.ears.y + '" rx="' + f.ears.rx + '" ry="' + f.ears.ry + '" fill="' + c.skin + '"/>' +
        '<ellipse cx="' + (128 - f.ears.x) + '" cy="' + f.ears.y + '" rx="' + f.ears.rx + '" ry="' + f.ears.ry + '" fill="' + c.skin + '"/>' +
        '<path class="av-face" d="' + f.face + '" fill="url(#avSkin)" stroke="#dba68d" stroke-width=".7"/>' +
        f.hairFront(hair, f.hairLine) +
        '<g class="av-brows" fill="' + f.brow.color + '" stroke="' + f.brow.color + '" stroke-width=".5" stroke-linejoin="round">' + f.brow.paths + '</g>' +
        '<g class="av-eyes"><g class="av-eye-left">' + eye(54, -1) + '</g><g class="av-eye-right">' + eye(74, 1) + '</g></g>' +
        '<g class="av-eyes-happy" stroke="' + c.line + '" stroke-width="2.1" fill="none" stroke-linecap="round"><path d="M48 58.5 Q54 52.5 60 58.5"/><path d="M68 58.5 Q74 52.5 80 58.5"/></g>' +
        '<ellipse class="av-cheek" cx="51" cy="65.5" rx="4.2" ry="2.3" fill="' + c.cheek + '" opacity="' + f.cheek + '"/><ellipse class="av-cheek" cx="77" cy="65.5" rx="4.2" ry="2.3" fill="' + c.cheek + '" opacity="' + f.cheek + '"/>' +
        '<path d="' + f.nose + '" stroke="#dca189" stroke-width=".75" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
        /* 口 */
        '<path class="av-smile" d="' + f.smile + '" stroke="' + f.smileColor + '" stroke-width="' + f.smileWidth + '" fill="none" stroke-linecap="round"/>' +
        '<g class="av-mouth"><path d="M59.5 70.2 Q64 69.5 68.5 70.2 Q67.8 76.6 64 77 Q60.2 76.6 59.5 70.2 Z" fill="#8b333e"/>' +
          '<path d="M61.4 75.2 Q64 73.6 66.6 75.2 Q64 76.6 61.4 75.2 Z" fill="#e2797f"/>' +
          '<path class="av-mouth-teeth" d="M60.5 70.6 Q64 70.1 67.5 70.6 L67.2 71.9 Q64 72.4 60.8 71.9 Z" fill="#fff"/></g>' +
        '<g class="av-grin"><path d="M57.8 69.6 Q64 71 70.2 69.6 Q69.3 78.4 64 78.8 Q58.7 78.4 57.8 69.6 Z" fill="#8b333e"/>' +
          '<path d="M59.2 70.2 Q64 71.4 68.8 70.2 L68.5 72 Q64 72.9 59.5 72 Z" fill="#fff"/><path d="M60.6 76.4 Q64 74 67.4 76.4 Q64 78.4 60.6 76.4 Z" fill="#e2797f"/></g>' +
        '<path class="av-confirm-mouth" d="M60.4 72.4 Q64 73.2 67.8 71.6" stroke="#8a3c40" stroke-width="1.7" fill="none" stroke-linecap="round"/>' +
        '<path class="av-frown" d="M60.4 73.6 Q64 71.2 67.6 73.6" stroke="#8a3c40" stroke-width="1.7" fill="none" stroke-linecap="round"/>' +
        '<path class="av-sweat" d="M96.5 38 Q92 45.5 94 48.5 Q96.5 51.5 99 48.5 Q101 45.5 96.5 38 Z" fill="#a9d6f7" stroke="#5d9fd9" stroke-width="1"/>' +
      '</g></g>' +
      /* 確認：あごに手、「？」 */
      '<g class="av-hand"><g transform="translate(0 4)"><path d="M57 128 L62 102 L77 102 L79 128 Z" fill="' + j.main + '"/><path d="M61.5 102 L77.5 102" stroke="' + j.light + '" stroke-width="2"/>' +
        '<path d="M63 92 Q61.5 85.5 66.5 84 Q74 83 76 88.5 Q78 96 72.5 102 L64.5 102 Q61 98.5 63 92 Z" fill="url(#avSkin)" stroke="#e0ac95" stroke-width=".8"/>' +
        '<path d="M65 88.5 Q70.5 87 75.5 89.5 M64.8 93 Q70.5 91.6 76.5 94 M65.5 97.2 Q70 96 75 97.8" stroke="#dba48c" stroke-width=".9" fill="none" stroke-linecap="round"/></g></g>' +
      '<text class="av-q" x="' + (female ? 14 : 104) + '" y="40" font-size="17" font-weight="900" fill="#8b6fd6" font-family="sans-serif">?</text>' +
      '</svg>';
  },
  init: function () {
    var savedGender = 'male';
    try {
      var stored = localStorage.getItem(this.storageKey);
      if (stored === 'male' || stored === 'female') savedGender = stored;
    } catch (e) {}

    this.currentGender = savedGender;
    this.currentColor = this.savedColor(savedGender);
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
