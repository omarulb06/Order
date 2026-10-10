import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COL, paths } from '@/lib/firestore/paths';
import { categoryConverter, productConverter } from '@/lib/firestore/converters';
import { formatCurrency } from '@/lib/format';
import type { Category, Product } from '@/types/database';

interface Draft {
  id?: string;
  name: string;
  description: string;
  price: string;
  stockQuantity: string;
  imageUrl: string;
  categoryId: string | null;
  isAvailable: boolean;
}

const EMPTY_DRAFT: Draft = {
  name: '',
  description: '',
  price: '0',
  stockQuantity: '0',
  imageUrl: '',
  categoryId: null,
  isAvailable: true,
};

export default function InventoryScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const prodsQ = query(
      collection(db, COL.products).withConverter(productConverter),
      orderBy('name', 'asc')
    );
    const catsQ = query(
      collection(db, COL.categories).withConverter(categoryConverter),
      orderBy('sortOrder', 'asc')
    );
    const [prodsSnap, catsSnap] = await Promise.all([getDocs(prodsQ), getDocs(catsQ)]);
    setProducts(prodsSnap.docs.map((d) => d.data()));
    setCategories(catsSnap.docs.map((d) => d.data()));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => setEditing({ ...EMPTY_DRAFT });

  const openEdit = (p: Product) =>
    setEditing({
      id: p.id,
      name: p.name,
      description: p.description ?? '',
      price: String(p.price),
      stockQuantity: String(p.stockQuantity),
      imageUrl: p.imageUrl ?? '',
      categoryId: p.categoryId ?? null,
      isAvailable: p.isAvailable,
    });

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      Alert.alert('Name is required.');
      return;
    }
    const price = Number(editing.price);
    const stock = Number.parseInt(editing.stockQuantity, 10);
    if (!Number.isFinite(price) || price < 0) {
      Alert.alert('Price must be a non-negative number.');
      return;
    }
    if (Number.isNaN(stock) || stock < 0) {
      Alert.alert('Stock must be a non-negative integer.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name:          editing.name.trim(),
        description:   editing.description.trim() || null,
        price,
        stockQuantity: stock,
        imageUrl:      editing.imageUrl.trim() || null,
        categoryId:    editing.categoryId,
        isAvailable:   editing.isAvailable,
        updatedAt:     serverTimestamp(),
      };
      if (editing.id) {
        await updateDoc(doc(db, paths.product(editing.id)), payload);
      } else {
        await addDoc(collection(db, COL.products), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      setEditing(null);
      await load();
    } catch (err: any) {
      Alert.alert('Save failed', err?.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const remove = (p: Product) => {
    Alert.alert('Delete product?', `"${p.name}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, paths.product(p.id)));
            await load();
          } catch (err: any) {
            Alert.alert('Delete failed', err?.message ?? 'Unknown error');
          }
        },
      },
    ]);
  };

  const toggleAvailable = async (p: Product) => {
    try {
      await updateDoc(doc(db, paths.product(p.id)), {
        isAvailable: !p.isAvailable,
        updatedAt: serverTimestamp(),
      });
      setProducts((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, isAvailable: !p.isAvailable } : x))
      );
    } catch (err: any) {
      Alert.alert('Update failed', err?.message ?? 'Unknown error');
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#0ea5e9" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-neutral-50">
      <FlatList
        data={products}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
        renderItem={({ item }) => (
          <View className="bg-white rounded-xl p-3 mb-2 flex-row items-center">
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} className="w-14 h-14 rounded-lg" />
            ) : (
              <View className="w-14 h-14 rounded-lg bg-neutral-100 items-center justify-center">
                <Ionicons name="image-outline" size={22} color="#94a3b8" />
              </View>
            )}
            <View className="flex-1 ml-3">
              <Text className="font-semibold" numberOfLines={1}>
                {item.name}
              </Text>
              <Text className="text-xs text-neutral-500">
                {formatCurrency(item.price)} · stock {item.stockQuantity}
              </Text>
            </View>
            <View className="items-end">
              <View className="flex-row items-center">
                <Switch value={item.isAvailable} onValueChange={() => toggleAvailable(item)} />
              </View>
              <View className="flex-row mt-1">
                <Pressable onPress={() => openEdit(item)} className="p-1">
                  <Ionicons name="pencil" size={16} color="#0369a1" />
                </Pressable>
                <Pressable onPress={() => remove(item)} className="p-1">
                  <Ionicons name="trash-outline" size={16} color="#be123c" />
                </Pressable>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View className="items-center mt-20">
            <Ionicons name="pricetags-outline" size={44} color="#94a3b8" />
            <Text className="mt-2 text-neutral-500">No products yet.</Text>
          </View>
        }
      />

      <Pressable
        onPress={openCreate}
        className="absolute right-5 bottom-6 h-14 w-14 rounded-full bg-brand-600 items-center justify-center shadow-lg"
      >
        <Ionicons name="add" size={28} color="white" />
      </Pressable>

      <Modal visible={!!editing} animationType="slide" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1 bg-white"
        >
          <View className="flex-row items-center p-4 border-b border-neutral-200">
            <Pressable onPress={() => setEditing(null)}>
              <Ionicons name="close" size={24} color="#0f172a" />
            </Pressable>
            <Text className="ml-3 text-lg font-bold">
              {editing?.id ? 'Edit product' : 'New product'}
            </Text>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
            {editing && (
              <>
                <Field
                  label="Name"
                  value={editing.name}
                  onChange={(v) => setEditing({ ...editing, name: v })}
                />
                <Field
                  label="Description"
                  value={editing.description}
                  onChange={(v) => setEditing({ ...editing, description: v })}
                  multiline
                />
                <Field
                  label="Price (USD)"
                  value={editing.price}
                  onChange={(v) => setEditing({ ...editing, price: v })}
                  keyboardType="decimal-pad"
                />
                <Field
                  label="Stock quantity"
                  value={editing.stockQuantity}
                  onChange={(v) => setEditing({ ...editing, stockQuantity: v })}
                  keyboardType="number-pad"
                />
                <Field
                  label="Image URL"
                  value={editing.imageUrl}
                  onChange={(v) => setEditing({ ...editing, imageUrl: v })}
                  autoCapitalize="none"
                />

                <Text className="text-xs font-medium text-neutral-500 mt-3 mb-1">Category</Text>
                <View className="flex-row flex-wrap">
                  <Pressable
                    onPress={() => setEditing({ ...editing, categoryId: null })}
                    className={`mr-2 mb-2 px-3 py-1.5 rounded-full border ${
                      editing.categoryId === null
                        ? 'bg-brand-600 border-brand-600'
                        : 'bg-white border-neutral-200'
                    }`}
                  >
                    <Text
                      className={`text-xs ${
                        editing.categoryId === null ? 'text-white' : 'text-neutral-700'
                      }`}
                    >
                      Uncategorized
                    </Text>
                  </Pressable>
                  {categories.map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => setEditing({ ...editing, categoryId: c.id })}
                      className={`mr-2 mb-2 px-3 py-1.5 rounded-full border ${
                        editing.categoryId === c.id
                          ? 'bg-brand-600 border-brand-600'
                          : 'bg-white border-neutral-200'
                      }`}
                    >
                      <Text
                        className={`text-xs ${
                          editing.categoryId === c.id ? 'text-white' : 'text-neutral-700'
                        }`}
                      >
                        {c.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View className="mt-4 flex-row items-center justify-between">
                  <Text className="text-sm">Available for purchase</Text>
                  <Switch
                    value={editing.isAvailable}
                    onValueChange={(v) => setEditing({ ...editing, isAvailable: v })}
                  />
                </View>
              </>
            )}
          </ScrollView>

          <View className="p-4 border-t border-neutral-200">
            <Pressable
              onPress={save}
              disabled={saving}
              className={`rounded-xl py-3 items-center ${
                saving ? 'bg-neutral-400' : 'bg-brand-600 active:bg-brand-700'
              }`}
            >
              {saving ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-bold">
                  {editing?.id ? 'Save changes' : 'Create product'}
                </Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  keyboardType?: any;
  autoCapitalize?: 'none' | 'sentences' | 'words';
}

function Field({ label, value, onChange, multiline, keyboardType, autoCapitalize }: FieldProps) {
  return (
    <View className="mb-3">
      <Text className="text-xs font-medium text-neutral-500 mb-1">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        className={`rounded-xl border border-neutral-200 px-3 py-2.5 bg-white ${
          multiline ? 'min-h-[72px]' : ''
        }`}
      />
    </View>
  );
}
