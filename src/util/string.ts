/**
 * Capitalizes the first character of a string.
 * @param str - The input string
 * @returns The string with the first character uppercased
 */
export function capitalize(str: string): string {
  if (!str) {
    return str;
  }
  return str.charAt(0).toUpperCase() + str.slice(1);
}
