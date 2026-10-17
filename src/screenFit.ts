// Interface size that suits the window, in the same steps as the Interface
// size setting. Sizes are CSS pixels, so the system display scaling (for
// example 150% on a 4K laptop) is already taken into account.
export function autoUiScale(width: number, height: number) {
  if (width < 1100 || height < 680) return 90;
  if (width < 1300 || height < 760) return 95;
  if (width >= 3200 && height >= 1700) return 130;
  if (width >= 2500 && height >= 1300) return 120;
  if (width >= 1900 && height >= 1100) return 110;
  return 100;
}
