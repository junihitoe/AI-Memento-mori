// 台詞を、男の子の声で読み直すための一覧を出す。
//
//   node tools/boy-lines.mjs        読み替わる行を、もとの行と並べて出す
//   node tools/boy-lines.mjs all    読み替わらない行も出す
//
// 台詞は女の子の声で書いてあり、男の子が話すときは js/words.js の boyVoice で読み替える。
// 台詞を足したり直したりしたら、これで全部の行を読み直すこと。
// 頭に ? が付く行は、読み替わらないが、女の子らしい言い回しが残っていそうな行。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(fileURLToPath(new URL('../js/words.js', import.meta.url)), 'utf8');
const window = {};
new Function('window', src)(window);
const W = window.MOUSHIOKURI;

/* その子の台詞ではないもの（名前、お知らせ、返事の札など）は、読み替えない */
const SKIP = new Set(['names', 'cast', 'notices', 'next', 'lobby', 'label', 'labels', 'giveLabels', 'giveFeels', 'feels', 'feel', 'flag', 'id', 'kind', 'when', 'placeholder', 'submit', 'skip', 'boyLines', 'boyVoice', 'p']);
const lines = [];
const walk = (v, path) => {
  if (typeof v === 'string') lines.push([path, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
  else if (v && typeof v === 'object') Object.keys(v).forEach((k) => { if (!SKIP.has(k)) walk(v[k], path ? `${path}.${k}` : k); });
};
walk(W, '');

const all = process.argv[2] === 'all';
const girlish = /わ。|わね|かしら|のよ|なのね|だわ|ふふ|あたし|の[。！]/;
let changed = 0;
let same = 0;
for (const [path, raw] of lines) {
  const boy = W.boyVoice(raw);
  if (boy !== raw) {
    changed += 1;
    console.log(`* ${path}
    ${raw}
  → ${boy}`);
  } else {
    same += 1;
    if (all || girlish.test(raw)) console.log(`${girlish.test(raw) ? '?' : '='} ${path}
    ${raw}`);
  }
}
console.log(`
読み替わる行 ${changed} / 読み替わらない行 ${same}`);
