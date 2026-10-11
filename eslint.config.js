import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

// Fuer INV-06 gemeinsam mit den neuen Regeln aus Plan 2.6: in EINEM Array, weil zwei
// Config-Objekte mit `no-restricted-syntax` fuer dieselbe Datei sich nicht ergaenzen,
// sondern das spaetere das frueherte komplett ersetzt.
const INV06_SYNTAX_REGELN = [
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message: 'INV-06: Fremdtext wird ausschliesslich als Text gerendert.',
  },
  {
    selector: "MemberExpression[property.name='innerHTML']",
    message: 'INV-06: Fremdtext wird ausschliesslich als Text gerendert.',
  },
];

// Farben kommen aus den Tokens von styles/theme.css, nie als Literal in einer Komponente.
const FARB_REGEL = {
  selector:
    "Literal[value=/(^|[^\\w&])#[0-9a-fA-F]{3,8}\\b|\\b(rgba?|hsla?|oklch|oklab)\\(/]",
  message: 'Farbe als Token aus styles/theme.css, kein Farbliteral in einer Komponente.',
};

// Token-Variablen nur ueber die Map in lib/farben.ts — ein vertippter Name faellt sonst
// erst im Browser auf.
const FARB_VARIABLE_REGEL = {
  selector: "Literal[value=/^var\\(--color-/]",
  message: 'Farb-Variable ueber FARBE aus lib/farben.ts.',
};

// Unterstreichung nur ueber linkVariants — sonst wachsen wieder parallele Link-Stile.
const LINK_REGEL = {
  selector: "Literal[value=/\\bunderline-offset-/]",
  message: 'Link-Stil ueber linkVariants aus lib/linkStil.ts.',
};

const OBERFLAECHEN_SYNTAX_REGELN = [
  ...INV06_SYNTAX_REGELN,
  FARB_REGEL,
  FARB_VARIABLE_REGEL,
  LINK_REGEL,
  {
    // Betrag ohne Vorzeichen braucht den Pfeil aus demselben Wert: richtungswert().
    selector:
      "CallExpression[callee.name=/^(euroAusCent|prozent)$/] > CallExpression.arguments[callee.object.name='Math'][callee.property.name='abs']",
    message: 'Betrag ohne Vorzeichen ueber richtungswert() oder betragOhneVorzeichen() aus lib/format.ts.',
  },
  {
    // Die Ton-Map (auf/ab/gleich -> Klasse) gehoert nach lib/format.ts, nicht in eine Komponente.
    selector: "Property[key.name='ab'] > Literal[value=/^(text|bg)-verlust$/]",
    message: 'Richtungs-Ton ueber richtungTon/richtungBgTon aus lib/format.ts.',
  },
  {
    selector: "NewExpression[callee.object.name='Intl']",
    message: 'Formatierung ausschliesslich ueber lib/format.ts.',
  },
  {
    selector: "CallExpression[callee.property.name=/^(toLocaleString|toFixed|toPrecision)$/]",
    message: 'Formatierung ausschliesslich ueber lib/format.ts.',
  },
  {
    selector: "JSXAttribute[name.name='className'] > JSXExpressionContainer > TemplateLiteral[expressions.length>0]",
    message: 'Bedingte Klassen ueber cn(), kein Template-Literal in className.',
  },
];

// jsx-a11y prueft sonst nur rohe DOM-Elemente; die ui-Komponenten rendern diese hier.
const A11Y_SETTINGS = {
  react: { version: 'detect' },
  'jsx-a11y': {
    components: {
      Button: 'button',
      Table: 'table',
      TableHeader: 'thead',
      TableBody: 'tbody',
      TableRow: 'tr',
      TableHead: 'th',
      TableCell: 'td',
      TableCaption: 'caption',
    },
  },
};

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', '.claude/**', '.demo-export/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.node, ...globals.es2023 },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      // 'smart' erlaubt nur `== null` / `!= null` — die uebliche Form, um in einem
      // Schritt sowohl `null` (aus SQL) als auch `undefined` (aus optionalem Zugriff)
      // abzufangen. Jeder andere lose Vergleich bleibt verboten.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'off',
    },
  },

  // INV-02 · INV-04: der Rechenkern ist rein und rechnet nicht in Fliesskomma.
  {
    files: ['core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['node:*', 'fs', 'path', 'crypto', 'os'], message: 'INV-04: core/ macht kein I/O.' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'INV-04: core/ kennt keine Prozessumgebung.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'INV-04: kein Zufall in core/.' },
        { object: 'Date', property: 'now', message: 'INV-04: keine Uhr in core/.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='parseFloat']",
          message: 'INV-02: Betraege gehen durch zuCent(), nie durch parseFloat.',
        },
        {
          selector: "CallExpression[callee.object.name='Number'][callee.property.name='parseFloat']",
          message: 'INV-02: Betraege gehen durch zuCent(), nie durch parseFloat.',
        },
        {
          // `new Date()` ohne Argument liest die Uhr — `new Date(iso)` parst einen
          // uebergebenen Zeitstempel und ist erlaubt (Bauanleitung §7.2: `tagAus`).
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'INV-04: der heutige Tag ist ein Parameter, keine Uhr.',
        },
        {
          selector: "CallExpression[callee.name='Date']",
          message: 'INV-04: Date() als Funktion liest immer die Uhr, auch mit Argument.',
        },
      ],
    },
  },

  // INV-02 · INV-12: der Ingest verarbeitet fremde Daten.
  {
    files: ['ingest/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='parseFloat']",
          message: 'INV-02: Betraege gehen durch zuCent(), nie durch parseFloat.',
        },
        {
          selector: "CallExpression[callee.object.name='Number'][callee.property.name='parseFloat']",
          message: 'INV-02: Betraege gehen durch zuCent(), nie durch parseFloat.',
        },
        {
          selector: "CallExpression[callee.name='execSync']",
          message: 'Kindprozesse ausschliesslich ueber execFile mit Argument-Array.',
        },
      ],
    },
  },

  // Oberflaeche: INV-05, INV-06 und die Bauregeln aus P-06. `ui/**` bleibt aussen vor —
  // eigener, reduzierter Regelsatz weiter unten, sonst wird shadcns Bibliothekscode rot.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/components/ui/**'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    settings: A11Y_SETTINGS,
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,

      // INV-05: kein Inline-CSS. Zwei Ausnahmen mit begruendetem eslint-disable.
      'react/forbid-dom-props': ['error', { forbid: ['style'] }],
      'react/forbid-component-props': ['error', { forbid: ['style'] }],

      // INV-06: Fremdtext wird nie als HTML gerendert.
      'react/no-danger': 'error',
      'no-restricted-syntax': ['error', ...OBERFLAECHEN_SYNTAX_REGELN],
      'react/prop-types': 'off',
    },
  },

  // `lib/format.ts` ist der einzige Ort, der ueberhaupt formatieren DARF — dort waeren
  // die beiden Formatierungs-Selektoren von oben falscher Alarm.
  {
    files: ['src/lib/format.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['src/lib/farben.ts', 'src/lib/linkStil.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...OBERFLAECHEN_SYNTAX_REGELN.filter((r) => r !== FARB_VARIABLE_REGEL && r !== LINK_REGEL),
      ],
    },
  },

  // Chart-Masse als benannte Konstante, nicht als Pixel-Literal im JSX verstreut.
  {
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...OBERFLAECHEN_SYNTAX_REGELN,
        {
          selector:
            "JSXAttribute[name.name=/^(fontSize|width|height|rx|r|strokeWidth|dx|dy|minTickGap)$/] > JSXExpressionContainer > :matches(Literal[raw=/^\\d/], UnaryExpression[operator='-'][argument.raw=/^\\d/], Literal[value=/^-?\\d+(\\.\\d+)?(px)?$/])",
          message: 'Chart-Masse als Konstante, kein Pixel-Literal direkt im JSX.',
        },
        {
          selector:
            "JSXAttribute[name.name=/^(fontSize|width|height|rx|r|strokeWidth|dx|dy|minTickGap)$/] > Literal[value=/^-?\\d+(\\.\\d+)?(px)?$/]",
          message: 'Chart-Masse als Konstante, kein Pixel-Literal direkt im JSX.',
        },
      ],
    },
  },

  // shadcn/ui: eigener Regelsatz. Stil- und Bauregeln aus dem Oberflaechenblock gelten hier
  // nicht (Registry-Code, siehe ADR-024) — die Invarianten INV-05 und INV-06 aber schon,
  // sie kennen keine Ausnahme fuer ui/.
  {
    files: ['src/components/ui/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'jsx-a11y': jsxA11y },
    settings: A11Y_SETTINGS,
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      'react/forbid-dom-props': ['error', { forbid: ['style'] }],
      'react/forbid-component-props': ['error', { forbid: ['style'] }],
      'react/no-danger': 'error',
      'no-restricted-syntax': [
        'error',
        ...INV06_SYNTAX_REGELN,
        FARB_REGEL,
        {
          selector: "Literal[value=/\\boutline-none\\b/]:not([value=/focus-visible:/])",
          message: 'outline-none nur zusammen mit einem focus-visible-Ring in derselben Klasse.',
        },
      ],
    },
  },

  // Sichtbarer Text kommt aus i18n/de.ts, nicht als Literal zwischen zwei Tags.
  {
    files: ['src/features/**/*.tsx', 'src/components/**/*.tsx'],
    ignores: ['src/components/ui/**'],
    rules: { 'react/jsx-no-literals': ['error', { noStrings: false, ignoreProps: true }] },
  },

  // Ansichten rendern nur; Daten holen die Kacheln (und Seite und Lauf-Knopf).
  {
    files: ['src/features/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    ignores: ['src/features/**/*Kachel.tsx', 'src/components/Aktualisieren.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '@tanstack/react-query', message: 'Ansichten holen keine Daten — das tut die Kachel.' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Ansichten holen keine Daten — das tut die Kachel.' },
      ],
    },
  },

  // Tests duerfen, was Produktionscode nicht darf.
  {
    files: ['test/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-restricted-syntax': 'off',
      'no-restricted-globals': 'off',
      'no-restricted-imports': 'off',
    },
  },
);
