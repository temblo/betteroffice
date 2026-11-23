import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, expect, it } from 'bun:test';
import { PresentationShell } from './PresentationShell';

const ownsDom = !GlobalRegistrator.isRegistered;
if (ownsDom) GlobalRegistrator.register();
const { act, cleanup, fireEvent, render } = await import('@testing-library/react');
afterEach(cleanup);
afterAll(async () => {
  if (ownsDom && GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister();
});

const shell = (onExit = () => {}) => (
  <PresentationShell
    slideCount={3}
    startIndex={0}
    label="Presentation"
    counterLabel={(current, total) => `${current} of ${total}`}
    exitLabel="Exit"
    previousLabel="Previous"
    nextLabel="Next"
    controls={(controls) => (
      <>
        <span>{`host ${controls.current} / ${controls.total}`}</span>
        <button type="button" onClick={controls.next}>Forward</button>
        <button type="button" onClick={controls.exit}>Stop</button>
      </>
    )}
    onExit={onExit}
  >
    {(index) => <span>{`slide ${index}`}</span>}
  </PresentationShell>
);

const touch = (target: Element, from: number, to: number) => {
  fireEvent.pointerDown(target, { pointerType: 'touch', clientX: from, clientY: 100 });
  fireEvent.pointerUp(target, { pointerType: 'touch', clientX: to, clientY: 100 });
  fireEvent.click(target);
};

it('draws the host controls in place of the default ones', () => {
  let exits = 0;
  const view = render(shell(() => exits++));
  expect(view.queryByRole('button', { name: 'Next' })).toBeNull();
  expect(view.getByText('host 1 / 3')).toBeTruthy();
  fireEvent.click(view.getByText('Forward'));
  expect(view.getByText('host 2 / 3')).toBeTruthy();
  fireEvent.click(view.getByText('Stop'));
  expect(exits).toBe(1);
});

it('swipes between slides, and a tap on hidden controls only shows them', async () => {
  const view = render(shell());
  const dialog = view.getByRole('dialog', { hidden: true });
  expect(dialog.style.touchAction).toBe('none');
  const layer = view.getByText('host 1 / 3').parentElement!;
  touch(dialog, 300, 100);
  expect(view.getByText('slide 1')).toBeTruthy();
  touch(dialog, 100, 300);
  expect(view.getByText('slide 0')).toBeTruthy();
  touch(dialog, 200, 200);
  expect(view.getByText('slide 1')).toBeTruthy();
  await act(() => new Promise((resolve) => setTimeout(resolve, 2700)));
  expect(layer.style.visibility).toBe('hidden');
  touch(dialog, 200, 200);
  expect(view.getByText('slide 1')).toBeTruthy();
  expect(layer.style.visibility).toBe('visible');
});
