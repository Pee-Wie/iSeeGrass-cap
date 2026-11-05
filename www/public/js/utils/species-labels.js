const MODEL_CLASS_LABELS = new Set([
  'ferny full',
  'ferny sub',
  'rounded',
  'rounded oval',
  'rounded pure',
  'strappy',
  'strappy long',
  'strappy short',
]);

export function cleanSpeciesLabel(value) {
  const label = String(value || '').trim();
  if (!label) return '';

  const classSuffix = label.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (classSuffix && MODEL_CLASS_LABELS.has(classSuffix[2].trim().toLocaleLowerCase())) {
    return classSuffix[1].trim();
  }

  return MODEL_CLASS_LABELS.has(label.toLocaleLowerCase())
    ? 'Species not identified'
    : label;
}
