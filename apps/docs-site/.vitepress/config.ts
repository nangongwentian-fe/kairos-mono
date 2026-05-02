import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Kairos Agent SDK 教程",
  description: "从 0 实现一个 TypeScript Coding Agent SDK",
  lang: "zh-CN",
  cleanUrls: true,
  lastUpdated: true,
  markdown: {
    lineNumbers: true,
  },
  themeConfig: {
    siteTitle: "Kairos 教程",
    search: {
      provider: "local",
    },
    nav: [
      { text: "教程", link: "/guide/00-why-kairos" },
      { text: "设计", link: "/design/package-boundaries" },
      { text: "附录", link: "/appendix/timeline" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "从 0 到可运行 Agent",
          items: [
            { text: "00. 为什么做 Kairos", link: "/guide/00-why-kairos" },
            { text: "01. 总体架构", link: "/guide/01-overall-architecture" },
            { text: "02. 接入 OpenCode Go", link: "/guide/02-ai-provider-opencode-go" },
            { text: "03. Agent Runtime", link: "/guide/03-agent-runtime" },
            { text: "04. Tool Calling", link: "/guide/04-tool-calling" },
            { text: "05. Coding Agent 只读工具", link: "/guide/05-coding-agent-read-tools" },
            { text: "06. 安全编辑文件", link: "/guide/06-edit-file-safety" },
            { text: "07. 运行命令工具", link: "/guide/07-run-command" },
            { text: "08. 最小 TUI", link: "/guide/08-tui-minimal" },
            { text: "09. Todo 工具", link: "/guide/09-todo-write" },
            { text: "10. Middleware", link: "/guide/10-middleware" },
            { text: "11. Tool Policy", link: "/guide/11-tool-policy" },
            { text: "12. Workspace Diff", link: "/guide/12-workspace-diff" },
            { text: "13. Coding Web", link: "/guide/13-coding-web" },
          ],
        },
      ],
      "/design/": [
        {
          text: "设计记录",
          items: [
            { text: "Package 边界", link: "/design/package-boundaries" },
            { text: "Reference 项目怎么用", link: "/design/reference-projects" },
            { text: "为什么不先做 FakeModel", link: "/design/why-not-fakemodel" },
            { text: "为什么是 grep 工具", link: "/design/why-grep-not-search-text" },
            { text: "为什么策略放在 Coding Agent", link: "/design/why-policy-in-coding-agent" },
          ],
        },
      ],
      "/appendix/": [
        {
          text: "附录",
          items: [
            { text: "实现时间线", link: "/appendix/timeline" },
            { text: "常用命令", link: "/appendix/commands" },
            { text: "术语表", link: "/appendix/glossary" },
          ],
        },
      ],
    },
    outline: {
      level: [2, 3],
      label: "本页目录",
    },
    docFooter: {
      prev: "上一页",
      next: "下一页",
    },
    lastUpdated: {
      text: "最后更新",
    },
  },
});
