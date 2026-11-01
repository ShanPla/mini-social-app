import { describe, it, expect } from 'vitest';
import { imageExtension } from '../images';

const file = (name: string, type: string) => new File(['x'], name, { type });

describe('imageExtension', () => {
  it('maps the MIME type, ignoring the file name', () => {
    expect(imageExtension(file('0.photo', 'image/jpeg'))).toBe('jpg');
    expect(imageExtension(file('PIC.JPG', 'image/jpeg'))).toBe('jpg');
    expect(imageExtension(file('a', 'image/png'))).toBe('png');
    expect(imageExtension(file('a', 'image/webp'))).toBe('webp');
    expect(imageExtension(file('a', 'image/gif'))).toBe('gif');
  });

  it('falls back to a clean lower-case name suffix, then jpg', () => {
    expect(imageExtension(file('shot.HEIC', 'image/heic'))).toBe('heic');
    expect(imageExtension(file('photo', ''))).toBe('jpg');
    expect(imageExtension(file('x.not an ext', ''))).toBe('jpg');
  });
});
