import { mergeWishlistIds, useWishlistStore } from '@/stores/wishlist';

describe('mergeWishlistIds', () => {
  it('unions remote + local without duplicates', () => {
    expect(mergeWishlistIds(['a', 'b'], ['b', 'c'])).toEqual(['b', 'c', 'a']);
  });
  it('remote order wins for shared ids', () => {
    expect(mergeWishlistIds(['x'], ['a', 'x'])).toEqual(['a', 'x']);
  });
  it('handles empty inputs', () => {
    expect(mergeWishlistIds([], [])).toEqual([]);
    expect(mergeWishlistIds(['a'], [])).toEqual(['a']);
    expect(mergeWishlistIds([], ['r'])).toEqual(['r']);
  });
});

describe('useWishlistStore', () => {
  beforeEach(() => {
    useWishlistStore.setState({ ids: [] });
  });

  it('toggle adds and removes ids', () => {
    const { toggle } = useWishlistStore.getState();
    toggle('p1');
    expect(useWishlistStore.getState().ids).toEqual(['p1']);
    expect(useWishlistStore.getState().isFav('p1')).toBe(true);

    toggle('p1');
    expect(useWishlistStore.getState().ids).toEqual([]);
    expect(useWishlistStore.getState().isFav('p1')).toBe(false);
  });

  it('multiple toggles accumulate unique ids', () => {
    const { toggle } = useWishlistStore.getState();
    toggle('a');
    toggle('b');
    toggle('a');
    toggle('c');
    expect(useWishlistStore.getState().ids).toEqual(['b', 'c']);
  });

  it('clearLocal empties the list', () => {
    const { toggle, clearLocal } = useWishlistStore.getState();
    toggle('a');
    clearLocal();
    expect(useWishlistStore.getState().ids).toEqual([]);
  });
});
