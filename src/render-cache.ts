// Stream Deck repaints a key whenever setImage / setTitle / setState is called,
// even when the value is identical. On a 5-second poll loop that produces a
// visible flicker. We keep the last-set value per action id and skip redundant
// SDK calls.

type Renderable = {
  readonly id: string;
  setTitle(title?: string): Promise<void>;
  setImage(image?: string): Promise<void>;
};

type StatefulRenderable = Renderable & {
  setState(state: 0 | 1): Promise<void>;
};

const lastTitle = new Map<string, string | undefined>();
const lastImage = new Map<string, string | undefined>();
const lastState = new Map<string, 0 | 1>();

export async function setTitleIfChanged(action: Renderable, title: string | undefined): Promise<void> {
  if (lastTitle.has(action.id) && lastTitle.get(action.id) === title) return;
  lastTitle.set(action.id, title);
  await action.setTitle(title);
}

export async function setImageIfChanged(action: Renderable, image: string | undefined): Promise<void> {
  if (lastImage.has(action.id) && lastImage.get(action.id) === image) return;
  lastImage.set(action.id, image);
  await action.setImage(image);
}

export async function setStateIfChanged(action: StatefulRenderable, state: 0 | 1): Promise<void> {
  if (lastState.get(action.id) === state) return;
  lastState.set(action.id, state);
  await action.setState(state);
}

/**
 * Drop cached render values for an action. Call when the action disappears so a
 * later reappear renders fresh — the SDK might have repainted the key in the
 * interim and our cache could otherwise incorrectly skip it.
 */
export function forgetAction(actionId: string): void {
  lastTitle.delete(actionId);
  lastImage.delete(actionId);
  lastState.delete(actionId);
}
