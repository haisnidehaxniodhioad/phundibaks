/**
 * qa.js ― 自分のデータについての質問に、コーチが答える（v31）
 *
 *   どの画面でも聞ける。例：
 *     体組成　「体重は？」「体脂肪率は前回からどう？」「基準から何キロ増えた？」「FFMIは何位？」「1位は何キロ？」
 *     トレーニング「スクワットの最高は？」「ベンチは伸びてる？」「スクワットは何位？」「今月何セットやった？」
 *   答えに使うデータ
 *     ・体組成の数値 … API myBody（体組成レポートと同じデータ。Body.mine に入る）
 *     ・自己ベスト・順位・回数など … API myStats（Apps Script の 統計.gs）
 *   順位は自分の順位と人数、聞かれたら1位の数値だけを答える（ほかの選手の名前は言わない）。
 *   トレーニング重量の順位は、最近3か月（統計.gs の RANK_DAYS）の記録で比べる。
 *
 * ★ 新しい機能を増やして答えられることを増やすときは、下の TOPICS に1つ足す。
 *     name     … 何についての答えか（メモ）
 *     examples … 話し方の例（「何が聞ける？」と聞かれたときに読み上げる）
 *     test(q)  … この話題の質問なら true（q.t は読み取りやすくした文。q.exercise は文に出てきた種目名）
 *     need     … 答えるのに必要なデータ（'stats' / 'body'。両方なら ['stats', 'body']）
 *     answer(q, d) … 答えの文を返す（d.stats, d.body に読み込んだデータが入っている）
 *   上にある話題ほど先に調べる。
 */
var QA = {
  data: { stats: null, body: null },
  loadedAt: { stats: 0, body: 0 },
  FRESH_MS: 3 * 60 * 1000,   // 読み込んだデータを使い回す時間（3分）。記録を保存したら読み直す

  METRIC_WORDS: [   // 体組成の項目の言い方
    { key: 'ffmi', label: 'FFMI', unit: '', re: /ffmi|エフエフエムアイ|えふえふえむあい/ },
    { key: 'lbm', label: '除脂肪体重', unit: 'キロ', re: /除脂肪|じょしぼう|女子棒|筋肉量|きんにくりょう/ },
    { key: 'fat', label: '体脂肪率', unit: 'パーセント', re: /体脂肪|たいしぼう|脂肪率/ },
    { key: 'weight', label: '体重', unit: 'キロ', re: /体重|たいじゅう|体の重さ/ }
  ],

  // ---------------- 話題ごとの答え方 ----------------
  TOPICS: [
    {
      name: 'ページの見方・言葉の意味',   // v42：「このページの見方を説明して」「FFMIって何？」（guide.js）
      examples: ['このページの見方を教えて', 'FFMIって何？'],
      test: function (q) { return Guide.isAsk(q.t) || !!Guide.term(q.t, true); },
      need: [],
      answer: function (q) { return Guide.isAsk(q.t) ? Guide.athlete() : Guide.term(q.t, true); }
    },
    {
      name: '開いているレポートの説明',   // v41：体組成レポートの画面で「このレポートを説明して」。v43：ほかの画面から「フィジカルレポートを説明して」でも開いて説明
      examples: ['このレポートを説明して'],
      test: function (q) { return QA.EXPLAIN.test(q.t) && (S.view === 'body' || QA.REPORT.test(q.t)); },
      need: ['body'],
      answer: function (q) {
        var say = function () {
          var tab = Body.tab || (Body.mine.inbody.length || !Body.mine.weight.length ? 'inbody' : 'weight');
          return QA.casual(Body.explain({ name: '', inbody: Body.mine.inbody, weight: Body.mine.weight, base: Body.mine.base }, tab));
        };
        if (S.view === 'body') return say();
        if (S.view === 'session' || S.view === 'finish') return 'トレーニングが終わってから、体組成レポートで説明するね。';
        Body.tab = /体重/.test(q.t) && !/フィジカル|インボディ|inbody|体組成/.test(q.t) ? 'weight' : 'inbody';
        Body.showMine(function () { reply(q.text, say()); });
        return Talk.ok() + 'レポートを開くね。';
      }
    },
    {
      name: '今の画面のまとめ',   // v43：「この画面をまとめて」（ホーム・記録・トレーニング中など）
      examples: ['この画面をまとめて'],
      test: function (q) { return QA.EXPLAIN.test(q.t) && S.view !== 'body' && !QA.REPORT.test(q.t) && !q.metric && !q.exercise; },
      need: [],
      answer: function () { return QA.pageSummary(); }
    },
    {
      name: '聞けることの一覧',
      examples: ['何が聞ける？'],
      test: function (q) { return /(何|なに|なん)(が|を)(聞け|きけ|わか|分か|答え|こたえ)|聞けること|わかること|分かること/.test(q.t); },
      need: [],
      answer: function () {
        // 読み上げが長くならないよう、main: true の話題の例だけを言う（全部の例は「話し方の例」に出ている）
        return '自分のデータなら、' + QA.TOPICS.filter(function (tp) { return tp.main; }).map(function (tp) { return '「' + tp.examples[0] + '」'; }).join('') +
          'みたいに聞いてね。体組成の数値や変化、自己ベスト、伸び、チームでの順位、回数やセット数、コンディションに答えるよ。';
      }
    },
    {
      name: '体組成の順位', main: true,
      examples: ['FFMIは何位？', '体重の1位は何キロ？'],
      test: function (q) { return !!q.metric && QA.isRank(q.t); },
      need: ['stats'],
      answer: function (q, d) {
        var m = q.metric, r = d.stats.body.ranks[m.key];
        if (!r) return m.label + 'の順位は、まだInBodyの記録がないから出せないよ。';
        var when = QA.md(r.date) + 'に測った' + r.of + '人の中で';
        if (QA.isTop(q.t)) return when + '、' + m.label + 'のいちばん高い人は' + QA.num(r.top, m) + 'だよ。' + (r.rank === 1 ? 'それはきみだよ！' : 'きみは' + r.rank + '位だよ。');
        return when + '、' + m.label + 'は高いほうから' + r.rank + '位だよ。' + (r.rank <= 3 && r.of >= 5 ? 'すごいね！' : '');
      }
    },
    {
      name: '体組成の推移', main: true,
      examples: ['除脂肪体重の推移は？'],
      test: function (q) { return !!q.metric && /推移|すいい|経過|けいか|移り変わ|流れ|これまで|ずっと|グラフ|どう変わ/.test(q.t); },
      need: ['body'],
      answer: function (q) {
        var m = q.metric;
        return Body.trendText(QA.series(m.key), m.label, m.unit, Body.trendRange(q.t)).replace(/いますが、/g, 'いるけど、').replace(/います。/g, 'いるよ。').replace(/です。/g, 'だよ。');   // 選手には話し言葉で
      }
    },
    {
      name: '体組成の変化', main: true,
      examples: ['体脂肪率は前回からどう？', '基準から体重は何キロ増えた？'],
      test: function (q) { return !!q.metric && /前回|前の|この前|変化|増え|ふえ|減っ|へっ|変わ|かわっ|比べ|くらべ|基準|伸び|のび|差/.test(q.t); },
      need: ['body'],
      answer: function (q, d) {
        var m = q.metric, s = QA.series(m.key);
        if (!s.length) return QA.noBody(m);
        var last = s[s.length - 1], prev = s[s.length - 2], out = QA.md(last.date) + 'の' + m.label + 'は' + QA.num(last.value, m) + '。';
        var base = d.body.base || { dates: [] };
        var baseVal = Body.avg(s.filter(function (p) { return base.dates.indexOf(p.date) >= 0; }).map(function (p) { return p.value; }));
        if (/基準/.test(q.t)) {
          return out + (baseVal !== null ? '基準の' + QA.num(baseVal, m) + 'から' + QA.diff(last.value - baseVal, m) + 'だよ。' : '基準はまだ決まっていないよ。スタッフに聞いてね。');
        }
        out += prev ? '前回の' + QA.md(prev.date) + 'から' + QA.diff(last.value - prev.value, m) + '。' : '前回の記録はないよ。';
        if (baseVal !== null) out += '基準からは' + QA.diff(last.value - baseVal, m) + 'だよ。';
        return out;
      }
    },
    {
      name: '体重の平均',
      examples: ['最近の体重の平均は？'],
      test: function (q) { return (!q.metric || q.metric.key === 'weight') && /体重/.test(q.t) && /平均|へいきん/.test(q.t); },
      need: ['body'],
      answer: function (q, d) {
        var st = Body.weightStats(d.body.weight || []);
        if (!st) return 'まだ体重の記録がないよ。';
        return '直近4週間の体重の平均は' + st.w1.avg.toFixed(1) + 'キロだよ（' + st.w1.n + '回の測定）。' +
          (st.w0.n ? 'その前の4週間は' + st.w0.avg.toFixed(1) + 'キロだったよ。' : '');
      }
    },
    {
      name: '体組成の数値',
      examples: ['体重は？', 'FFMIはいくつ？'],
      test: function (q) { return !!q.metric && q.ask; },
      need: ['body'],
      answer: function (q, d) {
        var m = q.metric, s = QA.series(m.key);
        if (!s.length) return QA.noBody(m);
        var last = s[s.length - 1], prev = s[s.length - 2];
        return QA.md(last.date) + 'の' + m.label + 'は' + QA.num(last.value, m) + 'だよ。' + (prev ? '前回より' + QA.diff(last.value - prev.value, m) + '。' : '');
      }
    },
    {
      name: '種目の順位', main: true,
      examples: ['スクワットは何位？', 'ベンチプレスの1位は何キロ？'],
      test: function (q) { return !!q.exercise && QA.isRank(q.t); },
      need: ['stats'],
      answer: function (q, d) {
        var e = d.stats.training.exercises[q.exercise], days = Math.round(d.stats.rankDays / 30);
        if (!e || !e.rank) return q.exercise + 'は、最近' + days + 'か月で重さを入れた記録がないから、順位は出せないよ。';
        var r = e.rank;
        if (QA.isTop(q.t)) return '最近' + days + 'か月の' + q.exercise + 'で、いちばん重いのは' + r.top + 'キロだよ。' + (r.rank === 1 ? 'それはきみの記録だよ！' : 'きみは' + e.recent.w + 'キロで' + r.rank + '位だよ。');
        return '最近' + days + 'か月の' + q.exercise + 'の最高重量で比べると、きみは' + e.recent.w + 'キロで、' + r.of + '人中' + r.rank + '位だよ。' +
          (r.rank === 1 ? 'チームでいちばん！' : '1位は' + r.top + 'キロだよ。');
      }
    },
    {
      name: '種目の伸び', main: true,
      examples: ['スクワットは伸びてる？'],
      test: function (q) { return !!q.exercise && /伸び|のび|成長|上が|あが|強くな|変化|増え|ふえ/.test(q.t); },
      need: ['stats'],
      answer: function (q, d) {
        var e = d.stats.training.exercises[q.exercise];
        if (!e) return q.exercise + 'の記録はまだないよ。';
        if (!e.first3m || !e.recent) return q.exercise + 'は、最近3か月で重さを入れた記録がないから比べられないよ。';
        var diff = Math.round((e.recent.w - e.first3m.w) * 10) / 10;
        if (e.first3m.date === e.recent.date || diff === 0) return q.exercise + 'は、最近3か月の最高が' + e.recent.w + 'キロで、3か月前と同じくらいだよ。回数が増えていれば、それも成長だよ。';
        return diff > 0 ? q.exercise + 'は、' + QA.md(e.first3m.date) + 'の' + e.first3m.w + 'キロから、' + QA.md(e.recent.date) + 'に' + e.recent.w + 'キロまで、' + diff + 'キロ伸びてるよ。いい調子！'
                        : q.exercise + 'は、最近3か月の最高が' + e.recent.w + 'キロで、最初の' + e.first3m.w + 'キロより軽めだよ。調子に合わせて大丈夫。';
      }
    },
    {
      name: '種目の自己ベスト', main: true,
      examples: ['スクワットの最高は？'],
      test: function (q) { return !!q.exercise && /最高|さいこう|ベスト|べすと|マックス|max|まっくす|自己記録|最大|一番重|いちばん重|何キロまで|なんキロまで|最重/.test(q.t); },
      need: ['stats'],
      answer: function (q, d) {
        var e = d.stats.training.exercises[q.exercise];
        if (!e) return q.exercise + 'の記録はまだないよ。';
        if (e.best) return q.exercise + 'の自己ベストは、' + QA.md(e.best.date) + 'の' + e.best.w + 'キロ' + (e.best.r ? 'を' + e.best.r + '回' : '') + 'だよ。' +
          (e.recent && e.recent.w !== e.best.w ? '最近3か月の最高は' + e.recent.w + 'キロだよ。' : '');
        if (e.bestReps) return q.exercise + 'の最高は、' + QA.md(e.bestReps.date) + 'の' + e.bestReps.r + '回だよ。';
        return q.exercise + 'の記録はまだないよ。';
      }
    },
    {
      name: '種目をやった回数',
      examples: ['スクワットは何回やった？'],
      test: function (q) { return !!q.exercise && S.view !== 'session' && /(何|なん)(回|日)(やった|した|やって|して)|(何|なん)回目|回数/.test(q.t) && !/キロ|kg/.test(q.t); },
      need: ['stats'],
      answer: function (q, d) {
        var e = d.stats.training.exercises[q.exercise];
        return e ? q.exercise + 'は、これまでに' + e.count + '日やったよ。前回は' + QA.md(e.last.date) + 'だよ。' : q.exercise + 'の記録はまだないよ。';
      }
    },
    {
      name: '種目の前回',
      examples: ['前回のスクワットは？'],
      // トレーニング中の「前回は？」は、その後の「それでできた」につなげるので、トレーニング中は今までの答え方（commands.js）にまかせる
      test: function (q) { return !!q.exercise && S.view !== 'session' && /前回|この前|このまえ|最後に/.test(q.t); },
      need: ['stats'],
      answer: function (q, d) {
        var e = d.stats.training.exercises[q.exercise];
        if (!e || !e.last) return q.exercise + 'の記録はまだないよ。';
        return '前回の' + q.exercise + 'は' + QA.md(e.last.date) + '、' + QA.setsText(e.last.sets) + 'だよ。';
      }
    },
    {
      name: '種目の記録のまとめ',
      examples: ['スクワットの記録は？'],
      test: function (q) { return !!q.exercise && q.ask && /記録|きろく|成績|データ|どう|どんな/.test(q.t) && S.view !== 'session'; },
      need: ['stats'],
      answer: function (q, d) {
        var e = d.stats.training.exercises[q.exercise];
        if (!e) return q.exercise + 'の記録はまだないよ。';
        return q.exercise + 'は、これまでに' + e.count + '日。' + (e.best ? '自己ベストは' + e.best.w + 'キロ' + (e.best.r ? 'を' + e.best.r + '回' : '') + '。' : '') +
          (e.rank ? '最近3か月の順位は' + e.rank.of + '人中' + e.rank.rank + '位。' : '') + '前回は' + QA.md(e.last.date) + 'に' + QA.setsText(e.last.sets) + 'だよ。';
      }
    },
    {
      name: 'いちばん伸びた種目',
      examples: ['いちばん伸びた種目は？'],
      test: function (q) { return /(一番|いちばん|最も|もっとも)(伸び|のび|成長|上が)/.test(q.t); },
      need: ['stats'],
      answer: function (q, d) {
        var ex = d.stats.training.exercises, best = null;
        Object.keys(ex).forEach(function (n) {
          var e = ex[n];
          if (!e.first3m || !e.recent || e.first3m.date === e.recent.date) return;
          var diff = Math.round((e.recent.w - e.first3m.w) * 10) / 10;
          if (diff > 0 && (!best || diff > best.diff)) best = { name: n, diff: diff, from: e.first3m.w, to: e.recent.w };
        });
        return best ? '最近3か月でいちばん伸びたのは' + best.name + 'で、' + best.from + 'キロから' + best.to + 'キロ、' + best.diff + 'キロアップだよ！'
                    : '最近3か月で重さが伸びた種目は、まだ見つからないよ。記録を続けると比べられるよ。';
      }
    },
    {
      name: 'コンディションの推移', main: true,   // v43：「疲労の推移は？」（週平均の移り変わり。スタッフと同じ CondChart.trendText）
      examples: ['疲労の推移は？'],
      test: function (q) { return /疲労|ひろう|疲れ|つかれ|コンディション|体調|動きやす|うごきやす|パフォマンス/.test(q.t) && /推移|すいい|変化|へんか|流れ|経過|けいか|移り変わ|グラフ|これまで|変わって/.test(q.t) && !q.exercise && !q.metric; },
      need: ['stats'],
      answer: function (q, d) {
        var c = d.stats.conditions || {};
        if (!c.list) return 'ごめんね、コンディションの推移はまだ調べられないみたい。スタッフに「Apps Script を v43 にして」と伝えてね。';
        return QA.casual(CondChart.trendText(c.list, d.stats.weekStart, q.t));
      }
    },
    {
      name: 'コンディション', main: true,
      examples: ['今日の疲労度は？', '最近の疲れ具合は？', '動きやすさの平均は？'],
      test: function (q) { return /疲労|ひろう|疲れ具合|つかれぐあい|コンディション|体調|動きやす|うごきやす|パフォマンスの質/.test(q.t) && !q.exercise && !q.metric && q.ask; },
      need: ['stats'],
      answer: function (q, d) {
        var c = d.stats.conditions || {}, t = q.t, L = c.latest;
        var f = function (a, k) { return a && a[k] !== '' && a[k] !== undefined ? a[k] : '-'; };
        if (/平均|最近|今週|この1週間|このいっしゅうかん|今月|ずっと/.test(t)) {
          var a = /今月/.test(t) ? c.month : c.week, label = /今月/.test(t) ? '今月' : '最近1週間';
          if (!a || !a.n) return label + 'はまだコンディションの記録がないよ。「コンディションを記録」で入れられるよ。';
          return label + '（' + a.n + '日分）の平均は、全身の疲労' + f(a, 'whole') + '、上半身' + f(a, 'upper') + '、下半身' + f(a, 'lower') + '、動きやすさ' + f(a, 'perf') + 'だよ。';
        }
        if (!L) return 'まだコンディションの記録がないよ。「コンディションを記録」で入れられるよ。';
        var when = L.date === d.stats.today ? '今日' : QA.md(L.date);
        if (/動きやす|うごきやす|パフォマンス/.test(t)) return when + 'の動きやすさは' + L.perf + 'だよ（10がとても良い）。';
        return when + 'のコンディションは、全身の疲労' + L.whole + '、上半身' + L.upper + '、下半身' + L.lower + '、動きやすさ' + L.perf + 'だよ。' +
          (Math.max(L.whole, L.upper, L.lower) >= 8 ? 'かなり疲れているから、無理しないでね。' : '') + (L.comment ? 'メモは「' + L.comment + '」。' : '');
      }
    },
    {
      name: 'セット数・総挙上量・時間', main: true,
      examples: ['今月何セットやった？', '今月の総挙上量は？'],
      test: function (q) {
        return /(何|なん)セット|セット数|総挙上|挙上量|ボリューム|総重量|合計(の)?重量|持ち上げた|合計(の)?時間|(何|なん)(分|時間)(やった|トレ)|トレニング時間/.test(q.t) && !q.exercise && S.view !== 'session';
      },
      need: ['stats'],
      answer: function (q, d) {
        var c = d.stats.training.counts, t = q.t;
        if (/総挙上|挙上量|ボリューム|総重量|合計(の)?重量|持ち上げた/.test(t))
          return '今月の総挙上量（重さ×回数の合計）は' + c.volumeMonth.toLocaleString() + 'キロだよ。' + (c.volumeMonth ? Talk.nice() : '');
        if (/時間|分/.test(t)) return '今月のトレーニングは、合計' + c.minutesMonth + '分だよ。';
        return /今年|年度/.test(t) ? '今年度は' + c.setsYear + 'セットやったよ。' : '今月は' + c.setsMonth + 'セットやったよ。今年度は全部で' + c.setsYear + 'セットだよ。';
      }
    },
    {
      name: 'これまでの回数',
      examples: ['これまでに何回トレーニングした？'],
      test: function (q) { return /(これまで|今まで|いままで|全部で|ぜんぶで|合計|通算)(に|で)?(何|なん)回/.test(q.t); },
      need: ['stats'],
      answer: function (q, d) {
        var c = d.stats.training.counts;
        return 'これまでに' + c.total + '回トレーニングしたよ。今年度は' + c.year + '回、今月は' + c.month + '回だよ。';
      }
    }
  ],

  // ---------------- 仕組み ----------------
  /** 質問ならここで答えて true を返す。自分のデータの質問でなければ false（ほかの読み取りに回す） */
  handle: function (text) {
    if (!S.home || !S.token) return false;
    var q = this.parse(text);
    var topic = null;
    for (var i = 0; i < this.TOPICS.length; i++) if (this.TOPICS[i].test(q)) { topic = this.TOPICS[i]; break; }
    if (!topic) return false;
    var need = topic.need || [];
    var go = function () {
      q = QA.parse(text);   // 読み込んだ記録の種目名も使って、もう一度読み取る
      var msg;
      try { msg = topic.answer(q, QA.data); } catch (e) { msg = 'ごめんね、うまく調べられなかったよ。'; }
      reply(text, msg);
    };
    if (need.every(function (n) { return QA.fresh(n); })) { go(); return true; }
    VoiceUI.show(text, '調べるね…');
    Promise.all(need.map(function (n) { return QA.load(n); })).then(go).catch(function (e) { reply(text, e.message || '読み込めなかったよ。', true); });
    return true;
  },

  /** 文を読み取りやすくする（種目名・体組成の項目・質問かどうか） */
  parse: function (text) {
    var t = VoiceParser.norm(VoiceParser.normalizeNumbers(text)).toLowerCase();
    var cands = voiceCandidates();
    var st = this.data.stats;
    var exercise = VoiceParser.findExercise(text, cands);
    if (st) {
      // 記録に残っている種目名（「懸垂」など）が文にそのまま出ていれば、それを優先する
      var names = Object.keys(st.training.exercises);
      var direct = VoiceParser.findExercise(text, names.map(function (n) { return { name: n, aliases: [] }; }));
      if (direct) exercise = direct;
      // 種目マスタの正式名（「プルアップ」）で読み取ったが、記録は別の呼び方（「懸垂」）で残っているとき
      else if (exercise && !st.training.exercises[exercise]) {
        names.some(function (n) { if (VoiceParser.findExercise(n, cands) === exercise) { exercise = n; return true; } return false; });
      }
    }
    var metric = null;
    this.METRIC_WORDS.some(function (m) { if (m.re.test(t)) { metric = m; return true; } return false; });
    return {
      text: text, t: t, metric: metric,
      exercise: exercise,
      ask: /何|なに|なん|いくつ|どれ|どう|だっけ|教えて|おしえて|知りたい|[?？]|は$|って$|わかる|分かる/.test(t + text)
    };
  },
  isRank: function (t) { return /(何|なん)位|順位|じゅんい|ランキング|ランク|(何|なん)番|(一|1)位|トップ|チ(ム|ーム)(で|の中で|内で)?(一番|いちばん)/.test(t); },
  isTop: function (t) { return /(一|1)位|トップ|チ(ム|ーム)(で|の中で|内で)?(一番|いちばん)/.test(t) && !/(何|なん)位/.test(t); },

  fresh: function (n) { return !!this.data[n] && Date.now() - this.loadedAt[n] < this.FRESH_MS; },
  /** データを読み込む（'stats' か 'body'） */
  load: function (n) {
    if (n === 'stats') return Api.call('myStats', { token: S.token }).then(function (res) { QA.data.stats = res; QA.loadedAt.stats = Date.now(); });
    return Api.call('myBody', { token: S.token }).then(function (res) {
      if (res.chart) Body.chart = res.chart;
      Body.mine = { id: 'me', name: res.name, caption: res.caption || '', weight: res.weight || [], inbody: res.inbody || [], base: res.base };
      QA.data.body = Body.mine; QA.loadedAt.body = Date.now();
    });
  },
  /** 記録を保存したあとなど、次は読み直すようにする */
  reset: function () { this.loadedAt = { stats: 0, body: 0 }; },

  /** ていねいな言い方を、選手向けの話し言葉にする（v43） */
  casual: function (s) {
    return String(s).replace(/いますが、/g, 'いるけど、').replace(/います。/g, 'いるよ。').replace(/いました。/g, 'いたよ。')
      .replace(/ありません。/g, 'ないよ。').replace(/あります。/g, 'あるよ。').replace(/です。/g, 'だよ。').replace(/上がっています/g, '上がってる').replace(/下がっています/g, '下がってる');
  },
  EXPLAIN: /説明|せつめい|要約|ようやく|まとめ|解説|かいせつ|読み上げ|よみあげ|ざっくり|ポイント/,
  REPORT: /フィジカル|体組成|たいそせい|インボディ|inbody|体重レポト|レポト/,

  /** 今の画面のまとめ（ホーム・記録・トレーニング中・終了・コンディション・メニュー作成。v43） */
  pageSummary: function () {
    var h = S.home, v = S.view;
    if (v === 'session' && S.draft) {
      var dr = S.draft, cur = currentIndex(), done = dr.items.filter(function (it) { return it.sets.every(function (x) { return x.done; }); }).length;
      var sets = dr.items.reduce(function (a, it) { return a + it.sets.filter(function (x) { return x.done; }).length; }, 0);
      var min = Math.max(1, Math.round((Date.now() - new Date(dr.startedAt).getTime()) / 60000));
      return dr.title + 'の途中だよ。全' + dr.items.length + '種目のうち' + done + '種目が終わって、ここまで' + sets + 'セット、始めてから' + min + '分だよ。' +
        (cur >= 0 ? '今は' + dr.items[cur].name + 'の' + (dr.items[cur].sets.filter(function (x) { return x.done; }).length + 1) + 'セット目だよ。' : '全部終わったから、「終わり」で保存してね。');
    }
    if (v === 'finish' && S.draft) {
      var d2 = S.draft, its = d2.items.filter(function (it) { return it.sets.some(function (x) { return x.done; }); });
      return d2.title + 'の終わりの画面だよ。' + its.length + '種目、' + its.reduce(function (a, it) { return a + it.sets.filter(function (x) { return x.done; }).length; }, 0) + 'セットを保存できるよ。「保存」で保存してね。';
    }
    if (v === 'history' && History.data) {
      var sel = History.selected, list = History.trainedDays()[sel];
      return History.summary() + (sel && list ? '今は' + Number(sel.slice(5, 7)) + '月' + Number(sel.slice(8, 10)) + '日を表示していて、' + list.map(function (x) { return History.title(x).replace(/[「」]/g, ''); }).join('と') + 'をやった日だよ。' : '');
    }
    if (v === 'condition' && S.cond) {
      var miss = Condition.missing();
      return Condition.dateLabel(S.cond.date) + 'のコンディションの入力だよ。' + Condition.ITEMS.filter(function (it) { return S.cond[it.key] >= 1; }).map(function (it) { return it.short + 'は' + S.cond[it.key]; }).join('、') +
        (miss.length ? (miss.length < 4 ? '。' : '') + 'まだ「' + miss.join('」「') + '」を選んでないよ。' : '。全部選んだから、「保存」で保存できるよ。');
    }
    if (v === 'mymenu' && S.edit) return 'メニュー作りの画面だよ。' + (S.edit.name ? '「' + S.edit.name + '」、' : '') + S.edit.items.filter(function (it) { return it.name; }).length + '種目入っているよ。終わったら下の「保存する」を押してね。';
    // ホーム
    var left = h.days.filter(function (d) { return !h.doneDays[d.day]; });
    var c = h.condition;
    return h.name + 'さんのホームだよ。' + (h.days.length ? '今週は' + h.days.length + 'Dayのうち' + (h.days.length - left.length) + 'Day終わって、' +
      (left.length ? '残りは' + left.map(function (d) { return 'デイ' + d.day; }).join('と') + '。' + h.suggestion.reason.replace(/です。$/, 'だよ。') : '全部できたね！') : '') +
      (c ? '今日のコンディションは記録済みで、疲労は全身' + c.whole + '・上半身' + c.upper + '・下半身' + c.lower + '、動きやすさ' + c.perf + 'だよ。' : '今日のコンディションはまだだよ。') +
      (h.last ? '前回のトレーニングは' + Number(h.last.date.slice(5, 7)) + '月' + Number(h.last.date.slice(8, 10)) + '日だよ。' : '') +
      (S.draft ? '途中のトレーニングがあるから、「続きから」で再開できるよ。' : '');
  },

  // ---------------- 文を作る小さな部品 ----------------
  series: function (key) {
    var b = this.data.body;
    if (!b) return [];
    return key === 'weight' && (!b.inbody.length || Body.series(b.weight, 'weight').length) ? Body.series(b.weight, 'weight') : Body.series(b.inbody, key);
  },
  noBody: function (m) { return 'まだ' + m.label + 'の記録がないよ。' + (m.key === 'ffmi' ? 'InBodyの記録と身長が入ると出せるよ。' : ''); },
  md: function (d) { return Number(String(d).slice(5, 7)) + '月' + Number(String(d).slice(8, 10)) + '日'; },
  num: function (v, m) { return Number(v).toFixed(1) + m.unit; },
  diff: function (d, m) {
    var r = Math.round(d * 10) / 10;
    return r === 0 ? '変わらず' : Math.abs(r).toFixed(1) + m.unit + (r > 0 ? '増えた' : '減った');
  },
  setsText: function (sets) {
    if (!sets || !sets.length) return '記録あり';
    var one = function (s) { return (s.w !== '' && s.w !== null ? s.w + 'キロで' : '') + s.r + '回'; };
    var same = sets.every(function (s) { return s.w === sets[0].w && s.r === sets[0].r; });
    return one(sets[0]) + (sets.length > 1 ? (same ? 'を' + sets.length + 'セット' : 'ほか、全部で' + sets.length + 'セット') : '');
  }
};
