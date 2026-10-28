// Present only inside the Windows app (added by its preload script). On the website this is null.
export const desktop = typeof window !== 'undefined' && window.nookDesktop ? window.nookDesktop : null
