import { defineConfig } from "vitepress";

const REPO = "https://github.com/CapedBojji/rovy";

export default defineConfig({
  title: "Rovy",
  description: "Bevy-like ECS for Roblox-TS, built on jecs.",
  lang: "en-US",
  base: "/rovy/",
  vite: {
    server: {
      host: true,
      // Vite does not read PORT on its own. Honoring it lets a supervising
      // process (a preview harness, a container, CI) hand the dev server a
      // free port instead of fighting over the 5173 default.
      port: process.env.PORT ? Number(process.env.PORT) : undefined,
      allowedHosts: [".trycloudflare.com"],
    },
  },
  cleanUrls: true,
  lastUpdated: true,

  head: [["meta", { name: "theme-color", content: "#646cff" }]],

  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Concepts", link: "/concepts/components" },
      {
        text: "Rovy UI",
        items: [
          { text: "Overview", link: "/packages/ui" },
          { text: "Getting Started", link: "/packages/ui/getting-started" },
          { text: "JSX", link: "/packages/ui/jsx" },
          { text: "Props & Children", link: "/packages/ui/props-and-children" },
          { text: "Events & Refs", link: "/packages/ui/events-and-refs" },
          { text: "Reconciliation", link: "/packages/ui/reconciliation" },
          { text: "Portals & World UI", link: "/packages/ui/portals" },
          { text: "Render Injection", link: "/packages/ui/render-injection" },
          { text: "Rerender Triggers", link: "/packages/ui/rerender-triggers" },
          { text: "Compiled Output", link: "/packages/ui/compiled-output" },
          { text: "Built-in Widgets", link: "/packages/ui/built-in-widgets" },
          { text: "API Reference", link: "/packages/ui/api-reference" },
          { text: "Styling", link: "/packages/ui/styling" },
          { text: "Components", link: "/packages/ui/custom-widgets" },
        ],
      },
      { text: "Rovy ImGui", link: "/packages/imgui" },
      { text: "Rovy Vide", link: "/packages/vide" },
      { text: "Scribe", link: "/packages/scribe" },
      { text: "Reference", link: "/reference/api" },
    ],

    sidebar: [
      {
        text: "Guide",
        collapsed: false,
        items: [
          { text: "Getting Started", link: "/guide/getting-started" },
          { text: "Installation", link: "/guide/installation" },
          { text: "Your First System", link: "/guide/your-first-system" },
          { text: "Overview", link: "/guide/overview" },
        ],
      },
      {
        text: "Concepts",
        collapsed: false,
        items: [
          { text: "Components & Resources", link: "/concepts/components" },
          { text: "Queries", link: "/concepts/queries" },
          { text: "Commands", link: "/concepts/commands" },
          { text: "Events", link: "/concepts/events" },
          { text: "Observers", link: "/concepts/observers" },
          { text: "Schedules", link: "/concepts/schedules" },
          { text: "Systems & Injection", link: "/concepts/systems-and-injection" },
          { text: "Change Detection", link: "/concepts/change-detection" },
          { text: "Monitors", link: "/concepts/monitors" },
          { text: "Traits", link: "/concepts/traits" },
          { text: "Trait Runtime", link: "/concepts/trait-runtime" },
          { text: "Relationships", link: "/concepts/relationships" },
          { text: "Collectors", link: "/concepts/collectors" },
          { text: "Prefabs", link: "/concepts/prefabs" },
          { text: "Plugins", link: "/concepts/plugins" },
        ],
      },
      {
        text: "Runtime",
        collapsed: false,
        items: [
          { text: "Runtime Lifecycle", link: "/runtime/lifecycle" },
          { text: "Transformer", link: "/runtime/transformer" },
          { text: "Compiled Output", link: "/runtime/compiled-output" },
        ],
      },
      {
        text: "Packages",
        collapsed: false,
        items: [
          { text: "Packages Overview", link: "/packages/packages" },
          { text: "Networking", link: "/packages/networking" },
          { text: "Datastore", link: "/packages/datastore" },
          { text: "Parallel", link: "/packages/parallel" },
          {
            text: "Scribe",
            collapsed: true,
            items: [
              { text: "Guide", link: "/packages/scribe" },
              { text: "Migration", link: "/packages/scribe-migration" },
              { text: "Compatibility", link: "/packages/scribe-compatibility" },
              { text: "Parity", link: "/packages/scribe-parity" },
            ],
          },
          { text: "Rovy Vide", link: "/packages/vide" },
          {
            text: "Rovy UI",
            collapsed: true,
            items: [
              { text: "Overview", link: "/packages/ui" },
              { text: "Getting Started", link: "/packages/ui/getting-started" },
              { text: "JSX", link: "/packages/ui/jsx" },
              { text: "Props & Children", link: "/packages/ui/props-and-children" },
              { text: "Events & Refs", link: "/packages/ui/events-and-refs" },
              { text: "Reconciliation", link: "/packages/ui/reconciliation" },
              { text: "Portals & World UI", link: "/packages/ui/portals" },
              { text: "Render Injection", link: "/packages/ui/render-injection" },
              { text: "Rerender Triggers", link: "/packages/ui/rerender-triggers" },
              { text: "Compiled Output", link: "/packages/ui/compiled-output" },
              { text: "Built-in Widgets", link: "/packages/ui/built-in-widgets" },
              { text: "API Reference", link: "/packages/ui/api-reference" },
              { text: "Styling", link: "/packages/ui/styling" },
              { text: "Components", link: "/packages/ui/custom-widgets" },
            ],
          },
          {
            text: "Rovy ImGui",
            collapsed: true,
            items: [
              { text: "Overview", link: "/packages/imgui" },
              { text: "Getting Started", link: "/packages/imgui/getting-started" },
              { text: "Built-in Widgets", link: "/packages/imgui/built-in-widgets" },
              { text: "Curve Editor", link: "/packages/imgui/curve-editor" },
              { text: "Custom Widgets", link: "/packages/imgui/custom-widgets" },
              { text: "Styling", link: "/packages/imgui/styling" },
              { text: "API Reference", link: "/packages/imgui/api-reference" },
            ],
          },
          { text: "World Inspector", link: "/packages/world-inspector" },
        ],
      },
      {
        text: "Reference",
        collapsed: false,
        items: [
          { text: "API Reference", link: "/reference/api" },
          { text: "Decisions", link: "/reference/decisions" },
          { text: "Roadmap", link: "/reference/roadmap" },
        ],
      },
    ],

    socialLinks: [{ icon: "github", link: REPO }],

    search: { provider: "local" },

    editLink: {
      pattern: `${REPO}/edit/main/docs/:path`,
      text: "Edit this page on GitHub",
    },

    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2026 Rovy contributors",
    },
  },
});
