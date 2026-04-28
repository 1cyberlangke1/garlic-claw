---
name: weather-query
description: 查询指定地点天气，先确认地点，再调用仓库内脚本获取结果。
tags:
  - weather
  - script
  - node
---

# weather-query

适用场景：

- 用户要查询天气、温度、天气概况、体感或风况
- 用户已经给了明确地点，或者你可以先追问到明确地点

执行要求：

1. 地点不明确时先追问，不要猜。
2. 优先给简洁结果；如果用户继续追问，再补更多细节。
3. 默认通过仓库内脚本执行；调用命令时把 `workdir` 设为当前 skill 的 `Base directory`，再执行脚本。
4. 命令保持自包含，不要依赖前一次工具调用留下的 shell 状态。
5. 脚本会输出可直接引用的天气摘要；如果脚本报错，明确说明失败原因，不要编造天气结果。

默认执行命令：

```bash
node scripts/weather.js "上海"
```

脚本入口：`scripts/weather.js`

```js
node scripts/weather.js "广东中山"
```

建议输出方式：

- 先说明查询地点
- 再引用脚本返回的天气摘要
- 如果用户继续追问，再基于脚本结果补充说明
