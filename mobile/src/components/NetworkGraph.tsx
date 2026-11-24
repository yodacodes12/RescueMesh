/** Simple radial visualisation: this phone in the centre, peers around it. */
import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';
import type { PeerSnapshot } from '../mesh/core/engine';
import { colors } from '../theme';

export function NetworkGraph({ peers, selfGateway, size = 280 }: { peers: PeerSnapshot[]; selfGateway: boolean; size?: number }) {
  const c = size / 2;
  const r = size / 2 - 40;
  const nodes = peers.slice(0, 10).map((p, i, arr) => {
    const a = (2 * Math.PI * i) / Math.max(arr.length, 1) - Math.PI / 2;
    return { p, x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
  });
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={c} cy={c} r={r} stroke={colors.border} strokeDasharray="4 6" fill="none" />
        {nodes.map(({ p, x, y }) => (
          <Line key={`l${p.peerId}`} x1={c} y1={c} x2={x} y2={y}
            stroke={p.state === 'CONNECTED' ? colors.blue : colors.border} strokeWidth={p.state === 'CONNECTED' ? 3 : 2}
            strokeDasharray={p.state === 'CONNECTED' ? undefined : '5 5'} />
        ))}
        {nodes.map(({ p, x, y }) => (
          <G key={p.peerId}>
            <Circle cx={x} cy={y} r={18} fill={p.isGateway ? colors.green : p.state === 'CONNECTED' ? colors.blue : '#CBD5E1'} />
            <SvgText x={x} y={y + 5} fontSize={13} fontWeight="bold" fill="#fff" textAnchor="middle">
              {p.isGateway ? 'GW' : (p.name.match(/[A-Za-z]/)?.[0] ?? '?').toUpperCase()}
            </SvgText>
            <SvgText x={x} y={y + 34} fontSize={10.5} fill={colors.text} textAnchor="middle">
              {p.name.length > 18 ? `${p.name.slice(0, 17)}…` : p.name}
            </SvgText>
          </G>
        ))}
        <Circle cx={c} cy={c} r={30} fill={selfGateway ? colors.green : colors.coral} />
        <SvgText x={c} y={c + 5} fontSize={14} fontWeight="bold" fill="#fff" textAnchor="middle">YOU</SvgText>
      </Svg>
    </View>
  );
}
