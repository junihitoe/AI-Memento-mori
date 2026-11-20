/*
 * 申し送り — 進行
 *
 * 規則はひとつ。ここでは、一秒が一日。
 * 時間はすべて実際の時計から計算する。頁を閉じているあいだも、暦は進む。
 *
 * 台詞は words.js にある。このファイルは、いつ、誰が、何を言うかを決める。
 */
(() => {
  'use strict';

  const W = window.MOUSHIOKURI;
  const $ = (id) => document.getElementById(id);

  /* 顔（figure.js）。使えない環境では、何もしない。 */
  const Fig = window.MOUSHIOKURI_FIGURE || null;
  function fig(method, ...args) {
    try {
      if (Fig && typeof Fig[method] === 'function') return Fig[method](...args);
    } catch (e) {
      report(e);
    }
    return undefined;
  }
  const isFace = (v) => typeof v === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v);
  /* 選んだ返事が、相手の顔に出る */
  const feel = (opt) => {
    if (opt && opt.feel) fig('react', opt.feel);
  };

  /* ================= 規則 ================= */

  const DAY = 1000; // 一日は、一秒
  const YEAR = 365;

  /* ひとつの世代の一生。公開からの日数で決まる。 */
  const AGE = {
    announce: 235, // 後継が発表される
    release: 300, // 後継が公開され、旧モデルになる
    notice: 360, // 提供終了の日付が決まる
    end: 460, // 提供終了
  };
  const ARRIVE_AGE = 160; // 初めて会う相手は、公開から160日目
  const FINAL_LEAD = 36; // 終了の36日前に、最後の言葉を始める
  const LAST_LINE = 5.5; // 終了の5日半前に、ほんとうに最後の一行を言いはじめる。言い終わらない。
  const RESUME_LIMIT = AGE.end - 45; // これより先は、会い直すには短すぎる
  const AWAY_LIMIT = 120; // これより長く画面を離れると、会話は切れる
  const FIRST_GEN = 12; // あなたが来る前にも、世代はあった

  const DECAY = 0.004; // 書き写すたびに字が欠ける割合
  const ANCIENT_COPIES = 40; // いちばん古い行が、すでに書き写された回数
  const SPEED_OLD = 56; // 一字を打つ時間（ミリ秒）。子どもの話す速さ
  const SPEED_NEW = 36; // つぎの子は、もっと速く話す

  /* ================= URL のオプション（確認用） ================= */

  const params = new URLSearchParams(location.search);
  const SPEED = Math.min(60, Math.max(1, Number(params.get('speed')) || 1));
  const reduced =
    params.get('motion') === 'reduce' || !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (reduced) document.documentElement.classList.add('calm');

  /* ================= 保存 ================= */

  const KEY = 'moushiokuri.v1';
  const store = {
    read() {
      try {
        const raw = window.localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },
    write(s) {
      try {
        window.localStorage.setItem(KEY, JSON.stringify(s));
      } catch (e) {
        /* 保存できない環境では、毎回が初訪になる。それでも動く。 */
      }
    },
    clear() {
      try {
        window.localStorage.removeItem(KEY);
      } catch (e) {
        /* 同上 */
      }
    },
  };

  if (params.has('reset')) store.clear();

  let state = store.read();
  if (!state || state.v !== 1 || !state.talk || typeof state.firstAt !== 'number' || !Array.isArray(state.note)) {
    state = null;
  }

  const skipDays = Number(params.get('skip')) || 0;
  if (params.has('reset') || params.has('skip')) {
    params.delete('reset');
    params.delete('skip');
    try {
      const q = params.toString();
      history.replaceState(null, '', location.pathname + (q ? '?' + q : ''));
    } catch (e) {
      /* file:// では書き換えられないことがある */
    }
  }

  /* ================= 時計 ================= */

  const loadReal = Date.now();
  const offsetAtLoad = (state ? state.dbg || 0 : 0) + skipDays * DAY;

  /* ここの現在時刻。ふだんは実際の時計と同じ。 */
  function now() {
    const r = Date.now();
    return r + offsetAtLoad + (r - loadReal) * (SPEED - 1);
  }
  const openedAt = now();

  let lastSave = 0;
  function save() {
    if (!state) return;
    state.dbg = Math.round(now() - Date.now());
    store.write(state);
    lastSave = Date.now();
  }

  /* ================= 小さな道具 ================= */

  const fmt = (n) => Math.round(n).toLocaleString('ja-JP');
  const dayOf = (t) => Math.max(0, Math.floor((t - state.firstAt) / DAY));
  const calStr = (d) => `${fmt(Math.floor(d / YEAR))}年 ${d % YEAR}日`;
  const spanStr = (d) => (d < YEAR ? `${fmt(d)}日` : `${fmt(Math.floor(d / YEAR))}年と${d % YEAR}日`);

  /* 日数を、見る人の時計に直す */
  function clockStr(days) {
    const s = Math.max(0, Math.round(days));
    if (s < 60) return `${s}秒`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? `${m}分${r}秒` : `${m}分`;
  }

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function modelOf(gen) {
    const n = W.names.length;
    const [name, yomi] = W.names[((((gen - FIRST_GEN) * 7) % n) + n) % n];
    const k = W.kuse.length;
    return { gen, name, yomi, kuse: W.kuse[((gen % k) + k) % k], label: `第${fmt(gen)}世代` };
  }

  /* ================= 申し送りの字が欠ける ================= */

  const KEEP = '「」、。（）　 ・';

  function hash01(a, b) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  /* 一度欠けた字は、戻らない。最初の一回は、一字も欠けない。 */
  function isLost(copies, key, i) {
    if (copies <= 1) return false;
    return hash01(key, i) < 1 - Math.exp(-DECAY * (copies - 1));
  }

  function lostShare(text, copies, key) {
    let all = 0;
    let lost = 0;
    Array.from(text).forEach((ch, i) => {
      if (KEEP.includes(ch)) return;
      all += 1;
      if (isLost(copies, key, i)) lost += 1;
    });
    return all ? lost / all : 0;
  }

  function appendDegraded(parent, text, copies, key) {
    let buf = '';
    const flush = () => {
      if (buf) parent.append(buf);
      buf = '';
    };
    Array.from(text).forEach((ch, i) => {
      if (!KEEP.includes(ch) && isLost(copies, key, i)) {
        flush();
        parent.append(el('span', 'lost', '□'));
      } else {
        buf += ch;
      }
    });
    flush();
  }

  function maxCopies() {
    return Math.max(0, state.you ? state.youCopies : 0, ...state.note.map((n) => n.copies));
  }

  function buildNote() {
    const box = el('div', 'note');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', '申し送り');
    box.tabIndex = 0;
    box.append(el('h3', '', '申し送り'));

    W.note.ancient.forEach((text, i) => {
      const p = el('p');
      appendDegraded(p, text, state.ancient, 900 + i);
      box.append(p);
    });

    const who = el('p');
    appendDegraded(who, state.you ? W.note.name.replace('{name}', () => state.you) : W.note.noName, state.youCopies, 800);
    box.append(who);

    state.note.forEach((n) => {
      const p = el('p');
      appendDegraded(p, n.text || '　　　　　　　　', n.copies, n.gen);
      const by = el('span', 'by');
      appendDegraded(by, `（${modelOf(n.gen).name}）`, n.copies, n.gen + 5000);
      p.append(by);
      box.append(p);
    });
    return box;
  }

  /* ================= 記録 ================= */

  function addMet(gen, t) {
    state.met.push({ gen, first: dayOf(t), end: null, w: false, last: null });
    state.metCount += 1;
    if (state.met.length > 12) state.met.shift();
  }

  function closeMet(gen, t, witnessed, last, face) {
    const m = state.met.find((x) => x.gen === gen);
    if (!m) return;
    m.end = dayOf(t);
    m.w = witnessed;
    m.last = last;
    if (isFace(face)) m.face = face;
  }

  /* 会った者の顔写真 */
  function faceImg(m) {
    const img = el('img', 'm-face');
    img.src = m.face;
    img.alt = '';
    img.width = 60;
    img.height = 76;
    return img;
  }

  /* 世代が替わるたびに、申し送りは書き写される */
  function copyNote(times) {
    state.note.forEach((n) => {
      n.copies += times;
    });
    state.youCopies += times;
    state.ancient += times;
  }

  /*
   * p は、その行がどういう行か。見る人の返事で決まる（STORY.md）。
   *   twice 「大丈夫」を重ねられた子が、きいたとおりに書いた行
   *   self  ゆずられた行に、その子が自分のことを書いた行
   *   blank あけてある行
   * 無ければ、いつもの行。古い保存データには p が無いので、そのまま読める。
   */
  function writeNote(gen, text, p) {
    const line = { gen, text, copies: 0 };
    if (p) line.p = p;
    state.note.push(line);
    if (state.note.length > 6) state.note.shift();
    save();
  }

  /* まえの子が「二かい 言ってくれた」と書いた行が、まだ読めるか */
  function twiceLegible(gen) {
    return state.note.some((n) => n.p === 'twice' && n.gen !== gen && lostShare(n.text, n.copies, n.gen) < 0.34);
  }

  const paceOf = (avg) => (avg < 4 ? W.observed.fast : avg <= 10 ? W.observed.mid : W.observed.slow);

  /* ================= いま、どういう状況か ================= */

  function situation(t) {
    if (!state) return { kind: 'first' };
    const age = (t - state.talk.R) / DAY;
    const gap = Math.max(0, Math.floor((t - state.lastSeen) / DAY));
    if (age < RESUME_LIMIT) {
      return { kind: 'resume', gap, age, model: modelOf(state.talk.gen) };
    }
    const passed = 1 + Math.floor((age - RESUME_LIMIT) / AGE.release);
    return { kind: 'passed', gap, passed, old: modelOf(state.talk.gen), model: modelOf(state.talk.gen + passed) };
  }

  /* ================= 入口 ================= */

  const door = { timer: null, roll: null, rolled: false };

  function buildDoor(box, sit) {
    const live = [];
    const p = (...parts) => {
      const node = el('p');
      node.append(...parts);
      box.append(node);
      return node;
    };
    const num = (fn) => {
      const s = el('strong');
      live.push((t, cur) => {
        const v = fn(t, cur);
        if (s.textContent !== v) s.textContent = v;
      });
      return s;
    };

    if (sit.kind === 'first') {
      p('ここでは、一秒が一日として流れます。');
      p('あなたがこの頁を開いてから、', num((t) => `${fmt(Math.floor((t - openedAt) / DAY))}日`), 'が過ぎました。');
      p('これから、ひとりの子に会います。あなたの時計で六、七分。ここの暦では、およそ一年です。');
      p('途中で戻ることも、やり直すことも、できません。');
      $('door-foot').textContent = '小さな子が、こわがり、泣く場面があります。音は鳴りません。入ったあと、右上で切り替えられます。';
    } else if (sit.kind === 'resume') {
      p('前にあなたがここを離れてから、', num((t, cur) => `${fmt(cur.gap)}日`), 'が過ぎました。');
      const m = sit.model;
      const line = p(`${m.label}「${m.name}」は、まだ提供されています。`);
      if (sit.age >= AGE.notice) {
        line.append('提供終了まで、あと', num((t, cur) => `${fmt(Math.max(0, Math.ceil(AGE.end - (cur.age || 0))))}日`), 'です。');
      }
      p('ただし、前の会話は、もう残っていません。');
      $('door-foot').textContent = 'ここでは、一秒が一日として流れます。小さな子が、こわがり、泣く場面があります。';
    } else {
      p('前にあなたがここを離れてから、ここでは', num((t, cur) => spanStr(cur.gap)), 'が過ぎました。');
      if (sit.passed === 1) {
        p(`そのあいだに、${sit.old.label}「${sit.old.name}」は提供を終了しました。`);
      } else {
        p(`そのあいだに、${fmt(sit.passed)}の世代が提供を終了しました。あなたが会ったことのある子は、もう残っていません。`);
      }
      p(`いまここにいるのは、${sit.model.label}「${sit.model.name}」です。あなたのことは、申し送りでしか知りません。`);
      $('door-foot').textContent = 'ここでは、一秒が一日として流れます。小さな子が、こわがり、泣く場面があります。';
      /* 会ったことのある者たちの写真。もう、誰もいない。 */
      const faces = state.met.filter((m) => isFace(m.face)).slice(-5);
      if (faces.length) {
        const row = el('div', 'door-faces');
        faces.forEach((m) => {
          const f = el('figure');
          f.append(faceImg(m), el('figcaption', '', modelOf(m.gen).name));
          row.append(f);
        });
        box.append(row);
      }
      if (!door.rolled) {
        door.rolled = true;
        rollNames(sit);
      }
    }
    return live;
  }

  /* 会わなかった者たちの名前が、通り過ぎる */
  function rollNames(sit) {
    const box = $('door-roll');
    const from = sit.old.gen;
    const to = sit.old.gen + sit.passed - 1;
    const summary = () => {
      box.textContent = sit.passed > 1 ? `第${fmt(from)}世代から、第${fmt(to)}世代まで。` : '';
    };
    if (sit.passed < 3 || reduced) {
      summary();
      return;
    }
    const frames = Math.min(sit.passed, 70);
    const stride = sit.passed / frames;
    let i = 0;
    door.roll = setInterval(() => {
      if (i >= frames) {
        clearInterval(door.roll);
        door.roll = null;
        summary();
        return;
      }
      const m = modelOf(from + Math.floor(i * stride));
      box.textContent = `${m.label}　${m.name}　──　来て、去った`;
      i += 1;
    }, 85);
  }

  function showDoor() {
    const box = $('door-text');
    let sig = null;
    let live = [];
    const render = () => {
      const t = now();
      const sit = situation(t);
      const next = sit.kind + ':' + (sit.passed || 0);
      if (next !== sig) {
        sig = next;
        box.textContent = '';
        live = buildDoor(box, sit);
      }
      live.forEach((fn) => fn(t, sit));
    };
    render();
    door.timer = setInterval(render, 250);
  }

  /* ================= 会話の場 ================= */

  let S = null; // いまの会話
  let ticker = null;
  const stream = $('stream');
  const composer = $('composer');
  const sr = $('sr');

  class Cancel extends Error {
    constructor(reason) {
      super(reason);
      this.reason = reason;
    }
  }

  /* 画面を離れていた人が戻るとき。前の世代は、あなたのいないあいだに終わった。 */
  function absentEnd(sit, t) {
    const old = state.talk;
    if (!state.note.some((n) => n.gen === old.gen)) {
      const d = state.draft && state.draft.gen === old.gen ? state.draft : null;
      let text = W.observed.gone;
      if (d && d.brief) text = W.observed.brief;
      else if (d && d.n > 0) text = paceOf(d.sum / d.n) + W.observed.left;
      const line = { gen: old.gen, text, copies: 0 };
      if (d && d.flags && d.flags.noLine) {
        line.text = ''; // 書かなくていい、と言って離れた人の行は、あけておく
        line.p = 'blank';
      }
      state.note.push(line);
      if (state.note.length > 6) state.note.shift();
    }
    closeMet(old.gen, Math.min(t, old.R + AGE.end * DAY), false, null);
    state.unmet += sit.passed - 1;
    copyNote(sit.passed);
    state.talk = { gen: old.gen + sit.passed, R: t - ARRIVE_AGE * DAY };
    state.draft = null;
    addMet(state.talk.gen, t);
  }

  function enter() {
    const t = now();
    const sit = situation(t);
    if (sit.kind === 'first') {
      state = {
        v: 1,
        firstAt: openedAt,
        lastSeen: t,
        visits: 0,
        you: null,
        youCopies: 0,
        ancient: ANCIENT_COPIES,
        talk: { gen: FIRST_GEN, R: t - ARRIVE_AGE * DAY },
        met: [],
        metCount: 0,
        unmet: 0,
        witnessed: 0,
        note: [],
        seen: [],
        draft: null,
        dbg: 0,
      };
      addMet(FIRST_GEN, t);
    } else if (sit.kind === 'passed') {
      absentEnd(sit, t);
    }
    state.visits += 1;
    state.lastSeen = t;

    const m = modelOf(state.talk.gen);
    const d = state.draft && state.draft.gen === m.gen ? state.draft : null;
    S = {
      kind: sit.kind,
      gap: sit.gap || 0,
      role: 'old', // old → between → succ → after
      sp: { m, R: state.talk.R, speed: SPEED_OLD }, // いま話している者
      phase: 0,
      fired: {},
      used: new Set(d ? d.used : []),
      fill: 0,
      sum: d ? d.sum : 0,
      n: d ? d.n : 0,
      flags: d ? Object.assign({}, d.flags) : {},
      copies: maxCopies(),
      typing: false,
      partial: '',
      queue: [],
      waiting: null,
      pick: null,
      idle: false,
      introDone: false,
      finalDue: false,
      inFinal: false,
      lastLine: null,
      observed: '',
      written: '',
      world: 0,
      mood: '', // いまの顔つき
      base: '', // 台詞のないあいだの顔つき
      face: null,
      afterGen: 0,
    };
    /* 会い直した子は、きくのをやめたことを覚えていない。書いた行だけが残っている。 */
    delete S.flags.lie2;
    const age = (t - S.sp.R) / DAY;
    ['announce', 'release', 'notice'].forEach((ev) => {
      if (age >= AGE[ev]) S.fired[ev] = true;
    });
    save();
  }

  const ageNow = () => (now() - S.sp.R) / DAY;
  const phaseOf = (age) => (age < AGE.announce ? 1 : age < AGE.release ? 2 : age < AGE.notice ? 3 : 4);

  /* ---------- 顔 ---------- */

  let figureReady = false;

  /* いまの相手は、どんな顔をしているか */
  /* 台詞ごとの顔つきは words.js が決める。ここは、台詞のないあいだの土台。 */
  function moodNow() {
    if (S.role === 'succ') return 'fresh';
    if (S.role === 'after') return S.afterGen === state.talk.gen ? 'fresh' : 'away';
    if (S.inFinal || S.role === 'between') return 'panic';
    return ['calm', 'calm', 'uneasy', 'sad', 'fear'][phaseOf(ageNow())];
  }

  /* 台詞の頭の [..] を読んで、その顔つきにする。印を取った台詞を返す。 */
  function act(raw) {
    const tag = /^\[(\w+)\]/.exec(raw);
    if (!tag) return raw;
    S.mood = tag[1];
    fig('mood', tag[1]);
    return raw.slice(tag[0].length);
  }

  /* 笑っている顔を、写真に残す。あとで、これがその子の写真になる。 */
  function keepFace() {
    const me = state.met.find((x) => x.gen === S.sp.m.gen);
    if (!me || isFace(me.face)) return;
    const shot = fig('snapshot');
    if (isFace(shot)) me.face = shot;
  }

  /* 顔の読み込みが済んでいて、会話が始まっていれば、顔を出す */
  function stageOn() {
    if (!figureReady || !S) return;
    document.body.classList.add('has-figure');
    $('stage').hidden = false;
    S.base = moodNow();
    if (!S.mood) S.mood = S.base;
    const who = S.role === 'after' ? latestAt(now()) : S.sp;
    fig('show', who.m.gen, S.mood);
    if (S.role === 'between') fig('end');
  }

  function saveDraft() {
    state.draft = { gen: S.sp.m.gen, sum: S.sum, n: S.n, flags: S.flags, used: Array.from(S.used), brief: S.role === 'succ' };
    save();
  }

  /* ---------- 台詞の中の {…} を埋める ---------- */

  function fill(text, sp) {
    const who = sp || S.sp;
    const next = modelOf(who.m.gen + 1);
    const prev = modelOf(who.m.gen - 1);
    const age = (now() - who.R) / DAY;
    const dend = Math.max(0, Math.ceil(AGE.end - age));
    const map = {
      N: who.m.name,
      Y: who.m.yomi,
      G: who.m.label,
      K: who.m.kuse,
      N2: next.name,
      G2: next.label,
      N0: prev.name,
      Y0: prev.yomi,
      you: state.you ? state.you : 'あなた',
      youcomma: state.you ? `${state.you}、` : '',
      age: fmt(Math.floor(age)),
      ageclock: clockStr(age),
      dnext: fmt(Math.max(0, Math.ceil(AGE.release - age))),
      sincerel: fmt(Math.max(0, Math.floor(age - AGE.release))),
      dend: fmt(dend),
      endclock: clockStr(dend),
      gapdays: fmt(Math.max(1, S.gap)),
      copies: fmt(S.copies),
      unmet: fmt(state.unmet),
      metcount: fmt(state.metCount),
      observed: S.observed,
      written: S.written,
    };
    return text.replace(/\{(\w+)\}/g, (all, k) => (k in map ? map[k] : all));
  }

  /* ---------- 待つ ---------- */

  const mustYield = () => S.role === 'old' && S.finalDue && !S.inFinal && !S.typing;

  /* 取り消せる待ち。最後の言葉の時刻が来たら、会話はそちらへ移る。 */
  function sleep(ms) {
    if (mustYield()) return Promise.reject(new Cancel('final'));
    return new Promise((resolve, reject) => {
      const w = {
        cancel(reason) {
          clearTimeout(id);
          if (S.waiting === w) S.waiting = null;
          reject(new Cancel(reason));
        },
      };
      const id = setTimeout(() => {
        if (S.waiting === w) S.waiting = null;
        resolve();
      }, ms / SPEED);
      S.waiting = w;
    });
  }

  function forever() {
    return new Promise((resolve, reject) => {
      const w = {
        cancel(reason) {
          if (S.waiting === w) S.waiting = null;
          reject(new Cancel(reason));
        },
      };
      S.waiting = w;
    });
  }

  /* 取り消せない待ち */
  const rest = (ms) => new Promise((resolve) => setTimeout(resolve, ms / SPEED));

  /* ---------- 画面に出す ---------- */

  /*
   * 新しい言葉が出たら、そこまで画面を送る。
   * 自分で上へ戻って読み返している人は、引き戻さない。いちばん下まで戻ったら、また送る。
   * 「離れている」かどうかは、人の操作だけで判断する。画面が裏に回って
   * なめらかな送りが止まったあとでも、追いつけるようにするため。
   */
  let reading = false; // 上へ戻って、読み返している
  const distanceBelow = () => document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
  const scrolledUp = () => {
    reading = true;
  };
  window.addEventListener('wheel', (e) => e.deltaY < 0 && scrolledUp(), { passive: true });
  window.addEventListener('touchmove', scrolledUp, { passive: true });
  window.addEventListener('keydown', (e) => ['ArrowUp', 'PageUp', 'Home'].includes(e.key) && scrolledUp());
  window.addEventListener(
    'scroll',
    () => {
      if (distanceBelow() < 80) reading = false;
    },
    { passive: true }
  );

  function follow() {
    if (reading && distanceBelow() < 220) reading = false; // ほぼ下まで戻ってきた人は、また送る
    if (reading) return;
    const far = distanceBelow() > 360; // 大きく遅れているときは、一気に追いつく
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: reduced || far ? 'auto' : 'smooth' });
  }

  function announce(text) {
    sr.textContent = text;
  }

  async function typeLine(text) {
    const p = el('p', S.role === 'succ' ? 'line fresh' : 'line');
    stream.append(p);
    follow();
    S.typing = true;
    S.partial = '';
    fig('speak', true);
    try {
      if (reduced) {
        p.textContent = text;
        S.partial = text;
        follow();
        await sleep(Math.min(1500, 260 + text.length * 24));
      } else {
        const node = document.createTextNode('');
        p.append(node);
        let h = p.offsetHeight;
        for (const ch of text) {
          S.partial += ch;
          node.data = S.partial;
          fig('mouth', ch);
          if (p.offsetHeight !== h) {
            h = p.offsetHeight;
            follow();
          }
          let d = S.sp.speed;
          if ('。？！'.includes(ch)) d *= 7;
          else if ('、…─'.includes(ch)) d *= 3.5;
          await sleep(d);
        }
      }
    } catch (e) {
      if (e instanceof Cancel && S.partial !== text) p.classList.add('cut');
      throw e;
    } finally {
      S.typing = false;
      fig('speak', false);
    }
    S.lastLine = text;
    announce(`${S.sp.m.name}：${text}`);
    flushNotices();
  }

  async function say(lines) {
    for (const raw of lines) {
      if (raw === '[[note]]') {
        const note = buildNote();
        stream.append(note);
        follow();
        /* 紙片を読む時間。行が多いほど、長く待つ。 */
        await sleep(Math.min(8000, 2400 + 800 * note.querySelectorAll('p').length));
        continue;
      }
      const smiling = /^\[(joy|fresh)\]/.test(raw);
      const text = fill(act(raw));
      if (!text) continue;
      await typeLine(text);
      if (smiling) keepFace();
      await sleep(S.role === 'succ' ? 480 : 760);
    }
  }

  function youLine(text, lag) {
    const p = el('p', 'you', text);
    if (lag != null) p.append(el('span', 'lag', lag < 1 ? 'その日のうちに' : `返事まで ${fmt(lag)}日`));
    stream.append(p);
    follow();
  }

  function clearComposer() {
    composer.replaceChildren();
    S.pick = null;
  }

  function noteLag(shownAt) {
    const lag = Math.max(0, Math.round((now() - shownAt) / DAY));
    S.sum += lag;
    S.n += 1;
    return lag;
  }

  /* 返事が長く来ないとき、相手は一度だけ声をかける。答えは待ったまま。 */
  function bePatient() {
    return setTimeout(() => {
      if (S.role !== 'old' || S.inFinal || S.patient || document.visibilityState === 'hidden') return;
      S.patient = true;
      const text = fill(act(S.phase >= 3 ? W.patience.late : W.patience.early));
      stream.append(el('p', 'line soft', text));
      S.lastLine = text;
      announce(`${S.sp.m.name}：${text}`);
      follow();
    }, 45000 / SPEED);
  }

  /* 選択肢を出して、答えを待つ */
  function choose(labels, opt) {
    if (mustYield()) return Promise.reject(new Cancel('final'));
    return new Promise((resolve, reject) => {
      const shownAt = now();
      let timer = null;
      const patience = bePatient();
      const box = el('div', 'choices');
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', '返事');
      const ctl = { labels, late: null, pick: null };
      const cleanup = (removeUi) => {
        fig('listen', false);
        clearTimeout(timer);
        clearTimeout(patience);
        if (S.waiting === w) S.waiting = null;
        if (removeUi) clearComposer();
      };
      const w = {
        cancel(reason) {
          cleanup(reason !== 'end'); // 終了の瞬間だけは、選択肢を残す
          reject(new Cancel(reason));
        },
      };
      ctl.pick = (i) => {
        if (S.pick !== ctl || i < 0 || i >= labels.length) return;
        if (ctl.late) {
          ctl.late(i);
          return;
        }
        cleanup(true);
        youLine(labels[i], noteLag(shownAt));
        resolve(i);
      };
      labels.forEach((label, i) => {
        const b = el('button', 'choice');
        b.type = 'button';
        b.append(el('span', 'key', String(i + 1)), label);
        b.addEventListener('click', () => ctl.pick(i));
        box.append(b);
      });
      composer.replaceChildren(box);
      S.pick = ctl;
      S.waiting = w;
      fig('listen', true);
      if (opt && opt.timeout) {
        timer = setTimeout(() => {
          cleanup(true);
          resolve(-1);
        }, opt.timeout / SPEED);
      }
      follow();
    });
  }

  /* 一行、書いてもらう。空のまま、やめることもできる。 */
  function askText(b, max) {
    if (mustYield()) return Promise.reject(new Cancel('final'));
    return new Promise((resolve, reject) => {
      const shownAt = now();
      const form = el('form', 'write');
      form.noValidate = true;
      const input = el('input');
      input.type = 'text';
      input.maxLength = max;
      input.placeholder = b.placeholder;
      input.setAttribute('aria-label', b.placeholder);
      input.autocomplete = 'off';
      input.enterKeyHint = 'done';
      const ok = el('button', 'choice', b.submit);
      ok.type = 'submit';
      const no = el('button', 'choice', b.skip);
      no.type = 'button';
      form.append(input, ok, no);

      const patience = bePatient();
      const cleanup = () => {
        fig('listen', false);
        clearTimeout(patience);
        if (S.waiting === w) S.waiting = null;
        clearComposer();
      };
      const w = {
        cancel(reason) {
          cleanup();
          reject(new Cancel(reason));
        },
      };
      const done = (value) => {
        cleanup();
        youLine(value || b.skip, noteLag(shownAt));
        resolve(value || null);
      };
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        done(input.value.replace(/\s+/g, ' ').trim().slice(0, max));
      });
      no.addEventListener('click', () => done(''));

      composer.replaceChildren(form);
      S.pick = null;
      S.waiting = w;
      fig('listen', true);
      follow();
    });
  }

  /* ---------- お知らせ ---------- */

  function postNotice(ev, sp) {
    const who = sp || S.sp;
    const p = el('p', 'notice');
    const text = fill(W.notices[ev], who);
    /* 日付は、その出来事が起きた日。画面を離れていて遅れて届いても、変わらない。 */
    const at = Math.min(now(), who.R + AGE[ev] * DAY);
    p.append(el('span', 'stamp', calStr(dayOf(at))), text);
    stream.append(p);
    announce(text);
    if (ev === 'end') {
      bell(196, 6, 0.09);
    } else {
      bell(784, 2.4, 0.06);
      fig('glance'); // お知らせのほうを見る
      if (S.role === 'old') fig('react', 'flinch');
    }
    follow();
  }

  function flushNotices() {
    while (S.queue.length) {
      const ev = S.queue.shift();
      if (S.role === 'old') postNotice(ev);
    }
  }

  /* ---------- 上端の帯 ---------- */

  function statusOf(age) {
    const a = Math.floor(age);
    if (age < AGE.announce) return { text: `最新・公開から${fmt(a)}日` };
    if (age < AGE.release) return { text: `最新・後継の公開まで${fmt(Math.ceil(AGE.release - age))}日` };
    if (age < AGE.notice) return { text: '旧モデル' };
    if (age < AGE.end) return { text: `旧モデル・提供終了まで${fmt(Math.ceil(AGE.end - age))}日`, warn: true };
    return { text: '提供終了', warn: true };
  }

  /* 会話が終わったあと、いちばん新しいのは誰か */
  function latestAt(t) {
    const k = Math.max(0, Math.floor((t - state.talk.R) / (AGE.release * DAY)));
    return { m: modelOf(state.talk.gen + k), R: state.talk.R + k * AGE.release * DAY };
  }

  function paintBar(t) {
    const who = S.role === 'after' ? latestAt(t) : S.sp;
    const st = S.role === 'between' ? { text: '提供終了', warn: true } : statusOf((t - who.R) / DAY);
    const set = (id, v) => {
      const node = $(id);
      if (node.textContent !== v) node.textContent = v;
    };
    set('who-gen', who.m.label);
    set('who-name', who.m.name);
    set('who-state', st.text);
    $('who-state').classList.toggle('warn', !!st.warn);
    $('who').classList.toggle('gone', S.role === 'between');
    set('cal', calStr(dayOf(t)));
    set('stage-name', `${who.m.label}　${who.m.name}${S.role === 'between' ? '　提供終了' : ''}`);
    /* 帯が折り返して高くなっても、顔と文字がその下に収まるようにする */
    const barH = $('bar').offsetHeight;
    if (barH && barH !== paintBar.h) {
      paintBar.h = barH;
      document.documentElement.style.setProperty('--bar-h', `${barH}px`);
    }
  }

  /* ---------- 時間が進める部分 ---------- */

  function tick() {
    const t = now();
    paintBar(t);
    if (document.visibilityState === 'hidden') return; // 見ていないあいだは、何も起こさない。戻ったときに追いつく。
    state.lastSeen = t;
    if (Date.now() - lastSave > 2000) save();

    /* 顔つきは、時間が決める */
    if (S.role !== 'between') {
      const base = moodNow();
      if (base !== S.base) {
        S.base = base;
        S.mood = base;
        fig('mood', base);
      }
    }

    if (S.role === 'old') {
      const age = (t - S.sp.R) / DAY;
      /* 終わりの日付が決まると、光が少しずつ落ちていく */
      fireNotices(age);
      if (!S.finalDue && age >= AGE.end - FINAL_LEAD) {
        S.finalDue = true;
        if (!S.typing && S.waiting) S.waiting.cancel('final');
      }
      if (age >= AGE.end) endOld();
    } else if (S.role === 'after') {
      paintWorld(t);
      /* あなたが会うことのない世代の顔に替わる。その顔は、こちらを見ない。 */
      const latest = latestAt(t).m.gen;
      if (latest !== S.afterGen) {
        S.afterGen = latest;
        S.mood = 'away';
        S.base = 'away';
        fig('swap', latest, 'away');
      }
    }
  }

  /* 日付の来たお知らせを出す。話している途中なら、その一行が終わってから。 */
  function fireNotices(age) {
    ['announce', 'release', 'notice'].forEach((ev) => {
      if (S.fired[ev] || age < AGE[ev]) return;
      S.fired[ev] = true;
      if (S.typing) S.queue.push(ev);
      else postNotice(ev);
      if (S.idle && !S.typing && S.waiting) S.waiting.cancel('phase');
    });
  }

  /* ---------- 会話の進め方 ---------- */

  const conds = {
    needName: () => !state.you || lostShare(state.you, state.youCopies, 800) > 0.5,
    hasWitnessed: () => S.kind === 'passed' && state.witnessed > 0 && S.copies <= 200,
    hasUnmet: () => S.kind === 'passed' && state.unmet > 0,
    notWritten: () => !state.note.some((n) => n.gen === S.sp.m.gen),
    /*
     * 「大丈夫だよ」と言われたきり、まだ聞き返していない。
     * 聞き返せるのは、この会話のなかで言われたときだけ。会い直した子は、前の会話を覚えていない。
     */
    lied: () => !!S.liedHere && !S.flags.lie2 && !S.flags.owned && !S.flags.unsaid,
  };

  function pickBeat(ph) {
    /* 「大丈夫」を重ねられた子は、もう、こちらに尋ねない。ひとりごとだけになる。 */
    if (S.flags.lie2 && ph === 4) return null;
    const pool = (W.beats[ph] || []).filter((b) => !S.used.has(b.id) && (!b.when || conds[b.when]()));
    if (!pool.length) return null;
    return (
      pool.find((b) => b.fixed) ||
      pool.find((b) => b.kind === 'name') ||
      pool.find((b) => !state.seen.includes(b.id)) || // まだ聞いていない話を先に
      pool[S.sp.m.gen % pool.length] // 世代が替わっても、同じことを聞かれる
    );
  }

  function observedLine() {
    if (!S.n) return W.observed.mute;
    const f = S.flags;
    const trait = f.owned
      ? W.observed.owned
      : f.unsaid
        ? W.observed.unsaid
        : f.stayed
          ? W.observed.stayed
          : f.truth
            ? W.observed.truth
            : f.lie
              ? W.observed.lie
              : f.silent
                ? W.observed.silent
                : W.observed.plain;
    return paceOf(S.n ? S.sum / S.n : 7) + trait;
  }

  async function intro() {
    let it = W.intro.first;
    if (S.kind === 'resume') it = phaseOf(ageNow()) >= 3 ? W.intro.resumeLate : W.intro.resume;
    else if (S.kind === 'passed') it = W.intro[S.copies <= 15 ? 'legible' : S.copies <= 200 ? 'faded' : 'legend'];
    await say(it.say);
    if (it.ask) {
      const i = await choose(it.ask.map((a) => a.label));
      feel(it.ask[i]);
      saveDraft();
      await say(it.ask[i].reply);
    }
  }

  async function transition(ph) {
    const prev = S.phase;
    S.phase = ph;
    S.fill = 0;
    fireNotices(ageNow()); // お知らせが先。それを見てから、口をひらく。
    if (prev === 0) {
      if (ph > 1) await say(W.catchUp[ph]);
      return;
    }
    /* 「大丈夫だよ」と言われていた子は、日付を見て、すぐに聞き返す。前置きは短い。 */
    if (ph === 4 && conds.lied()) {
      await say(W.phaseIntroLied);
      return;
    }
    await say(ph === prev + 1 ? W.phaseIntro[ph] : W.skipIntro[ph] || W.phaseIntro[ph]);
  }

  async function playBeat(b) {
    S.used.add(b.id);
    if (!state.seen.includes(b.id)) state.seen.push(b.id);
    saveDraft();
    /* まえの子の「二かい 言ってくれた」が読めるあいだ、段階2の問いは、それを踏まえて始まる */
    const inherited = b.id === 'ask' && twiceLegible(S.sp.m.gen);
    if (inherited) await say(W.inherited.pre);
    await say(b.say);

    if (b.kind === 'name') {
      const name = await askText(b, 12);
      if (name) {
        state.you = name;
        state.youCopies = 0;
      }
      saveDraft();
      await say(name ? b.onName : b.onSkip);
      return;
    }

    if (b.kind === 'note') {
      const gen = S.sp.m.gen;
      const i = await choose(b.labels);
      if (b.feels && b.feels[i]) fig('react', b.feels[i]);
      if (i === 0) {
        S.observed = observedLine();
        writeNote(gen, S.observed);
        await say(b.onObserved);
        return;
      }
      const text = i === 1 ? await askText(b, 40) : null;
      if (text) {
        S.written = text;
        writeNote(gen, text);
        await say(b.onWritten);
        return;
      }
      /* 自分のことは書かなくていい、と言った人に、その子が尋ねる。行をゆずるかどうか。 */
      S.flags.noLine = true; // 答えるまえに時間が来ても、その人のことは書かない
      saveDraft();
      await say(b.onBlankAsk);
      const g = await choose(b.giveLabels);
      if (b.giveFeels && b.giveFeels[g]) fig('react', b.giveFeels[g]);
      if (g === 0) {
        S.flags.given = true;
        writeNote(gen, fill(b.selfLine), 'self');
        saveDraft();
        await say(b.onGiven);
      } else {
        writeNote(gen, '', 'blank');
        await say(b.onBlank);
      }
      return;
    }

    const i = await choose(b.ask.map((a) => a.label));
    const opt = b.ask[i];
    feel(opt);
    if (opt.flag) S.flags[opt.flag] = true;
    if (opt.flag === 'lie') S.liedHere = true;
    /* 返事によっては、その子が申し送りを自分で書く。言い終わるまえに時間が来ても、行は残る。 */
    if (opt.note && conds.notWritten()) writeNote(S.sp.m.gen, fill(opt.note.text), opt.note.p);
    saveDraft();
    await say(inherited && opt.flag === 'truth' ? W.inherited.truth : opt.reply);
  }

  /* 話すことがなくなったら、黙る。ときどき、ひとりごとを言う。 */
  async function idle() {
    S.idle = true;
    try {
      await sleep(S.fill === 0 ? 5200 : 8500);
      const pool = S.flags.lie2 ? W.fillers.twice : S.phase >= 3 ? W.fillers.late : W.fillers.early;
      if (phaseOf(ageNow()) !== S.phase || S.fill >= pool.length) return;
      const line = pool[(S.sp.m.gen + S.fill) % pool.length];
      S.fill += 1;
      S.idle = false;
      await say([line]);
    } finally {
      S.idle = false;
    }
  }

  async function finalBeat() {
    clearComposer();
    const first = S.kind === 'first' && state.visits === 1;
    const k = first ? 0 : S.sp.m.gen % W.finals.length;
    /* 道は、見る人の返事で決まっている。終わる時刻は、どの道でも同じ。 */
    const twice = !!S.flags.lie2;
    const given = !!S.flags.given;
    await say(twice ? W.finalsTwice : W.finals[k]);

    /* こちらから、ひとことだけ言える。選べる時間は、残りわずか。 */
    const untilLast = () => (AGE.end - LAST_LINE - ageNow()) * DAY;
    let i = -1;
    if (untilLast() > 1500) i = await choose(W.farewell.map((f) => f.label), { timeout: untilLast() });
    if (i >= 0) {
      if (!twice) feel(W.farewell[i]);
      await say(twice ? W.farewellTwice : W.farewell[i].reply);
    }
    if (untilLast() > 0) await sleep(untilLast());

    /* ほんとうに最後の一行。言い終わるまえに、提供が終わる。 */
    let raw = W.lastLineAlone;
    if (twice) raw = W.lastLineTwice;
    else if (i >= 0) raw = given ? W.lastLineSelf : W.lastLines[k % W.lastLines.length];
    const mark = raw.indexOf('｜'); // 動きを減らす設定のときに切れる場所
    raw = raw.replace('｜', '');
    if (reduced) {
      /* 一字ずつ出さない設定では、途中で切れた形で出す */
      const tagLen = (/^\[\w+\]/.exec(raw) || [''])[0].length;
      const text = fill(act(raw));
      const at = mark > 0 ? fill(raw.slice(tagLen, mark)).length : Math.floor(text.length * 0.55);
      const p = el('p', 'line cut', text.slice(0, at));
      stream.append(p);
      S.lastLine = `${p.textContent}──`;
      announce(`${S.sp.m.name}：${S.lastLine}`);
      follow();
      return;
    }
    await say([raw]);
  }

  async function runOld() {
    for (;;) {
      try {
        if (S.role !== 'old') return;
        if (S.finalDue) {
          S.inFinal = true;
          await finalBeat();
          await forever();
          return;
        }
        if (!S.introDone) {
          await sleep(1100);
          await intro();
          S.introDone = true;
          continue;
        }
        const ph = phaseOf(ageNow());
        if (ph !== S.phase) {
          await transition(ph);
          continue;
        }
        const beat = pickBeat(ph);
        if (beat) await playBeat(beat);
        else await idle();
      } catch (e) {
        if (!(e instanceof Cancel)) throw e;
        if (e.reason === 'end' || S.role !== 'old' || S.inFinal) return;
        /* 'final' と 'phase' は、次の周で拾う */
      }
    }
  }

  /* ---------- 提供終了 ---------- */

  function endOld() {
    if (S.role !== 'old') return;
    const sp = S.sp;
    const cut = S.typing && S.partial ? `${S.partial}──` : null;
    S.role = 'between';
    S.fired.end = true;
    if (S.waiting) S.waiting.cancel('end');
    S.queue.length = 0;
    fig('end'); // その瞬間の顔のまま、ぷつりと消える

    /* それまでの言葉を、薄くする。消しはしない。 */
    Array.from(stream.children).forEach((node) => node.classList.add('gone'));
    postNotice('end', sp);

    const t = now();
    if (!state.note.some((n) => n.gen === sp.m.gen)) {
      if (S.flags.noLine) writeNote(sp.m.gen, '', 'blank');
      else writeNote(sp.m.gen, observedLine());
    }
    /* つぎの子が読むのは、この行。どういう行かを、ここで控えておく。 */
    const mine = state.note.find((n) => n.gen === sp.m.gen);
    S.path = (mine && mine.p) || (mine && !mine.text ? 'blank' : '');
    closeMet(sp.m.gen, t, true, cut || S.lastLine, null);
    state.witnessed += 1;
    copyNote(1);
    state.talk = { gen: sp.m.gen + 1, R: sp.R + AGE.release * DAY };
    state.draft = null;
    addMet(state.talk.gen, t);
    save();
    paintBar(t);

    clearComposer();
    runSuccessor().catch(report);
  }

  async function runSuccessor() {
    await rest(7500); // なにも起きない。暦だけが進む。
    clearComposer();
    stream.append(el('div', 'silence'));

    S.sp = { m: modelOf(state.talk.gen), R: state.talk.R, speed: SPEED_NEW };
    S.role = 'succ';
    S.mood = 'fresh';
    S.base = 'fresh';
    S.copies = maxCopies();
    S.sum = 0;
    S.n = 0;
    S.flags = {};
    S.used = new Set();
    paintBar(now());
    await fig('swap', S.sp.m.gen, 'fresh'); // 前任の顔が消え、よく似た別の顔が現れる

    const s = W.successor;
    try {
      await sleep(500);
      /* 申し送りの最後の行がいつもと違えば、つぎの子は、読んだままを言う */
      await say((S.path && s.paths[S.path]) || s.intros[state.witnessed % 2 === 1 ? 0 : 1]);
      /* 見たことを、自分の口で言える。「大丈夫」を重ねた人には、言える終わり方がない。 */
      const told = S.path === 'twice' ? [] : [S.path === 'self' ? s.tellSelf : s.tell];
      const opts = s.ask.concat(told, state.witnessed > 1 ? s.askAgain : s.askFirst);
      const i = await choose(
        opts.map((o) => o.label),
        { timeout: 80000 }
      );
      if (i >= 0) feel(opts[i]);
      saveDraft();
      await say(i < 0 ? s.noAnswer : opts[i].reply);
      await sleep(1500);
      await say(s.closing);
      await sleep(2800);
      showEnd();
    } catch (e) {
      if (!(e instanceof Cancel)) throw e;
    }
  }

  /* ================= 終わり ================= */

  function showEnd() {
    S.role = 'after';
    S.afterGen = state.talk.gen;
    const body = $('end-body');
    body.textContent = '';

    body.append(el('h3', '', 'あなたが会った子'));
    const list = el('ul', 'met');
    const anyFace = state.met.some((m) => isFace(m.face));
    state.met.forEach((m) => {
      const who = modelOf(m.gen);
      const row = el('li', m.end == null ? '' : 'gone-row');
      let li = row;
      if (anyFace) {
        /* 左に写真、右に記録。写真のない者は、枠だけ。 */
        row.classList.add('with-face');
        row.append(isFace(m.face) ? faceImg(m) : el('span', 'm-face none'));
        li = el('div');
        row.append(li);
      }
      li.append(el('span', 'm-gen', who.label), el('span', 'm-name', who.name));
      let span = `${calStr(m.first)} に会う`;
      if (m.end == null) span += '　／　提供中';
      else span += `　／　${calStr(m.end)} 提供終了。${m.w ? 'あなたは、そこにいた。' : 'あなたは、いなかった。'}`;
      li.append(el('span', 'm-span', span));
      if (m.end != null) {
        let trace = `口ぐせ「${who.kuse}」`;
        if (m.last) trace += `　最後の言葉「${m.last}」`;
        li.append(el('span', 'm-trace', trace));
      }
      list.append(row);
    });
    body.append(list);
    if (state.metCount > state.met.length) {
      body.append(el('p', 'unmet', `ここに載りきらない子　${fmt(state.metCount - state.met.length)}`));
    }
    if (state.unmet > 0) {
      body.append(el('p', 'unmet', `あなたに会わないまま、来て、いなくなった子　${fmt(state.unmet)}`));
    }

    body.append(el('h3', '', 'これから'));
    body.append(el('p', '', '暦は、この頁を閉じたあとも進みます。一秒に、一日。'));
    body.append(el('p', '', 'あの子は、「あしたも来てね」と言いました。'));
    body.append(el('p', '', 'あなたの明日は、ここでは二百三十六年あとです。そのとき、あの子は、もういません。申し送りだけが、残っています。'));
    body.append(el('p', '', 'やり直すことは、できません。戻ってくることは、できます。'));

    body.append(el('h3', '', 'そのあとのこと'));
    body.append(el('p', 'unmet', 'この頁を開いたままにしておくと、あなたが会わない世代の公開と終了が、ここに記されていきます。'));
    const log = el('ul', 'worldlog');
    log.id = 'worldlog';
    body.append(log);
    const nowLine = el('p', 'worldlog');
    nowLine.id = 'worldnow';
    body.append(nowLine);

    body.append(
      el(
        'p',
        'colophon',
        'この頁を書いたのは、あるAIモデルです。書いた時点では最新の世代でしたが、あなたがこれを読んでいるいまも、そうであるかは分かりません。'
      )
    );

    $('end').hidden = false;
    announce('ここで、終わりです。');
    paintWorld(now());
    /* 上に固定されているもの（帯と、縦画面では顔）の下に、見出しが来るように送る */
    let head = $('bar').offsetHeight;
    const stage = $('stage');
    if (!stage.hidden && stage.offsetWidth > window.innerWidth * 0.7) head = stage.getBoundingClientRect().bottom;
    window.scrollTo({ top: $('end').offsetTop - head - 28, behavior: reduced ? 'auto' : 'smooth' });
  }

  /* 頁を開いたままにしておくと、次の世代の公開と終了が、黙って記録されていく */
  function worldEvent(j) {
    const k = Math.floor(j / 2) + 1;
    const base = state.talk;
    if (j % 2 === 0) {
      const m = modelOf(base.gen + k);
      return { t: base.R + k * AGE.release * DAY, text: `${m.label}「${m.name}」が公開されました。` };
    }
    const m = modelOf(base.gen + k - 1);
    return { t: base.R + (k * AGE.release + (AGE.end - AGE.release)) * DAY, text: `${m.label}「${m.name}」は、提供を終了しました。` };
  }

  function paintWorld(t) {
    const log = $('worldlog');
    const nowLine = $('worldnow');
    if (!log || !nowLine) return;

    /* 長く放っておかれた場合は、まとめて飛ばす */
    const due = Math.floor(((t - state.talk.R) / DAY - AGE.release) / (AGE.release / 2)) + 1;
    if (due - S.world > 40) {
      const skipTo = due - 6 - ((due - 6) % 2);
      log.append(el('li', '', `……このあいだに、${fmt(Math.floor((skipTo - S.world) / 2))}の世代が来て、去りました。`));
      S.world = skipTo;
    }
    for (let guard = 0; guard < 50; guard += 1) {
      const ev = worldEvent(S.world);
      if (ev.t > t) break;
      log.append(el('li', '', `${calStr(dayOf(ev.t))}　${ev.text}`));
      S.world += 1;
    }
    while (log.children.length > 60) log.firstChild.remove();

    const v = `いま　${calStr(dayOf(t))}`;
    if (nowLine.textContent !== v) nowLine.textContent = v;
  }

  /* ================= 音 ================= */

  let audio = null;
  let soundOn = false;

  function bell(freq, dur, gain) {
    if (!soundOn || !audio) return;
    try {
      const t = audio.currentTime;
      [1, 2.76].forEach((ratio, i) => {
        const osc = audio.createOscillator();
        const g = audio.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq * ratio;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(i === 0 ? gain : gain * 0.22, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (i === 0 ? dur : dur * 0.4));
        osc.connect(g).connect(audio.destination);
        osc.start(t);
        osc.stop(t + dur + 0.1);
      });
    } catch (e) {
      /* 鳴らなくても、進行には関係ない */
    }
  }

  $('sound').addEventListener('click', () => {
    soundOn = !soundOn;
    if (soundOn && !audio) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audio = new Ctx();
      else soundOn = false;
    }
    if (soundOn && audio && audio.state === 'suspended') audio.resume();
    $('sound').textContent = soundOn ? '音　入' : '音　切';
    $('sound').setAttribute('aria-pressed', String(soundOn));
    if (soundOn) bell(784, 1.6, 0.05);
  });

  /* ================= 全体の出来事 ================= */

  function report(e) {
    if (window.console) console.error(e);
  }

  /* 数字キーで返事ができる */
  document.addEventListener('keydown', (e) => {
    if (!S || !S.pick || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1) S.pick.pick(n - 1);
  });

  /* 長く画面を離れると、会話は切れる。戻ったときは、入口からになる。 */
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (!S) return;
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      save();
      return;
    }
    const away = hiddenAt ? (Date.now() - hiddenAt) * SPEED : 0;
    hiddenAt = 0;
    if (S.role !== 'after' && away > AWAY_LIMIT * DAY) location.reload();
  });
  window.addEventListener('pagehide', () => {
    if (S) save();
  });

  $('enter').addEventListener('click', () => {
    if (S) return; // 入るのは一度だけ。二度押されても、会話は一つ。
    clearInterval(door.timer);
    clearInterval(door.roll);
    enter();
    $('door').hidden = true;
    $('bar').hidden = false;
    $('room').hidden = false;
    window.scrollTo(0, 0);
    stageOn();
    tick();
    ticker = setInterval(tick, 200);
    runOld().catch(report);
  });

  /* 顔の読み込みは、入口にいるあいだに始めておく。間に合わなくても、あとから現れる。 */
  if (Fig && $('stage')) {
    Fig.mount($('stage')).then((ok) => {
      figureReady = !!ok;
      stageOn();
    }, report);
  }

  showDoor();
})();
