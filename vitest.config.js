// vitest.config.js
// Configuration pour les tests @netlens/core
// Run: npx vitest run packages/core/tests/

import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    // Tests purement Node — pas de browser, pas de DOM
    environment: 'node',

    // Inclure uniquement les tests core (logique pure)
    include: ['packages/core/tests/**/*.test.js'],

    // Résolution des imports @netlens/*
    alias: {
      '@netlens/core':     path.resolve('./packages/core/src'),
      '@netlens/ui':       path.resolve('./packages/ui/src'),
    },
  },

  resolve: {
    alias: {
      '@netlens/core':     path.resolve('./packages/core/src'),
      '@netlens/ui':       path.resolve('./packages/ui/src'),
    },
  },
})
