import { useState } from 'react';
import { Alert, Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  currentLanguage,
  isRTLLanguage,
  setLanguage,
  SUPPORTED_LANGUAGES,
  type Language,
} from '@/lib/i18n';

const LABEL_KEYS: Record<Language, string> = {
  en: 'language.english',
  he: 'language.hebrew',
  ar: 'language.arabic',
};

/** Globe button + modal language picker, for headers. */
export function LanguagePicker({ buttonClassName }: { buttonClassName?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const active = currentLanguage();

  const pick = async (lng: Language) => {
    setOpen(false);
    if (lng === active) return;
    await setLanguage(lng);
    if (isRTLLanguage(lng) !== isRTLLanguage(active)) {
      Alert.alert(t('language.title'), t('language.restartHint'));
    }
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('language.title')}
        hitSlop={6}
        className={
          buttonClassName ??
          'h-12 w-12 mr-2 items-center justify-center rounded-full bg-white/15 active:bg-white/30'
        }
      >
        <Ionicons name="globe-outline" size={24} color="white" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 bg-black/40 justify-center px-10" onPress={() => setOpen(false)}>
          <View className="rounded-2xl bg-white p-4">
            <Text className="text-base font-bold text-neutral-900 mb-3">
              {t('language.title')}
            </Text>
            {SUPPORTED_LANGUAGES.map((lng) => {
              const selected = lng === active;
              return (
                <Pressable
                  key={lng}
                  onPress={() => pick(lng)}
                  className={`flex-row items-center justify-between rounded-xl px-3 py-3 mb-1 ${
                    selected ? 'bg-brand-50' : 'bg-white'
                  }`}
                >
                  <Text className={`text-base ${selected ? 'font-bold text-brand-700' : 'text-neutral-800'}`}>
                    {t(LABEL_KEYS[lng])}
                  </Text>
                  {selected && <Ionicons name="checkmark" size={18} color="#0369a1" />}
                </Pressable>
              );
            })}
            <Text className="mt-2 text-[11px] text-neutral-400">
              {t('language.restartHint')}
            </Text>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
