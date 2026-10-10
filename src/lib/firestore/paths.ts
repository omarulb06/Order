// ---------------------------------------------------------------------------
// Collection name constants + path builders.
// Centralised here so a rename is a one-line change and so test code can
// reference the same strings as production.
// ---------------------------------------------------------------------------

export const COL = {
  profiles:       'profiles',
  categories:     'categories',
  products:       'products',
  reviews:        'reviews',
  storeSettings:  'store_settings',
  orders:         'orders',
} as const;

export const STORE_SETTINGS_DOC_ID = 'default';

export const paths = {
  profile:  (uid: string)         => `${COL.profiles}/${uid}`,
  category: (id: string)          => `${COL.categories}/${id}`,
  product:  (id: string)          => `${COL.products}/${id}`,
  reviews:  (productId: string)   => `${COL.products}/${productId}/${COL.reviews}`,
  review:   (productId: string, reviewId: string) =>
    `${COL.products}/${productId}/${COL.reviews}/${reviewId}`,
  settings: ()                    => `${COL.storeSettings}/${STORE_SETTINGS_DOC_ID}`,
  order:    (id: string)          => `${COL.orders}/${id}`,
} as const;
