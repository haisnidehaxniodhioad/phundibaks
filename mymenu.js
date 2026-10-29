/**
 * mymenu.js ― 自分のメニュー（マイメニュー）の作成・保存・開始（Phase 3f）
 *
 *   ホームの「自分のメニュー」カード: 保存したメニューから始める／編集／新しく作る／白紙から記録する
 *   作成・編集の画面（S.view = 'mymenu'）: メニューの名前と、種目・セット数・回数・レスト
 *   終了画面: 自分のメニューで記録したとき、その内容をメニューとして保存（または元のメニューを更新）
 *   保存先はマイメニューシート（サーバーの マイメニュー.gs）。スタッフ画面の選手詳細でも見られる。
 *
 *   保存したメニューから始めると、種目・セット数・回数が予定として入り、重量は前回の記録が入る（Dayと同じ）。
 */
var MyMenu = {
  list: function () { return (S.home && S.home.myMenus) || []; },
  find: function (id) { return MyMenu.list().filter(function (m) { return m.id === id; })[0] || null; },

  // ---------------- ホームのカード ----------------
  homeCard: function () {
    var list = MyMenu.list();
    return '<section class="sec"><div class="sec-head"><h2>自分のメニュー</h2><button class="btn ghost small" data-mm="new">' + Icon('plus', 18) + '作る</button></div>' +
      (list.length ? list.map(function (m) {
        return '<div class="mm-row"><span class="mm-icon">' + Icon('barbell', 26) + '</span>' +
          '<div class="mm-text"><b>' + esc(m.name) + '</b><span class="small">' + m.items.map(function (it) { return esc(it.name); }).join('・') + '</span></div>' +
          '<button class="btn ghost small" data-mm="edit" data-id="' + esc(m.id) + '">編集</button>' +
          '<button class="btn mm-play" data-mm="start" data-id="' + esc(m.id) + '" aria-label="' + esc(m.name) + 'を始める">' + Icon('play', 22) + '</button></div>';
      }).join('') : '<p class="muted small">よくやるメニューを保存しておくと、次からここで選んで同じ種目・セット数で始められます。</p>') +
      '<button class="btn ghost block" data-act="startFree">白紙から記録する</button>' +
      '<p class="muted small">白紙から記録したときも、終わったあとの画面でその内容をメニューとして保存できます。</p></section>';
  },

  /** 保存したメニューで始める（text は音声で始めたときの聞き取った文） */
  start: function (id, text) {
    var m = MyMenu.find(id);
    if (!m) return;
    if (S.draft && !confirm('途中のトレーニングの記録を破棄して、新しく始めますか？')) return;
    S.draft = { id: newId(), startedAt: new Date().toISOString(), type: '個別', title: m.name, myMenuId: m.id, myMenuName: m.name,
                items: m.items.map(function (it) {
                  var ex = findExercise(it.name);
                  return makeItem({ name: ex ? ex.name : it.name, category: ex ? ex.category : '', reps: it.reps, sets: it.sets, rest: it.rest }, true);
                }) };
    applyBackdate(S.draft);   // 記録し忘れた日の分を選んでいたら、その日の記録にする（v26）
    saveDraft();
    renderSession();
    Avatar.feedback('success');
    var say = announceStart(Talk.ok() + m.name + 'を始めるよ。');   // 種目の一覧を伝えて、どれから始めるか選んでもらう（app.js）
    if (text) reply(text, say); else Speech.speak(say);
  },

  // ---------------- 作成・編集の画面 ----------------
  /** id があればそのメニューを編集、無ければ新しく作る。items を渡すとその内容で作り始める */
  edit: function (id, items, name) {
    var m = id ? MyMenu.find(id) : null;
    S.edit = { id: m ? m.id : '', name: m ? m.name : (name || ''),
               items: (m ? m.items : items || [{ name: '', sets: 3, reps: 10, rest: 60 }]).map(function (it) {
                 return { name: it.name, sets: it.sets, reps: it.reps, rest: it.rest || 0 };
               }) };
    MyMenu.renderEdit();
  },

  renderEdit: function (error) {
    S.view = 'mymenu';
    var e = S.edit;
    var num = function (cls, i, v, label, max) {
      return '<label class="mm-num"><span>' + label + '</span><input type="number" inputmode="numeric" min="0" max="' + max + '" class="' + cls + '" data-i="' + i + '" value="' + esc(v) + '"></label>';
    };
    // 「保存する」は画面の下のバー（dock.js）にある
    var html = '<div class="topbar"><h1>' + (e.id ? 'メニューを編集' : 'メニューを作る') + '</h1><button class="btn ghost" data-mm="cancel">やめる</button></div>' +
      msgHtml('error', error) +
      '<label for="mmName">メニューの名前</label><input id="mmName" class="input-pill" maxlength="30" placeholder="例：上半身A" value="' + esc(e.name) + '">' +
      '<p class="muted small">「' + esc(e.name || '上半身A') + 'を始める」と話しかけると始まります。</p>' +
      '<section class="sec"><h2>種目</h2>' + e.items.map(function (it, i) {
        return '<div class="mm-item"><div class="row nowrap"><span class="mm-no">' + (i + 1) + '</span>' +
          '<input class="mm-name" data-i="' + i + '" list="exList" placeholder="種目名" value="' + esc(it.name) + '" style="flex:1">' +
          (i > 0 ? '<button class="btn ghost icon-btn" data-mm="up" data-i="' + i + '" aria-label="上へ">' + Icon('up', 20) + '</button>' : '') +
          (i < e.items.length - 1 ? '<button class="btn ghost icon-btn" data-mm="down" data-i="' + i + '" aria-label="下へ">' + Icon('down', 20) + '</button>' : '') +
          '<button class="btn ghost icon-btn danger-text" data-mm="del" data-i="' + i + '" aria-label="消す">' + Icon('trash', 20) + '</button></div>' +
          '<div class="mm-nums">' + num('mm-sets', i, it.sets, 'セット', 6) + num('mm-reps', i, it.reps, '回数', 100) + num('mm-rest', i, it.rest, 'レスト(秒)', 900) + '</div></div>';
      }).join('') +
      '<button class="btn sub btn-pill block" data-mm="add">' + Icon('plus', 18) + '種目を追加</button>' +
      '<datalist id="exList">' + S.home.exercises.map(function (x) { return '<option value="' + esc(x.name) + '">'; }).join('') + '</datalist></section>' +
      (e.id ? '<button class="btn ghost block danger-text" data-mm="remove">このメニューを消す</button>' : '');
    app.innerHTML = html;
  },

  /** 入力欄の内容を S.edit に取り込む（行の追加・並べ替えの前に呼ぶ） */
  readForm: function () {
    var e = S.edit, el = document.getElementById('mmName');
    if (el) e.name = el.value;
    var val = function (cls, i) { var x = app.querySelector('.' + cls + '[data-i="' + i + '"]'); return x ? x.value : ''; };
    e.items.forEach(function (it, i) {
      it.name = val('mm-name', i).trim(); it.sets = Number(val('mm-sets', i)) || 1; it.reps = Number(val('mm-reps', i)) || 0; it.rest = Number(val('mm-rest', i)) || 0;
    });
  },

  save: function () {
    MyMenu.readForm();
    var e = S.edit, items = e.items.filter(function (it) { return it.name; });
    if (!e.name.trim()) return MyMenu.renderEdit('メニューの名前を入れてください。');
    if (!items.length) return MyMenu.renderEdit('種目を1つ以上入れてください。');
    items.forEach(function (it) { var ex = findExercise(it.name); if (ex) it.name = ex.name; });   // 呼び方の候補で入れた名前は正式名にそろえる
    document.querySelectorAll('[data-mm="save"]').forEach(function (b) { b.disabled = true; });   // 二重に押されないように
    MyMenu.send({ id: e.id, name: e.name.trim(), items: items }).then(function (res) {
      S.edit = null;
      renderHome('「' + res.menu.name + '」を保存しました。');
      Avatar.feedback('success');
      Speech.speak(Talk.ok() + res.menu.name + 'を保存したよ。次からホームで選んで始められるよ。');
    }).catch(function (err) { MyMenu.renderEdit(err.message); });
  },

  remove: function () {
    var e = S.edit;
    if (!confirm('「' + e.name + '」を消しますか？（これまでの記録は消えません）')) return;
    Api.call('deleteMyMenu', { token: S.token, id: e.id }).then(function (res) {
      S.home.myMenus = res.myMenus; Store.set('home', S.home); S.edit = null;
      renderHome('メニューを消しました。');
    }).catch(function (err) { MyMenu.renderEdit(err.message); });
  },

  /** サーバーに保存して、ホームのデータ（端末に保存しているもの）も新しくする */
  send: function (menu) {
    return Api.call('saveMyMenu', { token: S.token, menu: menu }).then(function (res) {
      S.home.myMenus = res.myMenus; Store.set('home', S.home);
      return res;
    });
  },

  // ---------------- 終了画面から保存 ----------------
  /** 今回のトレーニングの内容（✓を付けたセットがある種目）をメニューの形にする */
  fromDraft: function (dr) {
    return dr.items.filter(function (it) { return it.sets.some(function (s) { return s.done; }); }).map(function (it) {
      var done = it.sets.filter(function (s) { return s.done; });
      return { name: it.name, sets: done.length, reps: Number(done[done.length - 1].r) || (it.planned ? it.planned.reps : 0), rest: it.rest || 0 };
    });
  },

  /** 終了画面に出すカード（自分のメニューで記録したときだけ） */
  finishCard: function (dr, notice) {
    if (dr.type !== '個別') return '';
    var items = MyMenu.fromDraft(dr);
    if (!items.length) return '';
    var src = dr.myMenuId ? MyMenu.find(dr.myMenuId) : null;
    return '<section class="mm-finish"><div class="mm-finish-head"><span class="mm-icon">' + Icon('bookmark', 24) + '</span><b>今日の内容を自分のメニューに保存</b></div>' + msgHtml('ok', notice) +
      '<p class="small">' + items.map(function (it) { return esc(it.name) + ' ' + it.reps + '回×' + it.sets; }).join('・') + '</p>' +
      (src ? '<button class="btn sub btn-pill block" data-mm="saveFinish" data-over="1">「' + esc(src.name) + '」を今日の内容で更新する</button>' : '') +
      '<label for="mmFinishName">' + (src ? '別の名前で保存' : 'メニューの名前') + '</label><div class="row nowrap">' +
      '<input id="mmFinishName" class="input-pill" maxlength="30" placeholder="例：上半身A" style="flex:1"><button class="btn sub btn-pill" data-mm="saveFinish">保存</button></div>' +
      '<p class="muted small">保存すると、次からホームで選んで同じ種目・セット数で始められます（トレーニングの記録の保存は下の「記録を保存する」）。</p></section>';
  },

  saveFromFinish: function (overwrite) {
    var dr = S.draft, src = overwrite && dr.myMenuId ? MyMenu.find(dr.myMenuId) : null;
    var nameEl = document.getElementById('mmFinishName');
    var name = src ? src.name : (nameEl ? nameEl.value.trim() : '');
    if (!name) { alert('メニューの名前を入れてください。'); if (nameEl) nameEl.focus(); return Promise.resolve(); }
    return MyMenu.send({ id: src ? src.id : '', name: name, items: MyMenu.fromDraft(dr) }).then(function (res) {
      dr.myMenuId = res.menu.id; dr.myMenuName = res.menu.name; dr.title = res.menu.name; saveDraft();
      renderFinish(null, '「' + res.menu.name + '」を保存しました。');
      return res;
    }).catch(function (err) { alert('保存できませんでした：' + err.message); });
  },

  /** 終了画面で「マイメニューに保存」と話したとき */
  voiceSaveFromFinish: function (text) {
    var dr = S.draft;
    if (dr.type !== '個別' || !MyMenu.fromDraft(dr).length) return reply(text, '自分のメニューで記録したときに保存できるよ。', true);
    if (dr.myMenuId && MyMenu.find(dr.myMenuId)) {
      return MyMenu.saveFromFinish(true).then(function (res) { if (res) reply(text, Talk.ok() + res.menu.name + 'を今日の内容で更新したよ。'); });
    }
    var el = document.getElementById('mmFinishName');
    if (el) el.focus();
    reply(text, 'メニューの名前を入れて「保存」を押してね。');
  }
};

// data-mm の付いたボタンを押したときの動き。画面の下のバー（dock.js）の「保存する」もここを通る
app.addEventListener('click', function (e) {
  var t = e.target.closest('[data-mm]');
  if (t) MyMenu.onClick(t);
});

MyMenu.onClick = function (t) {
  var i = Number(t.dataset.i), ed = S.edit;
  switch (t.dataset.mm) {
    case 'start': MyMenu.start(t.dataset.id); break;
    case 'edit': MyMenu.edit(t.dataset.id); break;
    case 'new': MyMenu.edit(null); break;
    case 'cancel': S.edit = null; renderHome(); break;
    case 'add': MyMenu.readForm(); var last = ed.items[ed.items.length - 1];
      ed.items.push({ name: '', sets: last ? last.sets : 3, reps: last ? last.reps : 10, rest: last ? last.rest : 60 }); MyMenu.renderEdit();
      var inputs = app.querySelectorAll('.mm-name'); if (inputs.length) inputs[inputs.length - 1].focus(); break;
    case 'del': MyMenu.readForm(); ed.items.splice(i, 1); if (!ed.items.length) ed.items.push({ name: '', sets: 3, reps: 10, rest: 60 }); MyMenu.renderEdit(); break;
    case 'up': case 'down': MyMenu.readForm(); var j = i + (t.dataset.mm === 'up' ? -1 : 1);
      var tmp = ed.items[i]; ed.items[i] = ed.items[j]; ed.items[j] = tmp; MyMenu.renderEdit(); break;
    case 'save': MyMenu.save(); break;
    case 'remove': MyMenu.remove(); break;
    case 'saveFinish': MyMenu.saveFromFinish(t.dataset.over === '1'); break;
  }
};
