/**
 * 静态演示开关。
 *
 * 构建时置 `VITE_DEMO_MODE=true`（GitHub Pages 工作流即如此）时，
 * 前端不访问 `/api/bank`，直接用 `demoData.ts` 里的快照渲染。
 */
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
