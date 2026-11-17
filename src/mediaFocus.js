// Only one video, song or voice message plays at a time: starting one pauses the other.
let current = null
export function claim(el) {
  if (current && current !== el) current.pause()
  current = el
}
