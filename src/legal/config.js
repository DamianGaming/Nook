// Edit these (or set the VITE_ variables in .env / Netlify) so the legal pages carry your real details.
const env = import.meta.env || {}

export const TERMS_VERSION = '2026-10-26'
export const LEGAL = {
  product: 'Nook',
  company: env.VITE_COMPANY_NAME || 'Mega Studios',
  email: env.VITE_CONTACT_EMAIL || '',
  community: 'https://discord.gg/megastudios',
  address: env.VITE_COMPANY_ADDRESS || '',
  jurisdiction: env.VITE_LEGAL_JURISDICTION || 'England and Wales',
  updated: '26 October 2026',
  minAge: 13,
}
export const contactLine = () =>
  LEGAL.email ? `${LEGAL.email}` : `our community server at ${LEGAL.community}`
