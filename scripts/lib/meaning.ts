/** Short English meaning for archive cards. Pure function, no dependencies. */

export const SHORT_MEANING_MAX = 48;

/**
 * Up to two "; "-separated glosses, kept within `max` characters. A single gloss that is too
 * long loses its parenthetical notes, then is cut at a comma or word boundary.
 */
export function shortMeaning(definition: string, max = SHORT_MEANING_MAX): string {
  const glosses = definition.split('; ').map((g) => g.trim()).filter(Boolean);
  if (!glosses.length) return '';
  let first = glosses[0];
  if (first.length > max) first = first.replace(/\s*\([^)]*\)/g, '').trim();
  if (first.length > max) {
    const comma = first.lastIndexOf(', ', max);
    if (comma > 0) first = first.slice(0, comma);
    else {
      const space = first.lastIndexOf(' ', max - 1);
      first = `${first.slice(0, space > 0 ? space : max - 1)}…`;
    }
  }
  const two = glosses[1] ? `${first}; ${glosses[1]}` : first;
  return two.length <= max ? two : first;
}
