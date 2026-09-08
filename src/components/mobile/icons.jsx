/**
 * Les seules icones de la version mobile : la navigation et le theme.
 *
 * Ailleurs l'interface est en toutes lettres — un libelle se lit, une icone
 * se devine. Ici elles sont necessaires : une barre d'onglets sans glyphe
 * n'est pas une barre d'onglets.
 */
function Glyph({ children, size = 21 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** Pseudonymiser : la valeur disparait derriere son pseudonyme. */
export function MaskIcon(props) {
  return (
    <Glyph {...props}>
      <path d="M10.6 6.2A9.6 9.6 0 0 1 12 6c4.5 0 7.8 3.2 9 6a13 13 0 0 1-2.6 3.6" />
      <path d="M6.4 8.2C4.8 9.4 3.7 11 3 12c1.2 2.8 4.5 6 9 6 1.3 0 2.6-.3 3.7-.8" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M4 4l16 16" />
    </Glyph>
  );
}

/** De-pseudonymiser : la valeur d'origine revient. */
export function RevealIcon(props) {
  return (
    <Glyph {...props}>
      <path d="M3 12c1.2-2.8 4.5-6 9-6s7.8 3.2 9 6c-1.2 2.8-4.5 6-9 6s-7.8-3.2-9-6Z" />
      <circle cx="12" cy="12" r="2.6" />
    </Glyph>
  );
}

export function FolderIcon(props) {
  return (
    <Glyph {...props}>
      <path d="M3.6 7.4A2.2 2.2 0 0 1 5.8 5.2h3.3l1.9 2.4h7.2a2.2 2.2 0 0 1 2.2 2.2v8a2.2 2.2 0 0 1-2.2 2.2H5.8a2.2 2.2 0 0 1-2.2-2.2z" />
    </Glyph>
  );
}

export function SunIcon(props) {
  return (
    <Glyph size={18} {...props}>
      <circle cx="12" cy="12" r="3.6" />
      <path d="M12 4v1.6M12 18.4V20M4 12h1.6M18.4 12H20M6.3 6.3l1.2 1.2M16.5 16.5l1.2 1.2M17.7 6.3l-1.2 1.2M7.5 16.5l-1.2 1.2" />
    </Glyph>
  );
}

export function MoonIcon(props) {
  return (
    <Glyph size={18} {...props}>
      <path d="M20 14.6A8.2 8.2 0 0 1 9.4 4 8.2 8.2 0 1 0 20 14.6Z" />
    </Glyph>
  );
}

export function FileIcon(props) {
  return (
    <Glyph size={24} {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </Glyph>
  );
}

export function GridIcon(props) {
  return (
    <Glyph size={24} {...props}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 10h16M10 10v10" />
    </Glyph>
  );
}
