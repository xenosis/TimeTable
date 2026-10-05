import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDatabase } from '../db/database';
import { maximumGemCount, updateGemCounts, type GemCounts } from '../db/gemCountRepository';
import type { ThemeDefinition } from '../theme';

export function GemCountEditor({ counts, theme, onSaved, onClose }: { readonly counts: GemCounts; readonly theme: ThemeDefinition; readonly onSaved: () => void; readonly onClose: () => void }) {
  const [gems, setGems] = useState(String(Math.max(0, counts.gems)));
  const [largeGems, setLargeGems] = useState(String(Math.max(0, counts.largeGems)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { colors } = theme;
  const save = async () => {
    if (busy) return;
    if (!/^\d+$/.test(gems) || !/^\d+$/.test(largeGems)) { setError('개수를 숫자로 적어 주세요. 0개도 괜찮아요.'); return; }
    setBusy(true); setError('');
    try { await updateGemCounts(await getDatabase(), { gems: Number(gems), largeGems: Number(largeGems) }); onSaved(); onClose(); }
    catch (failure) { setError(failure instanceof Error && failure.message.includes('정수') ? failure.message : '개수를 저장하지 못했어요. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  };
  return <Modal transparent visible animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
    <SafeAreaView style={styles.overlay}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.center}>
        <ScrollView keyboardShouldPersistTaps="handled" style={[styles.sheet, { backgroundColor: colors.surface }]} contentContainerStyle={styles.sheetContent}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>내 보석 개수 바꾸기</Text>
          <Text style={[styles.description, { color: colors.textMuted }]}>실제로 가지고 있는 보석을 세어 적어 주세요.</Text>
          <View style={styles.field}><Text style={[styles.label, { color: colors.text }]}>작은 보석</Text><TextInput accessibilityLabel="작은 보석 개수" value={gems} onChangeText={setGems} keyboardType="number-pad" selectTextOnFocus maxLength={String(maximumGemCount).length} editable={!busy} style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]} /></View>
          <View style={styles.field}><Text style={[styles.label, { color: colors.text }]}>큰 보석</Text><TextInput accessibilityLabel="큰 보석 개수" value={largeGems} onChangeText={setLargeGems} keyboardType="number-pad" selectTextOnFocus maxLength={String(maximumGemCount).length} editable={!busy} style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]} /></View>
          {error ? <Text accessibilityLiveRegion="polite" style={[styles.description, { color: colors.text }]}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={onClose} style={[styles.button, { borderColor: colors.border, borderWidth: 1 }]}><Text style={[styles.buttonLabel, { color: colors.textMuted }]}>취소</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void save()} style={[styles.button, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}><Text style={[styles.buttonLabel, { color: colors.onPrimary }]}>{busy ? '저장 중…' : '저장'}</Text></Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#00000066' }, center: { flex: 1, justifyContent: 'center', padding: 20 },
  sheet: { borderRadius: 28, flexGrow: 0, width: '100%', maxWidth: 480, maxHeight: '100%', alignSelf: 'center' }, sheetContent: { padding: 24, gap: 16 },
  title: { fontSize: 21, fontWeight: '800' }, description: { fontSize: 15, lineHeight: 24 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 16 }, label: { flex: 1, fontSize: 17, fontWeight: '700' },
  input: { width: 128, minHeight: 56, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, textAlign: 'center', fontSize: 20, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 }, button: { flex: 1, minHeight: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, buttonLabel: { fontSize: 17, fontWeight: '700' },
});
