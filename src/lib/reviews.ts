// ---------------------------------------------------------------------------
// Pure review-domain helpers. No Firebase / RN imports so they run under
// plain Jest in Node. The Firestore transaction in
// src/lib/firestore/products.ts consumes these; firestore.rules mirrors
// the same validation.
// ---------------------------------------------------------------------------

export const MIN_RATING = 1;
export const MAX_RATING = 5;
export const MAX_REVIEW_COMMENT = 1000;
export const MAX_REVIEW_AUTHOR = 200;

export class ReviewGuardError extends Error {
  code:
    | 'invalid_rating'
    | 'comment_too_long'
    | 'missing_author'
    | 'author_too_long';
  constructor(message: string, code: ReviewGuardError['code']) {
    super(message);
    this.name = 'ReviewGuardError';
    this.code = code;
  }
}

/** Rating must be an integer in [1, 5]. */
export function assertRating(rating: unknown): asserts rating is number {
  if (typeof rating !== 'number' || !Number.isFinite(rating)) {
    throw new ReviewGuardError('Rating must be a number.', 'invalid_rating');
  }
  if (!Number.isInteger(rating)) {
    throw new ReviewGuardError(
      `Rating must be a whole number (got ${rating}).`,
      'invalid_rating'
    );
  }
  if (rating < MIN_RATING || rating > MAX_RATING) {
    throw new ReviewGuardError(
      `Rating must be between ${MIN_RATING} and ${MAX_RATING} (got ${rating}).`,
      'invalid_rating'
    );
  }
}

/** Comment is optional; when present it must respect the length cap. */
export function assertComment(comment: string | null | undefined): void {
  if (comment == null) return;
  if (comment.length > MAX_REVIEW_COMMENT) {
    throw new ReviewGuardError(
      `Review comment may not exceed ${MAX_REVIEW_COMMENT} characters.`,
      'comment_too_long'
    );
  }
}

/** Display name attached to the review. */
export function assertAuthor(userName: string | null | undefined): void {
  if (!userName || !userName.trim()) {
    throw new ReviewGuardError('Review author name is required.', 'missing_author');
  }
  if (userName.length > MAX_REVIEW_AUTHOR) {
    throw new ReviewGuardError(
      `Review author name may not exceed ${MAX_REVIEW_AUTHOR} characters.`,
      'author_too_long'
    );
  }
}

export interface ReviewAggregate {
  averageRating: number;
  reviewCount: number;
}

/**
 * Fold a new rating into the running aggregate. Rounded to 2 decimals so
 * the UI never renders 4.3333333333.
 */
export function computeReviewAggregate(
  current: ReviewAggregate,
  newRating: number
): ReviewAggregate {
  const count = Math.max(0, Number(current.reviewCount) || 0);
  const avg = Number(current.averageRating) || 0;
  const total = avg * count + newRating;
  const nextCount = count + 1;
  return {
    averageRating: round2(total / nextCount),
    reviewCount: nextCount,
  };
}

/**
 * Recompute an aggregate from scratch (used by the seed scripts so the
 * stored average always matches the stored reviews).
 */
export function aggregateFromRatings(ratings: number[]): ReviewAggregate {
  if (ratings.length === 0) return { averageRating: 0, reviewCount: 0 };
  const total = ratings.reduce((s, r) => s + r, 0);
  return {
    averageRating: round2(total / ratings.length),
    reviewCount: ratings.length,
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
