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
