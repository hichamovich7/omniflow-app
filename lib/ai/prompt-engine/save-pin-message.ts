// Always-on "save this pin" call-to-action banner, rendered on every
// generated pin image regardless of niche or text-overlay mode. See
// docs/DECISIONS.md 2026-08-28 (Save the Pin banner).
const SAVE_PIN_MESSAGES: Record<string, string> = {
  en: 'Save the Pin! So you can make it later!',
  de: 'Pin speichern! Damit du es später machen kannst!',
  es: '¡Guarda el Pin! ¡Para hacerlo más tarde!',
  fr: "Enregistre l'épingle ! Pour la retrouver plus tard !",
};

export function getSavePinMessage(language: string): string {
  return SAVE_PIN_MESSAGES[language] ?? SAVE_PIN_MESSAGES.en;
}
