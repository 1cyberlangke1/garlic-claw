#!/usr/bin/env node

const DEFAULT_BASE_URL = 'https://wttr.in/';
const REQUEST_TIMEOUT_MS = 10000;
const FORECAST_LABELS = ['今天', '明天'];

void main();

async function main() {
  const location = readLocation(process.argv.slice(2));
  if (!location) {
    process.stderr.write('用法: node scripts/weather.js <地点>\n');
    process.exitCode = 1;
    return;
  }

  try {
    const response = await requestWeather(location);
    const currentSummary = formatCurrentWeather(response, location);
    if (!currentSummary) {
      throw new Error('天气查询失败: 返回内容缺少当前天气数据');
    }

    const forecastSummary = formatForecast(response);
    process.stdout.write(`${currentSummary}${forecastSummary ? `；${forecastSummary}` : ''}\n`);
  } catch (error) {
    process.stderr.write(`${readErrorMessage(error)}\n`);
    process.exitCode = 1;
  }
}

function readLocation(argv) {
  const location = argv.join(' ').trim();
  return location.length > 0 ? location : '';
}

async function requestWeather(location) {
  const requestUrl = buildRequestUrl(location);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(requestUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'garlic-claw-weather-query/1.0',
      },
      signal: controller.signal,
    });
    const responseText = await response.text();

    if (!response.ok) {
      const detail = compactText(responseText).slice(0, 160);
      throw new Error(
        `天气查询失败: HTTP ${response.status}${detail ? ` ${detail}` : ''}`,
      );
    }

    try {
      return JSON.parse(responseText);
    } catch {
      throw new Error('天气查询失败: 返回内容不是有效 JSON');
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`天气查询失败: 请求超时（>${REQUEST_TIMEOUT_MS}ms）`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildRequestUrl(location) {
  const baseUrlText =
    process.env.GARLIC_CLAW_WEATHER_QUERY_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const url = new URL(baseUrlText.endsWith('/') ? baseUrlText : `${baseUrlText}/`);
  const basePath = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  url.pathname = `${basePath}${encodeURIComponent(location)}`;
  url.searchParams.set('format', 'j1');
  url.searchParams.set('lang', 'zh-cn');
  return url;
}

function formatCurrentWeather(payload, fallbackLocation) {
  const current = Array.isArray(payload?.current_condition)
    ? payload.current_condition[0]
    : undefined;
  if (!current || typeof current !== 'object') {
    return '';
  }

  const locationLabel = readLocationLabel(payload, fallbackLocation);
  const parts = [
    readWeatherText(current),
    readTemperature(current.temp_C, '°C'),
    readTemperature(current.FeelsLikeC, '体感'),
    readHumidity(current.humidity),
    readWind(current.winddir16Point, current.windspeedKmph),
  ].filter(Boolean);

  return parts.length > 0
    ? `${locationLabel}：${parts.join('，')}`
    : `${locationLabel}：天气接口未返回可读摘要`;
}

function formatForecast(payload) {
  const forecastItems = Array.isArray(payload?.weather) ? payload.weather.slice(0, 2) : [];
  const parts = forecastItems
    .map((item, index) => {
      const label = FORECAST_LABELS[index] || `第${index + 1}天`;
      const condition = readWeatherText(
        item?.hourly?.find((hour) => readWeatherText(hour)),
      );
      const high = readPlainValue(item?.maxtempC);
      const low = readPlainValue(item?.mintempC);
      const segments = [
        condition,
        high || low ? `${high || '?'}/${low || '?'}°C` : '',
      ].filter(Boolean);
      return segments.length > 0 ? `${label}：${segments.join('，')}` : '';
    })
    .filter(Boolean);

  return parts.join('；');
}

function readLocationLabel(payload, fallbackLocation) {
  if (fallbackLocation) {
    return fallbackLocation;
  }

  const nearestArea = Array.isArray(payload?.nearest_area)
    ? payload.nearest_area[0]
    : undefined;
  const region = readValue(nearestArea?.region);
  const areaName = readValue(nearestArea?.areaName);
  const country = readValue(nearestArea?.country);
  const parts = [region, areaName];

  if (country && !/中国|china/iu.test(country) && !parts.includes(country)) {
    parts.unshift(country);
  }

  const uniqueParts = [...new Set(parts.filter(Boolean))];
  return uniqueParts.length > 0 ? uniqueParts.join(' ') : fallbackLocation;
}

function readWeatherText(source) {
  return (
    readValue(source?.['lang_zh-cn']) ||
    readValue(source?.lang_xx) ||
    readValue(source?.weatherDesc)
  );
}

function readHumidity(value) {
  const normalized = readPlainValue(value);
  return normalized ? `湿度${normalized}%` : '';
}

function readWind(direction, speed) {
  const windDirection = readPlainValue(direction);
  const windSpeed = readPlainValue(speed);
  if (!windDirection && !windSpeed) {
    return '';
  }
  if (windDirection && windSpeed) {
    return `${windDirection}风 ${windSpeed}km/h`;
  }
  return windDirection ? `${windDirection}风` : `风速${windSpeed}km/h`;
}

function readTemperature(value, prefix) {
  const normalized = readPlainValue(value);
  if (!normalized) {
    return '';
  }
  return prefix === '°C' ? `${normalized}${prefix}` : `${prefix}${normalized}°C`;
}

function readValue(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return '';
  }
  const value = entries[0]?.value;
  return typeof value === 'string' ? compactText(value) : '';
}

function readPlainValue(value) {
  return typeof value === 'string' && value.trim().length > 0
    ? compactText(value)
    : '';
}

function compactText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function readErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
