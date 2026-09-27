/** The looks a presentation can take: colours and fonts for every slide. */

export interface Theme {
  id: string;
  name: string;
  background: string;
  titleColor: string;
  textColor: string;
  /** New shapes, bullets and highlights. */
  accent: string;
  /** A second colour for charts and shapes. */
  accent2: string;
  font: string;
  titleFont: string;
}

const SANS = 'Inter, "Helvetica Neue", Arial, "Segoe UI", Roboto, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';

export const THEMES: Theme[] = [
  {
    id: 'kherve',
    name: 'KherveDOC',
    background: '#ffffff',
    titleColor: '#1d3f73',
    textColor: '#2a2f3a',
    accent: '#2466b0',
    accent2: '#f0a030',
    font: SANS,
    titleFont: SANS,
  },
  {
    id: 'midnight',
    name: 'Midnight',
    background: '#141a2e',
    titleColor: '#ffffff',
    textColor: '#d6dbea',
    accent: '#5b8def',
    accent2: '#f25f5c',
    font: SANS,
    titleFont: SANS,
  },
  {
    id: 'ocean',
    name: 'Ocean',
    background: '#e8f4f8',
    titleColor: '#0b4f6c',
    textColor: '#1b3a4b',
    accent: '#01baef',
    accent2: '#20bf55',
    font: SANS,
    titleFont: SANS,
  },
  {
    id: 'sunset',
    name: 'Sunset',
    background: '#fff4ec',
    titleColor: '#b23a48',
    textColor: '#4a2c2a',
    accent: '#fc9e4f',
    accent2: '#b23a48',
    font: SANS,
    titleFont: SERIF,
  },
  {
    id: 'forest',
    name: 'Forest',
    background: '#f3f7f0',
    titleColor: '#2d5a27',
    textColor: '#2f3a2c',
    accent: '#5c946e',
    accent2: '#c9a227',
    font: SANS,
    titleFont: SERIF,
  },
  {
    id: 'paper',
    name: 'Paper',
    background: '#faf8f3',
    titleColor: '#222222',
    textColor: '#333333',
    accent: '#8c5e3c',
    accent2: '#4f6d7a',
    font: SERIF,
    titleFont: SERIF,
  },
  {
    id: 'bold',
    name: 'Bold',
    background: '#ffd23f',
    titleColor: '#111111',
    textColor: '#1a1a1a',
    accent: '#ee4266',
    accent2: '#3bceac',
    font: SANS,
    titleFont: SANS,
  },
];

export const DEFAULT_THEME = THEMES[0];

export const themeById = (id?: string) =>
  THEMES.find((theme) => theme.id === id) ?? DEFAULT_THEME;
