import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const remove = vi.fn();
const from = vi.fn<(bucket: string) => { remove: typeof remove }>(() => ({ remove }));

vi.mock('../supabaseClient', () => ({
  supabase: { rpc: (name: string) => rpc(name), storage: { from: (bucket: string) => from(bucket) } },
}));

import { removeUserChatImages } from '../storage';

describe('removeUserChatImages', () => {
  beforeEach(() => {
    rpc.mockReset();
    remove.mockReset();
    from.mockClear();
    remove.mockResolvedValue({ data: [], error: null });
  });

  it('removes every path the database lists, in batches of 100', async () => {
    const paths = Array.from({ length: 150 }, (_, i) => `c1/u1/${i}.jpg`);
    rpc.mockResolvedValue({ data: paths, error: null });
    await removeUserChatImages();
    expect(rpc).toHaveBeenCalledWith('my_chat_image_paths');
    expect(from).toHaveBeenCalledWith('chat-images');
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove.mock.calls[0][0]).toHaveLength(100);
    expect(remove.mock.calls[1][0]).toEqual(paths.slice(100));
  });

  it('does nothing when there are no photos or the lookup fails', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await removeUserChatImages();
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'nope' } });
    await removeUserChatImages();
    expect(remove).not.toHaveBeenCalled();
  });
});
