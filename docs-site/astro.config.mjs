import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  integrations: [
    starlight({
      title: 'Crozzo POS — Docs',
      defaultLocale: 'es',
      locales: {
        es: { label: 'Español', lang: 'es' },
      },
      sidebar: [
        { label: 'Mapas', autogenerate: { directory: 'maps' } },
        { label: 'Alto Mando', autogenerate: { directory: 'high-command' } },
      ],
    }),
  ],
});
