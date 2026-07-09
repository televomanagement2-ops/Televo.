// =============================================================================
// ZonesLayer — i cerchi delle Safe Zone sulla mappa (M7 / MM9).
// =============================================================================
// Disegna, come layer di stile MapLibre (sotto le aure, che sono Marker nativi):
//  · le mie Safe Zone SALVATE — cerchi sobri (accento tenue), così vedo dov'è la
//    mascheratura ("qui appaio come In zona"). Le vedo SOLO io (map.md §4/§10).
//  · l'ANTEPRIMA della zona in creazione (`draft`) — cerchio in accento pieno che
//    segue il raggio scelto nell'editor, feedback live del "quanto è grande".
//
// Perché layer di stile e non Skia: un cerchio in METRI scala con lo zoom (a
// differenza di un Marker a dimensione fissa). Il poligono lo costruisce
// `cerchioGeoJSON` (lib/geo, puro). Va reso DENTRO <Map> (è map content).

import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { cerchioGeoJSON } from '@/lib/geo';
import type { SafeZone } from '@/hooks/useSafeZones';
import { colors } from '@/constants/theme';

interface Props {
  zones: SafeZone[];
  /** Zona in creazione (long-press): centro + raggio corrente dell'editor. */
  draft: { lat: number; lng: number; radiusM: number } | null;
}

export function ZonesLayer({ zones, draft }: Props) {
  const salvate: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: zones.map((z) => cerchioGeoJSON(z.lng, z.lat, z.radiusM)),
  };

  const draftFC: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: draft ? [cerchioGeoJSON(draft.lng, draft.lat, draft.radiusM)] : [],
  };

  return (
    <>
      {zones.length > 0 ? (
        <GeoJSONSource id="map-zones-saved" data={salvate}>
          <Layer
            id="map-zones-saved-fill"
            source="map-zones-saved"
            type="fill"
            paint={{ 'fill-color': colors.accent, 'fill-opacity': 0.05 }}
          />
          <Layer
            id="map-zones-saved-line"
            source="map-zones-saved"
            type="line"
            paint={{
              'line-color': colors.accentSoft,
              'line-opacity': 0.45,
              'line-width': 1.2,
              'line-dasharray': [3, 3],
            }}
          />
        </GeoJSONSource>
      ) : null}

      {draft ? (
        <GeoJSONSource id="map-zones-draft" data={draftFC}>
          <Layer
            id="map-zones-draft-fill"
            source="map-zones-draft"
            type="fill"
            paint={{ 'fill-color': colors.accent, 'fill-opacity': 0.12 }}
          />
          <Layer
            id="map-zones-draft-line"
            source="map-zones-draft"
            type="line"
            paint={{ 'line-color': colors.accent, 'line-opacity': 0.9, 'line-width': 1.8 }}
          />
        </GeoJSONSource>
      ) : null}
    </>
  );
}
