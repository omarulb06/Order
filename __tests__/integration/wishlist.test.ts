// ---------------------------------------------------------------------------
// /profiles/{uid}/wishlist/{productId} rules — each user manages only
// their own favorites; guests are fully locked out of the subcollection.
// ---------------------------------------------------------------------------

import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  clientCtx,
  closeTestEnv,
  describeIfEmulator,
  getTestEnv,
  guestCtx,
  seedBaseline,
} from './_harness';

describeIfEmulator('wishlist rules', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => { env = await getTestEnv(); });
  afterAll(async  () => { await closeTestEnv(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seedBaseline(env);
  });

  it('a client can add, read, and remove their own favorites', async () => {
    const ctx = await clientCtx(env, 'client-uid');
    const ref = doc(ctx.firestore(), 'profiles/client-uid/wishlist/prod-margherita');

    await assertSucceeds(
      setDoc(ref, { productId: 'prod-margherita', addedAt: serverTimestamp() })
    );
    await assertSucceeds(getDocs(collection(ctx.firestore(), 'profiles/client-uid/wishlist')));
    await assertSucceeds(deleteDoc(ref));
  });

  it('doc id and productId field must match (no forged ids)', async () => {
    const ctx = await clientCtx(env, 'client-uid');
    await assertFails(
      setDoc(doc(ctx.firestore(), 'profiles/client-uid/wishlist/prod-a'), {
        productId: 'prod-b',
        addedAt: serverTimestamp(),
      })
    );
  });

  it("a client CANNOT read or write another user's wishlist", async () => {
    const other = await clientCtx(env, 'other-client');
    await assertFails(
      getDocs(collection(other.firestore(), 'profiles/client-uid/wishlist'))
    );
    await assertFails(
      setDoc(doc(other.firestore(), 'profiles/client-uid/wishlist/prod-x'), {
        productId: 'prod-x',
        addedAt: serverTimestamp(),
      })
    );
    await assertFails(
      deleteDoc(doc(other.firestore(), 'profiles/client-uid/wishlist/prod-x'))
    );
  });

  it('guests are fully locked out', async () => {
    const ctx = await guestCtx(env);
    await assertFails(
      getDocs(collection(ctx.firestore(), 'profiles/client-uid/wishlist'))
    );
    await assertFails(
      setDoc(doc(ctx.firestore(), 'profiles/client-uid/wishlist/prod-x'), {
        productId: 'prod-x',
        addedAt: serverTimestamp(),
      })
    );
  });
});
