# 用户自定义单词库 API 文档

## 概述

本文档描述了用户自定义单词库功能的所有API接口。这些接口允许用户创建、管理和使用自己的单词库。

**基础URL**: `https://wordlink.lifeplayertribe.com`

**认证方式**: 使用JWT Session Cookie (`lpt_session`)

所有API请求都需要在Cookie中包含有效的`lpt_session`令牌。

---

## 目录

1. [单词收集接口（推荐用于阅读平台）](#1-单词收集接口)
2. [批量导入接口](#2-批量导入接口)
3. [CSV上传接口](#3-csv上传接口)
4. [获取单词库列表](#4-获取单词库列表)
5. [获取单词库详情](#5-获取单词库详情)
6. [获取单词库单词列表](#6-获取单词库单词列表)
7. [获取单词库分组信息](#7-获取单词库分组信息)
8. [更新单词库信息](#8-更新单词库信息)
9. [删除单词库](#9-删除单词库)
10. [添加单词到单词库](#10-添加单词到单词库)
11. [删除单词](#11-删除单词)
12. [错误码说明](#错误码说明)

---

## 1. 单词收集接口

**适用场景**: 阅读时逐个收集单词（最常用）

### 接口信息

- **URL**: `/api/user/libraries/collect`
- **方法**: `POST`
- **Content-Type**: `application/json`

### 请求参数

```json
{
  "word": "example",
  "libraryName": "阅读收集"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| word | string | 是 | 要收集的单词 |
| libraryName | string | 否 | 单词库名称，默认为"我的收集" |

### 功能特点

- ✅ **自动创建单词库**: 如果指定的单词库不存在，会自动创建
- ✅ **自动去重**: 如果单词已存在，不会重复添加
- ✅ **增量添加**: 每次调用添加一个单词，适合阅读时实时收集
- ✅ **格式验证**: 自动验证单词格式并转换为小写

### 响应示例

**首次添加单词** (创建新单词库):

```json
{
  "success": true,
  "word": {
    "id": "word-uuid",
    "libraryId": "library-uuid",
    "word": "example",
    "sequence": 1,
    "createdAt": "2026-02-15T14:00:00.000Z"
  },
  "library": {
    "id": "library-uuid",
    "name": "阅读收集",
    "wordCount": 1
  },
  "isNewLibrary": true,
  "isNewWord": true,
  "message": "Word collected successfully"
}
```

**添加到已存在的单词库**:

```json
{
  "success": true,
  "word": {
    "id": "word-uuid-2",
    "libraryId": "library-uuid",
    "word": "sample",
    "sequence": 2,
    "createdAt": "2026-02-15T14:01:00.000Z"
  },
  "library": {
    "id": "library-uuid",
    "name": "阅读收集",
    "wordCount": 2
  },
  "isNewLibrary": false,
  "isNewWord": true,
  "message": "Word collected successfully"
}
```

**单词已存在**:

```json
{
  "success": true,
  "word": {
    "id": "word-uuid",
    "libraryId": "library-uuid",
    "word": "example",
    "sequence": 1,
    "createdAt": "2026-02-15T14:00:00.000Z"
  },
  "library": {
    "id": "library-uuid",
    "name": "阅读收集",
    "wordCount": 2
  },
  "isNewLibrary": false,
  "isNewWord": false,
  "message": "Word already exists in library"
}
```

### cURL 示例

```bash
# 收集单词到默认单词库
curl -X POST https://wordlink.lifeplayertribe.com/api/user/libraries/collect \
  -H "Content-Type: application/json" \
  -H "Cookie: lpt_session=YOUR_SESSION_TOKEN" \
  -d '{"word": "example"}'

# 收集单词到指定单词库
curl -X POST https://wordlink.lifeplayertribe.com/api/user/libraries/collect \
  -H "Content-Type: application/json" \
  -H "Cookie: lpt_session=YOUR_SESSION_TOKEN" \
  -d '{"word": "example", "libraryName": "今日阅读"}'
```

### JavaScript 示例

```javascript
// 在阅读平台中收集单词
async function collectWord(word, libraryName = '阅读收集') {
  try {
    const response = await fetch('https://wordlink.lifeplayertribe.com/api/user/libraries/collect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // 自动包含Cookie
      body: JSON.stringify({ word, libraryName })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    const result = await response.json();

    if (result.isNewWord) {
      console.log(`✓ 收集成功: ${word} (${result.library.wordCount}个单词)`);
    } else {
      console.log(`○ 已收集过: ${word}`);
    }

    return result;
  } catch (error) {
    console.error('收集失败:', error);
    throw error;
  }
}

// 使用示例：用户点击单词时收集
document.querySelectorAll('.word').forEach(element => {
  element.addEventListener('click', async () => {
    const word = element.textContent;
    try {
      await collectWord(word);
      element.classList.add('collected'); // 标记为已收集
    } catch (error) {
      alert('收集失败，请稍后重试');
    }
  });
});
```

### React 示例

```javascript
import { useState } from 'react';

function WordCollector({ word }) {
  const [collected, setCollected] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCollect = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/user/libraries/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          word,
          libraryName: '今日阅读'
        })
      });

      const result = await response.json();

      if (result.success) {
        setCollected(true);
        // 显示提示
        if (result.isNewWord) {
          toast.success(`已收集: ${word}`);
        } else {
          toast.info(`已收集过: ${word}`);
        }
      }
    } catch (error) {
      toast.error('收集失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleCollect}
      disabled={loading || collected}
      className={collected ? 'collected' : ''}
    >
      {collected ? '✓ 已收集' : '+ 收集'}
    </button>
  );
}
```

---

## 2. 批量导入接口

**适用场景**: 一次性导入多个单词

### 接口信息

- **URL**: `/api/user/libraries/import`
- **方法**: `POST`
- **Content-Type**: `application/json`

### 请求参数

```json
{
  "name": "单词库名称",
  "description": "单词库描述（可选）",
  "words": ["word1", "word2", "word3", ...]
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 单词库名称，最长255字符 |
| description | string | 否 | 单词库描述 |
| words | string[] | 是 | 单词数组，最多10,000个单词 |

### 单词格式要求

- 只能包含英文字母、连字符(-)、撇号(')
- 自动转换为小写
- 自动去重
- 无效单词会被自动过滤

### 响应示例

**成功响应** (200 OK):

```json
{
  "success": true,
  "library": {
    "id": "cb47c5ce-14d3-46c5-b4a3-79e044304d8d",
    "name": "我的单词库",
    "description": "从阅读平台导入",
    "wordCount": 150,
    "createdAt": "2026-02-15T12:57:24.761Z"
  }
}
```

**错误响应** (400 Bad Request):

```json
{
  "error": "Library name is required"
}
```

```json
{
  "error": "Maximum 10,000 words per library"
}
```

```json
{
  "error": "Maximum 50 libraries per user"
}
```

### 使用限制

- 每个用户最多50个单词库
- 每个单词库最多10,000个单词
- 单词必须是有效的英文单词格式

### cURL 示例

```bash
curl -X POST https://wordlink.lifeplayertribe.com/api/user/libraries/import \
  -H "Content-Type: application/json" \
  -H "Cookie: lpt_session=YOUR_SESSION_TOKEN" \
  -d '{
    "name": "阅读平台单词库",
    "description": "从阅读平台收集的单词",
    "words": ["abandon", "ability", "absent", "absolute", "absorb"]
  }'
```

### JavaScript 示例

```javascript
async function importWords(name, words, description = '') {
  const response = await fetch('https://wordlink.lifeplayertribe.com/api/user/libraries/import', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // 自动包含Cookie
    body: JSON.stringify({
      name,
      description,
      words
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  return await response.json();
}

// 使用示例
try {
  const result = await importWords(
    '我的单词库',
    ['abandon', 'ability', 'absent'],
    '从阅读平台导入'
  );
  console.log('导入成功:', result.library);
} catch (error) {
  console.error('导入失败:', error.message);
}
```

---

## 2. CSV上传接口

**适用场景**: 用户手动上传CSV文件

### 接口信息

- **URL**: `/api/user/libraries`
- **方法**: `POST`
- **Content-Type**: `multipart/form-data`

### 请求参数

使用FormData上传：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | File | 是 | CSV文件，最大5MB |
| name | string | 是 | 单词库名称 |
| description | string | 否 | 单词库描述 |

### CSV格式要求

CSV文件必须包含以下列（顺序不限）：

- `序号` 或 `number`: 单词序号
- `单词` 或 `word`: 英文单词

示例CSV内容：

```csv
序号,单词
1,abandon
2,ability
3,absent
```

### 响应示例

**成功响应** (200 OK):

```json
{
  "success": true,
  "library": {
    "id": "cb47c5ce-14d3-46c5-b4a3-79e044304d8d",
    "name": "我的单词库",
    "wordCount": 150
  }
}
```

### cURL 示例

```bash
curl -X POST https://wordlink.lifeplayertribe.com/api/user/libraries \
  -H "Cookie: lpt_session=YOUR_SESSION_TOKEN" \
  -F "file=@words.csv" \
  -F "name=我的单词库" \
  -F "description=手动上传的单词"
```

---

## 3. 获取单词库列表

### 接口信息

- **URL**: `/api/user/libraries`
- **方法**: `GET`

### 响应示例

```json
[
  {
    "id": "cb47c5ce-14d3-46c5-b4a3-79e044304d8d",
    "name": "我的单词库",
    "description": "从阅读平台导入",
    "wordCount": 150,
    "createdAt": "2026-02-15T12:57:24.761Z",
    "updatedAt": "2026-02-15T12:57:24.761Z"
  }
]
```

---

## 4. 获取单词库详情

### 接口信息

- **URL**: `/api/user/libraries/{libraryId}`
- **方法**: `GET`

### 路径参数

| 参数 | 类型 | 说明 |
|------|------|------|
| libraryId | string | 单词库ID |

### 响应示例

```json
{
  "id": "cb47c5ce-14d3-46c5-b4a3-79e044304d8d",
  "name": "我的单词库",
  "description": "从阅读平台导入",
  "wordCount": 150,
  "createdAt": "2026-02-15T12:57:24.761Z",
  "updatedAt": "2026-02-15T12:57:24.761Z"
}
```

---

## 5. 获取单词库单词列表

### 接口信息

- **URL**: `/api/user/libraries/{libraryId}/words`
- **方法**: `GET`

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| groupIndex | number | 否 | 分组索引，-1表示获取全部 |
| groupSize | number | 否 | 每组大小，默认100 |
| includeDefinitions | boolean | 否 | 是否包含释义，默认false |

### 响应示例

**不包含释义** (`includeDefinitions=false`):

```json
{
  "words": [
    {
      "id": "word-uuid-1",
      "libraryId": "cb47c5ce-14d3-46c5-b4a3-79e044304d8d",
      "word": "abandon",
      "sequence": 1,
      "createdAt": "2026-02-15T12:57:24.761Z"
    }
  ]
}
```

**包含释义** (`includeDefinitions=true`):

```json
{
  "words": [
    {
      "id": "word-uuid-1",
      "word": "abandon",
      "sequence": 1,
      "phonetic": "əˈbændən",
      "translation": "v. 放弃；抛弃",
      "chineseData": {
        "concise_definition": "放弃；抛弃",
        "phonetic": "əˈbændən",
        "collins": "5"
      }
    }
  ]
}
```

### cURL 示例

```bash
# 获取全部单词（不含释义）
curl -X GET "https://wordlink.lifeplayertribe.com/api/user/libraries/{libraryId}/words?groupIndex=-1&groupSize=100" \
  -H "Cookie: lpt_session=YOUR_SESSION_TOKEN"

# 获取第一组单词（含释义）
curl -X GET "https://wordlink.lifeplayertribe.com/api/user/libraries/{libraryId}/words?groupIndex=0&groupSize=100&includeDefinitions=true" \
  -H "Cookie: lpt_session=YOUR_SESSION_TOKEN"
```

---

## 6. 获取单词库分组信息

### 接口信息

- **URL**: `/api/user/libraries/{libraryId}/groups`
- **方法**: `GET`

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| groupSize | number | 否 | 每组大小，默认100 |

### 响应示例

```json
{
  "groups": [
    {
      "index": 0,
      "name": "Group 1 (1-100)",
      "start": 1,
      "end": 100,
      "count": 100
    },
    {
      "index": 1,
      "name": "Group 2 (101-150)",
      "start": 101,
      "end": 150,
      "count": 50
    }
  ],
  "totalWords": 150,
  "totalGroups": 2
}
```

---

## 7. 更新单词库信息

### 接口信息

- **URL**: `/api/user/libraries/{libraryId}`
- **方法**: `PATCH`
- **Content-Type**: `application/json`

### 请求参数

```json
{
  "name": "新的单词库名称",
  "description": "新的描述"
}
```

### 响应示例

```json
{
  "success": true,
  "library": {
    "id": "cb47c5ce-14d3-46c5-b4a3-79e044304d8d",
    "name": "新的单词库名称",
    "description": "新的描述",
    "wordCount": 150,
    "updatedAt": "2026-02-15T13:00:00.000Z"
  }
}
```

---

## 8. 删除单词库

### 接口信息

- **URL**: `/api/user/libraries/{libraryId}`
- **方法**: `DELETE`

### 响应示例

```json
{
  "success": true,
  "message": "Library deleted successfully"
}
```

**注意**: 删除单词库会级联删除该单词库下的所有单词。

---

## 9. 添加单词到单词库

### 接口信息

- **URL**: `/api/user/libraries/{libraryId}/words`
- **方法**: `POST`
- **Content-Type**: `application/json`

### 请求参数

```json
{
  "word": "example"
}
```

### 响应示例

```json
{
  "word": {
    "id": "word-uuid",
    "libraryId": "cb47c5ce-14d3-46c5-b4a3-79e044304d8d",
    "word": "example",
    "sequence": 151,
    "createdAt": "2026-02-15T13:00:00.000Z"
  }
}
```

---

## 10. 删除单词

### 接口信息

- **URL**: `/api/user/libraries/{libraryId}/words/{wordId}`
- **方法**: `DELETE`

### 响应示例

```json
{
  "success": true,
  "message": "Word deleted successfully"
}
```

---

## 错误码说明

| HTTP状态码 | 错误信息 | 说明 |
|-----------|---------|------|
| 401 | Unauthorized | 未登录或Session过期 |
| 403 | Forbidden | 无权访问该资源（不是单词库所有者） |
| 404 | Library not found | 单词库不存在 |
| 400 | Library name is required | 缺少必填参数 |
| 400 | Maximum 50 libraries per user | 超过单词库数量限制 |
| 400 | Maximum 10,000 words per library | 超过单词数量限制 |
| 400 | Invalid word format | 单词格式不正确 |
| 400 | Word already exists in library | 单词已存在 |
| 500 | Failed to create library | 服务器内部错误 |

---

## 认证说明

### 获取Session Token

用户需要先通过登录接口获取Session Token：

```bash
curl -X POST https://wordlink.lifeplayertribe.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password"
  }' \
  -c cookies.txt
```

登录成功后，Session Token会保存在Cookie中（`lpt_session`）。

### 使用Session Token

在后续请求中，需要在Cookie中包含Session Token：

```bash
curl -X GET https://wordlink.lifeplayertribe.com/api/user/libraries \
  -b cookies.txt
```

或直接在Header中指定：

```bash
curl -X GET https://wordlink.lifeplayertribe.com/api/user/libraries \
  -H "Cookie: lpt_session=YOUR_SESSION_TOKEN"
```

---

## 平台集成示例

### 场景：从阅读平台导入收集的单词

假设阅读平台收集了用户在阅读过程中标记的单词，现在需要导入到单词学习平台。

#### 步骤1: 确保用户已登录

由于两个平台使用相同的认证服务，用户的Session Token在两个平台之间是共享的。

#### 步骤2: 调用导入接口

```javascript
// 在阅读平台的代码中
async function exportToWordPlatform(words) {
  try {
    const response = await fetch('https://wordlink.lifeplayertribe.com/api/user/libraries/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // 自动包含共享的Session Cookie
      body: JSON.stringify({
        name: `阅读收集 - ${new Date().toLocaleDateString()}`,
        description: '从阅读平台自动导入',
        words: words // ['word1', 'word2', ...]
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    const result = await response.json();
    console.log('导入成功:', result.library);

    // 可以跳转到单词学习平台
    window.open(`https://wordlink.lifeplayertribe.com/my-libraries`, '_blank');

    return result;
  } catch (error) {
    console.error('导入失败:', error);
    throw error;
  }
}

// 使用示例
const collectedWords = ['abandon', 'ability', 'absent', 'absolute'];
exportToWordPlatform(collectedWords);
```

#### 步骤3: 处理结果

导入成功后，用户可以在单词学习平台的"My Libraries"页面看到新创建的单词库。

---

## 最佳实践

### 1. 批量导入

如果需要导入大量单词，建议：
- 每次最多导入10,000个单词
- 如果超过10,000个，分批创建多个单词库
- 使用有意义的单词库名称（如按日期、主题分类）

### 2. 错误处理

```javascript
async function safeImport(name, words, description) {
  try {
    // 验证单词数量
    if (words.length > 10000) {
      throw new Error('单词数量超过限制，请分批导入');
    }

    // 调用API
    const result = await importWords(name, words, description);
    return { success: true, data: result };

  } catch (error) {
    // 处理特定错误
    if (error.message.includes('Maximum 50 libraries')) {
      return {
        success: false,
        error: '已达到单词库数量上限，请删除一些旧的单词库'
      };
    }

    if (error.message.includes('Unauthorized')) {
      return {
        success: false,
        error: '登录已过期，请重新登录'
      };
    }

    return {
      success: false,
      error: error.message || '导入失败，请稍后重试'
    };
  }
}
```

### 3. 单词去重

在导入前，建议在客户端先进行去重：

```javascript
function deduplicateWords(words) {
  const seen = new Set();
  return words.filter(word => {
    const normalized = word.toLowerCase().trim();
    if (seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

const uniqueWords = deduplicateWords(collectedWords);
```

### 4. 进度反馈

对于大量单词的导入，建议显示进度：

```javascript
async function importWithProgress(name, words, onProgress) {
  onProgress(0, '准备导入...');

  // 验证和清理单词
  onProgress(20, '验证单词格式...');
  const validWords = words.filter(w => /^[a-z'-]+$/i.test(w));

  // 调用API
  onProgress(50, '上传中...');
  const result = await importWords(name, validWords);

  onProgress(100, '导入完成！');
  return result;
}
```

---

## CORS 配置说明

### 跨域访问支持

所有用户单词库 API 都支持跨域访问（CORS），允许从以下域名调用：

- `https://wordlink.lifeplayertribe.com` (主站)
- `https://echostream.lifeplayertribe.com` (阅读平台)
- `http://localhost:3000` (本地开发)
- `http://localhost:3001` (本地开发)
- `http://localhost:5173` (本地开发 - Vite)
- `http://localhost:8080` (本地开发)

### 重要配置

#### 1. credentials: 'include'

跨域请求必须设置 `credentials: 'include'` 以包含 Cookie：

```javascript
fetch('https://wordlink.lifeplayertribe.com/api/user/libraries/collect', {
  method: 'POST',
  credentials: 'include', // 必须设置
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ word: 'example' })
});
```

#### 2. 预检请求

浏览器会自动发送 OPTIONS 预检请求，服务器已配置正确响应。

#### 3. Cookie 共享

由于使用相同的认证服务，`lpt_session` Cookie 在两个平台之间共享。
确保 Cookie 的 Domain 设置为 `.lifeplayertribe.com`。

### 常见问题

**Q: 为什么收到 CORS 错误？**

A: 检查以下几点：
- 请求是否设置了 `credentials: 'include'`
- 请求的域名是否在允许列表中
- Cookie 是否正确设置和传递

**Q: 如何添加新的允许域名？**

A: 联系管理员修改 `src/lib/cors.ts` 中的 `ALLOWED_ORIGINS` 列表。

**Q: 为什么 Cookie 没有传递？**

A: 确保：
- 使用 `credentials: 'include'`
- Cookie 的 Domain 设置正确（`.lifeplayertribe.com`）
- Cookie 的 SameSite 属性设置为 `None` 或 `Lax`
- 使用 HTTPS 协议（生产环境）

---

## 技术支持

如有问题，请联系技术支持或查看项目文档。

**项目地址**: https://github.com/zjyuiop/LPT_english

**最后更新**: 2026-02-15
