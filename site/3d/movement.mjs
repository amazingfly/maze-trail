const playerHeight = .6

function footprint(part, x, z) {
  const dx = x - part.x, dz = z - part.z
  const u = dx * part.cos - dz * part.sin
  const v = dx * part.sin + dz * part.cos
  return [u / part.width, v / part.depth]
}

export function dinosaurContact(parts, player, x, z) {
  for (const part of parts) {
    if (player.y >= part.top - .001 || player.y + playerHeight <= part.bottom + .001) continue
    const [u, v] = footprint(part, x, z)
    const [oldU, oldV] = footprint(part, player.x, player.z)
    const distance = u*u + v*v
    // An animated leg may already overlap the player. Always allow a step out.
    if (distance >= 1 || distance >= oldU*oldU + oldV*oldV) continue
    const nx = u / part.width, nz = v / part.depth
    const length = Math.hypot(nx, nz)
    if (length) return [(nx*part.cos + nz*part.sin)/length, (-nx*part.sin + nz*part.cos)/length]
  }
  return null
}

export function dinosaurJumpLimit(parts, player, from, to) {
  let limit = to
  for (const part of parts) {
    const [u, v] = footprint(part, player.x, player.z)
    if (u*u + v*v >= 1) continue
    const ceiling = part.bottom - playerHeight
    if (to > from && from <= ceiling && limit > ceiling) limit = ceiling
    if (to < from && from >= part.top && limit < part.top) limit = part.top
  }
  return limit
}

export function slidePlayer(player, dx, dz, contact) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .04))
  for (let i = 0; i < steps; i++) {
    let x = dx / steps, z = dz / steps
    for (let attempt = 0; attempt < 3 && Math.hypot(x,z) > .0001; attempt++) {
      const normal = contact(player.x + x, player.z + z)
      if (!normal) {
        player.x += x
        player.z += z
        break
      }
      // Walk to the contact point, then remove only the inward component.
      let free = 0, blocked = 1
      for (let j = 0; j < 6; j++) {
        const t = (free + blocked) / 2
        if (contact(player.x + x*t, player.z + z*t)) blocked = t
        else free = t
      }
      const surfaceNormal = contact(player.x + x*blocked, player.z + z*blocked) ?? normal
      player.x += x*free
      player.z += z*free
      x *= 1-free
      z *= 1-free
      const inward = Math.min(0, x*surfaceNormal[0] + z*surfaceNormal[1])
      x -= inward*surfaceNormal[0]
      z -= inward*surfaceNormal[1]
    }
  }
}
