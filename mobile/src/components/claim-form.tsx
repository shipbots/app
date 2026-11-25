import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { CLAIM_FIELDS, todayIso, type ClaimFieldDef, type ClaimFieldKey } from '@/api/claims';
import type { ClaimOptions } from '@/api/types';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { OptionPicker } from './option-picker';
import { ThemedText } from './themed-text';

export type ClaimFormValues = Record<ClaimFieldKey, string>;

export function emptyClaimValues(): ClaimFormValues {
  const v = {} as ClaimFormValues;
  for (const f of CLAIM_FIELDS) v[f.key] = '';
  return v;
}

/** The claim questionnaire — every Claims-board field, stacked for a phone.
 *  Pick fields open a bottom sheet; dates are typed (YYYY-MM-DD) with a
 *  one-tap "Today". `required` keys get an asterisk. */
export function ClaimForm({
  values, options, onChange, required = [],
}: {
  values: ClaimFormValues;
  options: ClaimOptions;
  onChange: (key: ClaimFieldKey, value: string) => void;
  required?: ClaimFieldKey[];
}) {
  const theme = useTheme();
  const [picking, setPicking] = useState<ClaimFieldDef | null>(null);

  const pickOptions = (f: ClaimFieldDef | null): string[] => {
    if (!f?.opt) return [];
    if (f.opt === 'groups') return options.groups.map(g => g.title);
    return options[f.opt];
  };
  const displayValue = (f: ClaimFieldDef) => {
    const v = values[f.key];
    if (f.key === 'groupId') return options.groups.find(g => g.id === v)?.title ?? '';
    return v;
  };

  return (
    <View>
      {CLAIM_FIELDS.map(f => {
        const label = `${f.label}${required.includes(f.key) ? ' *' : ''}`;
        if (f.kind === 'pick') {
          const shown = displayValue(f);
          return (
            <View key={f.key} style={styles.field}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.label}>{label}</ThemedText>
              <Pressable
                onPress={() => setPicking(f)}
                accessibilityRole="button"
                accessibilityLabel={`${f.label}: ${shown || 'not set'}`}
                style={[styles.input, styles.pick, { borderColor: theme.inputBorder, backgroundColor: theme.card }]}>
                <ThemedText style={{ flex: 1, color: shown ? theme.text : theme.textSecondary }} numberOfLines={2}>
                  {shown || 'Select…'}
                </ThemedText>
                <ThemedText style={{ color: theme.textSecondary }}>▾</ThemedText>
              </Pressable>
            </View>
          );
        }
        return (
          <View key={f.key} style={styles.field}>
            <View style={styles.labelRow}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.label}>{label}</ThemedText>
              {f.kind === 'date' && (
                <Pressable onPress={() => onChange(f.key, todayIso())} hitSlop={8}>
                  <ThemedText type="small" style={{ color: theme.tint, fontWeight: '700' }}>Today</ThemedText>
                </Pressable>
              )}
            </View>
            <TextInput
              value={values[f.key]}
              onChangeText={t => onChange(f.key, t)}
              placeholder={f.kind === 'date' ? 'YYYY-MM-DD' : f.placeholder}
              placeholderTextColor={theme.textSecondary}
              multiline={f.kind === 'long'}
              keyboardType={f.kind === 'number' ? 'decimal-pad' : f.kind === 'date' ? 'numbers-and-punctuation' : 'default'}
              autoCapitalize={f.kind === 'long' || f.key === 'whoRequested' || f.key === 'resultNotes' ? 'sentences' : 'none'}
              autoCorrect={f.kind === 'long'}
              accessibilityLabel={f.label}
              style={[
                styles.input,
                { borderColor: theme.inputBorder, color: theme.text, backgroundColor: theme.card },
                f.kind === 'long' && styles.long,
              ]}
            />
          </View>
        );
      })}

      <OptionPicker
        visible={!!picking}
        title={picking?.label ?? ''}
        options={pickOptions(picking)}
        current={picking ? displayValue(picking) : undefined}
        allowClear={picking?.key !== 'groupId'}
        onSelect={label => {
          if (picking) {
            const value = picking.key === 'groupId'
              ? (options.groups.find(g => g.title === label)?.id ?? '')
              : label;
            onChange(picking.key, value);
          }
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: Spacing.three },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontWeight: '600', marginBottom: 5 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  long: { minHeight: 96, textAlignVertical: 'top' },
});
