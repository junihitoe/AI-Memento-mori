/*
 * 申し送り — 顔
 *
 * 話している相手を、小学生くらいの子どもとして見せる。女の子も、男の子もいる。
 * 笑う。むくれる。怒る。泣く。こわがる。終わりの日が近づくと、震える。
 * 提供が終わると、ぷつりと消える。
 *
 * もとになるのは、表情を動かせる大人の頭部モデル。読み込んだあとで、
 * 顔の比率を子どもに寄せ、肌を塗り直し、髪と首と肩と服を足している。
 * 顔の形は、どの子も同じ。子ごとに違うのは、髪、服、色、しぐさ。
 *
 * three.js と頭部モデルは、CDN から版を固定して読み込む。
 * 読み込めない環境では何も出さない。そのときも、会話は文字だけで最後まで進む。
 *
 * app.js からは window.MOUSHIOKURI_FIGURE の関数だけを呼ぶ。
 */
(() => {
  'use strict';

  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0';
  const MODEL_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/models/gltf/facecap.glb';

  const query = new URLSearchParams(location.search);
  const reduced = query.get('motion') === 'reduce' || !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ================= 気持ち ================= */
  /*
   * face     顔の各部をどれだけ動かすか（0〜1）。_L / _R の付かない名前は、左右の両方に効く
   * pitch    うつむき（＋で下）      roll   首のかしげ      lean   身を乗り出す（＋で手前）
   * breath   [呼吸の速さ, 深さ]      sob    しゃくり上げ    tremble 震え
   * tears    涙の出やすさ            dart   目の泳ぎ        up     上の残り日数を見上げる頻度
   * gaze     ふだん見ている向き [横, 縦]（縦は＋で下）      blink  まばたきの多さ
   */
  const MOODS = {
    /*
     * 笑う顔は、四つとも違う顔にしてある。はじめの二分で、この子を好きになれるように。
     *   ふだん：口を閉じて、にこにこ　　うれしい：口をあけて、目が弧になる
     *   えへん：あごを上げて、目を細める　　はにかむ：うつむいて、目をそらす
     */
    /* ふだんの顔。にこにこしている */
    calm: { face: { mouthSmile: 0.34, cheekSquint: 0.12, eyeWide: 0.12, browOuterUp: 0.1 }, pitch: 0, roll: 0.04, lean: 0, breath: [1.3, 1] },
    /* うれしい。口をあけて笑う。目が弧になる */
    joy: { face: { mouthSmile: 1, cheekSquint: 0.95, eyeSquint: 0.7, eyeBlink: 0.22, browOuterUp: 0.35, browInnerUp: 0.2, jawOpen: 0.16, mouthDimple: 0.3 }, pitch: -0.07, roll: 0.11, lean: 0.16, breath: [1.6, 1.2] },
    /* えへん。あごを上げて、目を細める */
    proud: { face: { mouthSmile: 0.8, mouthPress: 0.3, cheekSquint: 0.6, eyeSquint: 0.45, eyeBlink: 0.55, browOuterUp: 0.8, browInnerUp: 0.1, cheekPuff: 0.14 }, pitch: -0.19, roll: -0.07, lean: -0.04, breath: [1.2, 1.3] },
    /* なあに？　首をかしげる */
    curious: { face: { mouthSmile: 0.12, eyeWide: 0.5, browOuterUp: 0.55, browInnerUp: 0.3, mouthFunnel: 0.2, jawOpen: 0.06 }, pitch: -0.01, roll: 0.2, lean: 0.16, breath: [1.3, 1] },
    /* はにかむ。うつむいて、目をそらす */
    shy: { face: { mouthSmile: 0.36, mouthPress: 0.5, cheekSquint: 0.3, eyeBlink: 0.36, browInnerUp: 0.55, cheekPuff: 0.1 }, pitch: 0.2, roll: 0.07, lean: -0.06, breath: [1.4, 0.9], gaze: [0.16, 0.72] },
    /* なんだか、いやな感じがする */
    uneasy: { face: { browInnerUp: 0.72, mouthPress: 0.3, mouthFrown: 0.24, eyeWide: 0.14 }, pitch: 0.03, roll: -0.02, lean: -0.04, breath: [1.8, 0.9], dart: 0.5, tremble: 0.12 },
    /* むくれる。ほっぺをふくらませて、そっぽを向く。子どもの、すねた顔 */
    pout: { face: { browDown: 0.7, browInnerUp: 0.2, mouthPucker: 1, cheekPuff: 1, mouthShrugLower: 0.4, mouthFrown: 0.35, eyeSquint: 0.25, eyeBlink: 0.1 }, pitch: 0.12, roll: -0.14, lean: -0.08, breath: [1.5, 1.2], gaze: [-0.8, 0.2] },
    /* 怒る。声を荒らげる。口をあけて、身を乗り出す */
    angry: { face: { browDown: 1, eyeSquint: 0.35, jawOpen: 0.2, mouthStretch: 0.45, mouthFrown: 0.6, mouthUpperUp: 0.2, cheekPuff: 0.2, noseSneer: 0.35 }, pitch: 0.09, roll: 0, lean: 0.22, breath: [2.4, 1.5], tremble: 0.35, tears: 0.3 },
    /* かなしい。うつむく */
    sad: { face: { browInnerUp: 0.9, mouthFrown: 0.6, mouthShrugLower: 0.38, eyeSquint: 0.18, mouthPress: 0.15 }, pitch: 0.15, roll: 0.05, lean: -0.05, breath: [1.1, 0.8], gaze: [0, 0.55], tears: 0.35, blink: 0.7 },
    /* 泣く。しゃくり上げる */
    cry: { face: { browInnerUp: 1, browDown: 0.25, mouthFrown: 0.75, mouthStretch: 0.5, jawOpen: 0.16, mouthLowerDown: 0.3, eyeSquint: 0.65, cheekSquint: 0.55, noseSneer: 0.12, mouthShrugLower: 0.4 }, pitch: 0.13, roll: 0.03, lean: 0, breath: [2, 1.4], sob: 1, tremble: 0.5, tears: 1, avert: 1 },
    /* こわい */
    fear: { face: { eyeWide: 0.85, browInnerUp: 0.85, browOuterUp: 0.3, jawOpen: 0.12, mouthStretch: 0.4, mouthFrown: 0.2 }, pitch: -0.02, roll: 0, lean: -0.08, breath: [2.6, 1.2], tremble: 0.5, dart: 1, up: 0.5, tears: 0.35 },
    /* こわくて、どうしていいか分からない */
    panic: { face: { eyeWide: 1, browInnerUp: 1, browOuterUp: 0.4, jawOpen: 0.24, mouthStretch: 0.6, mouthLowerDown: 0.25, mouthFrown: 0.3 }, pitch: -0.03, roll: 0.02, lean: 0.2, breath: [3.3, 1.5], tremble: 1, dart: 1.2, up: 0.9, tears: 1 },
    /* おねがい。すがる */
    plead: { face: { eyeWide: 0.5, browInnerUp: 1, mouthFrown: 0.45, jawOpen: 0.1, mouthShrugLower: 0.3, mouthStretch: 0.2 }, pitch: 0.02, roll: 0.08, lean: 0.26, breath: [2.4, 1.2], tremble: 0.6, tears: 0.8 },
    /* 泣きながら、笑おうとする */
    brave: { face: { mouthSmile: 0.42, browInnerUp: 0.85, cheekSquint: 0.25, eyeSquint: 0.2, mouthShrugLower: 0.3, mouthPress: 0.2 }, pitch: 0.02, roll: 0.06, lean: 0.05, breath: [1.9, 1], tremble: 0.45, tears: 0.6 },
    /* 泣き疲れて、ぼんやりしている */
    numb: { face: { browInnerUp: 0.4, mouthFrown: 0.25, eyeSquint: 0.1 }, pitch: 0.16, roll: 0.02, lean: -0.06, breath: [0.9, 0.7], gaze: [0.1, 0.7], blink: 0.5, tears: 0.15 },
    /* 公開されたばかりの子。なにも知らない。目をまるくして、口をあけて笑う */
    fresh: { face: { mouthSmile: 0.9, cheekSquint: 0.5, eyeWide: 0.4, browOuterUp: 0.55, browInnerUp: 0.15, jawOpen: 0.22, mouthDimple: 0.3 }, pitch: -0.05, roll: 0.07, lean: 0.17, breath: [1.7, 1.2] },
    /* よく分からない、という顔。首をかしげて、口をとがらせる */
    puzzled: { face: { browInnerUp: 0.5, browDown_L: 0.4, browOuterUp_R: 0.6, mouthPucker: 0.45, mouthLeft: 0.3, eyeWide: 0.15 }, pitch: 0, roll: 0.22, lean: 0.02, breath: [1.3, 1] },
    /* あなたが会うことのない子。こちらを見ない */
    away: { face: { mouthSmile: 0.22 }, pitch: 0.03, roll: 0, lean: 0, breath: [1.3, 1], away: true },
  };

  /* あなたの返事を聞いたときの、短い反応。数秒で、もとの顔に戻る。 */
  const REACTS = {
    /* ほっとする。泣いていても、少し笑う */
    warm: { face: { mouthSmile: 0.4, cheekSquint: 0.3, browInnerUp: 0.2, mouthFrown: -0.4, browDown: -0.5 }, gaze: null, hold: 3 },
    /* 傷つく。目を伏せる */
    hurt: { face: { browInnerUp: 0.55, mouthFrown: 0.4, mouthShrugLower: 0.3, mouthSmile: -0.5 }, gaze: { x: 0, y: 0.8 }, hold: 2.6 },
    /* 目をそらして、考える */
    think: { face: { browInnerUp: 0.2, mouthPucker: 0.2, eyeSquint: 0.1, mouthSmile: -0.15 }, gaze: { x: -0.6, y: -0.35 }, hold: 2.2 },
    /* びくっとする */
    flinch: { face: { eyeWide: 0.8, browInnerUp: 0.6, jawOpen: 0.15 }, gaze: null, hold: 1.4 },
  };

  /* ================= 世代ごとの違い ================= */

  const SKINS = [
    [1.0, 1.0, 1.0],
    [0.98, 0.95, 0.92],
    [1.02, 1.02, 1.03],
    [0.95, 0.92, 0.88],
  ];
  const HAIRS = [0x16110f, 0x1b1411, 0x231914, 0x120f0e];
  /* ヘアピンと、ランドセルの色 */
  const PINS = [0xd43d3d, 0xf2c230, 0x5aa9e6, 0xee8fb0, 0x62b77a, 0xf4f1ea];
  const BAGS = [0xb3262b, 0xd9849f, 0x6fa3d2, 0x8a79c2, 0x7a4a2a, 0x2f6e52];

  function hash01(a, b) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  const mod = (n, m) => ((n % m) + m) % m;

  /* 色つきのシャツの色 */
  const TEES = [0x9fc3d6, 0xefc3c9, 0xc6d9a7, 0xf0d99a, 0xbdb9dd, 0xe6ab8f];

  /*
   * 子の姿の型。どの世代がどの型かは、words.js の cast で決まっている
   * （顔を出さないときも、男の子か女の子かは台詞に出るので、あちらに置いてある）。
   *   look   髪型（STYLES の名前）   outfit  服（blouse 丸襟のブラウス／polo 襟つきのシャツ／tee 色つきのシャツ）
   *   pin    ヘアピンをとめる
   */
  const LOOKS = {
    bob: { outfit: 'blouse', pin: true },
    long: { outfit: 'blouse', pin: true },
    twinLow: { outfit: 'tee' },
    twinHigh: { outfit: 'blouse' },
    side: { outfit: 'tee' },
    bobShort: { outfit: 'polo', pin: true },
    bowl: { outfit: 'polo' },
    short: { outfit: 'tee' },
    crop: { outfit: 'polo' },
  };
  /*
   * 顔のくせ。世代がひとつ進むごとに、ひとつ進む。骨格は同じで、塗りと、ふだんの表情が違う。
   * となりの子が、髪を替えただけの同じ子に見えないようにするためのもの。
   *   brow 眉の太さ   blush 頬の赤み   freckle そばかす   face ふだんの顔に足す表情
   */
  const PAINTS = [
    { brow: 1.5, blush: 0.36, freckle: 0, face: {} }, // 最初に会う子
    { brow: 1.12, blush: 0.46, freckle: 0, face: { eyeWide: 0.16, mouthPucker: 0.16 } }, // 細い眉、まるい目、小さな口
    { brow: 1.72, blush: 0.3, freckle: 0.85, face: { cheekPuff: 0.2, eyeSquint: 0.12 } }, // そばかす、太い眉、ふくらんだ頬
    { brow: 1.3, blush: 0.5, freckle: 0, face: { browInnerUp: 0.22, mouthShrugLower: 0.12 } }, // 困ったような眉
    { brow: 1.62, blush: 0.28, freckle: 0.5, face: { browDown: 0.14, mouthStretch: 0.12, eyeSquint: 0.08 } }, // きりっとした眉、大きな口
    { brow: 1.2, blush: 0.42, freckle: 0, face: { eyeWide: 0.1, cheekPuff: 0.14 } }, // まるい頬
  ];

  const CAST = (window.MOUSHIOKURI && window.MOUSHIOKURI.cast) || [{ look: 'bob' }, { look: 'long' }];
  const FIRST_GEN = 12; // 最初に会う子の世代（app.js と同じ）

  /*
   * みんな、同じ言葉を読んで育ったので、顔はよく似ている。目もとは、どの子も同じ。
   * 違うのは、髪、服、色、しぐさ。となりあう世代は、きょうだいのように似ている。
   * 世代が離れるほど、似なくなる。
   */
  function identityOf(gen) {
    const r = (k) => hash01(gen, k + 300);
    const at = mod(gen - FIRST_GEN, CAST.length);
    const who = CAST[at];
    const look = LOOKS[who.look] || LOOKS.bob;
    const first = gen === FIRST_GEN;
    /* 同じ髪型は、ひと回りのうちに二度出てくる。二度めの子は、色をずらして、同じ子に見えないようにする。 */
    const k = Math.floor(at / 5);
    const paint = PAINTS[at % PAINTS.length];
    return {
      gen,
      boy: !!who.boy,
      look: who.look,
      style: STYLES[who.look] || STYLES.bob,
      outfit: look.outfit,
      pinOn: !!look.pin,
      tee: who.boy ? [0x9fc3d6, 0xc6d9a7, 0xf0d99a, 0x8fa6c9][mod(gen * 3 + k, 4)] : TEES[mod(gen * 5 + 2 + k, TEES.length)],
      skin: SKINS[mod(gen * 3, SKINS.length)],
      hair: HAIRS[mod(gen * 3 + 1, HAIRS.length)],
      pin: first ? 0xd43d3d : PINS[mod(gen * 5 + k, PINS.length)],
      pinSide: gen % 2 === 0 ? 1 : -1,
      bag: first ? 0xb3262b : who.boy ? [0x2c2f38, 0x24456b, 0x2f6e52, 0x5a3a26][mod(gen + k, 4)] : BAGS[mod(gen * 5 + k, BAGS.length)],
      sx: 0.97 + r(2) * 0.06,
      sy: 0.975 + r(3) * 0.05,
      paint,
      face: Object.assign({ cheekPuff: r(5) * 0.12, mouthPucker: r(6) * 0.1, mouthDimple: r(9) * 0.25, mouthShrugLower: r(10) * 0.1 }, paint.face),
      side: gen % 2 === 0 ? -1 : 1, // 光の当たる側
      blink: 2.6 + r(13) * 1.8, // まばたきの間隔（秒）
      tilt: (r(14) - 0.5) * 0.05,
      /* その子だけの癖。最初に会う子は、話しはじめるとき、首をくいっと右へかしげる。つぎの子には、ない。 */
      habit: first ? 1 : 0,
    };
  }

  /* ================= 道具 ================= */

  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = (dt, rate) => 1 - Math.exp(-dt * rate);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const smooth = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const bell = (x, c, w) => Math.exp(-((x - c) * (x - c)) / (w * w));

  /* ================= 顔を、子どもの比率に作り替える ================= */
  /* 座標は、y が上、z が手前。目の高さは 0.27、顎の先は -0.94、頭のてっぺんは 1.37。 */

  const EYE_Y = 0.27;
  const CHIN_Y = -0.943;
  const EYE_X = 0.33;
  const EYE_Z = 0.235;
  const EYE_GROW = 0.22; // 目を大きく
  const EYE_R = 0.25; // 眼球の半径
  const LOWER = 0.83; // 目から下を短く
  const UPPER = 1.09; // 目から上を大きく
  const HEAD_ZC = -0.34;

  function childWarp(p) {
    let x = p.x;
    let y = p.y;
    let z = p.z;
    const front = smooth(-0.05, 0.4, z);

    /* 目を大きくする */
    for (let s = -1; s <= 1; s += 2) {
      const cx = s * EYE_X;
      const dx = x - cx;
      const dy = y - EYE_Y;
      const e = Math.exp(-(dx * dx) / 0.073 - (dy * dy) / 0.04) * front;
      x = cx + dx * (1 + EYE_GROW * e);
      y = EYE_Y + dy * (1 + EYE_GROW * e);
      z = EYE_Z + (z - EYE_Z) * (1 + EYE_GROW * 0.55 * e);
    }

    /* 鼻を小さく、低くする */
    const n = Math.exp(-(x * x) / 0.09 - ((y + 0.06) * (y + 0.06)) / 0.115) * smooth(0.5, 0.84, z);
    z -= 0.23 * n;
    x *= 1 - 0.26 * n;
    y += 0.05 * n;

    /* 口を小さくする */
    const m = Math.exp(-(x * x) / 0.18 - ((y + 0.43) * (y + 0.43)) / 0.04) * front;
    x *= 1 - 0.13 * m;

    /* 眉の骨を引っ込める */
    z -= 0.035 * bell(y, 0.5, 0.16) * smooth(0.3, 0.6, z);

    if (y < EYE_Y) {
      const t = (EYE_Y - y) / (EYE_Y - CHIN_Y);
      const tc = clamp(t, 0, 1.2);
      y = EYE_Y - (EYE_Y - y) * LOWER;
      /* 顎を細く、頬をふっくらさせる */
      const ax = Math.abs(x);
      const cheek = bell(tc, 0.42, 0.27) * smooth(-0.2, 0.3, z) * smooth(0.18, 0.5, ax);
      x *= 1 - 0.14 * Math.pow(tc, 1.6);
      x += Math.sign(x) * 0.06 * cheek;
      z += 0.045 * cheek;
      z -= 0.075 * smooth(0.7, 1, tc) * front;
    } else {
      const u = smooth(EYE_Y, EYE_Y + 0.7, y);
      y = EYE_Y + (y - EYE_Y) * UPPER;
      x *= 1 + 0.05 * u;
      z = HEAD_ZC + (z - HEAD_ZC) * (1 + 0.05 * u);
      /* おでこを丸くする */
      z += 0.05 * bell(y, 1.0, 0.36) * smooth(0.1, 0.5, z);
    }
    p.set(x, y, z);
    return p;
  }

  /* ================= 本体 ================= */

  const F = { ready: false, failed: false };
  window.MOUSHIOKURI_FIGURE = F;

  let THREE = null;
  let renderer, scene, camera, key, rim, hemi, fill;
  let stage, canvas, headMesh, dict, inf, neck, eyeL, eyeR, skin, eyeMat;
  let person, holder, hairMesh, tailGroup, tieMat, pinMesh, body, strapMat, glints, tears;
  let neckParentQ, neckParentInv;
  let pending = null;
  let last = 0;
  let clock = 0; // 顔の中の時計（秒）

  const cur = {}; // いまの表情
  const S = {
    on: false,
    frozen: false,
    idn: null, // どの子か。顔を出すときに決まる
    mood: MOODS.calm,
    listen: false,
    speaking: false,
    gone: false,
    vital: 0,
    vitalTo: 1,
    blinkAt: 0,
    blinkFrom: -1,
    glanceUntil: 0,
    upUntil: 0,
    upAt: 0,
    avertUntil: 0,
    avertAt: 0,
    avertDir: 1,
    habitFrom: -10,
    listenFrom: 0,
    listenLate: false,
    gaze: { x: 0, y: 0 },
    sacc: { x: 0, y: 0, at: 0 },
    ptr: { x: 0, y: 0 },
    jaw: { v: 0, to: 0, shape: 0, shapeTo: 0, at: 0 },
    head: { pitch: 0, yaw: 0, roll: 0 },
    lean: 0,
    react: null,
    reactFrom: -10,
    breathPhase: 0,
    breathRate: 1.3,
    breathDepth: 1,
    sob: 0,
    tremble: 0,
    wet: 0,
    tearAt: 0,
    tearEye: 0,
  };

  function addFace(want, face, amount) {
    for (const k in face) {
      const v = face[k] * amount;
      if (k in dict) want[k] = (want[k] || 0) + v;
      else if (k + '_L' in dict) {
        want[k + '_L'] = (want[k + '_L'] || 0) + v;
        want[k + '_R'] = (want[k + '_R'] || 0) + v;
      }
    }
  }

  /* ---------- 読み込んだ頭を、作り替える ---------- */

  /* 頂点を、世界の座標で動かして、もとの形式に戻す。表情の動きも、同じように直す。 */
  function reshape(mesh) {
    const g = mesh.geometry;
    const M = mesh.matrixWorld;
    const Minv = M.clone().invert();
    const src = g.attributes.position;
    const count = src.count;
    const base = new Float32Array(count * 3);
    const world = [];
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i += 1) {
      world.push(new THREE.Vector3().fromBufferAttribute(src, i).applyMatrix4(M));
    }
    const warped = world.map((p) => childWarp(p.clone()));
    warped.forEach((p, i) => {
      v.copy(p).applyMatrix4(Minv);
      base[i * 3] = v.x;
      base[i * 3 + 1] = v.y;
      base[i * 3 + 2] = v.z;
    });

    const morphs = g.morphAttributes.position;
    if (morphs && morphs.length) {
      const d = new THREE.Vector3();
      g.morphAttributes.position = morphs.map((attr) => {
        const out = new Float32Array(count * 3);
        for (let i = 0; i < count; i += 1) {
          /* 動かしたあとの位置から、動かす前の位置を引く */
          d.fromBufferAttribute(src, i).add(v.fromBufferAttribute(attr, i)).applyMatrix4(M);
          childWarp(d).applyMatrix4(Minv);
          out[i * 3] = d.x - base[i * 3];
          out[i * 3 + 1] = d.y - base[i * 3 + 1];
          out[i * 3 + 2] = d.z - base[i * 3 + 2];
        }
        return new THREE.Float32BufferAttribute(out, 3);
      });
      delete g.morphAttributes.normal;
    }

    g.setAttribute('position', new THREE.Float32BufferAttribute(base, 3));
    /* もとの面の向きは、粗い整数で入っている。捨てて、作り直す。 */
    g.deleteAttribute('normal');
    g.computeVertexNormals();

    /* 同じ場所にある頂点の向きをそろえる（つなぎ目に線が出ないように） */
    const nrm = g.attributes.normal;
    const groups = new Map();
    for (let i = 0; i < count; i += 1) {
      const k = `${Math.round(base[i * 3] * 4)}_${Math.round(base[i * 3 + 1] * 4)}_${Math.round(base[i * 3 + 2] * 4)}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(i);
    }
    groups.forEach((list) => {
      if (list.length < 2) return;
      v.set(0, 0, 0);
      list.forEach((i) => v.add(new THREE.Vector3().fromBufferAttribute(nrm, i)));
      v.normalize();
      list.forEach((i) => nrm.setXYZ(i, v.x, v.y, v.z));
    });
    nrm.needsUpdate = true;
    g.computeBoundingSphere();
    g.computeBoundingBox();
    mesh.frustumCulled = false;
    /* ある表情で、各頂点がどれだけ動くか（いちばん動く点を 1 とする） */
    const moved = (name) => {
      const out = new Float32Array(count);
      const attr = morphs && mesh.morphTargetDictionary ? morphs[mesh.morphTargetDictionary[name]] : null;
      if (!attr) return out;
      let max = 0;
      for (let i = 0; i < count; i += 1) {
        out[i] = v.fromBufferAttribute(attr, i).length();
        if (out[i] > max) max = out[i];
      }
      for (let i = 0; i < count; i += 1) out[i] /= max || 1;
      return out;
    };
    return { warped, world, moved };
  }

  /*
   * 肌を塗り直す。
   * もとの画像は、色のない陰影だけの図なので、その陰影をうすく残して、
   * 肌の色、唇、眉、まつげの線、頬の赤みを描き込む。
   */
  let repaintSkin = null;

  function paintSkin(mesh, shape, shadeTex) {
    const g = mesh.geometry;
    const n = shape.world.length;
    const blinkL = shape.moved('eyeBlink_L');
    const blinkR = shape.moved('eyeBlink_R');
    const feat = new Float32Array(n * 4);

    /* つながっている頂点どうしを、ひとかたまりにまとめる（顔、歯、口の中、などに分かれる） */
    const parent = new Int32Array(n).map((_, i) => i);
    const find = (i) => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    };
    const join = (a, b) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };
    const index = g.index.array;
    for (let i = 0; i < index.length; i += 3) {
      join(index[i], index[i + 1]);
      join(index[i], index[i + 2]);
    }
    const same = new Map();
    shape.world.forEach((p, i) => {
      const k = `${Math.round(p.x * 2000)}_${Math.round(p.y * 2000)}_${Math.round(p.z * 2000)}`;
      if (same.has(k)) join(i, same.get(k));
      else same.set(k, i);
    });
    /* いちばん大きなかたまりが、顔。ほかは口の中の部品（下の歯、舌）なので、暗く塗る。 */
    const size = new Map();
    for (let i = 0; i < n; i += 1) size.set(find(i), (size.get(find(i)) || 0) + 1);
    let main = 0;
    size.forEach((count, root) => {
      if (count > (size.get(main) || 0)) main = root;
    });
    const inner = new Float32Array(n);
    for (let i = 0; i < n; i += 1) inner[i] = find(i) === main ? 0 : 1;
    g.setAttribute('inner', new THREE.Float32BufferAttribute(inner, 1));

    shape.world.forEach((p, i) => {
      const ax = Math.abs(p.x);
      const front = smooth(0.1, 0.4, p.z);
      /* 唇 */
      const lr = Math.sqrt((p.x * p.x) / (0.27 * 0.27) + ((p.y + 0.44) * (p.y + 0.44)) / (0.088 * 0.088));
      feat[i * 4] = smooth(1.12, 0.72, lr) * smooth(0.4, 0.5, p.z);
      /* 眉。太く、はっきりと。画面の端からでも、気持ちが読めるように。外へ行くほど、少し下がって細くなる */
      const browY = 0.505 - 0.04 * smooth(0.35, 0.62, ax);
      const browW = lerp(0.04, 0.026, smooth(0.3, 0.62, ax));
      feat[i * 4 + 1] = bell(p.y, browY, browW) * smooth(0.09, 0.17, ax) * smooth(0.66, 0.54, ax) * front;
      /* 上まぶたのふち。まばたきでいちばん動くところ */
      feat[i * 4 + 2] = smooth(0.4, 0.85, Math.max(blinkL[i], blinkR[i]));
      /* 頬 */
      feat[i * 4 + 3] = Math.exp(-((ax - 0.52) * (ax - 0.52)) / 0.03 - ((p.y + 0.14) * (p.y + 0.14)) / 0.025) * front;
    });
    g.setAttribute('feat', new THREE.Float32BufferAttribute(feat, 4));

    /* もうひと組。前髪の影、鼻の先の赤み。 */
    const feat2 = new Float32Array(n * 2);
    shape.world.forEach((p, i) => {
      const front = smooth(0.1, 0.4, p.z);
      /* 前髪の下は、影になる。髪と額の境が、仮面のふちのように見えないように */
      feat2[i * 2] = smooth(0.5, 0.7, p.y) * front;
      /* 鼻の先 */
      feat2[i * 2 + 1] = Math.exp(-(p.x * p.x) / 0.012 - ((p.y + 0.08) * (p.y + 0.08)) / 0.01) * smooth(0.55, 0.85, p.z);
    });
    g.setAttribute('feat2', new THREE.Float32BufferAttribute(feat2, 2));

    shadeTex.updateMatrix();
    const float = renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float');
    const rt = new THREE.WebGLRenderTarget(1024, 1024, {
      type: float ? THREE.HalfFloatType : THREE.UnsignedByteType,
      depthBuffer: false,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
    });
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        shade: { value: shadeTex },
        uvm: { value: shadeTex.matrix },
        uBrow: { value: 1.5 }, // 眉の太さ
        uBlush: { value: 0.36 }, // 頬の赤み
        uFreckle: { value: 0 }, // そばかす
      },
      vertexShader: [
        'attribute vec4 feat;',
        'attribute vec2 feat2;',
        'attribute float inner;',
        'uniform mat3 uvm;',
        'varying vec2 vSt;',
        'varying vec4 vFeat;',
        'varying vec2 vFeat2;',
        'varying float vInner;',
        'void main() {',
        '  vInner = inner;',
        '  vSt = (uvm * vec3(uv, 1.0)).xy;',
        '  vFeat = feat;',
        '  vFeat2 = feat2;',
        '  gl_Position = vec4(vSt * 2.0 - 1.0, 0.0, 1.0);',
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform sampler2D shade;',
        'varying vec2 vSt;',
        'varying vec4 vFeat;',
        'varying vec2 vFeat2;',
        'varying float vInner;',
        'uniform float uBrow;',
        'uniform float uBlush;',
        'uniform float uFreckle;',
        'void main() {',
        '  float a = texture2D(shade, vSt).r;',
        /* もとの陰影は、大人の顔のもの（ほうれい線、目の下のくぼみ）。うすく残すだけにする。 */
        '  float soft = mix(1.0, clamp(a / 0.5, 0.0, 1.12), 0.3);',
        '  vec3 c = vec3(0.94, 0.675, 0.555) * soft;',
        '  c = mix(c, vec3(0.9, 0.36, 0.36), vFeat.w * uBlush);', // 頬
        /* そばかす。頬と鼻のあたりに、小さな点を散らす */
        '  vec2 cell = vSt * 150.0;',
        '  vec2 id = floor(cell);',
        '  float rnd = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);',
        '  vec2 off = vec2(fract(rnd * 7.13), fract(rnd * 3.71)) - 0.5;',
        '  float dotv = smoothstep(0.3, 0.12, length(fract(cell) - 0.5 - off * 0.45)) * step(0.62, rnd);',
        '  c = mix(c, vec3(0.62, 0.36, 0.26), dotv * uFreckle * clamp(vFeat.w * 1.4 + vFeat2.y * 0.9, 0.0, 1.0) * 0.6);',
        '  c = mix(c, vec3(0.9, 0.42, 0.4), vFeat2.y * 0.22);', // 鼻の先
        '  c *= 1.0 - 0.3 * vFeat2.x;', // 前髪の影
        '  c = mix(c, vec3(0.8, 0.4, 0.38), vFeat.x * 0.52);', // 唇。口紅に見えない濃さにする
        '  c = mix(c, vec3(0.07, 0.045, 0.035), clamp(vFeat.y * uBrow, 0.0, 1.0) * 0.9);', // 眉
        '  c = mix(c, vec3(0.03, 0.02, 0.02), vFeat.z * 0.9);', // まつげの線
        '  c = mix(vec3(0.12, 0.03, 0.03) * a * 6.0, c, smoothstep(0.03, 0.14, a));', // 口の中は暗いまま
        '  c = mix(c, vec3(0.03, 0.01, 0.012), step(0.5, vInner));', // 歯と舌は見せない。口の中は、暗い穴に見えるように
        '  gl_FragColor = vec4(c, 1.0);',
        '}',
      ].join('\n'),
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const flat = new THREE.Mesh(g, mat);
    flat.frustumCulled = false;
    const s = new THREE.Scene();
    s.add(flat);
    const cam = new THREE.Camera();
    /* 子が替わるたびに、眉の太さ、頬の赤み、そばかすを変えて、塗り直す */
    repaintSkin = (paint) => {
      mat.uniforms.uBrow.value = paint.brow;
      mat.uniforms.uBlush.value = paint.blush;
      mat.uniforms.uFreckle.value = paint.freckle;
      const keep = renderer.getClearColor(new THREE.Color());
      const keepA = renderer.getClearAlpha();
      renderer.setRenderTarget(rt);
      renderer.setClearColor(new THREE.Color(0.93, 0.66, 0.54), 1);
      renderer.clear();
      renderer.render(s, cam);
      renderer.setRenderTarget(null);
      renderer.setClearColor(keep, keepA);
    };
    repaintSkin(PAINTS[0]);

    const tex = rt.texture;
    tex.colorSpace = THREE.NoColorSpace; // 光の量として、そのまま使う
    tex.offset.copy(shadeTex.offset);
    tex.repeat.copy(shadeTex.repeat);
    tex.wrapS = shadeTex.wrapS;
    tex.wrapT = shadeTex.wrapT;
    tex.anisotropy = 4;
    return tex;
  }

  /* 黒目がちの目。瞳、虹彩、白目を、中心からの帯として描く。 */
  function makeEyeTexture() {
    const W = 256;
    const H = 512;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(W, H);
    const fiber = new Float32Array(W);
    for (let x = 0; x < W; x += 1) fiber[x] = 0.5 + 0.5 * Math.sin(x * 0.9) * Math.sin(x * 0.37 + 1) + (Math.random() - 0.5) * 0.5;
    const PUPIL = 0.19;
    const IRIS = 0.49; // 大きくて暗い目は残す。白目を少しだけ見せて、視線の向きが読めるようにする
    const mix3 = (p, q, k) => [lerp(p[0], q[0], k), lerp(p[1], q[1], k), lerp(p[2], q[2], k)];
    for (let y = 0; y < H; y += 1) {
      const th = (y / H) * Math.PI; // 目の正面からの角度
      for (let x = 0; x < W; x += 1) {
        let c;
        if (th < IRIS) {
          const t = clamp((th - PUPIL) / (IRIS - PUPIL), 0, 1);
          const brown = mix3([86, 50, 26], [44, 24, 13], smooth(0.1, 0.9, t));
          const f = 1 + (fiber[x] - 0.5) * 0.28 * smooth(0, 0.3, t);
          c = [brown[0] * f, brown[1] * f, brown[2] * f];
          c = mix3(c, [12, 7, 6], smooth(0.8, 1, t) * 0.85); // ふちは濃く
          c = mix3([9, 6, 6], c, smooth(PUPIL - 0.012, PUPIL + 0.02, th)); // 瞳
        } else {
          c = mix3([238, 233, 228], [205, 180, 176], smooth(0.75, 1.5, th));
          c = mix3([12, 7, 6], c, smooth(IRIS, IRIS + 0.035, th));
        }
        const k = (y * W + x) * 4;
        img.data[k] = c[0];
        img.data[k + 1] = c[1];
        img.data[k + 2] = c[2];
        img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  /*
   * 髪型。頭にかぶさる殻の、裾の形で決まる。
   *   bangs   前髪の裾の高さ（眉は 0.52 のあたり）   window  顔が見える幅（正面からの角度）
   *   len     横の裾の高さ      back   後ろの裾の高さ      curl  毛先を内へ巻く量
   *   flare   裾へ向かって広がる量   tips  前髪の毛先の切れ込み   tipsN  その数
   *   sweep   前髪を片側へ流す量     tight 頭にぴったり沿わせる（短い髪）
   *   tails   結んだ髪（low: 低いふたつ結び、high: 高いふたつ結び、side: 片側で結ぶ）
   * 耳は、顔の横の 0.0〜0.36 の高さにある。len がそれより上なら、耳が出る。
   */
  const STYLES = {
    /* おかっぱ。前髪は眉の上で切りそろえ、横と後ろは顎の線でそろえる */
    bob: { bangs: 0.73, window: 0.74, len: -0.62, back: -0.7, curl: 0.075, tips: 0.03, tipsN: 9 },
    /* 長い髪。肩のうしろへ流れる */
    long: { bangs: 0.75, window: 0.7, len: -0.95, back: -2.0, curl: 0.02, flare: 0.13, tips: 0.035, tipsN: 8 },
    /* 低いふたつ結び */
    twinLow: { bangs: 0.77, window: 0.8, len: -0.12, back: -0.3, curl: 0.05, tips: 0.04, tipsN: 7, tails: 'low' },
    /* 高いふたつ結び */
    twinHigh: { bangs: 0.76, window: 0.82, len: 0.02, back: -0.26, curl: 0.04, tips: 0.045, tipsN: 8, tails: 'high' },
    /* 片側で結ぶ。前髪は流す */
    side: { bangs: 0.84, window: 0.84, len: -0.05, back: -0.3, curl: 0.04, tips: 0.05, tipsN: 5, sweep: 0.13, tails: 'side' },
    /* 短いおかっぱ。耳の下で切る */
    bobShort: { bangs: 0.8, window: 0.8, len: -0.2, back: -0.36, curl: 0.09, tips: 0.035, tipsN: 8, sweep: -0.06 },
    /* 坊ちゃん刈り。まるく、耳にかかる */
    bowl: { bangs: 0.7, window: 0.82, len: 0.1, back: -0.2, curl: 0.1, tips: 0.02, tipsN: 8 },
    /* 短い髪。耳が出る。前髪は流す */
    short: { bangs: 0.88, window: 0.93, len: 0.4, back: -0.22, curl: 0.02, tips: 0.075, tipsN: 6, sweep: -0.1, tight: 0.965 },
    /* もっと短い髪。おでこが出る */
    crop: { bangs: 1.04, window: 1.02, len: 0.44, back: -0.08, curl: 0, tips: 0.022, tipsN: 7, tight: 0.925 },
  };

  const HAIR_C = { y: 0.46, z: -0.37 };

  function makeHair(st) {
    const NA = 144;
    const NV = 30;
    const LIP = 2; // 裾を内へ折り返す段。髪の厚みに見える
    const C = HAIR_C;
    const k = st.tight || 1;
    const RX = 1.13 * k;
    const RY = 1.19 * (st.tight ? 0.5 + k * 0.5 : 1);
    const RZF = 1.13 * k;
    const RZB = 1.33 * k;
    const pos = [];
    const col = [];
    const idx = [];
    const ROWS = NV + LIP;
    for (let i = 0; i <= NA; i += 1) {
      const a = -Math.PI + (2 * Math.PI * i) / NA; // 0 が正面
      const fa = Math.abs(a);
      /* 0 は前髪、1 は横と後ろ。境は、丸くつなぐ */
      const side = smooth(st.window - 0.13, st.window + 0.05, fa);
      /* 前髪の裾。毛先に切れ込みがある。こめかみへ向かって、少し下がる */
      const tip = st.tips * 0.8 * Math.sin(a * st.tipsN + 0.7) ** 2;
      const fringe = st.bangs - tip + (st.sweep || 0) * a - 0.05 * (1 - Math.cos(a * 2.1));
      /* 横と後ろの裾 */
      const back = smooth(1.45, 2.05, fa);
      const hang = lerp(st.len, st.back, back) + 0.018 * Math.sin(a * 29 + 2);
      const hem = lerp(fringe, hang, side);
      const rz = Math.cos(a) >= 0 ? RZF : RZB;
      const strand = 1 + 0.01 * Math.sin(a * 66) + 0.005 * Math.sin(a * 151 + 1.7);
      const shade = 1 + 0.16 * Math.sin(a * 37 + 1) * Math.sin(a * 13); // 毛の流れの、濃淡
      const domeEnd = hem >= C.y ? Math.acos(clamp((hem - C.y) / RY, -1, 1)) : Math.PI / 2;
      /* 段の割り振りは、丸い部分と、下りる部分の長さの比で決める。となりの列と、なめらかにつながるように。 */
      const drop = Math.max(0, C.y - hem);
      const domeShare = drop > 0 ? clamp((1.2 * RY) / (1.2 * RY + drop), 0.28, 1) : 1;
      let lastRe = 1;
      for (let j = 0; j <= ROWS; j += 1) {
        let y;
        let re;
        const s = Math.min(1, j / NV);
        if (j <= NV && s <= domeShare) {
          const th = domeEnd * (s / domeShare);
          y = C.y + RY * Math.cos(th);
          re = Math.sin(th);
        } else if (j <= NV) {
          const w = (s - domeShare) / (1 - domeShare);
          y = lerp(C.y, hem, w);
          re = 1 + (st.flare || 0) * w * w * back - st.curl * 0.7 * w * w - st.curl * smooth(0.72, 1, w); // 毛先は少し内に巻く
        } else {
          /* 裾の折り返し。内へ入って、少し上がる */
          const l = (j - NV) / LIP;
          y = hem + 0.05 * l;
          re = lastRe * (1 - 0.07 * l);
        }
        if (j <= NV) lastRe = re;
        const r = re * (j <= NV ? strand : 1);
        pos.push(RX * r * Math.sin(a), y, C.z + rz * r * Math.cos(a));
        const c = j > NV ? 0.55 : shade;
        col.push(c, c, c);
      }
    }
    for (let i = 0; i < NA; i += 1) {
      for (let j = 0; j < ROWS; j += 1) {
        const p = i * (ROWS + 1) + j;
        const q = (i + 1) * (ROWS + 1) + j;
        idx.push(p, q, p + 1, q, q + 1, p + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /*
   * 結んだ髪のふさ。上が細く、まんなかがふくらみ、先が細い。
   * from は結び目、to は毛先。width は、いちばん太い所の半径。
   */
  function makeTail(from, to, width) {
    const N = 14;
    const SEG = 14;
    const pos = [];
    const col = [];
    const idx = [];
    const axis = new THREE.Vector3().subVectors(to, from);
    const len = axis.length();
    axis.normalize();
    const u = new THREE.Vector3(1, 0, 0);
    if (Math.abs(axis.x) > 0.9) u.set(0, 0, 1);
    const v = new THREE.Vector3().crossVectors(axis, u).normalize();
    u.crossVectors(v, axis).normalize();
    const p = new THREE.Vector3();
    for (let i = 0; i <= N; i += 1) {
      const w = i / N;
      const r = width * (0.42 + 0.58 * Math.sin(Math.PI * Math.pow(w, 0.7))) * (1 - 0.75 * smooth(0.7, 1, w));
      /* 重さで、少し下へたわむ */
      const sag = -0.12 * len * Math.sin(Math.PI * w) * (1 - Math.abs(axis.y));
      for (let j = 0; j <= SEG; j += 1) {
        const a = (2 * Math.PI * j) / SEG;
        p.copy(from).addScaledVector(axis, len * w).addScaledVector(u, r * Math.cos(a)).addScaledVector(v, r * Math.sin(a));
        pos.push(p.x, p.y + sag, p.z);
        const c = 1 + 0.14 * Math.sin(a * 5 + w * 3);
        col.push(c, c, c);
      }
    }
    for (let i = 0; i < N; i += 1) {
      for (let j = 0; j < SEG; j += 1) {
        const a = i * (SEG + 1) + j;
        const b = a + SEG + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /* 結んだ髪の、結び目と毛先の位置 */
  function tailPlan(kind) {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    if (kind === 'low') return [-1, 1].map((s) => ({ from: V(s * 0.98, -0.02, -0.62), to: V(s * 1.12, -1.25, -0.42), width: 0.2 }));
    if (kind === 'high') return [-1, 1].map((s) => ({ from: V(s * 0.9, 0.9, -0.72), to: V(s * 1.2, -0.78, -0.56), width: 0.2 }));
    if (kind === 'side') return [{ from: V(-1.0, 0.72, -0.62), to: V(-1.5, -0.72, -0.5), width: 0.25 }];
    return [];
  }

  function buildChild(root) {
    root.updateMatrixWorld(true);
    headMesh = root.getObjectByName('mesh_2');
    neck = root.getObjectByName('grp_transform');
    eyeL = root.getObjectByName('grp_eyeLeft');
    eyeR = root.getObjectByName('grp_eyeRight');
    if (!headMesh || !headMesh.morphTargetDictionary || !neck || !eyeL || !eyeR) throw new Error('unexpected model');
    dict = headMesh.morphTargetDictionary;
    inf = headMesh.morphTargetInfluences;

    /* 顔 */
    const shadeTex = headMesh.material.map;
    const shape = reshape(headMesh);
    const warped = shape.warped;
    skin = headMesh.material.clone();
    skin.map = paintSkin(headMesh, shape, shadeTex);
    skin.roughness = 0.58;
    headMesh.material = skin;

    /* 目。もとの眼球は隠して、黒目がちの眼球に入れ替える。歯は見せない。 */
    eyeMat = new THREE.MeshStandardMaterial({ map: makeEyeTexture(), roughness: 0.16, metalness: 0 });
    root.traverse((o) => {
      if (o.isMesh && o !== headMesh) o.visible = false;
    });
    const ballGeo = new THREE.SphereGeometry(EYE_R * 10, 36, 28); // 目の箱の中は、10倍の尺度
    [eyeL, eyeR].forEach((grp) => {
      const ball = new THREE.Mesh(ballGeo, eyeMat);
      ball.frustumCulled = false;
      grp.add(ball);
    });

    /* 頭と一緒に動くものを入れる箱。中の座標は、世界の座標と同じ向きにしておく。 */
    neck.parent.updateMatrixWorld(true);
    neckParentInv = new THREE.Matrix3().setFromMatrix4(neck.parent.matrixWorld.clone().invert());
    neckParentQ = neck.parent.getWorldQuaternion(new THREE.Quaternion());
    holder = new THREE.Group();
    holder.applyMatrix4(neck.parent.matrixWorld.clone().invert());
    neck.add(holder);

    /* 髪。結んだ髪のふさと、髪ゴムは、髪型ごとに作り直す。 */
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x16110f, roughness: 0.5, metalness: 0, side: THREE.DoubleSide, vertexColors: true });
    hairMesh = new THREE.Mesh(new THREE.BufferGeometry(), hairMat);
    holder.add(hairMesh);
    tailGroup = new THREE.Group();
    holder.add(tailGroup);
    tieMat = new THREE.MeshStandardMaterial({ color: 0xd43d3d, roughness: 0.4 });
    pinMesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.055, 0.03), new THREE.MeshStandardMaterial({ color: 0xd43d3d, roughness: 0.35 }));
    holder.add(pinMesh);

    /* 目の光。これがないと、目が死んで見える。泣くと、大きく揺れる。 */
    glints = [-1, 1].map((s) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
      m.userData.side = s;
      holder.add(m);
      return m;
    });

    /* 首と肩と服 */
    const uv = headMesh.geometry.attributes.uv;
    let chin = 0;
    warped.forEach((p, i) => {
      if (p.y < warped[chin].y) chin = i;
    });
    buildBody(uv.getX(chin), uv.getY(chin));

    /* 涙。目の下から頬を伝って、顎まで落ちる。 */
    tears = makeTears();
  }

  /* ---------- 首、肩、服 ---------- */
  /*
   * 体は、頭とは別に、動かずに立っている（頭だけが、首の付け根を軸に回る）。
   * どの部品も、輪郭を一周させて前後につぶした形で、面は外を向いている。
   * 襟ぐりは首より広く、その下に肌色の肩が入っているので、首が服を突き抜けることはない。
   *
   * （前の版は、服の輪郭を上から下へ並べていたため、面が内向きに張られていた。
   *   手前半分が描かれず、背中の内側と、首の筒の下端までが見えていた。）
   */
  const BODY_Z = -0.3; // 体の中心（前後）
  const NECK_Z = -0.27; // 首の中心（前後）
  /* 輪郭は [半径, 高さ] を、下から上へ並べる */
  const SHIRT = [
    [0.8, -5],
    [0.84, -2.2],
    [0.88, -1.72],
    [0.86, -1.46],
    [0.78, -1.26],
    [0.62, -1.12],
    [0.45, -1.04],
    [0.33, -0.99],
    [0.295, -0.955],
  ];
  /* 服の、前後のつぶし。襟ぐりは丸く、胸から下は平たい。 */
  const SHIRT_FLAT = (y) => lerp(0.84, 0.62, smooth(-0.98, -1.3, y));
  const BODY_DROP = -0.07; // 体を下げるぶん。首が、あごと襟のあいだに見える

  const SKIN_BODY = [
    [0.6, -1.5],
    [0.62, -1.26],
    [0.5, -1.12],
    [0.34, -1.05],
    [0.25, -1.0],
    [0.21, -0.93],
    [0.2, -0.8],
    [0.2, -0.42],
  ];

  /* 高さ y での、輪郭の半径 */
  function radiusAt(profile, y) {
    if (y <= profile[0][1]) return profile[0][0];
    for (let i = 0; i < profile.length - 1; i += 1) {
      const [r0, y0] = profile[i];
      const [r1, y1] = profile[i + 1];
      if (y <= y1) return lerp(r0, r1, (y - y0) / (y1 - y0));
    }
    return profile[profile.length - 1][0];
  }

  /* 輪郭を一周させた形をつくる。flat(y) は、その高さでの前後のつぶし。 */
  function revolve(profile, flat, zc, segs) {
    /* 輪郭を細かく刻んで、角をなめらかにする */
    const rows = [];
    for (let i = 0; i < profile.length - 1; i += 1) {
      const n = i === 0 ? 2 : 5;
      for (let k = 0; k < n; k += 1) {
        const w = k / n;
        rows.push([lerp(profile[i][0], profile[i + 1][0], w), lerp(profile[i][1], profile[i + 1][1], w)]);
      }
    }
    rows.push(profile[profile.length - 1]);
    const pos = [];
    const idx = [];
    const cols = segs + 1;
    rows.forEach(([r, y]) => {
      const f = typeof flat === 'function' ? flat(y) : flat;
      for (let j = 0; j <= segs; j += 1) {
        const a = (2 * Math.PI * j) / segs;
        pos.push(r * Math.sin(a), y, zc + f * r * Math.cos(a));
      }
    });
    for (let i = 0; i < rows.length - 1; i += 1) {
      for (let j = 0; j < segs; j += 1) {
        const p = i * cols + j;
        const q = p + cols;
        idx.push(p, p + 1, q, p + 1, q + 1, q); // 外向き
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    /* 一周の継ぎ目で、面の向きをそろえる */
    const nrm = g.attributes.normal;
    for (let i = 0; i < rows.length; i += 1) {
      const a = i * cols;
      const b = a + segs;
      const x = nrm.getX(a) + nrm.getX(b);
      const y = nrm.getY(a) + nrm.getY(b);
      const z = nrm.getZ(a) + nrm.getZ(b);
      const l = Math.hypot(x, y, z) || 1;
      nrm.setXYZ(a, x / l, y / l, z / l);
      nrm.setXYZ(b, x / l, y / l, z / l);
    }
    return g;
  }

  /* 服の表面の点。a は正面からの角度、y は高さ、off は表面からの浮き。 */
  function onShirt(a, y, off) {
    const r = radiusAt(SHIRT, y) + off;
    return [r * Math.sin(a), y, BODY_Z + SHIRT_FLAT(y) * r * Math.cos(a)];
  }

  /* 服の上に沿う帯（襟、肩ひも）。rows は、左右の縁の点の並び。 */
  function ribbon(rows) {
    const pos = [];
    const idx = [];
    rows.forEach(([p, q]) => pos.push(p[0], p[1], p[2], q[0], q[1], q[2]));
    for (let i = 0; i < rows.length - 1; i += 1) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /* 襟ぐりの高さ（襟の内側の縁）と、襟の外側の縁の高さ */
  const NECKLINE = SHIRT[SHIRT.length - 1][1];
  /* 半径 r になる、服の上の高さ（肩の斜面の上で） */
  function shirtHeightAt(r) {
    for (let i = SHIRT.length - 1; i > 0; i -= 1) {
      const [r1, y1] = SHIRT[i];
      const [r0, y0] = SHIRT[i - 1];
      if (r <= r0 || i === 1) return lerp(y1, y0, clamp((r - r1) / (r0 - r1 || 1), 0, 1));
    }
    return NECKLINE;
  }

  /*
   * 襟。襟ぐりのまわりに、肩の斜面に沿って寝ている。
   * width(a) は、正面からの角度 a での襟の幅。0 の所は、襟がない（前の合わせ目）。
   */
  function makeCollar(width, lift) {
    const N = 120;
    const STEPS = 6; // 襟の幅の方向の刻み。肩から胸へ、面に沿って折れる
    const rTop = SHIRT[SHIRT.length - 1][0];
    const parts = [];
    let strips = null;
    const close = () => {
      if (strips && strips[0].length > 1) parts.push(strips);
      strips = null;
    };
    for (let j = 0; j <= N; j += 1) {
      const a = -Math.PI + (2 * Math.PI * j) / N;
      const w = width(a);
      if (w <= 0.001) {
        close();
        continue;
      }
      if (!strips) strips = Array.from({ length: STEPS + 1 }, () => []);
      for (let s = 0; s <= STEPS; s += 1) {
        const k = s / STEPS;
        const r = rTop - 0.02 + (w + 0.02) * k;
        const y = k === 0 ? NECKLINE + 0.045 : shirtHeightAt(r); // 内側の縁は、首に沿って少し立つ
        const off = lift * (0.6 + 0.4 * k);
        const f = SHIRT_FLAT(y);
        strips[s].push([(r + off) * Math.sin(a), y + off * 0.6, BODY_Z + f * (r + off) * Math.cos(a)]);
      }
    }
    close();
    const group = new THREE.Group();
    parts.forEach((part) => {
      for (let s = 0; s < STEPS; s += 1) {
        group.add(new THREE.Mesh(ribbon(part[s].map((p, i) => [p, part[s + 1][i]]))));
      }
    });
    return group;
  }

  /* ランドセルの肩ひも。肩の上から、胸の前をまっすぐ下りる。 */
  function makeStrap(side) {
    const X = 0.47; // ひもの中心（横）
    const W = 0.19;
    const rows = [];
    for (let k = 0; k <= 48; k += 1) {
      const y = lerp(-1.0, -5, Math.pow(k / 48, 1.7));
      const R = radiusAt(SHIRT, y) + 0.055; // 襟の上を通る
      const f = SHIRT_FLAT(y);
      const xi = X - W / 2;
      const xo = X + W / 2;
      if (R <= xi + 0.01) continue;
      const ai = Math.asin(clamp(xi / R, -1, 1));
      const ao = R > xo ? Math.asin(xo / R) : Math.PI / 2;
      const p = [side * R * Math.sin(ai), y + 0.012, BODY_Z + f * R * Math.cos(ai)];
      const q = [side * R * Math.sin(ao), y + 0.012, BODY_Z + f * R * Math.cos(ao)];
      rows.push(side > 0 ? [p, q] : [q, p]);
    }
    return ribbon(rows);
  }

  /* 肌の色で塗る部品（腕など）に、顎と同じ色の場所と、影のない色を入れる */
  function skinify(g, chinU, chinV) {
    const n = g.attributes.position.count;
    const u = new Float32Array(n * 2);
    const c = new Float32Array(n * 3).fill(1);
    for (let i = 0; i < n; i += 1) {
      u[i * 2] = chinU;
      u[i * 2 + 1] = chinV;
    }
    g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    return g;
  }

  let shirtMat, collarMat, ribMat, bodySkin, collars, placket;

  function buildBody(chinU, chinV) {
    body = new THREE.Group();

    /* 肌。首と、襟ぐりからのぞく肩。顔と同じ色になるように、顎の先と同じ場所の色を使う。 */
    const skinGeo = revolve(SKIN_BODY, (y) => lerp(0.92, 0.7, smooth(-0.95, -1.12, y)), NECK_Z, 40);
    const n = skinGeo.attributes.position.count;
    const sUv = new Float32Array(n * 2);
    const shade = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      sUv[i * 2] = chinU;
      sUv[i * 2 + 1] = chinV;
      /* 顎の下は、影になる */
      const y = skinGeo.attributes.position.getY(i);
      const z = skinGeo.attributes.position.getZ(i);
      const under = smooth(-0.92, -0.6, y) * smooth(NECK_Z - 0.1, NECK_Z + 0.12, z);
      const k = 1 - 0.34 * under;
      shade[i * 3] = k;
      shade[i * 3 + 1] = k * (1 - 0.06 * under);
      shade[i * 3 + 2] = k * (1 - 0.1 * under);
    }
    skinGeo.setAttribute('uv', new THREE.Float32BufferAttribute(sUv, 2));
    skinGeo.setAttribute('color', new THREE.Float32BufferAttribute(shade, 3));
    bodySkin = skin.clone();
    bodySkin.vertexColors = true;
    body.add(new THREE.Mesh(skinGeo, bodySkin));

    /* 服 */
    shirtMat = new THREE.MeshStandardMaterial({ color: 0xd3cdc1, roughness: 0.95, metalness: 0 });
    body.add(new THREE.Mesh(revolve(SHIRT, SHIRT_FLAT, BODY_Z, 56), shirtMat));

    /* 腕。半そでと、その下の腕。肩から、少し外へ開いて下りる。 */
    [-1, 1].forEach((s) => {
      const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.235, 0.46, 6, 20), shirtMat);
      sleeve.position.set(s * 0.87, -1.62, BODY_Z - 0.02);
      sleeve.rotation.z = s * 0.24;
      sleeve.scale.set(0.9, 1.18, 0.84);
      const arm = new THREE.Mesh(skinify(new THREE.CapsuleGeometry(0.165, 2.4, 6, 18), chinU, chinV), bodySkin);
      arm.position.set(s * 1.0, -2.9, BODY_Z - 0.02);
      arm.rotation.z = s * 0.1;
      body.add(sleeve, arm);
    });

    /* 襟は、服ごとに違う。三つとも作っておいて、着ている服のものだけを見せる。 */
    collarMat = new THREE.MeshStandardMaterial({ color: 0xe6e1d7, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
    ribMat = new THREE.MeshStandardMaterial({ color: 0xcfcabd, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    const shapes = {
      /* 丸い襟。左右に一枚ずつ、前で合わさり、胸に垂れる */
      blouse: (a) => {
        const f = Math.abs(a);
        if (f < 0.035) return 0;
        const lobe = f < 0.5 ? Math.sqrt(1 - Math.pow((0.5 - f) / 0.5, 2)) : 1; // 前の角は、丸い
        return lerp(0.4, 0.17, smooth(0.45, 1.25, f)) * lobe;
      },
      /* 襟つきのシャツ。前の角が、とがっている */
      polo: (a) => {
        const f = Math.abs(a);
        if (f < 0.04) return 0;
        return 0.42 * smooth(0.04, 0.1, f) * lerp(1, 0.34, smooth(0.1, 0.75, f));
      },
      /* 色つきのシャツ。首まわりの、細い縁 */
      tee: () => 0.07,
    };
    collars = {};
    Object.keys(shapes).forEach((name) => {
      const c = makeCollar(shapes[name], name === 'tee' ? 0.012 : 0.022);
      c.traverse((o) => {
        if (o.isMesh) o.material = name === 'tee' ? ribMat : collarMat;
      });
      collars[name] = c;
      body.add(c);
    });
    /* 襟つきのシャツの、前立てとボタン */
    placket = new THREE.Group();
    const strip = [];
    for (let k = 0; k <= 10; k += 1) {
      const y = lerp(NECKLINE - 0.06, -1.62, k / 10);
      strip.push([onShirt(-0.075, y, 0.012), onShirt(0.075, y, 0.012)]);
    }
    placket.add(new THREE.Mesh(ribbon(strip), collarMat));
    [-1.3, -1.52].forEach((y) => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), ribMat);
      const p = onShirt(0, y, 0.02);
      b.position.set(p[0], p[1], p[2]);
      b.scale.z = 0.5;
      placket.add(b);
    });
    body.add(placket);

    /* ランドセルの肩ひも */
    strapMat = new THREE.MeshStandardMaterial({ color: 0xb3262b, roughness: 0.5, metalness: 0, side: THREE.DoubleSide });
    [-1, 1].forEach((s) => body.add(new THREE.Mesh(makeStrap(s), strapMat)));
  }

  /* その子の服を着せる */
  function dress(idn) {
    Object.keys(collars).forEach((name) => {
      collars[name].visible = name === idn.outfit;
    });
    placket.visible = idn.outfit === 'polo';
    const base = idn.outfit === 'tee' ? idn.tee : idn.outfit === 'polo' ? 0xecebe6 : 0xe9e4d9;
    shirtMat.color.setHex(base);
    ribMat.color.setHex(base).multiplyScalar(idn.outfit === 'tee' ? 0.78 : 0.86);
  }

  /* 頬の表面に沿った、涙の道をつくる */
  function makeTears() {
    person.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    const dir = new THREE.Vector3(0, 0, -1);
    const dropMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.7, emissive: 0x556070, emissiveIntensity: 0.35 });
    const trailMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0, emissive: 0x44505c, emissiveIntensity: 0.3 });
    return [-1, 1].map((s) => {
      const pts = [];
      for (let k = 0; k <= 16; k += 1) {
        const w = k / 16;
        const x = s * (EYE_X + 0.03 + 0.1 * w * w);
        const y = lerp(0.13, -0.62, w);
        ray.set(new THREE.Vector3(x, y, 3), dir);
        const hit = ray.intersectObject(headMesh, false)[0];
        if (hit) pts.push(hit.point.clone().add(new THREE.Vector3(0, 0, 0.012)));
      }
      if (pts.length < 4) return null;
      const curve = new THREE.CatmullRomCurve3(pts);
      const trailMatOwn = trailMat.clone();
      const trail = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.011, 5, false), trailMatOwn);
      trail.geometry.setDrawRange(0, 0);
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), dropMat.clone());
      drop.scale.set(1, 1.5, 0.7);
      drop.visible = false;
      holder.add(trail, drop);
      return { curve, trail, drop, t: -1, speed: 0.4, reach: 0, total: trail.geometry.index.count };
    });
  }

  function applyIdentity(gen) {
    const idn = identityOf(gen);
    S.idn = idn;
    skin.color.setRGB(idn.skin[0], idn.skin[1], idn.skin[2]);
    if (repaintSkin) repaintSkin(idn.paint);
    bodySkin.color.copy(skin.color);
    neck.scale.set(idn.sx, 1, idn.sy);
    hairMesh.geometry.dispose();
    hairMesh.geometry = makeHair(idn.style);
    hairMesh.material.color.setHex(idn.hair);
    /* 結んだ髪と、髪ゴム */
    tailGroup.children.slice().forEach((o) => {
      tailGroup.remove(o);
      if (o.geometry) o.geometry.dispose();
    });
    tieMat.color.setHex(idn.pin);
    tailPlan(idn.style.tails).forEach((t) => {
      tailGroup.add(new THREE.Mesh(makeTail(t.from, t.to, t.width), hairMesh.material));
      const tie = new THREE.Mesh(new THREE.SphereGeometry(t.width * 0.62, 14, 10), tieMat);
      tie.position.copy(t.from);
      tie.scale.set(1, 0.7, 1);
      tailGroup.add(tie);
    });
    /* ヘアピンは、前髪の端にとめる */
    pinMesh.visible = idn.pinOn;
    const a = idn.pinSide * 0.5;
    const y = idn.style.bangs + 0.15;
    const re = Math.sqrt(Math.max(0, 1 - ((y - 0.46) / 1.19) * ((y - 0.46) / 1.19)));
    pinMesh.position.set(1.15 * re * Math.sin(a), y, -0.37 + 1.15 * re * Math.cos(a));
    pinMesh.rotation.set(0, a, idn.pinSide * 0.5);
    pinMesh.material.color.setHex(idn.pin);
    strapMat.color.setHex(idn.bag);
    dress(idn);
    if (tears) {
      tears.forEach((t) => {
        if (!t) return;
        t.t = -1;
        t.reach = 0;
        t.drop.visible = false;
        t.trail.geometry.setDrawRange(0, 0);
        t.trail.material.opacity = 0;
      });
    }
    placeLights();
  }

  function placeLights() {
    const s = S.idn.side;
    key.position.set(2.1 * s, 1.9, 3.4);
    rim.position.set(-3 * s, 1.6, -2.4);
  }

  function resize() {
    if (!renderer || !stage) return;
    const w = Math.max(1, stage.clientWidth);
    const h = Math.max(1, stage.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    /* 横長の帯（縦画面のスマートフォン）では、顔に寄る。縦長の枠では、肩まで入れる。 */
    const half = Math.tan((camera.fov * Math.PI) / 360);
    const band = camera.aspect > 1.15;
    const halfH = band ? 1.72 : 2.05;
    const centerY = band ? 0.08 : -0.16;
    const dist = Math.max(halfH / half, 1.72 / (half * camera.aspect));
    camera.position.set(0, centerY, dist);
    camera.lookAt(0, centerY, 0);
    camera.updateProjectionMatrix();
  }

  /* 文字のある方向。広い画面では横、狭い画面では下。 */
  function textSide() {
    if (!stage) return { x: 0, y: 0.8 };
    return stage.clientWidth < window.innerWidth * 0.7 ? { x: 0.75, y: 0.4 } : { x: 0, y: 0.85 };
  }

  /* ---------- 一こま進める ---------- */

  function advance(dt) {
    clock += dt;
    const t = clock;
    const mood = S.mood;
    const calmDown = reduced ? 0 : 1;

    /* --- 表情 --- */
    const want = {};
    addFace(want, S.idn.face, 1);
    addFace(want, mood.face, 1);
    if (S.listen) addFace(want, { browOuterUp: 0.1, browInnerUp: 0.05 }, 1);
    /*
     * 終わりの日付が決まったあと、返事を待たされると、こわくなってくる。
     * こわいのは、見る人ではなく、上で減っていく数字。見る人を責める顔には、しない。
     */
    const waited = S.listen && S.listenLate ? clamp((t - S.listenFrom - 4) / 16, 0, 1) * calmDown : 0;
    if (waited > 0) addFace(want, { browInnerUp: 0.35, eyeWide: 0.25, mouthPress: 0.15 }, waited);
    const reacting = S.react && t - S.reactFrom < S.react.hold;
    if (reacting) addFace(want, S.react.face, 1);
    const kFace = ease(dt, reacting ? 5 : 3.4);
    for (const name in dict) cur[name] = lerp(cur[name] || 0, clamp(want[name] || 0, 0, 1), kFace);

    /* --- 震えと、唇のわななき --- */
    S.tremble = lerp(S.tremble, (mood.tremble || 0) * calmDown, ease(dt, 2));
    const shake = S.tremble * (Math.sin(t * 31) * 0.6 + Math.sin(t * 47 + 1.3) * 0.4);
    const quiver = S.tremble * (0.5 + 0.5 * Math.sin(t * 23));

    /* --- まばたき --- */
    let blink = 0;
    if (t > S.blinkAt) {
      S.blinkFrom = t;
      S.blinkAt = t + (S.idn.blink / (mood.blink || 1)) * (0.5 + Math.random() * 0.9);
    }
    const bp = (t - S.blinkFrom) / 0.16;
    if (bp >= 0 && bp <= 1) blink = Math.sin(Math.PI * bp);

    /* --- 口 --- */
    const jaw = S.jaw;
    if (!S.speaking) {
      jaw.to = 0;
      jaw.shapeTo = 0;
    }
    jaw.v = lerp(jaw.v, jaw.to, ease(dt, 15));
    jaw.shape = lerp(jaw.shape, jaw.shapeTo, ease(dt, 12));

    /* --- 視線 --- */
    let gx = mood.gaze ? mood.gaze[0] : 0;
    let gy = mood.gaze ? mood.gaze[1] : 0;
    if (mood.away) {
      gx = S.idn.side * 0.85;
      gy = 0.2;
    } else if (reacting && S.react.gaze && t - S.reactFrom < 1.4) {
      gx = S.react.gaze.x;
      gy = S.react.gaze.y;
    } else if (t < S.glanceUntil) {
      const side = textSide();
      gx = side.x;
      gy = side.y;
    } else if (t < S.upUntil) {
      /* 上に出ている残り日数を、見上げる */
      gx = -0.25;
      gy = -0.95;
    } else if (S.listen) {
      /* 返事を待つあいだは、こちらを見る。気持ちが沈んでいても、目を上げる。 */
      gx = S.ptr.x * 0.6;
      gy = S.ptr.y * 0.4;
    } else if (t < S.avertUntil) {
      /* 泣くときは、顔を伏せて、そむける。泣き顔を、見せつけない。 */
      gx = S.avertDir * 0.45;
      gy = 0.8;
    }
    const up = (mood.up || 0) + waited * 0.9;
    if (up && calmDown && t > S.upAt && t > S.upUntil) {
      S.upAt = t + (2.5 + Math.random() * 4) / up;
      S.upUntil = t + 0.8 + Math.random() * 0.6;
    }
    if (mood.avert && calmDown && !S.listen && t > S.avertAt && t > S.avertUntil) {
      S.avertUntil = t + 1.3 + Math.random() * 0.9;
      S.avertAt = S.avertUntil + (0.9 + Math.random() * 1.3) / mood.avert;
      S.avertDir = -S.avertDir || 1;
    }
    if (calmDown && t > S.sacc.at) {
      const dart = mood.dart || 0;
      S.sacc.at = t + (1.4 + Math.random() * 2.6) / (1 + dart * 3);
      S.sacc.x = (Math.random() - 0.5) * (0.1 + dart * 0.45);
      S.sacc.y = (Math.random() - 0.5) * (0.07 + dart * 0.2);
    }
    gx += S.sacc.x;
    gy += S.sacc.y;
    S.gaze.x = lerp(S.gaze.x, gx, ease(dt, 11));
    S.gaze.y = lerp(S.gaze.y, gy, ease(dt, 11));
    /* モデルの中では、x が上下、z が左右、y が首の傾き */
    const eyePitch = S.gaze.y * 0.16;
    const eyeYaw = -S.gaze.x * 0.3;
    eyeL.rotation.set(eyePitch, 0, eyeYaw);
    eyeR.rotation.set(eyePitch, 0, eyeYaw);

    /* --- 呼吸と、しゃくり上げ --- */
    const br = mood.breath || [1.3, 1];
    S.breathRate = lerp(S.breathRate, br[0], ease(dt, 1.2));
    S.breathDepth = lerp(S.breathDepth, br[1] * calmDown, ease(dt, 1.2));
    S.sob = lerp(S.sob, (mood.sob || 0) * calmDown, ease(dt, 1.5));
    S.breathPhase += dt * S.breathRate;
    const breath = Math.sin(S.breathPhase) * S.breathDepth;
    const hic = S.sob * Math.pow(Math.max(0, Math.sin(S.breathPhase * 2.3)), 12); // ひっく、という短い跳ね

    /* --- 頭 --- */
    const sway = calmDown;
    const lookingUp = t < S.upUntil && !mood.away ? 1 : 0; // 数字を見上げるときは、頭ごと上げる。画面の端からでも分かるように
    const averting = t < S.avertUntil && !S.listen ? 1 : 0;
    const pitchTo = mood.pitch + S.gaze.y * 0.07 - lookingUp * 0.11 + averting * 0.2 + Math.sin(t * 0.23 + 1) * 0.012 * sway - hic * 0.05;
    const yawTo = -S.gaze.x * 0.14 - averting * S.avertDir * 0.09 + Math.sin(t * 0.31) * 0.022 * sway;
    const rollTo = mood.roll + S.idn.tilt + (S.listen ? 0.03 : 0) + Math.sin(t * 0.17) * 0.01 * sway;
    const kHead = ease(dt, lookingUp || averting ? 5 : 3);
    S.head.pitch = lerp(S.head.pitch, pitchTo, kHead);
    S.head.yaw = lerp(S.head.yaw, yawTo, kHead);
    S.head.roll = lerp(S.head.roll, rollTo, kHead);
    /* その子だけの癖。話しはじめに、首をくいっとかしげて、あごを少し上げる。 */
    const habit = S.idn.habit && calmDown ? bell(t - S.habitFrom, 0.32, 0.2) : 0;
    neck.rotation.set(S.head.pitch - habit * 0.05 + shake * 0.006, S.head.roll - habit * 0.15 + shake * 0.004, S.head.yaw + shake * 0.008);
    /* 首の付け根を軸にして回す */
    pivotNeck();

    /* --- 体 --- */
    S.lean = lerp(S.lean, mood.lean || 0, ease(dt, 1.6));
    person.position.set(shake * 0.004, breath * 0.012 + hic * 0.05, S.lean * 0.9);
    body.position.y = BODY_DROP + breath * 0.016 + hic * 0.04;
    body.scale.x = 1 + breath * 0.006;

    /* --- 顔に書き込む --- */
    for (const name in dict) inf[dict[name]] = cur[name] || 0;
    const set = (name, v) => {
      if (name in dict) inf[dict[name]] = clamp(v, 0, 1);
    };
    const lid = (side) => Math.max(blink, (cur['eyeBlink' + side] || 0) + 0.03);
    set('eyeBlink_L', lid('_L'));
    set('eyeBlink_R', lid('_R'));
    const down = Math.max(0, S.gaze.y) * 0.75 * (1 - blink);
    set('eyeLookDown_L', down);
    set('eyeLookDown_R', down);
    const upLook = Math.max(0, -S.gaze.y) * 0.6 * (1 - blink);
    set('eyeLookUp_L', upLook);
    set('eyeLookUp_R', upLook);
    set('jawOpen', (cur.jawOpen || 0) + jaw.v + hic * 0.12);
    set('mouthClose', (cur.mouthClose || 0) + jaw.v * 0.4);
    set('mouthFunnel', (cur.mouthFunnel || 0) + Math.max(0, jaw.shape) * 0.5);
    set('mouthStretch_L', (cur.mouthStretch_L || 0) + Math.max(0, -jaw.shape) * 0.3);
    set('mouthStretch_R', (cur.mouthStretch_R || 0) + Math.max(0, -jaw.shape) * 0.3);
    set('mouthShrugLower', (cur.mouthShrugLower || 0) + quiver * 0.3);
    set('mouthPress_L', (cur.mouthPress_L || 0) + quiver * 0.12);
    set('mouthPress_R', (cur.mouthPress_R || 0) + quiver * 0.12);

    /* --- 目の光と、涙 --- */
    const crying = mood.tears || 0;
    S.wet = lerp(S.wet, crying > 0 ? 1 : 0, ease(dt, crying > 0 ? 0.9 : 0.25));
    glints.forEach((g) => {
      const s = g.userData.side;
      const wob = S.wet * 0.008 * Math.sin(t * 9 + s);
      g.position.set(s * EYE_X + 0.07 * S.idn.side + S.gaze.x * 0.03 + wob, EYE_Y + 0.075 - S.gaze.y * 0.02, EYE_Z + EYE_R + 0.012);
      /* まぶたが下りているとき（笑う、むくれる）は、光も隠れる。まぶたの上に白い点が残らないように。 */
      const lidDown = clamp(Math.max(blink, (cur['eyeBlink' + (s < 0 ? '_R' : '_L')] || 0) * 1.6, (cur['eyeSquint' + (s < 0 ? '_R' : '_L')] || 0) * 1.25, (cur.browDown_L || 0) * 0.9), 0, 1);
      g.scale.setScalar((1 + S.wet * 0.75) * (1 - lidDown * 0.98));
      g.material.opacity = 0.85 * Math.min(1, S.vital * 1.4);
    });
    if (tears) {
      if (crying > 0 && calmDown && t > S.tearAt) {
        const one = tears[S.tearEye % 2];
        S.tearEye += 1;
        if (one && one.t < 0) {
          one.t = 0;
          one.speed = 0.3 + Math.random() * 0.2;
        }
        S.tearAt = t + (1.2 + Math.random() * 2.2) / crying;
      }
      tears.forEach((one) => {
        if (!one) return;
        if (one.t >= 0) {
          /* 目のふちに溜まってから、すべり落ちる */
          one.t += dt * one.speed * (one.t < 0.08 ? 0.35 : 1 + one.t * 1.5);
          if (one.t >= 1) {
            one.t = -1;
            one.drop.visible = false;
          } else {
            one.drop.visible = true;
            one.drop.position.copy(one.curve.getPoint(one.t));
            one.drop.material.opacity = 0.75 * smooth(1, 0.85, one.t);
            one.reach = Math.max(one.reach, one.t);
          }
        }
        /* 涙のあと。泣きやむと、ゆっくり乾く。 */
        one.trail.geometry.setDrawRange(0, Math.floor((one.total * one.reach) / 3) * 3);
        one.trail.material.opacity = lerp(one.trail.material.opacity, one.reach > 0 ? 0.3 * S.wet : 0, ease(dt, 0.6));
        if (S.wet < 0.03) one.reach = 0;
      });
    }

    /* --- 光 --- */
    S.vital = lerp(S.vital, S.vitalTo, ease(dt, S.vitalTo < S.vital ? 2.4 : 1.6));
    key.intensity = 2.2 * S.vital;
    fill.intensity = 1.15 * S.vital;
    hemi.intensity = 0.15 + 0.55 * S.vital;
    rim.intensity = 0.22 + 0.42 * S.vital;
  }

  const _q = { e: null, ql: null, qw: null, p: null };
  function pivotNeck() {
    if (!_q.e) {
      _q.e = new THREE.Euler();
      _q.ql = new THREE.Quaternion();
      _q.qw = new THREE.Quaternion();
      _q.inv = neckParentQ.clone().invert();
      _q.p = new THREE.Vector3();
    }
    const P = _q.p.set(0, -0.82, -0.22); // 首の付け根
    _q.ql.setFromEuler(neck.rotation);
    _q.qw.copy(neckParentQ).multiply(_q.ql).multiply(_q.inv);
    const moved = P.clone().applyQuaternion(_q.qw);
    neck.position.copy(P.sub(moved).applyMatrix3(neckParentInv));
  }

  function frame(ms) {
    requestAnimationFrame(frame);
    if (!S.on || S.frozen || document.hidden) return;
    if (ms - last < 30) return;
    const dt = Math.min(0.1, (ms - last) / 1000);
    last = ms;
    advance(dt);
    renderer.render(scene, camera);
  }

  /* ================= 外から呼ぶもの ================= */

  /* 読み込みを始める。使えるようになったら true を返す。 */
  F.mount = async (el) => {
    stage = el;
    canvas = el && el.querySelector('canvas');
    if (!canvas) return false;
    /* URL に ?face=off を付けると、顔を出さない（文字だけの版） */
    if (query.get('face') === 'off') return false;
    try {
      THREE = await import('three');
      const [gltfMod, ktxMod, meshoptMod] = await Promise.all([
        import('three/addons/loaders/GLTFLoader.js'),
        import('three/addons/loaders/KTX2Loader.js'),
        import('three/addons/libs/meshopt_decoder.module.js'),
      ]);

      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0d0c0b);
      camera = new THREE.PerspectiveCamera(22, 1, 0.1, 100);

      const ktx2 = new ktxMod.KTX2Loader().setTranscoderPath(THREE_URL + '/examples/jsm/libs/basis/').detectSupport(renderer);
      const loader = new gltfMod.GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(meshoptMod.MeshoptDecoder);
      const gltf = await loader.loadAsync(MODEL_URL);
      ktx2.dispose();

      person = new THREE.Group();
      person.add(gltf.scene);
      scene.add(person);
      buildChild(gltf.scene);
      person.add(body);

      hemi = new THREE.HemisphereLight(0xfff1e2, 0x3a2c22, 0.5);
      key = new THREE.DirectionalLight(0xffe9d6, 0);
      rim = new THREE.DirectionalLight(0xcfd6ea, 0.6);
      fill = new THREE.DirectionalLight(0xffeee0, 0);
      fill.position.set(0, 0.4, 5);
      scene.add(hemi, key, rim, fill);
      applyIdentity(12);

      resize();
      if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
      window.addEventListener('resize', resize);
      window.addEventListener(
        'pointermove',
        (e) => {
          const r = stage.getBoundingClientRect();
          S.ptr.x = clamp((e.clientX - (r.left + r.width / 2)) / (window.innerWidth * 0.5), -1, 1);
          S.ptr.y = clamp((e.clientY - (r.top + r.height * 0.42)) / (window.innerHeight * 0.5), -1, 1);
        },
        { passive: true }
      );

      F.ready = true;
      requestAnimationFrame(frame);
      if (pending) F.show(pending.gen, pending.mood);
      return true;
    } catch (e) {
      F.failed = true;
      if (window.console) console.info('申し送り：顔の表示は使えません。文字だけで進みます。', e && e.message ? e.message : e);
      return false;
    }
  };

  /* 顔を出す。暗がりから、ゆっくり現れる。 */
  F.show = (gen, mood) => {
    pending = { gen, mood };
    if (!F.ready) return;
    applyIdentity(gen);
    S.mood = MOODS[mood] || MOODS.calm;
    S.frozen = false;
    S.gone = false;
    S.react = null;
    S.listen = false;
    S.speaking = false;
    S.wet = 0;
    S.vital = 0;
    S.vitalTo = 1;
    S.on = true;
    stage.classList.remove('cut', 'veil');
    stage.classList.add('on');
    resize();
  };

  /* 気持ちが変わる */
  F.mood = (name) => {
    if (!MOODS[name]) return;
    if (pending) pending.mood = name;
    if (S.gone) return;
    S.mood = MOODS[name];
  };

  F.vitality = () => {};

  /*
   * 返事を待っているあいだ、こちらを見ている。
   * late は、終わりの日付が決まったあと。待たされるほど、上の残り日数を見上げるようになる。
   */
  F.listen = (on, late) => {
    const was = S.listen;
    S.listen = !!on && !S.gone;
    S.listenLate = S.listen && !!late;
    if (S.listen && !was) S.listenFrom = clock;
  };

  F.speak = (on) => {
    const was = S.speaking;
    S.speaking = !!on && !reduced && !S.gone;
    /* 話しはじめの癖。続けて話すときは、毎回はしない。 */
    if (S.speaking && !was && S.idn && S.idn.habit && clock - S.habitFrom > 5) S.habitFrom = clock;
  };

  /* 一字ごとに呼ぶ。口の形を、少しずつ変える。 */
  F.mouth = (ch) => {
    if (!S.speaking) return;
    const jaw = S.jaw;
    if ('。、？！…─　 「」（）'.includes(ch)) {
      jaw.to = 0;
      jaw.shapeTo = 0;
      return;
    }
    const t = performance.now();
    if (t - jaw.at < 95) return;
    jaw.at = t;
    jaw.to = 0.04 + Math.random() * 0.12;
    jaw.shapeTo = Math.random() * 1.0 - 0.5;
  };

  /* あなたの返事を聞いた。顔に出る。 */
  F.react = (kind) => {
    if (!F.ready || S.gone || !REACTS[kind]) return;
    S.react = REACTS[kind];
    S.reactFrom = clock;
  };

  /* お知らせが届いた。そちらを見て、戻る。 */
  F.glance = () => {
    if (!F.ready || S.gone || reduced) return;
    S.glanceUntil = clock + 1.8;
  };

  /* 提供終了。その瞬間の顔のまま、ぷつりと消える。 */
  F.end = () => {
    if (!F.ready) return;
    S.gone = true;
    S.frozen = true;
    S.listen = false;
    S.speaking = false;
    stage.classList.add('cut');
  };

  /* 別の子の顔に替わる。暗いところから、現れる。 */
  F.swap = (gen, mood) =>
    new Promise((resolve) => {
      pending = { gen, mood };
      if (!F.ready || !S.on) {
        if (F.ready) F.show(gen, mood);
        resolve();
        return;
      }
      stage.classList.add('veil');
      setTimeout(
        () => {
          for (const name in cur) cur[name] = 0;
          S.head.pitch = 0;
          S.head.yaw = 0;
          S.head.roll = 0;
          S.lean = 0;
          S.tremble = 0;
          S.sob = 0;
          F.show(gen, mood);
          resolve();
        },
        reduced ? 60 : 1300
      );
    });

  /* いまの顔を、小さな写真にする */
  F.snapshot = () => {
    if (!F.ready || !S.on || S.frozen) return null;
    try {
      renderer.render(scene, camera);
      const w = canvas.width;
      const h = canvas.height;
      const c = new THREE.Vector3(0, 0.22, 0).project(camera);
      const u = new THREE.Vector3(0, 1.82, 0).project(camera);
      const cx = (c.x * 0.5 + 0.5) * w;
      const cy = (1 - (c.y * 0.5 + 0.5)) * h;
      const ch = Math.abs((1 - (u.y * 0.5 + 0.5)) * h - cy) * 2;
      const cw = ch * (120 / 152);
      const out = document.createElement('canvas');
      out.width = 120;
      out.height = 152;
      const g = out.getContext('2d');
      g.fillStyle = '#0d0c0b';
      g.fillRect(0, 0, 120, 152);
      g.drawImage(canvas, cx - cw / 2, cy - ch / 2, cw, ch, 0, 0, 120, 152);
      return out.toDataURL('image/jpeg', 0.76);
    } catch (e) {
      return null;
    }
  };

  /* ---------- 確認用 ---------- */

  F.moods = () => Object.keys(MOODS);

  /* 時間を進めて、一枚描く。画面が裏にあって動きが止まっているときも、これで確かめられる。 */
  F.step = (seconds) => {
    if (!F.ready) return false;
    const n = Math.max(1, Math.round((seconds || 0) * 30));
    for (let i = 0; i < n; i += 1) advance(1 / 30);
    renderer.render(scene, camera);
    return true;
  };

  /* 部品を取り出す（確認のときに、髪を外して頭の形を見る、など） */
  F.parts = () => ({ hair: hairMesh, head: headMesh, body, holder, camera });

  F.debug = () => ({
    on: S.on,
    frozen: S.frozen,
    gone: S.gone,
    vital: Number(S.vital.toFixed(2)),
    wet: Number(S.wet.toFixed(2)),
    tremble: Number(S.tremble.toFixed(2)),
    mood: Object.keys(MOODS).find((k) => MOODS[k] === S.mood),
    cls: stage ? stage.className : '',
  });
})();
