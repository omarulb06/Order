// ---------------------------------------------------------------------------
// Product Details screen.
//
//   * Swipeable image gallery with pagination dots (falls back to imageUrl)
//   * Name / price / stock badge / aggregate rating header
//   * Expandable description
//   * Ratings & reviews: live aggregate, recent review list, and a
//     "Write a Review" composer (authenticated, non-anonymous users only)
//     backed by the submitProductReview Firestore transaction
//   * Sticky add-to-cart bar with a quantity stepper
//
// Both the product doc and its reviews subcollection stream through
// onSnapshot so ratings/stock update live while the page is open.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';

import { Stars } from '@/components/Stars';
import { db } from '@/lib/firebase';
import { paths } from '@/lib/firestore/paths';
import { productConverter, reviewConverter } from '@/lib/firestore/converters';
import { submitProductReview } from '@/lib/firestore/products';
import { ReviewGuardError } from '@/lib/reviews';
import { formatCurrency, formatDate } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import { useCartStore } from '@/stores/cart';
import { useWishlistStore } from '@/stores/wishlist';
import type { Product, Review } from '@/types/database';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAX_REVIEWS_SHOWN = 50;

export default function ProductDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const addToCart = useCartStore((s) => s.add);
  const lineInCart = useCartStore((s) => s.lines.find((l) => l.product.id === id));
  const isFav = useWishlistStore((s) => (id ? s.ids.includes(id) : false));
  const toggleFav = useWishlistStore((s) => s.toggle);

  const [product, setProduct] = useState<Product | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [activeImage, setActiveImage] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [qty, setQty] = useState(1);

  const [composerOpen, setComposerOpen] = useState(false);
  const [draftRating, setDraftRating] = useState(5);
  const [draftComment, setDraftComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const galleryRef = useRef<FlatList<string>>(null);

  // ---- live product doc ---------------------------------------------------
  useEffect(() => {
    if (!id) return;
    const ref = doc(db, paths.product(id)).withConverter(productConverter);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setProduct(snap.exists() ? snap.data() : null);
        setNotFound(!snap.exists());
      },
      () => setNotFound(true)
    );
    return unsub;
  }, [id]);

  // ---- live reviews (newest first) ---------------------------------------
  useEffect(() => {
    if (!id) return;
    const q = query(
      collection(db, paths.reviews(id)).withConverter(reviewConverter),
      orderBy('createdAt', 'desc'),
      limit(MAX_REVIEWS_SHOWN)
    );
    const unsub = onSnapshot(q, (snap) => {
      setReviews(snap.docs.map((d) => d.data()));
    });
    return unsub;
  }, [id]);

  const galleryImages = useMemo(() => {
    if (!product) return [] as string[];
    if (product.images.length > 0) return product.images;
    return product.imageUrl ? [product.imageUrl] : [];
  }, [product]);

  const outOfStock = !product || !product.isAvailable || product.stockQuantity <= 0;
  const maxQty = product ? Math.max(1, Math.min(product.stockQuantity, 1000)) : 1;
  const hasReviews = (product?.reviewCount ?? 0) > 0;
  const canReview = !!user && !user.isAnonymous;

  const submitReview = async () => {
    if (!user || !product) return;
    const userName =
      profile?.fullName?.trim() ||
      (user.email ? user.email.split('@')[0] : '') ||
      profile?.phoneNumber ||
      'Customer';
    setSubmitting(true);
    try {
      await submitProductReview({
        productId: product.id,
        userId: user.uid,
        userName,
        rating: draftRating,
        comment: draftComment.trim() ? draftComment.trim() : null,
      });
      setComposerOpen(false);
      setDraftRating(5);
      setDraftComment('');
    } catch (err: any) {
      Alert.alert(
        'Could not submit review',
        err instanceof ReviewGuardError ? err.message : err?.message ?? 'Unknown error'
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ---- loading / missing states ------------------------------------------
  if (!product && !notFound) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#0ea5e9" />
      </View>
    );
  }
  if (notFound || !product) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-6">
        <Ionicons name="alert-circle-outline" size={48} color="#be123c" />
        <Text className="mt-2 text-neutral-600">This product is no longer available.</Text>
        <Pressable onPress={() => router.back()} className="mt-4 rounded-xl bg-brand-600 px-4 py-2">
          <Text className="text-white font-semibold">Back to shop</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* ---- image gallery ---- */}
        <View className="bg-neutral-100">
          {galleryImages.length > 0 ? (
            <>
              <FlatList
                ref={galleryRef}
                data={galleryImages}
                keyExtractor={(u, i) => `${u}-${i}`}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) =>
                  setActiveImage(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))
                }
                renderItem={({ item }) => (
                  <Image
                    source={{ uri: item }}
                    style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH }}
                    resizeMode="cover"
                  />
                )}
              />
              {galleryImages.length > 1 && (
                <View className="absolute bottom-3 left-0 right-0 flex-row justify-center">
                  {galleryImages.map((_, i) => (
                    <View
                      key={i}
                      className={`mx-0.5 h-2 w-2 rounded-full ${
                        i === activeImage ? 'bg-brand-600' : 'bg-black/20'
                      }`}
                    />
                  ))}
                </View>
              )}
              <Pressable
                onPress={() => id && toggleFav(id)}
                hitSlop={8}
                className="absolute top-3 right-3 h-10 w-10 rounded-full bg-white/90 items-center justify-center shadow"
              >
                <Ionicons
                  name={isFav ? 'heart' : 'heart-outline'}
                  size={22}
                  color={isFav ? '#e11d48' : '#475569'}
                />
              </Pressable>
            </>
          ) : (
            <View
              style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH * 0.6 }}
              className="items-center justify-center"
            >
              <Ionicons name="image-outline" size={56} color="#94a3b8" />
            </View>
          )}
        </View>

        {/* ---- header info ---- */}
        <View className="px-4 pt-4">
          <View className="flex-row items-start justify-between">
            <Text className="flex-1 pr-3 text-2xl font-bold text-neutral-900">
              {product.name}
            </Text>
            <Text className="text-2xl font-bold text-brand-600">
              {formatCurrency(product.price)}
            </Text>
          </View>

          <View className="mt-2 flex-row items-center">
            <View
              className={`rounded-full px-2.5 py-1 ${
                outOfStock ? 'bg-rose-100' : 'bg-emerald-100'
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  outOfStock ? 'text-rose-700' : 'text-emerald-700'
                }`}
              >
                {outOfStock ? 'Out of stock' : `In stock (${product.stockQuantity})`}
              </Text>
            </View>

            {hasReviews && (
              <View className="ml-3 flex-row items-center">
                <Stars value={product.averageRating} size={14} />
                <Text className="ml-1.5 text-xs font-medium text-neutral-600">
                  {product.averageRating.toFixed(1)}
                </Text>
                <Text className="ml-1 text-xs text-neutral-400">
                  ({product.reviewCount} review{product.reviewCount === 1 ? '' : 's'})
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ---- description ---- */}
        {product.description ? (
          <View className="px-4 mt-4">
            <Text className="text-sm font-semibold text-neutral-700 mb-1">Description</Text>
            <Text
              numberOfLines={expanded ? undefined : 3}
              className="text-sm leading-5 text-neutral-600"
            >
              {product.description}
            </Text>
            {product.description.length > 120 && (
              <Pressable onPress={() => setExpanded((v) => !v)} className="mt-1">
                <Text className="text-xs font-semibold text-brand-700">
                  {expanded ? 'Show less' : 'Read more'}
                </Text>
              </Pressable>
            )}
          </View>
        ) : null}

        {/* ---- ratings & reviews ---- */}
        <View className="px-4 mt-6">
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-bold text-neutral-900">Ratings &amp; reviews</Text>
            {canReview && (
              <Pressable
                onPress={() => setComposerOpen(true)}
                className="rounded-full bg-brand-600 px-3 py-1.5 active:bg-brand-700"
              >
                <Text className="text-xs font-semibold text-white">Write a review</Text>
              </Pressable>
            )}
          </View>

          <View className="mt-3 flex-row items-center rounded-2xl bg-neutral-50 p-4">
            <Text className="text-4xl font-bold text-neutral-900">
              {hasReviews ? product.averageRating.toFixed(1) : '—'}
            </Text>
            <View className="ml-3">
              <Stars value={product.averageRating} size={16} />
              <Text className="mt-0.5 text-xs text-neutral-500">
                {hasReviews
                  ? `${product.reviewCount} review${product.reviewCount === 1 ? '' : 's'}`
                  : 'No reviews yet'}
              </Text>
            </View>
          </View>

          {reviews.length === 0 ? (
            <Text className="mt-3 text-sm text-neutral-500">
              Be the first to share what you think.
            </Text>
          ) : (
            reviews.map((r) => (
              <View key={r.id} className="mt-3 rounded-2xl border border-neutral-100 p-3">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-semibold text-neutral-800" numberOfLines={1}>
                    {r.userName}
                  </Text>
                  <Stars value={r.rating} size={12} />
                </View>
                {r.comment ? (
                  <Text className="mt-1 text-sm text-neutral-600">{r.comment}</Text>
                ) : null}
                {r.createdAt ? (
                  <Text className="mt-1 text-[10px] text-neutral-400">
                    {formatDate(r.createdAt)}
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* ---- sticky add-to-cart bar ---- */}
      <View className="absolute bottom-0 left-0 right-0 border-t border-neutral-200 bg-white px-4 pt-3 pb-6">
        <View className="flex-row items-center">
          <View className="flex-row items-center rounded-full border border-neutral-200">
            <Pressable
              onPress={() => setQty((q) => Math.max(1, q - 1))}
              className="h-10 w-10 items-center justify-center"
            >
              <Ionicons name="remove" size={18} color="#0f172a" />
            </Pressable>
            <Text className="mx-1 min-w-[24px] text-center font-bold">{qty}</Text>
            <Pressable
              onPress={() => setQty((q) => Math.min(maxQty, q + 1))}
              className="h-10 w-10 items-center justify-center"
            >
              <Ionicons name="add" size={18} color="#0f172a" />
            </Pressable>
          </View>

          <Pressable
            disabled={outOfStock}
            onPress={() => {
              addToCart(product, qty);
              router.push('/cart' as any);
            }}
            className={`ml-3 flex-1 items-center rounded-full py-3 ${
              outOfStock ? 'bg-neutral-300' : 'bg-brand-600 active:bg-brand-700'
            }`}
          >
            <Text className="font-bold text-white">
              {outOfStock
                ? 'Out of stock'
                : `${lineInCart ? 'Update cart' : 'Add to cart'} · ${formatCurrency(
                    product.price * qty
                  )}`}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ---- review composer modal ---- */}
      <Modal
        visible={composerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setComposerOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1 justify-end bg-black/40"
        >
          <View className="rounded-t-3xl bg-white p-5 pb-8">
            <View className="flex-row items-center justify-between">
              <Text className="text-lg font-bold">Write a review</Text>
              <Pressable onPress={() => setComposerOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color="#0f172a" />
              </Pressable>
            </View>

            <Text className="mt-4 text-xs font-medium text-neutral-500">Your rating</Text>
            <View className="mt-2">
              <Stars value={draftRating} size={30} onChange={setDraftRating} />
            </View>

            <Text className="mt-4 text-xs font-medium text-neutral-500">
              Your review (optional)
            </Text>
            <TextInput
              value={draftComment}
              onChangeText={setDraftComment}
              placeholder="What did you like or dislike?"
              placeholderTextColor="#94a3b8"
              multiline
              maxLength={1000}
              className="mt-1 min-h-[90px] rounded-xl border border-neutral-200 px-3 py-2.5 text-neutral-900"
            />

            <Pressable
              onPress={submitReview}
              disabled={submitting}
              className={`mt-4 items-center rounded-xl py-3 ${
                submitting ? 'bg-neutral-400' : 'bg-brand-600 active:bg-brand-700'
              }`}
            >
              {submitting ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="font-bold text-white">Submit review</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
