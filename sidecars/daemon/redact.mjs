// 敏感凭据与 URL 查询参数脱敏工具模块（独立抽离，供守护进程与单测共用）

export const SECRET_TOKEN_RE =
  /(sk-[A-Za-z0-9_\-]{6,}|AIza[A-Za-z0-9_\-]{12,}|xai-[A-Za-z0-9_\-]{8,}|ghp_[A-Za-z0-9]{12,}|github_pat_[A-Za-z0-9_]{12,}|Bearer\s+[A-Za-z0-9._\-]{8,})/gi;

export const URL_SECRET_QUERY_RE = /([?&](?:token|auth|signature|key|secret)=)[^&\s#"']+/gi;

/**
 * 对日志、路径或错误消息执行凭据脱敏（覆盖 URL 内置账密、敏感 Query 参数及 API Key/Token）。
 */
export function sanitizeSecretText(text) {
  return String(text || '')
    .replace(/https?:\/\/[^/\s:@]+:[^/\s@]+@/gi, 'https://***@')
    .replace(URL_SECRET_QUERY_RE, '$1<REDACTED>')
    .replace(SECRET_TOKEN_RE, '***REDACTED***');
}
