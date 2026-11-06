/**
 * guidebook.js ― アプリの中で読む「使い方」（v52。前は Claude のドキュメントへのリンクだったが、選手が開けないためアプリの中に入れた）
 *
 *   選手   ：マイページの「設定」→「使い方を見る」（S.view = 'guide'）。声「使い方を見せて」
 *   スタッフ：「管理・設定」の「使い方」（Staff.page = 'guide'）。スタッフ向け・選手向けの両方が読める。声「使い方を見せて」
 *   画面の写真は assets/guide/ にある（架空のデータで撮ったもの。画面を大きく変えたら撮り直す）
 *
 * ★ 文を直すときは、下の ATHLETE・STAFF の中を書きかえる。1つの { h: 見出し, body: [ … ] } が1つの項目。
 *   body の中身：'文' ／ { img: 'ファイル名', alt: '説明'（, wide: true ＝パソコンの画面写真。大きく出す） } ／ { list: ['…', …] } ／ { steps: ['…', …] } ／ { table: [[見出し…], [行…], …] }
 *   文の中の **太字** は太字になる。
 */
var Guidebook = {
  IMG_DIR: 'assets/guide/',

  ATHLETE: {
    title: '使い方（選手）',
    lead: '毎日のトレーニングとコンディションを、このアプリに記録しよう。困ったときは、コーチに「何ができる？」と聞いてもいいよ。',
    sections: [
      { id: 'start', h: 'はじめに：アプリを開いてログイン', body: [
        'スマホのブラウザで、チームから聞いたURLを開いてね。ホーム画面に置いておくと、次からすぐ開けるよ。',
        { list: ['iPhone（Safari）：下の共有ボタン →「ホーム画面に追加」', 'Android（Chrome）：右上の︙ →「ホーム画面に追加」'] },
        'ログインは、スタッフからもらった **ID** と **PIN** を入れて「ログイン」を押すだけ。',
        { table: [['入れるもの', '形', '例'], ['ID', '英字と数字の6文字（小文字でもOK）', 'K7M2QX'], ['PIN', '6けたの数字', '●●●●●●']] },
        { img: 'a-login.jpg', alt: 'ログインの画面' },
        '一度ログインすると、しばらくはその端末で入れなくて大丈夫。PINは人に見せないでね。マイページの「設定」で、自分の好きなPINに変えられるよ。'
      ] },
      { id: 'home', h: 'ホーム：今日やることがわかる', body: [
        { img: 'a-home.jpg', alt: 'ホームの画面' },
        '上から次の順に並んでいるよ。',
        { steps: ['**今日のトレーニング**：おすすめのDayと種目。「**トレーニングを始める**」で始まるよ。ほかのDayは「ほかのDay」から。', '**今日のコンディション**：まだなら「いま入力する」。入れてあれば数字が出て、「直す」で直せるよ。',
                  '**今週の実施**：やったDayに✓、今日のおすすめに「今日」。', '**最新の身体データ**：いちばん新しいInBodyか体重。', '**お知らせ・コラム**：スタッフからのお知らせと用語の説明。「すべて」で一覧。'] },
        '途中のトレーニングがあるときは「続きから」、送れていない記録があるときは「今すぐ送信する」が、いちばん上に出るよ。',
        '画面の下のバーで、画面を切り替えるよ。右下の丸いマイク（話す）で、どの画面からでもコーチに話しかけられるよ。',
        { table: [['ボタン', '開く画面'], ['ホーム', '今日のトレーニング・コンディション・今週の実施など'], ['トレーニング', 'Dayを選んで始める・自分のメニュー・白紙から・種目一覧'], ['記録', 'トレーニングとコンディションのカレンダー'],
                  ['からだ', 'InBody・体重のレポート'], ['マイページ', 'プロフィール・表示モード・使い方・まとめ・設定']] }
      ] },
      { id: 'train', h: 'トレーニングを始める・記録する・保存する', body: [
        '**始める**：ホームの「トレーニングを始める」で、おすすめのDayが始まるよ。ほかのDay・自分のメニュー・白紙からは、下のバーの「**トレーニング**」から選んでね。',
        { img: 'a-training.jpg', alt: 'トレーニングのタブ' },
        'トレーニングのタブの種目一覧は、名前で探せるよ（ひらがなでもカタカナでもOK）。種目を押すと、テンポ・レスト・RIR、前回の記録、自己ベストが見られるよ。',
        { steps: ['重さ（kg）と回数を確かめて、終わったら右の **✓** を押す。＋−で変えられるよ。', '✓を押すと、下に休けいのタイマーが動くよ（「+30秒」「スキップ」）。',
                  '全部終わったら右上の「**おわる**」→ 中身を確かめて、下の「**記録を保存する**」。', '保存したら「コンディションを記録する」で、そのままコンディションも入れよう（「あとで入力する」でホームへ）。'] },
        { img: 'a-session.jpg', alt: 'トレーニング中の画面（声で「5回」と話したところ）' },
        '手がふさがっているときは、マイクを押して「**100キロ5回**」「**5回**」と話しても記録できるよ。',
        '**途中でやめたとき**：アプリを閉じても、記録はスマホに残っているよ。もう一度開くと、ホームのいちばん上の「**続きから**」で再開できるよ（やめるときは「破棄」）。',
        '記録し忘れた日も、3日前までなら「記録」のカレンダーから足せるよ。'
      ] },
      { id: 'cond', h: 'コンディションと体重を入れる', body: [
        '毎日1回、疲れ具合と動きやすさを入れよう。30秒くらいで終わるよ。入れ直すと上書きされるよ。',
        { table: [['項目', '1', '10'], ['全身・上半身・下半身の疲労', '疲れていない', 'とても疲れている'], ['動きやすさ', 'とても悪い', 'とても良い'], ['体重', '測った日だけ（空でもOK）', '']] },
        '**画面で入れる**：ホームの「いま入力する」→ 4つの数字を押す（上に「○ / 4」と、選んだ数がでるよ）→ 体重とコメント（なくてもOK）→ 下の「**コンディションを保存**」。',
        { img: 'a-condition.jpg', alt: 'コンディションの画面' },
        { list: ['左上の「**戻る**」は、選んだ数字を残したまま前の画面に戻るよ（保存はしないよ）', '「**あとで**」でやめても、同じ日をもう一度開くと続きから入れられるよ', '記録のカレンダーの日付から、3日前までの分も入れられるよ'] },
        '**声で入れる**（画面を開かなくてもOK）：',
        { list: ['「コンディションを入れて」→ コーチが1つずつ聞くので「4」のように数字で答える → 最後に「はい」で保存', '一気に言ってもOK：「疲労4、上半身3、下半身5、動き7、体重72.4」→「はい」',
                 '体重だけ：「体重72.4キロ」', 'やめるときは「やめて」'] },
        { img: 'a-voice-condition.jpg', alt: '声でコンディションを入れているところ' }
      ] },
      { id: 'voice', h: 'コーチ（声）の使い方', body: [
        '下のバーの右上にある丸いマイク（話す）を押して、話し終わるまで待つだけ。コーチが声と文字で返事するよ。',
        { table: [['したいこと', '言い方の例'], ['今日のメニューを知る', '「今日は何をする？」「デイ2を始める」'], ['セットを記録する', '「100キロ5回」「5回」「同じ」「取り消し」'],
                  ['次の種目・休けい', '「次は？」「あと30秒」「スキップ」「終わり」'], ['前回の記録', '「前回のスクワットは？」「スクワットの最高は？」'],
                  ['コンディション', '「コンディションを入れて」「体重72.4キロ」'], ['自分の数字', '「体重は？」「FFMIは何位？」「今週何回やった？」'],
                  ['画面を開く', '「記録を見せて」「体重にして」「体組成レポートを開いて」「マイページを開いて」'], ['見方を聞く', '「このページを説明して」「このページの見方を教えて」「FFMIって何？」']] },
        '言い方がわからないときは「何ができる？」と聞いてね。うまく伝わらないときは候補が出るので、押して選んでね（次からその言い方を覚えるよ）。声が使えないときは、マイページの「文字で話しかける」から文字で入れられるよ。'
      ] },
      { id: 'see', h: '記録・からだ・マイページで見られること', body: [
        '**記録**：トレーニングした日に印が付くカレンダー（紫＝チームメニュー、ピンク＝自分のメニュー・白紙、黄色の小さな印＝コンディション）。日付を押すと、その日の種目・セット・コンディションが見られるよ。「前の記録」「次の記録」で移れて、下には「この月のコンディション」があるよ。紫の枠の日（3日前まで）は、記録し忘れた分を足せるよ。',
        { img: 'a-history.jpg', alt: '記録のカレンダー' },
        '**からだ**：いちばん上に、InBodyと体重のいちばん新しい測定日が出るよ。その下が InBody と体重のレポートで、タブで切り替えるよ。▲は増えた、▼は減ったこと。体重は週ごとの平均と、直近1か月の毎日の流れが見られるよ。',
        { img: 'a-body.jpg', alt: 'からだ（体組成レポート）' },
        '**マイページ**：上から、プロフィール、表示モード（自動・昼・夜）、サポート（使い方）、トレーニングのまとめ、フィジカルのまとめ、コンディションのグラフ、設定。設定で、コーチの設定・文字で話しかける・コラム・PINの変更ができるよ。',
        { img: 'a-mypage.jpg', alt: 'マイページ' },
        '**コラム**：ホームの「お知らせ・コラム」か、マイページの設定の「コラム」から読めるよ。声で「コラムを見せて」でもOK。'
      ] },
      { id: 'help', h: '困ったとき', body: [
        { table: [['こんなとき', 'こうしよう'], ['PINを忘れた', 'スタッフに聞いてね'], ['「PINを続けて間違えた」と出た', '15分ほど待ってから、もう一度'],
                  ['マイクを押しても聞き取らない', 'ブラウザにマイクを許可する。だめなときは「文字で」で入れられるよ'],
                  ['コーチの声が聞き取りにくい', 'マイページの設定 → コーチの設定で「話し方：短め」「声の速さ：ゆっくり」'],
                  ['電波が悪くて保存できなかった', '記録はスマホに残っているよ。電波の良い所で開き直すと送るよ'],
                  ['トレーニング中に画面を閉じた', 'もう一度開くと、ホームのいちばん上に「続きから」が出るよ'], ['種目が見つからない', 'トレーニングのタブの種目一覧で、名前の一部を入れて探してね（ひらがなでもOK。漢字の種目は漢字で）'], ['メニューやプロフィールが違う', 'スタッフに伝えてね']] }
      ] }
    ]
  },

  STAFF: {
    title: '使い方（スタッフ）',
    lead: 'スタッフ画面は、ダッシュボード・選手管理・データ分析・管理・設定の4つに分かれています。選手の実施状況・コンディション・体組成の確認と、選手・メニューの管理ができます。操作や質問は、AIアシスタントにも声や文字でできます。',
    sections: [
      { id: 'start', h: 'はじめに：画面の構成と切り替え', body: [
        'スタッフも選手と同じURLから、スタッフ用のID（英字と数字の6文字）とPIN（6けた）でログインします。パソコンでもスマホでも使えます。Excelの取り込みやPDFの保存は、パソコンが便利です。',
        { table: [['カテゴリー', 'できること'], ['ダッシュボード', 'この週の実施・コンディション入力の人数、確認が必要な選手（A・B・C）、学年・チーム別、最近のデータ更新、選手ごとの実施状況、Excel・PDF保存'],
                  ['選手管理', '名前・ふりがなで検索、学年・ポジション・チーム・確認項目（A・B・C）で絞り込み、チーム分け'], ['データ分析', 'InBody・体重の最新の状況、ランキング・一覧、フィジカルレポート、取り込み、Excel・PDF保存'],
                  ['管理・設定', '選手の登録・取り込み、メニューの管理、お知らせ・コラムの管理（管理者・トレーナー）、ログインの管理（管理者）、使い方']] },
        '**画面の切り替え**：パソコン（幅の広い画面）は**左のサイドバー**、スマホは**画面の下のナビ**で4つを切り替えます。タブレットでは、左にアイコンだけの細いサイドバーが出ます。',
        { img: 's-overview.jpg', alt: 'パソコン：左のサイドバーとダッシュボード', wide: true },
        { img: 's-overview-sp.jpg', alt: 'スマホ：下のナビとダッシュボード' },
        'AIアシスタントは、パソコンでは画面の下、スマホでは右下の丸いマイクと「文字で」から使えます。ログアウトは、パソコンは左のサイドバーの下、スマホは各カテゴリーの見出しの右です。',
        '個人ページ・フィジカルレポート・管理のページは「← 戻る」か、ブラウザの戻るで、開く前の画面に戻ります。'
      ] },
      { id: 'overview', h: 'ダッシュボードと選手の個人ページ', body: [
        'ダッシュボードは、表示している週と、チーム・学年の絞り込みの中で数えます（在籍中の選手だけ）。上の「◀ 前の週」「次の週 ▶」で週を変え、ExcelとPDFで保存できます。',
        { table: [['欄', '見られること'], ['この週の状況', '今週の実施（1回以上トレーニングした人数・割合）、コンディション入力の人数、未実施・未入力の人数'],
                  ['確認が必要な選手', 'A・B・C の人数。押すと選手管理でその選手だけを表示'], ['学年・チーム別', '人数と、実施・入力した人数'],
                  ['最近のデータ更新', 'トレーニング・コンディション・InBody・体重のいちばん新しい日'], ['選手ごとの実施状況', 'Day・回数・部位ごとのセット・疲労・動き・最終日。未実施は赤い行で上に']] },
        { table: [['確認', '判定', '期間'], ['A 体調', '疲労（全身・上半身・下半身のどれか）が8以上／動きやすさが3以下', '表示中の週のいちばん新しいコンディション'],
                  ['B 入力・実施', 'コンディションを1回も入れていない／トレーニングを1回もしていない', '表示中の週'], ['C しばらく未実施', '最後のトレーニングから7日以上（記録なしも含む）', '今日から7日']] },
        '1人が複数の項目に入ることがあるので、A・B・C の合計は出しません。AIアシスタントの「今週やってないのは誰？」「疲れている選手は？」なども同じ判定で答えます。',
        { list: ['名前を押すと**個人ページ**。上からトレーニング記録（直近20回）、コンディション記録、フィジカルデータです。名前の下のリンクで、その場所へ動きます',
                 'コンディションのグラフは「1週間（毎日）」と「3か月（週平均）」を切り替え、‹ › で前後へ。疲労は上ほど疲れていて、点線の8が注意の目安です',
                 'フィジカルデータは最新の値と前回との差です。「フィジカルレポート（InBody）」「体重レポート」で、くわしいレポートが開きます（「戻る」で個人ページへ）'] },
        { img: 's-athlete.jpg', alt: '個人ページのコンディション記録' }
      ] },
      { id: 'team', h: '選手管理（検索・絞り込み・チーム分け）', body: [
        '全選手を、名前・ふりがなで探したり、学年・ポジション・チーム・確認（A・B・C）で絞り込んだりできます。「学年別」「ポジション別」「チーム別」にまとめて見られます。名前の横の印は、ダッシュボードで表示している週の A・B・C です。',
        'パソコンでは、行を押すと右にその選手の概要（この週の実施・コンディション、体重・InBody）が出ます。スマホでは1人ずつカードで並びます。名前を押すと個人ページです。',
        { img: 's-list.jpg', alt: 'パソコン：選手管理（右に選んだ選手の概要）', wide: true },
        { steps: ['「チーム分けをする」を押す（選手の左にチェックが出ます）', '選手を選ぶ。見出し（「1年（38人）」など）のチェックでそのグループを全員、「表示中を全部選ぶ」で絞り込んだ人を全員選べます',
                  '下の欄でチームを選ぶ（「新しいチーム…」で作れます）', '使用メニューを選ぶ。「チームのメニュー（自動）」なら、メニューシートの「対象チーム」が同じメニューになります', '「選んだ○人を「○」にする」→ 確認 → 保存'] },
        { img: 's-team.jpg', alt: 'スマホ：チーム分け' },
        '変えた選手は、次にホームを開いたときから新しいチームのメニューになります。'
      ] },
      { id: 'body', h: 'データ分析（InBody・体重・フィジカルレポート）', body: [
        '上の「InBody」「体重」で切り替えます。いちばん上の「最新の状況」に、いちばん新しい測定日・その日に測った人数・平均が出ます（選手本人が入れた体重は測定日に数えません）。',
        { table: [['画面', '見られること'], ['InBody', 'FFMI・除脂肪体重・体脂肪率・体重のランキング（測定日で絞れる）、基準の設定、PDF・Excel保存'], ['体重', '測定日ごとの体重、未測定の選手（赤）、前回比・4週前比、PDF・Excel保存'],
                  ['フィジカルレポート', '選手の名前を押すと開く。InBody／体重の切り替え、基準日の設定、PDF・Excel保存']] },
        { img: 's-inbody.jpg', alt: 'データ分析（InBody）' },
        '**取り込み**：「InBody」で体組成Excel（InBody結果）、「体重」で体重管理表を選ぶ → 中身を確かめて取り込む。記録があるときは画面のいちばん下、まだ無いときはいちばん上にあります。名前は選手マスタと照合し、同じ選手・同じ測定日は上書きします。',
        '体重レポートは「週平均」が元です。上のカードは最新の週平均と前週比、4週前・3か月前の週との差で、グラフは週平均の推移と直近1か月の毎日です。学年ごとにまとめてPDFにもできます。PDFは印刷の画面が開くので「PDFとして保存」を選んでください。',
        { img: 's-report.jpg', alt: '体重レポート' }
      ] },
      { id: 'manage', h: '管理・設定', body: [   // v67
        '選手の登録・取り込み、メニューの管理、お知らせ・コラムの管理、ログインの管理、使い方の入り口です。押すとそれぞれのページが開き、「戻る」でこの一覧に戻ります。「お知らせ・コラムの管理」は管理者・トレーナー、「ログインの管理」は管理者の人にだけ出ます。',
        { img: 's-manage.jpg', alt: 'スマホ：管理・設定' }
      ] },
      { id: 'menu', h: '毎月のメニュー表（PDF）の取り込み', body: [
        '「管理・設定」→「メニューの管理」から、月に1回、チームごとのメニュー表（Excelから作ったPDF。例「1年生.pdf」）を取り込みます。前の月のメニューは残ります。PDFは Excel の「エクスポート」で作ってください（「Microsoft Print to PDF」で印刷し直したPDFは文字が画像になり、読めません）。',
        { steps: ['「管理・設定」→「メニューの管理」→ PDFを選ぶ', '読み取ったDay・種目・テンポ・回数・セット・レスト・RIR、推奨曜日を、元のPDFと見くらべる（表の中で直せます）',
                  '種目マスタに無い新しい種目は、上半身か下半身を選ぶ（LB・UB のカテゴリから自動で入っています。反映すると種目マスタに足します）',
                  'チーム（ファイル名から自動）・開始日（PDFの「2026/10/1〜」）・メニューIDを確かめる', '「このメニューを反映する」。「切り替える」にチェックがあると、開始日からそのチームの選手が新しいメニューになります（先の日なら、その日に自動で）', 'チームの数だけくり返す'] },
        '取り込んだメニューの中身は、同じページのいちばん下「今あるメニュー」でメニューIDを押すと見られます（Dayごとの種目・部位・回数など）。声でも「メニューの中身を見せて」で開けます。',
        { img: 's-menu.jpg', alt: 'メニュー表の取り込み' },
        '種目マスタに無い種目は注意と赤い枠で知らせます。そのままでも取り込めますが、種目マスタに足すと部位の集計（ダッシュボードの上/下/全）に入ります。月間スケジュールのPDFは取り込めません。'
      ] },
      { id: 'roster', h: '部員名簿から選手・スタッフを取り込む', body: [
        'チームのホームページの部員名簿と、選手マスタ・スタッフマスタを比べて、チェックした分だけ反映します。新入生が名簿に載った春ごろに使います。',
        { steps: ['「管理・設定」→「選手の登録・取り込み」（1分ほどかかることがあります）', '「新しく追加」「内容が変わる」「名簿にいない」を確かめる（下半分はスタッフの分）', '「チェックした分を反映する」'] },
        { img: 's-roster.jpg', alt: '部員名簿の取り込み' },
        { table: [['対象', '入る場所', '入るもの'], ['選手（投手〜外野手）', '選手マスタ', '名前・入学年度・ポジション・ふりがな・出身校・身長（空欄のときだけ）'],
                  ['学生コーチ・トレーナー・アナリスト・指導陣', 'スタッフマスタ', '名前・役職・ふりがな']] },
        { list: ['新しい人にはIDとPINを発行します。PINは各マスタの「PIN」の列で確かめて、本人に渡してください', '「名簿にいない」は最初はチェックなし。卒業・退部した人だけチェックすると在籍を外します（記録は残ります）',
                 '学年は入学年度から自動で出すので、4月に自動で上がります。ホームページが新年度になってから取り込んでください', '反映すると、選手マスタは「在籍 → 学年（4年→1年）→ ふりがな」の順に並びます'] }
      ] },
      { id: 'column', h: 'お知らせ・コラムの管理（管理者・トレーナー）', body: [   // v56・v57
        'お知らせや用語の説明などのコラムを、選手のホームの「お知らせ・コラム」とマイページの「コラム」に載せられます。「管理・設定」→「お知らせ・コラムの管理」から追加します。この項目は、スタッフマスタの役職が「管理者」か「トレーナー」の人にだけ出ます（ほかのスタッフには出ません）。',
        { list: ['タグを「お知らせ」にすると、選手のホームで先に出ます'] },
        { list: ['PDFは、「ページを画像でつなげる」（見た目のまま）か「文字と図」（文字をスマホ向けに組み直し、図は画像）を選びます。読み取った文字は追加する前に直せます',
                 '手入力は「# 」で見出し、「- 」で箇条書き、1行あけると段落です',
                 '「直す」で文字の直し。「PDFを読み込み直す」で、新しいPDFに入れ替えることもできます（題名はそのまま）',
                 '題名を押すと選手の画面での見え方、矢印で順番、「消す」を2回押すと削除です'] }
      ] },
      { id: 'admin', h: 'ログインの管理（管理者だけ）', body: [   // v53
        'スタッフマスタの「役職」が「管理者」の人だけ、「管理・設定」に「ログインの管理」が出ます（ほかのスタッフには出ません）。不正なログインがないかを確かめるためのページです。',
        { list: ['アカウント別：今ログインしている端末の台数を、スマホ・タブレット・PCに分けて人ごとに表示します。多い人が上で、3台以上は赤です',
                 '名前を押すと端末の一覧（OS・ブラウザ・ログインした日時・最後に使った日時）。知らない端末は「ログアウト」を2回押して止め、本人にPINを変えてもらってください',
                 'ログインの記録：成功・失敗・ログアウトの記録。同じIDで「PINちがい」が続く、「IDが無い」が多いときは要注意です',
                 '声でも「ログインの管理を開いて」「ログインの失敗を見せて」で開けます'] }
      ] },
      { id: 'voice', h: 'AIアシスタント（声）の使い方', body: [
        'マイクを押して話すか、「文字で」で打ちこみます（パソコンは画面の下、スマホは右下）。パソコンで声が使えないときも文字で使えます。中身は決まった言い方に答える仕組みで、生成AIは使っていません。',
        { img: 's-voice.jpg', alt: 'AIアシスタントに質問したところ' },
        { table: [['したいこと', '言い方の例'], ['選手の様子', '「今週の状況をまとめて」「今週やってないのは誰？」「疲れている選手は？」「コンディションを入れていないのは誰？」'],
                  ['1人のこと', '「（名前）を開いて」「（名前）の除脂肪体重の推移は？」「（名前）のフィジカルレポートを開いて」'], ['体組成', '「FFMIの1位は？」「体重を測っていないのは誰？」'],
                  ['画面の操作', '「先週にして」「1年の投手を見せて」「ポジション別にして」「InBodyにして」「体重にして」「戻って」'], ['管理', '「チーム分けをする」「メニューを取り込んで」「部員名簿から取り込んで」'],
                  ['説明', '「このページを説明して」「このページの見方を説明して」「このフィジカルレポートを説明して」「FFMIって何？」']] },
        'チーム分けや取り込みの反映は、間違いを防ぐため画面のボタンでだけ行います。一覧は「何ができる？」か、画面の下の「話し方の例（スタッフ）」で見られます。'
      ] },
      { id: 'sheet', h: 'スプレッドシートですること・困ったとき', body: [
        'ふだんの管理は画面でできますが、次のことはスプレッドシート（メニュー「トレーニング管理」）で行います。',
        { table: [['したいこと', 'やり方'], ['PINを忘れた選手に教える', '選手マスタの「PIN」の列を見る。新しくするときはPINを空にして「選手・スタッフのIDとPINを発行」'],
                  ['種目を足す・呼び方を足す', '種目マスタに行を足す（「呼び方の候補」に別の言い方。部位も入れる）'], ['シートを直したのに画面に出ない', '「キャッシュを消す」（何もしなくても5分で反映）'],
                  ['選手マスタを学年・名前の順にする', '「選手マスタを学年・名前の順に並べ直す」'], ['卒業・退部', '部員名簿の取り込みで「名簿にいない」をチェック、またはマスタの「在籍」を FALSE にする']] },
        { list: ['画面に「通信できませんでした」→ 電波の良い所で「もう一度読み込む」', 'パソコンで声が使えない → 画面に理由が出ます（マイクの許可・マイクがないなど）。「文字で」を使う',
                 '選手がログインできない → 選手マスタのID・PIN・「在籍」を確かめる。続けて間違えると15分ほどロックされます', 'ブラウザのページが古いまま → 画面の版の表示（例 v68）を確かめ、再読み込みする'] },
        '年度の更新や全員のID・PINの発行し直しなど、管理者の作業は「管理者マニュアル（年度更新・保守）」を見てください。'
      ] }
    ]
  },

  // ---------------- 表示 ----------------
  /** **太字** と、文字の安全な表示 */
  text: function (s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); },
  part: function (b) {
    var T = Guidebook.text;
    if (typeof b === 'string') return '<p>' + T(b) + '</p>';
    if (b.img) return '<figure class="gb-fig' + (b.wide ? ' gb-wide' : '') + '"><img src="' + Guidebook.IMG_DIR + esc(b.img) + '" alt="' + esc(b.alt || '') + '" loading="lazy"><figcaption>' + esc(b.alt || '') + '</figcaption></figure>';
    if (b.list) return '<ul class="gb-list">' + b.list.map(function (x) { return '<li>' + T(x) + '</li>'; }).join('') + '</ul>';
    if (b.steps) return '<ol class="gb-steps">' + b.steps.map(function (x) { return '<li>' + T(x) + '</li>'; }).join('') + '</ol>';
    if (b.table) return '<div class="table-scroll"><table class="tbl gb-table"><tr>' + b.table[0].map(function (x) { return '<th>' + T(x) + '</th>'; }).join('') + '</tr>' +
      b.table.slice(1).map(function (r) { return '<tr>' + r.map(function (x) { return '<td>' + T(x) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table></div>';
    return '';
  },
  html: function (g) {
    return '<p class="gb-lead">' + Guidebook.text(g.lead) + '</p>' +
      '<nav class="gb-toc" aria-label="もくじ">' + g.sections.map(function (s, i) {
        return '<button class="gb-toc-btn" data-gb="jump" data-v="gb-' + s.id + '"><span>' + (i + 1) + '</span>' + esc(s.h.replace(/：.*$/, '')) + '</button>'; }).join('') + '</nav>' +
      g.sections.map(function (s) {
        return '<section class="group gb-sec" id="gb-' + s.id + '"><h2>' + esc(s.h) + '</h2>' + s.body.map(Guidebook.part).join('') + '</section>';
      }).join('');
  },

  /** 選手：マイページから開く（S.view = 'guide'） */
  showAthlete: function (sectionId) {
    S.view = 'guide';
    app.innerHTML = '<div class="group"><div class="topbar"><h1>' + Icon('book', 24) + ' 使い方</h1><button class="btn ghost" data-act="mypage">マイページへ</button></div></div>' + Guidebook.html(Guidebook.ATHLETE);
    Guidebook.jump(sectionId);
  },

  /** スタッフ：実施状況の下から開く（Staff.page = 'guide'。「← 戻る」で元の画面へ） */
  kind: 'staff',
  showStaff: function (kind) {
    if (S.view !== 'staff') return;
    if (Staff.page !== 'guide') {
      Staff.returnTo = { tab: Staff.tab, scroll: window.scrollY || 0 };
      try { history.pushState({ staffGuide: 1 }, ''); } catch (e) { /* 「戻る」ボタンでも戻れる */ }
    }
    Staff.page = 'guide';
    Guidebook.kind = kind === 'athlete' ? 'athlete' : 'staff';
    var g = Guidebook.kind === 'athlete' ? Guidebook.ATHLETE : Guidebook.STAFF;
    var tab = function (k, label) { return '<button class="tab' + (Guidebook.kind === k ? ' on' : '') + '" data-gb="kind" data-v="' + k + '">' + label + '</button>'; };
    app.innerHTML = Staff.athleteFrame('<h1 class="ath-name">' + esc(g.title) + '</h1><div class="tabs">' + tab('staff', 'スタッフ向け') + tab('athlete', '選手向け（配る用）') + '</div>', Guidebook.html(g), '使い方');
    window.scrollTo(0, 0);
  },
  back: function () { var st = history.state || {}; if (st.staffGuide) history.back(); else Staff.leaveAthlete(); },

  jump: function (id) {
    var el = id && document.getElementById(id.indexOf('gb-') === 0 ? id : 'gb-' + id);
    if (el) setTimeout(function () { el.scrollIntoView({ block: 'start' }); }, 0); else window.scrollTo(0, 0);
  }
};

// もくじ・スタッフ向け／選手向けの切り替え
app.addEventListener('click', function (e) {
  var t = e.target.closest('[data-gb]');
  if (!t) return;
  if (t.dataset.gb === 'jump') Guidebook.jump(t.dataset.v);
  if (t.dataset.gb === 'kind') Guidebook.showStaff(t.dataset.v);
});

/**
 * ============================================================================
 * ここから v56：コラム（用語の説明などの補足）を読む側
 * ============================================================================
 *   ・コラムのページ（S.view = 'column'）：マイページの「コラム」ボタン、声「コラムを見せて」
 *       題名の一覧 → 押すと本文（Webページのように、途切れず縦にスクロール）
 *   ・v57：読み込み中にコラムを出すのはやめた（読み込みが速く、読む時間が無いため。keke さんの判断）
 *   ・データ：API columns（題名の一覧・本文）、画像は API columnImage（Google ドライブのコラム画像フォルダ）。一度読んだ画像はこの端末のメモリに置く
 *   ・追加・変更はスタッフ画面の「コラムの管理」（menu_import.js の後半 ColumnEditor）
 * ============================================================================
 */
var Column = {
  imgs: {},         // 画像ID → Promise<dataURL>
  list: null,       // コラムのページの一覧
  current: null,    // 開いているコラム
  from: 'mypage',   // v64：コラムを開く前の画面（閉じたときの戻り先。ホームから開いたらホームへ）
  /** v64：今の画面を、閉じたときの戻り先として覚える（コラムの中を移るあいだは変えない） */
  remember: function () { if (S.view !== 'column') Column.from = Column.BACK[S.view] ? S.view : 'mypage'; },
  // 戻り先の画面 → [ボタンの data-act（今までと同じ働き）, 文字]。ここに無い画面から開いたときは、今までどおりマイページへ
  BACK: { home: ['home', 'ホームへ'], history: ['records', '記録へ'], body: ['body', 'からだへ'], mypage: ['mypage', 'マイページへ'] },
  /** v64：閉じるボタン（戻り先の画面へ。ボタンの働きは今までの data-act と同じ） */
  closeBtn: function (cls) {
    var g = Column.BACK[Column.from] || Column.BACK.mypage;
    return '<button class="' + cls + '" data-act="' + g[0] + '">' + g[1] + '</button>';
  },

  // ---------------- 本文を描く（スタッフの確認画面でも使う） ----------------
  bodyHtml: function (blocks) {
    var html = '', inList = false;
    (blocks || []).forEach(function (b, i) {
      if (b.t !== 'li' && inList) { html += '</ul>'; inList = false; }
      if (b.t === 'h') html += '<h3 class="col-h">' + esc(b.s) + '</h3>';
      else if (b.t === 'li') { if (!inList) { html += '<ul class="col-ul">'; inList = true; } html += '<li>' + esc(b.s) + '</li>'; }
      else if (b.t === 'img') {
        var ratio = b.w && b.h ? (b.h / b.w * 100).toFixed(2) : '';
        html += '<div class="col-img' + (b.gap ? ' gap' : '') + '"' + (ratio ? ' style="aspect-ratio:' + b.w + '/' + b.h + '"' : '') + '><img alt="" data-colimg="' + esc(b.id) + '"></div>';
      }
      else html += '<p class="col-p">' + esc(b.s).replace(/\n/g, '<br>') + '</p>';
    });
    if (inList) html += '</ul>';
    return '<div class="col-body">' + html + '</div>';
  },
  /** 画面の中の <img data-colimg> に画像を入れる */
  fillImages: function (root) {
    Array.prototype.forEach.call((root || app).querySelectorAll('img[data-colimg]:not([src])'), function (img) {
      Column.image(img.dataset.colimg).then(function (url) { img.src = url; img.parentNode.classList.add('ok'); })
        .catch(function () { img.parentNode.classList.add('ng'); });
    });
  },
  image: function (id) {
    if (!Column.imgs[id]) {
      Column.imgs[id] = Api.call('columnImage', { token: S.token, id: id }).then(function (res) { return 'data:' + res.mime + ';base64,' + res.data; });
      Column.imgs[id].catch(function () { delete Column.imgs[id]; });   // 失敗したら次に読み直す
    }
    return Column.imgs[id];
  },

  // ---------------- コラムのページ ----------------
  show: function () {
    Column.remember();
    S.view = 'column';
    Column.current = null;
    app.innerHTML = '<div class="loading">読み込み中…</div>';
    return Api.call('columns', { token: S.token, kind: 'page' }).then(function (res) {
      Column.list = res.columns || [];
      if (S.view === 'column') Column.renderList();
    }).catch(function (err) {
      app.innerHTML = msgHtml('error', err.message) + Column.closeBtn('btn block');
    });
  },
  /** v58：タグごとにまとめる。順番がいちばん小さいコラムのタグから並べ、タグなしは最後（「その他」） */
  groups: function (list) {
    var map = {}, out = [];
    (list || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); }).forEach(function (c) {
      var t = c.tag || '';
      if (!map[t]) { map[t] = { tag: t, items: [] }; out.push(map[t]); }
      map[t].items.push(c);
    });
    return out.filter(function (g) { return g.tag; }).concat(out.filter(function (g) { return !g.tag; }));
  },
  openTags: null,
  renderList: function () {
    S.view = 'column'; Column.current = null;
    var list = Column.list || [], groups = Column.groups(list);
    if (!Column.openTags) Column.openTags = Store.get('colOpen', {}) || {};
    var item = function (c) {
      return '<li><button data-col="open" data-v="' + esc(c.id) + '"><span class="col-list-t">' + esc(c.title) + '</span>' +
        (c.updated ? '<span class="muted small">' + esc(c.updated.replace(/-/g, '/')) + '</span>' : '') + Icon('right', 18) + '</button></li>';
    };
    var body;
    if (!list.length) body = '<div class="group"><p class="muted">まだコラムはないよ。</p></div>';
    else if (groups.length === 1 && !groups[0].tag) body = '<div class="group"><ul class="col-list">' + list.map(item).join('') + '</ul></div>';   // タグが1つも無いときは今までどおり
    else body = '<div class="group col-groups">' + groups.map(function (g) {
      var key = g.tag || '（その他）', open = !!Column.openTags[key];
      return '<section class="col-group' + (open ? ' open' : '') + '"><button class="col-tag" data-col="tag" data-v="' + esc(key) + '" aria-expanded="' + open + '">' +
        Icon(open ? 'up' : 'down', 18) + '<span class="col-tag-t">' + esc(g.tag || 'その他') + '</span><span class="col-tag-n">' + g.items.length + '</span></button>' +
        (open ? '<ul class="col-list">' + g.items.map(item).join('') + '</ul>' : '') + '</section>';
    }).join('') + '</div>';
    app.innerHTML = '<div class="group"><div class="topbar"><h1>' + Icon('book', 22) + 'コラム</h1>' + Column.closeBtn('btn ghost') + '</div>' +
      '<p class="muted small">トレーニングや体の用語などを説明しているよ。' + (groups.length > 1 || (groups[0] && groups[0].tag) ? 'まとまりの名前を押すと開くよ。' : '読みたい題名を押してね。') + '</p></div>' + body;
    if (!Column.keepScroll) window.scrollTo(0, 0);
    Column.keepScroll = false;
  },
  toggleTag: function (key) {
    if (!Column.openTags) Column.openTags = {};
    if (Column.openTags[key]) delete Column.openTags[key]; else Column.openTags[key] = true;
    Store.set('colOpen', Column.openTags);
    Column.keepScroll = true; Column.renderList();
  },
  open: function (id) {
    Column.remember();
    S.view = 'column';
    app.innerHTML = '<div class="loading">読み込み中…</div>';
    Api.call('columns', { token: S.token, kind: 'page', id: id }).then(function (res) {
      if (S.view !== 'column') return;
      if (!res.column) { Column.renderList(); return; }
      Column.current = res.column;
      app.innerHTML = '<div class="group"><div class="topbar"><button class="btn ghost" data-col="list">' + Icon('left', 20) + 'コラムの一覧</button>' + (Column.from !== 'mypage' ? Column.closeBtn('btn ghost') : '') + '</div>' +
        '<h1 class="col-title">' + esc(res.column.title) + '</h1></div><article class="group col-article">' + Column.bodyHtml(res.column.blocks) + '</article>' +
        '<div class="group"><button class="btn sub block" data-col="list">コラムの一覧へ</button>' + (Column.from !== 'mypage' ? Column.closeBtn('btn ghost block') : '') + '</div>';
      Column.fillImages(app);
      window.scrollTo(0, 0);
    }).catch(function (err) { app.innerHTML = msgHtml('error', err.message) + '<button class="btn block" data-col="list">コラムの一覧へ</button>'; });
  },

  /** 声：「コラムを見せて」「コラムを開いて」 */
  voice: function (text, t) {
    if (!/コラム/.test(t) || !/見|み|開|ひら|読|よ|教え/.test(t)) return false;
    Column.show(); Avatar.feedback('success'); reply(text, 'コラムを開いたよ。読みたい題名を押してね。');
    return true;
  }
};

app.addEventListener('click', function (e) {
  var t = e.target.closest('[data-col]');
  if (!t) return;
  var k = t.dataset.col;
  if (k === 'open') Column.open(t.dataset.v);
  if (k === 'tag') Column.toggleTag(t.dataset.v);   // v58
  if (k === 'list') { if (Column.list) Column.renderList(); else Column.show(); }
});
