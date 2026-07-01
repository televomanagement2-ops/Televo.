// =============================================================================
// LoginBackground — lo sfondo della schermata d'accesso. Nel mockup le foto stanno
// in DUE FASCE LATERALI strette (sinistra e destra), addossate ai bordi e larghe
// ~50–75pt; il CENTRO è un'ampia colonna scura dove vivono logo, testo e pulsanti.
// NON sono quattro tessere enormi ai quattro angoli: sono tessere strette e alte,
// leggermente sfocate ma ben distinguibili, che incorniciano il pannello centrale.
// =============================================================================

import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import type { ImageSourcePropType } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/constants/theme';

interface Card {
  photo: ImageSourcePropType;
  w: number;
  h: number;
  rotate: number;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

// Foto reali del collage (in assets/images/login/).
const PH_STARRY = require('../../../assets/images/login/starry-sky.jpg');
const PH_SUNSET = require('../../../assets/images/login/sunset-sea.webp');
const PH_CITY = require('../../../assets/images/login/city-night.jpg');
const PH_PERSON = require('../../../assets/images/login/person-sunset.jpg');

// Tessere STRETTE e alte, addossate ai bordi laterali e CENTRATE in altezza (non
// agli angoli): due fasce a metà schermo, una a sinistra e una a destra, ciascuna
// fatta di due foto impilate al centro. Quote in pt (393×851).
const CARDS: Card[] = [
  { photo: PH_STARRY, w: 112, h: 300, rotate: -6, top: 150, left: -50 }, // sx-su: stellato
  { photo: PH_PERSON, w: 112, h: 300, rotate: 6, top: 420, left: -50 }, // sx-giù: persona
  { photo: PH_SUNSET, w: 112, h: 300, rotate: 6, top: 150, right: -48 }, // dx-su: tramonto
  { photo: PH_CITY, w: 112, h: 300, rotate: -6, top: 420, right: -48 }, // dx-giù: città
];

export function LoginBackground() {
  const { width, height } = useWindowDimensions();

  return (
    <View style={styles.root} pointerEvents="none">
      {/* Tessere-foto laterali, leggermente sfocate */}
      {CARDS.map((c, i) => (
        <View
          key={i}
          style={[
            styles.card,
            {
              width: c.w,
              height: c.h,
              top: c.top,
              bottom: c.bottom,
              left: c.left,
              right: c.right,
              transform: [{ rotate: `${c.rotate}deg` }],
            },
          ]}
        >
          <Image source={c.photo} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={1} />
          <View style={styles.cardVeil} />
        </View>
      ))}

      {/* Alone neutro morbido dietro il logo, in alto (niente viola nella UI). */}
      <LinearGradient
        colors={['rgba(59,130,246,0.12)', 'rgba(59,130,246,0)']}
        style={[styles.halo, { width: width * 1.1, height: width * 1.1, top: -width * 0.4 }]}
      />

      {/* Velo scuro verticale morbido (leggibilità generale) */}
      <LinearGradient
        colors={['rgba(0,0,0,0.28)', 'rgba(0,0,0,0.40)', 'rgba(0,0,0,0.52)', 'rgba(0,0,0,0.58)']}
        locations={[0, 0.4, 0.7, 1]}
        style={[StyleSheet.absoluteFill, { height }]}
      />

      {/* Pannello scuro centrale: l'ampia colonna nera del mockup dove stanno logo,
          testo e pulsanti. Sfuma ai lati così le fasce-foto restano visibili. */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.82)', 'rgba(0,0,0,0.82)', 'rgba(0,0,0,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        locations={[0, 0.16, 0.84, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.base, overflow: 'hidden' },
  halo: { position: 'absolute', alignSelf: 'center', borderRadius: 9999 },
  card: {
    position: 'absolute',
    borderRadius: 22,
    overflow: 'hidden',
    opacity: 0.95,
  },
  cardVeil: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.12)' },
});
