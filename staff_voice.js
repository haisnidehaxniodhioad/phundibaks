/**
 * staff_voice.js ― スタッフ画面の会話（話しかけて操作する・データを聞く）（v35）
 *
 *   スタッフ画面では、マイク（画面の下）かAIアシスタント（上の絵。v36 で「コーチ」から呼び名を変えた）を押して話しかける。commands.js の handleVoice から
 *   StaffVoice.handle(文) が呼ばれ、次の順番で読み取る。
 *     1. 画面の操作（「先週」「InBodyにして」「山田さんを開いて」「戻って」「1年だけ」「3か月にして」「Excelで保存」など）
 *     2. データの質問（staff_qa.js の StaffQA。「今週やってないのは誰？」「山田さんの体重は？」など）
 *     3. あいさつ・雑談（chat.js の Chat.smallTalk）
 *     4. どれでもなければ、話し方の例をボタンで出す（押すとその操作をする）
 *   話した内容は外部に送らない（AIは使わない。選手の画面と同じ決まりごとの読み取り）。
 *   スタッフ画面の言い方は覚えない（選手の「言い回し辞書」とは別）。うまく動かない言い方は、ここの /…/ に言葉を足す。
 *
 *   選手の名前：選手マスタの名前と、文の中の言葉を比べて探す（フルネーム → 名字 → 名前の順）。
 *     名字と名前の間に空白がある名前（例「山田 太郎」）だと、名字だけでも探せる。同じ名字が2人以上いるときはボタンで選ぶ。
 *     音声認識が別の漢字で聞き取ったときは見つからないので、フルネームで言い直すか、画面で名前を押す。
 */
var StaffVoice = {
  // ---------------- 入り口 ----------------
  /** text: 聞き取った文 / forced: 名前をボタンで選んだときの選手（[{id, name}]） */
  handle: function (text, forced) {
    var t = StaffVoice.norm(text);
    if (!t) return;
    // 話し方の例・何ができるか
    if (/何ができ|なにができ|何が聞け|なにがきけ|使い方|ヘルプ|話し方|何て言え|なんていえ/.test(t)) return reply(text, StaffVoice.helpText());
    // もう一回言って
    if (/(もう(1回|いっかい|1度|いちど)|もっかい)(言|いって|読|よんで)/.test(t)) return reply(text, VoiceUI.lastReply || 'まだ何も話していません。');
    // 時間・日付
    var now = new Date();
    if (/^(今|いま)?(何時|なんじ)/.test(t)) return reply(text, '今は' + now.getHours() + '時' + now.getMinutes() + '分です。');
    if (/(今日|きょう)(は)?(何日|なんにち|何曜|なんよう)/.test(t)) return reply(text, '今日は' + (now.getMonth() + 1) + '月' + now.getDate() + '日、' + '日月火水木金土'.charAt(now.getDay()) + '曜日です。');

    // 画面の操作（言い切りの指示）→ データの質問 → 名前だけ → 雑談 の順
    var people = forced || StaffVoice.findAthletes(text);
    var isQuestion = StaffVoice.isQuestion(text, t);
    if (!isQuestion && StaffVoice.nav(text, t, people)) return;
    if (StaffQA.handle(text, t, people)) return;
    if (StaffVoice.nav(text, t, people)) return;
    if (Chat.smallTalk(text)) return;
    StaffVoice.unknown(text);
  },

  /** 比べやすい形（数字をそろえ、空白・記号・長音を除く） */
  norm: function (text) { return VoiceParser.norm(VoiceParser.normalizeNumbers(text)); },

  /** 質問の言い方か（「誰？」「何人？」「〜は？」など） */
  isQuestion: function (text, t) {
    return /[?？]/.test(text) || /誰|だれ|何|なに|なん|いくつ|どう|どれ|どの|いつ|教えて|おしえて|知りたい|わかる|は$|って$|かな$|ある$|いる$/.test(t);
  },

  // ---------------- 選手の名前 ----------------
  /** 名前の一覧（実施状況 → 体組成 のどちらかに読み込んであるもの。在籍中の選手） */
  roster: function () {
    if (Staff.overview) return Staff.overview.athletes.map(function (a) { return { id: a.id, name: String(a.name), grade: a.grade, team: a.team }; });
    if (Staff.body) return Staff.body.athletes.filter(function (a) { return a.active; }).map(function (a) { return { id: a.id, name: String(a.name), grade: a.grade, team: a.team }; });
    return [];
  },

  /**
   * 文に出てくる選手を探す。いちばん確かな一致だけを返す（[{id, name}]。0人・1人・同じ名字の複数人）
   *   フルネーム（空白なし）→ 名字 → 名前 の順。名前の表記ゆれ（数字の漢字など）も吸収する
   */
  findAthletes: function (text) {
    var raw = VoiceParser.norm(text), num = StaffVoice.norm(text);
    var has = function (w) { return w.length >= 2 && (raw.indexOf(w) >= 0 || num.indexOf(StaffVoice.norm(w)) >= 0); };
    var list = StaffVoice.roster();
    var full = list.filter(function (a) { return has(VoiceParser.norm(a.name)); });
    if (full.length) {   // 長い名前を優先（「山田太郎」と「山田太」のような重なり）
      var maxLen = Math.max.apply(null, full.map(function (a) { return VoiceParser.norm(a.name).length; }));
      return full.filter(function (a) { return VoiceParser.norm(a.name).length === maxLen; });
    }
    var part = function (k) {
      return list.filter(function (a) {
        var p = String(a.name).trim().split(/[\s　]+/);
        return p.length > 1 && has(VoiceParser.norm(p[k]));
      });
    };
    var fam = part(0);
    if (fam.length) return fam;
    return part(1);
  },

  /** 同じ名字の選手が何人もいるときに、ボタンで選んでもらう（押すと、同じ文をその選手で処理し直す） */
  askWhich: function (text, people) {
    VoiceUI.show(text, '「' + people.map(function (a) { return a.name; }).join('」「') + '」のどの選手ですか？');
    Speech.speak('どの選手ですか？画面で選んでください。');
    StaffVoice.pendingText = text;   // 選んだら、同じ文をその選手で処理し直す
    VoiceUI.box.insertAdjacentHTML('beforeend', '<div class="choose-list">' + people.map(function (a) {
      return '<button class="btn sub choose-btn" data-staffid="' + esc(a.id) + '">' + esc(a.name) +
        (a.grade ? '（' + esc(a.grade) + '）' : '') + '</button>';
    }).join('') + '</div>');
    clearTimeout(VoiceUI.hideHandle);
    return true;
  },

  // ---------------- データの読み込み（画面は変えない） ----------------
  /** 実施状況（今表示している週。まだなら今週）を読み込む */
  loadOverview: function () {
    if (Staff.overview) return Promise.resolve(Staff.overview);
    return Api.call('staffOverview', { token: S.token, weekStart: Staff.week }).then(function (res) { Staff.overview = res; return res; });
  },
  /** 選手1人の詳しいデータ（コンディション全期間・直近の記録）。開いている選手ならそれを使う */
  loadDetail: function (id) {
    if (Staff.detail && Staff.detail.athlete.id === id) return Promise.resolve(Staff.detail);
    return Api.call('staffAthlete', { token: S.token, athleteId: id });
  },

  // ---------------- 画面の操作 ----------------
  /** 画面の操作として読み取れたら実行して true */
  nav: function (text, t, people) {
    var onDetail = Staff.page === 'athlete';
    var onReport = Staff.page === 'report';   // v38：フィジカルレポートのページ（個人ページとは別）
    var done = function (msg) { Avatar.feedback('success'); reply(text, msg); return true; };

    // 閉じる・読み込み直す
    if (/閉じ|とじて|とじる/.test(t)) { Body.closeHistory(); VoiceUI.box.hidden = true; Speech.stop(); return true; }
    if (/(読み込み|よみこみ)(直|なお)|更新して|最新(に|の情報に)して|リロ/.test(t)) {
      if (onDetail || onReport) { var aid = Staff.detail && Staff.detail.athlete.id; Staff.overview = null; Staff.body = null; if (aid) { Staff.showAthlete(aid); return done('最新のデータを読み込みます。'); } }
      Staff.overview = null; Staff.body = null; Staff.detail = null; Staff.render(); return done('最新のデータを読み込みます。');
    }
    // AIアシスタントの設定（声・男女）
    if (/(コチ|アシスタント|声|こえ)(の)?(設定|せってい)|設定を開/.test(t)) {
      if (window.Avatar && Avatar.openAppearancePicker) Avatar.openAppearancePicker();
      return done('AIアシスタントの設定を開きました。');
    }

    // 選手のフィジカルレポートを直接開く（「山田のフィジカルレポートを開いて」「山田の体重レポート」「山田のInBody」。v39）
    if (people.length && /フィジカル|レポト|インボディ|inbody|体組成|たいそせい/.test(t) && !/(1位|一位|順位|何位|ランキング|平均|未実施|誰)/.test(t)) {
      if (people.length > 1) return StaffVoice.askWhich(text, people);
      var rtab = /体重/.test(t) && !/フィジカル|インボディ|inbody|体組成/.test(t) ? 'weight' : 'inbody';
      var rname = people[0].name + 'さんの' + (rtab === 'weight' ? '体重レポート' : 'フィジカルレポート');
      VoiceUI.show(text, rname + 'を開きます。');
      var said = function () { if (Staff.page === 'report') { Avatar.feedback('success'); reply(text, rname + 'です。「体重にして」「InBodyにして」で切り替え、「戻って」で戻ります。'); } };
      var pr = Staff.openReport(people[0].id, rtab);
      if (pr && pr.then) pr.then(said); else said();
      return true;
    }
    // 選手を開く（「山田さんを開いて」「山田の記録」「山田」だけでも）
    var openWord = /開い|開け|ひらい|ひらけ|見せ|みせ|見たい|みたい|表示|詳細|しょうさい|(の)?(ペジ|画面|記録|きろく|レポト|データ)(を)?$|に(して|切り替え)/.test(t);
    var nameOnly = people.length && t.replace(/さん|くん|ちゃん|選手/g, '').length <= VoiceParser.norm(people[0].name).length + 2;
    if (people.length && (openWord || nameOnly) && !/(1位|一位|順位|何位|ランキング|平均|未実施|誰)/.test(t)) {
      if (people.length > 1) return StaffVoice.askWhich(text, people);
      VoiceUI.show(text, people[0].name + 'さんのページを開きます。');
      Staff.showAthlete(people[0].id).then(function () {
        if (Staff.page !== 'athlete') return;   // 読み込みに失敗したとき
        Avatar.feedback('success');
        reply(text, people[0].name + 'さんのページです。' + StaffQA.athleteBrief(people[0].id));
      });
      return true;
    }

    // 一覧へ戻る
    if (/(一覧|いちらん|前の画面|まえのがめん)(に|へ)?(戻|もど)?|^(戻|もど)(って|る)/.test(t)) {
      if (onDetail || onReport) { Staff.back(); return done(onReport && Staff.reportFrom !== 'list' ? '個人ページに戻りました。' : '元の画面に戻りました。'); }
      Body.closeHistory(); Staff.render(); return done('一覧に戻りました。');
    }

    // タブ
    var metric = StaffQA.metricOf(t);
    if (/実施状況|じっしじょうきょう|実施の(一覧|状況)/.test(t)) { Staff.tab = 'overview'; Staff.render(); return done('実施状況を開きました。'); }
    if (metric && /ランキング|らんきんぐ|順(に|で)(並べ|ならべ)|の順/.test(t) && !people.length) {
      Staff.tab = 'inbody'; StaffBody.metric = metric.key; Staff.render();
      return done(metric.label + 'のランキングにしました。');
    }
    // 個人ページでは、フィジカルレポート（別のページ）を開く。フィジカルレポートのページでは InBody／体重 を切り替える（v38）
    if ((onDetail || onReport) && !people.length && /インボディ|inbody|体組成|たいそせい|フィジカル|体重/.test(t) && /にして|に$|に切り替え|見せ|みせ|開|ひら|表示|タブ|レポト|^(体重|インボディ|inbody|フィジカル)$/.test(t)) {
      var ptab = /体重/.test(t) && !/インボディ|inbody|フィジカル/.test(t) ? 'weight' : 'inbody';
      if (onDetail) Staff.showReport(ptab); else Staff.setPhys(ptab);
      return done(ptab === 'weight' ? '体重レポートにしました。' : 'InBodyのフィジカルレポートにしました。');
    }
    if (/インボディ|inbody|体組成|たいそせい/.test(t) && !people.length) { Staff.tab = 'inbody'; Staff.render(); return done('InBodyのタブを開きました。'); }
    if (/体重/.test(t) && /(タブ|一覧|いちらん|にして|に切り替え|開|ひら|見せ|みせ)/.test(t) && !people.length) {
      Staff.tab = 'weight'; Staff.render(); return done('体重のタブを開きました。');
    }

    // コンディションのグラフ（選手のページ）
    if (onDetail && /3か月|3ヶ月|3カ月|三か月|さんかげつ|週平均|しゅうへいきん/.test(t)) { CondChart.mode = 'quarter'; CondChart.offset = 0; CondChart.render(); return done('コンディションのグラフを、3か月の週平均にしました。'); }
    if (onDetail && /1週間|いっしゅうかん|毎日|まいにち/.test(t) && !StaffVoice.isQuestion(text, t)) { CondChart.mode = 'week'; CondChart.offset = 0; CondChart.render(); return done('コンディションのグラフを、1週間の毎日の値にしました。'); }

    // 週の切り替え（一覧では実施状況の週、選手のページではグラフ）
    var prev = /先週|せんしゅう|前の週|まえのしゅう|1週(間)?前|前の(期間|3か月)|もっと前/.test(t);
    var next = /次の週|つぎのしゅう|来週|らいしゅう|翌週|次の(期間|3か月)/.test(t);
    var thisWeek = /今週(に|へ|を)?(戻|もど|見|みせ|表示|にして)|最新(に|へ)(戻|もど)/.test(t);
    if ((prev || next || thisWeek) && !StaffVoice.isQuestion(text, t)) {
      if (onDetail) {
        CondChart.offset = thisWeek ? 0 : Math.max(0, CondChart.offset + (prev ? 1 : -1)); CondChart.render();
        return done(thisWeek ? '最新の期間に戻しました。' : prev ? '前の期間にしました。' : '次の期間にしました。');
      }
      Staff.tab = 'overview';
      if (thisWeek) Staff.week = null;
      else {
        var base = new Date((Staff.overview ? Staff.overview.weekStart : Body.today()).replace(/-/g, '/'));
        base.setDate(base.getDate() + (prev ? -7 : 7));
        Staff.week = base.getFullYear() + '-' + ('0' + (base.getMonth() + 1)).slice(-2) + '-' + ('0' + base.getDate()).slice(-2);
      }
      Staff.overview = null; Staff.render();
      return done(thisWeek ? '今週の実施状況にしました。' : prev ? '前の週の実施状況にしました。' : '次の週の実施状況にしました。');
    }

    // 絞り込み（「1年だけ」「Aチームだけ」「全員」）
    var gm = t.match(/(\d)年(生)?(だけ|のみ|に絞|で絞|を表示|にして)/);
    if (gm) {
      var grades = uniq(StaffVoice.roster().map(function (a) { return String(a.grade); })).filter(function (g) { return g.indexOf(gm[1]) >= 0; });
      if (!grades.length) return reply(text, gm[1] + '年の選手が見つかりません（選手マスタの「学年」を確認してください）。', true);
      Staff.filter.grade = grades[0]; Staff.render(); return done(grades[0] + 'だけを表示しました。');
    }
    var tm = text.normalize('NFKC').match(/([A-Za-zＡ-Ｚａ-ｚ0-9]+|[^\s、。]{1,6}?)\s*チーム\s*(だけ|のみ|に絞|で絞|を表示|にして)/);
    if (tm) {
      var key = tm[1].toUpperCase(), teams = uniq(StaffVoice.roster().map(function (a) { return String(a.team); })).filter(function (x) { return x && x.toUpperCase() === key; });
      if (!teams.length) return reply(text, '「' + tm[1] + '」チームが見つかりません。', true);
      Staff.filter.team = teams[0]; Staff.render(); return done(teams[0] + 'チームだけを表示しました。');
    }
    if (/全員(を)?(表示|見せ|にして)|絞り込み(を)?(解除|やめ|なし|外)|全部(を)?表示|すべて(を)?表示/.test(t)) {
      Staff.filter.grade = ''; Staff.filter.team = ''; Staff.render(); return done('全員を表示しました。');
    }

    // 保存（Excel・PDF）
    var xls = /エクセル|excel/.test(t), pdf = /pdf|ピディエフ|ピーディーエフ/.test(t);
    if ((xls || pdf) && /保存|ほぞん|出力|作って|つくって|ダウンロ|印刷/.test(t)) {
      if ((onDetail || onReport) && Staff.current) {
        if (xls) { Export.reportExcel(Staff.current); return done('InBodyと体重の履歴をExcelで保存します。'); }
        Export.reportPdf(Staff.current, /体重/.test(t) ? 'weight' : 'inbody');
        return done((/体重/.test(t) ? '体重レポート' : 'フィジカルレポート') + 'の印刷画面を開きます。「PDFとして保存」を選んでください。');
      }
      if (Staff.page === 'overview' && Staff.overview) {
        if (xls) { Export.overviewExcel(Staff.overview, Staff.overviewList); return done('実施状況をExcelで保存します。'); }
        Export.overviewPdf(Staff.overview, Staff.overviewList); return done('実施状況の印刷画面を開きます。「PDFとして保存」を選んでください。');
      }
      return reply(text, 'この画面では、画面のボタンから保存してください。', true);
    }
    // ログアウトは声ではしない（間違えて押したことにならないように）
    if (/ログアウト/.test(t)) { reply(text, 'ログアウトは、画面の右上の「ログアウト」を押してください。'); return true; }
    return false;
  },

  // ---------------- わからなかったとき ----------------
  EXAMPLES: [
    ['今週やってないのは誰？', '未実施の選手'],
    ['疲れている選手は？', '疲労8以上の選手'],
    ['コンディションを入れていないのは誰？', 'コンディション未入力'],
    ['FFMIの1位は？', '体組成の1位'],
    ['先週にして', '前の週を見る'],
    ['InBodyにして', 'InBodyのタブ'],
    ['何ができる？', '話し方の例']
  ],
  unknown: function (text) {
    Avatar.feedback('confirming', 1600);
    VoiceUI.show(text, 'うまく読み取れませんでした。近いものがあれば選んでください。選手の名前は、フルネームで言うと見つかりやすいです。');
    VoiceUI.box.insertAdjacentHTML('beforeend', '<div class="choose-list">' + StaffVoice.EXAMPLES.map(function (e) {
      return '<button class="btn sub choose-btn" data-staffv="' + esc(e[0]) + '">' + esc(e[1]) + '（「' + esc(e[0]) + '」）</button>';
    }).join('') + '<button class="btn ghost choose-btn" data-staffv="">閉じる</button></div>');
    clearTimeout(VoiceUI.hideHandle);
    Speech.speak('すみません、わかりませんでした。画面から選んでください。');
  },

  helpText: function () {
    return '画面の操作は「（選手の名前）のフィジカルレポートを開いて」「先週にして」「InBodyにして」「体重のタブ」「（選手の名前）を開いて」「戻って」「1年だけ」「全員を表示」「Excelで保存」。' +
      '選手の個人ページでは「3か月にして」「1週間にして」「前の週」「フィジカルレポートを開いて」「体重レポートを開いて」「戻って」。フィジカルレポートのページでは「体重にして」「InBodyにして」「戻って」。' +
      '質問は「今週やってないのは誰？」「何人やった？」「疲れている選手は？」「動きが悪い選手は？」「コンディションを入れていないのは誰？」「下半身をやっていないのは誰？」' +
      '「チームの疲労の平均は？」「FFMIの1位は？」「体重を測っていないのは誰？」「（名前）の体重は？」「（名前）の除脂肪体重の推移は？」「（名前）の疲労の推移は？」「（名前）のコンディションは？」「（名前）の今週は？」「（名前）が最後にやったのはいつ？」などです。';
  },

  /** スタッフ画面の一番下に「話し方の例」を出す（commands.js の VoiceUI.update から呼ぶ） */
  helpCard: function () {
    if (document.getElementById('voiceHelp')) return;
    var help = document.createElement('details');
    help.id = 'voiceHelp';
    help.className = 'card voice-help';
    help.innerHTML = '<summary>🎤 話し方の例（スタッフ）</summary>' +
      '操作：「（選手の名前）のフィジカルレポートを開いて」「（選手の名前）の体重レポート」「先週にして」「今週に戻して」「InBodyにして」「体重のタブ」「FFMIのランキング」「（選手の名前）を開いて」「戻って」「1年だけ」「Aチームだけ」「全員を表示」「Excelで保存」「PDFで保存」「閉じて」「AIアシスタントの設定」<br>' +
      '選手の個人ページ：「3か月にして」「1週間にして」「前の週」「次の週」「フィジカルレポートを開いて」「体重レポートを開いて」「戻って」<br>フィジカルレポート：「体重にして」「InBodyにして」「PDFで保存」「戻って」<br>' +
      '質問：' + StaffQA.TOPICS.map(function (tp) { return '「' + tp.examples[0] + '」'; }).join('') + '<br>' +
      '選手の名前は選手マスタの名前と比べて探します（名字だけでも、同じ名字がいなければ見つかります）。わからない言い方のときは、画面に候補が出ます。';
    document.getElementById('app').appendChild(help);
  }
};

// 候補のボタン（data-staffv＝その文を話したことにする、data-staffid＝同じ名字の中から選んだ選手）
VoiceUI.box.addEventListener('click', function (e) {
  var b = e.target.closest('[data-staffv], [data-staffid]');
  if (!b) return;
  VoiceUI.box.hidden = true;
  if (b.dataset.staffid) {
    var a = StaffVoice.roster().filter(function (x) { return x.id === b.dataset.staffid; })[0];
    if (a && StaffVoice.pendingText) StaffVoice.handle(StaffVoice.pendingText, [a]);
    return;
  }
  if (b.dataset.staffv) StaffVoice.handle(b.dataset.staffv);
});
