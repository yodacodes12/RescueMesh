export const colors = {
  navy: '#0B2A5B',
  navyDark: '#071A3A',
  blue: '#1E6FFF',
  blueSoft: '#EEF4FF',
  coral: '#FF5A5F',
  coralDark: '#E9474C',
  coralSoft: '#FFF0F0',
  white: '#FFFFFF',
  bg: '#F6F8FC',
  text: '#0F172A',
  textMuted: '#64748B',
  border: '#E2E8F0',
  green: '#16A34A',
  greenSoft: '#ECFDF3',
  amber: '#B45309',
  amberSoft: '#FEF3C7',
  violet: '#6D28D9',
  violetSoft: '#F3EEFF',
};

export const priorityColor = {
  CRITICAL: '#E11D48',
  HIGH: '#F97316',
  MEDIUM: '#CA8A04',
  LOW: '#2563EB',
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24 };
export const space = (n: number) => n * 4;

export const shadow = {
  shadowColor: '#0B2A5B',
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};
