// ---------------------------------------------------------------------------
// Product + review Firestore helpers.
//
// submitProductReview is the atomic companion to the review subcollection:
//
//   1. READ products/{productId} (current aggregate)
//   2. WRITE products/{productId}/reviews/{newId}
//   3. WRITE products/{productId} with folded-in averageRating / reviewCount
//
// All-or-nothing: a validation failure or contention retry never leaves a
// dangling review or a stale aggregate.
// ---------------------------------------------------------------------------

import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { paths } from './paths';
import {
  assertAuthor,
  assertComment,
  assertRating,
  computeReviewAggregate,
  ReviewGuardError,
} from '@/lib/reviews';
import type { Product, Review } from '@/types/database';

export interface SubmitReviewInput {
  productId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string | null;
}

/**
 * Atomically write a review and fold its rating into the product's
 * aggregate fields. Returns the plain-JSON review for optimistic UI.
 */
export async function submitProductReview(input: SubmitReviewInput): Promise<Review> {
  return submitProductReviewWith(db, input);
}

export async function submitProductReviewWith(
  firestore: Firestore,
  input: SubmitReviewInput
): Promise<Review> {
  // ---- sync guards (mirror firestore.rules) -------------------------------
  assertRating(input.rating);
  assertComment(input.comment);
  assertAuthor(input.userName);
  if (!input.userId) {
    throw new ReviewGuardError('Review author id is required.', 'missing_author');
  }

  const productRef = doc(firestore, paths.product(input.productId));
  const reviewRef = doc(collection(firestore, paths.reviews(input.productId)));

  return runTransaction(firestore, async (tx) => {
    // ---- READ phase (before any writes) ----------------------------------
    const productSnap = await tx.get(productRef);
    if (!productSnap.exists()) {
      throw new ReviewGuardError(
        'This product no longer exists.',
        'missing_author'
      );
    }
    const product = productSnap.data() as Product;

    const nextAggregate = computeReviewAggregate(
      {
        averageRating: Number(product.averageRating ?? 0),
        reviewCount: Number(product.reviewCount ?? 0),
      },
      input.rating
    );

    // ---- WRITE phase ------------------------------------------------------
    tx.set(reviewRef, {
      userId: input.userId,
      userName: input.userName.trim(),
      rating: input.rating,
      comment: input.comment ?? null,
      createdAt: serverTimestamp(),
    });
    tx.update(productRef, {
      averageRating: nextAggregate.averageRating,
      reviewCount: nextAggregate.reviewCount,
      updatedAt: serverTimestamp(),
    });

    return {
      id: reviewRef.id,
      userId: input.userId,
      userName: input.userName.trim(),
      rating: input.rating,
      comment: input.comment ?? null,
      createdAt: new Date().toISOString(),
    } satisfies Review;
  });
}
