import { defineConfig, mergeConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default mergeConfig(
  {
    plugins: [react()],
  },
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
    },
  }),
)
