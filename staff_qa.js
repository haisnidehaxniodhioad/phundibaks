/**
 * staff_qa.js ― スタッフの質問に、AIアシスタント（選手の画面ではコーチ）が答える（v35。v36で呼び名を変えた）
 *
 *   スタッフ画面で見られるデータだけを使って答える（新しい通信の仕組みは作っていない）。
 *     ・実施状況（staffOverview）… 表示している週の、選手ごとの回数・Day・部位のセット数・その週のコンディション・最終実施日
 *     ・体組成（staffBody）      … 全選手の体重・InBody（FFMIなど）
 *     ・選手1人（staffAthlete）  … コンディションの全期間・直近のトレーニング
 *   「週」はスタッフ画面で表示している週（‹ › や「先週にして」で変えた週）。学年・チームで絞り込んでいるときは、その中で答える。
 *   名前を挙げるのは最大10人まで（それより多いときは「ほか○人」）。
 *
 * ★ 答えられることを増やすときは、下の TOPICS に1つ足す（選手の qa.js と同じ形）。
 *     examples … 話し方の例（「何ができる？」の説明と、画面の「話し方の例」に出る）
 *     test(q)  … この話題の質問なら true（q.t＝読み取りやすくした文、q.person＝文に出てきた選手、q.metric＝体組成の項目）
 *     need     … 答えるのに必要なデータ（'overview' / 'body' / 'detail'。detail は q.person の選手のデータ）
 *     answer(q, d) … 答えの文を返す（d.overview, d.body, d.detail）
 *   上にある話題ほど先に調べる。
 */
var StaffQA = {
  FATIGUE_ALERT: 8,   // 「疲れている」とみなす疲労の値（以上）
  PERF_LOW: 3,        // 「動きが悪い」とみなす動きやすさの値（以下）
  STALE_DAYS: 7,      // 「しばらくやっていない」とみなす日数

  METRICS: [
    { key: 'ffmi', label: 'FFMI', unit: '', re: /ffmi|エフエフエムアイ/ },
    { key: 'lbm', label: '除脂肪体重', unit: 'キロ', re: /除脂肪|じょしぼう|筋肉量/ },
    { key: 'fat', label: '体脂肪率', unit: 'パーセント', re: /体脂肪|たいしぼう|脂肪率/ },
    { key: 'weight', label: '体重', unit: 'キロ', re: /体重|たいじゅう/ }
  ],
  metricOf: function (t) { return StaffQA.METRICS.filter(function (m) { return m.re.test(t); })[0] || null; },

  TOPICS: [
    {
      examples: ['今週やってないのは誰？'],
      test: function (q) { return !q.person && /(やって|実施して|トレニングして|来て|きて|して)(い)?ない|未実施|みじっし|サボ/.test(q.t) && !/下半身|上半身|コンディション|体重|測|はか|最近|しばらく|ずっと|\d+日/.test(q.t); },
      need: ['overview'],
      answer: function (q, d) {
        var list = StaffQA.people(d.overview), not = list.filter(function (a) { return !a.sessions; });
        if (!not.length) return StaffQA.weekLabel(d.overview) + StaffQA.scope() + 'は、全員がトレーニングしています。';
        return StaffQA.weekLabel(d.overview) + StaffQA.scope() + '、まだトレーニングしていないのは' + not.length + '人です。' + StaffQA.names(not) + '。';
      }
    },
    {
      examples: ['何人やった？'],
      test: function (q) { return !q.person && /(何人|なんにん|実施率|何割)/.test(q.t) && /(やった|実施|トレニング|した|来た)/.test(q.t) && !/コンディション/.test(q.t); },
      need: ['overview'],
      answer: function (q, d) {
        var list = StaffQA.people(d.overview), done = list.filter(function (a) { return a.sessions; });
        var full = list.filter(function (a) { return a.menuDays && a.daysDone >= a.menuDays; });
        return StaffQA.weekLabel(d.overview) + StaffQA.scope() + 'は、' + list.length + '人中' + done.length + '人がトレーニングしています（' +
          (list.length ? Math.round(done.length / list.length * 100) : 0) + 'パーセント）。チームメニューを全部終えたのは' + full.length + '人です。';
      }
    },
    {
      examples: ['疲れている選手は？'],
      test: function (q) { return !q.person && /疲れ(て|た)?(いる|てる)?(選手|人|の|は)|疲れてる|疲労(が|の)?(高|多|たか|大き|強)|きつそう|しんどそう/.test(q.t) && !/平均/.test(q.t); },
      need: ['overview'],
      answer: function (q, d) {
        var A = StaffQA.FATIGUE_ALERT;
        var hot = StaffQA.people(d.overview).filter(function (a) { return a.cond && Math.max(a.cond.whole, a.cond.upper, a.cond.lower) >= A; })
          .sort(function (x, y) { return StaffQA.maxF(y.cond) - StaffQA.maxF(x.cond); });
        if (!hot.length) return StaffQA.weekLabel(d.overview) + StaffQA.scope() + 'のコンディションで、疲労が' + A + '以上の選手はいません。';
        return StaffQA.weekLabel(d.overview) + 'のいちばん新しいコンディションで、疲労が' + A + '以上なのは' + hot.length + '人です。' +
          hot.slice(0, 10).map(function (a) { return a.name + 'さん（' + StaffQA.fText(a.cond) + '）'; }).join('、') + (hot.length > 10 ? '、ほか' + (hot.length - 10) + '人' : '') + '。';
      }
    },
    {
      examples: ['動きが悪い選手は？'],
      test: function (q) { return !q.person && /動き(が|の)?(悪|わる|よくない|良くない|低)|調子(が|の)?(悪|わる)|パフォマンス(が|の)?(低|悪|わる)|動きにくい/.test(q.t); },
      need: ['overview'],
      answer: function (q, d) {
        var L = StaffQA.PERF_LOW;
        var low = StaffQA.people(d.overview).filter(function (a) { return a.cond && a.cond.perf !== '' && a.cond.perf <= L; })
          .sort(function (x, y) { return x.cond.perf - y.cond.perf; });
        if (!low.length) return StaffQA.weekLabel(d.overview) + StaffQA.scope() + 'のコンディションで、動きやすさが' + L + '以下の選手はいません。';
        return StaffQA.weekLabel(d.overview) + 'のいちばん新しいコンディションで、動きやすさが' + L + '以下なのは' + low.length + '人です。' +
          low.slice(0, 10).map(function (a) { return a.name + 'さん（' + a.cond.perf + '）'; }).join('、') + (low.length > 10 ? '、ほか' + (low.length - 10) + '人' : '') + '。';
      }
    },
    {
      examples: ['コンディションを入れていないのは誰？'],
      test: function (q) { return !q.person && /コンディション|体調/.test(q.t) && /(入れて|入力して|記録して|つけて|付けて|書いて)(い)?ない|未入力|みにゅうりょく|(何人|なんにん)/.test(q.t); },
      need: ['overview'],
      answer: function (q, d) {
        var list = StaffQA.people(d.overview), none = list.filter(function (a) { return !a.condCount; });
        if (/(何人|なんにん)/.test(q.t) && !/ない|未入力/.test(q.t)) return StaffQA.weekLabel(d.overview) + StaffQA.scope() + 'は、' + list.length + '人中' + (list.length - none.length) + '人がコンディションを記録しています。';
        if (!none.length) return StaffQA.weekLabel(d.overview) + StaffQA.scope() + 'は、全員がコンディションを1回以上記録しています。';
        return StaffQA.weekLabel(d.overview) + StaffQA.scope() + '、コンディションを1回も記録していないのは' + none.length + '人です。' + StaffQA.names(none) + '。';
      }
    },
    {
      examples: ['下半身をやっていないのは誰？'],
      test: function (q) { return !q.person && /(下半身|上半身)(の)?(トレニング|種目)?(を)?(やって|して)(い)?ない/.test(q.t); },
      need: ['overview'],
      answer: function (q, d) {
        var part = /下半身/.test(q.t) ? '下半身' : '上半身';
        var list = StaffQA.people(d.overview).filter(function (a) { return a.sessions && !a.sets[part]; });
        if (!list.length) return StaffQA.weekLabel(d.overview) + StaffQA.scope() + 'にトレーニングした選手は、全員' + part + 'のセットがあります。';
        return StaffQA.weekLabel(d.overview) + 'にトレーニングしたけれど、' + part + 'のセットが無いのは' + list.length + '人です。' + StaffQA.names(list) + '。';
      }
    },
    {
      examples: ['しばらくやっていないのは誰？'],
      test: function (q) { return !q.person && /(しばらく|長い間|ながいあいだ|ずっと|最近|\d+日(以上|間)?)(トレニング)?(を)?(やって|して|来て|きて)(い)?ない/.test(q.t); },
      need: ['overview'],
      answer: function (q, d) {
        var n = Number((q.t.match(/(\d+)日/) || [])[1]) || StaffQA.STALE_DAYS, limit = Body.addDays(Body.today(), -n);
        var list = StaffQA.people(d.overview).filter(function (a) { return !a.lastDate || a.lastDate < limit; })
          .sort(function (x, y) { return (x.lastDate || '') < (y.lastDate || '') ? -1 : 1; });
        if (!list.length) return StaffQA.scope('全員') + '、' + n + '日以内にトレーニングしています。';
        return n + '日以上トレーニングの記録が無いのは' + list.length + '人です。' + list.slice(0, 10).map(function (a) {
          return a.name + 'さん（' + (a.lastDate ? '最後は' + StaffQA.md(a.lastDate) : '記録なし') + '）';
        }).join('、') + (list.length > 10 ? '、ほか' + (list.length - 10) + '人' : '') + '。';
      }
    },
    {
      examples: ['チームの疲労の平均は？'],
      test: function (q) { return !q.person && (/(チーム|全体|全員|みんな)(の)?(疲労|疲れ|コンディション|動き|体調)/.test(q.t) || /(疲労|疲れ|コンディション|動きやすさ)(の)?平均/.test(q.t)); },
      need: ['overview'],
      answer: function (q, d) {
        var c = StaffQA.people(d.overview).filter(function (a) { return a.cond; }).map(function (a) { return a.cond; });
        if (!c.length) return StaffQA.weekLabel(d.overview) + StaffQA.scope() + 'は、まだコンディションの記録がありません。';
        var av = function (k) { return CondChart.avg(c, k); };
        return StaffQA.weekLabel(d.overview) + StaffQA.scope() + 'の、各選手のいちばん新しいコンディションの平均（' + c.length + '人）は、全身の疲労' + av('whole') +
          '、上半身' + av('upper') + '、下半身' + av('lower') + '、動きやすさ' + av('perf') + 'です。';
      }
    },
    {
      examples: ['FFMIの1位は？', '体脂肪率のランキングは？'],
      test: function (q) { return !q.person && !!q.metric && /(1位|一位|トップ|一番|いちばん|上位|ランキング|順位|高い(人|選手)|重い(人|選手))/.test(q.t); },
      need: ['body'],
      answer: function (q, d) {
        var m = q.metric, rows = StaffQA.bodyLatest(d.body, m.key);
        if (!rows.length) return m.label + 'の記録がまだありません。';
        var top = rows.slice(0, 3);
        return StaffQA.scope('在籍中の選手') + 'のいちばん新しい記録で、' + m.label + 'の上位は、' + top.map(function (r, i) {
          return (i + 1) + '位 ' + r.name + 'さん ' + StaffQA.num(r.value, m) + '（' + StaffQA.md(r.date) + '）';
        }).join('、') + 'です。全部で' + rows.length + '人です。';
      }
    },
    {
      examples: ['体重を測っていないのは誰？'],
      test: function (q) { return !q.person && (/体重(を)?(測|はか|計)(って|ら)(い)?ない|未測定|みそくてい/.test(q.t)); },
      need: ['body'],
      answer: function (q, d) {
        var people = StaffQA.bodyPeople(d.body);
        var dates = uniq([].concat.apply([], people.map(function (a) { return a.weight.map(function (w) { return w.date; }); }))).sort();
        if (!dates.length) return '体重の記録がまだありません。';
        var last = dates[dates.length - 1];
        var none = people.filter(function (a) { return !a.weight.some(function (w) { return w.date === last; }); });
        if (!none.length) return 'いちばん新しい測定日の' + StaffQA.md(last) + 'は、' + StaffQA.scope('全員') + 'が測っています。';
        return 'いちばん新しい測定日の' + StaffQA.md(last) + 'に、体重の記録が無いのは' + none.length + '人です。' + StaffQA.names(none) + '。';
      }
    },
    {
      examples: ['種目マスタに無い種目は？'],
      test: function (q) { return /種目マスタ|未登録|登録されて(い)?ない種目/.test(q.t); },
      need: ['overview'],
      answer: function (q, d) {
        var u = d.overview.unregistered || [];
        if (!u.length) return StaffQA.weekLabel(d.overview) + 'は、種目マスタに無い名前で記録された種目はありません。';
        return StaffQA.weekLabel(d.overview) + '、種目マスタに無い名前で記録されたのは、' + u.slice(0, 8).map(function (x) { return x.name + '（' + x.count + '回）'; }).join('、') +
          'です。種目マスタに追加するか、「呼び方の候補」に入れてください。';
      }
    },
    // ---- ここから下は、選手の名前が入った質問 ----
    {
      examples: ['（名前）の体重は？', '（名前）のFFMIは何位？'],
      test: function (q) { return !!q.person && !!q.metric; },
      need: ['body'],
      answer: function (q, d) {
        var m = q.metric, a = d.body.athletes.filter(function (x) { return x.id === q.person.id; })[0];
        var s = a ? Body.series(m.key === 'weight' && Body.series(a.weight, 'weight').length ? a.weight : a.inbody, m.key) : [];
        if (!s.length) return q.person.name + 'さんの' + m.label + 'の記録はまだありません。';
        var last = s[s.length - 1], prev = s[s.length - 2];
        var out = q.person.name + 'さんの' + m.label + 'は、' + StaffQA.md(last.date) + 'の' + StaffQA.num(last.value, m) + 'です。' +
          (prev ? '前回の' + StaffQA.md(prev.date) + 'から' + StaffQA.diff(last.value - prev.value, m) + '。' : '');
        if (QA.isRank(q.t) || /位/.test(q.t)) {
          var rows = StaffQA.bodyLatest(d.body, m.key, true), i = rows.map(function (r) { return r.id; }).indexOf(q.person.id);
          if (i >= 0) out += '在籍中の選手のいちばん新しい記録で比べると、' + rows.length + '人中' + (rows.filter(function (r) { return r.value > rows[i].value; }).length + 1) + '位です。';
        }
        return out;
      }
    },
    {
      examples: ['（名前）のコンディションは？'],
      test: function (q) { return !!q.person && /コンディション|疲労|疲れ|動き|体調|調子|パフォマンス|コメント/.test(q.t); },
      need: ['detail'],
      answer: function (q, d) {
        var c = (d.detail.conditions || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
        if (!c.length) return q.person.name + 'さんのコンディションの記録はまだありません。';
        var L = c[c.length - 1], from7 = Body.addDays(Body.today(), -6), from28 = Body.addDays(Body.today(), -27);
        var w = c.filter(function (x) { return x.date >= from7; }), m = c.filter(function (x) { return x.date >= from28; });
        var avg = function (list) { return '全身' + CondChart.avg(list, 'whole') + '、上半身' + CondChart.avg(list, 'upper') + '、下半身' + CondChart.avg(list, 'lower') + '、動きやすさ' + CondChart.avg(list, 'perf'); };
        return q.person.name + 'さんのいちばん新しいコンディションは' + StaffQA.md(L.date) + 'で、' + StaffQA.fText(L) + '、動きやすさ' + L.perf + 'です。' +
          (L.comment ? 'コメントは「' + L.comment + '」。' : '') +
          (w.length ? '直近1週間（' + w.length + '日分）の平均は' + avg(w) + '。' : '直近1週間の記録はありません。') +
          (m.length > w.length ? '直近4週間（' + m.length + '日分）の平均は' + avg(m) + 'です。' : '');
      }
    },
    {
      examples: ['（名前）が最後にやったのはいつ？'],
      test: function (q) { return !!q.person && /最後|さいご|前回|ぜんかい|この前|いつ|直近|ちょっきん/.test(q.t); },
      need: ['detail'],
      answer: function (q, d) {
        var s = d.detail.sessions[0];
        if (!s) return q.person.name + 'さんのトレーニングの記録はまだありません。';
        return q.person.name + 'さんの最後のトレーニングは' + StaffQA.md(s.date) + 'の' + (s.type === 'チーム' ? 'Day' + s.day : '自分のメニュー' + (s.myMenu ? '「' + s.myMenu + '」' : '')) +
          (s.minutes ? '、' + s.minutes + '分' : '') + 'です。' + (s.records.length ? s.records.length + '種目：' + s.records.slice(0, 6).map(function (r) { return r.name; }).join('、') + (s.records.length > 6 ? 'ほか' : '') + '。' : '');
      }
    },
    {
      examples: ['（名前）の今週は？'],
      test: function (q) { return !!q.person && /今週|こんしゅう|先週|その週|実施|何回|なんかい|トレニング|やった|やって|セット/.test(q.t); },
      need: ['overview'],
      answer: function (q, d) {
        var a = d.overview.athletes.filter(function (x) { return x.id === q.person.id; })[0];
        if (!a) return q.person.name + 'さんは、実施状況の一覧にいません（在籍の設定を確認してください）。';
        return StaffQA.weekLabel(d.overview) + 'の' + q.person.name + 'さんは、' + (a.sessions ? a.sessions + '回トレーニング' + (a.freeSessions ? '（うち自分のメニュー' + a.freeSessions + '回）' : '') +
          (a.menuDays ? '、チームメニューは' + a.menuDays + 'Day中' + a.daysDone + 'Day' : '') + '、セット数は上半身' + a.sets['上半身'] + '・下半身' + a.sets['下半身'] + '・全身' + a.sets['全身'] + 'です。'
          : 'まだトレーニングしていません。') + (a.lastDate ? '最後にやったのは' + StaffQA.md(a.lastDate) + 'です。' : '');
      }
    },
    {
      examples: ['（名前）はどう？'],
      test: function (q) { return !!q.person && q.ask; },
      need: ['overview', 'detail'],
      answer: function (q, d) {
        var a = d.overview.athletes.filter(function (x) { return x.id === q.person.id; })[0];
        return q.person.name + 'さんは、' + StaffQA.weekLabel(d.overview) + (a && a.sessions ? a.sessions + '回トレーニングしています。' : 'まだトレーニングしていません。') + StaffQA.athleteBrief(q.person.id, d.detail);
      }
    }
  ],

  // ---------------- 仕組み ----------------
  /** 質問ならここで答えて true。当てはまらなければ false（ほかの読み取りに回す） */
  handle: function (text, t, people) {
    var q = { text: text, t: t, people: people, person: people.length === 1 ? people[0] : null, metric: StaffQA.metricOf(t),
              ask: StaffVoice.isQuestion(text, t) };
    if (people.length > 1) q.person = people[0];   // 話題を決めるため仮に1人目。答える前に選んでもらう
    var topic = null;
    for (var i = 0; i < StaffQA.TOPICS.length; i++) if (StaffQA.TOPICS[i].test(q)) { topic = StaffQA.TOPICS[i]; break; }
    if (!topic) return false;
    if (people.length > 1 && /\(名前\)|（名前）/.test(topic.examples[0])) return StaffVoice.askWhich(text, people);
    var d = { overview: null, body: null, detail: null };
    var loads = (topic.need || []).map(function (n) {
      if (n === 'overview') return StaffVoice.loadOverview().then(function (r) { d.overview = r; });
      if (n === 'body') return Staff.loadBody().then(function (r) { d.body = r; });
      return StaffVoice.loadDetail(q.person.id).then(function (r) { d.detail = r; });
    });
    VoiceUI.show(text, '調べています…');
    Promise.all(loads).then(function () {
      var msg;
      try { msg = topic.answer(q, d); } catch (e) { msg = 'すみません、うまく調べられませんでした。'; }
      reply(text, msg);
    }).catch(function (e) {
      if (e.needLogin) return Staff.fail(e);
      reply(text, e.message || '読み込めませんでした。', true);
    });
    return true;
  },

  /** 選手のページを開いたときのひとこと（いちばん新しいコンディションと、最後のトレーニング） */
  athleteBrief: function (id, detail) {
    var dt = detail || (Staff.detail && Staff.detail.athlete.id === id ? Staff.detail : null);
    if (!dt) return '';
    var c = (dt.conditions || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }), L = c[c.length - 1], s = dt.sessions[0];
    return (L ? 'いちばん新しいコンディションは' + StaffQA.md(L.date) + 'で、' + StaffQA.fText(L) + '、動きやすさ' + L.perf + '。' : 'コンディションの記録はまだありません。') +
      (s ? '最後のトレーニングは' + StaffQA.md(s.date) + 'です。' : 'トレーニングの記録はまだありません。');
  },

  // ---------------- 小さな部品 ----------------
  /** 実施状況の選手（画面の学年・チームの絞り込みに合わせる） */
  people: function (ov) {
    var f = Staff.filter;
    return ov.athletes.filter(function (a) { return (!f.team || a.team === f.team) && (!f.grade || a.grade === f.grade); });
  },
  /** 体組成の選手（在籍中・絞り込みに合わせる） */
  bodyPeople: function (body, all) {
    var f = Staff.filter;
    return body.athletes.filter(function (a) { return a.active && (all || ((!f.team || a.team === f.team) && (!f.grade || a.grade === f.grade))); });
  },
  /** 各選手のいちばん新しい記録で、大きい順に並べる [{ id, name, value, date }] */
  bodyLatest: function (body, key, all) {
    return StaffQA.bodyPeople(body, all).map(function (a) {
      var s = Body.series(key === 'weight' && Body.series(a.weight, 'weight').length ? a.weight : a.inbody, key), r = s[s.length - 1];
      return r ? { id: a.id, name: a.name, value: r.value, date: r.date } : null;
    }).filter(Boolean).sort(function (x, y) { return y.value - x.value; });
  },
  /** 「今週」「10/19〜10/25の週」 */
  weekLabel: function (ov) {
    return ov.weekStart === CondChart.weekStartOf(Body.today()) ? '今週' : StaffQA.md(ov.weekStart) + '〜' + StaffQA.md(ov.weekEnd) + 'の週';
  },
  /** 絞り込んでいるときの言葉（「（1年・Aチーム）」）。絞り込みなしなら word（省略すると空） */
  scope: function (word) {
    var f = Staff.filter, parts = [f.grade, f.team ? f.team + 'チーム' : ''].filter(String);
    return parts.length ? '（' + parts.join('・') + '）' + (word ? 'の' + word : '') : (word || '');
  },
  names: function (list) {
    return list.slice(0, 10).map(function (a) { return a.name + 'さん'; }).join('、') + (list.length > 10 ? '、ほか' + (list.length - 10) + '人' : '');
  },
  maxF: function (c) { return Math.max(c.whole, c.upper, c.lower); },
  fText: function (c) { return '疲労は全身' + c.whole + '・上半身' + c.upper + '・下半身' + c.lower; },
  md: function (d) { return Number(String(d).slice(5, 7)) + '月' + Number(String(d).slice(8, 10)) + '日'; },
  num: function (v, m) { return Number(v).toFixed(1) + m.unit; },
  diff: function (d, m) { var r = Math.round(d * 10) / 10; return r === 0 ? '変わっていません' : Math.abs(r).toFixed(1) + m.unit + (r > 0 ? '増えました' : '減りました'); }
};
