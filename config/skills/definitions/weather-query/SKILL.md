---
name: weather-query
description: 查询指定地点天气，先确认地点，再通过 bash 调用公开天气接口。
tags:
  - weather
  - bash
  - http
---

# weather-query

适用场景：

- 用户要查询天气、温度、天气概况、体感或风况
- 用户已经给了明确地点，或者你可以先追问到明确地点

执行要求：

1. 地点不明确时先追问，不要猜。
2. 优先给简洁结果；如果用户继续追问，再补更多细节。
3. 当前 `bash` 每次调用都会重置 shell 状态，命令必须自包含。
4. 当前 `bash` 的工作目录只允许位于 `/workspace`。仓库里的 skill 资产当前只作为参考实现，不要假设能直接把 skill 目录当运行目录。
5. 当前天气查询优先直接执行上面的 `curl` 命令；仓库里的 `scripts/weather.js` 主要用于维护和以后扩展，不是这轮默认执行入口。

单次查询推荐命令：

```bash
city="上海"
encoded_city="${city// /%20}"
curl --fail --silent --show-error "https://wttr.in/${encoded_city}?lang=zh-cn&format=3"
```

参考实现：`scripts/weather.js`

```js
const city = process.argv[2] ?? '';

if (!city) {
  console.error('用法: weather.js <地点>');
  process.exit(1);
}

const encodedCity = city.replaceAll(' ', '%20');
const response = await fetch(`https://wttr.in/${encodedCity}?lang=zh-cn&format=3`);

if (!response.ok) {
  console.error(`天气查询失败: ${response.status}`);
  process.exit(1);
}

process.stdout.write(`${await response.text()}\n`);
```

建议输出方式：

- 先说明查询地点
- 再给天气接口返回的摘要
- 如果工具报错，明确说明失败原因，不要编造天气结果
