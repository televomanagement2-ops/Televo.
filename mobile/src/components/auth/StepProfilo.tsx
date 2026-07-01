// =============================================================================
// StepProfilo — primo dei DUE step di registrazione (look leggero/arioso):
// invito + username + nome + data di nascita (gate >=16 lato client; il DB
// ricontrolla in complete_onboarding). Tutto in una sola schermata scrollabile,
// niente "modulo opprimente": campi spaziati, validazione gentile, una sola CTA.
// =============================================================================

import { useEffect, useRef, useState, type Ref } from 'react';
import { InteractionManager, StyleSheet, Text, TextInput, View } from 'react-native';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { checkInvite, isUsernameAvailable, authErrorMessage } from '@/lib/auth';
import { useOnboardingStore } from '@/store/onboardingStore';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
const pad = (n: string) => n.padStart(2, '0');

// Box data dichiarato a livello di modulo (identità stabile → niente perdita focus).
function DateBox({
  inputRef,
  value,
  onChangeText,
  placeholder,
  maxLength,
  flex = 1,
}: {
  inputRef?: Ref<TextInput>;
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  maxLength: number;
  flex?: number;
}) {
  return (
    <TextInput
      ref={inputRef}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.faint}
      keyboardType="number-pad"
      maxLength={maxLength}
      selectionColor={colors.accent}
      style={[styles.dateBox, { flex }]}
    />
  );
}

function validateAge(d: string, m: string, y: string): { date?: string; error?: string } {
  const day = Number(d);
  const mon = Number(m);
  const year = Number(y);
  if (!d || !m || y.length !== 4) return { error: 'Inserisci giorno, mese e anno.' };

  const dob = new Date(year, mon - 1, day);
  if (dob.getFullYear() !== year || dob.getMonth() !== mon - 1 || dob.getDate() !== day) {
    return { error: 'Data non valida.' };
  }
  const today = new Date();
  let age = today.getFullYear() - year;
  const hadBirthday =
    today.getMonth() > mon - 1 || (today.getMonth() === mon - 1 && today.getDate() >= day);
  if (!hadBirthday) age -= 1;
  if (age < 16) return { error: 'Devi avere almeno 16 anni per usare Televo.' };
  if (age > 120) return { error: 'Controlla l’anno di nascita.' };
  return { date: `${year}-${pad(m)}-${pad(d)}` };
}

type UStatus = 'idle' | 'checking' | 'free' | 'taken' | 'invalid';

export function StepProfilo({ onNext }: { onNext: () => void }) {
  const store = useOnboardingStore();
  const patch = useOnboardingStore((s) => s.patch);

  const [code, setCode] = useState(store.inviteCode);
  const [username, setUsername] = useState(store.username);
  const [name, setName] = useState(store.displayName);
  const [d, setD] = useState('');
  const [m, setM] = useState('');
  const [y, setY] = useState('');

  const [uStatus, setUStatus] = useState<UStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const usernameRef = useRef<TextInput>(null);
  const mRef = useRef<TextInput>(null);
  const yRef = useRef<TextInput>(null);

  // Focus differito sull'username (evita la tastiera che sfarfalla in transizione).
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => usernameRef.current?.focus());
    return () => task.cancel();
  }, []);

  // Disponibilità username (debounce).
  useEffect(() => {
    const v = username.trim().toLowerCase();
    if (!v) return setUStatus('idle');
    if (!USERNAME_RE.test(v)) return setUStatus('invalid');
    setUStatus('checking');
    let active = true;
    const t = setTimeout(async () => {
      try {
        const free = await isUsernameAvailable(v);
        if (active) setUStatus(free ? 'free' : 'taken');
      } catch {
        if (active) setUStatus('idle');
      }
    }, 400);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [username]);

  const nameOk = name.trim().length >= 2;
  const dateReady = d.length >= 1 && m.length >= 1 && y.length === 4;
  const ready = code.trim().length >= 4 && uStatus === 'free' && nameOk && dateReady && !loading;

  const submit = async () => {
    if (!ready) return;
    const { date, error: ageErr } = validateAge(d, m, y);
    if (ageErr || !date) return setError(ageErr ?? 'Data non valida.');

    setLoading(true);
    setError(null);
    try {
      const res = await checkInvite(code);
      if (!res.valid) {
        setError(authErrorMessage({ message: res.reason ?? 'invite_invalid' }));
        return;
      }
      patch({
        inviteCode: code.trim().toUpperCase(),
        username: username.trim().toLowerCase(),
        displayName: name.trim(),
        birthDate: date,
      });
      onNext();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const usernameError =
    uStatus === 'invalid'
      ? '3–20 caratteri: minuscole, numeri, _ o .'
      : uStatus === 'taken'
        ? 'Username già preso.'
        : null;

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Crea il tuo profilo</Text>
      <Text style={styles.subtitle}>Pochi dati, poi sei dentro.</Text>

      <View style={styles.fields}>
        <Input
          label="Codice invito"
          value={code}
          onChangeText={(t) => {
            setCode(t.toUpperCase());
            setError(null);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
        />

        <Input
          ref={usernameRef}
          label="Username"
          value={username}
          onChangeText={(t) => setUsername(t.toLowerCase().replace(/\s/g, ''))}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
          error={usernameError}
        />
        {uStatus === 'free' ? <Text style={styles.ok}>Disponibile ✓</Text> : null}

        <Input label="Nome" value={name} onChangeText={setName} maxLength={40} />

        <View>
          <Text style={styles.dateLabel}>Data di nascita</Text>
          <View style={styles.dateRow}>
            <DateBox
              value={d}
              onChangeText={(t) => {
                const v = t.replace(/\D/g, '').slice(0, 2);
                setD(v);
                setError(null);
                if (v.length === 2) mRef.current?.focus();
              }}
              placeholder="GG"
              maxLength={2}
            />
            <DateBox
              inputRef={mRef}
              value={m}
              onChangeText={(t) => {
                const v = t.replace(/\D/g, '').slice(0, 2);
                setM(v);
                setError(null);
                if (v.length === 2) yRef.current?.focus();
              }}
              placeholder="MM"
              maxLength={2}
            />
            <DateBox
              inputRef={yRef}
              value={y}
              onChangeText={(t) => {
                setY(t.replace(/\D/g, '').slice(0, 4));
                setError(null);
              }}
              placeholder="AAAA"
              maxLength={4}
              flex={1.6}
            />
          </View>
          <Text style={styles.hint}>Serve solo a verificare che tu abbia almeno 16 anni. Non sarà pubblica.</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <View style={styles.footer}>
        <Button label="Continua" onPress={submit} loading={loading} disabled={!ready} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: spacing.lg },
  title: { color: colors.ink, fontSize: fontSize['2xl'], fontFamily: fontFamily.displayBold, letterSpacing: 0.2 },
  subtitle: { color: colors.muted, fontSize: fontSize.base, fontFamily: fontFamily.sans, marginTop: spacing.xs },
  fields: { marginTop: spacing.xl, gap: spacing.lg },
  ok: { color: colors.success, fontSize: fontSize.sm, fontFamily: fontFamily.sans, marginTop: -spacing.sm },
  dateLabel: { color: colors.muted, fontSize: fontSize.sm, fontFamily: fontFamily.medium, marginBottom: spacing.sm },
  dateRow: { flexDirection: 'row', gap: spacing.md },
  dateBox: {
    height: 58,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: fontSize.lg,
    fontFamily: fontFamily.semibold,
    textAlign: 'center',
  },
  hint: { color: colors.faint, fontSize: fontSize.xs, fontFamily: fontFamily.sans, marginTop: spacing.sm, lineHeight: 17 },
  error: { color: colors.danger, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  footer: { marginTop: spacing.xl, marginBottom: spacing.lg },
});
