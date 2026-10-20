export function containsSecret(s: string) {
  return /(?:sk-(?:proj-|ant-)?[a-z0-9_-]{16,}|sb_secret_[a-z0-9_-]+|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:api[_-]?key|password|비밀번호|secret|access[_-]?token)\s*[:=]\s*["']?[^\s"']{8,}|eyJ[a-zA-Z0-9_-]{15,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)/i.test(
    s,
  );
}
