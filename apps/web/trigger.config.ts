import { defineConfig } from '@trigger.dev/sdk/v3'

export default defineConfig({
  project: process.env['TRIGGER_PROJECT_ID'] ?? 'proj_placeholder',
  runtime: 'node',
  logLevel: 'log',
  maxDuration: 300, // 5 minutes max per job
  dirs: ['./src/trigger'],
})
