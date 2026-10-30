/**
 * dock.js ― 画面の上の帯（コーチ）と、下に固定するバー（v30・Claude Design のB案「チームカラー」）
 *
 *   画面の上の帯（#dockCoach）：コーチ（アバター）と吹き出し。吹き出しには返事（#voiceBox）か、その画面のひとこと（#coachLine）が出る。
 *     返事は帯の下に重ねて出す（画面の内容を押し下げない）。
 *   画面の下のバー（#dockBar）：画面によって中身が変わる。
 *       ホーム・記録・体組成 … タブ（ホーム／記録／話す／からだ／コーチ）。真ん中の「話す」がマイク
 *       トレーニング中       … レストタイマー（#timer）とマイク
 *       終了画面             … 「記録を保存する」とマイク
 *       メニューの作成・編集 … 「保存する」とマイク
 *   ホームとログインでは、コーチは画面の一番上に大きく出す（Dock.update がアバターを移動する）。
 *   ボタンの data-act / data-mm は、画面の中のボタンと同じ働きをする（app.js の onAct、mymenu.js の MyMenu.onClick）。
 *   画面が描き直されるたびに Dock.update() が呼ばれる。
 */
var Dock = {
  el: document.getElementById('dock'),
  bar: document.getElementById('dockBar'),
  coach: document.getElementById('dockCoach'),
  line: document.getElementById('coachLine'),
  key: '',

  // その画面で吹き出しに出しておく、ひとこと（話しかけていないとき）
  HINTS: {
    session: '「60キロ8回」のように話しても記録できるよ。',
    finish: 'よくがんばったね！「保存」で記録を保存するよ。',
    afterSave: '「記録する」か「あとで」って話しかけてもいいよ。',
    condition: '「全身3、上半身2、下半身4、動き7」みたいに話しても入れられるよ。',
    history: '「先月」って話しかけると、前の月が見られるよ。',
    body: '「体重にして」と話しかけると、体重のレポートになるよ。',
    mymenu: '数字をタップすると変えられるよ。',
    staff: '「今週やってないのは誰？」「（選手の名前）を開いて」のように話しかけてください。'
  },

  init: function () {
    var self = this;
    // 画面（#app）が描き直されたら、バーも描き直す
    new MutationObserver(function () { self.update(); }).observe(document.getElementById('app'), { childList: true });
    // 返事の表示・非表示が変わったら、吹き出しの段を出し入れする
    new MutationObserver(function () { self.syncCoach(); }).observe(document.getElementById('voiceBox'), { attributes: true, attributeFilter: ['hidden'] });
    // バーの高さを CSS の --dock-h に入れる（画面の一番下の内容がバーに隠れないように）
    if (window.ResizeObserver) new ResizeObserver(function () { self.measure(); }).observe(this.el);
    this.el.addEventListener('click', function (e) {
      var t = e.target.closest('[data-act], [data-mm]');
      if (!t || t.disabled) return;
      if (t.dataset.mm) MyMenu.onClick(t); else onAct(t);
    });
    this.update();
  },

  /** 今の画面に合わせて、バーの中身・アバターの場所を変える */
  update: function () {
    var v = S.view;
    var athlete = !!S.home && ['home', 'session', 'finish', 'body', 'mymenu', 'history', 'afterSave', 'condition'].indexOf(v) >= 0;
    var staff = v === 'staff' && !!S.token;   // v35：スタッフ画面にも上の帯（コーチ）とマイクを出す
    var mode = staff ? 'staff' : !athlete ? 'none' : (v === 'home' || v === 'history' || v === 'body') ? 'tabs' : v;
    this.el.hidden = mode === 'none';
    document.body.classList.toggle('has-dock', mode !== 'none');
    this.el.className = 'dock mode-' + mode + ' view-' + v;

    // アバターの場所：ホーム・ログインは画面の中の一番上（大きく）、ほかは上の帯の左
    var top = document.getElementById('coachTop');
    if (top) Avatar.mount(top, 'big');
    else Avatar.mount(document.getElementById('dockAvatarSlot'), 'dock');
    Avatar.show(athlete || staff || !!top);

    // ひとこと
    this.line.textContent = this.HINTS[v] || '';

    // 下の段（同じ内容なら描き直さない）
    var key = mode + '|' + v + '|' + this.saveDisabled();
    if (key !== this.key) { this.key = key; this.renderBar(mode, v); }
    this.syncCoach();
    this.measure();
  },

  renderBar: function (mode, v) {
    var mic = VoiceUI.btn, timer = Timer.el;
    // マイクとタイマーは同じ部品を使い回すので、描き直す前にいったん外しておく
    document.body.appendChild(mic); document.body.appendChild(timer);
    var html = '';
    if (mode === 'tabs') {
      var tab = function (act, icon, label, on) {
        return '<button class="dock-tab' + (on ? ' on' : '') + '" data-act="' + act + '"' + (on ? ' aria-current="page"' : '') + '>' + Icon(icon, 28) + '<span>' + label + '</span></button>';
      };
      html = '<nav class="dock-tabs" aria-label="画面の切り替え">' +
        tab('home', 'house', 'ホーム', v === 'home') +
        tab('records', 'calendar', '記録', v === 'history') +
        '<div class="dock-mic"><span data-slot="mic"></span><span class="dock-mic-label">話す</span></div>' +
        tab('body', 'heart', 'からだ', v === 'body') +
        tab('avatarSettings', 'smiley', 'コーチ', false) + '</nav>';
    } else if (mode === 'session') {
      html = '<div class="dock-row"><span data-slot="timer"></span><div class="dock-hint">終わったら ✓ を押してね</div><span data-slot="mic"></span></div>';
    } else if (mode === 'finish') {
      html = '<div class="dock-row"><button class="btn btn-primary btn-pill dock-main" data-act="save"' + (this.saveDisabled() ? ' disabled' : '') + '>' +
        Icon('save', 22) + '記録を保存する</button><span data-slot="mic"></span></div>';
    } else if (mode === 'condition') {   // v33：コンディションの入力
      html = '<div class="dock-row"><button class="btn btn-primary btn-pill dock-main" data-act="condSave">' + Icon('check', 22) + 'コンディションを保存</button><span data-slot="mic"></span></div>';
    } else if (mode === 'afterSave') {   // v33：トレーニングを保存したあと
      html = '<div class="dock-row"><div class="dock-hint">声でも選べるよ</div><span data-slot="mic"></span></div>';
    } else if (mode === 'staff') {   // v35：スタッフ画面
      html = '<div class="dock-row"><div class="dock-hint">操作も質問も、話しかけてできます</div><span data-slot="mic"></span></div>';
    } else if (mode === 'mymenu') {
      html = '<div class="dock-row"><button class="btn btn-primary btn-pill dock-main" data-mm="save">' + Icon('check', 22) + '保存する</button><span data-slot="mic"></span></div>';
    }
    this.bar.innerHTML = html;
    var ms = this.bar.querySelector('[data-slot="mic"]'), ts = this.bar.querySelector('[data-slot="timer"]');
    if (ms) ms.replaceWith(mic);
    if (ts) ts.replaceWith(timer);
  },

  /** 終了画面で、保存できるセットが無いときは保存ボタンを押せなくする */
  saveDisabled: function () {
    if (S.view !== 'finish' || !S.draft) return false;
    return !S.draft.items.some(function (it) { return it.sets.some(function (s) { return s.done; }); });
  },

  /** 上の帯：返事があれば返事、なければその画面のひとこと。ホームはコーチが画面の中にいるので、返事があるときだけ（吹き出しだけ）出す */
  syncCoach: function () {
    var boxShown = !VoiceUI.box.hidden;
    var home = S.view === 'home';
    this.coach.hidden = this.el.hidden || (home ? !boxShown : (!boxShown && !this.line.textContent));
    this.coach.classList.toggle('no-avatar', home);
    this.measure();
  },

  measure: function () {
    var h = this.el.hidden ? 0 : this.el.offsetHeight;
    document.documentElement.style.setProperty('--dock-h', h + 'px');
  }
};

Dock.init();
