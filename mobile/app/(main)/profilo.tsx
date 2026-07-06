// =============================================================================
// Profilo (proprio) — si apre dal cerchio avatar nell'header della Home (è una
// schermata stack sopra i tab, non una tab). È il "fossato" del prodotto: l'Aura
// viva come ANELLO luminoso attorno all'avatar (cresce e cambia colore con la %),
// non vanity-count. Tutto in italiano, design nero e sobrio.
//
// L'avatar è modificabile in-place: tocco sull'immagine o sul "+" → cambia/aggiungi
// foto; pressione lunga → apre la foto "più grande" (modale). L'Aura la scrive solo
// il backend; qui è in sola lettura (profiles.aura_score = percentuale 0–100).
// =============================================================================

import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Avatar } from '@/components/ui/Avatar';
import { AuraAvatarRing } from '@/components/aura/AuraAvatarRing';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile, useFriendCount, useDropCount, useUpdateProfile } from '@/hooks/useProfilo';
import { useMyAura } from '@/hooks/useAura';
import { uploadAvatar } from '@/lib/auth';
import { auraRingColor } from '@/constants/aura';
import { ROUTES } from '@/constants/routes';
import { colors, fontFamily, fontSize, radius, spacing } from '@/constants/theme';

const AVATAR = 96;

export default function Profilo() {
  const router = useRouter();
  const { session } = useAuth();
  const uid = session?.user.id;

  const { data: profile } = useMyProfile();
  const aura = useMyAura();
  const friendCount = useFriendCount(uid);
  const dropCount = useDropCount(uid);
  const update = useUpdateProfile();

  const [uploading, setUploading] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);

  // Lo score v3 È già la percentuale (0–100); default 0%.
  const auraPercent = Math.round(aura.data?.score ?? 0);
  const auraColor = auraRingColor(auraPercent);

  // Sceglie una foto dalla galleria, la carica e aggiorna avatar_url (in-place).
  const pickAndUploadAvatar = async () => {
    if (!uid || uploading) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (res.canceled) return;
    const asset = res.assets?.[0];
    if (!asset?.base64) return;

    setUploading(true);
    try {
      const url = await uploadAvatar(uid, asset.base64, asset.mimeType ?? 'image/jpeg');
      await update.mutateAsync({ avatar_url: url });
    } catch {
      // Errore silenzioso: l'avatar resta quello precedente (niente crash).
    } finally {
      setUploading(false);
    }
  };

  const openZoom = () => {
    if (profile?.avatar_url) setZoomOpen(true);
  };

  const onShare = () => {
    if (!profile?.username) return;
    Share.share({
      message: `Trovami su Televo: @${profile.username}`,
    }).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header: back + titolo + impostazioni (predisposte, non attive) */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Profilo</Text>
        <Pressable hitSlop={10} onPress={() => {}} accessibilityLabel="Impostazioni (presto)">
          <Ionicons name="settings-outline" size={22} color={colors.faint} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero: avatar con anello Aura + "+" per modificare + nome/username/bio */}
        <View style={styles.hero}>
          <View style={styles.avatarWrap}>
            <Pressable
              onPress={pickAndUploadAvatar}
              onLongPress={openZoom}
              delayLongPress={250}
              accessibilityLabel="Cambia foto profilo (tieni premuto per ingrandire)"
            >
              <AuraAvatarRing percent={auraPercent} size={AVATAR}>
                <Avatar uri={profile?.avatar_url} name={profile?.username} size={AVATAR} />
                {uploading ? (
                  <View style={[StyleSheet.absoluteFill, styles.avatarLoading]}>
                    <ActivityIndicator color={colors.ink} />
                  </View>
                ) : null}
              </AuraAvatarRing>
            </Pressable>

            {/* "+" in cerchio bianco, mezzo sovrapposto in basso-destra. */}
            <Pressable
              onPress={pickAndUploadAvatar}
              hitSlop={8}
              style={styles.addBadge}
              accessibilityLabel="Aggiungi o cambia foto profilo"
            >
              <Ionicons name="add" size={18} color={colors.base} />
            </Pressable>
          </View>

          <Text style={styles.name}>{profile?.display_name || profile?.username || 'Tu'}</Text>
          {profile?.username ? <Text style={styles.username}>@{profile.username}</Text> : null}
          {profile?.status_text ? (
            <Text style={styles.bio}>{profile.status_text}</Text>
          ) : (
            <Pressable onPress={() => router.push(ROUTES.profiloModifica)}>
              <Text style={styles.bioEmpty}>+ Aggiungi una bio</Text>
            </Pressable>
          )}
        </View>

        {/* Conteggi: Amici · Drop attivi · Aura (% — niente classifica/follower) */}
        <View style={styles.stats}>
          <Stat
            label="Amici"
            value={friendCount.data}
            loading={friendCount.isLoading}
            onPress={() => router.push(ROUTES.amici)}
          />
          <View style={styles.statDivider} />
          <Stat label="Drop attivi" value={dropCount.data} loading={dropCount.isLoading} />
          <View style={styles.statDivider} />
          <Stat
            label="Aura"
            value={`${auraPercent}%`}
            valueColor={auraColor}
            loading={aura.isLoading}
          />
        </View>

        {/* Azioni */}
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
            onPress={() => router.push(ROUTES.profiloModifica)}
          >
            <Ionicons name="create-outline" size={18} color={colors.ink} />
            <Text style={styles.actionLabel}>Modifica profilo</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
            onPress={onShare}
          >
            <Ionicons name="share-outline" size={18} color={colors.ink} />
            <Text style={styles.actionLabel}>Condividi</Text>
          </Pressable>
        </View>

        {/* Archivio personale (M6): Ricordi (drop scaduti) + Salvati (segnalibri) */}
        <View style={styles.linkList}>
          <LinkRow
            icon="images-outline"
            label="Ricordi"
            hint="I tuoi drop scaduti, solo per te"
            onPress={() => router.push(ROUTES.ricordi)}
          />
          <View style={styles.linkDivider} />
          <LinkRow
            icon="bookmark-outline"
            label="Salvati"
            hint="I drop che hai salvato (max 24h)"
            onPress={() => router.push(ROUTES.dropSalvati)}
          />
        </View>

        <View style={{ height: spacing['3xl'] }} />
      </ScrollView>

      {/* Modale "foto più grande": overlay scuro, chiusura al tocco. */}
      <Modal visible={zoomOpen} transparent animationType="fade" onRequestClose={() => setZoomOpen(false)}>
        <Pressable style={styles.zoomBackdrop} onPress={() => setZoomOpen(false)}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.zoomImage} resizeMode="contain" />
          ) : null}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// --- Sottocomponenti locali --------------------------------------------------

function Stat({
  label,
  value,
  valueColor,
  loading,
  onPress,
}: {
  label: string;
  value: number | string | undefined;
  valueColor?: string;
  loading?: boolean;
  onPress?: () => void;
}) {
  const inner = (
    <>
      {loading ? (
        <ActivityIndicator color={colors.muted} />
      ) : (
        <Text style={[styles.statValue, valueColor ? { color: valueColor } : null]}>
          {value ?? 0}
        </Text>
      )}
      <Text style={styles.statLabel}>{label}</Text>
    </>
  );
  if (onPress) {
    return (
      <Pressable style={({ pressed }) => [styles.stat, pressed && styles.pressed]} onPress={onPress}>
        {inner}
      </Pressable>
    );
  }
  return <View style={styles.stat}>{inner}</View>;
}

/** Riga-link dell'archivio personale (Ricordi/Salvati): icona + label + hint + chevron. */
function LinkRow({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]} onPress={onPress}>
      <Ionicons name={icon} size={20} color={colors.ink} />
      <View style={styles.linkText}>
        <Text style={styles.linkLabel}>{label}</Text>
        <Text style={styles.linkHint}>{hint}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.faint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.base },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: { color: colors.ink, fontSize: fontSize.lg, fontFamily: fontFamily.semibold },
  content: { paddingHorizontal: spacing.lg, gap: spacing.xl },

  hero: { alignItems: 'center', gap: spacing.xs, paddingTop: spacing.sm },
  avatarWrap: { position: 'relative' },
  avatarLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: radius.full,
  },
  // "+" in cerchio bianco, sovrapposto al bordo dell'anello in basso-destra.
  addBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 30,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: colors.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    color: colors.ink,
    fontSize: fontSize.xl,
    fontFamily: fontFamily.displayBold,
    marginTop: spacing.sm,
  },
  username: { color: colors.muted, fontSize: fontSize.base, fontFamily: fontFamily.sans },
  bio: {
    color: colors.ink,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  bioEmpty: {
    color: colors.accent,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.medium,
    marginTop: spacing.xs,
  },

  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
  },
  stat: { alignItems: 'center', gap: 2, minWidth: 64 },
  statValue: { color: colors.ink, fontSize: fontSize.xl, fontFamily: fontFamily.displayBold },
  statLabel: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fontFamily.medium },
  statDivider: { width: 1, height: 28, backgroundColor: colors.border },

  actions: { flexDirection: 'row', gap: spacing.md },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
  },
  actionLabel: { color: colors.ink, fontSize: fontSize.sm, fontFamily: fontFamily.semibold },
  pressed: { opacity: 0.85 },

  linkList: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  linkText: { flex: 1, gap: 1 },
  linkLabel: { color: colors.ink, fontSize: fontSize.base, fontFamily: fontFamily.semibold },
  linkHint: { color: colors.muted, fontSize: fontSize.xs, fontFamily: fontFamily.medium },
  linkDivider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.lg },

  zoomBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  zoomImage: { width: '100%', height: '100%', borderRadius: radius.lg },
});
