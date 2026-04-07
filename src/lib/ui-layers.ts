export const UI_LAYER_VALUE = {
  resizer: 20,
  chrome: 30,
  floatingChrome: 40,
  muse: 60,
  dialog: 80,
  popover: 90,
  lightbox: 100,
  appMenu: 110,
} as const

export const UI_LAYER_CLASS = {
  resizer: "z-20",
  chrome: "z-30",
  floatingChrome: "z-40",
  muse: "z-[60]",
  dialog: "z-[80]",
  popover: "z-[90]",
  lightbox: "z-[100]",
  appMenu: "z-[110]",
} as const
