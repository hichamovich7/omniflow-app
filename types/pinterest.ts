export const SUPPORTED_LANGUAGES = ['en', 'de', 'es', 'fr'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
};

export const PINS_OPTIONS = [1, 3, 5, 7, 8, 10, 20, 30] as const;
export type PinsOption = (typeof PINS_OPTIONS)[number];

export interface GenerateRequest {
  projectId: string;
  keyword: string;
  language: SupportedLanguage;
  pinsRequested: PinsOption;
}

export interface GeneratedPin {
  title: string;
  description: string;
  keywords: string;
  board: string;
  image_prompt: string;
}

export interface OpenRouterPinsResponse {
  pins: GeneratedPin[];
}
