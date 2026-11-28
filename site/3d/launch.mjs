// Explicit book-page links and the "Play the maze" choice enter Maze Trail
// directly. A compatible phone opening the game hub starts at Room Expedition.
const query=new URLSearchParams(location.search)
const phone=navigator.userAgentData?.mobile || /iPhone|iPod|Android.+Mobile/i.test(navigator.userAgent) ||
  (matchMedia('(pointer: coarse)').matches && Math.min(screen.width,screen.height)<=600)
if (phone && navigator.xr && !query.has('page') && query.get('mode')!=='maze') {
  let supported=false
  try { supported=await navigator.xr.isSessionSupported('immersive-ar') } catch {}
  if (supported) location.replace(new URL('./room/',location.href))
  else import('./game.mjs?v=22')
} else import('./game.mjs?v=22')
