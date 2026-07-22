/**
 * Knobs for the FLIP water simulation, kept in localStorage so they carry
 * from run to run. Only the fluid page reads these — the block-at-a-time
 * water on the other pages has no dials to turn.
 */
export interface FluidSettings {
  /** Particles along each axis of a cell: n packs n² into a cell. */
  particlesPerAxis: number
  /** Gauss-Seidel sweeps in the pressure solve. More is stiffer water. */
  pressureIterations: number
  /** Relaxation sweeps that keep the particles evenly spread. */
  separationIterations: number
  /** 0 is pure PIC (syrup), 1 pure FLIP (energetic, unstable). */
  flipRatio: number
  /** How strongly neighbouring particles pull towards a shared velocity. */
  viscosity: number
}

export const FLUID_SETTING_DEFAULTS: Readonly<FluidSettings> = {
  particlesPerAxis: 4,
  pressureIterations: 30,
  separationIterations: 2,
  flipRatio: 0.97,
  viscosity: 0.03,
}

const STORAGE_KEY = 'verticalVenture:fluidSettings'

// A module-level singleton, so the settings menu and the simulation are
// looking at the same object.
const settings = reactive<FluidSettings>({ ...FLUID_SETTING_DEFAULTS })
let bound = false

/**
 * Clamp whatever came out of storage. A stale or hand-edited value must not
 * be able to hang the solver (a billion pressure sweeps) or upend it (NaN).
 */
function restore(raw: Partial<FluidSettings>) {
  const number = (
    value: unknown,
    fallback: number,
    min: number,
    max: number,
  ) =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.min(Math.max(value, min), max)
      : fallback
  const defaults = FLUID_SETTING_DEFAULTS
  settings.particlesPerAxis = Math.round(
    number(raw.particlesPerAxis, defaults.particlesPerAxis, 1, 4),
  )
  settings.pressureIterations = Math.round(
    number(raw.pressureIterations, defaults.pressureIterations, 5, 60),
  )
  settings.separationIterations = Math.round(
    number(raw.separationIterations, defaults.separationIterations, 0, 4),
  )
  settings.flipRatio = number(raw.flipRatio, defaults.flipRatio, 0.5, 0.99)
  settings.viscosity = number(raw.viscosity, defaults.viscosity, 0, 0.3)
}

export function useFluidSettings() {
  if (!bound && import.meta.client) {
    bound = true
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) restore(JSON.parse(stored))
    } catch {
      // Unreadable storage is the same as no storage.
    }
    watch(settings, () =>
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)),
    )
  }
  const reset = () => Object.assign(settings, FLUID_SETTING_DEFAULTS)
  return { settings, reset }
}
