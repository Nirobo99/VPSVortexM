import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextVitals,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/sw.js",
      "public/workbox-*.js",
    ],
  },
  {
    rules: {
      // Existing client pages rely on effect-driven hydration patterns.
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default config;
