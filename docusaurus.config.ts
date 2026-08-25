import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'Sokrates Developer Docs',
  tagline: 'Developer documentation for the SokratesAI platform',
  favicon: 'img/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Served in-cluster behind Tailscale ingress, same pattern as the
  // newspaper PWA -- see platform-config crossplane/service-sokrates-docs.yaml.
  url: 'https://sokrates-docs.tailc83eb3.ts.net',
  baseUrl: '/',

  organizationName: 'SokratesAI',
  projectName: 'sokrates-docs',

  onBrokenLinks: 'throw',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  // Installable, and readable on a dead tailnet link -- same thing Nova's own
  // site does by hand, done here with the official plugin because Docusaurus
  // owns the build output and a hand-rolled service worker would have to guess
  // at its hashed asset names.
  //
  // `offlineModeActivationStrategies` deliberately omits `always`: the docs are
  // rewritten by the gh-aw sync workflow, so serving a cached page to a browser
  // that could have reached the network is how a reader ends up reading a
  // reference page that no longer matches the cluster. Offline mode turns on
  // once the app is actually installed (or explicitly asked for with
  // `?docusaurus-plugin-pwa-debug`), which is the case where there is no
  // network to prefer.
  plugins: [
    [
      '@docusaurus/plugin-pwa',
      {
        debug: false,
        offlineModeActivationStrategies: ['appInstalled', 'standalone', 'queryString'],
        pwaHead: [
          {tagName: 'link', rel: 'icon', href: '/img/icon.svg'},
          {tagName: 'link', rel: 'manifest', href: '/manifest.json'},
          {tagName: 'meta', name: 'theme-color', content: '#3ECC5F'},
          {tagName: 'meta', name: 'apple-mobile-web-app-capable', content: 'yes'},
          {tagName: 'meta', name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent'},
          // PNG, not the SVG beside it. iOS Safari reads this tag directly and
          // never looks at the manifest for icons, and it does not rasterise
          // SVG here -- it falls back to a screenshot of the page. The Nova
          // site has the same SVG-only tag and the same defect; this one is
          // fixed, that one is filed.
          {tagName: 'link', rel: 'apple-touch-icon', href: '/img/apple-touch-icon.png'},
        ],
      },
    ],
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/', // docs are the homepage, no separate landing page
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/SokratesAI/sokrates-docs/tree/main/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Sokrates Docs',
      logo: {
        alt: 'Sokrates Logo',
        src: 'img/logo.svg',
      },
      items: [
        {to: '/tutorials/intro', label: 'Tutorials', position: 'left'},
        {to: '/how-to/intro', label: 'How-to', position: 'left'},
        {to: '/reference/intro', label: 'Reference', position: 'left'},
        {to: '/explanation/intro', label: 'Explanation', position: 'left'},
        {
          href: 'https://github.com/SokratesAI/sokrates-docs',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {label: 'Tutorials', to: '/tutorials/intro'},
            {label: 'How-to Guides', to: '/how-to/intro'},
            {label: 'Reference', to: '/reference/intro'},
            {label: 'Explanation', to: '/explanation/intro'},
          ],
        },
        {
          title: 'More',
          items: [
            {label: 'GitHub', href: 'https://github.com/SokratesAI/sokrates-docs'},
            {label: 'Diátaxis', href: 'https://diataxis.fr/'},
          ],
        },
      ],
      copyright: `Built with Docusaurus. Reference docs kept current by gh-aw.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
