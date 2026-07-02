import type { MetadataRoute } from 'next';

const BASE_URL = 'https://duolifehub.com.br';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE_URL,                         lastModified: new Date(), changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${BASE_URL}/quem-somos`,         lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/solucoes`,           lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/unidades`,           lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/seja-parceiro`,      lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/contato`,            lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
  ];
}
