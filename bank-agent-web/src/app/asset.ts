/**
 * public/ 下的静态资源统一用 base 前缀引用。
 *
 * 本地开发 base 是 "/"，GitHub Pages 上是 "/bank-agent-web/"，
 * 写死 "/xxx.png" 在子路径部署时会 404。
 */
export const asset = (path: string): string =>
  `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;
