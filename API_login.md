# LPT Auth API 使用文档 (v1)

服务域名: `https://auth.lifeplayertribe.com`

API Base: `https://auth.lifeplayertribe.com/api/v1`

说明:
- 本服务使用 **Cookie(Session)** 作为统一登录态（SSO）。Cookie 名为 `lpt_session`，会在 `.lifeplayertribe.com` 根域下共享。
- 其他子站点不需要拿到 token 字符串，只要用 `credentials: "include"` 调用接口即可。
- 若你需要在后端本地验签（不想每次都请求 auth），可用 `JWKS` 验证 `lpt_session` 这个 JWT。

---

## 1. 鉴权模型

### 1.1 Session Cookie

- Cookie 名: `lpt_session`
- 类型: JWT (`RS256`)
- 作用域:
  - 正常使用域名访问时: `Domain=.lifeplayertribe.com`（所有子域共享）
  - 直接用 IP 访问时: 不设置 `Domain`（仅对该 IP 生效，用于调试）
- 重要属性: `HttpOnly`, `SameSite=Lax`
- `Secure`:
  - HTTPS 请求会自动下发 `Secure` cookie
  - 生产环境建议全站 HTTPS（否则不同 scheme 会影响 SameSite 发送策略）

### 1.2 用户角色

`/api/v1/auth/me` 返回 `role`：
- `super_admin`: 超级管理员
- `admin`: 普通管理员
- `user`: 普通用户

---

## 2. CORS / 跨子域调用

当其他站点（如 `https://xxx.lifeplayertribe.com`）在浏览器中调用本服务 API：

- 必须加: `credentials: "include"`
- Origin 规则:
  - 默认允许 `lifeplayertribe.com` 的所有子域（站内子域互通）
  - 不在允许列表的 Origin 会得到: `403 {"error":"Origin not allowed"}`

服务端会返回（允许时）：
- `Access-Control-Allow-Origin: <你的 Origin>`
- `Access-Control-Allow-Credentials: true`

---

## 3. 通用约定

### 3.1 请求格式

- `POST / PATCH`：请求体为 JSON，必须带 `Content-Type: application/json`
- 需要 Cookie 的接口：浏览器端 `credentials: "include"`

### 3.2 响应格式

- 成功: JSON
- 失败: JSON，统一形如：

```json
{ "error": "..." }
```

常见 HTTP 状态码：
- `200` 成功
- `201` 创建成功
- `204` OPTIONS 预检成功
- `400` 参数错误
- `401` 未登录 / 凭据错误
- `403` 无权限 / Origin 不允许

---

## 4. Auth 接口

### 4.1 登录

`POST /auth/login`

请求:
```json
{
  "email": "user@example.com",
  "password": "plain-text-password"
}
```

响应:
- `200`:
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "super_admin|admin|user"
  }
}
```

说明:
- 成功后会通过 `Set-Cookie` 写入 `lpt_session`
- 可能错误:
  - `400 {"error":"Invalid request"}`
  - `401 {"error":"Invalid credentials"}`
  - `403 {"error":"Account inactive"}`（账号被禁用）
  - `403 {"error":"Access key inactive"}`（绑定秘钥被禁用）
  - `403 {"error":"Origin not allowed"}`

### 4.2 获取当前用户

`GET /auth/me`

响应:
- `200`（永远 200，只是 user 可能为 null）:
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "super_admin|admin|user"
  }
}
```

未登录:
```json
{ "user": null }
```

说明:
- 如果浏览器带了 cookie 但 token 无效，服务端会清掉 cookie，避免死循环。

### 4.3 登出

`POST /auth/logout`

响应:
```json
{ "success": true }
```

说明:
- 会清理 `lpt_session` cookie（通过 `Set-Cookie` 设置过期）

### 4.4 使用秘钥注册

`POST /auth/register`

请求:
```json
{
  "email": "user@example.com",
  "password": "plain-text-password",
  "keyCode": "LPT_englishXXXXXXXXXXXXXXXXXXXXXXXXXX"
}
```

响应:
- `201`:
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "user"
  }
}
```

说明:
- 注册成功后会自动登录（写入 `lpt_session`）
- 常见错误（`400`）:
  - `Invalid access key format`（格式不对：长度/前缀/后缀字符）
  - `Access key not found`
  - `Access key is inactive`
  - `Access key already in use`（一个秘钥只能绑定一个账号）
  - `Email already exists`

---

## 5. 秘钥管理接口（管理员）

权限:
- `admin` / `super_admin` 才能调用

### 5.1 获取秘钥列表

`GET /keys`

响应:
```json
{
  "keys": [
    {
      "serial": 123,
      "keyCode": "LPT_english...",
      "status": "active|inactive",
      "createdAt": "2026-02-12T00:00:00.000Z",
      "createdByUserId": "uuid"
    }
  ]
}
```

### 5.2 生成秘钥

`POST /keys`

请求:
```json
{ "count": 10 }
```

响应:
- `201`:
```json
{
  "created": [
    { "serial": 1, "keyCode": "LPT_english...", "status": "active" }
  ]
}
```

规则:
- `keyCode` 总长度 36
- 固定前缀: `LPT_english`
- 后缀仅 `[A-Za-z]`

### 5.3 修改秘钥状态

`PATCH /keys/{serial}`

请求:
```json
{ "status": "active" }
```

响应:
```json
{
  "key": { "serial": 1, "keyCode": "LPT_english...", "status": "active" }
}
```

---

## 6. 管理员管理接口（仅超级管理员）

权限:
- 只有 `super_admin` 可以调用

### 6.1 获取管理员列表

`GET /admin/admin-users`

响应:
```json
{
  "admins": [
    {
      "id": "uuid",
      "email": "admin@example.com",
      "role": "admin|super_admin",
      "isActive": true,
      "createdAt": "2026-02-12T00:00:00.000Z"
    }
  ]
}
```

### 6.2 创建普通管理员

`POST /admin/admin-users`

请求:
```json
{
  "email": "new-admin@example.com",
  "password": "plain-text-password-min-8"
}
```

响应:
- `201`:
```json
{
  "admin": { "id": "uuid", "email": "new-admin@example.com", "role": "admin", "isActive": true }
}
```

### 6.3 删除普通管理员

`DELETE /admin/admin-users/{id}`

响应:
```json
{ "success": true }
```

限制:
- 不能删除自己
- 只能删除 `admin`，不能删除 `super_admin`

---

## 7. JWKS（给其他服务本地验签用）

`GET /.well-known/jwks.json`

响应:
```json
{
  "keys": [
    {
      "kty": "RSA",
      "use": "sig",
      "alg": "RS256",
      "kid": "...",
      "n": "...",
      "e": "AQAB"
    }
  ]
}
```

JWT 内容（`lpt_session`）：
- Header: `alg=RS256`, `kid=<同 JWKS>`
- Payload:
  - `sub`: user id
  - `email`
  - `role`: `super_admin|admin|user`
  - `iss`: `lpt-auth`
  - `aud`: `lpt-web`
  - `iat`, `exp`

建议:
- 本地验签只能证明 token 没被篡改且未过期
- 若你需要“实时禁用用户/秘钥立刻生效”，请调用 `/auth/me` 做最终校验（它会查 DB 判断 `isActive` 和秘钥状态）

---

## 8. 集成示例

### 8.1 浏览器端（任意子域）检查登录态

```ts
const AUTH = 'https://auth.lifeplayertribe.com/api/v1';

export async function getMe() {
  const res = await fetch(`${AUTH}/auth/me`, {
    method: 'GET',
    credentials: 'include',
  });
  return res.json(); // { user: ... } / { user: null }
}
```

### 8.2 浏览器端登录（你自己的网站做登录页）

```ts
const AUTH = 'https://auth.lifeplayertribe.com/api/v1';

export async function login(email: string, password: string) {
  const res = await fetch(`${AUTH}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'login failed');
  return data.user;
}
```

### 8.3 后端（Node/Express）通过 `/auth/me` 验证当前请求

思路:
- 浏览器访问你的站点时，会把 `.lifeplayertribe.com` 的 `lpt_session` cookie 带给你的后端
- 你的后端把 `cookie` 原样转发给 Auth 的 `/auth/me`

```ts
import express from 'express';

const app = express();
const AUTH_ME = 'https://auth.lifeplayertribe.com/api/v1/auth/me';

app.get('/api/protected', async (req, res) => {
  const r = await fetch(AUTH_ME, { headers: { cookie: req.headers.cookie || '' } });
  const data = await r.json();
  if (!data.user) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ ok: true, user: data.user });
});
```

### 8.4 后端本地验签（可选）

推荐库: `jose`

思路:
- 从请求 cookie 中取 `lpt_session`
- 通过 `JWKS` 获取公钥并缓存
- 验签 `iss/aud/exp`

示例（Node/TS）:

```ts
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL('https://auth.lifeplayertribe.com/api/v1/.well-known/jwks.json')
);

function getCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const p of parts) {
    const [k, ...rest] = p.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export async function verifyLptSessionFromRequest(req: { headers: { cookie?: string } }) {
  const token = getCookieValue(req.headers.cookie, 'lpt_session');
  if (!token) return null;

  const { payload } = await jwtVerify(token, JWKS, {
    issuer: 'lpt-auth',
    audience: 'lpt-web',
  });

  if (typeof payload.sub !== 'string') return null;
  if (typeof payload.email !== 'string') return null;
  if (payload.role !== 'super_admin' && payload.role !== 'admin' && payload.role !== 'user') return null;

  return { id: payload.sub, email: payload.email, role: payload.role as 'super_admin' | 'admin' | 'user' };
}
```

---

## 9. 常见问题

### 9.1 报 `Origin not allowed`

- 你的网站域名必须在允许范围内（默认允许 `*.lifeplayertribe.com`）
- 浏览器端必须用 `credentials: "include"`

### 9.2 登录成功但 `/auth/me` 仍然是 `user: null`

常见原因:
- 没有带 `credentials: "include"`，浏览器不会存/带 cookie
- 你的网站不是 HTTPS，导致 `Secure` cookie 不发送
- 你在用 IP 调试，cookie 不会共享到其他子域（请用域名登录）
