import {
  aggregateFromRatings,
  assertAuthor,
  assertComment,
  assertRating,
  computeReviewAggregate,
  MAX_REVIEW_COMMENT,
  ReviewGuardError,
} from '@/lib/reviews';

describe('assertRating', () => {
  it.each([1, 2, 3, 4, 5])('accepts %i', (r) => {
    expect(() => assertRating(r)).not.toThrow();
  });

  it.each([0, 6, -1, 99])('rejects out-of-range %i', (r) => {
    expect(() => assertRating(r)).toThrow(/between 1 and 5/);
  });

  it.each([1.5, 4.2, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects non-integer %s',
    (r) => {
      expect(() => assertRating(r)).toThrow(ReviewGuardError);
    }
  );

  it.each(['5', null, undefined, {}, []])('rejects non-number %s', (r) => {
    expect(() => assertRating(r)).toThrow(/must be a number/);
  });
});

describe('assertComment', () => {
  it('accepts null / undefined / short text', () => {
    expect(() => assertComment(null)).not.toThrow();
    expect(() => assertComment(undefined)).not.toThrow();
    expect(() => assertComment('great!')).not.toThrow();
  });

  it('accepts exactly MAX_REVIEW_COMMENT chars', () => {
    expect(() => assertComment('a'.repeat(MAX_REVIEW_COMMENT))).not.toThrow();
  });

  it('rejects longer than MAX_REVIEW_COMMENT', () => {
    expect(() => assertComment('a'.repeat(MAX_REVIEW_COMMENT + 1))).toThrow(
      /may not exceed/
    );
  });
});

describe('assertAuthor', () => {
  it('rejects empty / blank names', () => {
    expect(() => assertAuthor('')).toThrow(/required/);
    expect(() => assertAuthor('   ')).toThrow(/required/);
    expect(() => assertAuthor(null)).toThrow(/required/);
  });

  it('accepts a normal name', () => {
    expect(() => assertAuthor('Cara Client')).not.toThrow();
  });
});

describe('computeReviewAggregate', () => {
  it('first review becomes the average', () => {
    expect(computeReviewAggregate({ averageRating: 0, reviewCount: 0 }, 5)).toEqual({
      averageRating: 5,
      reviewCount: 1,
    });
  });

  it('folds into a running average', () => {
    const agg = computeReviewAggregate({ averageRating: 5, reviewCount: 1 }, 4);
    expect(agg).toEqual({ averageRating: 4.5, reviewCount: 2 });
  });

  it('rounds to 2 decimals (no float noise)', () => {
    const agg = computeReviewAggregate({ averageRating: 4.5, reviewCount: 2 }, 3);
    expect(agg.averageRating).toBe(4); // (9+3)/3 = 4
    expect(agg.reviewCount).toBe(3);
  });

  it('handles long fractional results', () => {
    const agg = computeReviewAggregate({ averageRating: 4.33, reviewCount: 3 }, 5);
    // (4.33*3 + 5)/4 = 17.99/4 = 4.4975 → 4.5
    expect(agg.averageRating).toBe(4.5);
  });

  it('recovers gracefully from corrupt state', () => {
    const agg = computeReviewAggregate(
      { averageRating: Number.NaN, reviewCount: -3 },
      4
    );
    expect(agg).toEqual({ averageRating: 4, reviewCount: 1 });
  });
});

describe('aggregateFromRatings', () => {
  it('empty list → zeroed aggregate', () => {
    expect(aggregateFromRatings([])).toEqual({ averageRating: 0, reviewCount: 0 });
  });

  it('matches the seed fixtures (5,4 → 4.5/2)', () => {
    expect(aggregateFromRatings([5, 4])).toEqual({
      averageRating: 4.5,
      reviewCount: 2,
    });
  });

  it('single rating', () => {
    expect(aggregateFromRatings([4])).toEqual({ averageRating: 4, reviewCount: 1 });
  });
});
