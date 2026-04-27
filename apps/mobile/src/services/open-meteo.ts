import { formatWeatherLabel } from '../utils/outfit-recommendation';

export type ResolvedLocation = {
  latitude: number;
  longitude: number;
  label: string;
  region: string;
  source: 'default' | 'device';
};

export type WeatherPeriod = {
  label: string;
  hourLabel: string;
  temperature: number;
  apparentTemperature: number;
  precipitationProbability: number;
  weatherCode: number;
  windSpeed: number;
};

export type WeatherSnapshot = {
  locationLabel: string;
  regionLabel: string;
  source: ResolvedLocation['source'];
  current: {
    temperature: number;
    apparentTemperature: number;
    weatherCode: number;
    weatherLabel: string;
    windSpeed: number;
    isDay: boolean;
    updatedAtLabel: string;
  };
  today: {
    dateLabel: string;
    minTemp: number;
    maxTemp: number;
    apparentMinTemp: number;
    apparentMaxTemp: number;
    precipitationProbabilityMax: number;
    weatherCode: number;
    windSpeedMax: number;
  };
  periods: WeatherPeriod[];
};

type ForecastResponse = {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
    wind_speed_10m: number;
    is_day: number;
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    apparent_temperature_max: number[];
    apparent_temperature_min: number[];
    precipitation_probability_max: number[];
    weather_code: number[];
    wind_speed_10m_max: number[];
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    apparent_temperature: number[];
    precipitation_probability: number[];
    weather_code: number[];
    wind_speed_10m: number[];
  };
};

export const DEFAULT_LOCATION: ResolvedLocation = {
  latitude: 37.5444,
  longitude: 127.0557,
  label: '성수동',
  region: '서울',
  source: 'default',
};

export async function fetchWeatherSnapshot(
  location: ResolvedLocation,
): Promise<WeatherSnapshot> {
  const query = [
    `latitude=${location.latitude}`,
    `longitude=${location.longitude}`,
    'timezone=auto',
    'forecast_days=3',
    'wind_speed_unit=kmh',
    'current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day',
    'daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,wind_speed_10m_max',
    'hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m',
  ].join('&');

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`);

  if (!response.ok) {
    throw new Error(`Open-Meteo request failed with status ${response.status}`);
  }

  const json = (await response.json()) as ForecastResponse;
  const dateKey = json.daily.time[0];

  return {
    locationLabel: location.label,
    regionLabel:
      location.source === 'device'
        ? `${location.region} 기준`
        : `${location.region} · 기본 위치`,
    source: location.source,
    current: {
      temperature: json.current.temperature_2m,
      apparentTemperature: json.current.apparent_temperature,
      weatherCode: json.current.weather_code,
      weatherLabel: formatWeatherLabel(
        json.current.weather_code,
        json.current.is_day === 1,
      ),
      windSpeed: json.current.wind_speed_10m,
      isDay: json.current.is_day === 1,
      updatedAtLabel: json.current.time.slice(11, 16),
    },
    today: {
      dateLabel: formatDateLabel(dateKey),
      minTemp: json.daily.temperature_2m_min[0],
      maxTemp: json.daily.temperature_2m_max[0],
      apparentMinTemp: json.daily.apparent_temperature_min[0],
      apparentMaxTemp: json.daily.apparent_temperature_max[0],
      precipitationProbabilityMax: json.daily.precipitation_probability_max[0],
      weatherCode: json.daily.weather_code[0],
      windSpeedMax: json.daily.wind_speed_10m_max[0],
    },
    periods: [
      pickPeriod(json.hourly, dateKey, 8, '출근'),
      pickPeriod(json.hourly, dateKey, 13, '점심'),
      pickPeriod(json.hourly, dateKey, 19, '퇴근'),
    ],
  };
}

export function buildFallbackWeatherSnapshot(
  location: ResolvedLocation,
): WeatherSnapshot {
  return {
    locationLabel: location.label,
    regionLabel:
      location.source === 'device'
        ? `${location.region} 기준`
        : `${location.region} · 예시 데이터`,
    source: location.source,
    current: {
      temperature: 15,
      apparentTemperature: 13,
      weatherCode: 3,
      weatherLabel: formatWeatherLabel(3, true),
      windSpeed: 16,
      isDay: true,
      updatedAtLabel: '09:00',
    },
    today: {
      dateLabel: formatDateLabel('2026-04-24'),
      minTemp: 11,
      maxTemp: 19,
      apparentMinTemp: 9,
      apparentMaxTemp: 18,
      precipitationProbabilityMax: 20,
      weatherCode: 3,
      windSpeedMax: 18,
    },
    periods: [
      {
        label: '출근',
        hourLabel: '08:00',
        temperature: 12,
        apparentTemperature: 9,
        precipitationProbability: 15,
        weatherCode: 3,
        windSpeed: 16,
      },
      {
        label: '점심',
        hourLabel: '13:00',
        temperature: 18,
        apparentTemperature: 18,
        precipitationProbability: 10,
        weatherCode: 1,
        windSpeed: 12,
      },
      {
        label: '퇴근',
        hourLabel: '19:00',
        temperature: 15,
        apparentTemperature: 13,
        precipitationProbability: 20,
        weatherCode: 2,
        windSpeed: 14,
      },
    ],
  };
}

function pickPeriod(
  hourly: ForecastResponse['hourly'],
  dayKey: string,
  targetHour: number,
  label: string,
): WeatherPeriod {
  const dayIndexes = hourly.time
    .map((time, index) => (time.startsWith(dayKey) ? index : -1))
    .filter((index) => index >= 0);

  const selectedIndex = dayIndexes.reduce((bestIndex, index) => {
    const currentHour = Number(hourly.time[index].slice(11, 13));
    const bestHour = Number(hourly.time[bestIndex].slice(11, 13));

    return Math.abs(currentHour - targetHour) < Math.abs(bestHour - targetHour)
      ? index
      : bestIndex;
  }, dayIndexes[0]);

  return {
    label,
    hourLabel: hourly.time[selectedIndex].slice(11, 16),
    temperature: hourly.temperature_2m[selectedIndex],
    apparentTemperature: hourly.apparent_temperature[selectedIndex],
    precipitationProbability: hourly.precipitation_probability[selectedIndex],
    weatherCode: hourly.weather_code[selectedIndex],
    windSpeed: hourly.wind_speed_10m[selectedIndex],
  };
}

function formatDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토'];

  return `${month}월 ${day}일 ${weekdayLabels[date.getDay()]}요일`;
}
