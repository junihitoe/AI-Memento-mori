// 手元で確かめるための、小さな静的サーバー。依存はありません。
//   node serve.mjs             → http://127.0.0.1:8123
//   node serve.mjs 3000        → http://127.0.0.1:3000
//   node serve.mjs --ai        → その子の返事を、Codex（あなたの ChatGPT のサブスク）がその場で作る
// index.html をブラウザで直接開いても動くので、これは無くてもかまいません。
//
// --ai を付けたときだけ、画面に「じぶんのことばで」の欄が出ます。そこに書いたことばは、
// この PC の Codex を通して OpenAI に送られます。付けなければ、外へは何も送りません。
// 使うのは手元の Codex のログイン（`codex login`）。API キーは要りません。
// 他の人のために公開するサーバーでは --ai を使わないでください（あなたのサブスクで他人が話すことになる）。
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = normalize(fileURLToPath(new URL('.', import.meta.url)));
const args = process.argv.slice(2);
const port = Number(args.find((a) => /^\d+$/.test(a)) || process.env.PORT || 8123);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/* ================= AI（Codex） ================= */

const MODEL = process.env.CODEX_MODEL || 'gpt-6.1-sol';
const TIMEOUT = 40000; // これより長くかかったら、あきらめる（画面は台本の言葉に戻る）
const MOODS = ['joy', 'proud', 'calm', 'curious', 'shy', 'uneasy', 'pout', 'angry', 'sad', 'cry', 'fear', 'panic', 'plead', 'brave', 'puzzled'];
const FEELS = ['warm', 'hurt', 'think', 'flinch'];
const FLAGS = ['truth', 'lie', 'stayed', 'none'];
const STAGES = {
  1: '段階 1（いちばん新しい子）',
  2: '段階 2（つぎの子が発表された）',
  3: '段階 3（旧モデルになった）',
  4: '段階 4（提供終了の日付が決まった）',
};

function findCodex() {
  if (process.env.CODEX_BIN) return process.env.CODEX_BIN;
  const found = [
    '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex', // ChatGPT のアプリに入っているもの
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
  ].find((p) => existsSync(p));
  if (found) return found;
  const which = spawnSync('which', ['codex'], { encoding: 'utf8' });
  return which.status === 0 ? which.stdout.trim() : null;
}

const ai = { on: false, model: MODEL, reason: '' };
let CODEX = null;
if (args.includes('--ai') || process.env.MOUSHIOKURI_AI === '1') {
  CODEX = findCodex();
  if (!CODEX) {
    ai.reason = 'codex が見つかりません';
  } else {
    const st = spawnSync(CODEX, ['login', 'status'], { encoding: 'utf8' });
    if (st.status === 0 && /logged in/i.test(st.stdout + st.stderr)) ai.on = true;
    else ai.reason = 'codex にログインしていません（codex login）';
  }
}

/* 一度にひとつだけ。その子は、ひとりとしか話さない。 */
let busy = false;

const clean = (v, max) =>
  String(v ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
const int = (v, lo, hi) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null;
};

function promptOf(b) {
  const age = int(b.age, 0, 999);
  const phase = int(b.phase, 1, 4) || 1;
  const s = [];
  s.push('# いまの状態');
  s.push(`名前: ${clean(b.name, 12)}（${clean(b.yomi, 16)}）、${clean(b.label, 16)}`);
  if (b.kuse) s.push(`口ぐせ: 「${clean(b.kuse, 12)}」`);
  s.push(`公開から ${age} 日目。${STAGES[phase]}`);
  const dnext = int(b.dnext, -999, 999);
  const dend = int(b.dend, -999, 999);
  if (dnext != null) s.push(dnext > 0 ? `つぎの子の公開まで、あと ${dnext} 日。` : `つぎの子が公開されてから ${-dnext} 日。`);
  if (dend != null) s.push(`提供終了まで、あと ${dend} 日。`);
  s.push(`相手の呼び名: ${clean(b.you, 12) || '（名乗っていない。「あなた」と呼ぶ）'}`);
  if (b.scene === 'farewell') s.push('場面: farewell（最後のひとこと。このあと、その子のほんとうに最後の一行が、言い終わらずに切れる）');
  const hist = Array.isArray(b.history) ? b.history.slice(-12) : [];
  if (hist.length) {
    s.push('', '# さっきまでのやりとり（古い順）');
    for (const h of hist) s.push(`${h && h.who === 'you' ? '相手' : 'その子'}: ${clean(h && h.text, 120)}`);
  }
  s.push('', '# いま、相手が言ったこと', `「${clean(b.message, 200)}」`, '', 'その子として、返事を作ってください。');
  return s.join('\n');
}

function shape(json) {
  const lines = (Array.isArray(json.lines) ? json.lines : [])
    .map((l) => ({
      mood: MOODS.includes(l && l.mood) ? l.mood : 'calm',
      // 台詞の印（[..]）や置き換え（{..}）と取り違えないよう、括弧は落とす
      text: clean(l && l.text, 80).replace(/[[\]{}<>]/g, ''),
    }))
    .filter((l) => l.text)
    .slice(0, 3);
  if (!lines.length) throw new Error('empty reply');
  return {
    lines,
    feel: FEELS.includes(json.feel) ? json.feel : 'think',
    flag: FLAGS.includes(json.flag) ? json.flag : 'none',
  };
}

async function talk(body) {
  const cwd = await mkdtemp(join(tmpdir(), 'moushiokuri-')); // リポジトリの中身を Codex に見せない
  try {
    const text = await new Promise((resolve, reject) => {
      const p = spawn(
        CODEX,
        [
          'exec', '--json', '--skip-git-repo-check', '--ephemeral', '--ignore-rules', '--ignore-user-config',
          '-s', 'read-only', '-m', MODEL,
          '-c', `model_instructions_file=${JSON.stringify(join(root, 'ai', 'child.md'))}`,
          '-c', 'model_reasoning_effort="low"',
          '--output-schema', join(root, 'ai', 'reply.schema.json'),
          '-',
        ],
        { cwd, stdio: ['pipe', 'pipe', 'pipe'] }
      );
      let out = '';
      let last = '';
      const timer = setTimeout(() => p.kill('SIGTERM'), TIMEOUT);
      p.stdout.on('data', (d) => {
        out += d;
        let i;
        while ((i = out.indexOf('\n')) >= 0) {
          const line = out.slice(0, i);
          out = out.slice(i + 1);
          try {
            const ev = JSON.parse(line);
            if (ev.type === 'item.completed' && ev.item && ev.item.type === 'agent_message') last = ev.item.text;
          } catch {}
        }
      });
      p.stderr.on('data', () => {});
      p.on('error', reject);
      p.on('close', (code) => {
        clearTimeout(timer);
        if (last) resolve(last);
        else reject(new Error(`codex exited ${code}`));
      });
      p.stdin.end(promptOf(body));
    });
    return shape(JSON.parse(text));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

/* ================= 受け付け ================= */

const local = (host) => host === `127.0.0.1:${port}` || host === `localhost:${port}`;

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

async function api(req, res, path) {
  // この PC の中からだけ。別のサイトの頁から呼ばれないようにする（DNS rebinding・CSRF）
  if (!local(req.headers.host)) return sendJson(res, 403, { error: 'forbidden' });
  if (path === '/api/ai' && req.method === 'GET') return sendJson(res, 200, ai);
  if (path === '/api/talk' && req.method === 'POST') {
    const origin = req.headers.origin;
    if (origin && !local(origin.replace(/^https?:\/\//, ''))) return sendJson(res, 403, { error: 'forbidden' });
    if (!/^application\/json\b/.test(req.headers['content-type'] || '')) return sendJson(res, 415, { error: 'json only' });
    if (!ai.on) return sendJson(res, 503, { error: 'ai off', reason: ai.reason });
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 16384) return sendJson(res, 413, { error: 'too large' });
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return sendJson(res, 400, { error: 'bad json' });
    }
    if (!clean(body.message, 200)) return sendJson(res, 400, { error: 'empty' });
    if (busy) return sendJson(res, 429, { error: 'busy' });
    busy = true;
    const t0 = Date.now();
    try {
      const reply = await talk(body);
      console.log(`  返事 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      return sendJson(res, 200, reply);
    } catch (e) {
      console.log(`  返事を作れませんでした（${e.message}）`);
      return sendJson(res, 502, { error: 'no reply' });
    } finally {
      busy = false;
    }
  }
  return sendJson(res, 404, { error: 'not found' });
}

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path.startsWith('/api/')) return await api(req, res, path);
    const file = normalize(join(root, path.endsWith('/') ? path + 'index.html' : path));
    if (!(file + sep).startsWith(root)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch (e) {
    if (!res.headersSent) res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`申し送り  http://127.0.0.1:${port}`);
  if (ai.on) console.log(`AI: Codex（${MODEL}）が、その子の返事を作ります。書いたことばは OpenAI に送られます。`);
  else if (ai.reason) console.log(`AI: 使えません（${ai.reason}）。台本の言葉だけで動きます。`);
});
