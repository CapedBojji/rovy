import { defineConfig } from "vitepress";

const REPO = "https://github.com/CapedBojji/rovy";

export default defineConfig({
  title: "Rovy",
  description: "Bevy-like ECS for Roblox-TS, built on jecs.",
  lang: "en-US",
  base: "/rovy/",
  cleanUrls: true,
  lastUpdated: true,

  head: [["meta", { name: "theme-color", content: "#646cff" }]],

  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Concepts", link: "/concepts/components" },
      { text: "Examples", link: "/examples/" },
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
          { text: "UI", link: "/packages/ui" },
          { text: "World Inspector", link: "/packages/world-inspector" },
        ],
      },
      {
        text: "Examples",
        collapsed: false,
        items: [
          { text: "Example Projects", link: "/examples/" },
          { text: "Combat System", link: "/examples/combat-system" },
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
