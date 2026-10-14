import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import es from "@/locales/es.json";
import en from "@/locales/en.json";

export const LANGUAGES = ["es", "en"] as const;
export type Language = (typeof LANGUAGES)[number];
export const LANGUAGE_STORAGE_KEY = "sm.language";

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: { es: { translation: es }, en: { translation: en } },
    lng: "es",
    fallbackLng: "es",
    interpolation: { escapeValue: false },
  });
} else {
  // Keep resources fresh when the module reloads in development.
  i18n.addResourceBundle("es", "translation", es, true, true);
  i18n.addResourceBundle("en", "translation", en, true, true);
}

/** Static lookup for route head(), which runs outside React. Uses Spanish (default). */
export const tStatic = (key: string) => i18n.getFixedT("es")(key);

export default i18n;
