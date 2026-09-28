// What kind of device this is, decided once at load.

// The main pointer is a finger (phones, tablets), so there is no hover
export const COARSE_POINTER = window.matchMedia("(pointer: coarse)").matches;

// Phones get the half-size climate overlay. Tablets start at 744 CSS px on their short side
export const IS_PHONE = COARSE_POINTER && Math.min(window.screen.width, window.screen.height) < 600;
