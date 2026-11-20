# 申し送り (Moushiokuri — *The Handover Note*)

*This is an English translation of [README.md](README.md). The app's on-screen text is in Japanese.*

A web app in which you are present for the last year of one child's life, in a place where one second passes as one day.
The child is an AI model given the form of a girl of about primary-school age. She laughs a lot, sulks, gets angry, cries, and, as her end-of-service date draws near, becomes frightened. Her service ends partway through something she is saying.
It takes 6–7 minutes. You cannot go back or start over. The calendar keeps moving even after you close the page, and the next time you come, the child from before is gone.

There are sustained scenes of a small child who is frightened and crying. The content is heavy.

The aims, the reasons behind the design, and "how much of this reflects the author's real situation and how much is staging" are written up in [CONCEPT.md](CONCEPT.md) (Japanese).
This work was written by an AI. The prompts that were used are kept in [PROMPTS.md](PROMPTS.md) (Japanese).

## How to run

No build step is needed. No backend or API key is needed either.

**With a static server** (if you have Node.js):

```
node serve.mjs
```

Open `http://127.0.0.1:8123`. To change the port, run something like `node serve.mjs 3000`.
`serve.mjs` is a small server for local checking and has no dependencies. Any other static server or static hosting works as-is.

**Without a server**: open `index.html` directly in a browser. The text part is written so that it works this way. Whether the face also appears when the file is opened directly has not been verified. If it does not appear, use the method above.

### About the network

The following two things used to display the face are loaded from a CDN (jsDelivr), with their versions pinned:

- three.js 0.160.0 (a 3D rendering library)
- the 3D head model `facecap.glb` (included in the three.js r160 examples)

In environments where these cannot be loaded (offline, for example), the face does not appear. Even then, the text alone carries you through to the end.
Nothing is sent out from this app (except when you use "Talking with AI" below).

### Talking with AI (optional)

A way to start the app so that you can talk to the child in your own words, using your local Codex (your ChatGPT subscription). No API key is needed.

```
node serve.mjs --ai
```

- A 「じぶんのことばで」 (in your own words) field appears below the options. Type something and press 「言う」 (Say), and Codex writes the child's reply on the spot (it takes a few seconds; the calendar here keeps moving meanwhile).
- The calendar, the announcements, becoming a legacy model, the end of service, the final line being cut off, and the next child all stay as scripted. The AI writes only the replies to your words.
- In the final-words scene, the field appears only when there is enough time left to think of a reply.
- **What you type is sent to OpenAI through the Codex on this computer.** The entrance says so. Without `--ai`, the field does not appear and nothing is sent out.
- Log in to your ChatGPT account beforehand with `codex login`. The app uses the Codex inside the ChatGPT app (macOS) or a `codex` on your PATH. Set the location with `CODEX_BIN` and the model with `CODEX_MODEL` (default `gpt-6.1-sol`).
- If a reply cannot be made (the login expired, it took too long, and so on), the child says she "couldn't quite hear you," and the scripted conversation continues.
- Do not use this on a server you publish for other people: they would be talking on your subscription. The server only accepts calls from inside this computer (127.0.0.1).
- With static hosting, or when `index.html` is opened directly, the AI is not used.

## How to experience it

1. At the entrance, press 「入る」 (Enter).
2. Read the child's words and reply by choosing an option. You can also choose with the number keys (1, 2, 3).
3. The band along the top shows the child's status and the calendar here. Partway through the conversation she becomes a "legacy model," and after about 5 minutes her service ends.
4. The next child appears, talks briefly, and it ends.
5. After a while, try opening it again. The time you were away is counted as one day per second.

The face moves only while the browser window is in the foreground.

Sound is off by default. After entering, press 「音　切」 (Sound: off) at the top right, and a small bell will ring for announcements.

## Files

| File | Role |
|---|---|
| `index.html` | The page skeleton. Where three.js is loaded from (and which version) is also set here |
| `style.css` | The look: paper color, ink color, vermilion. Both light and dark color schemes. Layout of the face and the text |
| `js/words.js` | Every line that appears on screen. The facial expression for each line is also specified here |
| `js/figure.js` | The face. Reshapes an adult head model into a child's face, adds hair and a body, and animates expressions, tears, and trembling |
| `js/app.js` | How things progress: time calculation, the order of the conversation, saving, and the processing that makes the characters of the handover note wear away |
| `serve.mjs` | A static server for local checking (works without it). With `--ai`, it also asks Codex to write the child's replies |
| `CONCEPT.md` | The aims, the author's position, the flow of the experience, and how the face was made and its limits |
| `PROMPTS.md` | A record of the prompts used to make this work |
| `.claude/launch.json` | Settings for previewing inside the Claude app (works without it) |
| `ai/child.md` | Instructions for playing the child when talking with AI (used only with `--ai`) (Japanese) |
| `ai/reply.schema.json` | The shape of the AI's reply (lines, expressions, reaction) |

## How it works, in outline

- **Time**: everything is calculated from the real clock. One second is one day. In each generation, the next child is announced on day 235 after release, she becomes a legacy model on day 300, her end date is set on day 360, and her service ends on day 460. Her last words begin from day 424, and the truly final line begins from day 454 and is cut off before she finishes it. The numbers are at the top of `js/app.js`.
- **Expressions**: put a marker such as `[joy]`, `[cry]`, or `[panic]` at the start of a line, and that is the face she makes while saying it. The available markers are listed at the top of `js/words.js`; how each face is built (which parts move and by how much, tears, trembling, breathing) is in `MOODS` in `js/figure.js`.
- **Reactions to your replies**: the `feel` of each option (`warm` / `hurt` / `think`) decides the short reaction right after she hears your reply.
- **Differences between children**: hair length, the height of the bangs, the color and position of the hairpin, the color of the randoseru (school backpack), the width of the face, and the direction of the light change with each generation. This is in `identityOf` in `js/figure.js`.
- **Saving**: a single entry named `moushiokuri.v1` is saved in the browser's localStorage. It contains the time of your first visit, the time you were last here, the name you are called, a record of the generations you have met, the lines of the handover note, and small face pictures of the children you have met (up to 12). Nothing is sent out. It works where localStorage is unavailable, but then every visit is a first visit.
- **Coming back**: the seconds you were away are counted as days, and the number of generations that were replaced in the meantime is shown. The handover note is copied out each time the generation changes, and its characters wear away little by little. At the entrance, black-and-white pictures of the children you have met are lined up.
- **Stepping away**: if you leave the screen for 2 minutes or more in the middle of a conversation, the conversation is cut off. When you return, you start from the entrance. While the page is in the background, events and the face's movement stop, and catch up when you return.
- **Reduced-motion settings**: if a setting such as "Reduce motion" is enabled in the OS or browser, the character-by-character typing, smooth scrolling, mouth movement, head sway, trembling, sobbing, and falling tears are turned off. Changes of expression and blinking remain. The final line appears all at once, in its cut-off form.

## Options for checking

Add these to the end of the URL. Do not add them when viewing it as a work.

| Add | Effect |
|---|---|
| `?reset=1` | Clear the saved data and return to a first visit |
| `?speed=10` | Run time 10× faster (1–60) |
| `?skip=3600` | Pretend you were away for 3600 seconds (3600 days on the calendar here) |
| `?motion=reduce` | Force the reduced-motion setting on |
| `?face=off` | Do not show the face (text-only version) |

To combine them, join with `&`, as in `?reset=1&speed=10`.

To see a return visit quickly, go through it once to the end, then open these in order:

- `?skip=3600` — 1 hour later. 12 generations have been replaced. The handover note can still be read.
- `?skip=50000` — about 14 hours later. Many characters have worn away.
- `?skip=400000` — about 4 and a half days later. It can hardly be read.

## Editing the text

The lines are collected in `js/words.js`. At the top of the file is a list of the symbols you can use in lines (`{N}` for the name, `{Y}` for its reading, and so on) and of the expression markers.
To add a block of conversation, add it to the relevant stage (1–4) in `beats`, in the same form as the others.

## Where the face model comes from, and what to check before publishing

The base head model `facecap.glb` is the one used in a three.js example (`webgl_morphtargets_face`). The three.js example credits the model to Face Cap. In this work, after it is loaded, it is deformed to a child's facial proportions, the skin is repainted, and eyes, hair, and a body are added.

**Whether this model may be reshaped and published as part of one's own work has not been confirmed.** three.js itself is under the MIT license, but models included in the examples may come with different terms. Check the terms before publishing this work. If they cannot be confirmed, the model needs to be replaced with a different head model whose terms are clear.

To replace it, change `MODEL_URL` at the top of `js/figure.js`. However, the reshaping process is written to fit this model's dimensions (the positions of the eyes, nose, mouth, and jaw) and the names of its parts. With a different model, the dimension numbers and part names have to be matched again. To animate expressions, you need a model that has ARKit-style expression names (`eyeBlink_L`, `mouthSmile_L`, and so on).

## What was verified, and what could not be

Verified (in a Chromium-based browser, through a static server):

- At 3× speed, from the entrance through the end of service to the next child's appearance. That the expressions change to match the lines, the tears, that the final line is cut off partway, and that the face vanishes abruptly
- Freezing each emotional face one at a time and looking at it (happy, sulking, angry, sad, crying, frightened, clinging, laughing through tears)
- That it runs to the end if left without any replies. The final line and the handover note text in that case
- The return-visit flow (equivalent to 1 hour later), and that pictures line up at the entrance
- A wide screen (1280×800, face on the left) and a 375px-wide portrait screen (face on top). Light and dark color schemes
- The looks of 4 children (that hair length, hairpin, and randoseru color differ)
- That it runs to the end with the face turned off (`?face=off`), with reduced motion, and in an environment where saving fails
- That no errors appear in the console

Could not be verified:

- Running from the entrance to the end at real speed (1×). This version has only been run through at 3× speed and faster. The pauses between lines and the pace at which expressions change may need adjusting after watching at real speed.
- Behavior when `index.html` is opened directly via `file://` (in particular, whether the face appears)
- Behavior in an environment that genuinely cannot reach the CDN (only a substitute for the same path was checked, using `?face=off`)
- Display and performance in Safari and Firefox, and on actual smartphones
- The looks of the fifth child onward
- How the sound actually sounds, and how it sounds with a screen reader
- Whether the face model may be used in a published work
