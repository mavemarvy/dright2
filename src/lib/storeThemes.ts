export interface StoreTheme {
  mode: 'mix' | 'predesigned' | 'custom';
  color: string | null;
  pattern: string | null;
  predesignedTheme: string | null;
  customBackgroundUrl: string | null;
}

export const DEFAULT_THEME: StoreTheme = {
  mode: 'mix',
  color: null,
  pattern: null,
  predesignedTheme: null,
  customBackgroundUrl: null,
};

export interface ColorOption {
  id: string;
  name: string;
  hex: string;
  hexLight: string;
}

export const COLOR_OPTIONS: ColorOption[] = [
  { id: 'pink',     name: 'Pink',     hex: '#EC4899', hexLight: '#F472B6' },
  { id: 'blue',     name: 'Blue',     hex: '#3B82F6', hexLight: '#60A5FA' },
  { id: 'red',      name: 'Red',      hex: '#EF4444', hexLight: '#F87171' },
  { id: 'purple',   name: 'Purple',   hex: '#8B5CF6', hexLight: '#A78BFA' },
  { id: 'orange',   name: 'Orange',   hex: '#F97316', hexLight: '#FB923C' },
  { id: 'green',    name: 'Green',    hex: '#22C55E', hexLight: '#4ADE80' },
  { id: 'yellow',   name: 'Yellow',   hex: '#EAB308', hexLight: '#FACC15' },
  { id: 'teal',     name: 'Teal',     hex: '#14B8A6', hexLight: '#2DD4BF' },
  { id: 'black',    name: 'Black',    hex: '#1F2937', hexLight: '#374151' },
  { id: 'white',    name: 'White',    hex: '#E5E7EB', hexLight: '#F9FAFB' },
  { id: 'gold',     name: 'Gold',     hex: '#D4AF37', hexLight: '#F59E0B' },
  { id: 'coral',    name: 'Coral',    hex: '#FF7F50', hexLight: '#FB923C' },
  { id: 'lavender', name: 'Lavender', hex: '#B57EDC', hexLight: '#C4B5FD' },
  { id: 'mint',     name: 'Mint',     hex: '#6EE7B7', hexLight: '#A7F3D0' },
  { id: 'navy',     name: 'Navy',     hex: '#1E3A8A', hexLight: '#3B82F6' },
];

export interface PatternOption {
  id: string;
  name: string;
  emoji: string;
  description: string;
}

export const PATTERN_OPTIONS: PatternOption[] = [
  { id: 'christmas',  name: 'Christmas',      emoji: '🎄', description: 'Festive red & green with snowflakes' },
  { id: 'worldcup',   name: 'World Cup',       emoji: '⚽', description: 'Sporty football celebration' },
  { id: 'roses',      name: 'Roses',           emoji: '🌹', description: 'Romantic rose petals' },
  { id: 'gymnastics', name: 'Gymnastics',      emoji: '🤸', description: 'Energetic athletic patterns' },
  { id: 'butterfly',  name: 'Butterfly',       emoji: '🦋', description: 'Colorful butterfly wings' },
  { id: 'halloween',  name: 'Halloween',       emoji: '🎃', description: 'Spooky orange & black' },
  { id: 'valentine',  name: "Valentine's Day", emoji: '💖', description: 'Hearts and love themes' },
  { id: 'eid',        name: 'Eid',             emoji: '🌙', description: 'Elegant crescent moon & stars' },
  { id: 'diwali',     name: 'Diwali',          emoji: '🪔', description: 'Festival of lights' },
  { id: 'newyear',    name: 'New Year',        emoji: '🎉', description: 'Fireworks and celebration' },
  { id: 'tropical',   name: 'Tropical',        emoji: '🌴', description: 'Beach and palm trees' },
  { id: 'floral',     name: 'Floral',          emoji: '🌸', description: 'Soft flower patterns' },
  { id: 'galaxy',     name: 'Galaxy',          emoji: '🌌', description: 'Starry cosmic background' },
  { id: 'minimalist', name: 'Minimalist',      emoji: '⚪', description: 'Clean and simple' },
  { id: 'vintage',    name: 'Vintage',         emoji: '📻', description: 'Retro classic style' },
];

export interface PredesignedTheme {
  id: string;
  name: string;
  colorId: string;
  patternId: string;
}

export const PREDESIGNED_THEMES: PredesignedTheme[] = [
  { id: 'christmas-classic',  name: 'Christmas Classic',  colorId: 'red',    patternId: 'christmas' },
  { id: 'valentine-romance',  name: 'Valentine Romance',  colorId: 'pink',   patternId: 'valentine' },
  { id: 'halloween-spook',    name: 'Halloween Spook',    colorId: 'orange', patternId: 'halloween' },
  { id: 'galaxy-cosmic',      name: 'Galaxy Cosmic',      colorId: 'purple', patternId: 'galaxy' },
  { id: 'tropical-paradise',  name: 'Tropical Paradise',  colorId: 'green',  patternId: 'tropical' },
  { id: 'eid-elegant',        name: 'Eid Elegant',        colorId: 'gold',   patternId: 'eid' },
  { id: 'floral-spring',      name: 'Floral Spring',      colorId: 'pink',   patternId: 'floral' },
  { id: 'minimalist-clean',   name: 'Minimalist Clean',   colorId: 'white',  patternId: 'minimalist' },
  { id: 'vintage-retro',      name: 'Vintage Retro',      colorId: 'coral',  patternId: 'vintage' },
  { id: 'newyear-gold',       name: 'New Year Gold',      colorId: 'gold',   patternId: 'newyear' },
  { id: 'worldcup-energy',    name: 'World Cup Energy',   colorId: 'green',  patternId: 'worldcup' },
  { id: 'navy-professional',  name: 'Navy Professional',  colorId: 'navy',   patternId: 'minimalist' },
];

function getPatternOverlay(patternId: string): string {
  const map: Record<string, string> = {
    christmas:  'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.15) 2px, transparent 3px), radial-gradient(circle at 70% 60%, rgba(255,255,255,0.15) 2px, transparent 3px), radial-gradient(circle at 40% 80%, rgba(255,255,255,0.1) 1px, transparent 2px)',
    worldcup:   'repeating-linear-gradient(45deg, transparent, transparent 20px, rgba(255,255,255,0.05) 20px, rgba(255,255,255,0.05) 40px)',
    roses:      'radial-gradient(ellipse at 30% 40%, rgba(236,72,153,0.2) 0%, transparent 50%), radial-gradient(ellipse at 70% 60%, rgba(244,63,94,0.2) 0%, transparent 50%)',
    gymnastics: 'conic-gradient(from 0deg at 50% 50%, rgba(255,255,255,0.05) 0deg, transparent 60deg, rgba(255,255,255,0.05) 120deg, transparent 180deg, rgba(255,255,255,0.05) 240deg, transparent 300deg)',
    butterfly:  'radial-gradient(circle at 25% 50%, rgba(139,92,246,0.2) 0%, transparent 30%), radial-gradient(circle at 75% 50%, rgba(236,72,153,0.2) 0%, transparent 30%)',
    halloween:  'radial-gradient(circle at 15% 20%, rgba(255,165,0,0.2) 0%, transparent 40%), radial-gradient(circle at 85% 70%, rgba(0,0,0,0.3) 0%, transparent 50%)',
    valentine:  'radial-gradient(circle at 20% 30%, rgba(236,72,153,0.2) 8px, transparent 10px), radial-gradient(circle at 60% 70%, rgba(244,63,94,0.2) 8px, transparent 10px), radial-gradient(circle at 80% 20%, rgba(236,72,153,0.15) 6px, transparent 8px)',
    eid:        'radial-gradient(circle at 50% 50%, rgba(255,215,0,0.15) 0%, transparent 40%), radial-gradient(circle at 20% 80%, rgba(255,215,0,0.1) 0%, transparent 30%)',
    diwali:     'radial-gradient(circle at 25% 25%, rgba(255,200,0,0.25) 0%, transparent 20%), radial-gradient(circle at 75% 75%, rgba(255,165,0,0.25) 0%, transparent 20%), radial-gradient(circle at 50% 50%, rgba(255,140,0,0.15) 0%, transparent 30%)',
    newyear:    'radial-gradient(circle at 30% 40%, rgba(255,215,0,0.25) 1px, transparent 3px), radial-gradient(circle at 70% 60%, rgba(255,215,0,0.2) 1px, transparent 3px), radial-gradient(circle at 50% 20%, rgba(255,215,0,0.15) 1px, transparent 2px)',
    tropical:   'radial-gradient(ellipse at 30% 70%, rgba(34,197,94,0.25) 0%, transparent 50%), radial-gradient(ellipse at 70% 30%, rgba(20,184,166,0.2) 0%, transparent 40%)',
    floral:     'radial-gradient(circle at 20% 30%, rgba(236,72,153,0.15) 15px, transparent 20px), radial-gradient(circle at 60% 50%, rgba(244,114,182,0.15) 12px, transparent 18px), radial-gradient(circle at 80% 80%, rgba(236,72,153,0.1) 10px, transparent 15px)',
    galaxy:     'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.3) 1px, transparent 2px), radial-gradient(circle at 50% 50%, rgba(255,255,255,0.2) 1px, transparent 2px), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.25) 1px, transparent 2px), radial-gradient(circle at 30% 70%, rgba(255,255,255,0.15) 1px, transparent 2px), radial-gradient(circle at 70% 80%, rgba(255,255,255,0.2) 1px, transparent 2px)',
    minimalist: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 100%)',
    vintage:    'repeating-linear-gradient(0deg, transparent, transparent 4px, rgba(255,255,255,0.03) 4px, rgba(255,255,255,0.03) 8px)',
  };
  return map[patternId] || '';
}

function resolveColorAndPattern(theme: StoreTheme): { hex: string; hexLight: string; patternId: string | null } {
  let hex = '#4f46e5';
  let hexLight = '#818cf8';
  let patternId: string | null = null;

  if (theme.mode === 'predesigned' && theme.predesignedTheme) {
    const preset = PREDESIGNED_THEMES.find(p => p.id === theme.predesignedTheme);
    if (preset) {
      const color = COLOR_OPTIONS.find(c => c.id === preset.colorId);
      if (color) { hex = color.hex; hexLight = color.hexLight; }
      patternId = preset.patternId;
    }
  } else if (theme.mode === 'mix') {
    if (theme.color) {
      const color = COLOR_OPTIONS.find(c => c.id === theme.color);
      if (color) { hex = color.hex; hexLight = color.hexLight; }
    }
    patternId = theme.pattern;
  }

  return { hex, hexLight, patternId };
}

/** Returns a complete inline style object for the banner/header div — no Tailwind gradient classes needed. */
export function getThemeBannerStyle(theme: StoreTheme): React.CSSProperties {
  if (theme.mode === 'custom' && theme.customBackgroundUrl) {
    return {
      backgroundImage: `url(${theme.customBackgroundUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }

  const { hex, hexLight, patternId } = resolveColorAndPattern(theme);
  const baseGradient = `linear-gradient(135deg, ${hex} 0%, ${hexLight} 100%)`;
  const patternOverlay = patternId ? getPatternOverlay(patternId) : '';

  return {
    background: patternOverlay
      ? `${patternOverlay}, ${baseGradient}`
      : baseGradient,
  };
}

/** Returns accent hex for avatar/button tinting. */
export function getThemeAccentColor(theme: StoreTheme): string {
  const { hex } = resolveColorAndPattern(theme);
  return hex;
}

/** For the predesigned swatch previews in the editor — returns base gradient inline style. */
export function getSwatchStyle(colorId: string, patternId?: string): React.CSSProperties {
  const color = COLOR_OPTIONS.find(c => c.id === colorId);
  const hex = color?.hex ?? '#4f46e5';
  const hexLight = color?.hexLight ?? '#818cf8';
  const baseGradient = `linear-gradient(135deg, ${hex} 0%, ${hexLight} 100%)`;
  const overlay = patternId ? getPatternOverlay(patternId) : '';
  return {
    background: overlay ? `${overlay}, ${baseGradient}` : baseGradient,
  };
}

// Legacy exports kept for any remaining callers — both now return inline styles
export function getThemePatternStyle(theme: StoreTheme): React.CSSProperties {
  return getThemeBannerStyle(theme);
}

export function getThemeGradientClasses(_theme: StoreTheme): string {
  return '';
}

// Keep for backwards compat — was used as background fallback hex
export function getThemeGradient(theme: StoreTheme): string {
  return getThemeAccentColor(theme);
}

// Keep for pattern background strings (used in StorePage predesigned swatch inline style)
export function getPatternBackground(patternId: string): string {
  return getPatternOverlay(patternId);
}
