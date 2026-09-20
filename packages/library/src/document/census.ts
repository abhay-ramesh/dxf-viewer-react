/**
 * Count entity markers directly in the DXF text.
 *
 * The parser is not the whole truth: dxf-parser drops types it does not
 * understand — HATCH and LEADER among them — before the viewer ever sees
 * them. Reporting only on what the parser returned would therefore say
 * "nothing omitted" about a drawing full of hatches, which is exactly the
 * silence the report exists to remove.
 *
 * So the raw text is counted too, and the difference is what went missing
 * before we had a chance.
 */

/** Entities are introduced by a `0` group code followed by the type name. */
const ENTITY_MARKER = /^\s*0\s*\r?\n\s*([A-Z][A-Z0-9_]*)\s*$/gm;

/** Group codes that open and close the entity list. */
const NOT_AN_ENTITY = new Set([
  "SECTION",
  "ENDSEC",
  "EOF",
  "TABLE",
  "ENDTAB",
  "BLOCK",
  "ENDBLK",
  "CLASS",
  "VERTEX",
  "SEQEND",
  "ATTRIB",
]);

/**
 * How many of each entity type the ENTITIES section declares.
 *
 * Only the model-space entity list is counted: entities inside BLOCKS are
 * drawn through the INSERTs that reference them, so counting them here would
 * double-count or, worse, report block contents that are never placed.
 */
export function censusFromText(dxfContent: string): Record<string, number> {
  const counts: Record<string, number> = {};
  const section = entitiesSection(dxfContent);
  if (!section) return counts;

  ENTITY_MARKER.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ENTITY_MARKER.exec(section)) !== null) {
    const type = match[1];
    if (NOT_AN_ENTITY.has(type)) continue;
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return counts;
}

function entitiesSection(dxfContent: string): string | null {
  const start = dxfContent.search(/^\s*2\s*\r?\n\s*ENTITIES\s*$/m);
  if (start === -1) return null;
  const rest = dxfContent.slice(start);
  const end = rest.search(/^\s*0\s*\r?\n\s*ENDSEC\s*$/m);
  return end === -1 ? rest : rest.slice(0, end);
}

/**
 * Types the file declares that the parser did not hand back.
 *
 * Returns the shortfall per type, so a partial loss (nine of ten SPLINEs) is
 * as visible as a total one.
 */
export function parserShortfall(
  declared: Record<string, number>,
  parsed: Record<string, number>
): Record<string, number> {
  const missing: Record<string, number> = {};
  for (const [type, count] of Object.entries(declared)) {
    const seen = parsed[type] ?? 0;
    if (count > seen) missing[type] = count - seen;
  }
  return missing;
}
