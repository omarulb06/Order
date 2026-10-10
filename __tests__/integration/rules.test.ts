// ---------------------------------------------------------------------------
// Firestore Security Rules — permission matrix.
// Verifies the exact invariants the user asked for during the migration:
//
//   * profiles: self read/write, role field locked, owners can read all
//   * products / categories: public read, owner-only write
//   * store_settings: public read, owner-only write
//   * orders:
//       - guests cannot list / enumerate
//       - clients can only read orders where userId == their uid
//       - staff can read all
//       - clients may only transition status via the owner path (rejected)
// ---------------------------------------------------------------------------

import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  clientCtx,
  closeTestEnv,
  describeIfEmulator,
  getTestEnv,
  guestCtx,
  ownerCtx,
  seedBaseline,
} from './_harness';

describeIfEmulator('firestore.rules', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await getTestEnv();
  });
  afterAll(async () => {
    await closeTestEnv();
  });
  beforeEach(async () => {
    await env.clearFirestore();
    await seedBaseline(env);
  });

  describe('/profiles/{uid}', () => {
    it('owner can read any profile', async () => {
      const ctx = await ownerCtx(env);
      await assertSucceeds(getDoc(doc(ctx.firestore(), 'profiles/client-uid')));
    });

    it('client cannot read a different client profile', async () => {
      const ctx = await clientCtx(env, 'client-uid');
      await assertFails(getDoc(doc(ctx.firestore(), 'profiles/owner-uid')));
    });

    it('client can read own profile', async () => {
      const ctx = await clientCtx(env, 'client-uid');
      await assertSucceeds(getDoc(doc(ctx.firestore(), 'profiles/client-uid')));
    });

    it('client CANNOT change their own role (privilege escalation guard)', async () => {
      const ctx = await clientCtx(env, 'client-uid');
      await assertFails(
        updateDoc(doc(ctx.firestore(), 'profiles/client-uid'), { role: 'owner' })
      );
    });

    it('client CAN update other fields on their own profile', async () => {
      const ctx = await clientCtx(env, 'client-uid');
      await assertSucceeds(
        updateDoc(doc(ctx.firestore(), 'profiles/client-uid'), { fullName: 'Cara C.' })
      );
    });

    it('owner CAN promote a client to admin', async () => {
      const ctx = await ownerCtx(env);
      await assertSucceeds(
        updateDoc(doc(ctx.firestore(), 'profiles/client-uid'), { role: 'admin' })
      );
    });

    it('new signup must self-create with role=client (not owner)', async () => {
      const ctx = await clientCtx(env, 'brand-new-uid');
      await assertFails(
        setDoc(doc(ctx.firestore(), 'profiles/brand-new-uid'), {
          email: 'new@test.local',
          role: 'owner',
          fullName: 'New',
          phoneNumber: null,
          address: null,
        })
      );
      await assertSucceeds(
        setDoc(doc(ctx.firestore(), 'profiles/brand-new-uid'), {
          email: 'new@test.local',
          role: 'client',
          fullName: 'New',
          phoneNumber: null,
          address: null,
        })
      );
    });
  });

  describe('/products/{id}', () => {
    it('guests can read products (public menu)', async () => {
      const ctx = await guestCtx(env);
      await assertSucceeds(getDoc(doc(ctx.firestore(), 'products/prod-margherita')));
    });

    it('guests CANNOT write products', async () => {
      const ctx = await guestCtx(env);
      await assertFails(
        updateDoc(doc(ctx.firestore(), 'products/prod-margherita'), { price: 1 })
      );
    });

    it('clients CANNOT edit product price (owner-only)', async () => {
      const ctx = await clientCtx(env, 'client-uid');
      await assertFails(
        updateDoc(doc(ctx.firestore(), 'products/prod-margherita'), { price: 1 })
      );
    });

    it('owner CAN edit product', async () => {
      const ctx = await ownerCtx(env);
      await assertSucceeds(
        updateDoc(doc(ctx.firestore(), 'products/prod-margherita'), { price: 44 })
      );
    });
  });

  describe('/store_settings/{doc}', () => {
    it('guests can read settings (needed for public menu)', async () => {
      const ctx = await guestCtx(env);
      await assertSucceeds(getDoc(doc(ctx.firestore(), 'store_settings/default')));
    });

    it('clients CANNOT write settings', async () => {
      const ctx = await clientCtx(env, 'client-uid');
      await assertFails(
        updateDoc(doc(ctx.firestore(), 'store_settings/default'), { deliveryFee: 1 })
      );
    });

    it('owner CAN write settings', async () => {
      const ctx = await ownerCtx(env);
      await assertSucceeds(
        updateDoc(doc(ctx.firestore(), 'store_settings/default'), { deliveryFee: 20 })
      );
    });
  });

  describe('/orders/{id}', () => {
    beforeEach(async () => {
      // seed a client-owned order through the admin context
      await env.withSecurityRulesDisabled(async (c) => {
        const { Timestamp } = await import('firebase/firestore');
        await setDoc(doc(c.firestore(), 'orders/order-client'), {
          userId: 'client-uid',
          customerName: 'Cara Client',
          phoneNumber: '+972501110003',
          deliveryAddress: null,
          fulfillmentType: 'pickup',
          paymentMethod: 'cash',
          status: 'pending',
          subtotal: 42, deliveryFee: 0, totalAmount: 42,
          items: [{ productId: 'prod-margherita', productName: 'Margherita', quantity: 1, unitPrice: 42, subtotal: 42 }],
          notes: null,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      });
    });

    it('guests CANNOT list the orders collection (anti-enumeration)', async () => {
      const ctx = await guestCtx(env);
      await assertFails(getDocs(collection(ctx.firestore(), 'orders')));
    });

    it('guests CANNOT read a specific order by id either', async () => {
      const ctx = await guestCtx(env);
      await assertFails(getDoc(doc(ctx.firestore(), 'orders/order-client')));
    });

    it('clients can read their OWN order', async () => {
      const ctx = await clientCtx(env, 'client-uid');
      await assertSucceeds(getDoc(doc(ctx.firestore(), 'orders/order-client')));
    });

    it('clients CANNOT read someone else\'s order', async () => {
      const ctx = await clientCtx(env, 'other-client');
      await assertFails(getDoc(doc(ctx.firestore(), 'orders/order-client')));
    });

    it('owner can read any order', async () => {
      const ctx = await ownerCtx(env);
      await assertSucceeds(getDoc(doc(ctx.firestore(), 'orders/order-client')));
    });

    it('clients CANNOT update order status', async () => {
      const ctx = await clientCtx(env, 'client-uid');
      await assertFails(
        updateDoc(doc(ctx.firestore(), 'orders/order-client'), { status: 'preparing' })
      );
    });

    it('owner CAN update legal transitions', async () => {
      const ctx = await ownerCtx(env);
      await assertSucceeds(
        updateDoc(doc(ctx.firestore(), 'orders/order-client'), { status: 'preparing' })
      );
    });

    it('owner CANNOT make illegal transitions (delivered -> preparing)', async () => {
      // bump to delivered first via admin
      await env.withSecurityRulesDisabled(async (c) => {
        await updateDoc(doc(c.firestore(), 'orders/order-client'), { status: 'delivered' });
      });
      const ctx = await ownerCtx(env);
      await assertFails(
        updateDoc(doc(ctx.firestore(), 'orders/order-client'), { status: 'preparing' })
      );
    });
  });
});
