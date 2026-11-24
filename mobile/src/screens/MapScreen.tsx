/**
 * Screen 8: OpenStreetMap via Leaflet inside a WebView.
 * Tiles and the Leaflet library need internet; offline, the screen falls back
 * to a coordinate list. Nearby devices are NOT drawn: Nearby Connections does
 * not exchange positions, and we never fabricate device locations.
 */
import { useFocusEffect } from '@react-navigation/native';
import { CloudOff, MapPin } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { TYPE_LABEL } from '../components/emergency';
import { Button, Card, PriorityPill, StatusPill } from '../components/ui';
import { captureLocation, type Fix } from '../services/location';
import { useMesh } from '../state/MeshContext';
import { colors, priorityColor, radius, space } from '../theme';

interface Marker { lat: number; lon: number; color: string; label: string; approx: boolean }

function html(me: Fix | null, markers: Marker[]) {
  // Escape '<' so data can never close the <script> tag.
  const data = JSON.stringify({ me, markers }).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#m{height:100%;margin:0;font-family:sans-serif}</style></head><body><div id="m"></div><script>
var d=${data};var map=L.map('m',{zoomControl:true});
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
var pts=[];
if(d.me){pts.push([d.me.latitude,d.me.longitude]);
 L.circle([d.me.latitude,d.me.longitude],{radius:d.me.accuracy||30,color:'#1E6FFF',weight:1,fillOpacity:.1}).addTo(map);
 L.circleMarker([d.me.latitude,d.me.longitude],{radius:9,color:'#fff',weight:3,fillColor:'#1E6FFF',fillOpacity:1}).addTo(map).bindPopup('You are here');}
d.markers.forEach(function(m){pts.push([m.lat,m.lon]);
 L.circleMarker([m.lat,m.lon],{radius:m.approx?8:11,color:'#fff',weight:2,fillColor:m.color,fillOpacity:m.approx?.6:.95,dashArray:m.approx?'3 3':null}).addTo(map).bindPopup(m.label);});
if(pts.length>1)map.fitBounds(pts,{padding:[40,40],maxZoom:16});else if(pts.length)map.setView(pts[0],15);else map.setView([20.59,78.96],5);
</script></body></html>`;
}

export function MapScreen() {
  const { snapshot, internetReachable } = useMesh();
  const [me, setMe] = useState<Fix | null>(null);
  const [locErr, setLocErr] = useState<string | null>(null);

  const locate = useCallback(() => {
    captureLocation().then(f => { setMe(f); setLocErr(null); }).catch(e => setLocErr(e.message));
  }, []);
  useFocusEffect(locate);

  const alerts = useMemo(() => (snapshot?.messages ?? []).filter(m => m.msg.latitude !== null), [snapshot]);
  const markers: Marker[] = alerts.map(m => {
    const relay = m.origin === 'RELAY';
    // Relaying phones only show an approximate (~100 m) location.
    const r = (v: number) => (relay ? Math.round(v * 1000) / 1000 : v);
    return {
      lat: r(m.msg.latitude!), lon: r(m.msg.longitude!), color: priorityColor[m.msg.priority], approx: relay,
      label: `${m.msg.priority} · ${TYPE_LABEL[m.msg.emergency_type]}${relay ? ' (relayed, approx.)' : ' (your SOS)'}${m.msg.is_simulated ? ' · SIMULATED' : ''}`,
    };
  });
  const source = useMemo(() => ({ html: html(me, markers) }), [me, JSON.stringify(markers)]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <Text style={s.h1}>Map</Text>
        <Text style={s.sub}>{me ? `You: ${me.latitude.toFixed(5)}, ${me.longitude.toFixed(5)}` : locErr ?? 'Locating…'}</Text>
      </View>
      {internetReachable ? (
        <View style={s.mapWrap}>
          <WebView originWhitelist={['*']} source={source} style={{ flex: 1 }} javaScriptEnabled />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: space(5) }}>
          <Card style={s.offline}>
            <CloudOff size={22} color={colors.amber} />
            <Text style={s.offlineText}>Map tiles need internet. Showing positions as a list. GPS still works offline.</Text>
          </Card>
          {me && <Card style={s.item}><MapPin size={20} color={colors.blue} /><Text style={s.mono}>You · {me.latitude.toFixed(5)}, {me.longitude.toFixed(5)}</Text></Card>}
          {alerts.map(m => (
            <Card key={m.msg.message_id} style={s.item}>
              <PriorityPill p={m.msg.priority} />
              <View style={{ flex: 1 }}>
                <Text style={s.mono}>{m.origin === 'RELAY' ? `${m.msg.latitude!.toFixed(3)}, ${m.msg.longitude!.toFixed(3)} (approx.)` : `${m.msg.latitude!.toFixed(5)}, ${m.msg.longitude!.toFixed(5)}`}</Text>
                <View style={{ marginTop: 4 }}><StatusPill s={m.delivery_status} /></View>
              </View>
            </Card>
          ))}
        </ScrollView>
      )}
      <View style={s.legend}>
        <Text style={s.legendText}>● Blue: you · Coloured: SOS by priority (dashed = relayed, approx.) · Nearby phones do not share positions, so none are shown. No rescue locations published by the server.</Text>
        <Button title="Refresh my location" variant="ghost" onPress={locate} style={{ marginTop: space(2), minHeight: 44 }} />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  header: { paddingHorizontal: space(5), paddingTop: space(4), paddingBottom: space(3) },
  h1: { fontSize: 24, fontWeight: '800', color: colors.navy },
  sub: { fontSize: 13, color: colors.textMuted, marginTop: 2, fontFamily: 'monospace' },
  mapWrap: { flex: 1, marginHorizontal: space(3), borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  offline: { flexDirection: 'row', gap: space(3), alignItems: 'center', backgroundColor: colors.amberSoft, marginBottom: space(3) },
  offlineText: { flex: 1, color: colors.amber, fontWeight: '600' },
  item: { flexDirection: 'row', alignItems: 'center', gap: space(3), marginBottom: space(2) },
  mono: { fontFamily: 'monospace', color: colors.text },
  legend: { padding: space(4) },
  legendText: { fontSize: 11.5, color: colors.textMuted, lineHeight: 17 },
});
