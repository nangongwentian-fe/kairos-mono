# 常用命令

## 安装依赖

```bash
bun install
```

## 运行测试

```bash
bun run test:agent
bun run test:coding-agent
bun run test:coding-tui
bun run test:coding-web
bun run test:tui
bun run test:web-ui
bun run test:deps
```

## 类型检查

```bash
bun run typecheck
```

## 运行真实模型集成测试

需要先在 `.env.local` 中配置：

```bash
OPENCODE_API_KEY=sk-...
```

然后运行：

```bash
bun run test:agent:integration
bun run test:coding-agent:integration
bun run test:coding-agent:workflow:integration
bun run test:coding-tui:integration
```

## 运行 TUI

```bash
bun run kairos
bun run kairos "读取 README 并总结项目结构"
bun run kairos --resume latest
bun run kairos --print "读取 README 并总结项目结构"
bun run kairos --json "读取 README 并总结项目结构"
```

## 运行文档站点

```bash
bun run docs:dev
bun run docs:build
bun run docs:preview
```

## Web UI

```bash
bun run coding-web:dev
```
