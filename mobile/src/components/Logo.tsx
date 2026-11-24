import React from 'react';
import Svg, { Path } from 'react-native-svg';

/** Shield + medical cross + wireless signal arcs. */
export function Logo({ size = 48 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="RescueMesh logo">
      <Path d="M32 4 8 13v17c0 15 10 26 24 30 14-4 24-15 24-30V13L32 4z" fill="#0B2A5B" />
      <Path d="M32 9.5 13 16.8V30c0 12 7.8 20.8 19 24.3C43.2 50.8 51 42 51 30V16.8L32 9.5z" fill="#1E6FFF" />
      <Path d="M28 22h8v8h8v8h-8v8h-8v-8h-8v-8h8z" fill="#FFFFFF" />
      <Path d="M21 17.5a16 16 0 0 1 22 0M24.5 21a11 11 0 0 1 15 0" stroke="#FF5A5F" strokeWidth={2.6} fill="none" strokeLinecap="round" />
    </Svg>
  );
}
