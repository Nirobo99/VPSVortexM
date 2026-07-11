"use client";

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import ru from "@/locales/ru.json";
import en from "@/locales/en.json";
import fr from "@/locales/fr.json";
import tt from "@/locales/tt.json";
import tg from "@/locales/tg.json";

const resources = {
  ru: { translation: ru },
  en: { translation: en },
  fr: { translation: fr },
  tt: { translation: tt },
  tg: { translation: tg },
};

if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      lng: "ru",
      fallbackLng: "ru",
      interpolation: { escapeValue: false },
      detection: {
        order: ["localStorage", "htmlTag"],
        caches: ["localStorage"],
        lookupLocalStorage: "vortexm_locale",
      },
    });
}

export default i18n;
