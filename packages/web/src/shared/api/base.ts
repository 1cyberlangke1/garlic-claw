/**
 * @deprecated 兼容层。请统一从 `@/shared/api/http` 导入请求方法。
 *
 * 历史入口 `@/shared/api/base` 会全部转发到 `@/shared/api/http`，
 * 用于保证旧调用不被破坏。
 */
export * from './http';
