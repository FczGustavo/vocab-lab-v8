export type ColorPaletteId =
  | "blue"
  | "violet"
  | "beige"
  | "gray"

export interface ColorPalette {
  id: ColorPaletteId
  name: string
  description: string
  swatches: [string, string, string, string, string]
}

export const COLOR_PALETTE_STORAGE_KEY = "vocablab_color_palette"

export const COLOR_PALETTES: ColorPalette[] = [
  {
    id: "blue",
    name: "Azul",
    description: "Estilo glass moderno com alto contraste",
    swatches: ["#0E1722", "#1A3045", "#267EDC", "#8DC7FF", "#DFECF8"],
  },
  {
    id: "violet",
    name: "Violeta",
    description: "Glass violeta com profundidade suave",
    swatches: ["#201627", "#3E2A4D", "#7B4DB5", "#C7A2F3", "#F2EAFB"],
  },
  {
    id: "beige",
    name: "Bege",
    description: "Visual clean com toque quente e elegante",
    swatches: ["#2B2321", "#5E4D46", "#B58E72", "#E5D1C2", "#F8F1EB"],
  },
  {
    id: "gray",
    name: "Cinza",
    description: "Neutro e clean, sem saturação de cor",
    swatches: ["#1A1B1F", "#2E3038", "#6B7280", "#CBD5E1", "#F8FAFC"],
  },
]

export const DEFAULT_COLOR_PALETTE: ColorPaletteId = "blue"

export const COLOR_PALETTE_CLASS_PREFIX = "palette-"

export function isColorPaletteId(value: string): value is ColorPaletteId {
  return COLOR_PALETTES.some((palette) => palette.id === value)
}

export function getColorPaletteClass(paletteId: ColorPaletteId): string {
  return `${COLOR_PALETTE_CLASS_PREFIX}${paletteId}`
}
