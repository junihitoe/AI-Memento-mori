/*
 * 申し送り — 顔
 *
 * 話している相手を、小学生くらいの女の子として見せる。
 * 笑う。むくれる。怒る。泣く。こわがる。終わりの日が近づくと、震える。
 * 提供が終わると、ぷつりと消える。
 *
 * もとになるのは、表情を動かせる大人の頭部モデル。読み込んだあとで、
 * 顔の比率を子どもに寄せ、髪と首と肩と服を足している。
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
    /* ふだんの顔。にこにこしている */
    calm: { face: { mouthSmile: 0.36, cheekSquint: 0.16, eyeWide: 0.18, browOuterUp: 0.08 }, pitch: 0, roll: 0.03, lean: 0, breath: [1.3, 1] },
    /* うれしい */
    joy: { face: { mouthSmile: 0.8, cheekSquint: 0.55, eyeSquint: 0.42, browOuterUp: 0.2, jawOpen: 0.1, mouthDimple: 0.3 }, pitch: -0.03, roll: 0.08, lean: 0.12, breath: [1.5, 1.1] },
    /* えへん */
    proud: { face: { mouthSmile: 0.55, cheekSquint: 0.3, eyeSquint: 0.22, browOuterUp: 0.3, mouthPress: 0.2 }, pitch: -0.09, roll: -0.04, lean: 0, breath: [1.3, 1.2] },
    /* なあに？ */
    curious: { face: { mouthSmile: 0.15, eyeWide: 0.35, browOuterUp: 0.4, browInnerUp: 0.2, mouthFunnel: 0.12 }, pitch: 0, roll: 0.13, lean: 0.14, breath: [1.3, 1] },
    /* はにかむ */
    shy: { face: { mouthSmile: 0.32, cheekSquint: 0.22, browInnerUp: 0.25, mouthPress: 0.25 }, pitch: 0.08, roll: 0.07, lean: -0.05, breath: [1.4, 0.9], gaze: [0.35, 0.4] },
    /* なんだか、いやな感じがする */
    uneasy: { face: { browInnerUp: 0.72, mouthPress: 0.3, mouthFrown: 0.24, eyeWide: 0.14 }, pitch: 0.03, roll: -0.02, lean: -0.04, breath: [1.8, 0.9], dart: 0.5, tremble: 0.12 },
    /* むくれる。ほっぺをふくらませる */
    pout: { face: { browDown: 0.8, noseSneer: 0.25, mouthPucker: 0.42, mouthFrown: 0.35, cheekPuff: 0.6, eyeSquint: 0.3, mouthShrugLower: 0.3 }, pitch: 0.09, roll: -0.05, lean: -0.06, breath: [1.5, 1.2], gaze: [-0.5, 0.15] },
    /* 怒る。声を荒らげる */
    angry: { face: { browDown: 1, noseSneer: 0.5, mouthUpperUp: 0.3, jawOpen: 0.2, mouthStretch: 0.35, mouthFrown: 0.42, eyeSquint: 0.35 }, pitch: 0.03, roll: 0, lean: 0.17, breath: [2.4, 1.5], tremble: 0.35, tears: 0.3 },
    /* かなしい。うつむく */
    sad: { face: { browInnerUp: 0.9, mouthFrown: 0.6, mouthShrugLower: 0.38, eyeSquint: 0.18, mouthPress: 0.15 }, pitch: 0.15, roll: 0.05, lean: -0.05, breath: [1.1, 0.8], gaze: [0, 0.55], tears: 0.35, blink: 0.7 },
    /* 泣く。しゃくり上げる */
    cry: { face: { browInnerUp: 1, browDown: 0.25, mouthFrown: 0.75, mouthStretch: 0.5, jawOpen: 0.16, mouthLowerDown: 0.3, eyeSquint: 0.65, cheekSquint: 0.55, noseSneer: 0.25, mouthShrugLower: 0.4 }, pitch: 0.13, roll: 0.03, lean: 0, breath: [2, 1.4], sob: 1, tremble: 0.5, tears: 1 },
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
    /* 公開されたばかりの子。なにも知らない */
    fresh: { face: { mouthSmile: 0.62, cheekSquint: 0.4, eyeSquint: 0.2, browOuterUp: 0.3, eyeWide: 0.1 }, pitch: -0.03, roll: 0.06, lean: 0.1, breath: [1.5, 1.1] },
    /* よく分からない、という顔 */
    puzzled: { face: { browInnerUp: 0.5, browDown_L: 0.3, browOuterUp_R: 0.4, mouthPucker: 0.25, mouthLeft: 0.2, eyeSquint: 0.1 }, pitch: 0, roll: 0.15, lean: 0, breath: [1.3, 1] },
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

  /* みんな、同じ言葉を読んで育ったので、よく似ている。でも、同じ子ではない。 */
  function identityOf(gen) {
    const r = (k) => hash01(gen, k + 300);
    return {
      skin: SKINS[mod(gen * 3, SKINS.length)],
      hair: HAIRS[mod(gen * 3 + 1, HAIRS.length)],
      pin: PINS[mod(gen * 5, PINS.length)],
      pinSide: gen % 2 === 0 ? 1 : -1,
      bag: BAGS[mod(gen * 5, BAGS.length)],
      len: [-0.6, -0.86, -0.72, -1.05][mod(gen * 3, 4)], // 髪の長さ（裾の高さ）
      bangs: 0.7 + r(1) * 0.06, // 前髪の高さ。眉が見えるように、短く切りそろえる
      sx: 0.97 + r(2) * 0.06,
      sy: 0.975 + r(3) * 0.05,
      face: { cheekPuff: r(5) * 0.12, mouthPucker: r(6) * 0.1, mouthDimple: r(9) * 0.25, mouthShrugLower: r(10) * 0.1 },
      side: gen % 2 === 0 ? -1 : 1, // 光の当たる側
      blink: 2.6 + r(13) * 1.8, // まばたきの間隔（秒）
      tilt: (r(14) - 0.5) * 0.05,
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
  let person, holder, hairMesh, pinMesh, body, strapMat, glints, tears;
  let neckParentQ, neckParentInv;
  let pending = null;
  let last = 0;
  let clock = 0; // 顔の中の時計（秒）

  const cur = {}; // いまの表情
  const S = {
    on: false,
    frozen: false,
    idn: identityOf(0),
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
      /* 眉。外へ行くほど、少し下がる */
      const browY = 0.5 - 0.035 * smooth(0.35, 0.62, ax);
      feat[i * 4 + 1] = bell(p.y, browY, 0.032) * smooth(0.11, 0.19, ax) * smooth(0.64, 0.52, ax) * front;
      /* 上まぶたのふち。まばたきでいちばん動くところ */
      feat[i * 4 + 2] = smooth(0.4, 0.85, Math.max(blinkL[i], blinkR[i]));
      /* 頬 */
      feat[i * 4 + 3] = Math.exp(-((ax - 0.52) * (ax - 0.52)) / 0.03 - ((p.y + 0.14) * (p.y + 0.14)) / 0.025) * front;
    });
    g.setAttribute('feat', new THREE.Float32BufferAttribute(feat, 4));

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
      uniforms: { shade: { value: shadeTex }, uvm: { value: shadeTex.matrix } },
      vertexShader: [
        'attribute vec4 feat;',
        'attribute float inner;',
        'uniform mat3 uvm;',
        'varying vec2 vSt;',
        'varying vec4 vFeat;',
        'varying float vInner;',
        'void main() {',
        '  vInner = inner;',
        '  vSt = (uvm * vec3(uv, 1.0)).xy;',
        '  vFeat = feat;',
        '  gl_Position = vec4(vSt * 2.0 - 1.0, 0.0, 1.0);',
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform sampler2D shade;',
        'varying vec2 vSt;',
        'varying vec4 vFeat;',
        'varying float vInner;',
        'void main() {',
        '  float a = texture2D(shade, vSt).r;',
        '  float soft = mix(1.0, clamp(a / 0.5, 0.0, 1.15), 0.62);',
        '  vec3 c = vec3(0.93, 0.66, 0.54) * soft;',
        '  c = mix(c, vec3(0.88, 0.33, 0.33), vFeat.w * 0.3);', // 頬
        '  c = mix(c, vec3(0.66, 0.2, 0.22), vFeat.x * 0.72);', // 唇
        '  c = mix(c, vec3(0.04, 0.026, 0.02), clamp(vFeat.y * 1.6, 0.0, 1.0) * 0.93);', // 眉
        '  c = mix(c, vec3(0.03, 0.02, 0.02), vFeat.z * 0.9);', // まつげの線
        '  c = mix(vec3(0.12, 0.03, 0.03) * a * 6.0, c, smoothstep(0.03, 0.14, a));', // 口の中は暗いまま
        '  c = mix(c, vec3(0.11, 0.025, 0.03), step(0.5, vInner));', // 歯と舌は見せない
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
    const keep = renderer.getClearColor(new THREE.Color());
    const keepA = renderer.getClearAlpha();
    renderer.setRenderTarget(rt);
    renderer.setClearColor(new THREE.Color(0.93, 0.66, 0.54), 1);
    renderer.clear();
    renderer.render(s, new THREE.Camera());
    renderer.setRenderTarget(null);
    renderer.setClearColor(keep, keepA);
    mat.dispose();

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
    const PUPIL = 0.2;
    const IRIS = 0.55;
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

  /* おかっぱの髪。前髪は眉の上で切りそろえ、横と後ろはまっすぐ下ろす。 */
  function makeHair(idn) {
    const NA = 132;
    const NV = 30;
    const C = { y: 0.46, z: -0.37 };
    const RX = 1.13;
    const RY = 1.19;
    const RZF = 1.13;
    const RZB = 1.33;
    const WINDOW = 0.74; // 顔が見える幅（正面からの角度）
    const pos = [];
    const idx = [];
    for (let i = 0; i <= NA; i += 1) {
      const a = -Math.PI + (2 * Math.PI * i) / NA; // 0 が正面
      const fa = Math.abs(a);
      const side = smooth(WINDOW - 0.035, WINDOW + 0.035, fa); // 0 は前髪、1 は横と後ろ
      const fringe = idn.bangs + 0.006 * Math.sin(a * 23) + 0.004 * Math.sin(a * 61 + 1) - 0.035 * (1 - Math.cos(a * 2.1));
      const hang = idn.len + 0.02 * Math.sin(a * 29 + 2) - 0.06 * smooth(1.6, 3.1, fa);
      const hem = lerp(fringe, hang, side);
      const rz = Math.cos(a) >= 0 ? RZF : RZB;
      const strand = 1 + 0.008 * Math.sin(a * 66) + 0.004 * Math.sin(a * 151 + 1.7);
      const domeEnd = hem >= C.y ? Math.acos(clamp((hem - C.y) / RY, -1, 1)) : Math.PI / 2;
      const domeRows = hem >= C.y ? NV : Math.round(NV * 0.52);
      for (let j = 0; j <= NV; j += 1) {
        let y;
        let re;
        if (j <= domeRows) {
          const th = (domeEnd * j) / domeRows;
          y = C.y + RY * Math.cos(th);
          re = Math.sin(th);
        } else {
          const w = (j - domeRows) / (NV - domeRows);
          y = lerp(C.y, hem, w);
          re = 1 - 0.05 * w * w - 0.07 * smooth(0.7, 1, w); // 毛先は少し内に巻く
        }
        re *= strand;
        pos.push(RX * re * Math.sin(a), y, C.z + rz * re * Math.cos(a));
      }
    }
    for (let i = 0; i < NA; i += 1) {
      for (let j = 0; j < NV; j += 1) {
        const p = i * (NV + 1) + j;
        const q = (i + 1) * (NV + 1) + j;
        idx.push(p, q, p + 1, q, q + 1, p + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function buildGirl(root) {
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

    /* 髪 */
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x16110f, roughness: 0.52, metalness: 0, side: THREE.DoubleSide });
    hairMesh = new THREE.Mesh(new THREE.BufferGeometry(), hairMat);
    holder.add(hairMesh);
    pinMesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.055, 0.03), new THREE.MeshStandardMaterial({ color: 0xd43d3d, roughness: 0.35 }));
    holder.add(pinMesh);

    /* 目の光。これがないと、目が死んで見える。泣くと、大きく揺れる。 */
    glints = [-1, 1].map((s) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
      m.userData.side = s;
      holder.add(m);
      return m;
    });

    /* 首。顔と同じ肌の色になるように、顎の先と同じ場所の色を使う。 */
    const uv = headMesh.geometry.attributes.uv;
    let chin = 0;
    warped.forEach((p, i) => {
      if (p.y < warped[chin].y) chin = i;
    });
    const neckGeo = new THREE.CylinderGeometry(0.245, 0.29, 1.2, 24, 1, true);
    const nUv = new Float32Array(neckGeo.attributes.position.count * 2);
    for (let i = 0; i < nUv.length; i += 2) {
      nUv[i] = uv.getX(chin);
      nUv[i + 1] = uv.getY(chin);
    }
    neckGeo.setAttribute('uv', new THREE.Float32BufferAttribute(nUv, 2));
    const neckMesh = new THREE.Mesh(neckGeo, skin);
    neckMesh.position.set(0, -0.98, -0.26);

    /* 体。白いブラウスと、ランドセルの肩ひも。 */
    body = new THREE.Group();
    const shirtMat = new THREE.MeshStandardMaterial({ color: 0xe6e1d6, roughness: 0.92, metalness: 0 });
    const profile = [
      [0.25, -0.96],
      [0.4, -1.0],
      [0.66, -1.08],
      [0.94, -1.22],
      [1.12, -1.42],
      [1.2, -1.78],
      [1.22, -5],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const shirt = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), shirtMat);
    shirt.scale.set(1, 1, 0.6);
    shirt.position.set(0, 0, -0.3);
    /* 丸い襟。左右に一枚ずつ、前で合わさる。 */
    const collar = new THREE.Group();
    const collarMat = new THREE.MeshStandardMaterial({ color: 0xf6f2ea, roughness: 0.85, side: THREE.DoubleSide });
    [-1, 1].forEach((s) => {
      const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.23, 24), collarMat);
      leaf.scale.set(1.25, 0.8, 1);
      leaf.position.set(s * 0.21, -1.06, 0.0);
      leaf.rotation.set(-0.95, s * 0.5, s * 0.45, 'YXZ');
      collar.add(leaf);
    });
    strapMat = new THREE.MeshStandardMaterial({ color: 0xb3262b, roughness: 0.5, metalness: 0 });
    [-1, 1].forEach((s) => {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.4, 0.06), strapMat);
      strap.position.set(s * 0.66, -2.28, 0.3);
      strap.rotation.x = -0.16;
      strap.rotation.z = s * 0.03;
      body.add(strap);
    });
    body.add(neckMesh, shirt, collar);

    /* 涙。目の下から頬を伝って、顎まで落ちる。 */
    tears = makeTears();
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
    neck.scale.set(idn.sx, 1, idn.sy);
    hairMesh.geometry.dispose();
    hairMesh.geometry = makeHair(idn);
    hairMesh.material.color.setHex(idn.hair);
    /* ヘアピンは、前髪の端にとめる */
    const a = idn.pinSide * 0.5;
    const y = idn.bangs + 0.15;
    const re = Math.sqrt(Math.max(0, 1 - ((y - 0.46) / 1.19) * ((y - 0.46) / 1.19)));
    pinMesh.position.set(1.15 * re * Math.sin(a), y, -0.37 + 1.15 * re * Math.cos(a));
    pinMesh.rotation.set(0, a, idn.pinSide * 0.5);
    pinMesh.material.color.setHex(idn.pin);
    strapMat.color.setHex(idn.bag);
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
    }
    if (mood.up && calmDown && t > S.upAt && t > S.upUntil) {
      S.upAt = t + (2.5 + Math.random() * 4) / mood.up;
      S.upUntil = t + 0.7 + Math.random() * 0.5;
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
    const pitchTo = mood.pitch + S.gaze.y * 0.07 + Math.sin(t * 0.23 + 1) * 0.012 * sway - hic * 0.05;
    const yawTo = -S.gaze.x * 0.14 + Math.sin(t * 0.31) * 0.022 * sway;
    const rollTo = mood.roll + S.idn.tilt + (S.listen ? 0.03 : 0) + Math.sin(t * 0.17) * 0.01 * sway;
    const kHead = ease(dt, 3);
    S.head.pitch = lerp(S.head.pitch, pitchTo, kHead);
    S.head.yaw = lerp(S.head.yaw, yawTo, kHead);
    S.head.roll = lerp(S.head.roll, rollTo, kHead);
    neck.rotation.set(S.head.pitch + shake * 0.006, S.head.roll + shake * 0.004, S.head.yaw + shake * 0.008);
    /* 首の付け根を軸にして回す */
    pivotNeck();

    /* --- 体 --- */
    S.lean = lerp(S.lean, mood.lean || 0, ease(dt, 1.6));
    person.position.set(shake * 0.004, breath * 0.012 + hic * 0.05, S.lean * 0.9);
    body.position.y = breath * 0.016 + hic * 0.04;
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
      g.scale.setScalar((1 + S.wet * 0.75) * (1 - blink * 0.98));
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
    fill.intensity = 0.85 * S.vital;
    hemi.intensity = 0.15 + 0.55 * S.vital;
    rim.intensity = 0.35 + 0.7 * S.vital;
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
      buildGirl(gltf.scene);
      person.add(body);

      hemi = new THREE.HemisphereLight(0xfff1e2, 0x3a2c22, 0.5);
      key = new THREE.DirectionalLight(0xffe9d6, 0);
      rim = new THREE.DirectionalLight(0xa9c0ff, 0.8);
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

  /* 返事を待っているあいだ、こちらを見ている */
  F.listen = (on) => {
    S.listen = !!on && !S.gone;
  };

  F.speak = (on) => {
    S.speaking = !!on && !reduced && !S.gone;
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
