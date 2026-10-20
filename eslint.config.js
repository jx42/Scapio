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

// Ein Muster als Selektor fuer String- und Template-Literal zugleich — sonst rutscht
// derselbe Wert in Backticks an der Regel vorbei.
const textMuster = (muster) => `:matches(Literal[value=/${muster}/], TemplateElement[value.raw=/${muster}/])`;

// Farben kommen aus den Tokens von styles/theme.css, nie als Literal in einer Komponente.
const FARB_REGEL = {
  selector: textMuster('(^|[^\\w&])#[0-9a-fA-F]{3,8}\\b|\\b(rgba?|hsla?|oklch|oklab)\\('),
  message: 'Farbe als Token aus styles/theme.css, kein Farbliteral in einer Komponente.',
};

// Tailwinds Standardpalette ist in theme.css abgeschaltet (`--color-*: initial`); die Klasse
// erzeugte nichts und fiele nur im Browser auf.
const PALETTEN_REGEL = {
  selector: textMuster(
    '\\b(bg|text|border|ring|outline|fill|stroke|from|via|to|divide|shadow|accent|caret|decoration)-((slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3}|white|black)\\b',
  ),
  message: 'Farbe als Token aus styles/theme.css, keine Klasse der Tailwind-Standardpalette.',
};

// Token-Variablen nur ueber die Map in lib/farben.ts — ein vertippter Name faellt sonst
// erst im Browser auf.
const FARB_VARIABLE_REGEL = {
  selector: textMuster('var\\(--color-'),
  message: 'Farb-Variable ueber FARBE aus lib/farben.ts.',
};

// Masse aus der Tailwind-Skala oder als Token, kein willkuerlicher Pixelwert in einer Klasse.
const PIXEL_KLASSEN_REGEL = {
  selector: textMuster('\\[-?\\d+(\\.\\d+)?px\\]'),
  message: 'Mass aus der Tailwind-Skala oder als Token in theme.css, kein [..px] in einer Klasse.',
};

// Unterstreichung nur ueber linkVariants — sonst wachsen wieder parallele Link-Stile.
const LINK_REGEL = {
  selector: "Literal[value=/\\bunderline-offset-/]",
  message: 'Link-Stil ueber linkVariants aus lib/linkStil.ts.',
};

// Die Ton-Map (auf/ab/neutral -> Klasse) steht einmal in lib/farben.ts, nicht in einer Komponente.
const TON_MAP_REGEL = {
  selector: "Property[key.name='ab'] > Literal[value=/^(text|bg)-verlust$/]",
  message: 'Richtungs-Ton ueber richtungTon/richtungBgTon aus lib/farben.ts.',
};

// `react/jsx-no-literals` laesst Props durch; vorgelesener Text gehoert trotzdem nach i18n/de.ts.
const ARIA_TEXT_REGEL = {
  selector: 'JSXAttribute[name.name=/^aria-(label|description|valuetext|roledescription|placeholder)$/] > Literal',
  message: 'Vorgelesener Text kommt aus i18n/de.ts, nicht als Literal.',
};

const OBERFLAECHEN_SYNTAX_REGELN = [
  ...INV06_SYNTAX_REGELN,
  ARIA_TEXT_REGEL,
  FARB_REGEL,
  PALETTEN_REGEL,
  FARB_VARIABLE_REGEL,
  PIXEL_KLASSEN_REGEL,
  LINK_REGEL,
  {
    // Betrag ohne Vorzeichen braucht den Pfeil aus demselben Wert: richtungswert().
    selector:
      "CallExpression[callee.name=/^(euroAusCent|prozent)$/] > CallExpression.arguments[callee.object.name='Math'][callee.property.name='abs']",
    message: 'Betrag ohne Vorzeichen ueber richtungswert() oder betragOhneVorzeichen() aus lib/format.ts.',
  },
  TON_MAP_REGEL,
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

const KEINE_DATEN_IMPORT = { name: '@tanstack/react-query', message: 'Ansichten holen keine Daten — das tut die Kachel.' };
const KEIN_RECHARTS_IMPORT = { name: 'recharts', message: 'Charts nur in src/features/, ueber <ChartRahmen>.' };
const KEIN_FETCH = { name: 'fetch', message: 'Ansichten holen keine Daten — das tut die Kachel.' };

// jsx-a11y prueft sonst nur rohe DOM-Elemente; die ui-Komponenten rendern diese hier.
// Slider, Popover-Inhalt und Toasts haben kein DOM-Gegenstueck: die prueft axe im e2e-Durchstich.
const A11Y_SETTINGS = {
  react: { version: 'detect' },
  'jsx-a11y': {
    components: {
      Button: 'button',
      TabsTrigger: 'button',
      ToggleGroupItem: 'button',
      PopoverTrigger: 'button',
      CollapsibleTrigger: 'button',
      DropdownMenuTrigger: 'button',
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
      ...jsxA11y.flatConfigs.strict.rules,

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
        ...OBERFLAECHEN_SYNTAX_REGELN.filter((r) => ![FARB_VARIABLE_REGEL, LINK_REGEL, TON_MAP_REGEL].includes(r)),
      ],
    },
  },

  // Chart-Masse als benannte Konstante, nicht als Pixel-Literal im JSX verstreut.
  {
    files: ['src/features/**/*.{ts,tsx}', 'src/components/Leuchtfilter.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...OBERFLAECHEN_SYNTAX_REGELN,
        {
          selector:
            "JSXAttribute[name.name=/^(fontSize|width|height|rx|r|radius|innerRadius|outerRadius|paddingAngle|strokeWidth|strokeDasharray|stdDeviation|slope|dx|dy|minTickGap)$/] > JSXExpressionContainer > :matches(Literal[raw=/^\\d/], UnaryExpression[operator='-'][argument.raw=/^\\d/], ArrayExpression, Literal[value=/^-?\\d+(\\.\\d+)?(px|%)?( -?\\d+(\\.\\d+)?)*$/]:not([value='100%']))",
          message: 'Chart-Masse als Konstante, kein Pixel-Literal direkt im JSX.',
        },
        {
          selector:
            "JSXAttribute[name.name=/^(fontSize|width|height|rx|r|radius|innerRadius|outerRadius|paddingAngle|strokeWidth|strokeDasharray|stdDeviation|slope|dx|dy|minTickGap)$/] > Literal[value=/^-?\\d+(\\.\\d+)?(px|%)?( -?\\d+(\\.\\d+)?)*$/]:not([value='100%'])",
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
      ...jsxA11y.flatConfigs.strict.rules,
      'react/forbid-dom-props': ['error', { forbid: ['style'] }],
      'react/forbid-component-props': ['error', { forbid: ['style'] }],
      'react/no-danger': 'error',
      'no-restricted-syntax': [
        'error',
        ...INV06_SYNTAX_REGELN,
        ARIA_TEXT_REGEL,
        FARB_REGEL,
        PALETTEN_REGEL,
        {
          // Menue-Eintraege zeigen den Fokus als Flaeche (`focus:bg-…`), theme.css nimmt sie vom Ring aus.
          selector: "Literal[value=/\\boutline-(none|hidden)\\b/]:not([value=/focus(-visible)?:/])",
          message: 'outline-none/-hidden nur zusammen mit einer focus- oder focus-visible-Klasse in derselben Zeichenkette.',
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

  // Ansichten rendern nur; Daten holen die Kacheln (und Seite, Einstieg, Lauf-Knopf und lib/api.ts).
  // Recharts bleibt in den Features — eine Chart ausserhalb ginge an <ChartRahmen> vorbei.
  // Ein Block je Kombination: zwei Bloecke mit derselben Regel ersetzen sich, sie ergaenzen sich nicht.
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { paths: [KEINE_DATEN_IMPORT, KEIN_RECHARTS_IMPORT] }],
      'no-restricted-globals': ['error', KEIN_FETCH],
    },
  },
  {
    files: ['src/features/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { paths: [KEINE_DATEN_IMPORT] }] },
  },
  {
    files: ['src/features/**/*Kachel.tsx'],
    rules: { 'no-restricted-imports': 'off', 'no-restricted-globals': 'off' },
  },
  {
    files: ['src/App.tsx', 'src/main.tsx', 'src/components/Aktualisieren.tsx', 'src/lib/api.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: [KEIN_RECHARTS_IMPORT] }],
      'no-restricted-globals': 'off',
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
