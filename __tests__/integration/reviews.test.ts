// ---------------------------------------------------------------------------
// Ratings & reviews integration suite (Firebase emulator).
//
//   * submitProductReview transaction folds the rating into the product
//     aggregate atomically.
//   * firestore.rules for /products/{id}/reviews/{reviewId}:
//       - guests can read but CANNOT create
//       - clients cannot forge another user's review
//       - rating must be an integer in [1,5]
//       - only the author or staff can update/delete
// ---------------------------------------------------------------------------

import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import {
  clientCtx,
  closeTestEnv,
  describeIfEmulator,
  fs,
  getTestEnv,
  guestCtx,
  seedBaseline,
} from './_harness';
import { submitProductReviewWith } from '@/lib/firestore/products';

describeIfEmulator('product reviews', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => { env = await getTestEnv(); });
  afterAll(async  () => { await closeTestEnv(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seedBaseline(env);
  });

  it('submitting a review updates product aggregate atomically', async () => {
    const ctx = await clientCtx(env, 'client-uid');
    await submitProductReviewWith(fs(ctx), {
      productId: 'prod-margherita',
      userId: 'client-uid',
      userName: 'Cara Client',
      rating: 5,
      comment: 'Superb.',
    });

    await env.withSecurityRulesDisabled(async (c) => {
      const product = (await getDoc(doc(c.firestore(), 'products/prod-margherita'))).data() as any;
      expect(product.reviewCount).toBe(1);
      expect(product.averageRating).toBe(5);

      const revs = await getDocs(collection(c.firestore(), 'products/prod-margherita/reviews'));
      expect(revs.size).toBe(1);
      expect((revs.docs[0].data() as any).rating).toBe(5);
    });
  });

  it('second review folds into the running average', async () => {
    const ctx = await clientCtx(env, 'client-uid');
    await submitProductReviewWith(fs(ctx), {
      productId: 'prod-margherita', userId: 'client-uid', userName: 'Cara Client', rating: 5, comment: null,
    });
    await submitProductReviewWith(fs(ctx), {
      productId: 'prod-margherita', userId: 'client-uid', userName: 'Cara Client', rating: 3, comment: null,
    });

    await env.withSecurityRulesDisabled(async (c) => {
      const product = (await getDoc(doc(c.firestore(), 'products/prod-margherita'))).data() as any;
      expect(product.reviewCount).toBe(2);
      expect(product.averageRating).toBe(4);
    });
  });

  it('transaction rejects invalid ratings before any write', async () => {
    const ctx = await clientCtx(env, 'client-uid');
    await expect(
      submitProductReviewWith(fs(ctx), {
        productId: 'prod-margherita', userId: 'client-uid', userName: 'Cara Client', rating: 0, comment: null,
      })
    ).rejects.toThrow(/between 1 and 5/);

    // No review + no aggregate drift.
    await env.withSecurityRulesDisabled(async (c) => {
      const product = (await getDoc(doc(c.firestore(), 'products/prod-margherita'))).data() as any;
      expect(product.reviewCount ?? 0).toBe(0);
      const revs = await getDocs(collection(c.firestore(), 'products/prod-margherita/reviews'));
      expect(revs.size).toBe(0);
    });
  });

  it('guests CANNOT create a review directly', async () => {
    const ctx = await guestCtx(env);
    await assertFails(
      addDoc(collection(ctx.firestore(), 'products/prod-margherita/reviews'), {
        userId: 'whoever',
        userName: 'Ghost',
        rating: 5,
        comment: null,
        createdAt: Timestamp.now(),
      })
    );
  });

  it('clients CANNOT forge a review as another user', async () => {
    const ctx = await clientCtx(env, 'client-uid');
    await assertFails(
      addDoc(collection(ctx.firestore(), 'products/prod-margherita/reviews'), {
        userId: 'owner-uid',   // ← not the caller
        userName: 'Olga Owner',
        rating: 5,
        comment: null,
        createdAt: Timestamp.now(),
      })
    );
  });

  it('rules reject rating outside [1,5] and fractional ratings', async () => {
    const ctx = await clientCtx(env, 'client-uid');
    for (const bad of [0, 6, 3.5]) {
      await assertFails(
        addDoc(collection(ctx.firestore(), 'products/prod-margherita/reviews'), {
          userId: 'client-uid',
          userName: 'Cara Client',
          rating: bad,
          comment: null,
          createdAt: Timestamp.now(),
        })
      );
    }
  });

  it('only the author (or staff) can update/delete a review', async () => {
    // Seed a review authored by client-uid.
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'products/prod-margherita/reviews/rev-1'), {
        userId: 'client-uid', userName: 'Cara Client', rating: 4, comment: 'ok', createdAt: Timestamp.now(),
      });
    });

    // Another client cannot edit or delete it.
    const other = await clientCtx(env, 'other-client');
    await assertFails(
      updateDoc(doc(other.firestore(), 'products/prod-margherita/reviews/rev-1'), { rating: 1 })
    );
    await assertFails(
      deleteDoc(doc(other.firestore(), 'products/prod-margherita/reviews/rev-1'))
    );

    // The author can.
    const author = await clientCtx(env, 'client-uid');
    await assertSucceeds(
      updateDoc(doc(author.firestore(), 'products/prod-margherita/reviews/rev-1'), { comment: 'updated' })
    );
    await assertSucceeds(
      deleteDoc(doc(author.firestore(), 'products/prod-margherita/reviews/rev-1'))
    );
  });

  it('public can read reviews', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'products/prod-margherita/reviews/rev-1'), {
        userId: 'client-uid', userName: 'Cara Client', rating: 4, comment: 'ok', createdAt: Timestamp.now(),
      });
    });
    const ctx = await guestCtx(env);
    await assertSucceeds(
      getDoc(doc(ctx.firestore(), 'products/prod-margherita/reviews/rev-1'))
    );
  });
});
