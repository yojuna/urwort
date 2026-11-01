// Runs ink knots through the dialogue box and turns tags into game actions.
import { Story } from 'inkjs';
import storyJson from './story/main.json';
import { state, save } from './state';
import * as dlg from './ui/dialogue';
import { addSlip, endScreen, hudRefresh, learnRune, originalText } from './ui/cards';
import { bench } from './ui/bench';
import { toast } from './ui/dom';

export interface StoryHost {
  gold(): void;
  goto(scene: string): void;
  telling(): void;
}

const story = new Story(storyJson as unknown as string);
if (state.ink) {
  try { story.state.LoadJson(state.ink); } catch { /* story changed since the save */ }
}

let running = false;
export const isRunning = () => running;

function item(tag: string) {
  const name = tag.slice(6);
  if (tag[5] === '+') {
    if (!state.items.includes(name)) state.items.push(name);
    addSlip(name, true);
    toast('Bekommen: ' + name);
  } else {
    state.items = state.items.filter((i) => i !== name);
  }
  hudRefresh();
}

export async function play(knot: string, host: StoryHost) {
  if (running) return;
  running = true;
  let next: (() => void) | null = null;
  let end = false;
  story.ChoosePathString(knot);
  for (;;) {
    while (story.canContinue) {
      const line = story.Continue()!.trim();
      const tags = story.currentTags ?? [];
      const m = line.match(/^([A-ZÄÖÜ][\wäöüß]*):\s*(.*)$/);
      for (const t of tags) if (t.startsWith('item:')) item(t);
      if (line) await dlg.say(m ? m[1] : '', m ? m[2] : line);
      for (const raw of tags) {
        const t = raw.trim();
        if (t.startsWith('slip:')) addSlip(t.slice(5));
        else if (t.startsWith('rune:')) learnRune(t.slice(5));
        else if (t === 'fx:gold') host.gold();
        else if (t.startsWith('puzzle:')) {
          const [base, rune, target] = t.slice(7).split(',');
          dlg.hide();
          await bench(base, rune, target);
        } else if (t === 'text1812') { dlg.hide(); await originalText(); }
        else if (t.startsWith('scene:')) { const s = t.slice(6); next = () => host.goto(s); }
        else if (t === 'telling') next = () => host.telling();
        else if (t === 'end') end = true;
      }
    }
    const choices = story.currentChoices;
    if (!choices.length) break;
    const i = await dlg.choose(choices.map((c) => c.text));
    story.ChooseChoiceIndex(i);
    await dlg.say('Du', choices[i].text);
  }
  dlg.hide();
  state.ink = story.state.ToJson();
  save();
  running = false;
  if (end) await endScreen();
  if (next) (next as () => void)();
}
