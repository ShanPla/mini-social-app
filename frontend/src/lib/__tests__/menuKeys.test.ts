import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { moveFocus } from '../menuKeys';

/* Minimal stand-ins for DOM elements: only focus() and identity matter here */
function makeItems(count: number) {
  return Array.from({ length: count }, () => ({ focus: vi.fn() }));
}

function makeContainer(items: unknown[]) {
  return { querySelectorAll: vi.fn(() => items) } as unknown as HTMLElement;
}

function focusedIndex(items: { focus: ReturnType<typeof vi.fn> }[]) {
  return items.findIndex((item) => item.focus.mock.calls.length > 0);
}

describe('moveFocus', () => {
  let doc: { activeElement: unknown };

  beforeEach(() => {
    doc = { activeElement: null };
    vi.stubGlobal('document', doc);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does nothing without a container or without items', () => {
    expect(moveFocus(null, 'ArrowDown', '[role=menuitem]')).toBe(false);
    expect(moveFocus(makeContainer([]), 'ArrowDown', '[role=menuitem]')).toBe(false);
  });

  it('asks the container for the given selector', () => {
    const container = makeContainer(makeItems(2));
    moveFocus(container, 'Home', '[role=menuitem]');
    expect(container.querySelectorAll).toHaveBeenCalledWith('[role=menuitem]');
  });

  it('ArrowDown starts at the first item when nothing inside is focused', () => {
    const items = makeItems(3);
    expect(moveFocus(makeContainer(items), 'ArrowDown', 'x')).toBe(true);
    expect(focusedIndex(items)).toBe(0);
  });

  it('ArrowUp starts at the last item when nothing inside is focused', () => {
    const items = makeItems(3);
    expect(moveFocus(makeContainer(items), 'ArrowUp', 'x')).toBe(true);
    expect(focusedIndex(items)).toBe(2);
  });

  it('ArrowDown moves to the next item and wraps from the last to the first', () => {
    const items = makeItems(3);
    doc.activeElement = items[0];
    moveFocus(makeContainer(items), 'ArrowDown', 'x');
    expect(items[1].focus).toHaveBeenCalledTimes(1);

    doc.activeElement = items[2];
    moveFocus(makeContainer(items), 'ArrowDown', 'x');
    expect(items[0].focus).toHaveBeenCalledTimes(1);
  });

  it('ArrowUp moves to the previous item and wraps from the first to the last', () => {
    const items = makeItems(3);
    doc.activeElement = items[1];
    moveFocus(makeContainer(items), 'ArrowUp', 'x');
    expect(items[0].focus).toHaveBeenCalledTimes(1);

    doc.activeElement = items[0];
    moveFocus(makeContainer(items), 'ArrowUp', 'x');
    expect(items[2].focus).toHaveBeenCalledTimes(1);
  });

  it('Home and End jump to the first and last item', () => {
    const items = makeItems(4);
    doc.activeElement = items[2];
    expect(moveFocus(makeContainer(items), 'Home', 'x')).toBe(true);
    expect(items[0].focus).toHaveBeenCalledTimes(1);
    expect(moveFocus(makeContainer(items), 'End', 'x')).toBe(true);
    expect(items[3].focus).toHaveBeenCalledTimes(1);
  });

  it('leaves other keys alone and moves no focus', () => {
    const items = makeItems(3);
    expect(moveFocus(makeContainer(items), 'Enter', 'x')).toBe(false);
    expect(moveFocus(makeContainer(items), 'a', 'x')).toBe(false);
    expect(focusedIndex(items)).toBe(-1);
  });
});
